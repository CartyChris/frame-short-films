import {validateVorkDraft} from './three/vork-draft';
import {creativeIndex,CREATIVE_INDEX_PREFIX} from './creative-index';
import {normalizeProductionToolsDocument,remapProductionToolsDocument} from './production-tools';
import {normalizeMotionDocument} from './motion/document';
import {invoke as nativeInvoke} from '@tauri-apps/api/core';
import {combineContinuation} from './continuation';
import {normalizeThreeDocument} from './three/document';
import {normalizeDirectorChat,remapDirectorChat} from './director';
import {createMcpJournal,mergeMcpHistory} from './mcp-journal';
import {validateDesign,validateCastScene} from './casting';
import {validateProceduralModel} from './three/procedural';
import {validateSoundtrack} from './sound/document';
import {validatePipeline,sceneFingerprint} from './pipeline';
import {openDB, type IDBPDatabase} from 'idb';
import type {Project,Asset,GenerationRun,Chunk,Revision,MediaJob,Scene,FilmAttachment} from './types';
const NAME='frame-studio-v1';let dbPromise:Promise<IDBPDatabase>|undefined;
export const db=()=>{if(dbPromise)return dbPromise;const opening:Promise<IDBPDatabase>=openDB(NAME,2,{blocked(){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('frame:storage-blocked'))},blocking(){opening.then(connection=>connection.close()).catch(()=>{});if(dbPromise===opening)dbPromise=undefined;if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('frame:storage-version-changed'))},terminated(){if(dbPromise===opening)dbPromise=undefined},upgrade(d){if(!d.objectStoreNames.contains('projects'))d.createObjectStore('projects',{keyPath:'id'});if(!d.objectStoreNames.contains('assets'))d.createObjectStore('assets',{keyPath:'id'});if(!d.objectStoreNames.contains('runs'))d.createObjectStore('runs',{keyPath:'id'}).createIndex('projectId','projectId');if(!d.objectStoreNames.contains('chunks'))d.createObjectStore('chunks',{keyPath:['runId','seq']}).createIndex('runId','runId');if(!d.objectStoreNames.contains('revisions'))d.createObjectStore('revisions',{keyPath:'id'}).createIndex('projectId','projectId');if(!d.objectStoreNames.contains('jobs'))d.createObjectStore('jobs',{keyPath:'id'}).createIndex('projectId','projectId');if(!d.objectStoreNames.contains('settings'))d.createObjectStore('settings');if(!d.objectStoreNames.contains('attachments'))d.createObjectStore('attachments',{keyPath:'id'}).createIndex('projectId','projectId');}});dbPromise=opening;opening.catch(()=>{if(dbPromise===opening)dbPromise=undefined});return opening};
export const uid=()=>crypto.randomUUID();
let saveChain:Promise<unknown>=Promise.resolve();
const PURGED_PROJECTS='purged-projects',PURGED_ASSETS='purged-assets',PURGED_ATTACHMENTS='purged-attachments',PURGED_RUNS='purged-runs';
/** Conservative: also inspect embedded code, aliases, checkpoints and old revisions.
 * False positives block removal instead of breaking a film or recovery record. */
