import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {makeBuiltin} from './builtins';
import {makeProceduralModel} from './procedural';
import {builtInModels} from './document';
import type {ModelAsset} from './types';
export interface LoadedModel {object:T.Object3D;clips:T.AnimationClip[]}
export function dataBytes(data:string){const match=/^data:[^,]*;base64,(.+)$/s.exec(data);if(!match)throw new Error('Model must be an embedded GLB data URL.');const raw=atob(match[1]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes.buffer}
export async function loadModel(model:ModelAsset):Promise<LoadedModel>{if(model.procedural)return {object:makeProceduralModel(model),clips:[]};if(model.builtin){if(!builtInModels.some(m=>m.builtin===model.builtin))throw new Error(`Unknown built-in model: ${model.builtin}`);return {object:makeBuiltin(model),clips:[]}};if(!model.data)throw new Error(`Model has no embedded geometry: ${model.name}`);const manager=new T.LoadingManager();manager.setURLModifier(url=>{if(!/^(data:|blob:)/.test(url))throw new Error(`External model dependency is unavailable offline: ${url}`);return url});const gltf=await new GLTFLoader(manager).parseAsync(dataBytes(model.data),'');gltf.scene.name=model.name;gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true}});return {object:gltf.scene,clips:gltf.animations}}
export function cloneModel(model:LoadedModel):LoadedModel{return {object:clone(model.object),clips:model.clips}}
export function disposeObject(root:T.Object3D){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points||o instanceof T.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v)}}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose())}
