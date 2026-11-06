import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeGeneration, parseSSE } from '../server/stream';
import { isPublicAddress, validateCustomUrl } from '../server/network';
import { generationResponse, listModels, media, validateGenerate, voice } from '../server/providers';
import { handleApi } from '../server/handlers';
import { createServer, request } from 'node:http';
import { once } from 'node:events';

function bytes(parts:string[]){return new ReadableStream<Uint8Array>({start(c){for(const part of parts)c.enqueue(new TextEncoder().encode(part));c.close();}});}
function jsonResponse(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
async function httpApi(method:string,headers:Record<string,string>={},body?:unknown){
 const server=createServer((req,res)=>void handleApi(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No server');
 try{return await new Promise<{status:number;text:string;headers:import('node:http').IncomingHttpHeaders}>((resolve,reject)=>{const req=request(`http://127.0.0.1:${address.port}/api/generate`,{method,headers},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode||0,text,headers:res.headers}));});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});}
 finally{server.close();await once(server,'close');}
}

describe('stream durability contract',()=>{
 it('parses split UTF-8, multiline data, comments and CRLF without losing bytes',async()=>{
  const encoded=new TextEncoder().encode(': keepalive\r\nevent: message\r\ndata: {"text":\r\ndata: "🌒"}\r\n\r\n');
  const stream=new ReadableStream<Uint8Array>({start(c){for(let i=0;i<encoded.length;i++)c.enqueue(encoded.slice(i,i+1));c.close();}});
  const results=[];for await(const event of parseSSE(stream))results.push(event);
  expect(results).toEqual([{event:'message',data:'{"text":\n"🌒"}'}]);
 });
 it('preserves deltas and reports interruption when upstream closes without a terminal event',async()=>{
  const events:any[]=[];await consumeGeneration(bytes(['data: {"choices":[{"delta":{"content":"<html>"},"finish_reason":null}]}\n\n','data: {"choices":[{"delta":{"content":"🌒 partial"}}]}\n\n']),'openrouter',e=>{events.push(e)});
  expect(events.slice(0,2)).toEqual([{type:'delta',text:'<html>'},{type:'delta',text:'🌒 partial'}]);expect(events.at(-1).type).toBe('error');expect(events.some(e=>e.type==='done')).toBe(false);
 });
 it('normalizes an explicit token cutoff but does not pretend the artifact is complete',async()=>{
  const events:any[]=[];await consumeGeneration(bytes(['data: {"choices":[{"delta":{"content":"code"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n']),'openrouter',e=>{events.push(e)});
  expect(events.at(-1)).toEqual({type:'done',finishReason:'length'});
 });
 it('handles HTTP-200 error events after partial output and redacts the key',async()=>{
  const events:any[]=[];await consumeGeneration(bytes(['data: {"choices":[{"delta":{"content":"saved"}}]}\n\ndata: {"error":{"message":"failed for secret-123"}}\n\n']),'openrouter',e=>{events.push(e)},'secret-123');
  expect(events).toEqual([{type:'delta',text:'saved'},{type:'error',message:'failed for [redacted]'}]);
 });
 it('keeps malformed trailing output recoverable and does not emit done',async()=>{
  const events:any[]=[];await consumeGeneration(bytes(['data: {"choices":[{"delta":{"content":"<canvas>"}}]}\n\ndata: {"choices":']),'custom',e=>{events.push(e)});
  expect(events[0]).toEqual({type:'delta',text:'<canvas>'});expect(events.at(-1).type).toBe('error');
 });
 it('only emits Anthropic text deltas and requires message_stop',async()=>{
  const events:any[]=[];await consumeGeneration(bytes(['event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"private reasoning"}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"film"}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n']),'anthropic',e=>{events.push(e)});
  expect(events).toEqual([{type:'delta',text:'film'},{type:'done',finishReason:'end_turn'}]);
 });
});

