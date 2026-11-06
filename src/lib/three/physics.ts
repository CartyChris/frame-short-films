import {Euler,Quaternion,Vector3} from 'three';
import type JoltModule from 'jolt-physics';
import type {ModelAsset,ThreeDocument,ThreeInstance,TransformKeyframe,Vec3} from './types';
import {normalizePhysicsDocument,physicsFingerprint,physicsTrackFingerprint,restorePhysicsAnimation,PHYSICS_LIMITS} from './physics-types';
import type {PhysicsBody,PhysicsOriginalTrack} from './physics-types';

export interface PhysicsBakeOptions {signal?:AbortSignal;onProgress?:(progress:number)=>void}
let modulePromise:Promise<typeof JoltModule>|undefined;
let previousBake:Promise<void>=Promise.resolve();
async function loadJolt(){if(!modulePromise)modulePromise=import('jolt-physics/wasm-compat').then(m=>m.default()).catch(e=>{modulePromise=undefined;throw e});return modulePromise}
function cancelled(signal?:AbortSignal){if(signal?.aborted){const e=new Error('Physics bake cancelled. Your scene has not changed.');e.name='AbortError';throw e}}
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
const tuple=(v:Vector3):Vec3=>[v.x,v.y,v.z];

/** XYZ Euler keys match Frame's ordinary transform tracks. Pick the equivalent
 * Euler branch nearest the previous sample to avoid artificial ±π jumps. */
function continuousEuler(q:Quaternion,previous:Vec3):Vec3{
 const e=new Euler().setFromQuaternion(q,'XYZ'),raw:[number,number,number]=[e.x,e.y,e.z];
 const near=(v:Vec3)=>v.map((x,i)=>x+Math.round((previous[i]-x)/(Math.PI*2))*Math.PI*2) as Vec3;
 const a=near(raw),b=near([raw[0]+Math.PI,Math.PI-raw[1],raw[2]+Math.PI]);
 const cost=(v:Vec3)=>v.reduce((sum,x,i)=>sum+(x-previous[i])**2,0);
 return cost(a)<=cost(b)?a:b;
}
function initialTransform(i:ThreeInstance){const first=(key:'position'|'rotation'|'scale'):Vec3=>[...(i.keyframes?.find(k=>k[key])?.[key]||i[key])] as Vec3;return {position:first('position'),rotation:first('rotation'),scale:first('scale')}}

/** Real Jolt simulation; pure ordinary keys are returned only after full success.
 * Explicitly bounded and serialized to keep the WASM heap and UI work predictable. */
export async function bakePhysics(document:ThreeDocument,models:ModelAsset[],options:PhysicsBakeOptions={}):Promise<ThreeDocument>{
 cancelled(options.signal);
 const snapshot=structuredClone(document);
 if(!snapshot.physics?.bodies.length)throw new Error('Choose at least one physics body before baking.');
 snapshot.physics=normalizePhysicsDocument(snapshot.physics,snapshot.instances,snapshot.duration);
 const modelIds=new Set(models.map(m=>m.id));
 for(const body of snapshot.physics.bodies){const i=snapshot.instances.find(i=>i.id===body.instanceId)!;if(!modelIds.has(i.assetId))throw new Error(`The physics object ${i.name} has no available model.`)}
 const wait=previousBake;let release!:()=>void;previousBake=new Promise<void>(r=>{release=r});
 try{await wait;cancelled(options.signal);return await runBake(snapshot,options)}finally{release()}
}

