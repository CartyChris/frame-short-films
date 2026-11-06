import {expect,it} from 'vitest';
import {newProject} from '../src/lib/defaults';
import {splitScene} from '../src/lib/editing';
import {makeMessages} from '../src/lib/generation';
import {threeForAgent,threeRevisionPatch,threeRevisionTiming} from '../src/lib/three-revision';
import {builtInModels,createThreeDocument,sampleTransform} from '../src/lib/three/document';
import {defaultPhysicsBody,defaultPhysicsDocument,physicsBakeStatus,physicsFingerprint,physicsTrackFingerprint} from '../src/lib/three/physics-types';
import {createQuarksEmitter} from '../src/lib/three/quarks';
import type {Scene} from '../src/lib/types';

function source():Scene{
 const scene={...newProject().scenes[0],duration:8,sourceOffset:0,code:'',template:undefined,three:createThreeDocument('studio',8)};
 scene.three.instances=scene.three.instances.slice(0,1);const i=scene.three.instances[0];i.animation={preset:'none',speed:1,phase:0};i.position=[0,5,0];i.keyframes=[{time:0,position:[0,5,0],easing:'linear'},{time:8,position:[8,5,0],easing:'linear'}];
 scene.three.quarks={version:1,enabled:true,emitters:[{...createQuarksEmitter('sparks'),start:4,duration:2,seed:1234}]};
 return scene;
}

it('keeps the exact source pose, camera and particle clock after a title-only split-shot revision',()=>{
 const original=source(),[,clip]=splitScene(original,4),draft=structuredClone(clip.three!);draft.title='A new title';
 const patch=threeRevisionPatch(clip,draft,builtInModels),result={...clip,...patch};
 expect(result.sourceOffset).toBe(4);expect(result.duration).toBe(4);expect(result.three!.duration).toBe(8);
 expect(sampleTransform(result.three!.instances[0],result.sourceOffset!)).toEqual(sampleTransform(original.three!.instances[0],4));
 expect(result.three!.camera.position).toEqual(draft.camera.position);expect(result.three!.camera.motion).toBe(draft.camera.motion);expect(result.three!.quarks).toEqual(draft.quarks);
 expect(result.three!.quarks!.emitters[0].start-result.sourceOffset!).toBe(0);
});

it('rejects accidental clip-sized or malformed source durations before normalization can clamp them',()=>{
 const [,clip]=splitScene(source(),4);
 for(const duration of [4,0,-1,NaN,Infinity,'8',undefined])expect(()=>threeRevisionPatch(clip,{...clip.three,duration},builtInModels)).toThrow('3D source duration must be 8');
 expect(()=>threeRevisionPatch(clip,{...clip.three,duration:9},builtInModels)).toThrow('3D source duration must be 8');
});

it('keeps bounded source offsets and allows a previously extended clip to retain its held-pose range',()=>{
 const [,clip]=splitScene(source(),4);expect(threeRevisionTiming({...clip,duration:6})).toEqual({offset:4,duration:10});
 for(const sourceOffset of [-1,NaN,Infinity])expect(()=>threeRevisionTiming({...clip,sourceOffset})).toThrow('source offset');
 expect(()=>threeRevisionTiming({...clip,sourceOffset:86400})).toThrow('source range');
 const plain={...newProject().scenes[0],duration:3,sourceOffset:20};const patch=threeRevisionPatch(plain,createThreeDocument('studio',3),builtInModels);expect(patch.sourceOffset).toBe(0);
});

it('preserves a valid physics bake on an unchanged full-source revision and restores only its editable AI context',()=>{
 const original=source(),doc=original.three!,instance=doc.instances[0];
 doc.physics={...defaultPhysicsDocument(8),bodies:[defaultPhysicsBody(instance.id)]};
 const fingerprint=physicsFingerprint(doc),animation=structuredClone(instance.animation),keyframes=structuredClone(instance.keyframes!);
 instance.keyframes=[{time:0,position:[0,5,0],easing:'linear'},{time:8,position:[0,.5,0],easing:'linear'}];
 doc.physics.bake={engine:'jolt-physics@1.1.1',step:60,duration:8,fingerprint,originals:[{instanceId:instance.id,animation,keyframes,generatedFingerprint:physicsTrackFingerprint(instance)}]};
 expect(physicsBakeStatus(doc)).toBe('ready');const [,clip]=splitScene(original,4);
 const patch=threeRevisionPatch(clip,doc,builtInModels);expect(physicsBakeStatus(patch.three!)).toBe('ready');expect(patch.sourceOffset).toBe(4);
 const context=threeForAgent(clip)!;expect(context.physics!.bake).toBeUndefined();expect(context.instances[0].keyframes).toEqual(keyframes);expect(context.quarks).toEqual(doc.quarks);expect(doc.physics.bake).toBeDefined();
});

it('asks the agent to preserve the full source duration and visible range for a split 3D shot',()=>{
 const project=newProject(),[,clip]=splitScene(source(),4);project.models=builtInModels;
 const messages=makeMessages(project,clip,'Change only the title','','three-scene');
 expect(messages[0].content).toContain('Preserve source duration 8');expect(messages[0].content).toContain('source interval 4 to 8');
 expect(messages[1].content).toContain('"start":4');
});
