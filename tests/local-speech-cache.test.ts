import {afterEach,describe,expect,it,vi} from 'vitest';
import {loadSpeechRuntime,speechRuntimeCacheKey} from '../src/lib/local-speech-cache';
afterEach(()=>vi.unstubAllGlobals());
describe('native speech runtime cache',()=>{
 it('fetches the actual native resource, stores under HTTPS, and reopens offline',async()=>{
  const resource='tauri://localhost/assets/ort-runtime-abc.wasm',entries=new Map<string,Response>();
  // Reproduce the browser Cache API's non-HTTP request restriction.
  const check=(key:string)=>{if(!/^https?:/.test(key))throw new TypeError('Request url is not HTTP/HTTPS');};
  const cache={match:vi.fn(async(key:string)=>{check(key);return entries.get(key)?.clone();}),put:vi.fn(async(key:string,response:Response)=>{check(key);entries.set(key,response.clone());})};
  vi.stubGlobal('caches',{open:vi.fn(async()=>cache)});
  const wasm=new Uint8Array([0,97,115,109,1,0,0,0]),fetcher=vi.fn(async()=>new Response(wasm));vi.stubGlobal('fetch',fetcher);
  const progress=vi.fn();expect(new Uint8Array(await loadSpeechRuntime(resource,'tauri://localhost/assets/worker.js',progress))).toEqual(wasm);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(resource);expect(progress).toHaveBeenCalledOnce();
  const key=cache.put.mock.calls[0][0];expect(key.startsWith('https://frame-cache.invalid/')).toBe(true);expect(fetcher).not.toHaveBeenCalledWith(key);
  fetcher.mockImplementation(async()=>{throw new Error('offline');});
  expect(new Uint8Array(await loadSpeechRuntime(resource,'tauri://localhost/assets/worker.js',progress))).toEqual(wasm);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('keeps HTTP cache compatibility and isolates different bundled versions',()=>{
  expect(speechRuntimeCacheKey('/assets/runtime-a.wasm','https://frame.example/assets/worker.js')).toBe('https://frame.example/assets/runtime-a.wasm');
  expect(speechRuntimeCacheKey('/assets/runtime-a.wasm','tauri://localhost/assets/worker.js')).not.toBe(speechRuntimeCacheKey('/assets/runtime-b.wasm','tauri://localhost/assets/worker.js'));
 });
});
