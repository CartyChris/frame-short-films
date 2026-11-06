//! User-owned CLI connections. No shell evaluation, credential extraction, or model-authored configuration.
use super::*;
use serde::Serialize;
use std::{path::Path, sync::Mutex};
use tokio::io::AsyncReadExt;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub args: Vec<String>,
    pub output: String,
}
pub struct Registry {
    path: Option<PathBuf>,
    profiles: Mutex<Vec<Profile>>,
}
impl Default for Registry {
    fn default() -> Self {
        let path = std::env::var_os("HOME").map(|home| {
            #[cfg(target_os = "macos")]
            let dir =
                PathBuf::from(home).join("Library/Application Support/studio.frame.shortfilms");
            #[cfg(not(target_os = "macos"))]
            let dir = PathBuf::from(home).join(".local/share/studio.frame.shortfilms");
            dir.join("cli-profiles.json")
        });
        Self::load(path)
    }
}
impl Registry {
    fn load(path: Option<PathBuf>) -> Self {
        let profiles = path
            .as_ref()
            .and_then(|p| {
                if p.metadata().ok()?.len() > 128 * 1024 {
                    return None;
                }
                serde_json::from_slice::<Vec<Profile>>(&std::fs::read(p).ok()?).ok()
            })
            .unwrap_or_default()
            .into_iter()
            .filter(|p| validate_profile(p).is_ok())
            .take(32)
            .collect();
        Self {
            path,
            profiles: Mutex::new(profiles),
        }
    }
    fn list(&self) -> Vec<Profile> {
        self.profiles
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }
    fn save(&self, profile: Profile) -> Result<(), String> {
        validate_profile(&profile)?;
        let mut lock = self
            .profiles
            .lock()
            .map_err(|_| "CLI profile registry is unavailable")?;
        let mut next = lock.clone();
        if let Some(old) = next.iter_mut().find(|p| p.id == profile.id) {
            *old = profile;
        } else {
            if next.len() >= 32 {
                return Err("At most 32 CLI profiles are supported".into());
            }
            next.push(profile);
        }
        self.persist(&next)?;
        *lock = next;
        Ok(())
    }
    fn remove(&self, id: &str) -> Result<(), String> {
        let mut lock = self
            .profiles
            .lock()
            .map_err(|_| "CLI profile registry is unavailable")?;
        let next: Vec<_> = lock.iter().filter(|p| p.id != id).cloned().collect();
        self.persist(&next)?;
        *lock = next;
        Ok(())
    }
    fn persist(&self, profiles: &[Profile]) -> Result<(), String> {
        use std::io::Write;
        let path = self
            .path
            .as_ref()
            .ok_or("The companion cannot locate its application data directory")?;
        let dir = path.parent().ok_or("Invalid CLI profile directory")?;
        let encoded=serde_json::to_vec_pretty(profiles).map_err(|_| "Could not encode CLI profiles")?;
        if encoded.len()>128*1024 { return Err("CLI profile registry exceeds 128 KiB; shorten fixed arguments or remove unused profiles".into()); }
        std::fs::create_dir_all(dir).map_err(|_| "Could not create the CLI profile directory")?;
        let mut file =
            tempfile::NamedTempFile::new_in(dir).map_err(|_| "Could not save CLI profiles")?;
        file.write_all(&encoded)
        .map_err(|_| "Could not save CLI profiles")?;
        file.as_file()
            .sync_all()
            .map_err(|_| "Could not flush CLI profiles")?;
        file.persist(path)
            .map_err(|_| "Could not replace CLI profiles")?;
        Ok(())
    }
}
pub fn validate_profile(p: &Profile) -> Result<(), String> {
    if p.id.is_empty()
        || p.id.len() > 40
        || !p
            .id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return Err("Use a profile ID with 1–40 lowercase letters, digits, or dashes".into());
    }
    if p.name.trim().is_empty() || p.name.len() > 80 || p.name.chars().any(char::is_control) {
        return Err("Enter a short profile name".into());
    }
    let path = Path::new(&p.executable);
    if !path.is_absolute()
        || p.executable.len() > 4096
        || p.executable.chars().any(char::is_control)
    {
        return Err("Choose an absolute executable path".into());
    }
    let blocked = [
        "sh",
        "bash",
        "zsh",
        "fish",
        "dash",
        "ksh",
        "csh",
        "tcsh",
        "cmd",
        "cmd.exe",
        "powershell",
        "pwsh",
        "env",
        "osascript",
    ];
    let resolved=std::fs::canonicalize(path).unwrap_or_else(|_|path.to_path_buf());
    if [path,&resolved].iter().any(|p| blocked.contains(&p.file_name().and_then(|s|s.to_str()).unwrap_or("")))
    {
        return Err("Shells and shell launchers are not CLI profiles. Select the actual trusted AI executable.".into());
    }
    if !matches!(p.output.as_str(), "frame-ndjson" | "text") {
        return Err("Choose Frame NDJSON or plain text output".into());
    }
    if p.args.len() > 64
        || p.args
            .iter()
            .any(|a| a.len() > 4096 || a.chars().any(char::is_control) || a.contains("{prompt}"))
    {
        return Err("Use at most 64 fixed arguments; prompts are sent through stdin, never substituted into arguments".into());
    }
    if p.args.iter().any(|a| { let a=a.to_ascii_lowercase(); ["--api-key","--apikey","--auth-token","--access-token","--token","--password","--credential"].iter().any(|flag|a==*flag||a.starts_with(&format!("{flag}="))) }) {
        return Err("Do not save credential arguments in a CLI profile. Use the tool's own sign-in or its configured process environment.".into());
    }
    Ok(())
}
#[derive(Deserialize)]
pub struct Registration {
    profile: Profile,
    reviewed: bool,
}
pub async fn profiles(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"profiles":state.cli.list()}))
}
pub async fn register(
    State(state): State<AppState>,
    Json(request): Json<Registration>,
) -> Response {
    if !request.reviewed {
        return error(
            StatusCode::BAD_REQUEST,
            "Review the exact executable and arguments before saving this trusted CLI profile",
        );
    }
    if !executable_file(Path::new(&request.profile.executable)) {
        return error(
            StatusCode::BAD_REQUEST,
            "The selected executable does not exist or is not executable on this computer",
        );
    }
    match state.cli.save(request.profile) {
        Ok(()) => Json(json!({"ok":true,"profiles":state.cli.list()})).into_response(),
        Err(e) => error(StatusCode::BAD_REQUEST, &e),
    }
}
#[derive(Deserialize)]
pub struct Remove {
    id: String,
}
pub async fn remove(State(state): State<AppState>, Json(request): Json<Remove>) -> Response {
    match state.cli.remove(&request.id) {
        Ok(()) => Json(json!({"ok":true,"profiles":state.cli.list()})).into_response(),
        Err(e) => error(StatusCode::BAD_REQUEST, &e),
    }
}
pub fn executable_file(path: &Path) -> bool {
    let Ok(meta) = path.metadata() else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}
