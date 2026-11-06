import {physicsBakeStatus} from './physics-types';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {PLYLoader} from 'three/addons/loaders/PLYLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import type {ModelAsset,ThreeDocument} from './types';
import {ThreeEngine} from './engine';
import {disposeObject} from './models';
const extension=(name:string)=>name.split('.').pop()?.toLowerCase()||'';
const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read model data.'));reader.readAsDataURL(blob)});
export async function importModel(files:File[]):Promise<ModelAsset>{
 const primary=files.find(f=>['glb','gltf','fbx','obj','stl','ply'].includes(extension(f.name)));if(!primary)throw new Error('Choose a GLB, glTF, FBX, OBJ, STL or PLY model, plus its texture/material files.');if(primary.size>150*1024*1024)throw new Error('This model exceeds 150 MB. Optimize it before importing into the browser.');
 const format=extension(primary.name),urls=new Map<string,string>();const lookup=new Map<string,File>();for(const file of files){lookup.set(file.name.toLowerCase(),file);if(file.webkitRelativePath)lookup.set(file.webkitRelativePath.toLowerCase(),file)}
 let dependencyFailure:Error|undefined;const manager=new T.LoadingManager();let pendingFiles=0;const start=manager.itemStart.bind(manager),end=manager.itemEnd.bind(manager);manager.itemStart=url=>{pendingFiles++;start(url)};manager.itemEnd=url=>{pendingFiles--;end(url)};manager.setURLModifier(url=>{if(/^(data:|blob:)/i.test(url))return url;let path:string;try{path=decodeURIComponent(url).replace(/\\/g,'/').replace(/^\.\//,'').toLowerCase()}catch{path=url.toLowerCase()}const file=lookup.get(path)||lookup.get(path.split('/').pop()!);if(!file){dependencyFailure=new Error(`Missing model companion file: ${url}. Select the model and all its texture/buffer files together.`);throw dependencyFailure}if(!urls.has(file.name))urls.set(file.name,URL.createObjectURL(file));return urls.get(file.name)!});manager.onError=url=>{dependencyFailure=new Error(`Could not decode model companion file: ${url}`)};
 let root:T.Object3D|undefined,clips:T.AnimationClip[]=[];
 try{const bytes=await primary.arrayBuffer();if(format==='glb'||format==='gltf'){if(format==='gltf'){const doc=JSON.parse(new TextDecoder().decode(bytes));if(doc.extensionsRequired?.some((e:string)=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(e)))throw new Error('Compressed models need external decoder files. Export an uncompressed GLB from Blender before importing.')}const gltf=await new GLTFLoader(manager).parseAsync(format==='gltf'?new TextDecoder().decode(bytes):bytes,'');root=gltf.scene;clips=gltf.animations}
  else if(format==='fbx'){root=new FBXLoader(manager).parse(bytes,'');clips=root.animations||[]}
  else if(format==='obj'){const loader=new OBJLoader(manager),mtl=files.find(f=>extension(f.name)==='mtl');if(mtl){const material=new MTLLoader(manager).parse(await mtl.text(),'');material.preload();loader.setMaterials(material)}root=loader.parse(new TextDecoder().decode(bytes))}
  else{const geometry=format==='stl'?new STLLoader(manager).parse(bytes):new PLYLoader(manager).parse(bytes);if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();const material=new T.MeshStandardMaterial({color:geometry.hasAttribute('color')?'#ffffff':'#c2b6a1',vertexColors:geometry.hasAttribute('color'),roughness:.8});root=new T.Mesh(geometry,material)}
  // Synchronous OBJ/FBX parsers can return before texture loading has finished.
  const started=performance.now();while(pendingFiles>0){if(dependencyFailure)throw dependencyFailure;if(performance.now()-started>20000)throw new Error('Model textures did not finish loading.');await new Promise(resolve=>setTimeout(resolve,20))}
  // Wait for decoding before normalizing textures into the GLB.
  const textures=new Set<T.Texture>();root.traverse(o=>{if(o instanceof T.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(material))if(value instanceof T.Texture)textures.add(value)});await Promise.all([...textures].map(async texture=>{const image=texture.image;if(image instanceof HTMLImageElement&&image.decode)await image.decode()}));if(dependencyFailure)throw dependencyFailure;
  const group=new T.Group();group.name=primary.name.replace(/\.[^.]+$/,'');group.add(root);group.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3());if(bounds.isEmpty()||!Number.isFinite(size.length()))throw new Error('This file contains no visible geometry.');
  // Preserve original units and animation. Placement/scale remain editable in the studio.
  const binary=await new GLTFExporter().parseAsync(group,{binary:true,animations:clips,onlyVisible:false});if(!(binary instanceof ArrayBuffer))throw new Error('Model conversion did not produce a GLB.');return {id:crypto.randomUUID(),name:group.name,data:await dataUrl(new Blob([binary],{type:'model/gltf-binary'})),clips:clips.map((clip,i)=>clip.name||`Animation ${i+1}`),sourceFormat:format};
 }catch(error){throw new Error(`Could not import ${primary.name}: ${error instanceof Error?error.message:String(error)}`)}finally{urls.forEach(url=>URL.revokeObjectURL(url));if(root)disposeObject(root)}
}
/** Bake actual rigs, imported clips, instance paths and camera motion into portable glTF animation. */
export async function exportSceneGlb(document:ThreeDocument,models:ModelAsset[],options:{start?:number;duration?:number}={}):Promise<Blob>{
 if(['unbaked','stale'].includes(physicsBakeStatus(document)))throw new Error('Bake the Jolt motion before exporting animated geometry.');
 const start=Number.isFinite(options.start)?Math.max(0,options.start!):0,duration=Number.isFinite(options.duration)?Math.max(.1,options.duration!):document.duration;
 const canvas=window.document.createElement('canvas'),engine=new ThreeEngine(canvas,{...document,pathTracing:undefined,quarks:undefined},models);try{await engine.ready;engine.resize(1280,720);engine.evaluate(start);const nodes:T.Object3D[]=[];engine.objects.forEach(p=>{nodes.push(p.root);p.content.traverse(o=>{if(o instanceof T.Bone||o.name.startsWith('rig_')||o.userData.proceduralPart||p.clips.length)nodes.push(o)})});nodes.push(engine.camera);engine.scene.add(engine.camera);engine.camera.name='Film camera';
 const count=Math.max(2,Math.min(Math.ceil(duration*24)+1,7201,Math.floor(2_000_000/Math.max(1,nodes.length)))),times=new Float32Array(count);const records=nodes.map(node=>({node,position:new Float32Array(count*3),quaternion:new Float32Array(count*4),scale:new Float32Array(count*3)}));
 for(let frame=0;frame<count;frame++){const time=duration*frame/(count-1);times[frame]=time;engine.evaluate(start+time);for(const r of records){r.node.position.toArray(r.position,frame*3);r.node.quaternion.toArray(r.quaternion,frame*4);r.node.scale.toArray(r.scale,frame*3)}if(frame%120===0)await new Promise(resolve=>setTimeout(resolve,0))}
 const tracks:T.KeyframeTrack[]=[];for(const r of records)for(const prop of ['position','quaternion','scale'] as const){const size=prop==='quaternion'?4:3,values=r[prop];let changed=false;for(let i=size;i<values.length;i++)if(Math.abs(values[i]-values[i%size])>1e-5){changed=true;break}if(changed)tracks.push(prop==='quaternion'?new T.QuaternionKeyframeTrack(`${r.node.uuid}.${prop}`,times,values):new T.VectorKeyframeTrack(`${r.node.uuid}.${prop}`,times,values))}engine.evaluate(start);engine.scene.traverse(o=>{o.userData={}});const animation=new T.AnimationClip(document.title||'Film animation',duration,tracks);const binary=await new GLTFExporter().parseAsync(engine.scene,{binary:true,animations:tracks.length?[animation]:[],onlyVisible:true});if(!(binary instanceof ArrayBuffer))throw new Error('Scene export did not produce a GLB.');return new Blob([binary],{type:'model/gltf-binary'});
 }finally{engine.dispose()}
}
