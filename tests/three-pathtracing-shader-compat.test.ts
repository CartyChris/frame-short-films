import {describe,it,expect} from 'vitest';
import {PhysicalPathTracingMaterial} from 'three-gpu-pathtracer';
import {compatiblePathTracingShader} from '../src/lib/three/pathtracing-shader-compat';
describe('pinned native Metal shader compatibility',()=>{
 it('adapts the actual installed material and preserves the rest of its shader',()=>{
  const material=new PhysicalPathTracingMaterial();try{const original=material.fragmentShader,patched=compatiblePathTracingShader(original);
   expect(patched).not.toContain('clearcoatWeight, result.specularPdf, result.color )');
   expect(patched).not.toContain('ray.direction, surfaceHit.faceIndices, surfaceHit.faceNormal');
   expect(patched).toContain('result.specularPdf = frameSpecularPdf;');expect(patched).toContain('result.color = frameScatterColor;');
   expect(patched).toContain('surfaceHit.dist = frameDistance;');expect(patched).toContain('surfaceHit.side = frameSide;');
   expect(patched.slice(0,patched.indexOf('ScatterRecord result;'))).toContain('ScatterRecord bsdfSample');
   expect(patched.slice(patched.indexOf('result.direction = normalize( surf.normalBasis * wi );'))).toContain('void main()');
   expect(material.fragmentShader).toBe(original);
  }finally{material.dispose()}
 });
 it('rejects changed or partially patched library shaders rather than silently bypassing the workaround',()=>{
  const material=new PhysicalPathTracingMaterial();try{expect(()=>compatiblePathTracingShader(material.fragmentShader.replace('result.specularPdf, result.color','result.specularPdf,result.color'))).toThrow('shader changed');expect(()=>compatiblePathTracingShader(compatiblePathTracingShader(material.fragmentShader))).toThrow('shader changed')}finally{material.dispose()}
 });
 it('rejects ambiguous duplicated anchors',()=>{const material=new PhysicalPathTracingMaterial();try{expect(()=>compatiblePathTracingShader(material.fragmentShader+material.fragmentShader)).toThrow('shader changed')}finally{material.dispose()}});
});
