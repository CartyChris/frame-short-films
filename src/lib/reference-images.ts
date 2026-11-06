import type {Asset,Project,Scene} from './types';
import {MAX_REFERENCE_IMAGES,validateReferenceImage,validateReferenceImages} from './reference-contract';

/** Only this shot's selected cast and places may contribute uploaded references. */
export function sceneReferenceAssets(project:Project,scene:Scene,assets:Asset[]):Asset[] {
 const cast=new Set(scene.continuity?.characterIds||[]),places=new Set(scene.continuity?.locationIds||[]);
 const ids=[...new Set([...(project.story?.characters||[]).filter(c=>cast.has(c.id)).flatMap(c=>c.referenceAssetIds),...(project.story?.locations||[]).filter(l=>places.has(l.id)).flatMap(l=>l.referenceAssetIds)])];
 const models=new Set((project.models||[]).map(model=>model.id));
 const chosen:Asset[]=[];
 for(const id of ids){
  const asset=assets.find(a=>a.id===id);
  if(!asset){if(models.has(id))continue;throw new Error('A selected story reference image is missing. Relink it in Story & cast before generating.');}
  if(asset.kind!=='image')throw new Error(`The story reference “${asset.name}” is not a still image.`);
  chosen.push(asset);
 }
 if(chosen.length>MAX_REFERENCE_IMAGES)throw new Error(`This shot has ${chosen.length} reference images. Select at most ${MAX_REFERENCE_IMAGES} across its cast and places in Story & cast.`);
 return chosen;
}
async function prepareReference(asset:Asset):Promise<string>{
 validateReferenceImage(asset.data,40_000_000);
 const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`The reference “${asset.name}” could not be decoded.`));image.src=asset.data;});
 const width=image.naturalWidth,height=image.naturalHeight;
 if(!width||!height||width*height>33_177_600||width*height<65_536)throw new Error(`Use a reference with at least 65,536 pixels (for example 256 × 256) and at most 33 megapixels: ${asset.name}.`);
 if(Math.max(width,height)<=1024&&asset.data.length<=450_000)return asset.data;
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
 if(!context)throw new Error('This browser could not prepare the reference image.');
 for(const edge of [1024,768,512]){
  const scale=Math.min(1,edge/Math.max(width,height));canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
  if(canvas.width*canvas.height<65_536)continue;
  // A neutral matte preserves readable silhouettes when compression needs JPEG.
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.88,.72,.56]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=450_000){validateReferenceImage(data);return data;}}
 }
 throw new Error(`The reference “${asset.name}” could not fit in this shot's upload. Export a smaller JPEG and relink it.`);
}
/** Original media stays untouched. Copies are bounded to 3 images / 1.5 MB encoded. */
export async function sceneReferenceImages(project:Project,scene:Scene,assets:Asset[]):Promise<string[]> {
 return prepareReferenceImages(sceneReferenceAssets(project,scene,assets));
}
export async function prepareReferenceImages(assets:Asset[]):Promise<string[]> {
 if(assets.length>MAX_REFERENCE_IMAGES)throw new Error(`Choose at most ${MAX_REFERENCE_IMAGES} linked images for one generation. Unlink extra references first.`);
 const result:string[]=[];
 for(const asset of assets)result.push(await prepareReference(asset));
 return validateReferenceImages(result);
}
