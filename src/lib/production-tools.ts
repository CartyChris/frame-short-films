import {normalizeComfyCloudJob} from './comfy-cloud';
import {normalizeHiggsfieldJob} from './higgsfield-cloud';
import {normalizeFreefieldJob} from './freefield';
import {freefieldLocalUrl} from './freefield-client';
import type {Asset,Layer,Project,Scene} from './types';
import type {BeatAnalysis,CaptionCue,CaptionImport,ComfyJob,ComfyStatus,ComfyWorkflow,CutList,ProductionToolsDocument} from './production-tools-types';
import type {CompanionSettings} from './integrations';
import {newLayer} from './defaults';
import {splitScene} from './editing';
export const emptyProductionTools=():ProductionToolsDocument=>({version:1,captionImports:[],beatAnalyses:[],cutLists:[],comfyJobs:[]});
const MAX_TEXT=4*1024*1024,MAX_ITEMS=20000,MAX_TIME=86400;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const bounded=(v:unknown,min=0,max=MAX_TIME):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const str=(v:unknown,max=5000):v is string=>typeof v==='string'&&v.length<=max;
const identifier=(v:unknown):v is string=>str(v,160)&&v.length>0;
function fail(text:string):never{throw new Error(text)}
function textInput(text:string){if(text.length>MAX_TEXT)fail('Choose a text file smaller than 4 MB.');return text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')}
function jsonInput(text:string):unknown{try{return JSON.parse(textInput(text))}catch(e){if(e instanceof SyntaxError)fail('Choose valid JSON. For LosslessCut JSON5 projects, export a seconds CSV and import that file.');throw e}}
export function parseTimestamp(value:string):number {
 const v=value.trim().replace(',','.');if(/^\d+(?:\.\d+)?$/.test(v)){const n=Number(v);if(bounded(n))return n}
 const m=/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(v);
 if(!m||Number(m[2])>=60||Number(m[3])>=60)fail(`Invalid timestamp: ${value.slice(0,80)}`);
 const n=Number(m[1]||0)*3600+Number(m[2])*60+Number(m[3])+Number('0.'+(m[4]||'0'));if(!bounded(n))fail('Timestamp exceeds 24 hours.');return n;
}
function cue(raw:Record<string,unknown>,index:number):CaptionCue {
 if(!bounded(raw.start)||!bounded(raw.end)||raw.end<=raw.start||!str(raw.text,10000)||!raw.text.trim())fail(`Caption ${index+1} needs text and increasing start/end seconds.`);
 if(raw.speaker!==undefined&&!str(raw.speaker,200))fail('Invalid caption speaker.');
 return {id:crypto.randomUUID(),start:raw.start,end:raw.end,text:raw.text.trim(),...(str(raw.speaker,200)?{speaker:raw.speaker}:{})};
}
export function parseCaptions(text:string,name:string,mode:'segments'|'words'='segments'):CaptionImport {
 text=textInput(text);const format=/\.json$/i.test(name)||text.trimStart().startsWith('{')?'whisperx':/^WEBVTT\b/.test(text.trimStart())||/\.vtt$/i.test(name)?'vtt':'srt';const warnings:string[]=[],cues:CaptionCue[]=[];
 if(format==='whisperx'){
  const value=jsonInput(text);if(!object(value)||!Array.isArray(value.segments)||value.segments.length>MAX_ITEMS)fail('WhisperX JSON must contain at most 20,000 segments.');
  const words=Array.isArray(value.word_segments)?value.word_segments:value.segments.flatMap(s=>object(s)&&Array.isArray(s.words)?s.words:[]);if(words.length>MAX_ITEMS)fail('Use at most 20,000 aligned words.');
  const missing=words.filter(w=>object(w)&&(!bounded(w.start)||!bounded(w.end)||Number(w.end)<=Number(w.start)));
  if(mode==='words'){for(const [i,w]of words.entries()){if(!object(w))fail('Invalid word alignment.');if(!bounded(w.start)||!bounded(w.end)||w.end<=w.start)continue;cues.push(cue({...w,text:w.word},i));}if(missing.length)warnings.push(`Unaligned words are not assigned invented times: ${missing.map(w=>String((w as Record<string,unknown>).word||'')).join(' ').slice(0,800)}. Use segment mode to preserve these words on screen.`);if(!cues.length)fail('No aligned words found. Import this file in segment mode instead.');}
  else{for(const [i,s]of value.segments.entries()){if(!object(s))fail(`Caption ${i+1} is not an object.`);if(typeof s.text==='string'&&!s.text.trim())continue;cues.push(cue(s,i));}if(missing.length)warnings.push(`${missing.length} words have no aligned timestamps. Segment timing is used; no word times were invented.`);}
 }else{
  const blocks=text.trim().split(/\n[\t ]*\n/);if(blocks.length>MAX_ITEMS+100)fail('Too many caption blocks.');
  for(const block of blocks){if(/^(WEBVTT|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block)){if(/^(STYLE|REGION)/.test(block))warnings.push('WebVTT styling/regions are not imported. Caption position remains editable.');continue}
   const lines=block.split('\n'),i=lines.findIndex(l=>l.includes('-->'));if(i<0){if(block.trim())fail('A caption block is missing its timestamp line.');continue}
   const timing=/^\s*(\S+)\s+-->\s+(\S+)(.*)$/.exec(lines[i]);if(!timing)fail('Invalid caption timestamp line.');
   const body=lines.slice(i+1).join('\n').trim();if(!body)continue;
   if(timing[3].trim())warnings.push('WebVTT positioning settings are not imported.');
   // Caption markup is flattened to text; it is never interpreted as HTML.
   const plain=body.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
   cues.push(cue({start:parseTimestamp(timing[1]),end:parseTimestamp(timing[2]),text:plain},cues.length));
  }
 }
 if(!cues.length)fail('No timed captions found.');if(cues.length>MAX_ITEMS)fail('Use at most 20,000 captions.');
 return {id:crypto.randomUUID(),name:name.slice(0,250),format,createdAt:Date.now(),offset:0,cues:cues.sort((a,b)=>a.start-b.start),warnings:[...new Set(warnings)]};
}
export function applyCaptions(project:Project,source:CaptionImport):Project {
 const docs=project.productionTools||emptyProductionTools();if(docs.captionImports.find(v=>v.id===source.id)?.applied)return project;
 const starts:number[]=[],ends:number[]=[];let time=0,count=0;for(const scene of project.scenes){starts.push(time);time+=scene.duration;ends.push(time)}const additions:Layer[][]=project.scenes.map(()=>[]);
 for(const item of source.cues){const begin=item.start+source.offset,end=item.end+source.offset;let lo=0,hi=ends.length;while(lo<hi){const mid=(lo+hi)>>>1;if(ends[mid]<=begin)lo=mid+1;else hi=mid}for(let i=lo;i<starts.length&&starts[i]<end;i++){const a=Math.max(starts[i],begin),b=Math.min(ends[i],end);if(b<=a)continue;if(++count>100000)fail('This import would create more than 100,000 caption layers. Split it into smaller caption sets.');
 additions[i].push({id:crypto.randomUUID(),assetId:'',type:'text',name:`Caption · ${item.speaker?item.speaker+': ':''}${item.text.slice(0,50)}`,text:item.text,start:a-starts[i],duration:b-a,x:50,y:87,width:88,opacity:1,rotation:0,blend:'normal',volume:0,muted:false,loop:false,fadeIn:0,fadeOut:0,trim:0});}}
 const scenes=project.scenes.map((scene,i)=>additions[i].length?{...scene,layers:[...scene.layers,...additions[i]]}:scene);
 if(!count)fail('These captions fall outside the film. Adjust the offset before applying.');
 const saved={...source,applied:true};return {...project,scenes,productionTools:{...docs,captionImports:[...docs.captionImports.filter(v=>v.id!==source.id),saved]}};
}
function times(value:unknown,name:string,duration:number):number[]{if(!Array.isArray(value)||value.length>MAX_ITEMS||value.some(n=>!bounded(n,0,duration)))fail(`${name} must contain at most 20,000 valid seconds within the source duration.`);return [...new Set(value as number[])].sort((a,b)=>a-b)}
export function parseBeatAnalysis(text:string,name:string):BeatAnalysis {
 const v=jsonInput(text);if(!object(v)||v.format!=='frame-audio-analysis'||v.version!==1||!bounded(v.duration,.001))fail('Choose Frame audio analysis JSON from the librosa helper.');
 const beats=times(v.beats,'Beats',v.duration),onsets=times(v.onsets||[],'Onsets',v.duration);
 let rms:BeatAnalysis['rms'];if(v.rms!==undefined){if(!Array.isArray(v.rms)||v.rms.length>2000||v.rms.some(p=>!object(p)||!bounded(p.time,0,v.duration as number)||!bounded(p.value,0,10)))fail('Invalid RMS waveform summary.');rms=v.rms as BeatAnalysis['rms']}
 if(v.tempo!==undefined&&!bounded(v.tempo,0,1000))fail('Invalid tempo.');
 return {id:crypto.randomUUID(),name:name.slice(0,250),createdAt:Date.now(),duration:v.duration,offset:0,beats,onsets,...(typeof v.tempo==='number'?{tempo:v.tempo}:{}),...(rms?{rms}:{}),...(typeof v.sourceHash==='string'&&/^[a-f0-9]{64}$/.test(v.sourceHash)?{sourceHash:v.sourceHash}:{})};
}
export function beatSuggestions(analysis:BeatAnalysis,duration:number,every=4,minGap=1):number[]{let last=0;return analysis.beats.filter((_,i)=>i%Math.max(1,Math.floor(every))===0).map(t=>t+analysis.offset).filter(t=>{if(t<minGap||t>duration-minGap||t-last<minGap)return false;last=t;return true}).slice(0,500)}
export function splitAtTimes(project:Project,timesToSplit:number[]):Project {
 let scenes=project.scenes.slice();const cuts=[...new Set(timesToSplit)].sort((a,b)=>b-a);if(cuts.length>500||cuts.some(t=>!bounded(t)))fail('Choose at most 500 valid cut positions.');
 for(const time of cuts){let start=0;for(let i=0;i<scenes.length;i++){const s=scenes[i],local=time-start;if(local>.05&&local<s.duration-.05){if(scenes.length>=10000)fail('This edit would exceed 10,000 scenes. Split the film into reels first.');const parts=splitScene(s,local);scenes.splice(i,1,...parts);break}start+=s.duration;}}
 return {...project,scenes};
}
function csvRows(text:string):string[][]{const rows:string[][]=[];let row:string[]=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else if(!quoted&&field)fail('Invalid CSV quoting.');else quoted=!quoted}else if(!quoted&&(c===','||c==='\n')){row.push(field);field='';if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[]}}else field+=c}if(quoted)fail('Unclosed CSV quote.');row.push(field);if(row.some(Boolean))rows.push(row);return rows}
export function parseCutList(text:string,name:string,sourceDuration?:number):CutList {
 text=textInput(text);let ranges:unknown[];
 if(text.trimStart().startsWith('{')){const v=jsonInput(text);if(!object(v)||!Array.isArray(v.cutSegments))fail('Choose a LosslessCut JSON project or seconds CSV.');ranges=v.cutSegments}
 else {const rows=csvRows(text);if(rows[0]?.[0].toLowerCase()==='start')rows.shift();ranges=rows.map(row=>({start:row[0]?.trim()?parseTimestamp(row[0]):0,end:row[1]?.trim()?parseTimestamp(row[1]):undefined,name:row[2]||''}))}
 if(!ranges.length||ranges.length>1000)fail('Use 1–1,000 clip ranges.');
 const result=ranges.map((v,i)=>{if(!object(v))fail('Invalid clip range.');const start=v.start==null?0:v.start,end=v.end;if(!bounded(start)||!bounded(end)||end<=start||sourceDuration!==undefined&&end>sourceDuration+.05)fail(`Clip ${i+1} has invalid bounds. Marker-only or open-ended ranges need an explicit end before they can become clips.`);return {id:crypto.randomUUID(),start,end,name:str(v.name,250)&&v.name?v.name:`Clip ${i+1}`}});
 return {id:crypto.randomUUID(),name:name.slice(0,250),createdAt:Date.now(),ranges:result};
}
export function appendCutScenes(project:Project,list:CutList,asset:Asset):Project {
 if(asset.kind!=='video')fail('Select a video source.');if(list.sourceAssetId!==asset.id)fail('The selected video does not match this cut list.');const docs=project.productionTools||emptyProductionTools();if(docs.cutLists.find(v=>v.id===list.id)?.applied)return project;
 if(project.scenes.length+list.ranges.length>10000)fail('This edit would exceed 10,000 scenes. Split the film into reels first.');
 const scenes:Scene[]=list.ranges.map(range=>{if(asset.duration&&range.end>asset.duration+.05)fail('A cut extends beyond the source video.');const duration=range.end-range.start;return {id:crypto.randomUUID(),title:range.name,duration,notes:`Reversible trim from ${asset.name}: ${range.start}–${range.end}s. Source preserved.`,code:'<!doctype html><html><body style="margin:0;background:#101316"><script>window.film={renderAt(){},pause(){}};</script></body></html>',transition:'cut',color:'#566e7a',layers:[{...newLayer(asset,duration),duration,trim:range.start,x:50,y:50,width:100,fadeIn:0,fadeOut:0}]}});
 return {...project,scenes:[...project.scenes,...scenes],productionTools:{...docs,cutLists:[...docs.cutLists.filter(v=>v.id!==list.id),{...list,applied:true}]}};
}
export function comfyServerUrl(value:string):string {let u:URL;try{u=new URL(value)}catch{return fail('Use a loopback ComfyUI address with an explicit port, such as http://127.0.0.1:8188.')};if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!u.port||Number(u.port)<1024||u.port==='4319'||u.username||u.password||u.search||u.hash||u.pathname!=='/')fail('ComfyUI must use an HTTP loopback host and explicit port, with no credentials or path.');return u.origin}
export function parseComfyWorkflow(input:string|unknown):ComfyWorkflow {
 const value=typeof input==='string'?jsonInput(input):input;if(!object(value)||Array.isArray(value.nodes))fail('Export the ComfyUI workflow in API format (node IDs with class_type and inputs).');
 const entries=Object.entries(value);if(!entries.length||entries.length>1000||JSON.stringify(value).length>1024*1024)fail('Use an API workflow with 1–1,000 nodes, smaller than 1 MB.');
 const walk=(v:unknown,depth=0)=>{if(depth>32)fail('Workflow is nested too deeply.');if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))fail('Invalid workflow property.');if(/^(api[_-]?key|access[_-]?token|auth(?:orization)?|password|secret|bearer[_-]?token)$/i.test(k)&&x)fail('Remove credentials from the workflow. Configure them inside your local ComfyUI installation.');walk(x,depth+1)}};walk(value);
 for(const [id,node]of entries)if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!object(node)||!str(node.class_type,200)||!node.class_type||!object(node.inputs))fail('Every API workflow node needs a valid ID, class_type and inputs object.');
 return JSON.parse(JSON.stringify(value)) as ComfyWorkflow;
}
export function makeComfyJob(workflow:ComfyWorkflow,name:string,serverUrl:string):ComfyJob {const now=Date.now();return {id:crypto.randomUUID(),name:name.slice(0,250),serverUrl:comfyServerUrl(serverUrl),requestedId:crypto.randomUUID(),createdAt:now,updatedAt:now,status:'prepared',workflow:parseComfyWorkflow(workflow),outputs:[],importedOutputs:[]}}
export function normalizeProductionToolsDocument(value:unknown):ProductionToolsDocument {
 if(!object(value)||value.version!==1)fail('Unsupported production tools document.');if(JSON.stringify(value).length>32*1024*1024)fail('Production tools data exceeds 32 MB. Export finished workflows separately.');const d=value as unknown as ProductionToolsDocument;
 for(const key of ['captionImports','beatAnalyses','cutLists','comfyJobs'] as const)if(!Array.isArray(d[key])||d[key].length>200)fail('Too many production tool records.');
 const ids=new Set<string>();for(const entries of [d.captionImports,d.beatAnalyses,d.cutLists,d.comfyJobs])for(const r of entries){if(!object(r)||!identifier(r.id)||ids.has(r.id)||!str(r.name,250)||!bounded(r.createdAt,0,1e15))fail('Invalid production tool record.');ids.add(r.id)}
 for(const c of d.captionImports){if(c.applied!==undefined&&typeof c.applied!=='boolean')fail('Invalid caption application state.');if(!['srt','vtt','whisperx'].includes(c.format)||!bounded(c.offset,-MAX_TIME,MAX_TIME)||!Array.isArray(c.cues)||!c.cues.length||c.cues.length>MAX_ITEMS||!Array.isArray(c.warnings)||c.warnings.length>100||c.warnings.some(w=>!str(w,1000)))fail('Invalid caption import.');for(const [i,v]of c.cues.entries()){if(!identifier(v.id))fail('Invalid caption ID.');cue(v as unknown as Record<string,unknown>,i)}}
 for(const b of d.beatAnalyses){if(b.sourceHash!==undefined&&(typeof b.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(b.sourceHash)))fail('Invalid audio source hash.');if(!bounded(b.duration,.001)||!bounded(b.offset,-MAX_TIME,MAX_TIME)||b.sourceAssetId!==undefined&&!identifier(b.sourceAssetId))fail('Invalid beat analysis.');parseBeatAnalysis(JSON.stringify({format:'frame-audio-analysis',version:1,...b}),b.name)}
 for(const c of d.cutLists){if(c.applied!==undefined&&typeof c.applied!=='boolean')fail('Invalid cut application state.');if(c.sourceAssetId!==undefined&&!identifier(c.sourceAssetId))fail('Invalid cut source.');parseCutList(JSON.stringify({cutSegments:c.ranges}),c.name);if(c.ranges.some(r=>!identifier(r.id)||!str(r.name,250)))fail('Invalid cut ID.')}
 for(const j of d.comfyJobs){comfyServerUrl(j.serverUrl);parseComfyWorkflow(j.workflow);if(!/^[0-9a-f-]{36}$/i.test(j.requestedId)||j.remoteId!==undefined&&!/^[a-zA-Z0-9_-]{1,160}$/.test(j.remoteId)||!bounded(j.updatedAt,0,1e15)||!['prepared','submitting','queued','running','succeeded','failed','unknown'].includes(j.status)||!Array.isArray(j.outputs)||j.outputs.length>1000||!Array.isArray(j.importedOutputs)||j.importedOutputs.length>1000||j.importedOutputs.some(v=>!Number.isInteger(v)||v<0||v>999)||j.error!==undefined&&!str(j.error,2000))fail('Invalid ComfyUI job.');for(const o of j.outputs)if(!object(o)||!bounded(o.index,0,999)||!Number.isInteger(o.index)||!str(o.node,160)||!str(o.filename,255)||!str(o.subfolder,500)||o.type!=='output'||!['image','video','audio'].includes(o.kind))fail('Invalid ComfyUI output.');}
 const freefieldJobs=d.freefieldJobs===undefined?undefined:(()=>{if(!Array.isArray(d.freefieldJobs)||d.freefieldJobs.length>200)fail('Too many Freefield run records.');const seen=new Set<string>();return d.freefieldJobs.map(entry=>{const job=normalizeFreefieldJob(entry.job),serverUrl=freefieldLocalUrl(entry.serverUrl);if(seen.has(job.requestId))fail('Duplicate Freefield request identity.');seen.add(job.requestId);return {serverUrl,job}})})();
 const comfyCloudJobs=d.comfyCloudJobs===undefined?undefined:(()=>{if(!Array.isArray(d.comfyCloudJobs)||d.comfyCloudJobs.length>200)fail('Too many Comfy Cloud runs.');const jobs=d.comfyCloudJobs.map(normalizeComfyCloudJob);if(new Set(jobs.map(j=>j.id)).size!==jobs.length||new Set(jobs.map(j=>j.requestId)).size!==jobs.length)fail('Duplicate Comfy Cloud job identity.');return jobs})();
 const higgsfieldJobs=d.higgsfieldJobs===undefined?undefined:(()=>{if(!Array.isArray(d.higgsfieldJobs)||d.higgsfieldJobs.length>200)fail('Too many Higgsfield runs.');const jobs=d.higgsfieldJobs.map(normalizeHiggsfieldJob);if(new Set(jobs.map(j=>j.operationId)).size!==jobs.length)fail('Duplicate Higgsfield job identity.');return jobs})();
 return {...(freefieldJobs?{freefieldJobs}:{}),...(comfyCloudJobs?{comfyCloudJobs}:{}),...(higgsfieldJobs?{higgsfieldJobs}:{}),version:1,captionImports:d.captionImports.map(c=>({id:c.id,name:c.name,format:c.format,createdAt:c.createdAt,offset:c.offset,cues:c.cues.map(v=>({id:v.id,start:v.start,end:v.end,text:v.text,...(v.speaker?{speaker:v.speaker}:{})})),warnings:[...c.warnings],...(c.applied!==undefined?{applied:c.applied}:{})})),beatAnalyses:d.beatAnalyses.map(b=>({id:b.id,name:b.name,createdAt:b.createdAt,duration:b.duration,offset:b.offset,beats:[...b.beats],onsets:[...b.onsets],...(b.sourceAssetId?{sourceAssetId:b.sourceAssetId}:{}),...(b.tempo!==undefined?{tempo:b.tempo}:{}),...(b.rms?{rms:b.rms.map(p=>({time:p.time,value:p.value}))}:{}),...(b.sourceHash?{sourceHash:b.sourceHash}:{})})),cutLists:d.cutLists.map(c=>({id:c.id,name:c.name,createdAt:c.createdAt,ranges:c.ranges.map(r=>({id:r.id,start:r.start,end:r.end,name:r.name})),...(c.sourceAssetId?{sourceAssetId:c.sourceAssetId}:{}),...(c.applied!==undefined?{applied:c.applied}:{})})),comfyJobs:d.comfyJobs.map(j=>({id:j.id,name:j.name,serverUrl:j.serverUrl,requestedId:j.requestedId,...(j.remoteId?{remoteId:j.remoteId}:{}),createdAt:j.createdAt,updatedAt:j.updatedAt,status:j.status,workflow:parseComfyWorkflow(j.workflow),outputs:j.outputs.map(o=>({index:o.index,node:o.node,filename:o.filename,subfolder:o.subfolder,type:o.type,kind:o.kind})),importedOutputs:[...j.importedOutputs],...(j.error?{error:j.error}:{})}))};
}
export function remapProductionToolsDocument(doc:ProductionToolsDocument,maps:{sceneId?:(id:string)=>string;assetId:(id:string)=>string}):ProductionToolsDocument {const d=normalizeProductionToolsDocument(doc);return {...d,beatAnalyses:d.beatAnalyses.map(b=>({...b,...(b.sourceAssetId?{sourceAssetId:maps.assetId(b.sourceAssetId)}:{})})),cutLists:d.cutLists.map(c=>({...c,...(c.sourceAssetId?{sourceAssetId:maps.assetId(c.sourceAssetId)}:{})})),...(d.freefieldJobs?{freefieldJobs:d.freefieldJobs.map(entry=>({...entry,job:{...entry.job,...(entry.job.snapshot?{snapshot:{...entry.job.snapshot,files:Object.fromEntries(Object.entries(entry.job.snapshot.files).map(([field,id])=>[field,maps.assetId(id)]))}}:{})}}))}:{})};}
export async function productionToolRequest<T>(settings:CompanionSettings,action:'status'|'submit'|'poll',body:unknown):Promise<T> {return (await toolFetch(settings,action,body)).json() as Promise<T>}
async function toolFetch(settings:CompanionSettings,action:string,body:unknown):Promise<Response>{const u=new URL(settings.url);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/')fail('Enter the local companion address with its port.');if(!settings.token)fail('Enter the companion pairing token.');const r=await fetch(u.origin+'/production/comfy/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+settings.token},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(130000)});if(!r.ok){const v=await r.json().catch(()=>({}));fail(v.error||`Companion returned ${r.status}`)}return r}
export async function downloadComfyOutput(settings:CompanionSettings,job:ComfyJob,index:number):Promise<Blob>{const r=await toolFetch(settings,'download',{serverUrl:job.serverUrl,remoteId:job.remoteId||job.requestedId,index});const blob=await r.blob();if(blob.size>64*1024*1024||!blob.size||!/^image\/(png|jpeg|webp|gif)$|^audio\/(wav|mpeg|ogg|flac)$|^video\/(mp4|webm)$/.test(blob.type))fail('The companion did not return a supported media file.');return blob}
export function recoveredComfyJob(job:ComfyJob):ComfyJob{return job.status==='submitting'?{...job,status:'unknown',error:'Submission was interrupted. Check the saved ID; do not submit this workflow again automatically.'}:job}
export type {ComfyStatus};
