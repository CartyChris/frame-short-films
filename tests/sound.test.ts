import {describe,it,expect} from 'vitest';
import {composeSoundtrack} from '../src/lib/sound/compose';
import {validateSoundtrack,exportSoundtrack,importSoundtrack} from '../src/lib/sound/document';
import {buildEventList} from '../src/lib/sound/pulseforge/src/engine/events';
import {buildProduction,validateProductionSpec} from '../src/lib/sound/pulseforge/shared/producer';
import {synthKick,synthRiser} from '../src/lib/sound/pulseforge/src/engine/dsp';
import {encodeWav} from '../src/lib/sound/pulseforge/shared/wav';
import {computePeaks} from '../src/lib/sound/pulseforge/src/engine/analysis';
import {strToU8,zipSync} from 'fflate';
import {assertRenderBounds} from '../src/lib/sound/render-plan';

const cue=()=>composeSoundtrack({prompt:'Warm piano',genre:'lofi',mood:'warm',bpm:100,key:'D',seed:71,bars:2,parts:['drums','bass','chords','melody']});
describe('PulseForge sound integration',()=>{
  it('uses a reproducible real composition containing drum and pitched events',()=>{
    const spec=validateProductionSpec({genre:'lofi',seed:71,sections:[{name:'Cue',role:'hook',bars:2,energy:.7}]});
    const a=buildProduction(spec),b=buildProduction(spec);expect(a).toEqual(b);
    expect(a.parts.some(p=>p.drums&&Object.values(p.drums).some(h=>h.length))).toBe(true);
    expect(a.parts.some(p=>p.notes&&p.notes.length>5)).toBe(true);
    expect(buildProduction({...spec,seed:72})).not.toEqual(a);
    const document=cue(),events=buildEventList(document.project);
    expect(events.notes.length).toBeGreaterThan(5);expect(events.drums.length).toBeGreaterThan(10);
    expect(document.project.mixer.channels.some(c=>c.effects.length>0)).toBe(true);
  });
  it('renders deterministic procedural PCM and correctly sized portable WAV bytes',()=>{
    const a=synthKick({seed:91}),b=synthKick({seed:91});expect(a).toEqual(b);
    expect(a.some(n=>Math.abs(n)>.1)).toBe(true);expect(a.every(Number.isFinite)).toBe(true);
    const riff=encodeWav([a],44100,16),v=new DataView(riff);
    expect(new TextDecoder().decode(riff.slice(0,4))).toBe('RIFF');expect(v.getUint32(40,true)).toBe(a.length*2);expect(riff.byteLength).toBe(a.length*2+44);
    const peaks=computePeaks(synthRiser({seconds:.5,seed:91}),64);expect(peaks.length).toBe(128);expect(peaks.some(n=>Math.abs(n)>.01)).toBe(true);
  });
  it('rejects sampled sessions, external audio and missing arrangement references',()=>{
    const d=cue();d.project.channels[0].instrument={type:'synth',synthId:'sampled-grand-piano',presetId:'grand-piano',params:{}};
    expect(()=>validateSoundtrack(d)).toThrow(/samples/);
    const invalid=cue();invalid.project.clips[0].patternId='missing';expect(()=>validateSoundtrack(invalid)).toThrow(/missing pattern/);
  });
  it('bounds malformed, nonfinite and huge source values before rendering',()=>{
    const bad=cue();bad.project.bpm=NaN;expect(()=>validateSoundtrack(bad)).toThrow(/invalid number/);
    const long=cue();long.project.clips[0].lengthTicks=1e8;expect(()=>validateSoundtrack(long)).toThrow(/30 minutes/);
    const notes=cue(),pattern=notes.project.patterns.find(p=>Object.values(p.notes).some(ns=>ns.length))!;
    const id=Object.keys(pattern.notes)[0];pattern.notes[id][0].startTick=999999;expect(()=>validateSoundtrack(notes)).toThrow(/outside/);
  });
  it('rejects audio feedback loops and duplicate IDs',()=>{
    const d=cue(),bus=d.project.mixer.channels.find(c=>c.kind==='bus')!,track=d.project.mixer.channels.find(c=>c.kind==='track')!;
    bus.outputId=track.id;track.outputId=bus.id;expect(()=>validateSoundtrack(d)).toThrow(/feedback/);
    const dup=cue();dup.project.channels.push(dup.project.channels[0]);expect(()=>validateSoundtrack(dup)).toThrow(/Duplicate/);
  });
  it('soloing one rack instrument actually removes other note/drum events',()=>{
    const d=cue(),ch=d.project.channels.find(c=>c.instrument.type==='synth')!;ch.soloed=true;
    const events=buildEventList(d.project);expect(events.notes.length).toBeGreaterThan(0);
    expect(events.notes.every(e=>e.channelId===ch.id)).toBe(true);expect(events.drums.every(e=>e.channelId===ch.id)).toBe(true);
  });
  it('round-trips an editable native PulseForge archive without rewriting note IDs',async()=>{
    const d=cue(),original=structuredClone(d.project);const file=exportSoundtrack(d);
    const imported=await importSoundtrack(file);expect(imported.project).toEqual(original);expect(imported.project.patterns[0].id).toBe(original.patterns[0].id);
  });
  it('rejects explosive pattern expansion before constructing repeated events',()=>{
    const d=cue(),pattern=d.project.patterns[0],clip=d.project.clips.find(c=>c.patternId===pattern.id)!;pattern.lengthSteps=1;pattern.steps={[d.project.channels[0].id]:Array.from({length:1000},()=>({index:0,velocity:.8,micro:0,probability:1}))};pattern.notes={};clip.lengthTicks=24000;d.project.bpm=200;
    expect(()=>assertRenderBounds(d.project)).toThrow(/too many scheduled events/);
    expect(()=>assertRenderBounds(d.project,pattern.id)).not.toThrow();
  });
  it('rejects extra archive entries rather than silently losing user audio',async()=>{
    const bytes=zipSync({'project.json':strToU8(JSON.stringify(cue().project)),'audio/take.wav':new Uint8Array([1,2,3])});
    await expect(importSoundtrack(new Blob([bytes as Uint8Array<ArrayBuffer>]))).rejects.toThrow(/synth-only/);
  });
});
