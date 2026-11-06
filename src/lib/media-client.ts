import type {ProviderConnection} from './types';
import {apiUrl} from './generation';
import {validateReferenceImages,validateReferenceImage} from './reference-contract';

export interface ImageDirection {model:string;prompt:string;width?:number;height?:number;aspectRatio?:string;resolution?:string;referenceImages?:string[]}
export interface GeneratedImage {data:string;mime:string}
interface Descriptor {url:string;method:'GET'|'POST';auth:'bearer'|'none';body?:Record<string,unknown>;mime:string}
type JsonObject = Record<string,unknown>;

function object(value:unknown):JsonObject {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('The media service returned an invalid response.');
  return value as JsonObject;
}
function redact(message:string,key:string){return (key?message.split(key).join('[redacted]'):message).slice(0,1200);}
function providerError(value:JsonObject):string|undefined {
  if(!value.error)return undefined;
  return typeof value.error==='string'?value.error:String((value.error as JsonObject)?.message||'The provider could not complete this request.');
}
async function readJson(response:Response,key:string):Promise<JsonObject>{
  const text=await response.text();
  let value:JsonObject;
  try{value=object(JSON.parse(text));}catch{throw new Error(redact(!response.ok?`Media request failed (${response.status}): ${text.slice(0,500)}`:'The media service did not return valid JSON.',key));}
  const error=providerError(value);
  if(!response.ok||error)throw new Error(redact(error||String(value.message||`Media request failed (${response.status}).`),key));
  return value;
}

