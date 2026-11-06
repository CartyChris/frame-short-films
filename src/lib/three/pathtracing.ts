import * as T from 'three';
import {GradientEquirectTexture,WebGLPathTracer} from 'three-gpu-pathtracer';
import type {PathTracingSettings,PathTracingStatus} from './pathtracing-types';
import {compatiblePathTracingShader} from './pathtracing-shader-compat';

// This adapter deliberately pins the legacy WebGL backend. Keep its limited private
// accesses here: deterministic PCG selection and resources omitted by upstream dispose.
type LegacyTracer=WebGLPathTracer&{stableNoise:boolean;isCompiling:boolean;_pathTracer:any;_lowResPathTracer:any;_generator:any;_colorBackground?:T.Texture;_internalBackground?:T.Texture};
const errorText=(error:unknown)=>error instanceof Error?error.message||error.name:String(error)||'Unknown GPU error';
export class PathTracingPass {
 readonly presentation=new T.Scene();readonly camera=new T.OrthographicCamera(-1,1,1,-1,0,2);
 readonly status:PathTracingStatus={state:'preview',samples:0,targetSamples:0,warnings:[]};
 private tracer:LegacyTracer;private sky=new GradientEquirectTexture(32);private skyKey='';private quad:T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>;private key='';private disposed=false;private shaderError='';private oldShaderError:T.WebGLRenderer['debug']['onShaderError'];
 constructor(private renderer:T.WebGLRenderer){
  if(!renderer.capabilities.isWebGL2||!renderer.extensions.has('EXT_color_buffer_float'))throw new Error('Path tracing needs WebGL2 with floating-point render targets. Turn off path tracing or use a compatible desktop browser.');
  this.oldShaderError=renderer.debug.onShaderError;
  renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{this.shaderError='The GPU could not compile the path-tracing shader. '+(gl.getProgramInfoLog(program)||gl.getShaderInfoLog(fragment)||'Try the raster renderer on this device.').slice(0,700);this.oldShaderError?.(gl,program,vertex,fragment)};
  this.tracer=new WebGLPathTracer(renderer) as LegacyTracer;
  for(const pass of [this.tracer._pathTracer,this.tracer._lowResPathTracer]){pass.material.fragmentShader=compatiblePathTracingShader(pass.material.fragmentShader);pass.material.needsUpdate=true}
  this.tracer.stableNoise=true;this.tracer.tiles.set(1,1);this.tracer.renderDelay=0;this.tracer.minSamples=0;this.tracer.fadeDuration=0;this.tracer.dynamicLowRes=false;this.tracer.rasterizeScene=false;this.tracer.renderToCanvas=false;this.tracer.textureSize.set(512,512);this.tracer.filterGlossyFactor=.4;
  // PCG consumes the explicit reset seed, without the random blue-noise texture used
  // by the default stratified mode. Never replace ambient Math.random.
  this.tracer._pathTracer.material.setDefine('RANDOM_TYPE',0);
  this.camera.position.z=1;this.quad=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({depthTest:false,depthWrite:false,fog:false}));this.quad.frustumCulled=false;this.presentation.add(this.quad);
 }
 get samples(){return this.tracer.samples}
 get texture(){return this.tracer.target.texture}
 get isCompiling(){return this.tracer.isCompiling}
 invalidate(){this.key=''}
 begin(scene:T.Scene,camera:T.Camera,settings:PathTracingSettings,key:string,targetSamples:number){
  if(this.disposed)throw new Error('Path tracer was closed.');if(this.shaderError)throw new Error(this.shaderError);
  this.status.targetSamples=targetSamples;delete this.status.error;if(this.key===key){this.status.samples=this.samples;return}
  const excluded:T.Object3D[]=[];let meshes=0,triangles=0,points=false;
  scene.traverse(o=>{if(o.userData.frameQuarks&&o.visible&&!o.parent?.userData.frameQuarks){excluded.push(o);o.visible=false}if((o as T.Points).isPoints&&o.visible){points=true;excluded.push(o);o.visible=false}});
  try{scene.traverseVisible(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;meshes++;triangles+=(mesh.geometry.index?.count||mesh.geometry.getAttribute('position')?.count||0)/3;
   if((mesh as T.InstancedMesh).isInstancedMesh)throw new Error('Path tracing cannot flatten this instanced mesh. Convert it to ordinary meshes or turn off path tracing.');
   for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if((material as T.ShaderMaterial).isShaderMaterial)throw new Error('This model uses a custom shader unsupported by the mesh path tracer. Use standard materials or turn off path tracing.');
  });if(meshes>4096||triangles>500000)throw new Error('This shot exceeds the path-tracing limit (4,096 meshes / 500,000 triangles). Simplify it or use raster rendering.');
  this.status.warnings=[...(scene.fog?['Three fog is a raster effect and is not a traced volume.']:[]),...(points?['Point particles are composited as a depth-tested raster layer.']:[])];
  this.tracer.bounces=settings.bounces;this.tracer.transmissiveBounces=settings.bounces;this.tracer.renderScale=settings.renderScale;
  const hemisphere=scene.children.find(o=>(o as T.HemisphereLight).isHemisphereLight) as T.HemisphereLight|undefined;
  const top=scene.background instanceof T.Color?scene.background:new T.Color('#c1d6e5'),bottom=hemisphere?.groundColor||new T.Color('#727965'),skyKey=top.getHexString()+bottom.getHexString();if(skyKey!==this.skyKey){const old=this.sky;this.sky=new GradientEquirectTexture(32);this.sky.topColor.copy(top);this.sky.bottomColor.copy(bottom);this.sky.update();this.skyKey=skyKey;old.dispose()}
  const environment=scene.environment,intensity=scene.environmentIntensity;try{if(!environment){scene.environment=this.sky;scene.environmentIntensity=(hemisphere?.intensity||1)*.35}this.tracer.setScene(scene,camera)}finally{scene.environment=environment;scene.environmentIntensity=intensity}
  this.tracer.reset();this.key=key;this.status.samples=0;this.status.state=this.tracer.isCompiling?'compiling':'rendering';
  }finally{excluded.forEach(o=>{o.visible=true})}
 }
 step(){if(this.disposed)throw new Error('Path tracer was closed.');if(this.shaderError)throw new Error(this.shaderError);if(this.renderer.getContext().isContextLost())throw new Error('The GPU context was lost while tracing. Reopen the shot or use raster rendering.');
  this.tracer.renderSample();if(this.shaderError)throw new Error(this.shaderError);this.quad.material.map=this.texture;this.status.samples=this.samples;this.status.state=this.isCompiling?'compiling':this.samples>=this.status.targetSamples?'complete':'rendering';
 }
 async complete(check:()=>void){const started=performance.now();while(this.samples<this.status.targetSamples){check();this.step();if(performance.now()-started>60000)throw new Error('This path-traced frame exceeded 60 seconds. Lower sample count, resolution scale or scene complexity and retry.');if(this.samples<this.status.targetSamples)await new Promise<void>(resolve=>setTimeout(resolve,this.isCompiling?8:0))}check();this.status.state='complete';}
 fail(error:unknown){this.status.state='error';this.status.error=errorText(error)}
 dispose(){if(this.disposed)return;this.disposed=true;this.renderer.debug.onShaderError=this.oldShaderError;
  const p=this.tracer,seen=new Set<unknown>();const release=(value:any)=>{if(!value||seen.has(value))return;seen.add(value);if(value.isTexture&&value.renderTarget){release(value.renderTarget);return}if(typeof value.dispose==='function')value.dispose()};
  // These are adapter-owned copies/uniforms, never the original model materials.
  for(const renderer of [p._pathTracer,p._lowResPathTracer]){for(const uniform of Object.values(renderer.material.uniforms) as {value:unknown}[])release(uniform.value);release(renderer.material.lights?.tex);release(renderer.material);release(renderer._blendQuad?.material)}
  p._lowResPathTracer.dispose();p.dispose();release(p._colorBackground);release(p._internalBackground);release(p._generator.geometry);for(const geometry of p._generator.staticGeometryGenerator._intermediateGeometry.values())release(geometry);const dummy=p._generator.staticGeometryGenerator._dummyMesh;if(dummy){release(dummy.geometry);release(dummy.material)}this.sky.dispose();this.quad.geometry.dispose();this.quad.material.dispose();this.presentation.clear();
 }
}
