import {KokoroTTS,type GenerateOptions} from 'kokoro-js';
import {env} from '@huggingface/transformers';
import {preparePhonemizer} from './local-phonemizer';
import {loadSpeechRuntime} from './local-speech-cache';
import ortWasm from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import ortModule from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import {LOCAL_SPEECH_MODEL,splitSpeechText,validateSpeechInput,type SpeechWorkerRequest,type SpeechWorkerEvent,type LocalSpeechProgress} from './local-speech-contract';

const send=(event:SpeechWorkerEvent,transfer:Transferable[]=[])=>self.postMessage(event,{transfer});
let engine:KokoroTTS|undefined,working=false,ack:{id:number;index:number;resolve:()=>void}|undefined;
env.allowLocalModels=false;env.useBrowserCache=true;
env.remotePathTemplate=`{model}/resolve/${LOCAL_SPEECH_MODEL.revision}/`;
env.backends.onnx.wasm!.wasmPaths={wasm:ortWasm,mjs:ortModule};
env.backends.onnx.wasm!.numThreads=1; // Works without cross-origin isolation, including the Mac webview.
env.backends.onnx.wasm!.proxy=false; // This module already runs off the editor thread.

async function prepareRuntime(progress:(value:LocalSpeechProgress)=>void){
  const bytes=await loadSpeechRuntime(ortWasm,import.meta.url,()=>{
    progress({phase:'downloading',message:'Downloading the local speech runtime.',file:'Speech runtime'});
  });
  // Large WASM files are not reliably retained by the browser HTTP cache.
  // Supply the persisted bytes directly so a new worker can initialize offline.
  env.backends.onnx.wasm!.wasmBinary=new Uint8Array(bytes);
}

async function cacheVoice(voice:string){
  if(typeof caches==='undefined')throw new Error('Local voice needs browser storage. Enable site storage or use another browser.');
  const cache=await caches.open('kokoro-voices');
  const root=`https://huggingface.co/${LOCAL_SPEECH_MODEL.id}/resolve/`;
  const pinned=`${root}${LOCAL_SPEECH_MODEL.revision}/voices/${voice}.bin`,libraryKey=`${root}main/voices/${voice}.bin`;
  let response=await cache.match(pinned);
  if(!response){response=await fetch(pinned);if(!response.ok)throw new Error(`Voice download failed (${response.status}). Check your connection and try again.`);await cache.put(pinned,response.clone());}
  // The pinned library uses a fixed main URL; populate its cache from our pinned revision.
  await cache.put(libraryKey,response.clone());
}
self.onmessage=async({data}:{data:SpeechWorkerRequest})=>{
  if(data.type==='ack'){if(ack?.id===data.id&&ack.index===data.index){ack.resolve();ack=undefined}return}
  if(working){send({type:'error',id:data.id,message:'A local narration is already running.'});return}
  working=true;const {id}=data;
  const progress=(value:LocalSpeechProgress)=>send({type:'progress',id,progress:value});
  try{
    const input=validateSpeechInput(data.input);
    if(!engine){
      progress({phase:'loading',message:'Preparing Kokoro. The first use downloads the voice model.'});
      await prepareRuntime(progress);
      await preparePhonemizer(progress);
      engine=await KokoroTTS.from_pretrained(LOCAL_SPEECH_MODEL.id,{dtype:'q8',device:'wasm',progress_callback:value=>{
        if(value.status==='progress')progress({phase:'downloading',message:`Downloading ${value.file}`,file:value.file,loaded:value.loaded,total:value.total,percent:value.progress});
      }});
      // Refuse silent tokenizer truncation; exceptionally long phoneme sequences are split below.
      engine.tokenizer=new Proxy(engine.tokenizer,{apply(target,thisArg,args){const output=Reflect.apply(target,thisArg,[args[0],{...args[1],truncation:false}]);if(output.input_ids.dims.at(-1)>510)throw new Error('FRAME_SPEECH_PHRASE_TOO_LONG');return output;}});
    }
    await cacheVoice(input.voice);
    progress({phase:'ready',message:'Voice model ready. Generating entirely on this device.'});
    const phrases=splitSpeechText(input.text);let samples=0,index=0;
    while(phrases.length){
      const text=phrases.shift()!;
      progress({phase:'generating',message:`Creating phrase ${index+1} of ${index+phrases.length+1}`,completedChunks:index,totalChunks:index+phrases.length+1});
      let audio;
      try{audio=await engine.generate(text,{voice:input.voice as GenerateOptions['voice'],speed:input.speed});}
      catch(error){if(error instanceof Error&&error.message==='FRAME_SPEECH_PHRASE_TOO_LONG'&&text.length>20){phrases.unshift(...splitSpeechText(text,Math.max(20,Math.floor(text.length/2))));continue}throw error}
      const pcm=new Float32Array(audio.audio);samples+=pcm.length;
      if(samples>LOCAL_SPEECH_MODEL.sampleRate*1800)throw new Error('Narration reached 30 minutes. Continue with another section; completed phrases have been preserved.');
      if(!pcm.length||!pcm.every(Number.isFinite))throw new Error('The voice model returned invalid audio.');
      const received=new Promise<void>(resolve=>{ack={id,index,resolve}});
      send({type:'chunk',id,index,text,samples:pcm,sampleRate:audio.sampling_rate},[pcm.buffer]);
      await received;index++;
    }
    progress({phase:'complete',message:'Local narration is ready.',completedChunks:index,totalChunks:index});send({type:'done',id});
  }catch(error){send({type:'error',id,message:`Local voice could not finish: ${error instanceof Error?error.message:String(error)}. Completed phrases remain recoverable. No paid service was used.`});}
  finally{working=false;ack=undefined}
};
