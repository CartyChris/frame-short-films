import type {ThreeDocument,ThreeInstance,TransformKeyframe,Vec3} from './types';

/** Collider dimensions and center are model-local. Box size is full width/height/depth;
 * sphere size[0] is its diameter (non-uniform object scale uses the largest axis). */
export interface PhysicsBody {
 instanceId:string;
 motion:'dynamic'|'static';
 collider:{shape:'box'|'sphere';size:Vec3;offset:Vec3};
 mass:number;
 friction:number;
 restitution:number;
 linearVelocity:Vec3;
 angularVelocity:Vec3;
 linearDamping:number;
 angularDamping:number;
}
export interface PhysicsOriginalTrack {
 instanceId:string;
 animation:ThreeInstance['animation'];
 keyframes:TransformKeyframe[];
 /** Identifies precisely the generated track, so restoring never erases later edits. */
 generatedFingerprint:string;
}
export interface PhysicsBake {
 engine:'jolt-physics@1.1.1';
 step:60;
 fingerprint:string;
 duration:number;
 originals:PhysicsOriginalTrack[];
}
export interface PhysicsDocument {
 version:1;
 gravity:Vec3;
 duration:number;
 ground:{enabled:boolean;height:number;friction:number;restitution:number};
 bodies:PhysicsBody[];
 bake?:PhysicsBake;
}

export const PHYSICS_AGENT_SCHEMA=`Optional physics: {version:1,gravity:[0,-9.81,0],duration:6,ground:{enabled:true,height:0,friction:0.5,restitution:0.1},bodies:[{instanceId:"EXISTING_INSTANCE_ID",motion:"dynamic",collider:{shape:"box",size:[1,1,1],offset:[0,0.5,0]},mass:1,friction:0.5,restitution:0.2,linearVelocity:[0,0,0],angularVelocity:[0,0,0],linearDamping:0.05,angularDamping:0.05}]}. Only include physics when physical collisions or gravity are requested. At most 32 unique existing instances; motion is dynamic or static. Explicit box full dimensions or sphere diameter (size[0]); offset and size are model-local and the instance scale is applied. Set appropriate center offset for floor-origin models. Mass is kg (.01–10000), velocities are world units/s (±100) or radians/s (±20), gravity ±100, friction 0–2, restitution and damping 0–1. Duration .1–30 seconds and no longer than the scene. All referenced models and instances must already exist in the returned scene; create ordinary model instances first if needed. Use a flat ground height matching the visible floor; other visible scenery does NOT collide unless assigned a static body. Position instances above the ground and avoid initially intersecting colliders. No ragdolls, cloth, fluid or mesh colliders. Frame uses real Jolt fixed 60Hz simulation, then saves ordinary editable position/rotation keyframes; the last pose holds after the simulation. Existing root/path/skeletal animation of participating objects is replaced during the baked motion and preserved for restore. Do not invent a bake, originals, fingerprint or generated keyframes: Frame computes these after validation.`;

export const PHYSICS_LIMITS={bodies:32,duration:30,hz:60,keyframes:1801} as const;
function fail(message:string):never{throw new Error(message)}
function rec(v:unknown,label:string):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))fail(`${label} must be an object.`);return v as Record<string,unknown>}
function num(v:unknown,fallback:number,min:number,max:number,label:string):number{if(v===undefined)return fallback;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(`${label} must be between ${min} and ${max}.`);return v}
function vector(v:unknown,fallback:Vec3,min:number,max:number,label:string):Vec3{if(v===undefined)return [...fallback];if(!Array.isArray(v)||v.length!==3)fail(`${label} needs three numbers.`);return v.map(x=>num(x,0,min,max,label)) as Vec3}
function enumValue<T extends string>(v:unknown,values:readonly T[],fallback:T,label:string):T{if(v===undefined)return fallback;if(!values.includes(v as T))fail(`Invalid ${label}.`);return v as T}
function identifier(v:unknown,label:string):string{if(typeof v!=='string'||!v.length||v.length>500)fail(`Invalid ${label}.`);return v}
function bool(v:unknown,fallback:boolean,label:string){if(v===undefined)return fallback;if(typeof v!=='boolean')fail(`${label} must be true or false.`);return v}
function normalAnimation(value:unknown):ThreeInstance['animation']{const a=rec(value,'Saved animation');return {preset:enumValue(a.preset,['idle','walk','wave','dance','none'],'none','animation preset'),speed:num(a.speed,1,0,20,'Animation speed'),phase:num(a.phase,0,-1e5,1e5,'Animation phase'),...(a.clip!==undefined?{clip:(()=>{if(typeof a.clip!=='string'||a.clip.length>500)fail('Invalid animation clip.');return a.clip})()}:{}),...(a.path!==undefined?{path:(()=>{if(!Array.isArray(a.path)||a.path.length>1000)fail('Saved animation path is too long.');return a.path.map(v=>vector(v,[0,0,0],-1e5,1e5,'Path position'))})()}:{} )}}
function normalKeys(value:unknown,duration:number):TransformKeyframe[]{if(value===undefined)return [];if(!Array.isArray(value)||value.length>2000)fail('Saved animation has too many keyframes.');return value.map(raw=>{const k=rec(raw,'Saved keyframe');return {time:num(k.time,0,0,duration,'Keyframe time'),...(k.position!==undefined?{position:vector(k.position,[0,0,0],-1e5,1e5,'Keyframe position')}:{}),...(k.rotation!==undefined?{rotation:vector(k.rotation,[0,0,0],-1e5,1e5,'Keyframe rotation')}:{}),...(k.scale!==undefined?{scale:vector(k.scale,[1,1,1],.001,1000,'Keyframe scale')}:{}),easing:enumValue(k.easing,['linear','ease'],'ease','keyframe easing')}}).sort((a,b)=>a.time-b.time)}

