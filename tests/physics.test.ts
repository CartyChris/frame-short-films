import {describe,it,expect} from 'vitest';
import {bakePhysics} from '../src/lib/three/physics';
import {applyPhysicsBake,defaultPhysicsBody,defaultPhysicsDocument,normalizePhysicsDocument,physicsBakeStatus,physicsFingerprint,removePhysicsBody,restorePhysicsAnimation} from '../src/lib/three/physics-types';
import {createThreeDocument,normalizeThreeDocument,sampleTransform} from '../src/lib/three/document';
import type {ModelAsset,ThreeDocument} from '../src/lib/three/types';

const models:ModelAsset[]=[{id:'ball',name:'Test body',builtin:'rock'}];
function scene(duration=2):ThreeDocument{
 const d=createThreeDocument('studio',duration);
 d.instances=[{id:'body',assetId:'ball',name:'Body',position:[0,5,0],rotation:[0,0,0],scale:[1,1,1],visible:true,animation:{preset:'none',speed:1,phase:0}}];
 d.physics={...defaultPhysicsDocument(duration),ground:{enabled:false,height:0,friction:.5,restitution:0},bodies:[{...defaultPhysicsBody('body'),collider:{shape:'sphere',size:[1,1,1],offset:[0,0,0]},linearDamping:0,angularDamping:0,restitution:0}]};
 return d;
}

describe('bounded editable physics schema',()=>{
 it('rejects missing, duplicate, excessive and invalid bodies instead of truncating them',()=>{
  const d=scene(),p=d.physics!;
  expect(()=>normalizePhysicsDocument({...p,bodies:[{...p.bodies[0],instanceId:'missing'}]},d.instances,d.duration)).toThrow(/missing/);
  expect(()=>normalizePhysicsDocument({...p,bodies:[p.bodies[0],p.bodies[0]]},d.instances,d.duration)).toThrow(/Duplicate/);
  expect(()=>normalizePhysicsDocument({...p,bodies:Array(33).fill(p.bodies[0])},d.instances,d.duration)).toThrow(/32/);
  expect(()=>normalizePhysicsDocument({...p,duration:31},d.instances,60)).toThrow(/30/);
  expect(()=>normalizePhysicsDocument({...p,gravity:[0,NaN,0]},d.instances,d.duration)).toThrow(/Gravity/);
  expect(()=>normalizePhysicsDocument({...p,bodies:[{...p.bodies[0],mass:0}]},d.instances,d.duration)).toThrow(/Mass/);
 });
 it('reports unbaked status and changing a physical input changes its revision',()=>{
  const d=scene();expect(physicsBakeStatus(d)).toBe('unbaked');const hash=physicsFingerprint(d);
  d.physics!.gravity[1]=-1;expect(physicsFingerprint(d)).not.toBe(hash);
 });
});