pub fn inventory(state: &AppState) -> Value {
    let definitions = [
        ("codex", "Codex · ChatGPT", "codex", true, "codex login"),
        (
            "claude-code",
            "Claude Code",
            "claude",
            true,
            "claude auth login",
        ),
        (
            "zai-coding",
            "Z.AI Coding Plan via Claude Code",
            "claude",
            true,
            "Use your Coding Plan key",
        ),
        ("kimi-code", "Kimi Code", "kimi", true, "kimi login"),
        ("grok-build", "Grok Build", "grok", true, "grok login"),
        ("gemini-cli", "Gemini CLI", "gemini", false, "gemini"),
        ("qwen-code", "Qwen Code", "qwen", false, "qwen"),
        (
            "opencode",
            "OpenCode",
            "opencode",
            false,
            "opencode auth login",
        ),
    ];
    let mut result = serde_json::Map::new();
    for (id, name, program, supported, login) in definitions {
        let path = executable(program);
        result.insert(id.into(),json!({"name":name,"installed":path.is_some(),"executable":path,"adapter":supported,"authentication":"unchecked","login":login}));
    }
    for p in state.cli.list() {
        result.insert(format!("cli:{}",p.id),json!({"name":p.name,"installed":executable_file(Path::new(&p.executable)),"executable":p.executable,"adapter":true,"authentication":"unchecked","custom":true}));
    }
    Value::Object(result)
}
pub struct Invocation {
    pub binary: PathBuf,
    pub args: Vec<String>,
    pub protocol: String,
    pub stdin: bool,
}
pub fn prepare(
    state: &AppState,
    request: &GenerateRequest,
    dir: &Path,
    input: &str,
) -> Result<Invocation, String> {
    if request.model.len() > 200 || request.model.chars().any(char::is_control) {
        return Err("Invalid model name".into());
    }
    if let Some(id) = request.provider.strip_prefix("cli:") {
        let p = state.cli.list().into_iter().find(|p| p.id == id).ok_or("This custom CLI profile is not registered in the companion. Review and save it in Connections first.")?;
        validate_profile(&p)?;
        if !executable_file(Path::new(&p.executable)) {
            return Err("The custom executable is no longer available".into());
        }
        let args = p
            .args
            .iter()
            .map(|a| {
                if a == "{model}" {
                    request.model.clone()
                } else {
                    a.clone()
                }
            })
            .collect();
        return Ok(Invocation {
            binary: p.executable.into(),
            args,
            protocol: p.output,
            stdin: true,
        });
    }
    let (name, mut args, protocol, stdin) = match request.provider.as_str() {
        "kimi-code" => {
            let agent = dir.join("frame-output.md");
            std::fs::write(&agent,"---\nname: frame-output\ndescription: Return the requested studio response as text\ntools: []\nsubagents: []\n---\nReturn the requested response or artifact as text. No tools, filesystem actions, or delegation.\n").map_err(|_| "Could not prepare the output-only Kimi agent")?;
            let skills = dir.join("skills");
            std::fs::create_dir_all(&skills)
                .map_err(|_| "Could not prepare the empty skills directory")?;
            {
                if input.len() > 96 * 1024 {
                    return Err("Kimi Code's headless prompt exceeds its 96 KiB argument limit. Nothing was truncated. Use a shorter scene context or the Kimi / Moonshot API connection for a larger request.".into());
                }
                (
                    "kimi",
                    vec![
                        "--agent-file".into(),
                        agent.to_string_lossy().into(),
                        "--skills-dir".into(),
                        skills.to_string_lossy().into(),
                        "--output-format".into(),
                        "stream-json".into(),
                        "-p".into(),
                        input.into(),
                    ],
                    "kimi-code".to_string(),
                    false,
                )
            }
        }
        "grok-build" => {
            // The prompt is a transient private file, never an argv value or audit log.
            use std::io::Write;
            let mut file = std::fs::OpenOptions::new();
            file.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                file.mode(0o600);
            }
            file.open(dir.join("request.txt"))
                .and_then(|mut f| f.write_all(input.as_bytes()))
                .map_err(|_| "Could not prepare the temporary Grok request")?;
            (
                "grok",
                vec![
                    "--no-auto-update".into(),
                    "--prompt-file".into(),
                    dir.join("request.txt").to_string_lossy().into(),
                    "--output-format".into(),
                    "streaming-messages-json".into(),
                    "--include-partial-messages".into(),
                    "--tools".into(),
                    "".into(),
                    "--no-subagents".into(),
                    "--disable-web-search".into(),
                    "--permission-mode".into(),
                    "dontAsk".into(),
                    "--max-turns".into(),
                    "1".into(),
                    "--verbatim".into(),
                ],
                "grok-build".to_string(),
                false,
            )
        }
        _ => {
            let (program, args) = cli_args(&request.provider, &request.model)?;
            return Ok(Invocation {
                binary: executable(program).ok_or_else(|| {
                    format!("Install {program} and sign in in Terminal, then scan again.")
                })?,
                args,
                protocol: request.provider.clone(),
                stdin: true,
            });
        }
    };
    if !request.model.trim().is_empty() {
        args.extend(["--model".into(), request.model.clone()]);
    }
    Ok(Invocation {
        binary: executable(name)
            .ok_or_else(|| format!("Install {name} and sign in in Terminal, then scan again."))?,
        args,
        protocol,
        stdin,
    })
}