export function defaultPhysicsDocument(duration=6):PhysicsDocument{return {version:1,gravity:[0,-9.81,0],duration:Math.max(.1,Math.min(PHYSICS_LIMITS.duration,duration)),ground:{enabled:true,height:0,friction:.5,restitution:.1},bodies:[]}}
export function defaultPhysicsBody(instanceId:string):PhysicsBody{return {instanceId,motion:'dynamic',collider:{shape:'box',size:[1,1,1],offset:[0,.5,0]},mass:1,friction:.5,restitution:.2,linearVelocity:[0,0,0],angularVelocity:[0,0,0],linearDamping:.05,angularDamping:.05}}

/** Strict, bounded validation shared by archives and AI. This file never imports Jolt. */
export function normalizePhysicsDocument(input:unknown,instances:ThreeInstance[],sceneDuration:number):PhysicsDocument{
 const p=rec(input,'Physics'),defaults=defaultPhysicsDocument(sceneDuration),ids=new Set(instances.map(i=>i.id));
 if(p.version!==1)fail('Unsupported physics document version.');
 if(!Array.isArray(p.bodies)||p.bodies.length>PHYSICS_LIMITS.bodies)fail(`Physics supports at most ${PHYSICS_LIMITS.bodies} bodies per shot.`);
 const used=new Set<string>();
 const bodies=p.bodies.map(raw=>{const b=rec(raw,'Physics body'),id=identifier(b.instanceId,'Physics object ID');if(!ids.has(id))fail(`Physics object is missing: ${id}`);if(used.has(id))fail(`Duplicate physics body: ${id}`);used.add(id);const c=rec(b.collider,'Collider');return {instanceId:id,motion:enumValue(b.motion,['dynamic','static'],'dynamic','body motion'),collider:{shape:enumValue(c.shape,['box','sphere'],'box','collider shape'),size:vector(c.size,[1,1,1],.02,100,'Collider size'),offset:vector(c.offset,[0,0,0],-100,100,'Collider center')},mass:num(b.mass,1,.01,10000,'Mass'),friction:num(b.friction,.5,0,2,'Friction'),restitution:num(b.restitution,.2,0,1,'Bounce'),linearVelocity:vector(b.linearVelocity,[0,0,0],-100,100,'Velocity'),angularVelocity:vector(b.angularVelocity,[0,0,0],-20,20,'Spin'),linearDamping:num(b.linearDamping,.05,0,1,'Linear damping'),angularDamping:num(b.angularDamping,.05,0,1,'Angular damping')};});
 const g=p.ground===undefined?{}:rec(p.ground,'Physics ground');
 const result:PhysicsDocument={version:1,gravity:vector(p.gravity,defaults.gravity,-100,100,'Gravity'),duration:num(p.duration,defaults.duration,.1,Math.min(PHYSICS_LIMITS.duration,sceneDuration),'Physics duration'),ground:{enabled:bool(g.enabled,true,'Ground enabled'),height:num(g.height,0,-1000,1000,'Ground height'),friction:num(g.friction,.5,0,2,'Ground friction'),restitution:num(g.restitution,.1,0,1,'Ground bounce')},bodies};
 if(p.bake!==undefined){const b=rec(p.bake,'Physics bake');if(b.engine!=='jolt-physics@1.1.1'||b.step!==60)fail('Unsupported physics bake engine.');if(!Array.isArray(b.originals)||b.originals.length>PHYSICS_LIMITS.bodies)fail('Invalid original animation snapshots.');const seen=new Set<string>();result.bake={engine:b.engine,step:60,duration:num(b.duration,result.duration,.1,PHYSICS_LIMITS.duration,'Bake duration'),fingerprint:identifier(b.fingerprint,'Bake fingerprint'),originals:b.originals.map(raw=>{const o=rec(raw,'Original animation'),id=identifier(o.instanceId,'Original object ID');if(!ids.has(id)||seen.has(id))fail('Invalid original animation object reference.');seen.add(id);return {instanceId:id,animation:normalAnimation(o.animation),keyframes:normalKeys(o.keyframes,sceneDuration),generatedFingerprint:identifier(o.generatedFingerprint,'Generated track fingerprint')};})};}
 return result;
}

