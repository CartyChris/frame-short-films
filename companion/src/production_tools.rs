//! Restricted ComfyUI transport. No generic proxy, shell commands, or model installation.
use super::{error,AppState};
use axum::{body::Body,extract::State,http::{header,StatusCode},response::{IntoResponse,Response},Json};
use reqwest::{Client,Url};
use serde::Deserialize;
use serde_json::{json,Value};
use std::{collections::HashSet,time::Duration};
use tokio::sync::Mutex;
const JSON_LIMIT:usize=4*1024*1024;
const MEDIA_LIMIT:usize=64*1024*1024;
#[derive(Default)] pub struct Hub{attempted:Mutex<HashSet<String>>}
#[derive(Deserialize)] #[serde(rename_all="camelCase")] pub struct Request{server_url:String,requested_id:Option<String>,remote_id:Option<String>,workflow:Option<Value>,approved:Option<bool>,index:Option<usize>}
fn endpoint(value:&str)->Result<Url,String>{
 let mut u=Url::parse(value).map_err(|_|"Invalid ComfyUI address")?;
 if u.scheme()!="http"||!matches!(u.host_str(),Some("127.0.0.1"|"localhost"|"[::1]"))||u.port().is_none_or(|p|p<1024||p==4319)||!u.username().is_empty()||u.password().is_some()||u.query().is_some()||u.fragment().is_some()||u.path()!="/" {return Err("Use an HTTP loopback ComfyUI address with an explicit port, no credentials, and no path.".into())}
 if u.host_str()==Some("localhost"){u.set_host(Some("127.0.0.1")).map_err(|_|"Invalid host")?;}Ok(u)
}
fn client()->Result<Client,String>{Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(5)).timeout(Duration::from_secs(90)).build().map_err(|_|"Could not create local client".into())}
fn safe_id(id:&str)->bool{!id.is_empty()&&id.len()<=160&&id.bytes().all(|v|v.is_ascii_alphanumeric()||matches!(v,b'-'|b'_'))}
fn id(request:&Request)->Result<&str,String>{request.remote_id.as_deref().filter(|v|safe_id(v)).ok_or("A valid saved ComfyUI job ID is required".into())}
fn workflow(value:&Value)->Result<(),String>{
 let nodes=value.as_object().ok_or("Export a ComfyUI API-format workflow")?;
 if nodes.is_empty()||nodes.len()>1000||value.to_string().len()>1024*1024{return Err("Workflow must have 1–1,000 nodes and be smaller than 1 MB".into())}
 fn walk(v:&Value,depth:usize)->Result<(),String>{if depth>32{return Err("Workflow is nested too deeply".into())}match v{Value::Object(o)=>for(k,v)in o{let normalized=k.to_ascii_lowercase().replace(['_','-'],"");if ["apikey","accesstoken","authorization","auth","password","secret","bearertoken"].contains(&normalized.as_str())&&!v.is_null()&&v!=&json!("")&&v!=&json!(false){return Err("Remove workflow credentials; configure them in ComfyUI itself".into())}if ["__proto__","constructor","prototype"].contains(&k.as_str()){return Err("Invalid workflow property".into())}walk(v,depth+1)?},Value::Array(a)=>for v in a{walk(v,depth+1)?},_=>{}}Ok(())}
 walk(value,0)?;
 for(key,node)in nodes{if !safe_id(key)||!node["class_type"].as_str().is_some_and(|s|!s.is_empty()&&s.len()<=200)||!node["inputs"].is_object(){return Err("Every workflow node needs an ID, class_type and inputs object".into())}}
 Ok(())
}
async fn bytes(mut response:reqwest::Response,max:usize)->Result<Vec<u8>,String>{
 if !response.status().is_success(){return Err(format!("ComfyUI returned HTTP {}. Inspect the local service; submission was not retried.",response.status().as_u16()))}
 if response.content_length().is_some_and(|n|n>max as u64){return Err("ComfyUI response exceeds the size limit".into())}
 let mut out=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"ComfyUI response was interrupted; check the saved job ID")?{if out.len()+chunk.len()>max{return Err("ComfyUI response exceeds the size limit".into())}out.extend_from_slice(&chunk);}Ok(out)
}
async fn get_json(client:&Client,url:Url)->Result<Value,String>{let response=client.get(url).send().await.map_err(|_|"Could not reach local ComfyUI")?;serde_json::from_slice(&bytes(response,JSON_LIMIT).await?).map_err(|_|"ComfyUI returned invalid JSON".into())}
fn reply(result:Result<Value,String>)->Response{match result{Ok(value)=>Json(value).into_response(),Err(e)=>error(StatusCode::BAD_REQUEST,&e)}}
pub async fn status(Json(request):Json<Request>)->Response{reply(async{let base=endpoint(&request.server_url)?;let data=get_json(&client()?,base.join("system_stats").unwrap()).await?;if !data.is_object()||data.get("system").is_none()&&data.get("devices").is_none(){return Err("This service did not identify itself as ComfyUI".into())}Ok(json!({"ready":true}))}.await)}
pub async fn submit(State(state):State<AppState>,Json(request):Json<Request>)->Response{reply(async{
 let base=endpoint(&request.server_url)?;if request.approved!=Some(true){return Err("Review the workflow before submitting".into())}let value=request.workflow.as_ref().ok_or("Workflow is missing")?;workflow(value)?;
 let requested=request.requested_id.as_deref().ok_or("A saved request UUID is required")?;let parsed=uuid::Uuid::parse_str(requested).map_err(|_|"Invalid saved request UUID")?;if parsed.to_string()!=requested{return Err("Use a canonical lowercase request UUID".into())}
 {let mut seen=state.production_tools.attempted.lock().await;if seen.len()>=10000{return Err("Companion submission limit reached; check existing jobs before restarting".into())}if !seen.insert(requested.into()){return Err("This request ID was already attempted. Check status; it will not be submitted again.".into())}}
 let response=client()?.post(base.join("prompt").unwrap()).json(&json!({"prompt":value,"prompt_id":requested,"client_id":requested})).send().await.map_err(|_|"Submission outcome is unknown. Check the saved UUID in ComfyUI; do not resubmit automatically.")?;
 let response:Value=serde_json::from_slice(&bytes(response,JSON_LIMIT).await?).map_err(|_|"Invalid submission response. Check the saved UUID before repeating.")?;
 let remote=response["prompt_id"].as_str().filter(|s|safe_id(s)).ok_or("No confirmed job ID returned. Check ComfyUI before repeating.")?;Ok(json!({"remoteId":remote}))
 }.await)}
