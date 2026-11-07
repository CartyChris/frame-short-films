//! Local Ollama connection. No caller-controlled address, model downloads, or shell execution.
use super::*;
const BASE:&str="http://127.0.0.1:11434";
fn client()->Result<reqwest::Client,String>{reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(3)).build().map_err(|_|"Could not initialize the local Ollama connection".into())}
async fn models_at(base:&str)->Result<Value,String>{
 let mut response=client()?.get(format!("{base}/api/tags")).timeout(Duration::from_secs(10)).send().await.map_err(|_|"Ollama did not respond on 127.0.0.1:11434. Start Ollama and try again.")?;
 if !response.status().is_success(){return Err("Ollama could not list its installed models.".into())}
 let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"Ollama model list ended unexpectedly")?{if bytes.len()+chunk.len()>2*1024*1024{return Err("Ollama model list exceeds 2 MiB".into())}bytes.extend_from_slice(&chunk)}
 let data:Value=serde_json::from_slice(&bytes).map_err(|_|"Ollama returned an invalid model list")?;
 let models=data["models"].as_array().ok_or("Ollama did not return a model list")?.iter().take(2000).filter_map(|v|v["name"].as_str()).filter(|v|!v.is_empty()&&v.len()<=200&&!v.chars().any(char::is_control)).map(|v|json!({"id":v,"name":v})).collect::<Vec<_>>();
 Ok(json!({"models":models}))
}
pub async fn models()->Response{match models_at(BASE).await{Ok(v)=>Json(v).into_response(),Err(e)=>error(StatusCode::SERVICE_UNAVAILABLE,&e)}}
fn validate(request:&GenerateRequest)->Result<Vec<Value>,String>{
 prompt(request)?;if request.model.trim().is_empty()||request.model.len()>200||request.model.chars().any(char::is_control){return Err("Choose an installed Ollama model.".into())}
 Ok(request.messages.iter().map(|m|json!({"role":if m.role=="developer"{"system"}else{&m.role},"content":m.content})).collect())
}
async fn chat_at(base:&str,request:GenerateRequest,permit:tokio::sync::OwnedSemaphorePermit)->Response{
 let messages=match validate(&request){Ok(m)=>m,Err(e)=>return error(StatusCode::BAD_REQUEST,&e)};
 let response=match client(){Ok(c)=>c.post(format!("{base}/api/chat")).json(&json!({"model":request.model,"messages":messages,"stream":true,"think":request.think,"options":{"num_predict":request.max_tokens.unwrap_or(16000).clamp(1,200000),"temperature":request.temperature.filter(|n|n.is_finite()).unwrap_or(0.75).clamp(0.0,2.0)}})).send().await,Err(e)=>return error(StatusCode::INTERNAL_SERVER_ERROR,&e)};
 let mut response=match response{Ok(r)=>r,Err(_)=>return error(StatusCode::SERVICE_UNAVAILABLE,"Ollama did not respond. Start its local service and check the selected model.")};
 if !response.status().is_success(){let status=response.status();let detail=response.text().await.unwrap_or_default();let parsed=serde_json::from_str::<Value>(&detail).ok().and_then(|v|v["error"].as_str().map(|s|s.chars().take(500).collect::<String>())).unwrap_or_else(||format!("Ollama returned HTTP {status}"));return error(StatusCode::BAD_GATEWAY,&parsed)}
 let (tx,rx)=mpsc::channel::<Result<Bytes,Infallible>>(16);
 tokio::spawn(async move {let _permit=permit;let mut buffer=Vec::new();let timeout=tokio::time::sleep(Duration::from_secs(3600));tokio::pin!(timeout);loop{let chunk=tokio::select!{_=tx.closed()=>return,_=&mut timeout=>{let _=send(&tx,json!({"type":"error","message":"Ollama reached the one-hour limit. Received text is saved."})).await;return},chunk=response.chunk()=>chunk};match chunk{
  Ok(Some(chunk))=>{buffer.extend_from_slice(&chunk);if buffer.len()>2*1024*1024{let _=send(&tx,json!({"type":"error","message":"An Ollama response exceeded the event limit. Received text is saved."})).await;return}while let Some(i)=buffer.iter().position(|b|*b==b'\n'){let line:Vec<u8>=buffer.drain(..=i).collect();if line.iter().all(|b|b.is_ascii_whitespace()){continue}let v:Value=match serde_json::from_slice(&line){Ok(v)=>v,Err(_)=>{let _=send(&tx,json!({"type":"error","message":"Ollama returned an invalid response. Received text is saved."})).await;return}};if let Some(e)=v["error"].as_str(){let _=send(&tx,json!({"type":"error","message":e.chars().take(500).collect::<String>()})).await;return}if let Some(text)=v["message"]["content"].as_str().filter(|s|!s.is_empty()){if send(&tx,json!({"type":"delta","text":text})).await.is_err(){return}}if v["done"]==true{let reason=v["done_reason"].as_str().unwrap_or("stop");let _=send(&tx,json!({"type":"done","finishReason":reason})).await;return}}},
  _=>{let _=send(&tx,json!({"type":"error","message":"Ollama disconnected before completion. Received text is saved."})).await;return}
 }}});
 let mut out=Body::from_stream(ReceiverStream::new(rx)).into_response();out.headers_mut().insert("content-type",HeaderValue::from_static("application/x-ndjson; charset=utf-8"));out
}
pub async fn generate(state:AppState,request:GenerateRequest,permit:tokio::sync::OwnedSemaphorePermit)->Response{let _=state;chat_at(BASE,request,permit).await}