/** A revision checksum, not a security signature. Stable key ordering avoids false stale states. */
function stable(v:unknown):string{if(v===undefined)return 'null';if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';const o=v as Record<string,unknown>;return '{'+Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(o[k])).join(',')+'}'}
function checksum(value:unknown):string{const s=stable(value);let a=2166136261,b=5381;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i)}return `${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}:${s.length}`}
export function physicsTrackFingerprint(instance:Pick<ThreeInstance,'animation'|'keyframes'>):string{return checksum({animation:normalAnimation(instance.animation),keyframes:normalKeys(instance.keyframes,86400)})}
function originalFor(doc:ThreeDocument,instance:ThreeInstance):PhysicsOriginalTrack|undefined{const original=doc.physics?.bake?.originals.find(o=>o.instanceId===instance.id);return original&&original.generatedFingerprint===physicsTrackFingerprint(instance)?original:undefined}
export function physicsFingerprint(doc:ThreeDocument):string{
 if(!doc.physics)return 'none';
 const {bake:_,...settings}=doc.physics;
 return checksum({duration:doc.duration,settings,instances:settings.bodies.map(body=>{const i=doc.instances.find(i=>i.id===body.instanceId);if(!i)return {id:body.instanceId,missing:true};const original=originalFor(doc,i);return {id:i.id,assetId:i.assetId,position:i.position,rotation:i.rotation,scale:i.scale,animation:normalAnimation(original?.animation||i.animation),keyframes:normalKeys(original?.keyframes||i.keyframes,doc.duration)}})});
}
export function physicsBakeStatus(doc:ThreeDocument):'none'|'unbaked'|'ready'|'stale'{const p=doc.physics;if(!p?.bodies.length)return p?.bake?'stale':'none';if(!p.bake)return 'unbaked';return p.bake.fingerprint===physicsFingerprint(doc)&&p.bake.originals.length===p.bodies.length&&p.bake.originals.every(o=>p.bodies.some(b=>b.instanceId===o.instanceId)&&doc.instances.some(i=>i.id===o.instanceId&&physicsTrackFingerprint(i)===o.generatedFingerprint))?'ready':'stale'}

/** Restore only tracks still identical to our output. Later user edits always win. */
export function restorePhysicsAnimation(doc:ThreeDocument):ThreeDocument{
 if(!doc.physics?.bake)return doc;
 const {bake:_,...physics}=doc.physics;
 return {...doc,physics,instances:doc.instances.map(i=>{const original=originalFor(doc,i);return original?{...i,animation:structuredClone(original.animation),keyframes:structuredClone(original.keyframes)}:i})};
}
export function removePhysicsBody(doc:ThreeDocument,instanceId:string):ThreeDocument{
 if(!doc.physics)return doc;
 const instance=doc.instances.find(i=>i.id===instanceId),original=instance&&originalFor(doc,instance);
 const {bake,...settings}=doc.physics,bodies=settings.bodies.filter(b=>b.instanceId!==instanceId);
 return {...doc,instances:doc.instances.map(i=>i.id===instanceId&&original?{...i,animation:structuredClone(original.animation),keyframes:structuredClone(original.keyframes)}:i),physics:{...settings,bodies,...(bake&&bodies.length?{bake:{...bake,originals:bake.originals.filter(o=>o.instanceId!==instanceId)}}:{})}};
}
/** Rebase a finished bake onto unrelated concurrent edits, reject changed physical inputs. */
export function applyPhysicsBake(current:ThreeDocument,candidate:ThreeDocument):ThreeDocument{
 if(!candidate.physics?.bake||candidate.physics.bake.fingerprint!==physicsFingerprint(current))fail('The physics settings or object animation changed. Bake again before applying.');
 const affected=new Set([...(current.physics?.bake?.originals.map(o=>o.instanceId)||[]),...candidate.physics.bodies.map(b=>b.instanceId)]),byId=new Map(candidate.instances.map(i=>[i.id,i]));
 return {...current,physics:structuredClone(candidate.physics),instances:current.instances.map(i=>{const baked=byId.get(i.id);return affected.has(i.id)&&baked?{...i,animation:structuredClone(baked.animation),keyframes:structuredClone(baked.keyframes)}:i})};
}
