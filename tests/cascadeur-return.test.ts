import {describe,it,expect} from 'vitest';
import {applyCascadeurReturn} from '../src/lib/three/cascadeur';
import {createThreeDocument} from '../src/lib/three/document';
import type {Project} from '../src/lib/types';
import type {ModelAsset} from '../src/lib/three/types';

const asset:ModelAsset={id:'returned',name:'Animated return',data:'data:model/gltf-binary;base64,AA==',clips:['Walk']};
function project():Project {
 const three=createThreeDocument('meadow',5);
 three.instances=[{id:'one',assetId:'original',name:'Actor',position:[1,2,3],rotation:[0,0,0],scale:[1,1,1],visible:true,animation:{preset:'idle',speed:1,phase:0}}];
 return {id:'film',name:'Film',createdAt:0,updatedAt:0,brief:'',models:[{id:'original',name:'Original'}],settings:{width:320,height:180,fps:24,background:'#000',volume:1},audio:[],scenes:[{id:'shot',title:'Shot',duration:5,code:'',notes:'',color:'#000',transition:'cut',layers:[],three}]};
}
describe('Cascadeur return',()=>{
 it('retains the original asset and replaces only the selected object, with the returned clip',()=>{
  const initial=project(),result=applyCascadeurReturn(initial,asset,{sceneId:'shot',objectId:'one',assetId:'original'});
  expect(result.models?.map(m=>m.id)).toEqual(['original','returned']);
  expect(result.scenes[0].three?.instances[0]).toMatchObject({assetId:'returned',position:[1,2,3],animation:{preset:'none',clip:'Walk'}});
  expect(initial.scenes[0].three?.instances[0].assetId).toBe('original');
 });
 it('saves a return without overwriting an object changed during import',()=>{
  const initial=project();initial.scenes[0].three!.instances[0].assetId='different';
  const result=applyCascadeurReturn(initial,asset,{sceneId:'shot',objectId:'one',assetId:'original'});
  expect(result.scenes[0].three?.instances[0].assetId).toBe('different');
  expect(result.models?.some(m=>m.id==='returned')).toBe(true);
 });
});
