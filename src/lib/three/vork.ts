import {strToU8,zipSync} from 'fflate';

/** Vork accepts triangle meshes; Frame may also export decorative points or lines. */
export function prepareVorkGlb(glb:Uint8Array):Uint8Array{
 if(glb.byteLength<20)throw new Error('The 3D scene is not a valid GLB.');
 const view=new DataView(glb.buffer,glb.byteOffset,glb.byteLength),length=view.getUint32(12,true);if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==glb.byteLength||view.getUint32(16,true)!==0x4e4f534a||length>glb.byteLength-20)throw new Error('The GLB scene metadata is incomplete.');
 const data=JSON.parse(new TextDecoder().decode(glb.subarray(20,20+length)).replace(/\0+$/,''));const meshes=Array.isArray(data.meshes)?data.meshes:[];let removed=false;
 for(const mesh of meshes){const old=mesh.primitives||[];mesh.primitives=old.filter((p:{mode?:number})=>p.mode===undefined||p.mode===4);if(mesh.primitives.length!==old.length)removed=true}
 if(!removed)return glb;
 // Keep node indices and animation targets stable while dropping empty point/line meshes.
 const remap=new Map<number,number>();data.meshes=meshes.filter((mesh:{primitives:unknown[]},i:number)=>{if(!mesh.primitives.length)return false;remap.set(i,remap.size);return true});
 for(const node of data.nodes||[]){if(typeof node.mesh==='number'){const mapped=remap.get(node.mesh);if(mapped===undefined)delete node.mesh;else node.mesh=mapped}}
 const raw=new TextEncoder().encode(JSON.stringify(data)),size=Math.ceil(raw.length/4)*4,tail=glb.subarray(20+length),result=new Uint8Array(20+size+tail.length),out=new DataView(result.buffer);out.setUint32(0,0x46546c67,true);out.setUint32(4,2,true);out.setUint32(8,result.length,true);out.setUint32(12,size,true);out.setUint32(16,0x4e4f534a,true);result.fill(32,20,20+size);result.set(raw,20);result.set(tail,20+size);return result;
}

/** Export the actual GLB animation and a portable Vork scene. Vork is separate software. */
export function vorkScene(glb:Uint8Array,width:number,height:number,fps:number){
 if(glb.byteLength<20||new DataView(glb.buffer,glb.byteOffset,glb.byteLength).getUint32(0,true)!==0x46546c67)throw new Error('The 3D scene is not a valid GLB.');
 const view=new DataView(glb.buffer,glb.byteOffset,glb.byteLength),length=view.getUint32(12,true);if(view.getUint32(16,true)!==0x4e4f534a||length>glb.byteLength-20)throw new Error('The GLB scene metadata is incomplete.');
 const manifest=JSON.parse(new TextDecoder().decode(glb.subarray(20,20+length)).replace(/\0+$/,''));const hasAnimation=Array.isArray(manifest.animations)&&manifest.animations.length>0;
 const size=[Math.max(16,Math.min(8192,Math.round(width))),Math.max(16,Math.min(8192,Math.round(height)))];const rate=Math.max(1,Math.min(120,Math.round(fps)));
 return {version:2,nodes:[{name:'frame',type:'asset',file:'scene.glb'},{name:'frame-fill',type:'light',shape:'rectangle',translation:[-3,5,4],target:[0,0,0],energy:700,size:4}],...(hasAnimation?{animation:[{clip:{target:'frame',index:0}}]}:{}),render:{camera:'frame/Film camera',resolution:size,fps:rate}};
}
export async function makeVorkPackage(glb:Blob,settings:{width:number;height:number;fps:number;duration:number}):Promise<Blob>{
 if(glb.size>250*1024*1024)throw new Error('This scene exceeds the 250 MiB interchange limit. Export a shorter or simpler shot.');
 const bytes=prepareVorkGlb(new Uint8Array(await glb.arrayBuffer())),scene=vorkScene(bytes,settings.width,settings.height,settings.fps),end=Math.max(0,Math.ceil(settings.duration*scene.render.fps)-1);
 const guide=`# Frame to Vork\n\nThis package contains Frame's exported animated GLB and a Vork v2 scene. Install Vork separately from https://github.com/voyager-so/vork and review its license and hardware requirements. In this folder run:\n\n    vork render scene.json --profile std/previs --out preview.png\n    vork render scene.json --profile std/final --frame-start 0 --frame-end ${end} --out shot.mp4\n\nFrame's film camera and any baked GLB animation are referenced by the Vork scene. Review the result: renderers interpret materials, lights and cameras differently. HTML layers, audio, particle effects, postprocessing and changing camera field of view are not carried in this GLB; add the rendered shot back in Frame and retain your original project for editing.\n`;
 return new Blob([zipSync({'scene.glb':bytes,'scene.json':strToU8(JSON.stringify(scene,null,2)),'README.md':strToU8(guide)},{level:6}) as Uint8Array<ArrayBuffer>],{type:'application/zip'});
}
