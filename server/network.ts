import { lookup as resolveDns } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import type { LookupFunction } from 'node:net';

export class ApiError extends Error { constructor(message:string,public status=400){super(message);} }
export function isPublicAddress(address:string):boolean {
  const ip=address.toLowerCase().replace(/^\[|\]$/g,'');
  if(isIP(ip)===4){
    const [a,b,c]=ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
  }
  // Accept ordinary global unicast only; reject mapped IPv4, local, multicast,
  // transition and documentation ranges rather than ambiguously normalizing them.
  if(isIP(ip)!==6||!/^[23][0-9a-f]{0,3}:/.test(ip))return false;
  const groups=ip.split(':');const second=parseInt(groups[1]||'0',16);
  return !(groups[0]==='2001'&&(second<=0x1ff||second===0xdb8))&&groups[0]!=='2002'&&!(groups[0]==='3fff'&&second<=0x0fff);
}
export function validateCustomUrl(raw:string):URL {
  let url:URL;try{url=new URL(raw);}catch{throw new ApiError('Enter a valid HTTPS provider base URL.');}
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||(url.port&&url.port!=='443'))throw new ApiError('Custom providers require HTTPS on port 443 without credentials, query strings, or fragments.');
  if(!host.includes('.')&&!isIP(host))throw new ApiError('Use a public provider hostname. Local models connect through the local companion.');
  if(/(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/.test(host)||host==='metadata.google.internal'||(isIP(host)&&!isPublicAddress(host)))throw new ApiError('Private and local addresses are not allowed in the hosted provider proxy.');
  return url;
}
export async function publicAddresses(url:URL){
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await resolveDns(host,{all:true});
  if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new ApiError('The provider hostname must resolve only to public addresses.');
  return addresses;
}
/** Custom endpoints use a pinned DNS result in the actual TLS connection. Validation
 * followed by ordinary fetch would permit DNS rebinding between the two lookups. */
async function pinnedFetch(url:URL,init:RequestInit):Promise<Response>{
  const addresses=await publicAddresses(url);const address=addresses[0];
  return new Promise((resolve,reject)=>{
    const lookup:LookupFunction=(_hostname,options,callback)=>{
      if(typeof options==='object'&&options.all){(callback as unknown as (e:null,a:typeof addresses)=>void)(null,[address]);}
      else callback(null,address.address,address.family);
    };
    const request=httpsRequest(url,{method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers).entries()),lookup,signal:init.signal||undefined,timeout:285_000},response=>{
      const headers=new Headers();for(const [k,v] of Object.entries(response.headers)){if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(', '):v);}
      const body=Readable.toWeb(response) as ReadableStream<Uint8Array>;
      resolve(new Response(body,{status:response.statusCode||502,headers}));
    });
    request.on('timeout',()=>request.destroy(new Error('Provider request timed out.')));
    request.on('error',reject);if(init.body)request.write(init.body);request.end();
  });
}
export async function upstream(url:string,init:RequestInit={},custom=false):Promise<Response>{
  const response=custom?await pinnedFetch(validateCustomUrl(url),init):await fetch(url,{...init,redirect:'error'});
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw new ApiError('Provider redirected the request. Use its final documented API base URL.',502);}
  return response;
}
export async function readLimited(response:Response,limit=3_000_000):Promise<Uint8Array>{
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new ApiError('This media exceeds the hosted transfer limit. Use direct browser transfer or the local companion.',413);}
  if(!response.body)return new Uint8Array();const reader=response.body.getReader();const parts:Uint8Array[]=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw new ApiError('This media exceeds the hosted transfer limit. Use direct browser transfer or the local companion.',413);parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
  const result=new Uint8Array(length);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
export async function requireOk(response:Response,secret=''):Promise<Response>{
  if(response.ok)return response;
  let message=`Provider request failed (${response.status}).`;
  try{const raw=new TextDecoder().decode(await readLimited(response,30_000));const value=JSON.parse(raw);message=String(value.error?.message||value.error||value.message||message).slice(0,1800);}catch{/* Keep HTTP error when body is not JSON. */}
  if(secret)message=message.split(secret).join('[redacted]');throw new ApiError(message,response.status>=400&&response.status<600?response.status:502);
}
