import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';
import type {Project,Scene} from './types';
import type {ModelAsset,ThreeDocument} from './three/types';
import {normalizeThreeDocument,sampleCamera} from './three/document';
import blenderAddon from '../../integrations/blender/frame_blender.py?raw';
import blenderGuide from '../../integrations/blender/README.md?raw';

export interface IntegrationJob {
 id:string;provider:'tripo'|'blender'|'mcp';status:'planned'|'submitted'|'running'|'succeeded'|'failed'|'unknown';
 name:string;createdAt:number;updatedAt:number;taskId?:string;model?:string;outputFiles?:string[];creditsConsumed?:number;error?:string;
}
export interface McpTool {name:string;description?:string;inputSchema:Record<string,unknown>;annotations?:{readOnlyHint?:boolean;destructiveHint?:boolean;openWorldHint?:boolean}}
export interface McpConnection {connectionId:string;status:'connected';serverInfo:{name?:string;version?:string};tools:McpTool[]}
export interface CompanionSettings {url:string;token:string}
export interface IntegrationStatus {blender:{installed:boolean};tripo:{installed:boolean};mcp:{installed:boolean;transports:string[]};note:string}
export interface BlenderManifest {format:'frame-blender';version:1;direction:'to-blender'|'from-blender';name:string;fps:number;duration:number;document:ThreeDocument;modelFile:'scene.glb';units:'meters';upAxis:'Y'}

/** Credentials and requests remain in memory. This accepts only the local companion. */
export async function integrationRequest<T>(settings:CompanionSettings,path:string,body?:unknown):Promise<T>{
 const url=new URL(settings.url);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!url.port)throw new Error('Use your local companion address, such as http://127.0.0.1:4319.');
 if(!settings.token)throw new Error('Enter the local companion pairing token first.');
 if(!/^\/integrations\/(status|mcp\/(connect|tools|call|receipt|disconnect))$/.test(path))throw new Error('Unknown integration action.');
 const response=await fetch(url.origin+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+settings.token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(130000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||`The companion returned ${response.status}.`);return result as T;
}
export async function makeBlenderExchange(project:Project,scene:Scene):Promise<Blob>{
 if(!scene.three)throw new Error('Select a 3D scene first.');
 const {exportSceneGlb}=await import('./three/io');
 const start=scene.sourceOffset||0;
 const model=await exportSceneGlb(scene.three,project.models||[],{start,duration:scene.duration});
 const camera=exchangeCamera(scene.three,start,scene.duration,project.settings.fps);
 const manifest:BlenderManifest={format:'frame-blender',version:1,direction:'to-blender',name:scene.title,fps:project.settings.fps,duration:scene.duration,document:{...scene.three,duration:scene.duration,camera},modelFile:'scene.glb',units:'meters',upAxis:'Y'};
 const bytes=zipSync({'scene.glb':new Uint8Array(await model.arrayBuffer()),'frame-scene.json':strToU8(JSON.stringify(manifest,null,2)),'frame_blender.py':strToU8(blenderAddon),'README.md':strToU8(blenderGuide)},{level:6});
 return new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/zip'});
}
export function exchangeCamera(document:ThreeDocument,start:number,duration:number,fps:number):ThreeDocument['camera']{
 const count=Math.max(2,Math.min(2000,Math.ceil(duration*fps)+1));
 const keyframes=Array.from({length:count},(_,index)=>{const time=duration*index/(count-1);return {...sampleCamera(document,start+time),time,easing:'linear' as const}});
 return {...keyframes[0],motion:'static',amplitude:0,keyframes};
}
/** Read only fixed entries, with decompressed size limits before inflation. */
export function readBlenderArchive(bytes:Uint8Array):{manifest:BlenderManifest;glb:Uint8Array}{
 if(bytes.length>160*1024*1024)throw new Error('This archive is too large. Optimize it to 150 MB or less.');
 const seen=new Set<string>();
 const entries=unzipSync(bytes,{filter:file=>{
  if(!['scene.glb','frame-scene.json'].includes(file.name))return false;
  if(seen.has(file.name))throw new Error('Duplicate exchange entry.');seen.add(file.name);
  const limit=file.name==='scene.glb'?150*1024*1024:10*1024*1024;
  if(file.originalSize>limit)throw new Error('An exchange entry exceeds its size limit.');return true;
 }});
 if(!entries['frame-scene.json']||!entries['scene.glb'])throw new Error('Choose a Frame Blender exchange ZIP containing frame-scene.json and scene.glb.');
 const manifest=JSON.parse(strFromU8(entries['frame-scene.json'])) as BlenderManifest;
 if(manifest.format!=='frame-blender'||manifest.version!==1||!['to-blender','from-blender'].includes(manifest.direction)||!Number.isFinite(manifest.duration)||manifest.duration<=0||manifest.duration>86400||!manifest.document||manifest.modelFile!=='scene.glb'||manifest.upAxis!=='Y')throw new Error('Unsupported or invalid Blender exchange manifest.');
 const glb=entries['scene.glb'];if(glb.length<12||strFromU8(glb.slice(0,4))!=='glTF')throw new Error('The archive has no valid GLB model.');
 return {manifest,glb};
}
export async function importBlenderExchange(file:File):Promise<{document:ThreeDocument;models:ModelAsset[]}>{
 const {manifest,glb}=readBlenderArchive(new Uint8Array(await file.arrayBuffer()));
 const {importModel}=await import('./three/io');
 const model=await importModel([new File([glb as Uint8Array<ArrayBuffer>],'scene.glb',{type:'model/gltf-binary'})]);
 model.name=String(manifest.name||'Blender scene').slice(0,200);model.sourceFormat='blender-glb';
 const document=normalizeThreeDocument({...manifest.document,duration:manifest.duration,environment:{...manifest.document.environment,geometry:false,defaultLights:false},title:'',subtitle:'',instances:[{id:crypto.randomUUID(),assetId:model.id,name:model.name,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,animation:{preset:'none',speed:1,phase:0,...(model.clips?.[0]?{clip:model.clips[0]}:{})}}]},[model]);
 return {document,models:[model]};
}
export const blenderSource=()=>new Blob([blenderAddon],{type:'text/x-python'});
export const blenderInstructions=blenderGuide;