function containsReference(value:unknown,id:string):boolean{
 const stack:unknown[]=[value],seen=new WeakSet<object>();
 while(stack.length){const item=stack.pop();if(typeof item==='string'){if(item===id||(id.length>=8&&item.includes(id)))return true;continue}if(!item||typeof item!=='object'||item instanceof Blob)continue;if(seen.has(item))continue;seen.add(item);for(const [key,child] of Object.entries(item)){if(key===id||(id.length>=8&&key.includes(id)))return true;stack.push(child)}}return false;
}
async function assertLive(settings:any,projectId:string,value?:unknown){
 const deletedProjects:string[]=(await settings.get(PURGED_PROJECTS))||[];
 if(deletedProjects.includes(projectId))throw new Error('This film was permanently deleted. Save a new copy before continuing.');
 if(value!==undefined){for(const key of [PURGED_ASSETS,PURGED_ATTACHMENTS]){const ids:string[]=(await settings.get(key))||[];if(ids.some(id=>containsReference(value,id)))throw new Error('This edit references a permanently deleted file. Remove that reference or restore a project backup.')}}
}
export async function saveProject(project:Project){const snapshot=structuredClone(project);const next=saveChain.catch(()=>{}).then(async()=>{const d=await db(),tx=d.transaction(['projects','settings'],'readwrite');try{await assertLive(tx.objectStore('settings'),snapshot.id,snapshot);await tx.objectStore('projects').put(snapshot);await tx.objectStore('settings').put(creativeIndex(snapshot),CREATIVE_INDEX_PREFIX+snapshot.id);await tx.done}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}});saveChain=next;await next;}
export async function listProjects():Promise<Project[]>{const d=await db(),trashed=new Set<string>((await d.get('settings','trash-projects'))||[]);return (await d.getAll('projects')).filter((p:Project)=>!trashed.has(p.id)).sort((a:Project,b:Project)=>b.updatedAt-a.updatedAt)}
// Trash hides objects without destroying drafts, shared media, or recoverable project data.
export async function trashedItems(kind:'projects'|'assets'):Promise<string[]>{return (await (await db()).get('settings','trash-'+kind))||[]}
export async function setTrashed(kind:'projects'|'assets',id:string,deleted:boolean){const d=await db();const tx=d.transaction('settings','readwrite');const key='trash-'+kind;const ids=new Set<string>((await tx.store.get(key))||[]);if(deleted)ids.add(id);else ids.delete(id);await tx.store.put([...ids],key);await tx.done}
export async function listTrashed(kind:'projects'|'assets'):Promise<(Project|Asset)[]>{const d=await db(),ids=new Set(await trashedItems(kind));return (await d.getAll(kind)).filter((item:Project|Asset)=>ids.has(item.id))}
/** Permanently erase a trashed project and only its own recovery records.
 * A tombstone prevents queued writes in this or another tab from resurrecting it. */
