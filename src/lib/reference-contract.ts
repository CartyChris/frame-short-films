/** Shared transport limits keep reference requests below the hosted gateway limit. */
export const MAX_REFERENCE_IMAGES=3;
export const MAX_REFERENCE_CHARACTERS=1_500_000;
export type ReferenceMode='reference'|'first-frame'|'first-last-frame';

export function validateReferenceImage(data:unknown,maxCharacters=MAX_REFERENCE_CHARACTERS):string {
 if(typeof data!=='string'||data.length>maxCharacters)throw new Error('Reference images are too large. Use smaller JPEG, PNG, or WebP images.');
 const match=data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match||match[2].length%4!==0)throw new Error('References must be embedded JPEG, PNG, or WebP images. Remote addresses and SVG are not accepted.');
 let head:string;try{head=atob(match[2].slice(0,32));}catch{throw new Error('The reference image has invalid base64 data.');}
 const signature=match[1]==='image/png'?head.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='image/jpeg'?head.startsWith('\xff\xd8\xff'):head.startsWith('RIFF')&&head.slice(8,12)==='WEBP';
 if(!signature)throw new Error('The reference image bytes do not match its image format.');
 return data;
}
export function validateReferenceImages(value:unknown):string[] {
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>MAX_REFERENCE_IMAGES)throw new Error(`Choose at most ${MAX_REFERENCE_IMAGES} reference images for one shot.`);
 const images=value.map(image=>validateReferenceImage(image));
 if(images.reduce((size,image)=>size+image.length,0)>MAX_REFERENCE_CHARACTERS)throw new Error('The reference images together are too large. Use smaller images before generating.');
 return images;
}
export function validateReferenceMode(value:unknown,count:number):ReferenceMode {
 const mode=value===undefined?'reference':value;
 if(mode!=='reference'&&mode!=='first-frame'&&mode!=='first-last-frame')throw new Error('Choose reference guidance, a first frame, or first and last frames.');
 if(mode==='first-frame'&&count!==1)throw new Error('First-frame mode requires exactly one reference image.');
 if(mode==='first-last-frame'&&count!==2)throw new Error('First-and-last-frame mode requires exactly two reference images, in that order.');
 return mode;
}