describe('actual Jolt WASM bake',()=>{
 it('matches gravity numerically and creates exact-seek ordinary keyframes',async()=>{
  const d=scene(1),before=structuredClone(d),b=await bakePhysics(d,models);
  expect(d).toEqual(before);expect(physicsBakeStatus(b)).toBe('ready');
  expect(b.instances[0].keyframes).toHaveLength(61);
  // Jolt uses fixed-step integration: y = 5 - 9.81*dt²*n(n+1)/2.
  expect(sampleTransform(b.instances[0],1).position[1]).toBeCloseTo(5-9.81/3600*60*61/2,3);
  const first=sampleTransform(b.instances[0],.5);sampleTransform(b.instances[0],1);
  expect(sampleTransform(b.instances[0],.5)).toEqual(first);
  expect(b.instances[0].animation).toEqual({preset:'none',speed:1,phase:0});
 });
 it('actually collides with the floor and repeats the same fixed-step trajectory',async()=>{
  const d=scene(2);d.physics!.ground.enabled=true;
  const a=await bakePhysics(d,models),b=await bakePhysics(d,models);
  expect(a.instances[0].keyframes).toEqual(b.instances[0].keyframes);
  const final=sampleTransform(a.instances[0],2).position;
  expect(final[1]).toBeGreaterThan(.47);expect(final[1]).toBeLessThan(.53);
 });
 it('collides against an explicit static obstacle without ground',async()=>{
  const d=scene(2),floor={...structuredClone(d.instances[0]),id:'floor',position:[0,0,0] as [number,number,number]};d.instances.push(floor);
  d.physics!.bodies.push({...defaultPhysicsBody('floor'),motion:'static',collider:{shape:'box',size:[10,1,10],offset:[0,-.5,0]}});
  const result=await bakePhysics(d,models);expect(sampleTransform(result.instances[0],2).position[1]).toBeCloseTo(.5,1);
  expect(result.instances[1].keyframes).toHaveLength(1);
 });
 it('uses scaled local collider centers and keeps the visible model origin aligned',async()=>{
  const d=scene(2);d.physics!.ground.enabled=true;d.instances[0].scale=[2,2,2];
  d.physics!.bodies[0].collider={shape:'box',size:[1,1,1],offset:[0,.5,0]};
  const b=await bakePhysics(d,models);expect(sampleTransform(b.instances[0],2).position[1]).toBeCloseTo(0,1);
  expect(sampleTransform(b.instances[0],2).scale).toEqual([2,2,2]);
 });
 it('preserves original paths/keys and supports guarded atomic apply and restore',async()=>{
  const d=scene(1);d.instances[0].animation={preset:'walk',speed:1.3,phase:.2,path:[[0,0,0],[1,0,0]]};d.instances[0].keyframes=[{time:0,position:[0,5,0],easing:'ease'},{time:1,position:[2,5,0],easing:'linear'}];
  const candidate=await bakePhysics(d,models),current=structuredClone(d);current.camera.fov=65;
  const applied=applyPhysicsBake(current,candidate);expect(applied.camera.fov).toBe(65);expect(physicsBakeStatus(applied)).toBe('ready');
  const restored=restorePhysicsAnimation(applied);expect(restored.instances[0].animation).toEqual(d.instances[0].animation);expect(restored.instances[0].keyframes).toEqual(d.instances[0].keyframes);expect(physicsBakeStatus(restored)).toBe('unbaked');
  current.instances[0].position[0]=2;expect(()=>applyPhysicsBake(current,candidate)).toThrow(/changed/);
 });
 it('never restores over a manually edited baked track; rebake preserves that new source',async()=>{
  const b=await bakePhysics(scene(1),models);b.instances[0].keyframes![1].position![0]=8;
  expect(physicsBakeStatus(b)).toBe('stale');const manuallyEdited=structuredClone(b.instances[0].keyframes);
  expect(restorePhysicsAnimation(b).instances[0].keyframes).toEqual(manuallyEdited);
  const next=await bakePhysics(b,models);expect(restorePhysicsAnimation(next).instances[0].keyframes).toEqual(manuallyEdited);
 });
 it('survives document normalization and JSON backup with a valid fingerprint',async()=>{
  const baked=await bakePhysics(scene(1),models),restored=normalizeThreeDocument(JSON.parse(JSON.stringify(baked)),models);
  expect(physicsBakeStatus(restored)).toBe('ready');expect(restored.physics?.bake?.originals).toHaveLength(1);
  expect(restored.instances[0].keyframes).toHaveLength(61);
 });
 it('cancels an in-progress bake without changing the source or leaking a stuck queue',async()=>{
  const d=scene(3),before=structuredClone(d),abort=new AbortController();
  await expect(bakePhysics(d,models,{signal:abort.signal,onProgress:n=>{if(n>0)abort.abort()}})).rejects.toMatchObject({name:'AbortError'});
  expect(d).toEqual(before);expect(physicsBakeStatus(await bakePhysics(scene(.1),models))).toBe('ready');
 });
 it('handles fractional duration with a terminal key and safely removes an old body',async()=>{
  const d=scene(.125),b=await bakePhysics(d,models);expect(b.instances[0].keyframes!.at(-1)!.time).toBe(.125);
  const removed=removePhysicsBody(b,'body');expect(removed.physics?.bodies).toEqual([]);expect(removed.physics?.bake).toBeUndefined();expect(physicsBakeStatus(removed)).toBe('none');
  expect(removed.instances[0].keyframes||[]).toEqual([]);
 });
 it('accepts and restores an empty optional clip name allowed by the scene schema',async()=>{
  const d=scene(.1);d.instances[0].animation.clip='';
  const normalized=normalizeThreeDocument(d,models);const result=await bakePhysics(normalized,models);
  expect(restorePhysicsAnimation(result).instances[0].animation.clip).toBe('');
 });
 it('keeps spinning rotations continuous through the Euler wrap boundary',async()=>{
  const d=scene(1);d.physics!.gravity=[0,0,0];d.physics!.bodies[0].angularVelocity=[0,0,8];
  const b=await bakePhysics(d,models),keys=b.instances[0].keyframes!;
  for(let i=1;i<keys.length;i++)expect(Math.abs(keys[i].rotation![2]-keys[i-1].rotation![2])).toBeLessThan(.3);
  expect(keys.at(-1)!.rotation![2]).toBeGreaterThan(7.8);
 });
});
