import {migrateProject,MASTER_ID,type Project as MusicProject} from './pulseforge/shared/project';
import {validateProductionSpec} from './pulseforge/shared/producer';
import {ticksToSeconds} from './pulseforge/shared/time';
import {SOUND_LIMITS,type SoundtrackDocument} from './types';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';

const ENGINES=new Set(['subtractive','fm','pad','pluck','piano','epiano','bass808','bass','string','organ','supersaw','am','brass','strings-synth']);
const KITS=new Set(['modern-hiphop','trap-808','electronic','acoustic-essentials','lofi-dust','world-perc','drill-uk','classic-808','classic-909','boom-bap','house','techno','afrobeats','reggaeton','phonk','jersey-club','dnb','dancehall','pop','rnb','eighties','dubstep']);
function check(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message)}
function finiteTree(value:unknown,depth=0):void {
  check(depth<24,'Sound source is nested too deeply.');
  if(typeof value==='number')check(Number.isFinite(value)&&Math.abs(value)<=1e12,'Sound source contains an invalid number.');
  if(typeof value==='string')check(value.length<=20000,'Sound source contains an oversized text field.');
  if(value&&typeof value==='object'){
    check(Object.keys(value).length<=SOUND_LIMITS.notes,'Sound source has too many entries.');
    for(const [key,child] of Object.entries(value)){check(!['__proto__','prototype','constructor'].includes(key),'Invalid sound source key.');finiteTree(child,depth+1)}
  }
}
const ids=(items:{id:string}[],label:string)=>{const set=new Set(items.map(x=>x.id));check(set.size===items.length,`Duplicate ${label} ID.`);for(const id of set)check(id.length<=160,`${label} ID is too long.`);return set};

