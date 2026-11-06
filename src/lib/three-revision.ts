import type {Scene} from './types';
import type {ModelAsset} from './three/types';
import {normalizeThreeDocument} from './three/document';
import {restorePhysicsAnimation} from './three/physics-types';

/** AI edits the full source while this timeline clip retains its visible range. */
export function threeRevisionTiming(scene:Scene):{duration:number;offset:number}{
 if(!Number.isFinite(scene.duration)||scene.duration<.1||scene.duration>86400)throw new Error('The 3D clip duration must be between .1 and 86400 seconds.');
 const offset=scene.three?(scene.sourceOffset??0):0;
 if(!Number.isFinite(offset)||offset<0)throw new Error('The 3D source offset must be a finite, nonnegative number.');
 const sourceDuration=scene.three?.duration??scene.duration;
 if(!Number.isFinite(sourceDuration)||sourceDuration<.1||sourceDuration>86400)throw new Error('The 3D source duration must be between .1 and 86400 seconds.');
 // Timeline extensions already hold the final source pose; give the model that
 // complete visible range, as Motion revisions do, without moving its clock.
 const duration=Math.max(sourceDuration,offset+scene.duration);
 if(duration>86400)throw new Error('The 3D source range exceeds 86400 seconds. Split this film into separate sources.');
 return {duration,offset};
}

/** Omit derived physics tracks, retaining their original editable motion. */
export function threeForAgent(scene:Scene){return scene.three?restorePhysicsAnimation(scene.three):null}

export function threeRevisionPatch(scene:Scene,value:unknown,models:ModelAsset[]):Partial<Scene>{
 const timing=threeRevisionTiming(scene),raw=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
 if(typeof raw?.duration!=='number'||!Number.isFinite(raw.duration)||Math.abs(raw.duration-timing.duration)>.000001)throw new Error(`3D source duration must be ${timing.duration} seconds. This clip shows ${timing.offset}–${timing.offset+scene.duration} seconds of that source.`);
 const three=normalizeThreeDocument(value,models);
 return {three,code:'',motion:undefined,cast:undefined,template:undefined,sourceOffset:timing.offset};
}
