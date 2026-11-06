/**
 * macOS 27 beta's ANGLE Metal translator cannot bind some struct-member out/inout
 * arguments to thread references (WebKit 319298). Plain locals avoid that compiler
 * defect without changing the scattering or BVH math. Keep this pinned to the two
 * upstream 0.0.28 call sites and fail visibly if a dependency update changes them.
 * https://github.com/sparkjsdev/spark/issues/399
 */
export function compatiblePathTracingShader(shader:string):string {
 const replacements:[string,string][]=[
  [
   'result.pdf = bsdfEval( wo, clearcoatWo, wi, clearcoatWi, surf, diffuseWeight, specularWeight, transmissionWeight, clearcoatWeight, result.specularPdf, result.color );',
   `float frameSpecularPdf = 0.0;
  vec3 frameScatterColor = vec3( 0.0 );
  result.pdf = bsdfEval( wo, clearcoatWo, wi, clearcoatWi, surf, diffuseWeight, specularWeight, transmissionWeight, clearcoatWeight, frameSpecularPdf, frameScatterColor );
  result.specularPdf = frameSpecularPdf;
  result.color = frameScatterColor;`
  ],
  [
   'bool hit = bvhIntersectFirstHit( bvh, ray.origin, ray.direction, surfaceHit.faceIndices, surfaceHit.faceNormal, surfaceHit.barycoord, surfaceHit.side, surfaceHit.dist );',
   `uvec4 frameFaceIndices = surfaceHit.faceIndices;
  vec3 frameFaceNormal = surfaceHit.faceNormal;
  vec3 frameBarycoord = surfaceHit.barycoord;
  float frameSide = surfaceHit.side;
  float frameDistance = surfaceHit.dist;
  bool hit = bvhIntersectFirstHit( bvh, ray.origin, ray.direction, frameFaceIndices, frameFaceNormal, frameBarycoord, frameSide, frameDistance );
  surfaceHit.faceIndices = frameFaceIndices;
  surfaceHit.faceNormal = frameFaceNormal;
  surfaceHit.barycoord = frameBarycoord;
  surfaceHit.side = frameSide;
  surfaceHit.dist = frameDistance;`
  ],
 ];
 for(const [original,replacement] of replacements){
  if(shader.split(original).length!==2)throw new Error('The bundled path-tracing shader changed. Review the native GPU compatibility adapter before rebuilding.');
  shader=shader.replace(original,replacement);
 }
 return shader;
}
