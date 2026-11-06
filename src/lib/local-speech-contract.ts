/** Shared metadata/protocol. Importing this file never downloads a model. */
export const LOCAL_SPEECH_MODEL = Object.freeze({
  id:'onnx-community/Kokoro-82M-v1.0-ONNX',
  revision:'1939ad2a8e416c0acfeecc08a694d14ef25f2231',
  name:'Kokoro v1.0 · local AI voice',
  modelBytes:92_361_116,
  downloadLabel:'92.4 MB model + 1.32 MB optional phonemizer; about 116 MB with runtime and a voice',
  license:'Apache-2.0',
  sampleRate:24_000,
});
export interface LocalVoice {id:string;name:string;language:string;gender:'female'|'male'}
export const LOCAL_SPEECH_VOICES:readonly LocalVoice[] = Object.freeze([
  {id:'af_heart',name:'Heart',language:'English (US)',gender:'female'},
  {id:'af_bella',name:'Bella',language:'English (US)',gender:'female'},
  {id:'af_nicole',name:'Nicole',language:'English (US)',gender:'female'},
  {id:'am_michael',name:'Michael',language:'English (US)',gender:'male'},
  {id:'am_fenrir',name:'Fenrir',language:'English (US)',gender:'male'},
  {id:'bf_emma',name:'Emma',language:'English (UK)',gender:'female'},
  {id:'bf_isabella',name:'Isabella',language:'English (UK)',gender:'female'},
  {id:'bm_george',name:'George',language:'English (UK)',gender:'male'},
]);
export interface LocalSpeechProgress {
  phase:'loading'|'downloading'|'ready'|'generating'|'complete';
  message:string;file?:string;loaded?:number;total?:number;percent?:number;
  completedChunks?:number;totalChunks?:number;
}
export interface SpeechInput {text:string;voice?:string;speed?:number}
export function validateSpeechInput(input:SpeechInput){
  if(typeof input.text!=='string'||!input.text.trim())throw new Error('Enter narration to create a local voice.');
  if(input.text.length>20_000)throw new Error('Create narration in sections of up to 20,000 characters. Completed sections remain separate audio clips.');
  const voice=input.voice||'af_heart',speed=input.speed??1;
  if(!LOCAL_SPEECH_VOICES.some(v=>v.id===voice))throw new Error('Choose one of the available local voices.');
  if(!Number.isFinite(speed)||speed<.5||speed>2)throw new Error('Local voice speed must be between 0.5 and 2.');
  return {text:input.text.trim(),voice,speed};
}
/** Preserve all non-whitespace text while bounding phonemization/inference work. */
export function splitSpeechText(text:string,maxLength=240):string[]{
  if(!Number.isInteger(maxLength)||maxLength<20)throw new Error('Invalid speech chunk length.');
  const result:string[]=[];
  for(const sentence of text.match(/[^.!?\n]+[.!?]*|[.!?]+/g)||[]){
    let remaining=sentence.trim();
    while(remaining.length>maxLength){
      const space=remaining.lastIndexOf(' ',maxLength),at=space>maxLength/3?space:maxLength;
      result.push(remaining.slice(0,at).trim());remaining=remaining.slice(at).trim();
    }
    if(remaining)result.push(remaining);
  }
  return result;
}
export function pcmToWav(chunks:readonly Float32Array[],sampleRate=LOCAL_SPEECH_MODEL.sampleRate):Blob{
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Invalid audio sample rate.');
  const count=chunks.reduce((sum,c)=>sum+c.length,0);
  if(!count)throw new Error('The voice engine returned no audio.');
  if(count>sampleRate*1800)throw new Error('This narration exceeds 30 minutes. Generate shorter sections.');
  const data=new ArrayBuffer(44+count*2),view=new DataView(data);
  const write=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i))};
  write(0,'RIFF');view.setUint32(4,36+count*2,true);write(8,'WAVE');write(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,count*2,true);
  let offset=44;
  for(const chunk of chunks)for(const sample of chunk){
    if(!Number.isFinite(sample))throw new Error('The voice engine returned invalid audio samples.');
    const value=Math.max(-1,Math.min(1,sample));view.setInt16(offset,Math.round(value*(value<0?32768:32767)),true);offset+=2;
  }
  return new Blob([data],{type:'audio/wav'});
}
export type SpeechWorkerRequest={type:'generate';id:number;input:ReturnType<typeof validateSpeechInput>}|{type:'ack';id:number;index:number};
export type SpeechWorkerEvent={type:'progress';id:number;progress:LocalSpeechProgress}|{type:'chunk';id:number;index:number;text:string;samples:Float32Array;sampleRate:number}|{type:'done';id:number}|{type:'error';id:number;message:string};