fn path_part(value:&str,folder:bool)->bool{if value.len()>if folder{500}else{255}||value.contains(['\\',':','\0'])||value.starts_with('/')||value.contains('%'){return false}if folder&&value.is_empty(){return true}value.split('/').all(|p|!p.is_empty()&&p!="."&&p!="..")&&(folder||!value.contains('/'))}
fn outputs(history:&Value)->Vec<Value>{let mut out=Vec::new();if let Some(nodes)=history["outputs"].as_object(){for(node,data)in nodes{for field in ["images","gifs","videos","audio"]{if let Some(items)=data[field].as_array(){for item in items{let Some(filename)=item["filename"].as_str()else{continue};let folder=item["subfolder"].as_str().unwrap_or("");if item["type"]!="output"||!path_part(filename,false)||!path_part(folder,true){continue}let ext=filename.rsplit('.').next().unwrap_or("").to_lowercase();let kind=match ext.as_str(){"png"|"jpg"|"jpeg"|"webp"|"gif"=>"image","mp4"|"webm"=>"video","wav"|"mp3"|"ogg"|"flac"=>"audio",_=>continue};if out.len()<1000&&!out.iter().any(|v:&Value|v["filename"]==filename&&v["subfolder"]==folder){out.push(json!({"index":out.len(),"node":node,"filename":filename,"subfolder":folder,"type":"output","kind":kind}));}}}}}}out}
async fn history(client:&Client,base:&Url,remote:&str)->Result<Value,String>{get_json(client,base.join(&format!("history/{remote}")).unwrap()).await}
pub async fn poll(Json(request):Json<Request>)->Response{reply(async{let base=endpoint(&request.server_url)?;let remote=id(&request)?;let client=client()?;let all=history(&client,&base,remote).await?;
 if let Some(job)=all.get(remote){let status=if job["status"]["status_str"]=="error"{"failed"}else if job["status"]["completed"]==true||job["status"]["status_str"]=="success"{"succeeded"}else{"running"};return Ok(json!({"status":status,"remoteId":remote,"outputs":outputs(job),"error":if status=="failed"{Some("ComfyUI execution failed. Inspect the local ComfyUI error; the workflow remains saved.")}else{None}}))}
 let queue=get_json(&client,base.join("queue").unwrap()).await?;for(key,status)in[("queue_running","running"),("queue_pending","queued")]{if queue[key].as_array().is_some_and(|a|a.iter().any(|entry|entry.get(1).and_then(Value::as_str)==Some(remote))){return Ok(json!({"status":status,"remoteId":remote,"outputs":[]}))}}
 Ok(json!({"status":"unknown","remoteId":remote,"outputs":[],"error":"This ID is absent from queue and history. It may have expired, been cleared, or never arrived. Inspect ComfyUI; Frame will not resubmit it."}))}.await)}
