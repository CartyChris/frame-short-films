//! Explicitly operated local MCP connections. No model can select or invoke tools
//! through the generation endpoint, and no executable or shell text is accepted.
use super::{error, executable, AppState};
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    process::Stdio,
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};

const PROTOCOL: &str = "2025-11-25";
const MAX_RESPONSE: usize = 16 * 1024 * 1024;

#[derive(Default)]
pub struct Hub {
    sessions: Mutex<HashMap<String, Arc<Mutex<Connection>>>>,
}
struct Connection {
    transport: Transport,
    tool_names: HashSet<String>,
    server_info: Value,
    request_ids: HashSet<String>,
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
pub struct ConnectRequest {
    transport: String,
    endpoint: Option<String>,
    token: Option<String>,
}
pub async fn connect(
    State(state): State<AppState>,
    Json(request): Json<ConnectRequest>,
) -> Response {
    let result=async {
        if state.integrations.sessions.lock().await.len()>=8{return Err("Disconnect an existing MCP server before adding another".into());}
        let transport=match request.transport.as_str(){
            "http"=>Transport::Http{endpoint:local_endpoint(request.endpoint.as_deref().unwrap_or(""))?,token:request.token.filter(|v|!v.is_empty()),session_id:None,protocol:PROTOCOL.into()},
            "blender-stdio"=>{
                let executable=blender_server().ok_or("A preinstalled mcp-for-blender or blender-mcp executable was not found. Install and configure it yourself first; Frame never downloads it automatically.")?;
                let mut child=Command::new(executable).env("BLENDER_HOST","127.0.0.1").env("BLENDER_PORT","9876").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true).spawn().map_err(|_|"Could not launch the installed Blender MCP server")?;
                let input=child.stdin.take().ok_or("MCP stdin unavailable")?;let output=BufReader::new(child.stdout.take().ok_or("MCP stdout unavailable")?);
                Transport::Stdio{child,input,output}
            },
            _=>return Err("Choose local Streamable HTTP or the installed Blender MCP executable".into()),
        };
        let mut connection=Connection{transport,tool_names:HashSet::new(),server_info:json!({}),request_ids:HashSet::new()};
        let initialized=connection.transport.send("initialize",json!({"protocolVersion":PROTOCOL,"capabilities":{},"clientInfo":{"name":"Frame","version":"2.0.0"}}),false).await?;
        connection.server_info=initialized.get("serverInfo").cloned().ok_or("MCP initialize returned no server identity")?;
        if let Transport::Http{protocol,..}=&mut connection.transport { *protocol=initialized["protocolVersion"].as_str().ok_or("MCP initialize returned no protocol version")?.to_string(); }
        connection.transport.send("notifications/initialized",json!({}),true).await?;
        let tools=refresh(&mut connection).await?;let id=uuid::Uuid::new_v4().to_string();let info=connection.server_info.clone();
        state.integrations.sessions.lock().await.insert(id.clone(),Arc::new(Mutex::new(connection)));
        Ok::<_,String>(json!({"connectionId":id,"status":"connected","serverInfo":info,"tools":tools}))
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
pub async fn tools(
    State(state): State<AppState>,
    Json(request): Json<ConnectionRequest>,
) -> Response {
    let result = async {
        let connection = session(&state, &request.connection_id).await?;
        let mut connection = connection.lock().await;
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
    let result = async {
        let connection = session(&state, &request.connection_id).await?;
        let mut connection = connection.lock().await;
        if !connection.tool_names.contains(&request.name) {
            return Err("Select a tool from the current server's discovered tool list".into());
        }
        if !connection.request_ids.insert(request.request_id.clone()) {
            return Err("This call ID was already submitted. It will not be repeated; inspect the tool's state.".into());
        }
        if connection.request_ids.len()>10000 {return Err("Reconnect before making more tool calls in this session".into());}
        connection
            .transport
            .send(
                "tools/call",
                json!({"name":request.name,"arguments":request.arguments}),
                false,
            )
            .await
    }
    .await;
    match result {
        Ok(result) => Json(json!({"requestId":request.request_id,"result":result})).into_response(),
        Err(message) => error(StatusCode::BAD_REQUEST, &message),
    }
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
    async fn real_http_mcp_discovery_and_selected_call() {
        use axum::body::{to_bytes, Body};
        use axum::http::Request;
        use axum::{routing::post, Router};
        use tower::ServiceExt;
        let local=Router::new().route("/mcp",post(|Json(v):Json<Value>|async move {if v["method"]=="notifications/initialized"{return StatusCode::ACCEPTED.into_response();}let result=match v["method"].as_str().unwrap_or(""){"initialize"=>json!({"protocolVersion":PROTOCOL,"serverInfo":{"name":"fixture","version":"1"},"capabilities":{"tools":{}}}),"tools/list"=>json!({"tools":[{"name":"scene_info","inputSchema":{"type":"object"}}]}),"tools/call"=>json!({"content":[{"type":"text","text":"fixture scene"}]}),_=>json!({})};Json(json!({"jsonrpc":"2.0","id":v["id"],"result":result})).into_response()}));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move { axum::serve(listener, local).await.unwrap() });
        let app = super::super::router(AppState::new(
            "fixture-token".into(),
            super::super::default_origins(),
        ));
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
        let response=app.oneshot(request("/integrations/mcp/call",json!({"connectionId":id,"name":"scene_info","arguments":{},"requestId":"three","approved":true}))).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        server.abort();
    }
}
