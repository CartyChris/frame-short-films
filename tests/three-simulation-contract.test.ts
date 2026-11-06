import {describe,it,expect} from 'vitest';
import {createThreeDocument,normalizeThreeDocument,builtInModels} from '../src/lib/three/document';
import {defaultPhysicsDocument,defaultPhysicsBody,physicsBakeStatus} from '../src/lib/three/physics-types';
import {defaultQuarksDocument} from '../src/lib/three/quarks';
import {normalizePathTracing} from '../src/lib/three/pathtracing-types';
import {validateFilmForExport} from '../src/lib/film';
import type {Project} from '../src/lib/types';
function film(three:any):Project{return {id:'test',name:'Simulation',createdAt:0,updatedAt:0,brief:'',settings:{width:640,height:360,fps:24,background:'#000',volume:1},audio:[],models:builtInModels,scenes:[{id:'s',title:'Falling light',duration:12,code:'',notes:'',color:'#000',transition:'cut',layers:[],three}]};}
describe('saved simulation contracts',()=>{
 it('retains editable engine settings through the main scene normalizer and JSON interchange',()=>{const source=createThreeDocument();source.physics={...defaultPhysicsDocument(6),bodies:[defaultPhysicsBody(source.instances[0].id)]};source.quarks=defaultQuarksDocument();source.pathTracing=normalizePathTracing({enabled:true,samples:8});const restored=normalizeThreeDocument(JSON.parse(JSON.stringify(source)),builtInModels);expect(restored.physics?.bodies[0].instanceId).toBe(source.instances[0].id);expect(restored.quarks).toEqual(source.quarks);expect(restored.pathTracing?.samples).toBe(8);expect(physicsBakeStatus(restored)).toBe('unbaked');});
 it('refuses unfinished physical motion at film export while allowing an ordinary scene',()=>{const scene=createThreeDocument();expect(()=>validateFilmForExport(film(scene))).not.toThrow();scene.physics={...defaultPhysicsDocument(6),bodies:[defaultPhysicsBody(scene.instances[0].id)]};expect(()=>validateFilmForExport(film(scene))).toThrow(/baked again/);});
 it('rejects dangling physical object identities instead of silently changing the simulation',()=>{const scene=createThreeDocument();scene.physics={...defaultPhysicsDocument(6),bodies:[defaultPhysicsBody('missing')]};expect(()=>normalizeThreeDocument(scene,builtInModels)).toThrow();});
});
