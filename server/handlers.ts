import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { ApiError } from './network.js';
import { consumeGeneration } from './stream.js';
import { generationResponse, listModels, media, validateGenerate, voice } from './providers.js';
const MAX_BODY=2_000_000;
const DESKTOP_ORIGINS=['tauri://localhost','http://tauri.localhost','https://tauri.localhost'];
function allowedOrigins(){
 const origins=new Set(DESKTOP_ORIGINS);
 for(const entry of (process.env.FRAME_ALLOWED_ORIGINS||'').split(',')){
   const origin=entry.trim();if(!origin||origin==='*'||origin==='null')continue;
   try{const url=new URL(origin);if(['https:','http:'].includes(url.protocol)&&url.origin===origin&&!url.username&&!url.password)origins.add(origin);}catch{/* Ignore invalid configuration rather than broadening access. */}
 }
 return origins;
}
function cors(req:IncomingMessage,res:ServerResponse):boolean{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Vary','Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
 const origin=req.headers.origin,allowed=typeof origin==='string'&&allowedOrigins().has(origin);
 if(allowed){
   res.setHeader('Access-Control-Allow-Origin',origin);
   res.setHeader('Access-Control-Expose-Headers','Content-Type, Content-Length, Cache-Control');
 }
 if(req.method!=='OPTIONS')return false;
 const method=req.headers['access-control-request-method'];
 const requestedHeaders=String(req.headers['access-control-request-headers']||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);
 if(!allowed||method!=='POST'||requestedHeaders.some(h=>h!=='content-type')){
   json(res,{error:'This cross-origin request is not allowed.'},403);return true;
 }
 const path=new URL(req.url||'/', 'http://localhost').pathname.replace(/\/$/,'');
 if(!['/api/generate','/api/models','/api/media','/api/voice'].includes(path)){json(res,{error:'Unknown API route.'},404);return true;}
 res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
 res.statusCode=204;res.end();return true;
}
async function readBody(req:IncomingMessage):Promise<Record<string,any>>{
 const preParsed=(req as IncomingMessage&{body?:unknown}).body;
 if(preParsed!==undefined){if(typeof preParsed==='object'&&!Buffer.isBuffer(preParsed)){if(JSON.stringify(preParsed).length>MAX_BODY)throw new ApiError('The request is too large. Work on one scene at a time.',413);return preParsed as Record<string,any>;}}
 let raw=typeof preParsed==='string'?preParsed:Buffer.isBuffer(preParsed)?preParsed.toString():'';
 if(!raw){if(Number(req.headers['content-length'])>MAX_BODY)throw new ApiError('The request is too large. Work on one scene at a time.',413);let length=0;const chunks:Buffer[]=[];for await(const chunk of req){const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);length+=buffer.length;if(length>MAX_BODY)throw new ApiError('The request is too large. Work on one scene at a time.',413);chunks.push(buffer);}raw=Buffer.concat(chunks).toString('utf8');}
 if(Buffer.byteLength(raw)>MAX_BODY)throw new ApiError('The request is too large.',413);
 try{const result=JSON.parse(raw);if(!result||Array.isArray(result)||typeof result!=='object')throw new Error();return result;}catch{throw new ApiError('Request body must be a JSON object.');}
}
function json(res:ServerResponse,value:unknown,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(value));}
export async function handleApi(req:IncomingMessage,res:ServerResponse):Promise<void>{
 if(cors(req,res))return;
 if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');json(res,{error:'Use POST for provider requests.'},405);return;}
 const controller=new AbortController();const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnect);const timeout=setTimeout(()=>controller.abort(new Error('The hosted request reached its time limit. Received code is preserved.')),285_000);let secret='';
 try{
   const url=new URL(req.url||'/', 'http://localhost');const body=await readBody(req);secret=typeof body.apiKey==='string'?body.apiKey:'';
   switch(url.pathname.replace(/\/$/,'')){
     case '/api/generate':{
       const input=validateGenerate(body);const response=await generationResponse(input,controller.signal);
       res.statusCode=200;res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');res.setHeader('Cache-Control','no-store, no-transform');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Accel-Buffering','no');res.flushHeaders();
       const heartbeat=setInterval(()=>{if(!res.destroyed)res.write('\n');},15_000);
       try{await consumeGeneration(response.body!,input.provider,async event=>{if(res.destroyed)throw new Error('Client disconnected.');if(!res.write(JSON.stringify(event)+'\n'))await once(res,'drain',{signal:controller.signal});},secret);}finally{clearInterval(heartbeat);if(!res.destroyed)res.end();}
       break;
     }
     case '/api/models':json(res,await listModels(body,controller.signal));break;
     case '/api/media':json(res,await media(body as Parameters<typeof media>[0],controller.signal));break;
     case '/api/voice':{const result=await voice(body,controller.signal);res.statusCode=200;res.setHeader('Content-Type',result.mime);res.setHeader('Content-Length',result.bytes.byteLength);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(Buffer.from(result.bytes));break;}
     default:json(res,{error:'Unknown API route.'},404);
   }
 }catch(error){
   const original=error instanceof Error?error.message:'Provider request failed.';const message=(secret?original.split(secret).join('[redacted]'):original).slice(0,1800);if(res.destroyed)return;
   if(res.headersSent){res.end(JSON.stringify({type:'error',message})+'\n');}else json(res,{error:message},error instanceof ApiError?error.status:502);
 }finally{clearTimeout(timeout);res.off('close',disconnect);}
}
