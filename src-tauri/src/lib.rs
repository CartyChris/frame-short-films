use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{collections::HashMap, path::PathBuf, time::Duration};
use tauri::Manager;
mod exports;
mod local_companion;

#[tauri::command]
async fn save_export(
    app: tauri::AppHandle,
    name: String,
    base64: String,
) -> Result<String, String> {
    exports::safe_export_name(&name)?;
    if base64.len() > 716 * 1024 * 1024 {
        return Err("Export exceeds 512 MiB; split this film into reels".into());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("exports");
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = STANDARD
            .decode(base64)
            .map_err(|_| "Export data is not valid base64")?;
        if bytes.len() > 512 * 1024 * 1024 {
            return Err("Export exceeds 512 MiB; split this film into reels".into());
        }
        exports::write_export(&directory, &name, &bytes)
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|_| "The export writer was interrupted")?
}

/// Opens only Frame's own export directory; callers cannot supply a path or command.
#[tauri::command]
fn open_exports_folder(app: tauri::AppHandle) -> Result<String, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("exports");
    std::fs::create_dir_all(&directory)
        .map_err(|e| format!("Could not create exports folder: {e}"))?;
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg(&directory)
            .spawn()
            .map_err(|e| format!("Could not reveal exports: {e}"))?;
    }
    Ok(directory.to_string_lossy().into_owned())
}

#[tauri::command]
async fn start_companion(
    app: tauri::AppHandle,
    state: tauri::State<'_, local_companion::CompanionState>,
) -> Result<local_companion::CompanionConnection, String> {
    let executable = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("frame-companion");
    let home = app.path().home_dir().ok();
    let shared = state.inner.clone();
    tauri::async_runtime::spawn_blocking(move || local_companion::start(&shared, executable, home))
        .await
        .map_err(|_| "Local companion startup was interrupted")?
}

fn backup_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("backups"))
        .map_err(|error| error.to_string())
}
/// Stores the exact supplied UTF-8 bytes; never parses or re-formats the project/source.
#[tauri::command]
fn save_project_backup(
    app: tauri::AppHandle,
    project_id: String,
    source: String,
) -> Result<film_storage::BackupInfo, String> {
    film_storage::save_backup(&backup_root(&app)?, &project_id, source.as_bytes())
        .map_err(|error| error.to_string())
}
#[tauri::command]
fn list_project_backups(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<film_storage::BackupInfo>, String> {
    film_storage::list_backups(&backup_root(&app)?, &project_id).map_err(|error| error.to_string())
}
#[tauri::command]
fn read_project_backup(
    app: tauri::AppHandle,
    project_id: String,
    backup_id: String,
) -> Result<String, String> {
    let bytes = film_storage::read_backup(&backup_root(&app)?, &project_id, &backup_id)
        .map_err(|error| error.to_string())?;
    String::from_utf8(bytes).map_err(|error| error.to_string())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCoreResult {
    index: i32,
    local_time: f64,
    eased: f64,
}
#[tauri::command]
fn native_core(durations: Vec<f64>, time: f64) -> NativeCoreResult {
    let (index, local_time) = film_core::locate_scene(&durations, time);
    NativeCoreResult {
        index,
        local_time,
        eased: film_core::ease_in_out(time),
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyResponse {
    status: u16,
    body: String,
    body_base64: Option<String>,
    content_type: String,
}
fn validate_provider_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid provider URL")?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|port| port != 443)
        || url.fragment().is_some()
    {
        return Err(
            "Use a supported provider HTTPS URL without embedded credentials or fragments".into(),
        );
    }
    let allowed = match url.host_str().unwrap_or("") {
        "api.openai.com" | "api.anthropic.com" | "api.x.ai" | "api.elevenlabs.io" => {
            url.path().starts_with("/v1/")
        }
        "openrouter.ai" => url.path().starts_with("/api/v1/"),
        "api.deepseek.com" => {
            url.path().starts_with("/v1/") || matches!(url.path(), "/chat/completions" | "/models")
        }
        "generativelanguage.googleapis.com" => {
            url.path().starts_with("/v1beta/") || url.path().starts_with("/v1/")
        }
        "api.z.ai" => {
            url.path().starts_with("/api/paas/v4/")
                || url.path().starts_with("/api/coding/paas/v4/")
        }
        _ => false,
    };
    if !allowed {
        return Err("This URL is outside the fixed provider allowlist".into());
    }
    Ok(url)
}
/// Non-streaming requests only. Streaming generation uses the same hosted API or CLI companion as the web app.
#[tauri::command]
async fn proxy_request(
    method: String,
    url: String,
    body: Option<String>,
    headers: HashMap<String, String>,
) -> Result<ProxyResponse, String> {
    let url = validate_provider_url(&url)?;
    let method = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        _ => return Err("Only GET and POST are supported".into()),
    };
    if body
        .as_ref()
        .is_some_and(|value| value.len() > 8 * 1024 * 1024)
    {
        return Err("Request body exceeds 8 MiB".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|_| "Could not initialize HTTPS client")?;
    let mut request = client.request(method, url);
    for (name, value) in headers {
        let name = name.to_ascii_lowercase();
        if !matches!(
            name.as_str(),
            "authorization"
                | "content-type"
                | "x-api-key"
                | "anthropic-version"
                | "x-goog-api-key"
                | "xi-api-key"
        ) {
            return Err(format!("Header {name} is not permitted"));
        }
        request = request.header(name, value);
    }
    if let Some(body) = body {
        request = request.body(body);
    }
    let mut response = request
        .send()
        .await
        .map_err(|_| "The provider request failed; check the network and credentials")?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    if response
        .content_length()
        .is_some_and(|length| length > 32 * 1024 * 1024)
    {
        return Err("Provider response exceeds 32 MiB; use a download URL for large media".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The provider response was interrupted")?
    {
        if bytes.len() + chunk.len() > 32 * 1024 * 1024 {
            return Err("Provider response exceeds 32 MiB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if content_type.contains("json") || content_type.starts_with("text/") {
        Ok(ProxyResponse {
            status,
            body: String::from_utf8_lossy(&bytes).into_owned(),
            body_base64: None,
            content_type,
        })
    } else {
        Ok(ProxyResponse {
            status,
            body: String::new(),
            body_base64: Some(STANDARD.encode(bytes)),
            content_type,
        })
    }
}
pub fn run() {
    tauri::Builder::default()
        .manage(local_companion::CompanionState::default())
        .invoke_handler(tauri::generate_handler![
            save_export,
            open_exports_folder,
            start_companion,
            save_project_backup,
            list_project_backups,
            read_project_backup,
            native_core,
            proxy_request
        ])
        .build(tauri::generate_context!())
        .expect("Frame could not start")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<local_companion::CompanionState>().stop();
            }
        });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn proxy_rejects_untrusted_destinations() {
        assert!(validate_provider_url("http://127.0.0.1:1/v1/models").is_err());
        assert!(validate_provider_url("https://api.openai.com.evil.example/v1/models").is_err());
        assert!(validate_provider_url("https://api.openai.com:444/v1/models").is_err());
        assert!(validate_provider_url("https://api.openai.com/v1/models").is_ok());
    }
}