// A descriptor is deliberately narrower than a generic URL fetch. Credentials can
// only reach the selected provider's media API, never a returned share address.
function descriptor(connection:ProviderConnection,result:unknown,kind:'image'|'video'):Descriptor {
  const outer=object(result),d=object(outer.download);
  if(outer.provider!==undefined && outer.provider!==connection.provider)throw new Error('The media response belongs to a different provider.');
  if(!['openrouter','venice'].includes(connection.provider))throw new Error('Direct media is available through OpenRouter and Venice.');
  if(typeof d.url!=='string')throw new Error('The media service did not provide a download address.');
  let url:URL;try{url=new URL(d.url);}catch{throw new Error('Invalid media download address.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)throw new Error('Unexpected media download address.');
  let valid=false;
  if(kind==='image'){
    const expected=connection.provider==='openrouter'?['https://openrouter.ai/api/v1/images']:['https://api.venice.ai/api/v1/image/generate','https://api.venice.ai/api/v1/image/multi-edit'];
    valid=expected.includes(url.href) && d.method==='POST' && d.auth==='bearer';
  }else if(connection.provider==='openrouter'){
    valid=url.origin==='https://openrouter.ai' && /^\/api\/v1\/videos\/[a-zA-Z0-9._:%-]+\/content$/.test(url.pathname) && url.search==='?index=0' && d.method==='GET' && d.auth==='bearer';
    if(valid){const id=decodeURIComponent(url.pathname.split('/')[4]);valid=/^[a-zA-Z0-9._:-]+$/.test(id);}
  }else if(url.origin==='https://api.venice.ai'){
    valid=url.pathname==='/api/v1/video/retrieve' && !url.search && d.method==='POST' && d.auth==='bearer';
  }else if(url.origin==='https://private-share.venice.ai'){
    valid=url.pathname.startsWith('/v1/share/read/') && url.pathname.length>'/v1/share/read/'.length && d.method==='GET' && d.auth==='none';
  }
  if(!valid)throw new Error('The media service returned an unexpected provider endpoint. No credentials were sent.');
  if(d.method==='POST'){
    const body=object(d.body);
    const model=kind==='image'&&url.pathname.endsWith('/image/multi-edit')?body.modelId:body.model;
    if(typeof model!=='string'||!model)throw new Error('The media descriptor is missing its model.');
    if(kind==='image'&&(typeof body.prompt!=='string'||!body.prompt))throw new Error('The media descriptor is missing its image direction.');
    if(kind==='video'&&(typeof body.queue_id!=='string'||!/^[a-zA-Z0-9._:-]+$/.test(body.queue_id)))throw new Error('The media descriptor is missing its video job ID.');
  }else if(d.body!==undefined)throw new Error('Unexpected request body in a media download.');
  if(d.auth==='bearer'&&!connection.apiKey)throw new Error('Add this provider’s API key to download the media.');
  return {url:url.href,method:d.method as Descriptor['method'],auth:d.auth as Descriptor['auth'],body:d.body as Descriptor['body'],mime:typeof d.mime==='string'?d.mime:kind==='image'?'application/json':'video/mp4'};
}
async function fetchDescriptor(connection:ProviderConnection,d:Descriptor){
  const headers:Record<string,string>={};
  if(d.auth==='bearer')headers.Authorization=`Bearer ${connection.apiKey}`;
  if(d.method==='POST')headers['Content-Type']='application/json';
  try{return await fetch(d.url,{method:d.method,headers,body:d.body?JSON.stringify(d.body):undefined,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});}
  catch{throw new Error('The browser could not reach this media endpoint. Check the connection and provider browser access. Saved video jobs can be retried.');}
}
function normalizeImage(value:unknown,mimeValue:unknown='image/png'):GeneratedImage {
  if(typeof value!=='string'||!value)throw new Error('The provider returned empty image data.');
  let data=value;
  let mime=typeof mimeValue==='string'?mimeValue:'image/png';
  if(value.startsWith('data:')){
    const match=value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    if(!match)throw new Error('The provider returned an unsupported image encoding.');
    mime=match[1];
  }else{
    if(!/^image\/[a-zA-Z0-9.+-]+$/.test(mime)||/^(?:https?:|blob:|javascript:)/i.test(value))throw new Error('The provider returned an unsupported image format.');
    data=`data:${mime};base64,${value}`;
  }
  return {data,mime};
}

/** Fetch large generated images in the browser, outside a serverless response limit. */
export async function generateImage(connection:ProviderConnection,direction:ImageDirection):Promise<GeneratedImage[]> {
  if(!['openrouter','venice'].includes(connection.provider))throw new Error('Choose OpenRouter or Venice to generate an image.');
  const references=validateReferenceImages(direction.referenceImages);
  const gatewayResponse=await fetch(apiUrl('/api/media'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'image',provider:connection.provider,apiKey:connection.apiKey,...direction,direct:true}),redirect:'error'});
  const result=await readJson(gatewayResponse,connection.apiKey);
  // Older compatible local gateways can still return already embedded images.
  if(Array.isArray(result.images)){
    if(!result.images.length)throw new Error('The image provider returned no image data.');
    return result.images.map(image=>{const i=object(image);return normalizeImage(i.data,i.mime);});
  }
  const d=descriptor(connection,result,'image');
  if(references.length){
    const forwarded=connection.provider==='venice'?d.body?.images:Array.isArray(d.body?.input_references)?d.body.input_references.map((item:unknown)=>(item as {image_url?:{url?:unknown}})?.image_url?.url):undefined;
    if(JSON.stringify(forwarded)!==JSON.stringify(references))throw new Error('The media service did not preserve the selected reference images. No generation was submitted.');
  }
  const response=await fetchDescriptor(connection,d);
  if(d.url.endsWith('/image/multi-edit')){
    const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
    if(!response.ok||mime==='application/json'||mime.endsWith('+json')){const value=await readJson(response,connection.apiKey);throw new Error(redact(String(value.message||'The editing model did not return an image.'),connection.apiKey));}
    if(!['image/png','image/jpeg','image/webp'].includes(mime)){await response.body?.cancel();throw new Error('The editing model returned an unsupported image format.');}
    const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let start=0;start<bytes.length;start+=32768)binary+=String.fromCharCode(...bytes.subarray(start,start+32768));
    const data=`data:${mime};base64,${btoa(binary)}`;validateReferenceImage(data,Infinity);
    return [{data,mime}];
  }
  const generated=await readJson(response,connection.apiKey);
  const images=connection.provider==='openrouter'
    ? (Array.isArray(generated.data)?generated.data:[]).map(image=>{const i=object(image);return normalizeImage(i.b64_json,i.media_type);})
    : (Array.isArray(generated.images)?generated.images:[]).map(image=>normalizeImage(image));
  if(!images.length)throw new Error('The image provider returned no image data.');
  return images;
}

/** Resolve a server-issued video descriptor without proxying the video bytes. */
export async function downloadMediaDescriptor(connection:ProviderConnection,result:unknown):Promise<Blob> {
  const d=descriptor(connection,result,'video'),response=await fetchDescriptor(connection,d);
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!response.ok||mime==='application/json'||mime.endsWith('+json')){
    const value=await readJson(response,connection.apiKey);
    throw new Error(redact(String(value.message||'The video is still processing. Its saved job can be checked again.'),connection.apiKey));
  }
  if(mime&&!mime.startsWith('video/')&&mime!=='application/octet-stream'){
    await response.body?.cancel();throw new Error('The provider returned a non-video response. The video job is still saved.');
  }
  const blob=await response.blob();
  if(!blob.size)throw new Error('The video download was empty. Its saved job can be retried.');
  if(mime.startsWith('video/'))return blob;
  const bytes=new Uint8Array(await blob.slice(0,16).arrayBuffer());
  const mp4=bytes.length>=12 && String.fromCharCode(...bytes.slice(4,8))==='ftyp';
  const webm=bytes.length>=4 && bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;
  if(!mp4&&!webm)throw new Error('The provider did not return recognizable video data. Its saved job can be retried.');
  return blob.slice(0,blob.size,mp4?'video/mp4':'video/webm');
}
