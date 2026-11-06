import type {Project,Scene} from './types';
import type {ProductionItem,ProductionItemStatus,ProductionQueue,SceneContinuity,StoryMedium} from './story-types';
import {emptyStory,sceneContinuity} from './story';
import {newScene} from './defaults';

const media:StoryMedium[]=['code','3d','motion','video','mixed'];
const uid=()=>crypto.randomUUID();
function record(value:unknown,label:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be an object.`);return value as Record<string,unknown>;}
function text(value:unknown,label:string,max=4000,optional=false){if(optional&&value===undefined)return '';if(typeof value!=='string'||(!optional&&!value.trim())||value.length>max)throw new Error(`${label} must be text with at most ${max} characters.`);return value.trim();}
function ids(value:unknown,known:Set<string>,label:string){if(value===undefined)return [];if(!Array.isArray(value)||value.length>100||value.some(v=>typeof v!=='string'||!known.has(v)))throw new Error(`${label} contains an unknown reference. Add it to the story bible first.`);return [...new Set(value as string[])];}
function state(value:unknown):Record<string,string>{if(value===undefined)return {};const r=record(value,'State after');if(Object.keys(r).length>200)throw new Error('A scene may update at most 200 state entries.');for(const [key,v] of Object.entries(r)){if(!key||key.length>120||['__proto__','constructor','prototype'].includes(key)||typeof v!=='string'||v.length>1200)throw new Error('State entries must have short names and text values.');}return r as Record<string,string>;}

export function makeStoryPlanMessages(project:Project,instruction:string){
 const story=project.story||emptyStory(project.scenes.reduce((n,s)=>n+s.duration,0));
 const shorten=(value:string,max:number)=>value.slice(0,max);
 const timeline:Record<string,unknown>[]=[];let timelineSize=0;
 for(const s of project.scenes){const item={sceneId:s.id,title:shorten(s.title,80),duration:s.duration,summary:shorten(sceneContinuity(s).summary,100),medium:sceneContinuity(s).medium};const size=JSON.stringify(item).length;if(timelineSize+size>55000)break;timeline.push(item);timelineSize+=size;}
 const catalog={characters:story.characters.slice(0,80).map(c=>({id:c.id,name:shorten(c.name,100),appearance:shorten(c.appearance,240),referenceAssetIds:c.referenceAssetIds.slice(0,6)})),locations:story.locations.slice(0,50).map(l=>({id:l.id,name:shorten(l.name,100),description:shorten(l.description,200),referenceAssetIds:l.referenceAssetIds.slice(0,6)})),models:(project.models||[]).slice(0,200).map(m=>({id:m.id,name:shorten(m.name,100)}))};
 const system=`You are the story editor and production planner for a film studio. Return only one JSON object, no markdown or prose. Never output executable code or canonical model definitions. Use this exact shape: {"title":"Plan title","scope":"new|film|selected","instruction":"Overall revision direction","scenes":[{"sceneId":"existing ID, omit for new scenes","title":"Scene title","duration":45,"summary":"What happens in this scene","instruction":"Specific visual/action direction","medium":"code|3d|motion|video|mixed","characterIds":[],"locationIds":[],"stateAfter":{"key":"new established value"}}]}. For new films use scope new and omit sceneId; a human will approve before scenes are appended. For revisions use film/selected and existing scene IDs only; preserve canonical identity and narrative continuity. Do not invent character/location reference IDs. Never put future state into an earlier scene. Plan 30-minute or two-hour films as individual manageable scenes, not one enormous source file. The scenes' durations should add to the requested runtime. Each item must be independently reviewable. At most 1000 scenes, each 0.1–3600 seconds. A human will review every generated scene before replacing its original.`;
 const context=JSON.stringify({film:shorten(project.name,200),brief:shorten(project.brief,2000),story:{logline:shorten(story.logline,1200),world:shorten(story.world,1600),visualStyle:shorten(story.visualStyle,1000),lockedFacts:story.lockedFacts.slice(0,50).map(f=>shorten(f,200)),initialState:Object.fromEntries(Object.entries(story.initialState).slice(0,50).map(([k,v])=>[shorten(k,120),shorten(v,200)])),targetDuration:story.targetDuration},catalog,timeline,omittedTimelineScenes:project.scenes.length-timeline.length});
 return [{role:'system',content:system},{role:'user',content:`USER DIRECTION\n${instruction.slice(0,12000)}\n\nCURRENT FILM AND CANON\n${context}`}];
}