export function validateSoundtrack(input:unknown):SoundtrackDocument {
  check(input&&typeof input==='object','Not a sound project.');
  finiteTree(input);
  check(JSON.stringify(input).length<=SOUND_LIMITS.jsonBytes,'Sound source is too large (4 MB maximum).');
  const raw=input as Record<string,unknown>;
  check(raw.version===1,'Unsupported sound document version.');
  const p=migrateProject(raw.project);
  check(p.channels.length<=SOUND_LIMITS.channels&&p.patterns.length<=SOUND_LIMITS.patterns&&p.clips.length<=SOUND_LIMITS.clips&&p.mixer.channels.length<=SOUND_LIMITS.mixer,'Sound project exceeds the track or pattern limit.');
  check(p.timeSignature.num===4&&p.timeSignature.den===4,'Sound Studio currently supports 4/4 scores.');
  check(!p.assets.length&&!p.takes.length,'This session contains external audio. Export those tracks as WAV from PulseForge, then import them in Film mix.');
  const channels=ids(p.channels,'channel'),patterns=ids(p.patterns,'pattern'),tracks=ids(p.tracks,'track'),mix=ids(p.mixer.channels,'mixer');ids(p.clips,'clip');
  check(p.mixer.channels.filter(x=>x.kind==='master').length===1&&p.mixer.channels.some(x=>x.id===MASTER_ID&&x.kind==='master'),'Sound source needs exactly one master output.');
  let count=0;
  for(const ch of p.channels){
    check(!ch.mixerChannelId||mix.has(ch.mixerChannelId),'Instrument refers to a missing mixer channel.');
    if(ch.instrument.type==='synth'){
      check(ENGINES.has(ch.instrument.synthId),'This instrument needs samples or an unsupported engine. Export its audio from PulseForge instead.');
      check(Object.keys(ch.instrument.params).length<=64,'Too many instrument parameters.');
      for(const v of Object.values(ch.instrument.params))check(Math.abs(v)<=40000,'Instrument parameter is outside the supported range.');
    } else if(ch.instrument.type==='drum-sound'||ch.instrument.type==='drum-kit')check(KITS.has(ch.instrument.kitId),'Unknown drum kit.');
    else throw new Error('Sample instruments need external audio. Export them as WAV from PulseForge first.');
  }
  for(const pat of p.patterns){
    for(const [channel,list] of Object.entries(pat.notes)){check(channels.has(channel),'Notes refer to a missing instrument.');ids(list,'note');count+=list.length;for(const n of list)check(n.startTick<pat.lengthSteps*24&&n.lengthTicks<=6144,'A note lies outside its pattern.');}
    for(const [channel,list] of Object.entries(pat.steps)){check(channels.has(channel),'Steps refer to a missing instrument.');count+=list.length;for(const s of list)check(s.index<pat.lengthSteps,'A step lies outside its pattern.');}
  }
  check(count<=SOUND_LIMITS.notes,'Sound project has too many notes.');
  for(const track of p.tracks)check(!track.mixerChannelId||mix.has(track.mixerChannelId),'Track refers to a missing mixer.');
  for(const clip of p.clips){
    check(tracks.has(clip.trackId),'Clip refers to a missing track.');
    check(ticksToSeconds(clip.startTick+clip.lengthTicks,p.bpm)<=SOUND_LIMITS.scoreSeconds,'Keep each editable music cue below 30 minutes; loop cues on the film timeline.');
    if(clip.kind==='pattern')check(clip.patternId&&patterns.has(clip.patternId),'Clip refers to a missing pattern.');
    if(clip.kind==='audio')throw new Error('This session contains audio clips. Export them as WAV from PulseForge and use Film mix.');
    check(clip.automationPoints.length<=2000,'Too many automation points.');
    for(const pt of clip.automationPoints)check(pt.tick<=clip.lengthTicks&&pt.value>=0&&pt.value<=1,'Invalid automation point.');
    if(clip.kind==='automation'){
      const target=clip.automationTarget;check(target,'Automation target is missing.');
      check(target.kind!=='bpm'&&target.kind!=='channel-volume','Tempo and rack-volume automation are not supported in Sound Studio.');
      check(target.mixerChannelId&&mix.has(target.mixerChannelId),'Automation refers to a missing mixer.');
      if(target.kind==='effect-param')check(p.mixer.channels.find(m=>m.id===target.mixerChannelId)?.effects.some(f=>f.id===target.effectId),'Automation refers to a missing effect.');
    }
  }
  const edges=new Map<string,string[]>();
  for(const ch of p.mixer.channels){
    check(ch.effects.length<=SOUND_LIMITS.effectsPerChannel&&ch.sends.length<=16,'Too many mixer effects or sends.');ids(ch.effects,'effect');
    for(const fx of ch.effects){check(Object.keys(fx.params).length<=32,'Too many effect parameters.');for(const n of Object.values(fx.params))check(Math.abs(n)<=40000,'Effect parameter exceeds the supported range.');}
    const links=[...(ch.kind==='master'?[]:[ch.outputId??MASTER_ID]),...ch.sends.map(s=>s.toChannelId)];
    for(const id of links)check(mix.has(id)&&id!==ch.id,'Invalid mixer routing.');
    check(!ch.sidechainFromId||(mix.has(ch.sidechainFromId)&&ch.sidechainFromId!==ch.id),'Invalid sidechain source.');edges.set(ch.id,links);
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  const visit=(id:string)=>{check(!visiting.has(id),'Mixer feedback loops are not supported.');if(visited.has(id))return;visiting.add(id);for(const next of edges.get(id)??[])visit(next);visiting.delete(id);visited.add(id)};for(const id of mix)visit(id);
  // Free-form host UI metadata is unnecessary in Frame and can carry large unrelated state.
  p.ui={};
  return {version:1,project:p,...(raw.spec?{spec:validateProductionSpec(raw.spec)}:{})};
}

export function soundDuration(p:MusicProject){return ticksToSeconds(Math.max(0,...p.clips.map(c=>c.startTick+c.lengthTicks)),p.bpm)}
export async function importSoundtrack(file:Blob):Promise<SoundtrackDocument>{
  check(file.size<=SOUND_LIMITS.jsonBytes,'Sound project exceeds the 4 MB import limit.');
  const bytes=new Uint8Array(await file.arrayBuffer());let raw:unknown;
  if(bytes[0]===0x50&&bytes[1]===0x4b){
    let rejected=false;
    const entries=unzipSync(bytes,{filter:f=>{if(f.name!=='project.json'){rejected=true;return false}if(f.originalSize>SOUND_LIMITS.jsonBytes){rejected=true;return false}return true}});
    check(!rejected&&entries['project.json'],'Import a synth-only PulseForge archive. Audio/sample files need WAV export from PulseForge.');
    raw=JSON.parse(strFromU8(entries['project.json']));
  }else raw=JSON.parse(new TextDecoder().decode(bytes));
  return validateSoundtrack(raw&&typeof raw==='object'&&'project' in raw?raw:{version:1,project:raw});
}
export function exportSoundtrack(document:SoundtrackDocument):Blob {
  const clean=validateSoundtrack(document);
  // A normal PulseForge archive containing its native project schema is interoperable.
  const bytes=zipSync({'project.json':strToU8(JSON.stringify(clean.project))});
  return new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/zip'});
}
