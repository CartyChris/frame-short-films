//! Explicitly operated local MCP connections. Custom servers use reviewed, locally
//! saved executable profiles; commands are never constructed from a shell string.
use super::{error, executable, AppState};
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};

const PROTOCOL: &str = "2025-11-25";
const MAX_RESPONSE: usize = 16 * 1024 * 1024;

const MAX_RECEIPT_BYTES: usize = 1024 * 1024;
const MAX_RECORD_BYTES: usize = MAX_RECEIPT_BYTES + 8192;
const MAX_LEDGER_RECORDS: usize = 10000;

pub struct Hub {
    sessions: Mutex<HashMap<String, Arc<Mutex<Connection>>>>,
    ledger_dir: Result<PathBuf, String>,
}
impl Default for Hub {
    fn default() -> Self {
        let ledger_dir = std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|home| home.join("Library/Application Support/Frame/Companion/mcp-ledger"))
            .ok_or_else(|| {
                "Cannot find the local home directory for the MCP operation ledger".to_string()
            });
        Self {
            sessions: Mutex::new(HashMap::new()),
            ledger_dir,
        }
    }
}
struct Connection {
    transport: Transport,
    tool_names: HashSet<String>,
    server_info: Value,
    server_digest: String,
    profile_binding: Option<(String, String)>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LedgerRecord {
    version: u8,
    request_id: String,
    server_digest: String,
    tool: String,
    arguments_digest: String,
    status: String,
    created_at: u64,
    updated_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    result_omitted: bool,
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}
fn ensure_ledger(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|_| {
        "Cannot open the private MCP operation ledger; no tool was submitted".to_string()
    })?;
    let metadata = fs::symlink_metadata(root)
        .map_err(|_| "Cannot inspect the MCP operation ledger".to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("The MCP operation ledger must be a real private directory".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root, fs::Permissions::from_mode(0o700))
            .map_err(|_| "Cannot protect the MCP operation ledger".to_string())?;
    }
    Ok(())
}
fn ledger_path(root: &Path, id: &str) -> PathBuf {
    root.join(format!("{}.json", digest(id.as_bytes())))
}
fn read_record(path: &Path) -> Result<LedgerRecord, String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| "No saved MCP receipt was found".to_string())?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() > MAX_RECORD_BYTES as u64
    {
        return Err("The saved MCP receipt is damaged or too large; do not resubmit it".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|f| {
            f.take((MAX_RECORD_BYTES + 1) as u64)
                .read_to_end(&mut bytes)
        })
        .map_err(|_| "Could not read the saved MCP receipt; do not resubmit it".to_string())?;
    serde_json::from_slice(&bytes)
        .map_err(|_| "The saved MCP receipt is incomplete; do not resubmit it".into())
}
fn sync_directory(root: &Path) -> Result<(), String> {
    fs::File::open(root)
        .and_then(|f| f.sync_all())
        .map_err(|_| {
            "Could not durably sync the MCP operation ledger; do not resubmit this request".into()
        })
}
fn claim(root: &Path, record: &LedgerRecord) -> Result<PathBuf, String> {
    ensure_ledger(root)?;
    if fs::read_dir(root)
        .map_err(|_| "Cannot inspect the MCP operation ledger".to_string())?
        .take(MAX_LEDGER_RECORDS + 1)
        .count()
        >= MAX_LEDGER_RECORDS
    {
        return Err("MCP receipt limit reached; no new tool was submitted".into());
    }
    let path = ledger_path(root, &record.request_id);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file=match options.open(&path){Ok(file)=>file,Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>{
        return match read_record(&path){Ok(existing) if existing.request_id==record.request_id&&existing.server_digest==record.server_digest&&existing.tool==record.tool&&existing.arguments_digest==record.arguments_digest=>Err("This request ID was already attempted. Look up its receipt; it will not be sent again.".into()),Ok(_)=>Err("This request ID is already bound to different server, tool, or arguments. It will not be sent again.".into()),Err(e)=>Err(e)}
    },Err(_)=>return Err("Cannot create a durable MCP operation record; no tool was submitted".into())};
    let bytes = serde_json::to_vec(record)
        .map_err(|_| "Cannot serialize the MCP operation record".to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| {
            "Cannot durably save the MCP operation record; do not resubmit this ID".to_string()
        })?;
    sync_directory(root)?;
    Ok(path)
}
fn finish_record(root: &Path, path: &Path, record: &LedgerRecord) -> Result<(), String> {
    let bytes =
        serde_json::to_vec(record).map_err(|_| "Cannot encode the MCP receipt".to_string())?;
    if bytes.len() > MAX_RECORD_BYTES {
        return Err("MCP receipt exceeded its saved size limit".into());
    }
    let mut temporary = tempfile::NamedTempFile::new_in(root)
        .map_err(|_| "Cannot create a durable MCP receipt".to_string())?;
    temporary
        .write_all(&bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|_| {
            "Cannot save the MCP receipt; inspect the target before retrying".to_string()
        })?;
    temporary.persist(path).map_err(|_| {
        "Cannot finalize the MCP receipt; inspect the target before retrying".to_string()
    })?;
    sync_directory(root)
}
enum Transport {
    Http {
        endpoint: reqwest::Url,
        token: Option<String>,
        session_id: Option<String>,
        protocol: String,
    },
    Stdio {
        child: Child,
        input: ChildStdin,
        output: BufReader<ChildStdout>,
    },
}