#[cfg(test)]
mod tests {
 use super::*;
 use axum::{routing::{get,post},Router};
 use std::collections::HashSet;
 async fn fixture() -> String {
  let router=Router::new().route("/api/tags",get(||async{Json(json!({"models":[{"name":"local-model"}]}))})).route("/api/chat",post(|Json(body):Json<Value>|async move{
   assert_eq!(body["model"],"local-model");assert_eq!(body["stream"],true);assert_eq!(body["messages"][0]["role"],"system");
   ([("content-type","application/x-ndjson")],"{\"message\":{\"content\":\"Hello\"},\"done\":false}\n{\"message\":{\"content\":\" world\"},\"done\":true,\"done_reason\":\"stop\"}\n")
  }));let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();tokio::spawn(async move{axum::serve(listener,router).await.unwrap()});format!("http://{address}")
 }
 #[tokio::test] async fn local_catalog_and_stream_translate_without_cli_or_download(){let base=fixture().await;assert_eq!(models_at(&base).await.unwrap()["models"][0]["id"],"local-model");let state=AppState::new("token".into(),HashSet::new());let permit=state.slots.clone().acquire_owned().await.unwrap();let request=GenerateRequest{provider:"ollama".into(),model:"local-model".into(),api_key:None,max_tokens:Some(16),temperature:Some(0.0),think:None,messages:vec![Message{role:"developer".into(),content:"Direction".into()}]};let response=chat_at(&base,request,permit).await;let bytes=axum::body::to_bytes(response.into_body(),1024*1024).await.unwrap();let events=String::from_utf8(bytes.to_vec()).unwrap();assert!(events.contains("Hello"));assert!(events.contains(" world"));assert!(events.contains("\"type\":\"done\""));}
 #[test] fn rejects_missing_model(){let request=GenerateRequest{provider:"ollama".into(),model:"".into(),api_key:None,max_tokens:Some(16),temperature:Some(0.0),think:None,messages:vec![Message{role:"user".into(),content:"test".into()}]};assert!(validate(&request).is_err());}
 #[tokio::test]#[ignore = "requires a running local Ollama and an installed small model"]
 async fn real_local_model_streams_through_companion(){let data:Value=client().unwrap().get(format!("{BASE}/api/tags")).send().await.unwrap().json().await.unwrap();let mut candidates=data["models"].as_array().unwrap().iter().filter(|v|v["size"].as_u64().is_some_and(|n|n<3*1024*1024*1024)).collect::<Vec<_>>();candidates.sort_by_key(|v|v["size"].as_u64().unwrap());let mut chosen=None;for v in candidates{let name=v["name"].as_str().unwrap();let detail:Value=client().unwrap().post(format!("{BASE}/api/show")).json(&json!({"model":name})).send().await.unwrap().json().await.unwrap();if detail["capabilities"].as_array().is_some_and(|c|c.iter().any(|x|x=="completion")){chosen=Some(name.to_string());break}}let model=chosen.expect("no installed chat-capable model under 3 GiB");let state=AppState::new("test".into(),HashSet::new());let permit=state.slots.clone().acquire_owned().await.unwrap();let request=GenerateRequest{provider:"ollama".into(),model,api_key:None,max_tokens:Some(64),temperature:Some(0.0),think:Some(false),messages:vec![Message{role:"user".into(),content:"Reply with the word hello.".into()}]};let response=chat_at(BASE,request,permit).await;assert_eq!(response.status(),StatusCode::OK);let bytes=tokio::time::timeout(Duration::from_secs(120),axum::body::to_bytes(response.into_body(),1024*1024)).await.unwrap().unwrap();let events=String::from_utf8(bytes.to_vec()).unwrap();assert!(events.contains("\"type\":\"delta\""),"No text was returned");assert!(events.contains("\"type\":\"done\""),"The response did not complete");}

}
