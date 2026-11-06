import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {pcmToWav,splitSpeechText,validateSpeechInput,type SpeechWorkerEvent} from '../src/lib/local-speech-contract';
import {disposeLocalSpeech,LocalSpeechError,synthesizeLocalSpeech} from '../src/lib/local-speech';

describe('local speech audio contract',()=>{
 it('writes portable mono PCM16 WAV with real source sample values',async()=>{
  const blob=pcmToWav([new Float32Array([-1,-.5,0,.5,1,2])]);
  const view=new DataView(await blob.arrayBuffer());
  expect(blob.type).toBe('audio/wav');expect(blob.size).toBe(56);
  expect(new TextDecoder().decode(await blob.slice(0,4).arrayBuffer())).toBe('RIFF');
  expect(view.getUint16(22,true)).toBe(1);expect(view.getUint32(24,true)).toBe(24000);
  expect(view.getUint32(40,true)).toBe(12);
  expect(Array.from({length:6},(_,i)=>view.getInt16(44+i*2,true))).toEqual([-32768,-16384,0,16384,32767,32767]);
 });
 it('refuses empty, invalid, or non-finite generated audio',()=>{
  expect(()=>pcmToWav([])).toThrow('no audio');
  expect(()=>pcmToWav([new Float32Array([NaN])])).toThrow('invalid audio');
  expect(()=>pcmToWav([new Float32Array([0])],0)).toThrow('sample rate');
 });
 it('preserves text content while bounding unusually long sentences',()=>{
  const text='A long opening! '+Array.from({length:400},(_,i)=>`word${i}`).join(' ')+'? '+ 'x'.repeat(500);
  const parts=splitSpeechText(text);
  expect(parts.every(p=>p.length<=240)).toBe(true);
  expect(parts.join('').replace(/\s/g,'')).toBe(text.replace(/\s/g,''));
  expect(parts.at(-1)).toBeTruthy();
 });
 it('validates user choices before any model download',()=>{
  expect(validateSpeechInput({text:'  Hello.  '})).toEqual({text:'Hello.',voice:'af_heart',speed:1});
  for(const input of [{text:''},{text:'a'.repeat(20001)},{text:'Hi',speed:NaN},{text:'Hi',speed:3},{text:'Hi',voice:'unknown'}])expect(()=>validateSpeechInput(input)).toThrow();
 });
});

class FakeWorker {
 static instances:FakeWorker[]=[];
 onmessage:((value:{data:SpeechWorkerEvent})=>void|Promise<void>)|null=null;
 onerror:(()=>void)|null=null;
 sent:unknown[]=[];terminated=false;
 constructor(){FakeWorker.instances.push(this)}
 postMessage(value:unknown){this.sent.push(value)}
 terminate(){this.terminated=true}
 async emit(data:SpeechWorkerEvent){await this.onmessage?.({data})}
 get id(){return (this.sent[0] as {id:number}).id}
}
describe('local voice worker lifecycle',()=>{
 beforeEach(()=>{FakeWorker.instances=[];vi.stubGlobal('Worker',FakeWorker)});
 afterEach(()=>{disposeLocalSpeech();vi.unstubAllGlobals()});
 it('waits for phrase persistence before acknowledging it, then returns exact duration',async()=>{
  let finish!:()=>void;const persisted=new Promise<void>(r=>finish=r);
  const onChunk=vi.fn(()=>persisted),run=synthesizeLocalSpeech({text:'Hello.',onChunk});
  const w=FakeWorker.instances[0],delivery=w.emit({type:'chunk',id:w.id,index:0,text:'Hello.',samples:new Float32Array([.1,.2,.3]),sampleRate:24000});
  expect(onChunk).toHaveBeenCalledTimes(1);expect(w.sent).toHaveLength(1);
  finish();await delivery;expect(w.sent).toHaveLength(2);
  await w.emit({type:'done',id:w.id});const result=await run;
  expect(result.complete).toBe(true);expect(result.duration).toBe(3/24000);expect(result.blob.size).toBe(50);
 });
 it('cancels immediately and exposes completed audio without a paid fallback',async()=>{
  const signal=new AbortController(),run=synthesizeLocalSpeech({text:'Hello. Later.',signal:signal.signal}).catch(e=>e);
  const w=FakeWorker.instances[0];await w.emit({type:'chunk',id:w.id,index:0,text:'Hello.',samples:new Float32Array([.1,.2]),sampleRate:24000});
  signal.abort();const error=await run;
  expect(error).toBeInstanceOf(LocalSpeechError);expect(error.name).toBe('AbortError');
  expect(error.partial.complete).toBe(false);expect(error.partial.blob.size).toBe(48);expect(w.terminated).toBe(true);
 });
 it('rejects overlapping jobs and preserves error details',async()=>{
  const run=synthesizeLocalSpeech({text:'First.'}).catch(e=>e),w=FakeWorker.instances[0];
  await expect(synthesizeLocalSpeech({text:'Second.'})).rejects.toThrow('already running');
  await w.emit({type:'error',id:w.id,message:'Model download failed (503).'});
  expect((await run).message).toContain('503');expect(w.terminated).toBe(true);
 });
 it('never creates a worker for a cancelled or invalid request',async()=>{
  const controller=new AbortController();controller.abort();
  await expect(synthesizeLocalSpeech({text:'Hi',signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
  await expect(synthesizeLocalSpeech({text:''})).rejects.toThrow();expect(FakeWorker.instances).toHaveLength(0);
 });
});
