use axum::{
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Request, State},
    http::{HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    convert::Infallible,
    path::PathBuf,
    process::Stdio,
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
    sync::{mpsc, Semaphore},
};
use tokio_stream::wrappers::ReceiverStream;
mod cli;
mod freefield;
mod integrations;
mod production_tools;

#[derive(Clone)]
pub struct AppState {
    pub token: String,
    pub origins: HashSet<String>,
    slots: Arc<Semaphore>,
    integrations: Arc<integrations::Hub>,
    cli: Arc<cli::Registry>,
    production_tools: Arc<production_tools::Hub>,
    freefield: Arc<freefield::Hub>,
}
impl AppState {
    pub fn new(token: String, origins: HashSet<String>) -> Self {
        Self {
            token,
            origins,
            slots: Arc::new(Semaphore::new(1)),
            integrations: Arc::new(integrations::Hub::default()),
            cli: Arc::new(cli::Registry::default()),
            production_tools: Arc::new(production_tools::Hub::default()),
            freefield: Arc::new(freefield::Hub::default()),
        }
    }
}
pub fn default_origins() -> HashSet<String> {
    [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/generate", post(generate))
        .route("/cli/profiles", get(cli::profiles).post(cli::register))
        .route("/cli/profiles/remove", post(cli::remove))
        .route("/integrations/status", get(integrations::status))
        .route("/integrations/mcp/connect", post(integrations::connect))
        .route("/integrations/mcp/tools", post(integrations::tools))
        .route("/integrations/mcp/call", post(integrations::call))
        .route("/integrations/mcp/receipt", post(integrations::receipt))
        .route(
            "/integrations/mcp/disconnect",
            post(integrations::disconnect),
        )
        .route("/production/comfy/status", post(production_tools::status))
        .route("/production/comfy/submit", post(production_tools::submit))
        .route("/production/comfy/poll", post(production_tools::poll))
        .route("/production/comfy/download", post(production_tools::download))
        .route("/production/freefield/discover", post(freefield::discover))
        .route("/production/freefield/submit", post(freefield::submit).layer(DefaultBodyLimit::max(105 * 1024 * 1024)))
        .route("/production/freefield/receipt", post(freefield::receipt))
        .route("/production/freefield/poll", post(freefield::poll))
        .route("/production/freefield/download", post(freefield::download))
        .route("/production/freefield/cancel", post(freefield::cancel))
        .layer(DefaultBodyLimit::max(4 * 1024 * 1024))
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state)
}
fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({"error":message}))).into_response()
}
fn token_matches(actual: &str, expected: &str) -> bool {
    if actual.len() != expected.len() {
        return false;
    }
    actual
        .bytes()
        .zip(expected.bytes())
        .fold(0u8, |n, (a, b)| n | (a ^ b))
        == 0
}
async fn guard(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let Some(origin) = request
        .headers()
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .filter(|origin| state.origins.contains(*origin))
        .map(str::to_string)
    else {
        return error(StatusCode::FORBIDDEN,"This origin is not permitted. Add its exact URL to FRAME_ALLOWED_ORIGINS and restart the companion.");
    };
    let preflight = request.method() == Method::OPTIONS;
    if preflight {
        let method = request
            .headers()
            .get("access-control-request-method")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !matches!(method, "GET" | "POST") {
            return error(
                StatusCode::METHOD_NOT_ALLOWED,
                "Unsupported preflight method",
            );
        }
        let requested = request
            .headers()
            .get("access-control-request-headers")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if requested
            .split(',')
            .map(|x| x.trim().to_ascii_lowercase())
            .any(|x| !x.is_empty() && !matches!(x.as_str(), "authorization" | "content-type"))
        {
            return error(StatusCode::FORBIDDEN, "Unsupported request headers");
        }
    } else {
        let token = request
            .headers()
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .unwrap_or("");
        if !token_matches(token, &state.token) {
            return cors(
                error(
                    StatusCode::UNAUTHORIZED,
                    "Enter the companion token shown in its startup window.",
                ),
                &origin,
            );
        }
    }
    let response = if preflight {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(request).await
    };
    cors(response, &origin)
}
fn cors(mut response: Response, origin: &str) -> Response {
    let h = response.headers_mut();
    if let Ok(value) = HeaderValue::from_str(origin) {
        h.insert("access-control-allow-origin", value);
    }
    h.insert("vary", HeaderValue::from_static("Origin"));
    h.insert(
        "access-control-allow-methods",
        HeaderValue::from_static("GET, POST, OPTIONS"),
    );
    h.insert(
        "access-control-allow-headers",
        HeaderValue::from_static("Authorization, Content-Type"),
    );
    h.insert(
        "access-control-allow-private-network",
        HeaderValue::from_static("true"),
    );
    h.insert("cache-control", HeaderValue::from_static("no-store"));
    response
}
fn executable(name: &str) -> Option<PathBuf> {
    let mut paths: Vec<PathBuf> =
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect();
    if let Some(home) = std::env::var_os("HOME") {
        paths.push(PathBuf::from(&home).join(".local/bin"));
        paths.push(PathBuf::from(&home).join(".cargo/bin"));
        paths.push(PathBuf::from(&home).join(".kimi-code/bin"));
        paths.push(PathBuf::from(&home).join(".grok/bin"));
        paths.push(PathBuf::from(&home).join(".opencode/bin"));
        // Finder-launched apps do not inherit the shell's NVM PATH.
        if let Ok(entries) = std::fs::read_dir(PathBuf::from(home).join(".nvm/versions/node")) {
            let mut dirs: Vec<_> = entries.flatten().map(|e| e.path().join("bin")).collect();
            dirs.sort();
            dirs.reverse();
            paths.extend(dirs);
        }
    }
    paths.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    paths
        .into_iter()
        .map(|path| path.join(name))
        .find(|path| cli::executable_file(path))
}
async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(
        json!({"ok":true,"authenticated":true,"version":env!("CARGO_PKG_VERSION"),"providers":cli::inventory(&state),"note":"Pairing is authenticated. CLI account sign-in is unchecked until that tool handles a request. Inventory only finds executables; it does not run them or read credentials."}),
    )
}
#[derive(Debug, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}
#[derive(Deserialize)]
pub struct GenerateRequest {
    pub provider: String,
    #[serde(default)]
    pub model: String,
    #[serde(default, rename = "apiKey")]
    pub api_key: Option<String>,
    pub messages: Vec<Message>,
}
const ZAI_CLAUDE_BASE: &str = "https://api.z.ai/api/anthropic";
fn coding_plan_key(
    provider: &str,
    supplied: Option<&str>,
    inherited: Option<&str>,
    inherited_base: Option<&str>,
) -> Result<Option<String>, String> {
    let supplied = supplied.filter(|key| !key.trim().is_empty());
    if provider != "zai-coding" {
        return if supplied.is_some() {
            Err(
                "A local Coding Plan key is only accepted for the Z.ai Coding Plan connection"
                    .into(),
            )
        } else {
            Ok(None)
        };
    }
    let key = supplied.or_else(|| {
        if inherited_base.map(|base|base.trim_end_matches('/')) == Some(ZAI_CLAUDE_BASE) { inherited } else { None }
    }).filter(|key| !key.trim().is_empty()).ok_or("Enter your Z.ai Coding Plan API key in the local connection. Claude settings files are not read in safe mode; alternatively start the companion with ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic.")?;
    if key.len() > 8192 || key.chars().any(|c| c.is_control()) {
        return Err("The Coding Plan API key contains invalid characters".into());
    }
    Ok(Some(key.to_string()))
}
pub fn cli_args(provider: &str, model: &str) -> Result<(&'static str, Vec<String>), String> {
    let (program, args): (&str, Vec<&str>) = match provider {
        "codex" => (
            "codex",
            vec![
                "exec",
                "--json",
                "--sandbox",
                "read-only",
                "--skip-git-repo-check",
                "--ignore-user-config",
                "--ephemeral",
                "--disable",
                "shell_tool",
                "--disable",
                "view_image",
                "--config",
                "web_search=\"disabled\"",
                "--color",
                "never",
            ],
        ),
        "claude-code" | "zai-coding" => (
            "claude",
            vec![
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--include-partial-messages",
                "--tools",
                "",
                "--safe-mode",
                "--no-session-persistence",
                "--no-chrome",
                "--disable-slash-commands",
            ],
        ),
        _ => {
            return Err(
                "Choose Codex CLI, Claude Code, or a configured Z.ai Coding Plan connection."
                    .into(),
            )
        }
    };
    if model.len() > 200 || model.chars().any(|c| c.is_control()) {
        return Err("Invalid model name".into());
    }
    let mut args: Vec<String> = args.into_iter().map(str::to_string).collect();
    if !model.trim().is_empty() {
        args.extend(["--model".into(), model.into()]);
    }
    if provider == "codex" {
        args.push("-".into());
    }
    Ok((program, args))
}
pub fn prompt(request: &GenerateRequest) -> Result<String, String> {
    if request.messages.is_empty() || request.messages.len() > 200 {
        return Err("Supply 1–200 conversation messages".into());
    }
    let mut output=String::from("Return the response or artifact requested below as text, including JSON when requested. Do not read files, execute commands, use operating-system tools, or modify this machine. All prior output is provided in the conversation.\n\n");
    for message in &request.messages {
        if !matches!(
            message.role.as_str(),
            "system" | "developer" | "user" | "assistant"
        ) {
            return Err("Unsupported message role".into());
        }
        output.push_str(&format!(
            "--- {} ---\n{}\n\n",
            message.role, message.content
        ));
    }
    if output.len() > 3 * 1024 * 1024 {
        return Err(
            "Conversation exceeds 3 MiB. Continue this scene with a shorter context.".into(),
        );
    }
    Ok(output)
}
#[derive(Default)]
pub struct Normalizer {
    emitted: HashMap<String, String>,
    claude_text: String,
    pub finished: bool,
    pub failed: bool,
    stop_reason: String,
}
impl Normalizer {
    fn delta(text: &str) -> Value {
        json!({"type":"delta","text":text})
    }
    fn fail(&mut self, message: &str) -> Vec<Value> {
        self.failed = true;
        vec![json!({"type":"error","message":message})]
    }
    pub fn parse(&mut self, provider: &str, value: &Value) -> Vec<Value> {
        if self.finished || self.failed {
            return Vec::new();
        }
        let event = value["type"].as_str().unwrap_or("");
        if provider == "grok-build"
            && event == "system"
            && value["subtype"] == "init"
            && value["tools"].as_array().is_some_and(|a| !a.is_empty())
        {
            return self.fail("Grok reported enabled tools despite the output-only request. Review its configured MCP/plugins or use the xAI API connection.");
        }
        if provider == "kimi-code" {
            if event == "error" {
                return self.fail(
                    value["message"]
                        .as_str()
                        .unwrap_or("Kimi Code failed; received text remains saved"),
                );
            }
            if value["role"] == "assistant" {
                if value["tool_calls"]
                    .as_array()
                    .is_some_and(|a| !a.is_empty())
                {
                    return self.fail("Kimi attempted a tool call despite the output-only profile. Check its installed version.");
                }
                if let Some(text) = value["content"].as_str() {
                    return vec![Self::delta(text)];
                }
            }
            return Vec::new();
        }
        if provider == "frame-ndjson" {
            return match event {
                "delta" => match value["text"].as_str() {
                    Some(text) => vec![Self::delta(text)],
                    None => self.fail("Custom CLI delta is missing text"),
                },
                "done" => {
                    self.finished = true;
                    vec![
                        json!({"type":"done","finishReason":value["finishReason"].as_str().unwrap_or("stop")}),
                    ]
                }
                "error" => self.fail(
                    value["message"]
                        .as_str()
                        .unwrap_or("Custom CLI failed; received text remains saved"),
                ),
                _ => self.fail("Custom CLI must emit Frame delta, done, or error NDJSON events"),
            };
        }
        if provider == "codex" {
            if event == "turn.completed" {
                self.finished = true;
                return vec![json!({"type":"done","finishReason":"stop"})];
            }
            if matches!(event, "turn.failed" | "error") {
                return self.fail(value["error"]["message"].as_str().or(value["message"].as_str()).unwrap_or("Codex stopped before completing this response. Saved text is retained."));
            }
            if matches!(event, "item.completed" | "item.updated")
                && value["item"]["type"] == "agent_message"
            {
                let id = value["item"]["id"].as_str().unwrap_or("message");
                let text = value["item"]["text"].as_str().unwrap_or("");
                let prev = self.emitted.entry(id.into()).or_default();
                if let Some(delta) = text.strip_prefix(prev.as_str()) {
                    let delta = delta.to_string();
                    *prev = text.into();
                    if !delta.is_empty() {
                        return vec![Self::delta(&delta)];
                    }
                }
            }
            if event == "item.delta" {
                if let Some(text) = value["delta"]["text"].as_str().or(value["delta"].as_str()) {
                    let id = value["item_id"].as_str().unwrap_or("message");
                    self.emitted.entry(id.into()).or_default().push_str(text);
                    return vec![Self::delta(text)];
                }
            }
        } else {
            if event == "stream_event" {
                let inner = &value["event"];
                if inner["type"] == "content_block_delta" && inner["delta"]["type"] == "text_delta"
                {
                    if let Some(text) = inner["delta"]["text"].as_str() {
                        self.claude_text.push_str(text);
                        return vec![Self::delta(text)];
                    }
                }
                if inner["type"] == "message_delta" {
                    if let Some(reason) = inner["delta"]["stop_reason"].as_str() {
                        self.stop_reason = reason.into();
                    }
                }
            }
            if event == "assistant" && self.claude_text.is_empty() {
                let text = value["message"]["content"]
                    .as_array()
                    .map(|content| {
                        content
                            .iter()
                            .filter(|v| v["type"] == "text")
                            .filter_map(|v| v["text"].as_str())
                            .collect::<String>()
                    })
                    .unwrap_or_default();
                if !text.is_empty() {
                    self.claude_text = text.clone();
                    return vec![Self::delta(&text)];
                }
            }
            if event == "result" {
                if value["is_error"] == true
                    || value["subtype"].as_str().is_some_and(|s| s != "success")
                {
                    return self.fail(
                        value["result"]
                            .as_str()
                            .unwrap_or("The CLI stopped before finishing. Saved text is retained."),
                    );
                }
                let mut events = Vec::new();
                if let Some(text) = value["result"].as_str() {
                    if let Some(delta) = text.strip_prefix(&self.claude_text) {
                        if !delta.is_empty() {
                            events.push(Self::delta(delta));
                        }
                    }
                }
                self.finished = true;
                events.push(json!({"type":"done","finishReason":if self.stop_reason.is_empty(){value["stop_reason"].as_str().unwrap_or("stop")}else{&self.stop_reason}}));
                return events;
            }
            if event == "error" {
                return self.fail(
                    value["error"]["message"]
                        .as_str()
                        .unwrap_or("Claude Code reported an error. Saved text is retained."),
                );
            }
        }
        Vec::new()
    }
}
async fn generate(State(state): State<AppState>, Json(request): Json<GenerateRequest>) -> Response {
    let Ok(permit) = state.slots.clone().try_acquire_owned() else {
        return error(
            StatusCode::TOO_MANY_REQUESTS,
            "The companion is already generating. Stop or finish that run first.",
        );
    };
    let input = match prompt(&request) {
        Ok(value) => value,
        Err(message) => return error(StatusCode::BAD_REQUEST, &message),
    };
    let coding_key = match coding_plan_key(
        &request.provider,
        request.api_key.as_deref(),
        std::env::var("ANTHROPIC_AUTH_TOKEN").ok().as_deref(),
        std::env::var("ANTHROPIC_BASE_URL").ok().as_deref(),
    ) {
        Ok(key) => key,
        Err(message) => return error(StatusCode::BAD_REQUEST, &message),
    };
    let temp = match tempfile::Builder::new().prefix("frame-cli-").tempdir() {
        Ok(dir) => dir,
        Err(_) => {
            return error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Could not create the isolated CLI working directory",
            )
        }
    };
    let invocation = match cli::prepare(&state, &request, temp.path(), &input) {
        Ok(value) => value,
        Err(message) => return error(StatusCode::BAD_REQUEST, &message),
    };
    let mut command = Command::new(&invocation.binary);
    // Node-based CLI launchers may use /usr/bin/env; include the executable's directory.
    if let Some(dir) = invocation.binary.parent() {
        let mut paths = vec![dir.to_path_buf()];
        paths.extend(std::env::split_paths(
            &std::env::var_os("PATH").unwrap_or_default(),
        ));
        if let Ok(path) = std::env::join_paths(paths) {
            command.env("PATH", path);
        }
    }
    command
        .args(&invocation.args)
        .current_dir(temp.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    if let Some(key) = coding_key {
        // Explicit user-supplied Coding Plan key, scoped to this Claude Code process.
        // No global settings or OAuth credentials are read, copied, or changed.
        command
            .env("ANTHROPIC_AUTH_TOKEN", key)
            .env("ANTHROPIC_BASE_URL", ZAI_CLAUDE_BASE)
            .env_remove("ANTHROPIC_API_KEY")
            .env_remove("CLAUDE_CODE_OAUTH_TOKEN")
            .env_remove("CLAUDE_CODE_USE_BEDROCK")
            .env_remove("CLAUDE_CODE_USE_VERTEX")
            .env_remove("CLAUDE_CODE_USE_FOUNDRY");
    }
    // Ordinary CLI authentication remains managed by the installed CLI.
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(_) => {
            return error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Could not launch the CLI. Check its installation and permissions.",
            )
        }
    };
    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel::<Result<Bytes, Infallible>>(16);
    tokio::spawn(async move {
        let _permit = permit;
        let _temp = temp;
        if invocation.stdin {
            let written=tokio::select! {
                _=tx.closed()=>{let _=child.kill().await;return;}
                result=tokio::time::timeout(Duration::from_secs(30),stdin.write_all(input.as_bytes()))=>matches!(result,Ok(Ok(()))),
            };
            if !written {
                let _=send(&tx,json!({"type":"error","message":"The CLI did not accept the request on standard input within 30 seconds. Check the tool's configured arguments."})).await;
                let _=child.kill().await;return;
            }
        }
        drop(stdin);
        if invocation.protocol == "text" {
            if let Err(message)=cli::stream_text(&mut child,stdout,&tx).await {let _=send(&tx,json!({"type":"error","message":message})).await;let _=child.kill().await;}
            return;
        }
        let mut lines = BufReader::new(stdout);
        let mut normalizer = Normalizer::default();
        let timeout = tokio::time::sleep(Duration::from_secs(3600));
        tokio::pin!(timeout);
        loop {
            tokio::select! {
             _=tx.closed()=>{let _=child.kill().await;return;}
             _=&mut timeout=>{let _=send(&tx,json!({"type":"error","message":"CLI generation reached its one-hour limit. Received text is saved; continue the scene to resume."})).await;let _=child.kill().await;return;}
             line=cli::next_line(&mut lines)=>match line{
              Ok(Some(line))=>{if line.len()>16*1024*1024{let _=send(&tx,json!({"type":"error","message":"A CLI event exceeded 16 MiB. Split this generation into scenes."})).await;let _=child.kill().await;return;}if line.trim().is_empty(){continue;}match serde_json::from_str::<Value>(&line){Ok(value)=>{for event in normalizer.parse(&invocation.protocol,&value){if send(&tx,event).await.is_err(){let _=child.kill().await;return;}}},Err(_)=>{let _=send(&tx,json!({"type":"error","message":"The CLI returned an unexpected response format. Received text remains saved."})).await;let _=child.kill().await;return;}}if normalizer.finished||normalizer.failed{break;}}
              Ok(None)=>break,
              Err(_)=>{let _=send(&tx,json!({"type":"error","message":"The CLI stream disconnected. Received text remains saved."})).await;let _=child.kill().await;return;}
             }
            }
        }
        let status = tokio::time::timeout(Duration::from_secs(5), child.wait()).await;
        if invocation.protocol == "kimi-code"
            && !normalizer.failed
            && matches!(&status,Ok(Ok(s))if s.success())
        {
            let _ = send(&tx, json!({"type":"done","finishReason":"stop"})).await;
            return;
        }
        if !normalizer.finished && !normalizer.failed {
            let message = if matches!(status,Ok(Ok(s))if s.success()) {
                "The CLI ended without a completion marker. Received text remains saved; continue to finish."
            } else {
                "The CLI exited before completion. Check its login and model access in Terminal; received text remains saved."
            };
            let _ = send(&tx, json!({"type":"error","message":message})).await;
        }
    });
    let mut response = Body::from_stream(ReceiverStream::new(rx)).into_response();
    response.headers_mut().insert(
        "content-type",
        HeaderValue::from_static("application/x-ndjson; charset=utf-8"),
    );
    response
        .headers_mut()
        .insert("x-accel-buffering", HeaderValue::from_static("no"));
    response
}
async fn send(tx: &mpsc::Sender<Result<Bytes, Infallible>>, event: Value) -> Result<(), ()> {
    let line = format!("{event}\n");
    tx.send(Ok(Bytes::from(line))).await.map_err(|_| ())
}
#[cfg(test)]
mod tests {
    use super::*;
    use tower::ServiceExt;
    fn test_app() -> Router {
        router(AppState::new("test-token".into(), default_origins()))
    }
    #[tokio::test]
    async fn rejects_unknown_origin_and_bad_token() {
        let response = test_app()
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .header("origin", "https://hostile.example")
                    .header("authorization", "Bearer test-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let response = test_app()
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .header("origin", "http://localhost:5173")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    #[tokio::test]
    async fn preflight_allows_only_configured_origins() {
        let response = test_app()
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/generate")
                    .header("origin", "http://localhost:5173")
                    .header("access-control-request-method", "POST")
                    .header(
                        "access-control-request-headers",
                        "authorization,content-type",
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            response.headers()["access-control-allow-private-network"],
            "true"
        );
    }
    #[test]
    fn claude_deltas_are_not_duplicated() {
        let mut n = Normalizer::default();
        assert_eq!(n.parse("claude-code",&json!({"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}}))[0]["text"],"hello");
        assert!(n
            .parse(
                "claude-code",
                &json!({"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}})
            )
            .is_empty());
        assert_eq!(
            n.parse(
                "claude-code",
                &json!({"type":"result","subtype":"success","result":"hello"})
            )
            .len(),
            1
        );
    }
    #[test]
    fn codex_updates_deduplicate_and_preserve_text_before_error() {
        let mut n = Normalizer::default();
        assert_eq!(n.parse("codex",&json!({"type":"item.updated","item":{"id":"a","type":"agent_message","text":"<html>"}}))[0]["text"],"<html>");
        assert_eq!(n.parse("codex",&json!({"type":"item.completed","item":{"id":"a","type":"agent_message","text":"<html>body"}}))[0]["text"],"body");
        assert_eq!(
            n.parse(
                "codex",
                &json!({"type":"turn.failed","error":{"message":"cut off"}})
            )[0]["type"],
            "error"
        );
    }
    #[test]
    fn cli_arguments_do_not_enable_permission_bypass() {
        for provider in ["codex", "claude-code", "zai-coding"] {
            let (_, args) = cli_args(provider, "model; touch bad").unwrap();
            assert!(!args
                .iter()
                .any(|v| v.contains("dangerously") || v == "--bare"));
            assert!(args.contains(&"model; touch bad".to_string()));
        }
        assert!(cli_args("arbitrary-command", "").is_err());
    }
    #[test]
    fn coding_plan_credentials_require_explicit_key_or_matching_process_environment() {
        assert_eq!(
            coding_plan_key("zai-coding", Some("test-key"), None, None).unwrap(),
            Some("test-key".into())
        );
        assert_eq!(
            coding_plan_key(
                "zai-coding",
                None,
                Some("inherited-key"),
                Some(ZAI_CLAUDE_BASE)
            )
            .unwrap(),
            Some("inherited-key".into())
        );
        assert!(coding_plan_key(
            "zai-coding",
            None,
            Some("other-provider-key"),
            Some("https://api.anthropic.com")
        )
        .is_err());
        assert!(coding_plan_key("zai-coding", None, None, None).is_err());
        assert!(coding_plan_key("zai-coding", Some("bad\nkey"), None, None).is_err());
        assert!(coding_plan_key("claude-code", Some("test-key"), None, None).is_err());
        assert_eq!(
            coding_plan_key("claude-code", None, None, None).unwrap(),
            None
        );
    }
}