export function parseStoryPlan(raw:string,project:Project):ProductionQueue{
 let value:unknown;try{const cleaned=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');value=JSON.parse(cleaned);}catch{throw new Error('The plan is not complete valid JSON yet. Keep its draft and continue generation.');}
 const plan=record(value,'Plan');if(!['new','film','selected'].includes(String(plan.scope)))throw new Error('Plan scope must be new, film, or selected.');
 if(Object.keys(plan).some(key=>!['title','scope','instruction','scenes'].includes(key)))throw new Error('Plans may describe scenes only. Edit canonical characters, locations, and models in the story bible.');
 if(!Array.isArray(plan.scenes)||!plan.scenes.length||plan.scenes.length>1000)throw new Error('A production plan needs 1–1000 scenes.');
 const characters=new Set(project.story?.characters.map(c=>c.id)||[]),locations=new Set(project.story?.locations.map(l=>l.id)||[]),sceneIds=new Set(project.scenes.map(s=>s.id)),seen=new Set<string>();
 const items:ProductionItem[]=plan.scenes.map((value,index)=>{const item=record(value,`Scene ${index+1}`);let sceneId=typeof item.sceneId==='string'?item.sceneId:undefined;
  const visited=new Set<string>();while(sceneId&&!sceneIds.has(sceneId)&&project.sceneAliases?.[sceneId]&&!visited.has(sceneId)){visited.add(sceneId);sceneId=project.sceneAliases[sceneId];}
  if(Object.keys(item).some(key=>!['sceneId','title','duration','summary','instruction','medium','characterIds','locationIds','stateAfter'].includes(key)))throw new Error(`Scene ${index+1} contains fields outside the plan schema.`);
  if(plan.scope!=='new'&&(!sceneId||!sceneIds.has(sceneId)))throw new Error(`Scene ${index+1} must refer to an existing scene ID.`);
  if(plan.scope==='new'&&sceneId)throw new Error('New-film plans must not replace existing scene IDs.');
  if(sceneId&&seen.has(sceneId))throw new Error('A revision plan cannot repeat a scene.');if(sceneId)seen.add(sceneId);
  if(typeof item.duration!=='number'||!Number.isFinite(item.duration)||item.duration<.1||item.duration>3600)throw new Error(`Scene ${index+1} needs a duration between 0.1 and 3600 seconds.`);
  if(!media.includes(item.medium as StoryMedium))throw new Error(`Scene ${index+1} has an unknown medium.`);
  return {id:uid(),sceneId,title:text(item.title,'Scene title',200),duration:item.duration,summary:text(item.summary,'Scene summary',4000),instruction:text(item.instruction,'Scene direction',6000),medium:item.medium as StoryMedium,characterIds:ids(item.characterIds,characters,'Cast'),locationIds:ids(item.locationIds,locations,'Locations'),stateAfter:state(item.stateAfter),status:'pending'};
 });
 if(items.reduce((n,item)=>n+item.duration,0)>36000)throw new Error('Split plans longer than ten hours into separate reels.');
 return {id:uid(),title:text(plan.title,'Plan title',200),scope:plan.scope as ProductionQueue['scope'],instruction:text(plan.instruction,'Plan instruction',6000,true),status:'draft',createdAt:Date.now(),updatedAt:Date.now(),items};
}

export function revisionQueue(project:Project,instruction:string,sceneIds?:string[]):ProductionQueue{
 if(!instruction.trim())throw new Error('Describe the change you want to make.');
 const selected=sceneIds?project.scenes.filter(s=>sceneIds.includes(s.id)):project.scenes;if(!selected.length)throw new Error('Choose at least one scene.');
 return {id:uid(),title:sceneIds?'Selected scene revision':'Whole-film revision',instruction,scope:sceneIds?'selected':'film',status:'draft',createdAt:Date.now(),updatedAt:Date.now(),items:selected.map(s=>{const c=sceneContinuity(s);return {id:uid(),sceneId:s.id,title:s.title,duration:s.duration,summary:c.summary,instruction,medium:c.medium,characterIds:c.characterIds,locationIds:c.locationIds,stateAfter:c.stateAfter,status:'pending'};})};
}
function replaceQueue(project:Project,queue:ProductionQueue):Project{return {...project,updatedAt:Date.now(),production:(project.production||[]).map(q=>q.id===queue.id?queue:q)};}
export function appendProductionQueue(project:Project,queue:ProductionQueue):Project{if(project.production?.some(q=>q.id===queue.id))throw new Error('This plan is already in the production queue.');return {...project,updatedAt:Date.now(),production:[...(project.production||[]),structuredClone(queue)]};}
export function approveProductionPlan(project:Project,queueId:string):Project{
 const queue=structuredClone(project.production?.find(q=>q.id===queueId));if(!queue)throw new Error('Plan not found.');if(queue.status!=='draft')throw new Error('This plan has already been approved.');
 const scenes=[...project.scenes];
 for(const item of queue.items){if(!item.sceneId){const scene=newScene('blank',item.title,item.duration);scene.template=undefined;scene.notes=item.instruction;scene.continuity={summary:item.summary,characterIds:item.characterIds,locationIds:item.locationIds,stateAfter:{},mustInclude:[],medium:item.medium};item.sceneId=scene.id;scenes.push(scene);}else if(!scenes.some(s=>s.id===item.sceneId))throw new Error('A planned scene was removed. Rebuild this plan.');}
 queue.status='ready';queue.updatedAt=Date.now();return replaceQueue({...project,scenes},queue);
}
export function nextProductionItem(queue:ProductionQueue):ProductionItem|undefined{
 if(!['ready','running'].includes(queue.status)||queue.items.some(i=>i.status==='running'||i.status==='review'||i.status==='interrupted'))return undefined;
 return queue.items.find(i=>i.status==='pending');
}
export function setProductionItemState(project:Project,queueId:string,itemId:string,status:ProductionItemStatus,detail:{runId?:string;error?:string}={}):Project{
 const queue=structuredClone(project.production?.find(q=>q.id===queueId));if(!queue)throw new Error('Plan not found.');const item=queue.items.find(i=>i.id===itemId);if(!item)throw new Error('Scene task not found.');
 if(status==='running'){
  if(queue.status==='draft')throw new Error('Approve this plan first.');
  if(queue.status==='paused')throw new Error('Resume this queue before generating another scene.');
  if(queue.items.some(i=>i.id!==itemId&&['running','review','interrupted'].includes(i.status)))throw new Error('Review or finish the current scene before starting another.');
  if(!item.sceneId||!project.scenes.some(s=>s.id===item.sceneId))throw new Error('This scene no longer exists.');
 }
 if(status==='applied'&&item.status!=='review')throw new Error('Only a reviewed draft can be marked applied.');
 item.status=status;if(detail.runId!==undefined)item.runId=detail.runId;item.error=detail.error;
 queue.status=queue.items.every(i=>i.status==='applied'||i.status==='skipped')?'complete':queue.items.some(i=>i.status==='running')?'running':queue.items.some(i=>i.status==='interrupted')?'paused':queue.status==='paused'?'paused':queue.items.some(i=>i.status==='review')?'review':'ready';queue.updatedAt=Date.now();
 let next=replaceQueue(project,queue);
 // State becomes established only when a human accepts this scene's draft.
 if(status==='applied')next={...next,scenes:next.scenes.map(s=>s.id===item.sceneId?{...s,title:item.title,duration:item.duration,continuity:{...sceneContinuity(s),summary:item.summary,characterIds:item.characterIds,locationIds:item.locationIds,stateAfter:item.stateAfter,medium:item.medium}}:s)};
 return next;
}
export function pauseProductionQueue(project:Project,queueId:string):Project{const queue=project.production?.find(q=>q.id===queueId);if(!queue)throw new Error('Plan not found.');if(queue.status==='complete'||queue.status==='draft')return project;return replaceQueue(project,{...queue,status:'paused',updatedAt:Date.now()});}
export function resumeProductionQueue(project:Project,queueId:string):Project{const queue=project.production?.find(q=>q.id===queueId);if(!queue)throw new Error('Plan not found.');if(queue.status==='draft')throw new Error('Approve this plan first.');if(queue.status==='complete')return project;return replaceQueue(project,{...queue,status:queue.items.some(i=>i.status==='review')?'review':'ready',updatedAt:Date.now()});}
export function recoverProductionQueues(project:Project):Project{return {...project,production:(project.production||[]).map(q=>({...q,status:q.status==='running'?'paused':q.status,items:q.items.map(item=>item.status==='running'?{...item,status:'interrupted',error:'The previous session ended. Its saved generation can be continued.'}:item)}))};}
export function productionInstruction(item:ProductionItem,queue:ProductionQueue):string{return `${queue.instruction}\n\nThis scene: ${item.instruction}\nStory beat: ${item.summary}\nTarget duration: ${item.duration} seconds. Medium: ${item.medium}.\nRequired cast IDs: ${item.characterIds.join(', ')}. Location IDs: ${item.locationIds.join(', ')}.\nPlanned state after the scene: ${JSON.stringify(item.stateAfter)}\nDo not replace other scenes or redesign canonical assets. Return only this scene's requested artifact.`;}
export function productionScene(project:Project,item:ProductionItem):Scene{const scene=project.scenes.find(s=>s.id===item.sceneId);if(!scene)throw new Error('The planned scene no longer exists.');return {...structuredClone(scene),title:item.title,duration:item.duration,continuity:{...sceneContinuity(scene),summary:item.summary,characterIds:[...item.characterIds],locationIds:[...item.locationIds],stateAfter:{...item.stateAfter},medium:item.medium}};}
export function productionTotals(queue:ProductionQueue){return {seconds:queue.items.reduce((n,i)=>n+i.duration,0),reviewed:queue.items.filter(i=>i.status==='applied'||i.status==='skipped').length,total:queue.items.length};}