/// A bounded line reader prevents a broken local program from allocating an unlimited event.
pub async fn next_line<R: tokio::io::AsyncBufRead + Unpin>(
    reader: &mut R,
) -> Result<Option<String>, String> {
    let mut bytes = Vec::new();
    let n = reader
        .take(16 * 1024 * 1024 + 1)
        .read_until(b'\n', &mut bytes)
        .await
        .map_err(|_| "The CLI stream disconnected. Received text remains saved.")?;
    if n == 0 {
        return Ok(None);
    }
    if n > 16 * 1024 * 1024 {
        return Err("A CLI event exceeded 16 MiB. Split this generation into scenes.".into());
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "The CLI returned invalid UTF-8. Received text remains saved.".into())
}

pub async fn stream_text(child: &mut tokio::process::Child, mut stdout: tokio::process::ChildStdout, tx: &mpsc::Sender<Result<Bytes,Infallible>>) -> Result<(),String> {
    let mut buffer=[0u8;8192]; let mut pending=Vec::new();
    let timeout=tokio::time::sleep(Duration::from_secs(3600));tokio::pin!(timeout);
    loop {
        let n=tokio::select! {
            _=tx.closed()=>{let _=child.kill().await;return Ok(());}
            _=&mut timeout=>return Err("CLI generation reached its one-hour limit. Received text remains saved.".into()),
            result=stdout.read(&mut buffer)=>result.map_err(|_|"The CLI stream disconnected; received text remains saved")?,
        };
        if n==0 { break; }
        pending.extend_from_slice(&buffer[..n]);
        let (valid,invalid)=match std::str::from_utf8(&pending) { Ok(_)=>(pending.len(),false),Err(e)=>(e.valid_up_to(),e.error_len().is_some()) };
        if valid>0 {
            let text=std::str::from_utf8(&pending[..valid]).map_err(|_|"Invalid UTF-8")?;
            send(tx,json!({"type":"delta","text":text})).await.map_err(|_|"The studio disconnected")?;
            pending.drain(..valid);
        }
        if invalid { return Err("The CLI returned invalid UTF-8; all valid received text remains saved".into()); }
    }
    if !pending.is_empty() { return Err("The CLI stopped inside a UTF-8 character. Earlier text remains saved.".into()); }
    let status=tokio::time::timeout(Duration::from_secs(5),child.wait()).await;
    if !matches!(status,Ok(Ok(s)) if s.success()) { return Err("The CLI exited before successful completion. Received text remains saved.".into()); }
    send(tx,json!({"type":"done","finishReason":"stop"})).await.map_err(|_|"The studio disconnected".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn profile() -> Profile {
        Profile {
            id: "my-ai".into(),
            name: "My CLI".into(),
            executable: "/opt/tools/ai".into(),
            args: vec!["--model".into(), "{model}".into()],
            output: "frame-ndjson".into(),
        }
    }
    #[test]
    fn profiles_reject_shells_and_prompt_interpolation() {
        let mut p = profile();
        assert!(validate_profile(&p).is_ok());
        p.executable = "/bin/zsh".into();
        assert!(validate_profile(&p).is_err());
        p.executable = "ai".into();
        assert!(validate_profile(&p).is_err());
        p.executable = "/opt/tools/ai".into();
        p.args.push("{prompt}".into());
        assert!(validate_profile(&p).is_err());
    }
    #[test]
    fn registry_roundtrip_and_remove_are_atomic() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("profiles.json");
        let r = Registry::load(Some(path.clone()));
        r.save(profile()).unwrap();
        let r = Registry::load(Some(path));
        assert_eq!(r.list().len(), 1);
        r.remove("my-ai").unwrap();
        assert!(r.list().is_empty());
    }
    #[tokio::test]
    async fn line_reader_keeps_unicode_and_rejects_oversize() {
        let mut r = BufReader::new("hello 🌿\n".as_bytes());
        assert_eq!(next_line(&mut r).await.unwrap().unwrap(), "hello 🌿\n");
        let bytes = vec![b'a'; 16 * 1024 * 1024 + 1];
        let mut r = BufReader::new(bytes.as_slice());
        assert!(next_line(&mut r).await.is_err());
    }
    #[tokio::test]
    #[cfg(unix)]
    async fn reviewed_custom_cli_streams_real_subprocess_and_truncation_is_an_error() {
        use std::os::unix::fs::PermissionsExt;
        use tower::ServiceExt;
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("test-ai");
        std::fs::write(&exe,"#!/usr/bin/env python3\nimport sys,json\nprompt=sys.stdin.read()\nprint(json.dumps({'type':'delta','text':'Saved 🌿 '+sys.argv[1]}),flush=True)\nif sys.argv[2]=='complete': print(json.dumps({'type':'done','finishReason':'stop'}),flush=True)\n").unwrap();
        std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o700)).unwrap();
        let mut state = AppState::new("test-token".into(), default_origins());
        state.cli = Arc::new(Registry::load(Some(dir.path().join("profiles.json"))));
        for (mode, terminal) in [("complete", "done"), ("truncated", "error")] {
            state
                .cli
                .save(Profile {
                    id: "fixture".into(),
                    name: "Fixture".into(),
                    executable: exe.to_string_lossy().into(),
                    args: vec!["literal; $(no-shell)".into(), mode.into()],
                    output: "frame-ndjson".into(),
                })
                .unwrap();
            let response=router(state.clone()).oneshot(Request::builder().method("POST").uri("/generate").header("origin","http://localhost:5173").header("authorization","Bearer test-token").header("content-type","application/json").body(Body::from(json!({"provider":"cli:fixture","messages":[{"role":"user","content":"Return a fixture"}]}).to_string())).unwrap()).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
                .await
                .unwrap();
            let lines: Vec<Value> = std::str::from_utf8(&bytes)
                .unwrap()
                .lines()
                .map(|line| serde_json::from_str(line).unwrap())
                .collect();
            assert_eq!(lines[0]["text"], "Saved 🌿 literal; $(no-shell)");
            assert_eq!(lines.last().unwrap()["type"], terminal);
        }
    }
    #[tokio::test]
    async fn custom_registration_requires_review_and_origin_authentication() {
        use tower::ServiceExt;
        let app = router(AppState::new("test-token".into(), default_origins()));
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/cli/profiles")
                    .header("origin", "http://localhost:5173")
                    .header("authorization", "Bearer test-token")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"profile":profile(),"reviewed":false}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
    #[test]
    fn builtin_protocols_preserve_deltas_and_errors() {
        let mut n = Normalizer::default();
        assert!(n
            .parse(
                "kimi-code",
                &json!({"role":"meta","type":"system.version","version":"2.2.0"})
            )
            .is_empty());
        assert_eq!(
            n.parse(
                "kimi-code",
                &json!({"role":"assistant","content":"partial"})
            )[0]["text"],
            "partial"
        );
        assert_eq!(
            n.parse("kimi-code", &json!({"type":"error","message":"quota"}))[0]["type"],
            "error"
        );
        let mut n = Normalizer::default();
        assert_eq!(n.parse("claude-code",&json!({"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"grok"}}}))[0]["text"],"grok");
        assert_eq!(
            n.parse(
                "claude-code",
                &json!({"type":"result","subtype":"success","result":"grok"})
            )
            .len(),
            1
        );
        let mut n=Normalizer::default();
        assert_eq!(n.parse("grok-build",&json!({"type":"system","subtype":"init","tools":["bash"]}))[0]["type"],"error");
    }

    #[tokio::test]
    #[cfg(unix)]
    async fn plain_text_is_forwarded_before_newline_and_preserves_split_unicode() {
        let mut child=Command::new("python3").args(["-c","import sys,time;sys.stdout.buffer.write(b'kept '+bytes([240,159]));sys.stdout.buffer.flush();time.sleep(1);sys.stdout.buffer.write(bytes([140,191]));sys.stdout.buffer.flush()"])
            .stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true).spawn().unwrap();
        let stdout=child.stdout.take().unwrap();let (tx,mut rx)=mpsc::channel(16);
        let task=tokio::spawn(async move {stream_text(&mut child,stdout,&tx).await});
        let first=tokio::time::timeout(Duration::from_millis(800),rx.recv()).await.unwrap().unwrap().unwrap();
        let first:Value=serde_json::from_slice(&first).unwrap();assert_eq!(first["text"],"kept ");
        let mut text=first["text"].as_str().unwrap().to_string();let mut done=false;
        while let Some(Ok(bytes))=rx.recv().await {let v:Value=serde_json::from_slice(&bytes).unwrap();if let Some(delta)=v["text"].as_str(){text.push_str(delta);}done|=v["type"]=="done";}
        task.await.unwrap().unwrap();assert_eq!(text,"kept 🌿");assert!(done);
    }
}
