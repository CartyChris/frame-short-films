import {normalizeProductionToolsDocument,remapProductionToolsDocument} from './production-tools';
import {normalizeMotionDocument} from './motion/document';
import {invoke as nativeInvoke} from '@tauri-apps/api/core';
import {combineContinuation} from './continuation';
import {normalizeThreeDocument} from './three/document';
import {normalizeDirectorChat,remapDirectorChat} from './director';
import {validateDesign,validateCastScene} from './casting';
import {validateProceduralModel} from './three/procedural';
import {validateSoundtrack} from './sound/document';
import {validatePipeline,sceneFingerprint} from './pipeline';
import {openDB, type IDBPDatabase} from 'idb';
import type {Project,Asset,GenerationRun,Chunk,Revision,MediaJob,Scene} from './types';
const NAME='frame-studio-v1';let dbPromise:Promise<IDBPDatabase>|undefined;
export const db=()=>dbPromise??=openDB(NAME,1,{upgrade(d){d.createObjectStore('projects',{keyPath:'id'});d.createObjectStore('assets',{keyPath:'id'});d.createObjectStore('runs',{keyPath:'id'}).createIndex('projectId','projectId');d.createObjectStore('chunks',{keyPath:['runId','seq']}).createIndex('runId','runId');d.createObjectStore('revisions',{keyPath:'id'}).createIndex('projectId','projectId');d.createObjectStore('jobs',{keyPath:'id'}).createIndex('projectId','projectId');d.createObjectStore('settings');}});
export const uid=()=>crypto.randomUUID();
let saveChain:Promise<unknown>=Promise.resolve();
export async function saveProject(project:Project){const snapshot=structuredClone(project);const next=saveChain.catch(()=>{}).then(async()=>{const d=await db();await d.put('projects',snapshot);});saveChain=next;await next;}
export async function listProjects():Promise<Project[]>{return (await (await db()).getAll('projects')).sort((a,b)=>b.updatedAt-a.updatedAt)}
export async function getProject(id:string):Promise<Project|undefined>{await saveChain;return (await db()).get('projects',id)}
export async function putAsset(asset:Asset){await (await db()).put('assets',asset)}
export async function getAssets():Promise<Asset[]>{return (await db()).getAll('assets')}
export async function saveRun(run:GenerationRun){await (await db()).put('runs',run)}
export async function getRuns(projectId:string):Promise<GenerationRun[]>{return (await (await db()).getAllFromIndex('runs','projectId',projectId)).sort((a,b)=>b.createdAt-a.createdAt)}
export async function getRun(id:string):Promise<GenerationRun|undefined>{return (await db()).get('runs',id)}
export async function appendChunk(runId:string,seq:number,text:string){const d=await db();const tx=d.transaction(['runs','chunks'],'readwrite',{durability:'strict'});const run=await tx.objectStore('runs').get(runId) as GenerationRun|undefined;if(!run){tx.abort();await tx.done.catch(()=>{});throw new Error('Generation journal is missing. Stop and export your draft.');}const existing=await tx.objectStore('chunks').get([runId,seq]) as Chunk|undefined;if(existing){if(existing.text!==text){tx.abort();await tx.done.catch(()=>{});throw new Error('Conflicting generation chunk; original was preserved.');}await tx.done;return;}if(seq!==run.lastSeq+1){tx.abort();await tx.done.catch(()=>{});throw new Error('Out-of-order stream chunk; original was preserved.');}await tx.objectStore('chunks').add({runId,seq,text,createdAt:Date.now()});await tx.objectStore('runs').put({...run,lastSeq:seq,updatedAt:Date.now()});await tx.done;}
export async function getChunks(runId:string):Promise<Chunk[]>{return (await (await db()).getAllFromIndex('chunks','runId',runId)).sort((a,b)=>a.seq-b.seq)}
export async function getDraft(run:GenerationRun){return combineContinuation(run.baseText,(await getChunks(run.id)).map(c=>c.text).join(''))}
export async function finishRun(id:string,status:GenerationRun['status'],error?:string,finishReason?:string){const d=await db();const tx=d.transaction('runs','readwrite');const run=await tx.store.get(id);if(run)await tx.store.put({...run,status,error,finishReason,updatedAt:Date.now()});await tx.done;}
export async function recoverRuns(){const d=await db();const tx=d.transaction('runs','readwrite');let cursor=await tx.store.openCursor();let recovered=0;while(cursor){if(cursor.value.status==='streaming'){await cursor.update({...cursor.value,status:'interrupted',error:'The previous session ended. Every saved chunk is ready to continue.',updatedAt:Date.now()});recovered++;}cursor=await cursor.continue();}await tx.done;return recovered;}
export async function addRevision(projectId:string,sceneId:string,code:string,title:string,scene?:Scene){const r:Revision={id:uid(),projectId,sceneId,code,title,createdAt:Date.now(),...(scene?{scene:structuredClone(scene)}:{})};await (await db()).put('revisions',r);return r;}
export async function getRevisions(projectId:string):Promise<Revision[]>{return (await (await db()).getAllFromIndex('revisions','projectId',projectId)).sort((a,b)=>b.createdAt-a.createdAt)}
export async function putJob(job:MediaJob){await (await db()).put('jobs',job)}
export async function getJobs(projectId:string):Promise<MediaJob[]>{return (await db()).getAllFromIndex('jobs','projectId',projectId)}
export async function setSetting(key:string,value:unknown){await (await db()).put('settings',value,key)}
export async function getSetting<T>(key:string):Promise<T|undefined>{return (await db()).get('settings',key)}
export interface ProjectArchive {format:'frame-project';version:1;project:Project;assets:Asset[];runs:GenerationRun[];chunks:Chunk[];revisions:Revision[];jobs:MediaJob[]}
export async function createArchive(project:Project):Promise<ProjectArchive>{const ids=new Set([...project.scenes.flatMap(s=>s.layers),...project.audio].map(l=>l.assetId));const assets=await getAssets();const runs=await getRuns(project.id);const chunks=(await Promise.all(runs.map(r=>getChunks(r.id)))).flat();return {format:'frame-project',version:1,project,assets,runs,chunks,revisions:await getRevisions(project.id),jobs:await getJobs(project.id)}}
export function validateProject(value:unknown):asserts value is Project {
 if(!value||typeof value!=='object')throw new Error('Not a Frame project.');const p=value as Project;
 if(typeof p.id!=='string'||typeof p.name!=='string'||!Array.isArray(p.scenes)||!p.scenes.length||!Array.isArray(p.audio)||!p.settings)throw new Error('This project file is missing required fields.');
 if(p.scenes.length>10000)throw new Error('Split this project into reels of 10,000 scenes or fewer.');
 if(p.models!==undefined){if(!Array.isArray(p.models)||p.models.length>2000)throw new Error('Invalid 3D library.');const ids=new Set<string>();for(const m of p.models){if(!m||typeof m.id!=='string'||typeof m.name!=='string'||ids.has(m.id)||(!m.builtin&&!m.procedural&&(!m.data||!/^data:[^,]*;base64,/.test(m.data))))throw new Error('A model is missing its embedded bytes or identity.');if(m.procedural)m.procedural=validateProceduralModel(m.procedural);ids.add(m.id)}}
 const ids=new Set<string>();for(const s of p.scenes){if(typeof s.id!=='string'||ids.has(s.id)||typeof s.code!=='string'||!Number.isFinite(s.duration)||s.duration<=0||!Array.isArray(s.layers))throw new Error('A scene has invalid code, duration, or layers.');ids.add(s.id);if(s.three)s.three=normalizeThreeDocument(s.three,p.models||[]);if(s.motion)s.motion=normalizeMotionDocument(s.motion);if(s.continuity&&(!Array.isArray(s.continuity.characterIds)||!Array.isArray(s.continuity.locationIds)||!Array.isArray(s.continuity.mustInclude)||typeof s.continuity.stateAfter!=='object'))throw new Error('Invalid scene continuity.');}
 if(p.story&&(!Array.isArray(p.story.characters)||!Array.isArray(p.story.locations)||!Array.isArray(p.story.lockedFacts)||typeof p.story.initialState!=='object'))throw new Error('Invalid story bible.');
 if(p.story)for(const record of [...p.story.characters,...p.story.locations])if(!record||typeof record.id!=='string'||typeof record.name!=='string'||!Array.isArray(record.referenceAssetIds))throw new Error('Invalid cast or location reference.');
 if(p.production!==undefined&&(!Array.isArray(p.production)||p.production.some(q=>!q||typeof q.id!=='string'||!Array.isArray(q.items)||q.items.some(i=>!i||typeof i.id!=='string'||!Number.isFinite(i.duration)||i.duration<=0))))throw new Error('Invalid production queue.');
 if(p.integrationJobs!==undefined&&!Array.isArray(p.integrationJobs))throw new Error('Invalid integration jobs.');
 if(p.productionTools!==undefined)p.productionTools=normalizeProductionToolsDocument(p.productionTools);
 if(p.chat!==undefined)p.chat=normalizeDirectorChat(p.chat);
 if(p.castDesigns!==undefined){if(!p.castDesigns||typeof p.castDesigns!=='object'||Array.isArray(p.castDesigns)||Object.keys(p.castDesigns).length>2000)throw new Error('Invalid cast design library.');for(const design of Object.values(p.castDesigns))validateDesign(design);}
 for(const s of p.scenes)if(s.cast)validateCastScene(s.cast);
 if(p.soundtrack!==undefined)p.soundtrack=validateSoundtrack(p.soundtrack);
 if(p.pipelines!==undefined){if(!Array.isArray(p.pipelines)||p.pipelines.length>100)throw new Error('Invalid production pipeline list.');p.pipelines.forEach(validatePipeline);}
 if(!Number.isFinite(p.settings.width)||!Number.isFinite(p.settings.height)||p.settings.width<1||p.settings.height<1)throw new Error('Invalid film dimensions.');
}

