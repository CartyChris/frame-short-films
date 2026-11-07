import type {Project,Scene} from './types';
import type {ModelAsset} from './three/types';
import {builtInModels} from './three/defaults';
import {emptyStory} from './story';
import {uid} from './storage';
export function reuseModel(target:Project,model:ModelAsset):Project{const copy={...structuredClone(model),id:uid(),builtin:model.builtin};return {...target,models:[...(target.models||builtInModels),copy]}}
export function reuseCharacter(target:Project,source:Project,characterId:string):Project{
 const character=source.story?.characters.find(c=>c.id===characterId);if(!character)throw new Error('This character is no longer in its original film.');const id=uid(),sourceModels=source.models||builtInModels,models=structuredClone(target.models||builtInModels),map=new Map<string,string>();for(const old of character.referenceAssetIds){const model=sourceModels.find(m=>m.id===old);if(model){const next=uid();map.set(old,next);models.push({...structuredClone(model),id:next})}}const story=structuredClone(target.story||emptyStory());story.characters.push({...structuredClone(character),id,referenceAssetIds:character.referenceAssetIds.map(v=>map.get(v)||v)});const designs={...target.castDesigns};if(source.castDesigns?.[characterId])designs[id]=structuredClone(source.castDesigns[characterId]);return {...target,models,story,castDesigns:designs};
}
/** Copies scene and linked cast/models; original project and shared media stay intact. */
export function reuseScene(target:Project,source:Project,scene:Scene):Project{
 const copy=structuredClone(scene);copy.id=uid();copy.layers=copy.layers.map(l=>({...l,id:uid()}));const sourceModels=source.models||builtInModels,required=new Set(copy.three?.instances.map(i=>i.assetId)||[]);
 const chars=(source.story?.characters||[]).filter(c=>copy.cast?.characterIds.includes(c.id));for(const c of chars)for(const id of c.referenceAssetIds)if(sourceModels.some(m=>m.id===id))required.add(id);
 const models=structuredClone(target.models||builtInModels),map=new Map<string,string>();for(const id of required){const model=sourceModels.find(m=>m.id===id);if(!model)throw new Error('A model used by this scene is missing from its original film.');const next=uid();map.set(id,next);models.push({...structuredClone(model),id:next})}if(copy.three)for(const instance of copy.three.instances)instance.assetId=map.get(instance.assetId)||instance.assetId;
 const designs={...target.castDesigns},characterMap=new Map<string,string>(),story=structuredClone(target.story||emptyStory());for(const c of chars){const id=uid();characterMap.set(c.id,id);story.characters.push({...structuredClone(c),id,referenceAssetIds:c.referenceAssetIds.map(x=>map.get(x)||x)});if(source.castDesigns?.[c.id])designs[id]=structuredClone(source.castDesigns[c.id])}
 if(copy.cast)copy.cast.characterIds=copy.cast.characterIds.map(id=>characterMap.get(id)||id);if(copy.continuity){copy.continuity.characterIds=copy.continuity.characterIds.map(id=>characterMap.get(id)||id);copy.continuity.locationIds=[]}
 return {...target,models,story,castDesigns:designs,scenes:[...target.scenes,copy]};
}