async function runBake(snapshot:ThreeDocument,options:PhysicsBakeOptions):Promise<ThreeDocument>{
 const fingerprint=physicsFingerprint(snapshot),source=restorePhysicsAnimation(snapshot),physics=source.physics!;
 const J=await loadJolt();cancelled(options.signal);options.onProgress?.(0);
 let world:JoltModule.JoltInterface|undefined,settings:JoltModule.JoltSettings|undefined;
 const bodies:JoltModule.Body[]=[];
 let objectFilter:JoltModule.ObjectLayerPairFilterTable|undefined,broadphase:JoltModule.BroadPhaseLayerInterfaceTable|undefined,filter:JoltModule.ObjectVsBroadPhaseLayerFilterTable|undefined;
 const originals:PhysicsOriginalTrack[]=[];
 try{
  objectFilter=new J.ObjectLayerPairFilterTable(2);objectFilter.EnableCollision(0,1);objectFilter.EnableCollision(1,1);
  broadphase=new J.BroadPhaseLayerInterfaceTable(2,2);
  for(let n=0;n<2;n++){const layer=new J.BroadPhaseLayer(n);try{broadphase.MapObjectToBroadPhaseLayer(n,layer)}finally{J.destroy(layer)}}
  filter=new J.ObjectVsBroadPhaseLayerFilterTable(broadphase,2,objectFilter,2);
  settings=new J.JoltSettings();settings.mMaxBodies=128;settings.mMaxBodyPairs=4096;settings.mMaxContactConstraints=4096;settings.mMaxWorkerThreads=0;
  settings.mObjectLayerPairFilter=objectFilter;settings.mBroadPhaseLayerInterface=broadphase;settings.mObjectVsBroadPhaseLayerFilter=filter;
  world=new J.JoltInterface(settings);J.destroy(settings);settings=undefined;
  // JoltInterface takes ownership of the filtering interfaces.
  objectFilter=undefined;broadphase=undefined;filter=undefined;
  const system=world.GetPhysicsSystem(),bodyInterface=system.GetBodyInterface();
  const gravity=new J.Vec3(...physics.gravity);try{system.SetGravity(gravity)}finally{J.destroy(gravity)}
  function createBody(config:PhysicsBody,position:Vec3,rotation:Quaternion,dimensions:Vec3):JoltModule.Body{
   let shape:JoltModule.Shape|undefined,creation:JoltModule.BodyCreationSettings|undefined;
   const pos=new J.RVec3(...position),rot=new J.Quat(rotation.x,rotation.y,rotation.z,rotation.w);
   try{
    if(dimensions.some(v=>!Number.isFinite(v)||v<.001||v>1000))throw new Error('Scaled collider dimensions must be between .001 and 1000 world units.');
    if(config.collider.shape==='sphere')shape=new J.SphereShape(dimensions[0]/2);
    else {const half=new J.Vec3(dimensions[0]/2,dimensions[1]/2,dimensions[2]/2);try{shape=new J.BoxShape(half,Math.min(.02,...dimensions.map(v=>v/10)))}finally{J.destroy(half)}}
    const dynamic=config.motion==='dynamic';
    creation=new J.BodyCreationSettings(shape,pos,rot,dynamic?J.EMotionType_Dynamic:J.EMotionType_Static,dynamic?1:0);shape=undefined;
    creation.mFriction=config.friction;creation.mRestitution=config.restitution;creation.mLinearDamping=config.linearDamping;creation.mAngularDamping=config.angularDamping;
    creation.mMaxLinearVelocity=200;creation.mMaxAngularVelocity=40;
    if(dynamic){creation.mMotionQuality=J.EMotionQuality_LinearCast;creation.mOverrideMassProperties=J.EOverrideMassProperties_CalculateInertia;creation.mMassPropertiesOverride.mMass=config.mass;creation.mLinearVelocity.Set(...config.linearVelocity);creation.mAngularVelocity.Set(...config.angularVelocity)}
    const body=bodyInterface.CreateBody(creation);if(!J.getPointer(body))throw new Error('Jolt could not allocate the physics body.');
    bodies.push(body);bodyInterface.AddBody(body.GetID(),dynamic?J.EActivation_Activate:J.EActivation_DontActivate);return body;
   }finally{if(creation)J.destroy(creation);else if(shape)J.destroy(shape);J.destroy(pos);J.destroy(rot)}
  }
  if(physics.ground.enabled){
   const ground:PhysicsBody={instanceId:'__ground',motion:'static',collider:{shape:'box',size:[1000,1,1000],offset:[0,0,0]},mass:1,friction:physics.ground.friction,restitution:physics.ground.restitution,linearVelocity:[0,0,0],angularVelocity:[0,0,0],linearDamping:0,angularDamping:0};
   createBody(ground,[0,physics.ground.height-.5,0],new Quaternion(),ground.collider.size);
  }
  const simulated=physics.bodies.map(config=>{
   const instance=source.instances.find(i=>i.id===config.instanceId)!,initial=initialTransform(instance),rotation=new Quaternion().setFromEuler(new Euler(...initial.rotation));
   if(initial.position.some(v=>!Number.isFinite(v)||Math.abs(v)>1000))throw new Error('Physics start positions must be within 1000 world units of the origin.');
   const offset=new Vector3(...config.collider.offset).multiply(new Vector3(...initial.scale)),position=new Vector3(...initial.position).add(offset.clone().applyQuaternion(rotation));
   const dimensions=config.collider.shape==='sphere'?Array(3).fill(config.collider.size[0]*Math.max(...initial.scale)) as Vec3:config.collider.size.map((v,i)=>v*initial.scale[i]) as Vec3;
   const body=createBody(config,tuple(position),rotation,dimensions);
   originals.push({instanceId:instance.id,animation:structuredClone(instance.animation),keyframes:structuredClone(instance.keyframes||[]),generatedFingerprint:''});
   return {instance,body,config,offset,initial,previousRotation:initial.rotation,keys:[] as TransformKeyframe[],lastPosition:position.clone(),lastRotation:rotation.clone()};
  });
  system.OptimizeBroadPhase();
  const steps=Math.ceil(physics.duration*PHYSICS_LIMITS.hz),dt=1/PHYSICS_LIMITS.hz;
  function capture(time:number,fraction=1){for(const entry of simulated){
   if(entry.config.motion==='static'&&entry.keys.length)continue;
   const p=entry.body.GetPosition(),position=new Vector3(p.GetX(),p.GetY(),p.GetZ());
   const r=entry.body.GetRotation(),rotation=new Quaternion(r.GetX(),r.GetY(),r.GetZ(),r.GetW());
   if(fraction<1){position.lerpVectors(entry.lastPosition,position,fraction);rotation.slerpQuaternions(entry.lastRotation,rotation,fraction)}
   if([...position.toArray(),...rotation.toArray()].some(v=>!Number.isFinite(v))||position.length()>10000)throw new Error('Physics left the supported world bounds. Lower gravity, speed or duration.');
   const origin=position.clone().sub(entry.offset.clone().applyQuaternion(rotation));
   const euler=continuousEuler(rotation,entry.previousRotation);entry.previousRotation=euler;
   entry.keys.push({time,position:tuple(origin),rotation:euler,scale:[...entry.initial.scale],easing:'linear'});
   entry.lastPosition.copy(position);entry.lastRotation.copy(rotation);
  }}
  capture(0);
  for(let step=1;step<=steps;step++){
   cancelled(options.signal);world.Step(dt,1);
   const time=Math.min(step*dt,physics.duration),fraction=step===steps?(physics.duration-(step-1)*dt)/dt:1;capture(time,Math.max(0,Math.min(1,fraction)));
   if(step%20===0||step===steps){options.onProgress?.(step/steps);await pause()}
  }
  cancelled(options.signal);
  const tracks=new Map(simulated.map(e=>[e.instance.id,{animation:{preset:'none' as const,speed:1,phase:0},keyframes:e.keys}]));
  const instances=source.instances.map(i=>{const track=tracks.get(i.id);return track?{...i,...track}:i});
  for(const original of originals)original.generatedFingerprint=physicsTrackFingerprint(instances.find(i=>i.id===original.instanceId)!);
  return {...source,instances,physics:{...physics,bake:{engine:'jolt-physics@1.1.1',step:60,duration:physics.duration,fingerprint,originals}}};
 }finally{
  if(world){const api=world.GetPhysicsSystem().GetBodyInterface();for(const body of bodies){api.RemoveBody(body.GetID());api.DestroyBody(body.GetID())}J.destroy(world)}
  if(settings)J.destroy(settings);if(filter)J.destroy(filter);if(broadphase)J.destroy(broadphase);if(objectFilter)J.destroy(objectFilter);
 }
}
