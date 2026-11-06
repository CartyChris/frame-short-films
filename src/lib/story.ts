import type {Project,Scene} from './types';
import type {SceneContinuity,StoryBible,StoryCharacter,StoryLocation} from './story-types';

export function emptyStory(duration=30):StoryBible{return {version:1,logline:'',world:'',visualStyle:'',lockedFacts:[],initialState:{},targetDuration:duration,characters:[],locations:[]};}
export function sceneContinuity(scene:Scene):SceneContinuity{return scene.continuity||{summary:scene.notes||'',characterIds:[],locationIds:[],stateAfter:{},mustInclude:[],medium:scene.three?'3d':scene.motion?'motion':'code'};}
export function newCharacter():StoryCharacter{return {id:crypto.randomUUID(),name:'New character',role:'',appearance:'',personality:'',voice:'',referenceAssetIds:[],locked:true};}
export function newLocation():StoryLocation{return {id:crypto.randomUUID(),name:'New location',description:'',lighting:'',referenceAssetIds:[],locked:true};}
export function storyStateBefore(project:Project,sceneId:string):Record<string,string>{
  const state={...(project.story?.initialState||{})};
  for(const scene of project.scenes){if(scene.id===sceneId)break;Object.assign(state,scene.continuity?.stateAfter||{});}
  return state;
}
export function parseState(text:string):Record<string,string>{
  const state:Record<string,string>={};
  for(const line of text.split('\n')){if(!line.trim())continue;const at=line.indexOf('=');if(at<1)throw new Error('Write each state as name = value, for example Mara.location = observatory.');const key=line.slice(0,at).trim(),value=line.slice(at+1).trim();if(['__proto__','constructor','prototype'].includes(key))throw new Error('Choose another state name.');if(key.length>120||value.length>1200)throw new Error('Keep state names under 120 characters and values under 1200.');state[key]=value;}
  if(Object.keys(state).length>200)throw new Error('Use at most 200 current story-state entries.');
  return state;
}
export const formatState=(state:Record<string,string>)=>Object.entries(state).map(([key,value])=>`${key} = ${value}`).join('\n');
const clip=(text:string,max:number)=>text.length>max?text.slice(0,max-1)+'…':text;

/** A bounded continuity packet, shared by film-code, still-image and video requests.
 * State is folded over the whole earlier film, while only nearby scene summaries
 * and relevant cast/location definitions use the request's limited context. */
export function continuityPrompt(project:Project,scene:Scene,options:{kind?:'text'|'image'|'video';maxChars?:number}={}):string{
  const budget=Math.max(2000,Math.min(options.maxChars||14000,32000)),bible=project.story||emptyStory();
  const index=project.scenes.findIndex(s=>s.id===scene.id),current=sceneContinuity(scene),previous=index>0?project.scenes[index-1]:undefined;
  const castIds=new Set([...current.characterIds,...(previous?.continuity?.characterIds||[])]),locationIds=new Set([...current.locationIds,...(previous?.continuity?.locationIds||[])]);
  const cast=bible.characters.filter(c=>castIds.size?castIds.has(c.id):true).slice(0,20),locations=bible.locations.filter(l=>locationIds.size?locationIds.has(l.id):true).slice(0,12);
  const lines:string[]=[];let used=0;
  const add=(label:string,value:string,cap:number)=>{if(!value||used>=budget)return;const line=`${label}: ${clip(value,Math.min(cap,budget-used-label.length-3))}`;if(line.length+used<=budget){lines.push(line);used+=line.length+1;}};
  add('CONTINUITY CONTRACT','Respect canonical appearances, voices, locations and locked facts. Reuse referenced assets/models by ID. Do not redesign a recurring character or silently change established state. Scene state-after is a planned destination, not something that already happened.',500);
  add('FILM',project.name,200);add('STORY',bible.logline||project.brief,1200);add('WORLD',bible.world,1000);add('VISUAL LANGUAGE',bible.visualStyle,1000);
  add('LOCKED FACTS',bible.lockedFacts.map((fact,i)=>`${i+1}. ${fact}`).join('\n'),Math.floor(budget*.18));
  add('CURRENT SCENE',`${Math.max(0,index)+1}/${project.scenes.length}: ${scene.title}; ${scene.duration}s; medium ${current.medium}. ${current.summary||scene.notes}`,1200);
  // Reserve room for the last established state and immediate predecessor before
  // optional cast/background detail. Future scenes never affect current state.
  const state=storyStateBefore(project,scene.id),stateOrder=[...new Set([...Object.keys(current.stateAfter),...project.scenes.slice(0,Math.max(0,index)).reverse().flatMap(s=>Object.keys(s.continuity?.stateAfter||{})),...Object.keys(state)])];
  add('ESTABLISHED STATE BEFORE THIS SCENE',stateOrder.filter(key=>Object.hasOwn(state,key)).map(key=>`${key} = ${state[key]}`).join('\n'),Math.floor(budget*.22));
  if(previous)add('IMMEDIATELY PREVIOUS SCENE',`${previous.title}: ${sceneContinuity(previous).summary||previous.notes||'(no approved summary yet)'}`,1000);
  add('PLANNED STATE AFTER THIS SCENE',formatState(current.stateAfter),1200);
  add('REQUIRED DETAILS',current.mustInclude.join('\n'),800);
  for(const c of cast)add(`CHARACTER ${c.name} [${c.id}]`,`${c.locked?'CANONICAL. ':''}Role: ${c.role}. Look: ${c.appearance}. Personality: ${c.personality}. Voice: ${c.voice}. Reference asset/model IDs: ${c.referenceAssetIds.join(', ')||'none'}.`,1400);
  for(const l of locations)add(`LOCATION ${l.name} [${l.id}]`,`${l.locked?'CANONICAL. ':''}${l.description}. Lighting: ${l.lighting}. Reference asset/model IDs: ${l.referenceAssetIds.join(', ')||'none'}.`,1000);
  for(const s of project.scenes.slice(Math.max(0,index-4),Math.max(0,index-1)))add('EARLIER BEAT',`${s.title}: ${sceneContinuity(s).summary||s.notes}`,500);
  if(options.kind==='image'||options.kind==='video')add('SHOT RULE',`This is a ${options.kind} shot in the same film. Keep the named cast, costume, palette, scale and location consistent. Asset IDs describe canonical references; an ID alone is not a provider image attachment.`,350);
  return lines.join('\n');
}

export function storyModelReferences(project:Project):string[]{return [...new Set([...(project.story?.characters||[]).flatMap(c=>c.referenceAssetIds),...(project.story?.locations||[]).flatMap(l=>l.referenceAssetIds)])];}