export async function importArchive(value:unknown){
 const a=structuredClone(value) as ProjectArchive;
 if(a?.format!=='frame-project'||a.version!==1)throw new Error('Choose a .frame.json project archive.');
 const originalSceneData=new Map<string,Scene>((Array.isArray(a?.project?.scenes)?a.project.scenes:[]).filter(s=>s&&typeof s.id==='string').map(s=>[s.id,structuredClone(s)]));
 validateProject(a.project);
 const rebaseTasks=new Set<string>();for(const job of a.project.pipelines||[])for(const task of job.tasks){if(!['scene','overlay'].includes(task.kind)||!task.basis)continue;const target=a.project.production?.find(q=>q.id===job.queueId)?.items.find(i=>i.id===task.targetId)?.sceneId;const before=target?originalSceneData.get(target):undefined;if(before&&await sceneFingerprint(before)===task.basis)rebaseTasks.add(task.id);}
 for(const key of ['assets','runs','chunks','revisions'] as const)if(!Array.isArray(a[key]))throw new Error('Project archive is incomplete.');
 if(!Array.isArray(a.jobs??[]))throw new Error('Invalid media job history.');a.jobs??=[];
 for(const item of a.assets)if(!item||typeof item.id!=='string'||typeof item.data!=='string'||!['audio','video','image'].includes(item.kind)||!item.data.startsWith('data:'))throw new Error('An archived media asset is invalid.');
 for(const r of a.runs)if(!r||typeof r.id!=='string'||typeof r.baseText!=='string'||!Number.isInteger(r.lastSeq))throw new Error('An archived generation is invalid.');
 const runIds=new Set(a.runs.map(r=>r.id));
 for(const c of a.chunks)if(!c||!runIds.has(c.runId)||!Number.isInteger(c.seq)||typeof c.text!=='string')throw new Error('An archived generation chunk is invalid.');
 for(const r of a.revisions)if(!r||typeof r.id!=='string'||typeof r.code!=='string')throw new Error('An archived revision is invalid.');
 for(const j of a.jobs)if(!j||typeof j.id!=='string'||typeof j.provider!=='string')throw new Error('An archived media job is invalid.');
 // Restore as an independent project, so older backups can never overwrite newer histories.
 const map=new Map<string,string>();const fresh=(id:string)=>{if(!map.has(id))map.set(id,uid());return map.get(id)!};
 const originalId=a.project.id;a.project.id=fresh(originalId);a.project.updatedAt=Date.now();
 const originalScenes=a.project.scenes.map(s=>s.id);for(const id of originalScenes)fresh(id);
 a.project.sceneAliases={...Object.fromEntries(Object.entries(a.project.sceneAliases||{}).map(([source,target])=>[source,fresh(target)])),...Object.fromEntries(originalScenes.map(id=>[id,fresh(id)]))};
 const mediaIds=new Set(a.assets.map(item=>item.id));
 a.project.assetAliases={...Object.fromEntries(Object.entries(a.project.assetAliases||{}).map(([source,target])=>[source,fresh(target)])),...Object.fromEntries([...mediaIds].map(id=>[id,fresh(id)]))};
 if(a.project.productionTools)a.project.productionTools=remapProductionToolsDocument(a.project.productionTools,{assetId:id=>mediaIds.has(id)?fresh(id):id});
 if(a.project.chat)a.project.chat=remapDirectorChat(a.project.chat,{runId:fresh,mediaId:id=>mediaIds.has(id)?fresh(id):id,sceneId:id=>id?fresh(id):id,queueId:fresh,itemId:fresh,mediaIds:[...mediaIds]});
 if(a.project.story)for(const canon of [...a.project.story.characters,...a.project.story.locations])canon.referenceAssetIds=canon.referenceAssetIds.map(id=>mediaIds.has(id)?fresh(id):id);
 for(const q of a.project.production||[]){q.id=fresh(q.id);if(q.planRunId)q.planRunId=fresh(q.planRunId);if(q.status==='running')q.status='paused';for(const item of q.items){item.id=fresh(item.id);if(item.sceneId)item.sceneId=fresh(item.sceneId);if(item.runId)item.runId=fresh(item.runId);if(item.status==='running'){item.status='interrupted';item.error='Restored job. Continue from its saved draft.'}}}
 for(const job of a.project.integrationJobs||[])job.id=fresh(job.id);
 for(const job of a.project.pipelines||[]){job.id=fresh(job.id);if(job.queueId)job.queueId=fresh(job.queueId);if(job.state==='running')job.state='paused';job.settings.mediaConnectionId='';for(const task of job.tasks){const originalTaskId=task.id;task.id=fresh(task.id);if(rebaseTasks.has(originalTaskId))rebaseTasks.add(task.id);if(task.kind==='design'&&task.basis){try{const records=JSON.parse(task.basis);for(const c of records)c.referenceAssetIds=c.referenceAssetIds.map((id:string)=>mediaIds.has(id)?fresh(id):id);task.basis=JSON.stringify(records)}catch{throw new Error('Invalid saved character design checkpoint.')}}if(['scene','overlay','narration'].includes(task.kind)&&task.targetId)task.targetId=fresh(task.targetId);if(task.runId)task.runId=fresh(task.runId);if(task.assetId)task.assetId=fresh(task.assetId);if(task.jobId)task.jobId=fresh(task.jobId);if(task.status==='running')task.status='blocked';}}

 for(const s of a.project.scenes){s.id=fresh(s.id);for(const l of s.layers){l.id=fresh(l.id);l.assetId=fresh(l.assetId)}}
 for(const l of a.project.audio){l.id=fresh(l.id);l.assetId=fresh(l.assetId)}
 for(const asset of a.assets)asset.id=fresh(asset.id);
 for(const r of a.runs){r.id=fresh(r.id);r.projectId=a.project.id;if(r.sceneId)r.sceneId=fresh(r.sceneId);if(r.parentId)r.parentId=fresh(r.parentId);if(r.pipelineId)r.pipelineId=fresh(r.pipelineId);if(r.taskId)r.taskId=fresh(r.taskId);if(r.queueId)r.queueId=fresh(r.queueId);if(r.queueItemId)r.queueItemId=fresh(r.queueItemId);if(r.status==='streaming'){r.status='interrupted';r.error='Restored from a backup. Continue from the saved draft.'}}
 for(const c of a.chunks)c.runId=fresh(c.runId);
 for(const r of a.revisions){r.id=fresh(r.id);r.projectId=a.project.id;r.sceneId=fresh(r.sceneId);if(r.scene){r.scene.id=r.sceneId;for(const l of r.scene.layers){l.id=fresh(l.id);l.assetId=fresh(l.assetId)}}}
 for(const j of a.jobs){j.id=fresh(j.id);j.projectId=a.project.id;j.sceneId=fresh(j.sceneId);if(j.queueId)j.queueId=fresh(j.queueId);if(j.queueItemId)j.queueItemId=fresh(j.queueItemId);if(j.assetId)j.assetId=fresh(j.assetId)}
 for(const job of a.project.pipelines||[])for(const task of job.tasks)if(rebaseTasks.has(task.id)){const target=a.project.production?.find(q=>q.id===job.queueId)?.items.find(i=>i.id===task.targetId)?.sceneId;const scene=a.project.scenes.find(s=>s.id===target);if(scene)task.basis=await sceneFingerprint(scene);}
 const d=await db();const tx=d.transaction(['projects','assets','runs','chunks','revisions','jobs'],'readwrite');
 try{await tx.objectStore('projects').add(a.project);for(const [name,items] of Object.entries({assets:a.assets,runs:a.runs,chunks:a.chunks,revisions:a.revisions,jobs:a.jobs})){for(const item of items)await tx.objectStore(name).add(item)}await tx.done;}catch(error){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw error}
 return a.project;
}

export async function requestPersistentStorage(){return navigator.storage?.persist?await navigator.storage.persist():false}
export async function storageEstimate(){return navigator.storage?.estimate?await navigator.storage.estimate():{}}
export function download(data:Blob|string,name:string,type='application/json'){
 const blob=typeof data==='string'?new Blob([data],{type}):data;
 if(typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window){
   void (async()=>{
    // Native exports read the Blob directly with an already-loaded invoke binding.
    // Bounded conversion preserves arbitrary bytes without spreading a large array.
    await Promise.resolve();window.dispatchEvent(new CustomEvent('frame:native-export',{detail:{pending:true}}));
    if(blob.size>512*1024*1024)throw new Error('Export exceeds 512 MiB; split this film into reels.');
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
    for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
    const path=await nativeInvoke<string>('save_export',{name,base64:btoa(binary)});
    window.dispatchEvent(new CustomEvent('frame:native-export',{detail:{path}}));
   })().catch(error=>window.dispatchEvent(new CustomEvent('frame:native-export',{detail:{error:String(error)}})));return;
 }
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

export function fileData(file:Blob):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(file)})}
export async function resetDbForTest(){if(dbPromise)(await dbPromise).close();dbPromise=undefined;saveChain=Promise.resolve();}