describe('endpoint boundaries and catalogs',()=>{
 it.each(['http://example.com/v1','https://127.0.0.1/v1','https://0x7f000001/v1','https://[::1]/v1','https://169.254.169.254/','https://user:pass@example.com/v1','https://api.internal/v1','https://example.com:22/v1','https://example.com/v1?key=abc'])('rejects unsafe custom endpoint %s',url=>expect(()=>validateCustomUrl(url)).toThrow());
 it('accepts public TLS endpoints and rejects non-global IP addresses',()=>{
  expect(validateCustomUrl('https://models.example.com/v1').hostname).toBe('models.example.com');
  for(const ip of ['127.0.0.1','10.2.3.4','172.16.1.1','192.168.1.1','100.64.0.1','169.254.169.254','::1','fe80::1','fd00::1','::ffff:127.0.0.1','2001:db8::1'])expect(isPublicAddress(ip),ip).toBe(false);
  expect(isPublicAddress('8.8.8.8')).toBe(true);expect(isPublicAddress('2606:4700::1111')).toBe(true);
 });
 it('presets cannot be redirected with a supplied custom URL',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}));
  const input=validateGenerate({provider:'openrouter',baseUrl:'https://attacker.example',apiKey:'key',model:'model',messages:[{role:'user',content:'make film'}]});await generationResponse(input);
  expect(fetcher.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
 });
 it('returns the entire model catalog rather than a small hardcoded selection',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(jsonResponse({data:Array.from({length:1200},(_,i)=>({id:`model-${i}`,name:`Model ${i}`,architecture:{output_modalities:['text']}}))}));
  const result=await listModels({provider:'openrouter',apiKey:'key'});expect(result.models.length).toBe(1200);
 });
 it('keeps Anthropic model records in the text catalog and follows pagination',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(jsonResponse({data:[{id:'a',display_name:'A',type:'model'}],has_more:true,last_id:'a'})).mockResolvedValueOnce(jsonResponse({data:[{id:'b',display_name:'B',type:'model'}],has_more:false}));
  const result=await listModels({provider:'anthropic',apiKey:'key',kind:'text'});expect(result.models.map(m=>m.id)).toEqual(['a','b']);expect(String(f.mock.calls[1][0])).toContain('after_id=a');
 });
 it('discovers image models from the dedicated catalog',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(jsonResponse({data:[{id:'lab/image',name:'Image',architecture:{output_modalities:['image']}}]}));
  const result=await listModels({provider:'openrouter',apiKey:'key',kind:'image'});expect(f.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/images/models');expect(result.models[0].kind).toBe('image');
 });
 it('uses the official xAI model catalog and chat streaming endpoint',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(jsonResponse({models:[{id:'grok-text',name:'Grok text',output_modalities:['text']}]})).mockResolvedValueOnce(new Response('data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}));
  const result=await listModels({provider:'xai',apiKey:'x-key',kind:'text'});expect(result.models[0].id).toBe('grok-text');expect(f.mock.calls[0][0]).toBe('https://api.x.ai/v1/language-models');
  await generationResponse(validateGenerate({provider:'xai',apiKey:'x-key',model:'grok-text',messages:[{role:'user',content:'Make a paper film'}]}));
  expect(f.mock.calls[1][0]).toBe('https://api.x.ai/v1/chat/completions');expect(f.mock.calls[1][1]?.headers).toMatchObject({Authorization:'Bearer x-key'});expect(JSON.parse(String(f.mock.calls[1][1]?.body)).stream).toBe(true);
 });
});

describe('media and narration adapters',()=>{
 it('persists the Venice queue ID and one-time private download URL in the normalized job',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(jsonResponse({queue_id:'job-123',model:'video-model',download_url:'https://private-share.venice.ai/v1/share/read/secret'}));
  const result=await media({provider:'venice',apiKey:'key',model:'video-model',action:'video-start',prompt:'paper city'});
  expect(result.job).toEqual({id:'job-123',model:'video-model',status:'pending',downloadUrl:'https://private-share.venice.ai/v1/share/read/secret'});
 });
 it('normalizes OpenRouter image bytes into an embedded data URL',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(jsonResponse({data:[{b64_json:'aGVsbG8=',media_type:'image/png'}]}));
  const result=await media({provider:'openrouter',apiKey:'key',model:'image',action:'image',prompt:'paper city'});
  expect(f.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/images');expect(result.images).toEqual([{data:'data:image/png;base64,aGVsbG8=',mime:'image/png'}]);
 });
 it('returns a fixed authorized direct video transfer instead of buffering a large movie through Vercel',async()=>{
  const f=vi.spyOn(globalThis,'fetch');const result=await media({provider:'openrouter',apiKey:'key',model:'video',action:'video-content',jobId:'job-123'});
  expect(f).not.toHaveBeenCalled();expect(result.download).toEqual({url:'https://openrouter.ai/api/v1/videos/job-123/content?index=0',method:'GET',auth:'bearer',mime:'video/mp4',body:undefined});expect(JSON.stringify(result)).not.toContain('Bearer key');
 });
 it('rejects a forged private-media URL and path traversal in job IDs',async()=>{
  await expect(media({provider:'venice',apiKey:'key',model:'v',action:'video-content',jobId:'job-1',downloadUrl:'https://attacker.example/file'})).rejects.toThrow();
  await expect(media({provider:'openrouter',apiKey:'key',model:'v',action:'video-content',jobId:'../../secret'})).rejects.toThrow();
 });
 it('returns an actionable direct image transport when requested, without making a paid call',async()=>{
  const f=vi.spyOn(globalThis,'fetch');const result=await media({provider:'openrouter',apiKey:'key',model:'image',action:'image',prompt:'paper',direct:true});
  expect(f).not.toHaveBeenCalled();expect(result.directKind).toBe('image');expect((result.download as any).body.prompt).toBe('paper');
 });
 it('treats non-audio voice responses as errors rather than saving corrupt files',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(jsonResponse({unexpected:'json'}));await expect(voice({provider:'venice',apiKey:'key',model:'tts',voice:'af_sky',text:'hello'})).rejects.toThrow('did not return audio');
 });
});