fn media_type(data:&[u8])->Option<(&'static str,&'static str)>{
 if data.starts_with(b"\x89PNG\r\n\x1a\n"){Some(("image/png","image"))}else if data.starts_with(&[0xff,0xd8,0xff]){Some(("image/jpeg","image"))}else if data.starts_with(b"GIF87a")||data.starts_with(b"GIF89a"){Some(("image/gif","image"))}else if data.starts_with(b"RIFF")&&data.get(8..12)==Some(b"WEBP"){Some(("image/webp","image"))}else if data.starts_with(b"RIFF")&&data.get(8..12)==Some(b"WAVE"){Some(("audio/wav","audio"))}else if data.starts_with(b"ID3")||data.len()>2&&data[0]==0xff&&(data[1]&0xe0)==0xe0{Some(("audio/mpeg","audio"))}else if data.starts_with(b"fLaC"){Some(("audio/flac","audio"))}else if data.starts_with(b"OggS"){Some(("audio/ogg","audio"))}else if data.get(4..8)==Some(b"ftyp"){Some(("video/mp4","video"))}else if data.starts_with(&[0x1a,0x45,0xdf,0xa3]){Some(("video/webm","video"))}else{None}
}
pub async fn download(Json(request):Json<Request>)->Response{
 let result:Result<(Vec<u8>,&str),String>=async{let base=endpoint(&request.server_url)?;let remote=id(&request)?;let index=request.index.filter(|n|*n<1000).ok_or("Select a generated output")?;let client=client()?;let all=history(&client,&base,remote).await?;let listed=outputs(&all[remote]);let output=listed.get(index).ok_or("This output is no longer available in ComfyUI history")?;
 let mut url=base.join("view").unwrap();url.query_pairs_mut().append_pair("filename",output["filename"].as_str().unwrap()).append_pair("subfolder",output["subfolder"].as_str().unwrap()).append_pair("type","output");
 let response=client.get(url).send().await.map_err(|_|"Could not download ComfyUI output")?;let data=bytes(response,MEDIA_LIMIT).await?;let(mime,kind)=media_type(&data).ok_or("Output is not supported image, audio, or video media")?;if output["kind"]!=kind{return Err("Output bytes do not match the advertised media kind".into())}Ok((data,mime))}.await;
 match result{Ok((bytes,mime))=>Response::builder().header(header::CONTENT_TYPE,mime).header(header::CACHE_CONTROL,"no-store").header(header::X_CONTENT_TYPE_OPTIONS,"nosniff").body(Body::from(bytes)).unwrap(),Err(e)=>error(StatusCode::BAD_REQUEST,&e)}
}
#[cfg(test)]mod tests{
 use super::*;use axum::{body::to_bytes,http::Request as HttpRequest,routing::{get,post},Router};use tower::ServiceExt;
 #[test]fn endpoints_and_workflows_are_bounded(){for s in["http://example.com:8188","http://127.0.0.2:8188","http://127.0.0.1:4319","http://user@localhost:8188","http://localhost:8188/path","http://localhost:8188/?secret=1","http://localhost:80"]{assert!(endpoint(s).is_err(),"{s}")};assert!(endpoint("http://[::1]:8188").is_ok());assert!(workflow(&json!({"1":{"class_type":"Test","inputs":{"api_key":"secret"}}})).is_err());assert!(!path_part("../secret.png",true));assert!(!path_part("%2e%2e/secret.png",true));assert!(media_type(b"<html>not-media</html>").is_none())}
 #[tokio::test]async fn real_local_job_transport_is_guarded_and_does_not_repeat(){
  let remote="72f3e97d-2379-415a-b885-76bba3af6247";let local=Router::new().route("/system_stats",get(||async{Json(json!({"system":{}}))})).route("/prompt",post(|Json(v):Json<Value>|async move{assert_eq!(v["prompt_id"],v["client_id"]);Json(json!({"prompt_id":v["prompt_id"]}))})).route("/history/{id}",get(move||async move{Json(json!({remote:{"status":{"completed":true,"status_str":"success"},"outputs":{"9":{"images":[{"filename":"safe.png","subfolder":"film","type":"output"},{"filename":"../../secret.png","type":"output"}]}}}}))})).route("/view",get(||async{(StatusCode::OK,b"\x89PNG\r\n\x1a\nfixture".to_vec())}));
  let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let port=listener.local_addr().unwrap().port();let server=tokio::spawn(async move{axum::serve(listener,local).await.unwrap()});let app=super::super::router(AppState::new("fixture-token".into(),super::super::default_origins()));
  let request=|action:&str,body:Value,token:&str,origin:&str|HttpRequest::builder().method("POST").uri(format!("/production/comfy/{action}")).header("origin",origin).header("authorization",format!("Bearer {token}")).header("content-type","application/json").body(Body::from(body.to_string())).unwrap();let base=json!({"serverUrl":format!("http://127.0.0.1:{port}")});
  for(token,origin,status)in[("wrong","http://localhost:5173",StatusCode::UNAUTHORIZED),("fixture-token","https://untrusted.test",StatusCode::FORBIDDEN)]{assert_eq!(app.clone().oneshot(request("status",base.clone(),token,origin)).await.unwrap().status(),status)}
  assert_eq!(app.clone().oneshot(request("status",base.clone(),"fixture-token","http://localhost:5173")).await.unwrap().status(),StatusCode::OK);
  let body=json!({"serverUrl":base["serverUrl"],"requestedId":remote,"approved":true,"workflow":{"1":{"class_type":"KSampler","inputs":{"seed":1}}}});let response=app.clone().oneshot(request("submit",body.clone(),"fixture-token","http://localhost:5173")).await.unwrap();assert_eq!(response.status(),StatusCode::OK);let v:Value=serde_json::from_slice(&to_bytes(response.into_body(),JSON_LIMIT).await.unwrap()).unwrap();assert_eq!(v["remoteId"],remote);
  assert_eq!(app.clone().oneshot(request("submit",body,"fixture-token","http://localhost:5173")).await.unwrap().status(),StatusCode::BAD_REQUEST);
  let response=app.clone().oneshot(request("poll",json!({"serverUrl":base["serverUrl"],"remoteId":remote}),"fixture-token","http://localhost:5173")).await.unwrap();assert_eq!(response.status(),StatusCode::OK);let v:Value=serde_json::from_slice(&to_bytes(response.into_body(),JSON_LIMIT).await.unwrap()).unwrap();assert_eq!(v["status"],"succeeded");assert_eq!(v["outputs"].as_array().unwrap().len(),1);
  let response=app.oneshot(request("download",json!({"serverUrl":base["serverUrl"],"remoteId":remote,"index":0}),"fixture-token","http://localhost:5173")).await.unwrap();assert_eq!(response.status(),StatusCode::OK);assert_eq!(response.headers()[header::CONTENT_TYPE],"image/png");assert!(to_bytes(response.into_body(),1000).await.unwrap().starts_with(b"\x89PNG"));server.abort();
 }
 #[tokio::test]async fn redirects_and_non_media_are_rejected(){let local=Router::new().route("/system_stats",get(||async{(StatusCode::FOUND,[(header::LOCATION,"http://example.com/")])}));let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let port=listener.local_addr().unwrap().port();let server=tokio::spawn(async move{axum::serve(listener,local).await.unwrap()});assert!(get_json(&client().unwrap(),Url::parse(&format!("http://127.0.0.1:{port}/system_stats")).unwrap()).await.unwrap_err().contains("302"));server.abort();}
}
