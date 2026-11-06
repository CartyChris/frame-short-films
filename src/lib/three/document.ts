import {normalizePhysicsDocument} from './physics-types';
import {normalizePathTracing} from './pathtracing-types';
import {normalizeQuarks} from './quarks';
import type {Appearance,CameraKeyframe,EditorCamera,ModelAsset,ThreeDocument,ThreeInstance,ThreePostprocessing,TransformKeyframe,Vec3} from './types';
const n=(v:unknown,d:number,min=-1e5,max=1e5)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):d;
const str=(v:unknown,d:string)=>typeof v==='string'?v.slice(0,500):d;
const record=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const color=(v:unknown,d:string)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:d;
const vec=(v:unknown,d:Vec3,min=-1e5,max=1e5):Vec3=>Array.isArray(v)&&v.length===3?[n(v[0],d[0],min,max),n(v[1],d[1],min,max),n(v[2],d[2],min,max)]:[...d];
const one=<T extends string>(v:unknown,values:readonly T[],d:T):T=>values.includes(v as T)?v as T:d;
export const defaultPostprocessing:Readonly<ThreePostprocessing>=Object.freeze({enabled:false,bloom:.3,bloomThreshold:.8,vignette:.25,brightness:0,contrast:0,hue:0,saturation:0,exposure:1.15});
export const POSTPROCESSING_LIMITS={bloom:[0,2],bloomThreshold:[0,2],vignette:[0,1],brightness:[-.25,.25],contrast:[-.5,.5],hue:[-Math.PI,Math.PI],saturation:[-1,1],exposure:[.25,3]} as const;
export function normalizePostprocessing(input:unknown):ThreePostprocessing{const value=record(input),result={...defaultPostprocessing,enabled:value.enabled===true};for(const key of Object.keys(POSTPROCESSING_LIMITS) as (keyof typeof POSTPROCESSING_LIMITS)[]){const [min,max]=POSTPROCESSING_LIMITS[key];result[key]=n(value[key],defaultPostprocessing[key],min,max)}return result}
export const builtInModels:ModelAsset[]=[
 {id:'cast-ava',name:'Ava · explorer',builtin:'ava',appearance:{skin:'#9e5e3d',hair:'#261e2c',shirt:'#cb643d',pants:'#24344c',accent:'#f2d480',hairStyle:'curly',bodyScale:1}},
 {id:'cast-leo',name:'Leo · maker',builtin:'leo',appearance:{skin:'#e9b58c',hair:'#603d29',shirt:'#e1b74d',pants:'#3e606c',accent:'#f1e7c9',hairStyle:'short',bodyScale:1.05}},
 {id:'cast-mira',name:'Mira · dreamer',builtin:'mira',appearance:{skin:'#bc815d',hair:'#252a31',shirt:'#568f94',pants:'#7b4b65',accent:'#efb9a4',hairStyle:'bob',bodyScale:.93}},
 ...(['tree','house','arch','lantern','rock'] as const).map(builtin=>({id:'set-'+builtin,name:builtin[0].toUpperCase()+builtin.slice(1),builtin}))
];
export function normalizeAppearance(input:unknown,base:Appearance=builtInModels[0].appearance!):Appearance{const a=record(input);return {skin:color(a.skin,base.skin),hair:color(a.hair,base.hair),shirt:color(a.shirt,base.shirt),pants:color(a.pants,base.pants),accent:color(a.accent,base.accent||'#f2d480'),hairStyle:one(a.hairStyle,['curly','short','bob'] as const,base.hairStyle||'curly'),bodyScale:n(a.bodyScale,base.bodyScale||1,.4,2)}}
export function createThreeDocument(preset:ThreeDocument['environment']['preset']='meadow',duration=12):ThreeDocument{
 const instance=(id:string,assetId:string,name:string,position:Vec3,preset:ThreeInstance['animation']['preset'],phase=0):ThreeInstance=>({id,assetId,name,position,rotation:[0,0,0],scale:[1,1,1],visible:true,animation:{preset,speed:1,phase}});
 return {version:1,duration:n(duration,12,.1,86400),environment:{preset,sky:preset==='cosmos'?'#131e39':preset==='studio'?'#c4bfbb':'#b9d8d5',ground:preset==='cosmos'?'#465374':preset==='studio'?'#a5a29a':'#6c9479',fog:true,lightIntensity:1,particles:true},camera:{position:[10,6.5,12],target:[0,1.2,0],fov:42,motion:'orbit',amplitude:.16},title:'A world worth imagining',subtitle:'THE SAME CAST. A THOUSAND NEW STORIES.',instances:[
 {...instance('actor-ava','cast-ava','Ava',[-2,0,1.5],'walk'),animation:{preset:'walk',speed:.85,phase:0,path:[[0,0,0],[1.5,0,-1],[3,0,0],[1.5,0,1],[0,0,0]]}},
 {...instance('actor-leo','cast-leo','Leo',[2.5,0,.7],'wave',.5),rotation:[0,-.5,0]},
 {...instance('actor-mira','cast-mira','Mira',[0,0,-1],'dance',1.4),rotation:[0,.2,0]},
 {...instance('house-a','set-house','The atelier',[-4,0,-4],'none'),scale:[1.2,1.2,1.2],rotation:[0,.25,0]},
 {...instance('arch-a','set-arch','Garden arch',[3,0,-4],'none'),rotation:[0,-.12,0]},
 {...instance('tree-a','set-tree','Willow',[-5,0,0],'idle'),scale:[1.25,1.25,1.25]},
 {...instance('tree-b','set-tree','Orchard',[5,0,-1.5],'idle'),scale:[.85,.85,.85]},
 instance('lamp-a','set-lantern','Lantern',[-.8,0,-3],'none')
 ]};
}
export function normalizeThreeDocument(input:unknown,models:ModelAsset[]):ThreeDocument{
 const d=record(input),base=createThreeDocument(),env=record(d.environment),cam=record(d.camera),ids=new Set(models.map(m=>m.id));
 if(!Array.isArray(d.instances))throw new Error('A 3D scene needs an instances array.');
 if(d.instances.length>500)throw new Error('Use at most 500 placed models per scene.');
 const used=new Set<string>();
 const duration=n(d.duration,base.duration,.1,86400);
 const keyframes=(value:unknown):TransformKeyframe[]=>Array.isArray(value)?value.slice(0,2000).map(v=>{const k=record(v);return {time:n(k.time,0,0,duration),...(k.position?{position:vec(k.position,[0,0,0])}:{}),...(k.rotation?{rotation:vec(k.rotation,[0,0,0])}:{}),...(k.scale?{scale:vec(k.scale,[1,1,1],.001,1000)}:{}),easing:one(k.easing,['linear','ease'],'ease')}}).sort((a,b)=>a.time-b.time):[];
 const instances=d.instances.map((raw:unknown,index:number):ThreeInstance=>{const i=record(raw),a=record(i.animation),assetId=str(i.assetId,'');if(!ids.has(assetId))throw new Error(`Model unavailable: ${assetId||'(empty model ID)'}. Add it to your cast library first.`);const id=str(i.id,`instance-${index}`);if(used.has(id))throw new Error(`Duplicate 3D object ID: ${id}`);used.add(id);return {id,assetId,name:str(i.name,models.find(m=>m.id===assetId)?.name||'Object'),position:vec(i.position,[0,0,0]),rotation:vec(i.rotation,[0,0,0]),scale:vec(i.scale,[1,1,1],.001,1000),visible:i.visible!==false,animation:{preset:one(a.preset,['idle','walk','wave','dance','none'],'idle'),speed:n(a.speed,1,0,20),phase:n(a.phase,0),...(typeof a.clip==='string'?{clip:a.clip.slice(0,500)}:{}),...(Array.isArray(a.path)?{path:a.path.slice(0,1000).map((p:unknown)=>vec(p,[0,0,0]))}:{})},keyframes:keyframes(i.keyframes)}});
 const cameraKeys:CameraKeyframe[]=Array.isArray(cam.keyframes)?cam.keyframes.slice(0,2000).map((raw:unknown)=>{const k=record(raw);return {time:n(k.time,0,0,duration),position:vec(k.position,base.camera.position),target:vec(k.target,base.camera.target),fov:n(k.fov,cam.fov||42,10,120),easing:one(k.easing,['linear','ease'],'ease')}}).sort((a,b)=>a.time-b.time):[];
 return {version:1,duration,...(d.physics?{physics:normalizePhysicsDocument(d.physics,instances,duration)}:{}),...(d.quarks?{quarks:normalizeQuarks(d.quarks)}:{}),...(d.pathTracing?{pathTracing:normalizePathTracing(d.pathTracing)}:{}),...(d.postprocessing&&typeof d.postprocessing==='object'&&!Array.isArray(d.postprocessing)?{postprocessing:normalizePostprocessing(d.postprocessing)}:{}),environment:{preset:one(env.preset,['meadow','city','cosmos','studio'],'meadow'),sky:color(env.sky,base.environment.sky),ground:color(env.ground,base.environment.ground),fog:env.fog!==false,lightIntensity:n(env.lightIntensity,1,0,5),particles:env.particles!==false,geometry:env.geometry!==false,defaultLights:env.defaultLights!==false},camera:{position:vec(cam.position,base.camera.position),target:vec(cam.target,base.camera.target),fov:n(cam.fov,42,10,120),motion:one(cam.motion,['static','orbit','dolly'],'static'),amplitude:n(cam.amplitude,.16,0,2),keyframes:cameraKeys},instances,title:str(d.title,''),subtitle:str(d.subtitle,'')};
}
export const validateThreeDocument=normalizeThreeDocument;
export function interpolateVec(a:Vec3,b:Vec3,t:number):Vec3{return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
export function sampleKeys<T extends {time:number;easing?:'linear'|'ease'}>(keys:T[],time:number):{a:T;b:T;amount:number}|null{if(!keys.length)return null;if(time<=keys[0].time)return {a:keys[0],b:keys[0],amount:0};for(let i=1;i<keys.length;i++){if(time<=keys[i].time){const a=keys[i-1],b=keys[i];let t=Math.min(1,Math.max(0,(time-a.time)/Math.max(.00001,b.time-a.time)));if(b.easing!=='linear')t=t*t*(3-2*t);return {a,b,amount:t}}}return {a:keys.at(-1)!,b:keys.at(-1)!,amount:0}}
export function sampleTransform(instance:ThreeInstance,time:number){const result={position:[...instance.position] as Vec3,rotation:[...instance.rotation] as Vec3,scale:[...instance.scale] as Vec3};for(const key of ['position','rotation','scale'] as const){const samples=instance.keyframes?.filter(k=>k[key]);if(samples?.length){const s=sampleKeys(samples,time)!;result[key]=interpolateVec(s.a[key]!,s.b[key]!,s.amount)}}return result}

export function sampleCamera(document:ThreeDocument,time:number):EditorCamera{const c=document.camera;let position=[...c.position] as Vec3,target=[...c.target] as Vec3,fov=c.fov;const sample=sampleKeys(c.keyframes||[],time);if(sample){position=interpolateVec(sample.a.position,sample.b.position,sample.amount);target=interpolateVec(sample.a.target,sample.b.target,sample.amount);fov=(sample.a.fov??c.fov)+((sample.b.fov??c.fov)-(sample.a.fov??c.fov))*sample.amount}else if(c.motion==='orbit'){const dx=position[0]-target[0],dz=position[2]-target[2],angle=Math.sin(time*.15)*c.amplitude;position[0]=target[0]+dx*Math.cos(angle)-dz*Math.sin(angle);position[2]=target[2]+dx*Math.sin(angle)+dz*Math.cos(angle)}else if(c.motion==='dolly'){const factor=1-Math.sin(time*.18)*c.amplitude*.3;position=interpolateVec(target,position,factor)}return {position,target,fov}}
