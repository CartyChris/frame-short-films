// Vite aliases Kokoro's optional phonemizer import to this adapter. The upstream
// module (including eSpeak) is fetched by the user, never embedded in our bundle.
import type {LocalSpeechProgress} from './local-speech-contract';

export const PHONEMIZER_RUNTIME={
 url:'https://cdn.jsdelivr.net/npm/phonemizer@1.2.1/dist/phonemizer.js',
 bytes:1_322_380,
 sha256:'193481f474f7c1ea81df3195d18b45df8ef7254dbdccb3f193d60215c4897bec',
 cache:'frame-local-phonemizer-v1',
} as const;
type Phonemizer={phonemize:(text:string,language?:string)=>Promise<string[]>};
let loading:Promise<Phonemizer>|undefined;

export async function verifyPhonemizer(bytes:ArrayBuffer){
 if(bytes.byteLength!==PHONEMIZER_RUNTIME.bytes)throw new Error('The phonemizer download has an unexpected size. Nothing was executed.');
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const actual=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 if(actual!==PHONEMIZER_RUNTIME.sha256)throw new Error('The phonemizer fingerprint did not match the pinned release. Nothing was executed.');
}
async function download(progress?:(event:LocalSpeechProgress)=>void){
 const response=await fetch(PHONEMIZER_RUNTIME.url,{credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok||!response.body)throw new Error(`The optional phonemizer could not download (${response.status}). Check your connection and try again.`);
 const reader=response.body.getReader(),bytes=new Uint8Array(PHONEMIZER_RUNTIME.bytes);let length=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;if(length+value.length>bytes.length)throw new Error('The phonemizer download exceeded its pinned size. Nothing was executed.');bytes.set(value,length);length+=value.length;progress?.({phase:'downloading',message:'Downloading the optional phonemizer from its publisher.',file:'Phonemizer · 1.32 MB',loaded:length,total:bytes.length,percent:100*length/bytes.length});}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 if(length!==bytes.length)throw new Error('The phonemizer download ended early. Try again when connected.');
 return bytes.buffer;
}
export function preparePhonemizer(progress?:(event:LocalSpeechProgress)=>void):Promise<Phonemizer>{
 if(loading)return loading;
 loading=(async()=>{
  if(typeof caches==='undefined')throw new Error('Local speech needs browser cache storage. Enable site storage first.');
  const cache=await caches.open(PHONEMIZER_RUNTIME.cache);let bytes:ArrayBuffer|undefined;
  const cached=await cache.match(PHONEMIZER_RUNTIME.url);
  if(cached){try{bytes=await cached.arrayBuffer();await verifyPhonemizer(bytes);}catch{bytes=undefined;await cache.delete(PHONEMIZER_RUNTIME.url);}}
  if(!bytes){bytes=await download(progress);await verifyPhonemizer(bytes);await cache.put(PHONEMIZER_RUNTIME.url,new Response(bytes,{headers:{'Content-Type':'text/javascript'}}));}
  const url=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));
  try{const module=await import(/* @vite-ignore */ url) as Partial<Phonemizer>;if(typeof module.phonemize!=='function')throw new Error('The optional phonemizer has an unsupported interface.');return module as Phonemizer;}
  finally{URL.revokeObjectURL(url);}
 })().catch(error=>{loading=undefined;throw error;});
 return loading;
}
export async function phonemize(text:string,language?:string){return (await preparePhonemizer()).phonemize(text,language);}
