import {validateSoundtrack} from './document';
import {assertRenderBounds} from './render-plan';
import {SOUND_LIMITS,type SoundtrackDocument,type SoundRenderResult} from './types';
import {encodeWav} from './pulseforge/shared/wav';
import {computePeaks} from './pulseforge/src/engine/analysis';
import {ticksToSeconds,PPQ} from './pulseforge/shared/time';
import {buildEventList} from './pulseforge/src/engine/events';

export interface SoundRenderOptions {patternId?:string;loop?:boolean;signal?:AbortSignal;onProgress?:(message:string)=>void}
let queue:Promise<unknown>=Promise.resolve();
const aborted=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('Sound render cancelled. Your editable score is saved.','AbortError')};

/** Tone's global context is used only inside this serialized, isolated offline scope. */
export function renderSoundtrack(document:SoundtrackDocument,options:SoundRenderOptions={}):Promise<SoundRenderResult>{
  const snapshot=validateSoundtrack(document);
  const job=queue.catch(()=>{}).then(()=>render(snapshot,options));queue=job.catch(()=>{});return job;
}
async function render(document:SoundtrackDocument,opts:SoundRenderOptions):Promise<SoundRenderResult>{
  aborted(opts.signal);
  const project=document.project;
  assertRenderBounds(project,opts.patternId);
  const events=buildEventList(project,opts.patternId?{patternId:opts.patternId}:undefined);
  const musicalDuration=ticksToSeconds(events.endTick,project.bpm);
  if(!Number.isFinite(musicalDuration)||musicalDuration<=0)throw new Error('Add a few notes or drum steps before rendering.');
  if(musicalDuration>SOUND_LIMITS.renderSeconds)throw new Error('Render a pattern or a cue up to 2 minutes, then loop or combine cues on the film timeline. The full editable score remains saved.');
  if(events.notes.length+events.drums.length+events.automation.length>100000)throw new Error('This cue has too many scheduled events. Render a shorter pattern.');
  opts.onProgress?.('Building your instruments and effects…');
  const Tone=await import('tone');
  const {buildGraph,scheduleEvents}=await import('./pulseforge/src/engine/graph');
  const {getEngine}=await import('./pulseforge/src/engine/instruments');
  const {EFFECT_DEFS}=await import('./pulseforge/src/engine/effects');
  // Clamp imported patch values to the actual descriptor bounds before constructing audio nodes.
  for(const ch of project.channels)if(ch.instrument.type==='synth'){
    const inst=ch.instrument;
    const definition=getEngine(inst.synthId);
    inst.params=Object.fromEntries(definition.params.map(p=>[p.key,Math.min(p.max,Math.max(p.min,inst.params[p.key]??p.default))]));
  }
  for(const ch of project.mixer.channels)for(const fx of ch.effects){const def=EFFECT_DEFS[fx.type];fx.params=Object.fromEntries(def.params.map(p=>[p.key,Math.min(p.max,Math.max(p.min,fx.params[p.key]??p.default))]));}
  const original=Tone.getContext();
  const tail=opts.loop?Math.min(4,musicalDuration):2;
  const context=new Tone.OfflineContext(2,musicalDuration+tail,SOUND_LIMITS.sampleRate);
  let graph:ReturnType<typeof buildGraph>|undefined;
  let scheduled:ReturnType<typeof scheduleEvents>|undefined;
  try{
    Tone.setContext(context);
    context.transport.PPQ=PPQ;context.transport.bpm.value=project.bpm;context.transport.timeSignature=[4,4];
    graph=buildGraph(project,context.destination,false);
    await Promise.all([...graph.instruments.values()].map(i=>i.ready).concat([...graph.mixer.values()].flatMap(m=>m.effects.map(e=>e.ready))));
    aborted(opts.signal);
    scheduled=scheduleEvents(project,events,graph,()=>null,{seed:document.spec?.seed??42});
    context.transport.start(0);
    opts.onProgress?.('Rendering audio locally…');
    // Native OfflineAudioContext cannot be stopped mid-render. Cancellation discards only this derived WAV.
    const rendered=await context.render();
    aborted(opts.signal);
    const loopSamples=Math.round(musicalDuration*SOUND_LIMITS.sampleRate);
    const channels=[0,1].map(c=>{
      const source=rendered.getChannelData(c);
      if(!opts.loop)return Float32Array.from(source);
      const out=source.slice(0,loopSamples);
      // Reuse PulseForge's loop-tail folding: a short reverb/delay tail wraps into the head.
      for(let i=loopSamples;i<source.length;i++)out[(i-loopSamples)%loopSamples]+=source[i];
      return out;
    });
    let peak=0;
    for(const ch of channels)for(const sample of ch){if(!Number.isFinite(sample))throw new Error('An instrument produced invalid audio. Change its patch and try again.');peak=Math.max(peak,Math.abs(sample));}
    if(peak<1e-5)throw new Error('This cue is silent. Check its notes, mutes and mixer levels.');
    if(peak>.98){const gain=.98/peak;for(const ch of channels)for(let i=0;i<ch.length;i++)ch[i]*=gain;peak=.98;}
    // A tiny edge fade prevents clicks in self-contained assets; a loop keeps its exact musical duration.
    const edge=Math.min(128,Math.floor(channels[0].length/2));
    for(const ch of channels)for(let i=0;i<edge;i++){ch[i]*=i/edge;ch[ch.length-1-i]*=i/edge;}
    opts.onProgress?.('Encoding portable WAV…');
    const duration=channels[0].length/SOUND_LIMITS.sampleRate;
    return {blob:new Blob([encodeWav(channels,SOUND_LIMITS.sampleRate,16)],{type:'audio/wav'}),duration,peak,peaks:computePeaks(channels[0],240),sampleRate:SOUND_LIMITS.sampleRate};
  }finally{
    scheduled?.disposeSources();graph?.dispose();context.dispose();Tone.setContext(original);
  }
}

export async function renderSoundEffect(id:string):Promise<SoundRenderResult>{
  const {FACTORY_SAMPLES}=await import('./pulseforge/src/engine/kits');
  const def=FACTORY_SAMPLES.find(x=>x.id===id);if(!def)throw new Error('Unknown sound effect.');
  // Yield once so the UI paints its working state before this short bounded DSP operation.
  await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  const data=def.render();
  if(!data.length||data.length>SOUND_LIMITS.sampleRate*15)throw new Error('Sound effect exceeds its 15-second limit.');
  let peak=0;for(const sample of data){if(!Number.isFinite(sample))throw new Error('Invalid sound effect output.');peak=Math.max(peak,Math.abs(sample));}
  return {blob:new Blob([encodeWav([data],SOUND_LIMITS.sampleRate,16)],{type:'audio/wav'}),duration:data.length/SOUND_LIMITS.sampleRate,peak,peaks:computePeaks(data,240),sampleRate:SOUND_LIMITS.sampleRate};
}
