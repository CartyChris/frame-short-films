/** Cache API requests must use HTTP(S), even when native app resources do not. */
export function speechRuntimeCacheKey(resource:string,base:string){
 const url=new URL(resource,base);
 return url.protocol==='http:'||url.protocol==='https:'?url.href:
  `https://frame-cache.invalid/local-speech/runtime/${encodeURIComponent(url.href)}`;
}

/** The synthetic key is used only for storage. Fetch always receives the real bundled resource. */
export async function loadSpeechRuntime(resource:string,base:string,onDownload:()=>void){
 if(typeof caches==='undefined')throw new Error('Local voice needs browser storage. Enable site storage or use another browser.');
 const cache=await caches.open('frame-local-voice-runtime-v1');
 const key=speechRuntimeCacheKey(resource,base);
 const cached=await cache.match(key);
 if(cached)return cached.arrayBuffer();
 onDownload();
 const response=await fetch(resource);
 if(!response.ok)throw new Error(`Speech runtime download failed (${response.status}).`);
 const bytes=await response.arrayBuffer();
 // A fresh Response also avoids retaining a native-scheme response URL in storage.
 await cache.put(key,new Response(bytes,{headers:{'Content-Type':'application/wasm'}}));
 return bytes;
}
