/** Official Comfy API v2 adapter. No provider state or credentials are stored here.
 * Spec: https://docs.comfy.org/api-reference/v2/overview
 * Jobs use the provider's reject-on-duplicate Idempotency-Key (24h retention).
 */
import type {IncomingMessage,ServerResponse} from 'node:http';
import {ApiError,readLimited,upstream} from '../server/network.js';
export const maxDuration=300;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES=new Set(['queued','running','succeeded','canceling','canceled','failed','expired']);
const MAX_BODY=2_000_000,MAX_WORKFLOW=1_000_000,MAX_RESPONSE=2_000_000;
type Transport=(url:string,init:RequestInit,custom:boolean)=>Promise<Response>;
export function comfyBase(value:unknown):URL {
 if(typeof value!=='string'||value.length>300)throw new ApiError('Enter the official Comfy Cloud or deployment address.');
 let url:URL;try{url=new URL(value)}catch{throw new ApiError('Enter a valid Comfy HTTPS address.')}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||!(host==='cloud.comfy.org'||/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.run\.comfy\.app$/.test(host)))throw new ApiError('Only https://cloud.comfy.org or a single official deployment.run.comfy.app host is allowed.');
 return url;
}
function jobLink(value:unknown,base:URL,id:string,kind:'self'|'cancel'):string {
 if(typeof value!=='string'||value.length>1200||!UUID.test(id))throw new ApiError('The Comfy job link or ID is invalid.');
 let url:URL;try{url=new URL(value,base.origin)}catch{throw new ApiError('The Comfy job link is invalid.')}
 const prefix='(?:/deployment/[a-zA-Z0-9_-]{1,100})?',suffix=kind==='cancel'?'/cancel':'';
 const path=new RegExp(`^${prefix}/api/v2/jobs/([0-9a-f-]{36})${suffix}$`,'i'),match=path.exec(url.pathname);
 if(url.origin!==base.origin||url.username||url.password||url.search||url.hash||!match||match[1].toLowerCase()!==id.toLowerCase())throw new ApiError('The Comfy job link is not on the selected official host or does not match this job.');
 return url.href;
}
function validateWorkflow(workflow:unknown):Record<string,unknown>{
 if(!workflow||typeof workflow!=='object'||Array.isArray(workflow))throw new ApiError('Choose an API-format Comfy workflow.');
 const serialized=JSON.stringify(workflow);if(Buffer.byteLength(serialized)>MAX_WORKFLOW)throw new ApiError('The workflow exceeds 1 MB.',413);
 const entries=Object.entries(workflow);if(!entries.length||entries.length>1000)throw new ApiError('A workflow must contain 1–1,000 nodes.');
 for(const [id,node] of entries){if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id)||!node||typeof node!=='object'||Array.isArray(node))throw new ApiError('Invalid workflow node.');const n=node as Record<string,unknown>;if(typeof n.class_type!=='string'||!n.class_type||n.class_type.length>200||!n.inputs||typeof n.inputs!=='object'||Array.isArray(n.inputs))throw new ApiError('Each workflow node needs a class_type and inputs object.')}
 const stack:{value:unknown;depth:number}[]=[{value:workflow,depth:0}];let count=0;while(stack.length){const {value,depth}=stack.pop()!;if(++count>50000||depth>32)throw new ApiError('The workflow is too complex.');if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){const k=key.toLowerCase().replace(/[_-]/g,'');if(['__proto__','constructor','prototype'].includes(key))throw new ApiError('Invalid workflow property.');if(['apikey','accesstoken','authorization','auth','password','secret','bearertoken'].includes(k)&&child!==null&&child!==''&&child!==false)throw new ApiError('Remove credentials from the workflow; configure them separately.');stack.push({value:child,depth:depth+1})}}
 return workflow as Record<string,unknown>;
}
function normalizeJob(data:unknown,base:URL,expected?:string){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new ApiError('Comfy returned an invalid job.',502);
 const job=data as Record<string,any>;if(typeof job.id!=='string'||!UUID.test(job.id)||(expected&&job.id.toLowerCase()!==expected.toLowerCase())||typeof job.status!=='string'||!STATUSES.has(job.status)||!job.urls||typeof job.urls!=='object')throw new ApiError('Comfy returned an invalid job identity or status.',502);
 const selfUrl=jobLink(job.urls.self,base,job.id,'self'),cancelUrl=jobLink(job.urls.cancel,base,job.id,'cancel');
 if(new URL(cancelUrl).pathname!==new URL(selfUrl).pathname+'/cancel')throw new ApiError('Comfy returned inconsistent job links.',502);
 const outputs=Array.isArray(job.outputs)?job.outputs.slice(0,1000).flatMap((item:unknown)=>{if(!item||typeof item!=='object')return [];const v=item as Record<string,unknown>;if(typeof v.id!=='string'||!UUID.test(v.id)||typeof v.type!=='string'||!['image','video','audio','text','file','latent'].includes(v.type))return [];return [{id:v.id,type:v.type,name:typeof v.name==='string'?v.name.slice(0,255):'',contentType:typeof v.content_type==='string'?v.content_type.slice(0,120):'',sizeBytes:Number.isSafeInteger(v.size_bytes)&&Number(v.size_bytes)>=0?v.size_bytes:null}]}) : [];
 return {id:job.id,status:job.status,selfUrl,cancelUrl,expiresAt:typeof job.expires_at==='string'?job.expires_at.slice(0,64):undefined,progress:typeof job.progress?.value==='number'&&Number.isFinite(job.progress.value)?Math.max(0,Math.min(1,job.progress.value)):undefined,outputs};
}
export async function executeComfy(body:Record<string,unknown>,signal?:AbortSignal,transport:Transport=upstream){
 const base=comfyBase(body.baseUrl),apiKey=body.apiKey;if(typeof apiKey!=='string'||!apiKey||apiKey.length>4096||/[\r\n]/.test(apiKey))throw new ApiError('Enter your Comfy API key.');
 const action=body.action;if(action!=='submit'&&action!=='poll'&&action!=='cancel')throw new ApiError('Choose submit, poll, or cancel.');
 let url:string,method='GET',payload:string|undefined;const headers:Record<string,string>={Authorization:'Bearer '+apiKey,Accept:'application/json'};
 if(action==='submit'){
  if(body.approved!==true)throw new ApiError('Review and explicitly approve this workflow before submitting.');
  if(typeof body.requestId!=='string'||!UUID.test(body.requestId))throw new ApiError('A saved request UUID is required before submission.');
  const workflow=validateWorkflow(body.workflow);url=new URL('/api/v2/jobs',base).href;method='POST';headers['Content-Type']='application/json';headers['Idempotency-Key']=body.requestId;payload=JSON.stringify({workflow,...(body.partnerNodes===true?{extra_data:{api_key_comfy_org:apiKey}}:{})});
 }else{
  if(typeof body.jobId!=='string'||!UUID.test(body.jobId))throw new ApiError('A saved Comfy job UUID is required.');
  url=jobLink(action==='poll'?body.selfUrl:body.cancelUrl,base,body.jobId,action==='poll'?'self':'cancel');if(action==='cancel')method='POST';
 }
 let response:Response;try{response=await transport(url,{method,headers,...(payload?{body:payload}:{}),signal,redirect:'error'},true)}catch{throw new ApiError(action==='submit'?'Submission outcome is unknown. Check Comfy job history before taking further action; do not submit automatically again.':'Could not reach Comfy. The saved job ID remains available.',502)}
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new ApiError(action==='submit'?'Comfy did not confirm submission. The outcome may be unknown; inspect job history and do not automatically resubmit.':`Comfy could not ${action} the saved job (${response.status}).`,response.status>=400&&response.status<600?response.status:502)}
 let result:unknown;try{result=JSON.parse(new TextDecoder().decode(await readLimited(response,MAX_RESPONSE)))}catch{throw new ApiError(action==='submit'?'Comfy returned an unreadable response. Submission may have succeeded; check job history before retrying.':'Comfy returned an unreadable job response.',502)}
 try{return normalizeJob(result,base,action==='submit'?undefined:body.jobId as string)}catch{throw new ApiError(action==='submit'?'Comfy returned an invalid receipt. Submission may have succeeded; check job history before retrying.':'Comfy returned an invalid job receipt.',502)}
}
function json(res:ServerResponse,value:unknown,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(value))}
function allowedOrigin(origin:string){if(['tauri://localhost','http://tauri.localhost','https://tauri.localhost'].includes(origin))return true;return (process.env.FRAME_ALLOWED_ORIGINS||'').split(',').some(entry=>{try{const v=entry.trim(),url=new URL(v);return v===origin&&url.origin===v&&['http:','https:'].includes(url.protocol)}catch{return false}})}
async function readBody(req:IncomingMessage){const pre=(req as IncomingMessage&{body?:unknown}).body;if(pre!==undefined&&typeof pre==='object'&&pre!==null&&!Buffer.isBuffer(pre)){if(Buffer.byteLength(JSON.stringify(pre))>MAX_BODY)throw new ApiError('Request exceeds the size limit.',413);if(Array.isArray(pre))throw new ApiError('Request body must be an object.');return pre as Record<string,unknown>}let text=typeof pre==='string'?pre:Buffer.isBuffer(pre)?pre.toString('utf8'):'';if(!text){if(Number(req.headers['content-length'])>MAX_BODY)throw new ApiError('Request exceeds the size limit.',413);let n=0;const chunks:Buffer[]=[];for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);n+=b.length;if(n>MAX_BODY)throw new ApiError('Request exceeds the size limit.',413);chunks.push(b)}text=Buffer.concat(chunks).toString('utf8')}if(Buffer.byteLength(text)>MAX_BODY)throw new ApiError('Request exceeds the size limit.',413);try{const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body as Record<string,unknown>}catch{throw new ApiError('Request body must be a JSON object.')}}
export default async function handler(req:IncomingMessage,res:ServerResponse){
 const origin=req.headers.origin;res.setHeader('Vary','Origin, Access-Control-Request-Method, Access-Control-Request-Headers');if(typeof origin==='string'&&allowedOrigin(origin))res.setHeader('Access-Control-Allow-Origin',origin);
 if(req.method==='OPTIONS'){const headers=String(req.headers['access-control-request-headers']||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);if(typeof origin!=='string'||!allowedOrigin(origin)||req.headers['access-control-request-method']!=='POST'||headers.some(v=>v!=='content-type'))return json(res,{error:'This cross-origin request is not allowed.'},403);res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.statusCode=204;res.end();return}
 if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return json(res,{error:'Use POST.'},405)}
 const controller=new AbortController(),disconnect=()=>{if(!res.writableEnded)controller.abort()},timer=setTimeout(()=>controller.abort(),285000);res.on('close',disconnect);
 try{const body=await readBody(req);json(res,await executeComfy(body,controller.signal))}catch(error){if(!res.destroyed)json(res,{error:error instanceof ApiError?error.message:'Comfy request failed. Check the saved job before retrying.'},error instanceof ApiError?error.status:502)}finally{clearTimeout(timer);res.off('close',disconnect)}
}