pub async fn status() -> Json<Value> {
    let blender = executable("blender").or_else(|| {
        [
            PathBuf::from("/Applications/Blender.app/Contents/MacOS/Blender"),
            std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_default()
                .join("Applications/Blender.app/Contents/MacOS/Blender"),
        ]
        .into_iter()
        .find(|path| path.is_file())
    });
    Json(
        json!({"blender":{"installed":blender.is_some()},"tripo":{"installed":executable("tripo").is_some()},
        "mcp":{"installed":blender_server().is_some(),"transports":["http","blender-stdio"]},
        "note":"Installed means found in standard locations, not signed in or connected. No installer or provider request was run."}),
    )
}
fn blender_server() -> Option<PathBuf> {
    executable("mcp-for-blender").or_else(|| executable("blender-mcp"))
}
fn local_endpoint(value: &str) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(value).map_err(|_| "Enter a valid local MCP endpoint")?;
    let local = matches!(
        url.host_str(),
        Some("127.0.0.1" | "localhost" | "[::1]" | "::1")
    );
    if url.scheme() != "http"
        || !local
        || url.username() != ""
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port().is_none_or(|port| port < 1024 || port == 4319)
    {
        return Err("Use an explicit http://127.0.0.1:PORT/mcp endpoint (port 1024–65535, other than 4319), without credentials or query parameters".into());
    }
    // A loopback name never goes through an environment-configured DNS server.
    if url.host_str() == Some("localhost") {
        url.set_host(Some("127.0.0.1"))
            .map_err(|_| "Invalid local host")?;
    }
    Ok(url)
}
fn rpc_result(value: Value, id: &str) -> Result<Option<Value>, String> {
    if value.get("id").and_then(Value::as_str) != Some(id) {
        return Ok(None);
    }
    if let Some(failure) = value.get("error") {
        return Err(failure
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("The MCP server rejected the request")
            .chars()
            .take(1200)
            .collect());
    }
    value
        .get("result")
        .cloned()
        .map(Some)
        .ok_or_else(|| "MCP response has no result".into())
}
async fn response_value(mut response: reqwest::Response, id: &str) -> Result<Value, String> {
    if !response.status().is_success() {
        return Err(format!(
            "MCP server returned HTTP {}",
            response.status().as_u16()
        ));
    }
    let sse = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/event-stream"));
    let mut data = Vec::new();
    let mut offset = 0;
    let mut event = String::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "MCP response was interrupted; its operation may still be running")?
    {
        if data.len() + chunk.len() > MAX_RESPONSE {
            return Err(
                "MCP result exceeded 16 MiB; save large assets through the tool's own file output"
                    .into(),
            );
        }
        data.extend_from_slice(&chunk);
        if sse {
            while let Some(end) = data[offset..].iter().position(|byte| *byte == b'\n') {
                let line = std::str::from_utf8(&data[offset..offset + end])
                    .map_err(|_| "MCP returned invalid UTF-8")?
                    .trim_end_matches('\r');
                offset += end + 1;
                if line.is_empty() {
                    if !event.is_empty() {
                        if let Ok(value) = serde_json::from_str::<Value>(&event) {
                            if let Some(result) = rpc_result(value, id)? {
                                return Ok(result);
                            }
                        }
                        event.clear();
                    }
                } else if let Some(text) = line.strip_prefix("data:") {
                    if !event.is_empty() {
                        event.push('\n');
                    }
                    event.push_str(text.trim_start());
                }
            }
        }
    }
    if sse {
        if let Ok(value) = serde_json::from_str::<Value>(&event) {
            if let Some(result) = rpc_result(value, id)? {
                return Ok(result);
            }
        }
        Err("MCP stream ended without the matching result; do not automatically repeat a changing operation".into())
    } else {
        let value =
            serde_json::from_slice(&data).map_err(|_| "The endpoint did not return MCP JSON")?;
        rpc_result(value, id)?
            .ok_or_else(|| "The endpoint returned an unrelated MCP response".into())
    }
}
async fn limited_line(reader: &mut BufReader<ChildStdout>) -> Result<Vec<u8>, String> {
    let mut line = Vec::new();
    loop {
        let available = reader
            .fill_buf()
            .await
            .map_err(|_| "The MCP subprocess output failed")?;
        if available.is_empty() {
            return Err("The MCP subprocess ended before returning a result".into());
        }
        let length = available
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|index| index + 1)
            .unwrap_or(available.len());
        if line.len() + length > MAX_RESPONSE {
            return Err("MCP subprocess result exceeded 16 MiB".into());
        }
        let complete = available[length - 1] == b'\n';
        line.extend_from_slice(&available[..length]);
        reader.consume(length);
        if complete {
            return Ok(line);
        }
    }
}
impl Transport {
    async fn send(
        &mut self,
        method: &str,
        params: Value,
        notification: bool,
    ) -> Result<Value, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let message = if notification {
            json!({"jsonrpc":"2.0","method":method,"params":params})
        } else {
            json!({"jsonrpc":"2.0","id":id,"method":method,"params":params})
        };
        match self {
            Transport::Http {
                endpoint,
                token,
                session_id,
                protocol,
            } => {
                let client = reqwest::Client::builder()
                    .no_proxy()
                    .redirect(reqwest::redirect::Policy::none())
                    .connect_timeout(Duration::from_secs(5))
                    .timeout(Duration::from_secs(120))
                    .build()
                    .map_err(|_| "Could not initialize MCP HTTP client")?;
                let mut request = client
                    .post(endpoint.clone())
                    .header("Accept", "application/json, text/event-stream")
                    .header("MCP-Protocol-Version", protocol.as_str())
                    .json(&message);
                if let Some(token) = token.as_ref() {
                    request = request.bearer_auth(token);
                }
                if let Some(session) = session_id.as_ref() {
                    request = request.header("Mcp-Session-Id", session);
                }
                let response=request.send().await.map_err(|_|"Cannot reach the local MCP endpoint. Start its server first; a timed-out operation may still be running.")?;
                if let Some(value) = response
                    .headers()
                    .get("Mcp-Session-Id")
                    .and_then(|v| v.to_str().ok())
                {
                    *session_id = Some(value.to_string());
                }
                if notification {
                    if response.status().is_success() {
                        Ok(json!({}))
                    } else {
                        Err("MCP server rejected initialization notification".into())
                    }
                } else {
                    response_value(response, &id).await
                }
            }
            Transport::Stdio {
                child,
                input,
                output,
            } => {
                if child
                    .try_wait()
                    .map_err(|_| "Cannot inspect MCP subprocess")?
                    .is_some()
                {
                    return Err("The MCP subprocess is no longer running".into());
                }
                input
                    .write_all(format!("{message}\n").as_bytes())
                    .await
                    .map_err(|_| "Cannot write to MCP subprocess")?;
                input
                    .flush()
                    .await
                    .map_err(|_| "Cannot flush MCP subprocess input")?;
                if notification {
                    return Ok(json!({}));
                }
                tokio::time::timeout(Duration::from_secs(120),async {
                    loop {
                        let line=limited_line(output).await?;
                        let value:Value=serde_json::from_slice(&line).map_err(|_|"MCP subprocess wrote a non-JSON protocol message")?;
                        if value.get("method").is_some() && value.get("id").is_some() {
                            let rejection=json!({"jsonrpc":"2.0","id":value["id"],"error":{"code":-32601,"message":"Frame does not support server-initiated client actions"}});
                            input.write_all(format!("{rejection}\n").as_bytes()).await.map_err(|_|"Cannot answer MCP subprocess")?;
                        } else if let Some(result)=rpc_result(value,&id)? {return Ok(result);}
                    }
                }).await.map_err(|_|"MCP operation timed out. It may still be running; inspect the application before retrying.")?
            }
        }
    }
}
async fn refresh(connection: &mut Connection) -> Result<Vec<Value>, String> {
    let mut tools = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..20 {
        let response = connection
            .transport
            .send(
                "tools/list",
                cursor
                    .as_ref()
                    .map(|v| json!({"cursor":v}))
                    .unwrap_or_else(|| json!({})),
                false,
            )
            .await?;
        let page = response
            .get("tools")
            .and_then(Value::as_array)
            .ok_or("MCP tools/list returned no tools array")?;
        for tool in page {
            let name = tool
                .get("name")
                .and_then(Value::as_str)
                .ok_or("MCP tool has no name")?;
            if name.len() > 256 || !tool.get("inputSchema").is_some_and(Value::is_object) {
                return Err("MCP tool definition is invalid".into());
            }
            tools.push(tool.clone());
            if tools.len() > 1000 {
                return Err("MCP server advertises more than 1,000 tools".into());
            }
        }
        cursor = response
            .get("nextCursor")
            .and_then(Value::as_str)
            .map(str::to_string);
        if cursor.is_none() {
            break;
        }
    }
    if cursor.is_some() {
        return Err("MCP tool list has too many pages".into());
    }
    connection.tool_names = tools
        .iter()
        .filter_map(|v| v["name"].as_str().map(str::to_string))
        .collect();
    Ok(tools)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RegisterProfile { profile: super::mcp_profiles::ProfileInput, reviewed: bool }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RemoveProfile { id: String }
pub async fn profiles(State(state): State<AppState>) -> Response {
    if let Some(message)=state.mcp_profiles.error() { return error(StatusCode::BAD_REQUEST,message); }
    Json(json!({"profiles":state.mcp_profiles.list()})).into_response()
}
pub async fn register_profile(State(state): State<AppState>, Json(request): Json<RegisterProfile>) -> Response {
    if !request.reviewed { return error(StatusCode::BAD_REQUEST,"Review the exact local executable and arguments before saving this trusted server"); }
    match state.mcp_profiles.save(request.profile) {
        Ok(profile) => Json(json!({"profile":profile})).into_response(),
        Err(message) => error(StatusCode::BAD_REQUEST,&message),
    }
}
pub async fn remove_profile(State(state): State<AppState>, Json(request): Json<RemoveProfile>) -> Response {
    match state.mcp_profiles.remove(&request.id) {
        Ok(()) => Json(json!({"removed":true})).into_response(),
        Err(message) => error(StatusCode::BAD_REQUEST,&message),
    }
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct ConnectRequest {
    transport: String,
    endpoint: Option<String>,
    token: Option<String>,
    profile_id: Option<String>,
}
pub async fn connect(
    State(state): State<AppState>,
    Json(request): Json<ConnectRequest>,
) -> Response {
    let result=async {
        if state.integrations.sessions.lock().await.len()>=8{return Err("Disconnect an existing MCP server before adding another".into());}
        let mut profile_binding=None;
        let (transport,binding)=match request.transport.as_str(){
            "http"=>{let endpoint=local_endpoint(request.endpoint.as_deref().unwrap_or(""))?;let binding=json!({"transport":"http","endpoint":endpoint.as_str()});(Transport::Http{endpoint,token:request.token.filter(|v|!v.is_empty()),session_id:None,protocol:PROTOCOL.into()},binding)},
            "blender-stdio"=>{
                let executable=blender_server().ok_or("A preinstalled mcp-for-blender or blender-mcp executable was not found. Install and configure it yourself first; Frame never downloads it automatically.")?;
                let binding=json!({"transport":"blender-stdio","executable":executable.to_string_lossy()});
                let mut child=Command::new(executable).env("BLENDER_HOST","127.0.0.1").env("BLENDER_PORT","9876").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true).spawn().map_err(|_|"Could not launch the installed Blender MCP server")?;
                let input=child.stdin.take().ok_or("MCP stdin unavailable")?;let output=BufReader::new(child.stdout.take().ok_or("MCP stdout unavailable")?);
                (Transport::Stdio{child,input,output},binding)
            },
            "custom-stdio"=>{
                let profile=state.mcp_profiles.get(request.profile_id.as_deref().unwrap_or("")).ok_or("Select a saved local server profile")?;
                if !super::cli::executable_file(Path::new(&profile.executable)){return Err("The reviewed server executable is no longer available".into());}
                let resolved=std::fs::canonicalize(&profile.executable).map_err(|_|"The reviewed server executable is no longer available")?;
                if resolved.to_str()!=Some(profile.resolved_executable.as_str()){return Err("The reviewed server executable now points somewhere else. Review and save the profile again.".into());}
                let binding=json!({"transport":"custom-stdio","profile":profile.id,"revision":profile.revision,"executable":profile.executable,"resolvedExecutable":resolved.to_string_lossy(),"args":profile.args});
                profile_binding=Some((profile.id.clone(),profile.revision.clone()));
                let mut child=Command::new(&profile.executable).args(&profile.args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true).spawn().map_err(|_|"Could not launch the reviewed MCP server")?;
                let input=child.stdin.take().ok_or("MCP stdin unavailable")?;let output=BufReader::new(child.stdout.take().ok_or("MCP stdout unavailable")?);
                (Transport::Stdio{child,input,output},binding)
            },
            _=>return Err("Choose a supported local MCP connection".into()),
        };
        let mut connection=Connection{transport,tool_names:HashSet::new(),server_info:json!({}),server_digest:String::new(),profile_binding};
        let initialized=connection.transport.send("initialize",json!({"protocolVersion":PROTOCOL,"capabilities":{},"clientInfo":{"name":"Frame","version":"2.0.0"}}),false).await?;
        connection.server_info=initialized.get("serverInfo").cloned().ok_or("MCP initialize returned no server identity")?;
        let mut server_binding=binding;
        server_binding["serverInfo"]=connection.server_info.clone();
        connection.server_digest=digest(&serde_json::to_vec(&server_binding).map_err(|_|"Cannot identify the MCP server")?);
        if let Transport::Http{protocol,..}=&mut connection.transport { *protocol=initialized["protocolVersion"].as_str().ok_or("MCP initialize returned no protocol version")?.to_string(); }
        connection.transport.send("notifications/initialized",json!({}),true).await?;
        ensure_profile_current(&state,&connection)?;
        let tools=refresh(&mut connection).await?;ensure_profile_current(&state,&connection)?;let id=uuid::Uuid::new_v4().to_string();let info=connection.server_info.clone();let fingerprint=connection.server_digest.clone();
        state.integrations.sessions.lock().await.insert(id.clone(),Arc::new(Mutex::new(connection)));
        Ok::<_,String>(json!({"connectionId":id,"status":"connected","serverInfo":info,"tools":tools,"serverFingerprint":fingerprint}))
    }.await;
    match result {
        Ok(value) => Json(value).into_response(),
        Err(message) => error(StatusCode::BAD_REQUEST, &message),
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRequest {
    connection_id: String,
}
async fn session(state: &AppState, id: &str) -> Result<Arc<Mutex<Connection>>, String> {
    state
        .integrations
        .sessions
        .lock()
        .await
        .get(id)
        .cloned()
        .ok_or_else(|| "MCP connection expired or disconnected; connect again".into())
}
fn ensure_profile_current(state:&AppState,connection:&Connection)->Result<(),String>{
    if let Some((id,revision))=&connection.profile_binding {
        if !state.mcp_profiles.get(id).is_some_and(|p| &p.revision==revision && std::fs::canonicalize(&p.executable).ok().and_then(|path|path.to_str().map(str::to_owned)).as_deref()==Some(p.resolved_executable.as_str())) {
            return Err("This server profile changed or was removed. Reconnect and review its tools again.".into());
        }
    }
    Ok(())
}
pub async fn tools(
    State(state): State<AppState>,
    Json(request): Json<ConnectionRequest>,
) -> Response {
    let result = async {
        let connection = session(&state, &request.connection_id).await?;
        let mut connection = connection.lock().await;
        ensure_profile_current(&state,&connection)?;
        refresh(&mut connection).await
    }
    .await;
    match result {
        Ok(tools) => Json(json!({"tools":tools})).into_response(),
        Err(message) => error(StatusCode::BAD_REQUEST, &message),
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CallRequest {
    connection_id: String,
    name: String,
    arguments: Value,
    request_id: String,
    approved: bool,
}
pub async fn call(State(state): State<AppState>, Json(request): Json<CallRequest>) -> Response {
    if !request.approved
        || !request.arguments.is_object()
        || request.request_id.is_empty()
        || request.request_id.len() > 200
    {
        return error(
            StatusCode::BAD_REQUEST,
            "Review the selected tool and its JSON arguments, then explicitly run it",
        );
    }
    let result=async {
        let connection=session(&state,&request.connection_id).await?;
        let mut connection=connection.lock().await;
        ensure_profile_current(&state,&connection)?;
        if !connection.tool_names.contains(&request.name){return Err("Select a tool from the current server's discovered tool list".into())}
        let arguments=serde_json::to_vec(&request.arguments).map_err(|_|"Invalid tool arguments".to_string())?;
        if arguments.len()>4*1024*1024{return Err("Tool arguments exceed the size limit".into())}
        let root=state.integrations.ledger_dir.as_ref().map_err(Clone::clone)?;
        let now=now_ms();let mut record=LedgerRecord{version:1,request_id:request.request_id.clone(),server_digest:connection.server_digest.clone(),tool:request.name.clone(),arguments_digest:digest(&arguments),status:"unknown".into(),created_at:now,updated_at:now,result:None,result_omitted:false};
        let path=claim(root,&record)?;
        let response=connection.transport.send("tools/call",json!({"name":request.name,"arguments":request.arguments}),false).await;
        match response {
            Ok(value)=>{
                record.status=if value.get("isError").and_then(Value::as_bool)==Some(true){"failed"}else{"succeeded"}.into();record.updated_at=now_ms();
                if serde_json::to_vec(&value).map_err(|_|"Cannot encode MCP result".to_string())?.len()<=MAX_RECEIPT_BYTES {record.result=Some(value.clone())}else{record.result_omitted=true}
                finish_record(root,&path,&record)?;Ok(value)
            },
            Err(message)=>Err(format!("{message} Outcome is unknown; look up the saved receipt and inspect the target before retrying.")),
        }
    }.await;
    match result {
        Ok(result) => Json(json!({"requestId":request.request_id,"result":result})).into_response(),
        Err(message) => error(StatusCode::BAD_REQUEST, &message),
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReceiptRequest {
    request_id: String,
}
pub async fn receipt(
    State(state): State<AppState>,
    Json(request): Json<ReceiptRequest>,
) -> Response {
    if request.request_id.is_empty() || request.request_id.len() > 200 {
        return error(
            StatusCode::BAD_REQUEST,
            "A valid MCP request ID is required",
        );
    }
    let result = (|| {
        let root = state
            .integrations
            .ledger_dir
            .as_ref()
            .map_err(Clone::clone)?;
        ensure_ledger(root)?;
        let record = read_record(&ledger_path(root, &request.request_id))?;
        if record.request_id != request.request_id {
            return Err("The saved MCP receipt does not match this request".to_string());
        }
        Ok::<_, String>(record)
    })();
    match result{Ok(record)=>Json(json!({"requestId":record.request_id,"status":record.status,"tool":record.tool,"createdAt":record.created_at,"updatedAt":record.updated_at,"result":record.result,"resultOmitted":record.result_omitted})).into_response(),Err(message)=>error(StatusCode::BAD_REQUEST,&message)}
}
pub async fn disconnect(
    State(state): State<AppState>,
    Json(request): Json<ConnectionRequest>,
) -> Json<Value> {
    let removed = state
        .integrations
        .sessions
        .lock()
        .await
        .remove(&request.connection_id);
    if let Some(connection) = removed {
        let mut connection = connection.lock().await;
        if let Transport::Stdio { child, .. } = &mut connection.transport {
            let _ = child.kill().await;
        }
    }
    Json(json!({"disconnected":true}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn endpoints_stay_on_explicit_loopback_ports() {
        for url in [
            "https://example.com/mcp",
            "http://169.254.169.254:8080/mcp",
            "http://localhost:4319/generate",
            "http://localhost:8000/mcp?token=secret",
            "http://user:pass@localhost:8000/mcp",
            "http://localhost/mcp",
        ] {
            assert!(local_endpoint(url).is_err());
        }
        assert!(local_endpoint("http://127.0.0.1:8000/mcp").is_ok());
        assert!(local_endpoint("http://[::1]:8000/mcp").is_ok());
    }
    #[test]
    fn rpc_requires_matching_id_and_preserves_errors() {
        assert!(
            rpc_result(json!({"jsonrpc":"2.0","id":"different","result":{}}), "id")
                .unwrap()
                .is_none()
        );
        assert!(rpc_result(
            json!({"jsonrpc":"2.0","id":"id","error":{"message":"Tool refused"}}),
            "id"
        )
        .is_err());
        assert_eq!(
            rpc_result(
                json!({"jsonrpc":"2.0","id":"id","result":{"isError":true,"content":[]}}),
                "id"
            )
            .unwrap()
            .unwrap()["isError"],
            true
        );
    }
    #[tokio::test]
    async fn reviewed_stdio_profile_discovers_calls_and_revokes_after_edit() {
        use axum::body::{to_bytes, Body};
        use axum::http::Request;
        use tower::ServiceExt;
        let temp=tempfile::tempdir().unwrap();
        let script=temp.path().join("mcp_fixture.py");
        std::fs::write(&script, r#"import sys, json
for line in sys.stdin:
    msg=json.loads(line)
    if 'id' not in msg: continue
    method=msg.get('method')
    if method=='initialize': result={'protocolVersion':'2025-11-25','serverInfo':{'name':'Fixture','version':'1'},'capabilities':{'tools':{}}}
    elif method=='tools/list': result={'tools':[{'name':'pose','inputSchema':{'type':'object'}}]}
    elif method=='tools/call': result={'content':[{'type':'text','text':'posed'}]}
    else: result={}
    print(json.dumps({'jsonrpc':'2.0','id':msg['id'],'result':result}),flush=True)
"#).unwrap();
        let python=std::fs::canonicalize("/usr/bin/python3").unwrap();
        let mut state=AppState::new("fixture-token".into(),super::super::default_origins());
        state.integrations=Arc::new(Hub{sessions:Mutex::new(HashMap::new()),ledger_dir:Ok(temp.path().join("ledger"))});
        state.mcp_profiles=Arc::new(super::super::mcp_profiles::Registry::load(Some(temp.path().join("profiles.json"))));
        let app=super::super::router(state);
        let req=|path:&str, body:Value| Request::builder().method("POST").uri(path).header("origin","http://localhost:5173").header("authorization","Bearer fixture-token").header("content-type","application/json").body(Body::from(body.to_string())).unwrap();
        let profile=json!({"id":"cascadeur","name":"Cascadeur test","executable":python,"args":["-I",script]});
        let denied=app.clone().oneshot(req("/integrations/mcp/profiles",json!({"profile":profile,"reviewed":false}))).await.unwrap();
        assert_eq!(denied.status(),StatusCode::BAD_REQUEST);
        let saved=app.clone().oneshot(req("/integrations/mcp/profiles",json!({"profile":profile,"reviewed":true}))).await.unwrap();
        assert_eq!(saved.status(),StatusCode::OK);
        let connected=app.clone().oneshot(req("/integrations/mcp/connect",json!({"transport":"custom-stdio","profileId":"cascadeur"}))).await.unwrap();
        assert_eq!(connected.status(),StatusCode::OK);
        let value:Value=serde_json::from_slice(&to_bytes(connected.into_body(),MAX_RESPONSE).await.unwrap()).unwrap();
        assert_eq!(value["tools"][0]["name"],"pose");assert_eq!(value["serverFingerprint"].as_str().unwrap().len(),64);
        let id=value["connectionId"].as_str().unwrap();
        let response=app.clone().oneshot(req("/integrations/mcp/call",json!({"connectionId":id,"name":"pose","arguments":{},"requestId":"pose-once","approved":true}))).await.unwrap();
        assert_eq!(response.status(),StatusCode::OK);
        let duplicate=app.clone().oneshot(req("/integrations/mcp/call",json!({"connectionId":id,"name":"pose","arguments":{},"requestId":"pose-once","approved":true}))).await.unwrap();
        assert_eq!(duplicate.status(),StatusCode::BAD_REQUEST);
        let updated=app.clone().oneshot(req("/integrations/mcp/profiles",json!({"profile":profile,"reviewed":true}))).await.unwrap();
        assert_eq!(updated.status(),StatusCode::OK);
        let stale=app.clone().oneshot(req("/integrations/mcp/call",json!({"connectionId":id,"name":"pose","arguments":{},"requestId":"after-edit","approved":true}))).await.unwrap();
        assert_eq!(stale.status(),StatusCode::BAD_REQUEST);
        let text=String::from_utf8(to_bytes(stale.into_body(),MAX_RESPONSE).await.unwrap().to_vec()).unwrap();
        assert!(text.contains("profile changed"));
        let reconnected=app.clone().oneshot(req("/integrations/mcp/connect",json!({"transport":"custom-stdio","profileId":"cascadeur"}))).await.unwrap();
        assert_eq!(reconnected.status(),StatusCode::OK);
        let next:Value=serde_json::from_slice(&to_bytes(reconnected.into_body(),MAX_RESPONSE).await.unwrap()).unwrap();
        assert_ne!(value["serverFingerprint"],next["serverFingerprint"]);
    }
    #[tokio::test]
    async fn real_http_mcp_discovery_and_selected_call() {
        use axum::body::{to_bytes, Body};
        use axum::http::Request;
        use axum::{routing::post, Router};
        use tower::ServiceExt;
        let local=Router::new().route("/mcp",post(|Json(v):Json<Value>|async move {if v["method"]=="notifications/initialized"{return StatusCode::ACCEPTED.into_response();}if v["method"]=="tools/call"&&v["params"]["arguments"]["loseResponse"]==true{return StatusCode::SERVICE_UNAVAILABLE.into_response();}let result=match v["method"].as_str().unwrap_or(""){"initialize"=>json!({"protocolVersion":PROTOCOL,"serverInfo":{"name":"fixture","version":"1"},"capabilities":{"tools":{}}}),"tools/list"=>json!({"tools":[{"name":"scene_info","inputSchema":{"type":"object"}}]}),"tools/call"=>json!({"content":[{"type":"text","text":"fixture scene"}]}),_=>json!({})};Json(json!({"jsonrpc":"2.0","id":v["id"],"result":result})).into_response()}));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move { axum::serve(listener, local).await.unwrap() });
        let temp = tempfile::tempdir().unwrap();
        let mut state = AppState::new("fixture-token".into(), super::super::default_origins());
        state.integrations = Arc::new(Hub {
            sessions: Mutex::new(HashMap::new()),
            ledger_dir: Ok(temp.path().join("mcp-ledger")),
        });
        let app = super::super::router(state);
        let request = |path: &str, body: Value| {
            Request::builder()
                .method("POST")
                .uri(path)
                .header("origin", "http://localhost:5173")
                .header("authorization", "Bearer fixture-token")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap()
        };
        let response = app
            .clone()
            .oneshot(request(
                "/integrations/mcp/connect",
                json!({"transport":"http","endpoint":format!("http://127.0.0.1:{port}/mcp")}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let value: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), MAX_RESPONSE).await.unwrap())
                .unwrap();
        let id = value["connectionId"].as_str().unwrap();
        assert_eq!(value["tools"][0]["name"], "scene_info");
        let response=app.clone().oneshot(request("/integrations/mcp/call",json!({"connectionId":id,"name":"scene_info","arguments":{},"requestId":"one","approved":false}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let response=app.clone().oneshot(request("/integrations/mcp/call",json!({"connectionId":id,"name":"not-discovered","arguments":{},"requestId":"two","approved":true}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let response=app.clone().oneshot(request("/integrations/mcp/call",json!({"connectionId":id,"name":"scene_info","arguments":{},"requestId":"three","approved":true}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let response=app.clone().oneshot(request("/integrations/mcp/call",json!({"connectionId":id,"name":"scene_info","arguments":{},"requestId":"three","approved":true}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let response = app
            .clone()
            .oneshot(request(
                "/integrations/mcp/receipt",
                json!({"requestId":"three"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let saved: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), MAX_RESPONSE).await.unwrap())
                .unwrap();
        assert_eq!(saved["status"], "succeeded");
        assert_eq!(saved["result"]["content"][0]["text"], "fixture scene");
        let response=app.clone().oneshot(request("/integrations/mcp/call",json!({"connectionId":id,"name":"scene_info","arguments":{"loseResponse":true},"requestId":"uncertain","approved":true}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let response = app
            .clone()
            .oneshot(request(
                "/integrations/mcp/receipt",
                json!({"requestId":"uncertain"}),
            ))
            .await
            .unwrap();
        let uncertain: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), MAX_RESPONSE).await.unwrap())
                .unwrap();
        assert_eq!(uncertain["status"], "unknown");
        let mut restarted_state =
            AppState::new("fixture-token".into(), super::super::default_origins());
        restarted_state.integrations = Arc::new(Hub {
            sessions: Mutex::new(HashMap::new()),
            ledger_dir: Ok(temp.path().join("mcp-ledger")),
        });
        let restarted = super::super::router(restarted_state);
        let response = restarted
            .clone()
            .oneshot(request(
                "/integrations/mcp/connect",
                json!({"transport":"http","endpoint":format!("http://127.0.0.1:{port}/mcp")}),
            ))
            .await
            .unwrap();
        let connected: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), MAX_RESPONSE).await.unwrap())
                .unwrap();
        let new_id = connected["connectionId"].as_str().unwrap();
        let response=restarted.clone().oneshot(request("/integrations/mcp/call",json!({"connectionId":new_id,"name":"scene_info","arguments":{},"requestId":"three","approved":true}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let response=restarted.clone().oneshot(request("/integrations/mcp/call",json!({"connectionId":new_id,"name":"scene_info","arguments":{"changed":true},"requestId":"three","approved":true}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let message: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), MAX_RESPONSE).await.unwrap())
                .unwrap();
        assert!(message["error"].as_str().unwrap().contains("different"));
        let response=restarted.clone().oneshot(request("/integrations/mcp/call",json!({"connectionId":new_id,"name":"scene_info","arguments":{"loseResponse":true},"requestId":"uncertain","approved":true}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let response = restarted
            .clone()
            .oneshot(request(
                "/integrations/mcp/receipt",
                json!({"requestId":"uncertain"}),
            ))
            .await
            .unwrap();
        let uncertain: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), MAX_RESPONSE).await.unwrap())
                .unwrap();
        assert_eq!(uncertain["status"], "unknown");
        let response = restarted
            .oneshot(request(
                "/integrations/mcp/receipt",
                json!({"requestId":"three"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        server.abort();
    }
    fn fixture_record(id: &str) -> LedgerRecord {
        LedgerRecord {
            version: 1,
            request_id: id.into(),
            server_digest: digest(b"server"),
            tool: "scene_info".into(),
            arguments_digest: digest(br#"{"x":1}"#),
            status: "unknown".into(),
            created_at: 1,
            updated_at: 1,
            result: None,
            result_omitted: false,
        }
    }
    #[test]
    fn persistent_claims_fail_closed_across_restarts_and_changes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("ledger");
        let first = fixture_record("request-1");
        let path = claim(&root, &first).unwrap();
        assert_eq!(read_record(&path).unwrap().status, "unknown");
        assert!(claim(&root, &fixture_record("request-1"))
            .unwrap_err()
            .contains("already attempted"));
        let mut changed = fixture_record("request-1");
        changed.arguments_digest = digest(b"different arguments");
        assert!(claim(&root, &changed).unwrap_err().contains("different"));
        changed.arguments_digest = first.arguments_digest.clone();
        changed.server_digest = digest(b"different server");
        assert!(claim(&root, &changed).unwrap_err().contains("different"));
        changed.server_digest = first.server_digest.clone();
        changed.tool = "another_tool".into();
        assert!(claim(&root, &changed).unwrap_err().contains("different"));
        let bytes = fs::read(&path).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("different arguments"));
        let mut done = first;
        done.status = "succeeded".into();
        done.result = Some(json!({"content":[{"type":"text","text":"saved"}]}));
        finish_record(&root, &path, &done).unwrap();
        let recovered = read_record(&path).unwrap();
        assert_eq!(recovered.status, "succeeded");
        assert_eq!(recovered.result.unwrap()["content"][0]["text"], "saved");
    }
    #[test]
    fn simultaneous_claims_and_damaged_receipts_never_dispatch_twice() {
        use std::sync::{Arc as StdArc, Barrier};
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("ledger");
        ensure_ledger(&root).unwrap();
        let barrier = StdArc::new(Barrier::new(3));
        let workers = (0..2)
            .map(|_| {
                let root = root.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    claim(&root, &fixture_record("same-id")).is_ok()
                })
            })
            .collect::<Vec<_>>();
        barrier.wait();
        assert_eq!(
            workers
                .into_iter()
                .map(|w| w.join().unwrap())
                .filter(|ok| *ok)
                .count(),
            1
        );
        let broken = ledger_path(&root, "broken-id");
        fs::write(&broken, b"{").unwrap();
        assert!(claim(&root, &fixture_record("broken-id"))
            .unwrap_err()
            .contains("incomplete"));
        assert_eq!(fs::read(&broken).unwrap(), b"{");
    }
}
