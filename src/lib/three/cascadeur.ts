import type {Project} from '../types';
import type {ModelAsset} from './types';
import {builtInModels} from './defaults';

/** Preserve the original model; replace only the object the user selected before import. */
export function applyCascadeurReturn(project:Project, asset:ModelAsset, target?:{sceneId:string;objectId:string;assetId:string}):Project {
 const models=[...(project.models||builtInModels),asset];
 if(!target)return {...project,models};
 return {...project,models,scenes:project.scenes.map(scene=>scene.id!==target.sceneId||!scene.three?scene:{...scene,three:{...scene.three,instances:scene.three.instances.map(object=>object.id!==target.objectId||object.assetId!==target.assetId?object:{...object,assetId:asset.id,animation:{...object.animation,preset:'none',clip:asset.clips?.[0]||undefined}})}})};
}