const shellQuote=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";
const attribution='TRIPO_CLIENT_APP=codex TRIPO_DISTRIBUTION_CHANNEL=codex_plugin';
export function tripoPlanCommand(prompt:string):string{
 if(!prompt.trim())throw new Error('Describe the model first.');
 return `${attribution} tripo make ${shellQuote(prompt.trim())} -o ./assets/tripo-out --dry-run --json`;
}
export function tripoResumeCommand(taskId:string):string{
 if(!/^[a-zA-Z0-9_-]{1,200}$/.test(taskId))throw new Error('Enter the exact Tripo task ID (letters, numbers, dashes, underscores).');
 return `${attribution} tripo task watch ${shellQuote(taskId)} --download --json`;
}
export interface TripoPlan {valid:boolean;model?:string;steps:Record<string,unknown>[];totalCredits?:number;warnings:unknown[];errors:unknown[];raw:Record<string,unknown>}
export function parseTripoPlan(value:unknown):TripoPlan{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Choose the CLI dry-run JSON.');
 const r=value as Record<string,unknown>;
 if(r.dry_run!==true||typeof r.valid!=='boolean'||!Array.isArray(r.steps))throw new Error('This is not a Tripo --dry-run --json result.');
 const credits=[r.total_credits,r.estimated_credits,r.estimated_total_credits].find(v=>typeof v==='number');
 return {valid:r.valid,model:typeof r.model==='string'?r.model:undefined,steps:r.steps.filter(v=>v&&typeof v==='object') as Record<string,unknown>[],...(typeof credits==='number'?{totalCredits:credits}:{}),warnings:Array.isArray(r.warnings)?r.warnings:[],errors:Array.isArray(r.errors)?r.errors:[],raw:r};
}
/** Import only job identity/status fields, never credentials or full provider payloads. */
export function tripoReceiptJobs(value:unknown,now=Date.now()):IntegrationJob[]{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Choose Tripo task.json or its final JSON receipt.');
 const root=value as Record<string,unknown>;const candidates:Record<string,unknown>[]=[root];
 for(const key of ['tasks','steps','chain','credits_breakdown'])if(Array.isArray(root[key]))for(const item of root[key] as unknown[])if(item&&typeof item==='object'&&!Array.isArray(item))candidates.push(item as Record<string,unknown>);
 if(root.data&&typeof root.data==='object'&&!Array.isArray(root.data))candidates.push(root.data as Record<string,unknown>);
 if(typeof root.source_task_id==='string')candidates.push({task_id:root.source_task_id,status:root.status,name:'Tripo source generation'});
 const ids=new Set<string>(),result:IntegrationJob[]=[];
 for(const record of candidates){
  const raw=record.task_id??record.taskId??record.id;if(typeof raw!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(raw)||ids.has(raw))continue;ids.add(raw);
  const state=String(record.status??root.status??'unknown').toLowerCase();
  const status:IntegrationJob['status']=['success','succeeded','completed','complete'].includes(state)?'succeeded':['failed','failure','error','cancelled','canceled'].includes(state)?'failed':['running','processing','queued','pending'].includes(state)?'running':'unknown';
  const output=[record.model_file,record.preview_file,record.preview,...(Array.isArray(record.output_files)?record.output_files:[]),...(Array.isArray(record.files)?record.files:[])].filter((v):v is string=>typeof v==='string').map(v=>v.slice(0,2000));
  const credits=record.credits_consumed;
  result.push({id:crypto.randomUUID(),provider:'tripo',taskId:raw,name:String(record.name??root.name??'Tripo model').slice(0,200),status,createdAt:now,updatedAt:now,...(typeof record.model==='string'?{model:record.model.slice(0,200)}:{}),...(output.length?{outputFiles:output}:{}),...(typeof credits==='number'&&Number.isFinite(credits)?{creditsConsumed:credits}:{})});
 }
 if(!result.length)throw new Error('No task ID was found. Keep the original CLI output and check task status; do not submit again to recover a missing receipt.');
 return result;
}
export function mergeIntegrationJobs(previous:IntegrationJob[],incoming:IntegrationJob[]):IntegrationJob[]{
 const result=[...previous];for(const job of incoming){const index=result.findIndex(v=>v.provider===job.provider&&job.taskId&&v.taskId===job.taskId);if(index<0)result.unshift(job);else result[index]={...result[index],...job,id:result[index].id,createdAt:result[index].createdAt};}return result;
}
export function roomPlanningPackage(projectName:string):Blob{
 const plan={format:'frame-room-plan',version:1,name:projectName,createdAt:new Date().toISOString(),function:{playerRole:'',objective:'',mainRoute:[],landmarks:[],interactions:[],approved:false},form:{style:'',references:[],palette:[],approved:false},runtime:{target:'Frame / GLB',triangleBudget:null,textureBudget:null,frameRate:24,approved:false},geometry:{units:'meters',upAxis:'Y',sealedShell:true,openings:[],generatedProps:[]},generation:{provider:null,referenceApproved:false,paidPlanApproved:false,maxChargedAttempts:2,tasks:[]}};
 const guide='# Room planning in Frame\n\n1. Fill function: purpose, route, objectives, readable landmarks and interactions. Review it before styling.\n2. Fill form: references, shape language, palette and scale. Review reference use before generation.\n3. Fill runtime budgets and test a blockout in the target renderer.\n4. Build a sealed procedural shell with real door/window openings. Add generated props as dressing. Preserve source Blender/CAD files.\n5. For every paid task, dry-run the exact CLI command, review costs and receive explicit approval. Keep task IDs before polling. Never resubmit an unknown job. Limit charged attempts to two unless separately approved.\n6. Export uncompressed GLB with embedded textures. Import into Frame, check scale/camera/collision assumptions, and inspect animation at start/middle/end. Frame is a film renderer and does not provide game physics or gameplay validation.\n\nAll approval fields start false. This package is an editable plan, not evidence of approved design or a finished room.\n';
 const bytes=zipSync({'room-plan.json':strToU8(JSON.stringify(plan,null,2)),'README.md':strToU8(guide)});return new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/zip'});
}
