import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {locateScene} from '../src/lib/wasm';
interface Core {core_version():number;core_timeline_reset():void;core_timeline_push(d:number):void;core_timeline_index(t:number):number;core_timeline_local_time(t:number):number;core_ease(t:number):number;core_checksum_step(h:number,b:number):number}
describe('compiled Rust WASM artifact',()=>{
 it('loads the ABI and agrees with fallback on boundaries and long timelines',async()=>{
  const {instance}=await WebAssembly.instantiate(readFileSync(new URL('../public/film_core.wasm',import.meta.url)));
  const core=instance.exports as unknown as Core;expect(core.core_version()).toBe(1);
  const durations=Array.from({length:10000},(_,i)=>i%7===0?0:i%5+1);
  core.core_timeline_reset();durations.forEach(d=>core.core_timeline_push(d));
  for(const t of [-1,0,.5,1,10,100,1000,25000,1e9]){
   const expected=locateScene(durations,t);expect(core.core_timeline_index(t)).toBe(expected.index);expect(core.core_timeline_local_time(t)).toBe(expected.localTime);
  }
  expect(core.core_ease(.5)).toBe(.5);
  let checksum=0x811c9dc5;for(const byte of new TextEncoder().encode('hello'))checksum=core.core_checksum_step(checksum,byte)>>>0;expect(checksum).toBe(0x4f9f2cab);
 });
});
