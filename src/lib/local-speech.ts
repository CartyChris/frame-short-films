import {LOCAL_SPEECH_MODEL,pcmToWav,validateSpeechInput,type LocalSpeechProgress,type SpeechInput,type SpeechWorkerEvent,type SpeechWorkerRequest} from './local-speech-contract';
export {LOCAL_SPEECH_MODEL,LOCAL_SPEECH_VOICES,type LocalVoice,type LocalSpeechProgress,pcmToWav} from './local-speech-contract';
export interface LocalSpeechResult {blob:Blob;duration:number;engine:'Kokoro · WASM';model:string;voice:string;text:string;complete:boolean}
export interface LocalSpeechChunk extends LocalSpeechResult {index:number}
export interface LocalSpeechOptions extends SpeechInput {
  signal?:AbortSignal;onProgress?:(progress:LocalSpeechProgress)=>void;
  /** Awaited before the next phrase; callers can durably save each finished phrase. */
  onChunk?:(chunk:LocalSpeechChunk)=>void|Promise<void>;
}
export class LocalSpeechError extends Error {
  constructor(message:string,public readonly partial?:LocalSpeechResult,cancelled=false){super(message);this.name=cancelled?'AbortError':'LocalSpeechError'}
}
let worker:Worker|undefined,active=false,sequence=0;
/** Release idle model memory. Cancelling an active request should use its AbortSignal. */
export function disposeLocalSpeech(){if(active)throw new Error('Stop the current narration before releasing its voice model.');worker?.terminate();worker=undefined;}
export function localSpeechAvailable(){return typeof Worker!=='undefined'&&typeof WebAssembly!=='undefined'}

/** Explicit user action only: never call automatically while rendering or restoring a film. */
export async function synthesizeLocalSpeech(options:LocalSpeechOptions):Promise<LocalSpeechResult>{
  const input=validateSpeechInput(options);
  if(options.signal?.aborted)throw new LocalSpeechError('Local narration was cancelled.',undefined,true);
  if(!localSpeechAvailable())throw new LocalSpeechError('This browser cannot run the local voice engine. Use a current desktop browser or import a recording.');
  if(active)throw new LocalSpeechError('A local narration is already running. Stop it before starting another.');
  active=true;const id=++sequence,chunks:Float32Array[]=[],texts:string[]=[];
  const result=(complete:boolean):LocalSpeechResult=>({blob:pcmToWav(chunks),duration:chunks.reduce((n,c)=>n+c.length,0)/LOCAL_SPEECH_MODEL.sampleRate,engine:'Kokoro · WASM',model:LOCAL_SPEECH_MODEL.id,voice:input.voice,text:texts.join(' '),complete});
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{active=false;options.signal?.removeEventListener('abort',abort);if(worker){worker.onmessage=null;worker.onerror=null;}};
    const fail=(message:string,cancelled=false)=>{if(settled)return;settled=true;const partial=chunks.length?result(false):undefined;worker?.terminate();worker=undefined;cleanup();reject(new LocalSpeechError(message,partial,cancelled));};
    const abort=()=>fail('Local narration stopped. Completed phrases are available in the partial result.',true);
    try{
      worker??=new Worker(new URL('./local-speech.worker.ts',import.meta.url),{type:'module',name:'frame-local-voice'});
      worker.onerror=()=>fail('The local voice worker could not start. Reload the app and check browser storage, WebAssembly support, or content restrictions.');
      worker.onmessage=async({data}:{data:SpeechWorkerEvent})=>{
        if(settled||data.id!==id)return;
        try{
          if(data.type==='progress')options.onProgress?.(data.progress);
          else if(data.type==='error')fail(data.message);
          else if(data.type==='chunk'){
            if(data.index!==chunks.length||data.sampleRate!==LOCAL_SPEECH_MODEL.sampleRate)throw new Error('The local voice returned an out-of-order audio phrase.');
            const blob=pcmToWav([data.samples]);chunks.push(data.samples);texts.push(data.text);
            await options.onChunk?.({blob,duration:data.samples.length/data.sampleRate,engine:'Kokoro · WASM',model:LOCAL_SPEECH_MODEL.id,voice:input.voice,text:data.text,complete:false,index:data.index});
            if(!settled)worker?.postMessage({type:'ack',id,index:data.index} satisfies SpeechWorkerRequest);
          }else if(data.type==='done'){
            const audio=result(true);settled=true;cleanup();resolve(audio);
          }
        }catch(error){fail(error instanceof Error?error.message:String(error))}
      };
      options.signal?.addEventListener('abort',abort,{once:true});
      if(options.signal?.aborted){abort();return}
      options.onProgress?.({phase:'loading',message:'Loading the local voice engine. Your narration stays on this device.'});
      worker.postMessage({type:'generate',id,input} satisfies SpeechWorkerRequest);
    }catch(error){fail(error instanceof Error?error.message:String(error))}
  });
}