export async function purgeProject(id:string){
 await saveChain.catch(()=>{});const d=await db(),tx=d.transaction(['settings','projects','runs','chunks','revisions','jobs','attachments'],'readwrite',{durability:'strict'});
 try{const settings=tx.objectStore('settings'),trash=new Set<string>((await settings.get('trash-projects'))||[]);if(!trash.has(id)||!await tx.objectStore('projects').get(id))throw new Error('Only a film in Recovery can be permanently deleted.');
  const runs=tx.objectStore('runs'),chunks=tx.objectStore('chunks'),projectRuns=await runs.index('projectId').getAll(id) as GenerationRun[];if(projectRuns.some(run=>run.status==='streaming'))throw new Error('Stop this film’s active generation in all open tabs before permanently deleting it.');
  const ownedAttachments=await tx.objectStore('attachments').index('projectId').getAllKeys(id),ownedRuns=new Set(projectRuns.map(run=>run.id)),ownedIds=[id,...ownedRuns,...ownedAttachments.map(String)];for(const name of ['projects','runs','chunks','revisions','jobs','attachments'] as const){let cursor=await tx.objectStore(name).openCursor();while(cursor){const record=cursor.value,other=name==='projects'?record.id!==id:name==='chunks'?!ownedRuns.has(record.runId):record.projectId!==id;if(other&&ownedIds.some(ownedId=>containsReference(record,ownedId)))throw new Error('Another film or recovery record still references this film or its files. Remove that reference before deleting it.');cursor=await cursor.continue()}}
  for(const run of projectRuns){for(const chunk of await chunks.index('runId').getAllKeys(run.id))await chunks.delete(chunk);await runs.delete(run.id)}
  for(const name of ['revisions','jobs','attachments'] as const){const store=tx.objectStore(name),keys=await store.index('projectId').getAllKeys(id);if(name==='attachments'){const deleted=new Set<string>((await settings.get(PURGED_ATTACHMENTS))||[]);for(const key of keys)deleted.add(String(key));await settings.put([...deleted],PURGED_ATTACHMENTS)}for(const key of keys)await store.delete(key)}
  await tx.objectStore('projects').delete(id);await settings.delete(CREATIVE_INDEX_PREFIX+id);const golden=await settings.get('creative-golden-v1');if(Array.isArray(golden))await settings.put(golden.filter((item:any)=>item?.sourceProjectId!==id),'creative-golden-v1');trash.delete(id);await settings.put([...trash],'trash-projects');const purged=new Set<string>((await settings.get(PURGED_PROJECTS))||[]);purged.add(id);await settings.put([...purged],PURGED_PROJECTS);await tx.done;
 }catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}
}
/** Refuse to erase shared files until no saved film or recovery record references them. */
export async function purgeAsset(id:string){
 await saveChain.catch(()=>{});const d=await db(),tx=d.transaction(['settings','assets','projects','runs','chunks','revisions','jobs','attachments'],'readwrite',{durability:'strict'});
 try{const settings=tx.objectStore('settings'),trash=new Set<string>((await settings.get('trash-assets'))||[]);if(!trash.has(id)||!await tx.objectStore('assets').get(id))throw new Error('Only media in Recovery can be permanently deleted.');
  for(const name of ['projects','runs','chunks','revisions','jobs','attachments'] as const){let cursor=await tx.objectStore(name).openCursor();while(cursor){if(name==='runs'&&cursor.value.status==='streaming')throw new Error('Stop active generations in all open tabs before permanently deleting media.');if(containsReference(cursor.value,id))throw new Error('This media is still referenced by a saved film or recovery record. Remove those references before deleting it permanently.');cursor=await cursor.continue()}}
  await tx.objectStore('assets').delete(id);const golden=await settings.get('creative-golden-v1');if(Array.isArray(golden))await settings.put(golden.filter((item:any)=>item?.sourceId!==id),'creative-golden-v1');trash.delete(id);await settings.put([...trash],'trash-assets');const purged=new Set<string>((await settings.get(PURGED_ASSETS))||[]);purged.add(id);await settings.put([...purged],PURGED_ASSETS);await tx.done;
 }catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}
}
export async function getProject(id:string):Promise<Project|undefined>{await saveChain.catch(()=>{});return (await db()).get('projects',id)}
export async function putAsset(asset:Asset){const d=await db(),tx=d.transaction(['assets','settings'],'readwrite');try{const purged:string[]=(await tx.objectStore('settings').get(PURGED_ASSETS))||[];if(purged.includes(asset.id))throw new Error('This media was permanently deleted. Import it again as a new file.');await tx.objectStore('assets').put(asset);await tx.done}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}}
export async function getAssets():Promise<Asset[]>{return (await db()).getAll('assets')}
export async function putAttachment(attachment:FilmAttachment){
 if(!attachment||typeof attachment.id!=='string'||!attachment.id||typeof attachment.projectId!=='string'||!attachment.projectId||typeof attachment.name!=='string'||typeof attachment.mime!=='string'||!(attachment.data instanceof Blob)||!Number.isFinite(attachment.createdAt)||attachment.size!==attachment.data.size)throw new Error('Invalid attached file.');
 const d=await db(),tx=d.transaction(['attachments','assets','settings'],'readwrite');try{const settings=tx.objectStore('settings');await assertLive(settings,attachment.projectId,attachment.assetId);const purged:string[]=(await settings.get(PURGED_ATTACHMENTS))||[];if(purged.includes(attachment.id))throw new Error('This file was permanently deleted. Attach it again as a new file.');if(await tx.objectStore('attachments').get(attachment.id))throw new Error('An attached file with this identity already exists; its original bytes were preserved.');if(attachment.assetId&&!await tx.objectStore('assets').get(attachment.assetId))throw new Error('The linked media could not be found.');await tx.objectStore('attachments').add(attachment);await tx.done}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}
}
export async function getAttachments(projectId:string):Promise<FilmAttachment[]>{return (await (await db()).getAllFromIndex('attachments','projectId',projectId)).sort((a:FilmAttachment,b:FilmAttachment)=>a.createdAt-b.createdAt)}
export async function linkAttachmentAsset(id:string,projectId:string,assetId:string){const d=await db(),tx=d.transaction(['attachments','assets','settings'],'readwrite');try{await assertLive(tx.objectStore('settings'),projectId,assetId);const store=tx.objectStore('attachments'),item=await store.get(id) as FilmAttachment|undefined;if(!item||item.projectId!==projectId)throw new Error('This attached file is missing or belongs to another film.');if(item.assetId&&item.assetId!==assetId)throw new Error('This file is already linked to different media.');if(!await tx.objectStore('assets').get(assetId))throw new Error('The linked media could not be found.');await store.put({...item,assetId});await tx.done}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}}
/** Removing an unsent attachment frees its Blob. Already-referenced files must first be removed from their saved context. */
export async function deleteAttachment(id:string){
 await saveChain.catch(()=>{});const d=await db(),tx=d.transaction(['settings','attachments','projects','runs','chunks','revisions','jobs'],'readwrite',{durability:'strict'});
 try{const store=tx.objectStore('attachments'),item=await store.get(id) as FilmAttachment|undefined;if(!item)throw new Error('This attached file was not found.');
  for(const name of ['projects','runs','chunks','revisions','jobs'] as const){let cursor=await tx.objectStore(name).openCursor();while(cursor){if(containsReference(cursor.value,id))throw new Error('This file is still referenced by a saved film or recovery record. Remove that reference before permanently deleting it.');cursor=await cursor.continue()}}
  await store.delete(id);const settings=tx.objectStore('settings'),purged=new Set<string>((await settings.get(PURGED_ATTACHMENTS))||[]);purged.add(id);await settings.put([...purged],PURGED_ATTACHMENTS);await tx.done;
 }catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}
}
export async function saveRun(run:GenerationRun){const d=await db(),tx=d.transaction(['runs','settings'],'readwrite');try{const settings=tx.objectStore('settings');await assertLive(settings,run.projectId,run);const purged:string[]=(await settings.get(PURGED_RUNS))||[];if(purged.includes(run.id))throw new Error('This draft was permanently deleted. Start a new run.');await tx.objectStore('runs').put(run);await tx.done}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}}
export async function getRuns(projectId:string):Promise<GenerationRun[]>{return (await (await db()).getAllFromIndex('runs','projectId',projectId)).sort((a,b)=>b.createdAt-a.createdAt)}
export async function getRun(id:string):Promise<GenerationRun|undefined>{return (await db()).get('runs',id)}
export async function appendChunk(runId:string,seq:number,text:string){const d=await db();const tx=d.transaction(['runs','chunks'],'readwrite',{durability:'strict'});const run=await tx.objectStore('runs').get(runId) as GenerationRun|undefined;if(!run){tx.abort();await tx.done.catch(()=>{});throw new Error('Generation journal is missing. Stop and export your draft.');}const existing=await tx.objectStore('chunks').get([runId,seq]) as Chunk|undefined;if(existing){if(existing.text!==text){tx.abort();await tx.done.catch(()=>{});throw new Error('Conflicting generation chunk; original was preserved.');}await tx.done;return;}if(seq!==run.lastSeq+1){tx.abort();await tx.done.catch(()=>{});throw new Error('Out-of-order stream chunk; original was preserved.');}await tx.objectStore('chunks').add({runId,seq,text,createdAt:Date.now()});await tx.objectStore('runs').put({...run,lastSeq:seq,updatedAt:Date.now()});await tx.done;}
export async function getChunks(runId:string):Promise<Chunk[]>{return (await (await db()).getAllFromIndex('chunks','runId',runId)).sort((a,b)=>a.seq-b.seq)}
export async function getDraft(run:GenerationRun){return combineContinuation(run.baseText,(await getChunks(run.id)).map(c=>c.text).join(''))}
export async function finishRun(id:string,status:GenerationRun['status'],error?:string,finishReason?:string){const d=await db();const tx=d.transaction('runs','readwrite');const run=await tx.store.get(id);if(run)await tx.store.put({...run,status,error,finishReason,updatedAt:Date.now()});await tx.done;}
type OwnedRun=GenerationRun&{ownerProtocol?:'web-lock-v1'};
const ownedRuns=new Set<string>();
const runLockName=(id:string)=>'frame:generation:'+id;
/** Hold ownership until the provider has stopped and the journal status is durable. */
export async function withRunOwnership<T>(run:GenerationRun,work:(run:GenerationRun)=>Promise<T>):Promise<T>{
 const locks=typeof navigator!=='undefined'?navigator.locks:undefined;
 const execute=async(owned:GenerationRun)=>{if(ownedRuns.has(run.id))throw new Error('This generation is already active in this tab.');ownedRuns.add(run.id);try{return await work(owned)}finally{ownedRuns.delete(run.id)}};
 if(!locks)return execute(run);
 return locks.request(runLockName(run.id),{mode:'exclusive',ifAvailable:true},async lock=>{if(!lock)throw new Error('This generation is already active in another tab.');return execute({...run,ownerProtocol:'web-lock-v1'} as OwnedRun)});
}
async function markInterruptedIfStreaming(id:string,requireProtocol:boolean){const d=await db(),tx=d.transaction('runs','readwrite');const run=await tx.store.get(id) as OwnedRun|undefined;let changed=false;if(run?.status==='streaming'&&(!requireProtocol||run.ownerProtocol==='web-lock-v1')){await tx.store.put({...run,status:'interrupted',error:'Generation was interrupted. All received chunks remain saved.',updatedAt:Date.now()});changed=true}await tx.done;return changed}
/** Never guess whether a legacy or unsupported-browser journal is still running. */
export async function recoverRuns(){const locks=typeof navigator!=='undefined'?navigator.locks:undefined;if(!locks)return 0;const runs=await (await db()).getAll('runs') as OwnedRun[];let recovered=0;for(const run of runs){if(run.status!=='streaming'||run.ownerProtocol!=='web-lock-v1'||ownedRuns.has(run.id))continue;const changed=await locks.request(runLockName(run.id),{mode:'exclusive',ifAvailable:true},lock=>lock?markInterruptedIfStreaming(run.id,true):false);if(changed)recovered++}return recovered}
/** Explicit fallback for old journals or browsers without Web Locks. The caller must first ask the user to close other Frame tabs. */
export async function recoverRunExplicitly(id:string,otherTabsClosed:boolean){if(!otherTabsClosed)throw new Error('Close other Frame tabs before recovering this draft.');if(ownedRuns.has(id))throw new Error('This generation is still running in this tab. Stop it first.');const run=await getRun(id) as OwnedRun|undefined;if(!run||run.status!=='streaming')throw new Error('This draft is not awaiting recovery.');const locks=typeof navigator!=='undefined'?navigator.locks:undefined;if(locks&&run.ownerProtocol==='web-lock-v1'){return locks.request(runLockName(id),{mode:'exclusive',ifAvailable:true},lock=>{if(!lock)throw new Error('This generation is still running in another tab. Stop it first.');return markInterruptedIfStreaming(id,true)})}return markInterruptedIfStreaming(id,false)}
export async function addRevision(projectId:string,sceneId:string,code:string,title:string,scene?:Scene){const r:Revision={id:uid(),projectId,sceneId,code,title,createdAt:Date.now(),...(scene?{scene:structuredClone(scene)}:{})};const d=await db(),tx=d.transaction(['revisions','settings'],'readwrite');try{await assertLive(tx.objectStore('settings'),projectId,r);await tx.objectStore('revisions').put(r);await tx.done;return r}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}}
export async function getRevisions(projectId:string):Promise<Revision[]>{return (await (await db()).getAllFromIndex('revisions','projectId',projectId)).sort((a,b)=>b.createdAt-a.createdAt)}
export async function purgeRevision(id:string,projectId:string){const d=await db(),tx=d.transaction('revisions','readwrite',{durability:'strict'});try{const revision=await tx.store.get(id) as Revision|undefined;if(!revision||revision.projectId!==projectId)throw new Error('That saved version is no longer available.');await tx.store.delete(id);await tx.done}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}}
export async function purgeRun(id:string,projectId:string){await saveChain.catch(()=>{});const d=await db(),tx=d.transaction(['settings','projects','runs','chunks','revisions','jobs'],'readwrite',{durability:'strict'});try{const runs=tx.objectStore('runs'),run=await runs.get(id) as GenerationRun|undefined;if(!run||run.projectId!==projectId)throw new Error('That draft is no longer available.');if(run.status==='streaming')throw new Error('Stop this generation before permanently deleting it.');for(const name of ['projects','revisions','jobs'] as const){let cursor=await tx.objectStore(name).openCursor();while(cursor){if(containsReference(cursor.value,id))throw new Error('This draft is still referenced by a saved film or recovery record. Remove that reference first.');cursor=await cursor.continue()}}let cursor=await runs.openCursor();while(cursor){if(cursor.key!==id&&containsReference(cursor.value,id))throw new Error('A later draft still depends on this run. Remove that later draft first.');cursor=await cursor.continue()}const chunks=tx.objectStore('chunks');for(const key of await chunks.index('runId').getAllKeys(id))await chunks.delete(key);await runs.delete(id);const settings=tx.objectStore('settings'),purged=new Set<string>((await settings.get(PURGED_RUNS))||[]);purged.add(id);await settings.put([...purged],PURGED_RUNS);await tx.done}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}}
export async function putJob(job:MediaJob){const d=await db(),tx=d.transaction(['jobs','settings'],'readwrite');try{await assertLive(tx.objectStore('settings'),job.projectId,job);await tx.objectStore('jobs').put(job);await tx.done}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}}
export async function getJobs(projectId:string):Promise<MediaJob[]>{return (await db()).getAllFromIndex('jobs','projectId',projectId)}
export async function setSetting(key:string,value:unknown){await (await db()).put('settings',value,key)}
export async function getSetting<T>(key:string):Promise<T|undefined>{return (await db()).get('settings',key)}
export interface ArchivedAttachment extends Omit<FilmAttachment,'data'>{data:string}
export interface ProjectArchive {format:'frame-project';version:1;project:Project;assets:Asset[];runs:GenerationRun[];chunks:Chunk[];revisions:Revision[];jobs:MediaJob[];attachments?:ArchivedAttachment[]}
export async function createArchive(project:Project):Promise<ProjectArchive>{const journal=createMcpJournal();let liveHistory;try{liveHistory=await journal.exportRecords(project.id)}finally{await journal.close()}const history=mergeMcpHistory(project.mcpHistory,liveHistory),snapshot=structuredClone(project);if(history.length)snapshot.mcpHistory=history;else delete snapshot.mcpHistory;const assets:Asset[]=await (await db()).getAll('assets');const runs=await getRuns(project.id);const chunks=(await Promise.all(runs.map(r=>getChunks(r.id)))).flat();const attachments=await Promise.all((await getAttachments(project.id)).map(async a=>({...a,data:await fileData(a.data)})));return {format:'frame-project',version:1,project:snapshot,assets,runs,chunks,revisions:await getRevisions(project.id),jobs:await getJobs(project.id),attachments}}
function archiveBlob(source:string,mime:string):Blob{const match=/^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(source);if(!match||match[1].length%4!==0)throw new Error('An archived file has invalid encoded bytes.');const chunks:Uint8Array<ArrayBuffer>[]=[];try{for(let i=0;i<match[1].length;i+=65536){const text=atob(match[1].slice(i,i+65536)),part=new Uint8Array(text.length);for(let j=0;j<text.length;j++)part[j]=text.charCodeAt(j);chunks.push(part)}}catch{throw new Error('An archived file has invalid encoded bytes.')}return new Blob(chunks,{type:mime})}
export function validateProject(value:unknown):asserts value is Project {
 if(!value||typeof value!=='object')throw new Error('Not a Frame project.');const p=value as Project;
 if(typeof p.id!=='string'||typeof p.name!=='string'||!Array.isArray(p.scenes)||!p.scenes.length||!Array.isArray(p.audio)||!p.settings)throw new Error('This project file is missing required fields.');
 if(p.scenes.length>10000)throw new Error('Split this project into reels of 10,000 scenes or fewer.');
 if(p.hiddenModelIds!==undefined&&(!Array.isArray(p.hiddenModelIds)||p.hiddenModelIds.length>2000||p.hiddenModelIds.some(id=>typeof id!=='string')))throw new Error('Invalid removed 3D model list.');
 if(p.models!==undefined){if(!Array.isArray(p.models)||p.models.length>2000)throw new Error('Invalid 3D library.');const ids=new Set<string>();for(const m of p.models){if(!m||typeof m.id!=='string'||typeof m.name!=='string'||ids.has(m.id)||(!m.builtin&&!m.procedural&&(!m.data||!/^data:[^,]*;base64,/.test(m.data))))throw new Error('A model is missing its embedded bytes or identity.');if(m.procedural)m.procedural=validateProceduralModel(m.procedural);ids.add(m.id)}}
 const ids=new Set<string>();for(const s of p.scenes){if(typeof s.id!=='string'||ids.has(s.id)||typeof s.code!=='string'||!Number.isFinite(s.duration)||s.duration<=0||!Array.isArray(s.layers))throw new Error('A scene has invalid code, duration, or layers.');ids.add(s.id);if(s.three)s.three=normalizeThreeDocument(s.three,p.models||[]);if(s.motion)s.motion=normalizeMotionDocument(s.motion);if(s.continuity&&(!Array.isArray(s.continuity.characterIds)||!Array.isArray(s.continuity.locationIds)||!Array.isArray(s.continuity.mustInclude)||typeof s.continuity.stateAfter!=='object'))throw new Error('Invalid scene continuity.');}
 if(p.story&&(!Array.isArray(p.story.characters)||!Array.isArray(p.story.locations)||!Array.isArray(p.story.lockedFacts)||typeof p.story.initialState!=='object'))throw new Error('Invalid story bible.');
 if(p.story)for(const record of [...p.story.characters,...p.story.locations])if(!record||typeof record.id!=='string'||typeof record.name!=='string'||!Array.isArray(record.referenceAssetIds))throw new Error('Invalid cast or location reference.');
 if(p.production!==undefined&&(!Array.isArray(p.production)||p.production.some(q=>!q||typeof q.id!=='string'||!Array.isArray(q.items)||q.items.some(i=>!i||typeof i.id!=='string'||!Number.isFinite(i.duration)||i.duration<=0))))throw new Error('Invalid production queue.');
 if(p.vorkDraft!==undefined)validateVorkDraft(p.vorkDraft);
 if(p.integrationJobs!==undefined&&!Array.isArray(p.integrationJobs))throw new Error('Invalid integration jobs.');
 if(p.mcpHistory!==undefined)p.mcpHistory=mergeMcpHistory(p.mcpHistory);
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
 if(!Array.isArray(a.attachments??[]))throw new Error('Invalid attached file collection.');a.attachments??=[];
 for(const item of a.assets)if(!item||typeof item.id!=='string'||typeof item.data!=='string'||!['audio','video','image'].includes(item.kind)||!item.data.startsWith('data:'))throw new Error('An archived media asset is invalid.');
 for(const r of a.runs)if(!r||typeof r.id!=='string'||typeof r.baseText!=='string'||!Number.isInteger(r.lastSeq))throw new Error('An archived generation is invalid.');
 const runIds=new Set(a.runs.map(r=>r.id));
 for(const c of a.chunks)if(!c||!runIds.has(c.runId)||!Number.isInteger(c.seq)||typeof c.text!=='string')throw new Error('An archived generation chunk is invalid.');
 for(const r of a.revisions)if(!r||typeof r.id!=='string'||typeof r.code!=='string')throw new Error('An archived revision is invalid.');
 for(const j of a.jobs)if(!j||typeof j.id!=='string'||typeof j.provider!=='string')throw new Error('An archived media job is invalid.');
 const attachmentIds=new Set<string>(),decodedAttachments:FilmAttachment[]=[];
 for(const f of a.attachments){if(!f||typeof f.id!=='string'||!f.id||attachmentIds.has(f.id)||f.projectId!==a.project.id||typeof f.name!=='string'||typeof f.mime!=='string'||typeof f.data!=='string'||!Number.isFinite(f.createdAt)||!Number.isSafeInteger(f.size)||f.size<0||(f.assetId!==undefined&&typeof f.assetId!=='string'))throw new Error('An archived attached file is invalid.');const data=archiveBlob(f.data,f.mime);if(data.size!==f.size)throw new Error('An archived attached file has incomplete bytes.');attachmentIds.add(f.id);decodedAttachments.push({...f,data})}
 if(a.project.vorkDraft&&!attachmentIds.has(a.project.vorkDraft.attachmentId))throw new Error('The saved Vork source archive is missing from this project backup.');
 for(const message of a.project.chat?.messages||[])for(const id of message.attachmentIds||[])if(!attachmentIds.has(id))throw new Error('A saved Chat message references an attached file missing from the archive.');
 for(const f of decodedAttachments)if(f.assetId&&!a.assets.some(asset=>asset.id===f.assetId))throw new Error('An attached file references missing media.');
 // Restore as an independent project, so older backups can never overwrite newer histories.
 const map=new Map<string,string>();const fresh=(id:string)=>{if(!map.has(id))map.set(id,uid());return map.get(id)!};
 const originalId=a.project.id;a.project.id=fresh(originalId);a.project.updatedAt=Date.now();
 const originalScenes=a.project.scenes.map(s=>s.id);for(const id of originalScenes)fresh(id);
 a.project.sceneAliases={...Object.fromEntries(Object.entries(a.project.sceneAliases||{}).map(([source,target])=>[source,fresh(target)])),...Object.fromEntries(originalScenes.map(id=>[id,fresh(id)]))};
 const mediaIds=new Set(a.assets.map(item=>item.id));
 a.project.assetAliases={...Object.fromEntries(Object.entries(a.project.assetAliases||{}).map(([source,target])=>[source,fresh(target)])),...Object.fromEntries([...mediaIds].map(id=>[id,fresh(id)]))};
 if(a.project.productionTools)a.project.productionTools=remapProductionToolsDocument(a.project.productionTools,{assetId:id=>mediaIds.has(id)?fresh(id):id});
 if(a.project.vorkDraft)a.project.vorkDraft.attachmentId=fresh(a.project.vorkDraft.attachmentId);
 if(a.project.chat)a.project.chat=remapDirectorChat(a.project.chat,{runId:fresh,mediaId:id=>mediaIds.has(id)?fresh(id):id,sceneId:id=>id?fresh(id):id,queueId:fresh,itemId:fresh,mediaIds:[...mediaIds],attachmentId:fresh});
 if(a.project.story)for(const canon of [...a.project.story.characters,...a.project.story.locations])canon.referenceAssetIds=canon.referenceAssetIds.map(id=>mediaIds.has(id)?fresh(id):id);
 for(const q of a.project.production||[]){q.id=fresh(q.id);if(q.planRunId)q.planRunId=fresh(q.planRunId);if(q.status==='running')q.status='paused';for(const item of q.items){item.id=fresh(item.id);if(item.sceneId)item.sceneId=fresh(item.sceneId);if(item.runId)item.runId=fresh(item.runId);if(item.status==='running'){item.status='interrupted';item.error='Restored job. Continue from its saved draft.'}}}
 for(const job of a.project.integrationJobs||[])job.id=fresh(job.id);
 for(const job of a.project.pipelines||[]){job.id=fresh(job.id);if(job.queueId)job.queueId=fresh(job.queueId);if(job.state==='running')job.state='paused';job.settings.mediaConnectionId='';job.settings.roleConnections={};if(job.settings.mcp)job.settings.mcp={enabled:false,serverFingerprint:'',tools:[],mode:job.settings.mcp.mode};for(const task of job.tasks){const originalTaskId=task.id;task.id=fresh(task.id);if(rebaseTasks.has(originalTaskId))rebaseTasks.add(task.id);if(task.kind==='design'&&task.basis){try{const records=JSON.parse(task.basis);for(const c of records)c.referenceAssetIds=c.referenceAssetIds.map((id:string)=>mediaIds.has(id)?fresh(id):id);task.basis=JSON.stringify(records)}catch{throw new Error('Invalid saved character design checkpoint.')}}if(['scene','overlay','narration','mcp'].includes(task.kind)&&task.targetId)task.targetId=fresh(task.targetId);if(task.runId)task.runId=fresh(task.runId);if(task.assetId)task.assetId=fresh(task.assetId);if(task.jobId)task.jobId=fresh(task.jobId);if(task.status==='running')task.status='blocked';}}

 for(const s of a.project.scenes){s.id=fresh(s.id);for(const l of s.layers){l.id=fresh(l.id);l.assetId=fresh(l.assetId)}}
 for(const l of a.project.audio){l.id=fresh(l.id);l.assetId=fresh(l.assetId)}
 for(const asset of a.assets)asset.id=fresh(asset.id);
 for(const attachment of decodedAttachments){attachment.id=fresh(attachment.id);attachment.projectId=a.project.id;if(attachment.assetId)attachment.assetId=fresh(attachment.assetId)}
 for(const r of a.runs){r.id=fresh(r.id);r.projectId=a.project.id;if(r.sceneId)r.sceneId=fresh(r.sceneId);if(r.parentId)r.parentId=fresh(r.parentId);if(r.pipelineId)r.pipelineId=fresh(r.pipelineId);if(r.taskId)r.taskId=fresh(r.taskId);if(r.queueId)r.queueId=fresh(r.queueId);if(r.queueItemId)r.queueItemId=fresh(r.queueItemId);if(r.status==='streaming'){r.status='interrupted';r.error='Restored from a backup. Continue from the saved draft.'}}
 for(const c of a.chunks)c.runId=fresh(c.runId);
 for(const r of a.revisions){r.id=fresh(r.id);r.projectId=a.project.id;r.sceneId=fresh(r.sceneId);if(r.scene){r.scene.id=r.sceneId;for(const l of r.scene.layers){l.id=fresh(l.id);l.assetId=fresh(l.assetId)}}}
 for(const j of a.jobs){j.id=fresh(j.id);j.projectId=a.project.id;j.sceneId=fresh(j.sceneId);if(j.queueId)j.queueId=fresh(j.queueId);if(j.queueItemId)j.queueItemId=fresh(j.queueItemId);if(j.assetId)j.assetId=fresh(j.assetId)}
 for(const job of a.project.pipelines||[])for(const task of job.tasks)if(rebaseTasks.has(task.id)){const target=a.project.production?.find(q=>q.id===job.queueId)?.items.find(i=>i.id===task.targetId)?.sceneId;const scene=a.project.scenes.find(s=>s.id===target);if(scene)task.basis=await sceneFingerprint(scene);}
 const d=await db();const tx=d.transaction(['projects','assets','runs','chunks','revisions','jobs','attachments','settings'],'readwrite');
 try{await assertLive(tx.objectStore('settings'),a.project.id,a.project);await tx.objectStore('projects').add(a.project);for(const [name,items] of Object.entries({assets:a.assets,runs:a.runs,chunks:a.chunks,revisions:a.revisions,jobs:a.jobs,attachments:decodedAttachments})){for(const item of items)await tx.objectStore(name).add(item)}await tx.done;}catch(error){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw error}
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