describe('HTTP handler',()=>{
 it.each(['tauri://localhost','http://tauri.localhost','https://tauri.localhost'])('accepts the exact desktop preflight origin %s',async origin=>{
  const f=vi.spyOn(globalThis,'fetch');
  const result=await httpApi('OPTIONS',{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'});
  expect(result.status).toBe(204);expect(result.text).toBe('');expect(result.headers['access-control-allow-origin']).toBe(origin);expect(result.headers['access-control-allow-methods']).toBe('POST, OPTIONS');expect(result.headers['access-control-allow-headers']).toBe('Content-Type');expect(result.headers['access-control-allow-credentials']).toBeUndefined();expect(result.headers['cache-control']).toBe('no-store');expect(f).not.toHaveBeenCalled();
 });
 it.each(['https://evil.example','null','https://tauri.localhost.evil.example','http://tauri.localhost:9000','tauri://localhost.evil.example'])('denies an unlisted preflight origin %s',async origin=>{
  const result=await httpApi('OPTIONS',{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type'});
  expect(result.status).toBe(403);expect(result.headers['access-control-allow-origin']).toBeUndefined();expect(result.headers['cache-control']).toBe('no-store');
 });
 it('allows only exact configured mirror origins and never enables wildcard reflection',async()=>{
  vi.stubEnv('FRAME_ALLOWED_ORIGINS',' https://mirror.example,*,null,https://bad.example/path,https://other.example ');
  const allowed=await httpApi('OPTIONS',{Origin:'https://mirror.example','Access-Control-Request-Method':'POST'});expect(allowed.status).toBe(204);expect(allowed.headers['access-control-allow-origin']).toBe('https://mirror.example');
  for(const origin of ['https://attacker.example','https://mirror.example.evil.example','https://bad.example']){const denied=await httpApi('OPTIONS',{Origin:origin,'Access-Control-Request-Method':'POST'});expect(denied.status).toBe(403);expect(denied.headers['access-control-allow-origin']).toBeUndefined();}
 });
 it('denies unsupported preflight methods and headers without making upstream calls',async()=>{
  const f=vi.spyOn(globalThis,'fetch');
  expect((await httpApi('OPTIONS',{Origin:'tauri://localhost','Access-Control-Request-Method':'DELETE'})).status).toBe(403);
  expect((await httpApi('OPTIONS',{Origin:'tauri://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type, Authorization'})).status).toBe(403);
  expect(f).not.toHaveBeenCalled();
 });
 it('exposes an uncached desktop stream and preserves the terminal provider event',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(bytes(['data: {"choices":[{"delta":{"content":"film"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n']),{headers:{'Content-Type':'text/event-stream'}}));
  const result=await httpApi('POST',{Origin:'tauri://localhost','Content-Type':'application/json'},{provider:'openrouter',apiKey:'key',model:'m',messages:[{role:'user',content:'Make film'}]});
  expect(result.status).toBe(200);expect(result.headers['access-control-allow-origin']).toBe('tauri://localhost');expect(result.headers['access-control-expose-headers']).toContain('Cache-Control');expect(result.headers['cache-control']).toContain('no-store');expect(result.headers.vary).toContain('Origin');expect(result.text.trim().split('\n').map(s=>JSON.parse(s))).toEqual([{type:'delta',text:'film'},{type:'done',finishReason:'stop'}]);
 });
 it('returns accessible errors to desktop origins while same-origin clients need no CORS',async()=>{
  const desktop=await httpApi('POST',{Origin:'https://tauri.localhost','Content-Type':'application/json'},{});expect(desktop.status).toBe(400);expect(desktop.headers['access-control-allow-origin']).toBe('https://tauri.localhost');expect(desktop.headers['cache-control']).toBe('no-store');
  const sameOrigin=await httpApi('POST',{'Content-Type':'application/json'},{});expect(sameOrigin.status).toBe(400);expect(sameOrigin.headers['access-control-allow-origin']).toBeUndefined();
 });
 it('streams the normalized durable contract through the actual Node route',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(bytes(['data: {"choices":[{"delta":{"content":"<html>film"}}]}\n\n']),{headers:{'Content-Type':'text/event-stream'}}));
  const server=createServer((req,res)=>void handleApi(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No server');
  try{
   const result=await new Promise<{status:number;text:string}>((resolve,reject)=>{const req=request(`http://127.0.0.1:${address.port}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode||0,text}));});req.on('error',reject);req.end(JSON.stringify({provider:'openrouter',apiKey:'key',model:'m',messages:[{role:'user',content:'Make film'}]}));});
   const events=result.text.trim().split('\n').map(s=>JSON.parse(s));expect(result.status).toBe(200);expect(events[0]).toEqual({type:'delta',text:'<html>film'});expect(events.at(-1).type).toBe('error');expect(events.some(e=>e.type==='done')).toBe(false);
  }finally{server.close();await once(server,'close');}
 });
});
