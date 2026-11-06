import {test,expect} from '@playwright/test';

test('canonical references resize in the browser and retain their original stored pixels',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const modulePath='/src/lib/reference-images.ts';const {sceneReferenceImages}=await import(/* @vite-ignore */ modulePath);
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;const context=canvas.getContext('2d')!;context.fillStyle='#2d7358';context.fillRect(0,0,2048,1024);context.fillStyle='#f8cf76';context.fillRect(800,150,400,700);
  const original=canvas.toDataURL('image/png');
  const asset={id:'canonical',name:'Canonical character',kind:'image',mime:'image/png',data:original,createdAt:0};
  const unrelated={...asset,id:'unrelated',name:'Other cast'};
  const scene={id:'shot',continuity:{characterIds:['hero'],locationIds:[]}};
  const project={story:{characters:[{id:'hero',referenceAssetIds:['canonical']},{id:'other',referenceAssetIds:['unrelated']}],locations:[]},models:[]};
  const references=await sceneReferenceImages(project,scene,[asset,unrelated]);
  const resized=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=references[0];});
  return {count:references.length,characters:references[0].length,width:resized.naturalWidth,height:resized.naturalHeight,mime:references[0].split(';')[0],originalPreserved:asset.data===original,originalSize:[canvas.width,canvas.height]};
 });
 expect(result).toMatchObject({count:1,width:1024,height:512,mime:'data:image/jpeg',originalPreserved:true,originalSize:[2048,1024]});expect(result.characters).toBeLessThanOrEqual(450000);
});

test('actual canvas reference bytes reach the selected official image endpoint',async({page})=>{
 await page.goto('/');
 let reference='',calls=0;
 await page.route('**/api/media',async route=>{
  const body=route.request().postDataJSON();reference=body.referenceImages[0];
  expect(reference).toMatch(/^data:image\/png;base64,iVBOR/);
  await route.fulfill({contentType:'application/json',body:JSON.stringify({provider:'openrouter',download:{url:'https://openrouter.ai/api/v1/images',method:'POST',auth:'bearer',mime:'application/json',body:{model:body.model,prompt:body.prompt,input_references:[{type:'image_url',image_url:{url:reference}}]}}})});
 });
 await page.route('https://openrouter.ai/api/v1/images',async route=>{
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'};
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  calls++;expect(route.request().postDataJSON().input_references).toEqual([{type:'image_url',image_url:{url:reference}}]);
  await route.fulfill({headers,contentType:'application/json',body:JSON.stringify({data:[{b64_json:reference.split(',')[1],media_type:'image/png'}]})});
 });
 const result=await page.evaluate(async()=>{
  const modulePath='/src/lib/media-client.ts';const {generateImage}=await import(/* @vite-ignore */ modulePath);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.getContext('2d')!.fillRect(0,0,256,256);const data=canvas.toDataURL('image/png');
  const generated=await generateImage({id:'test',provider:'openrouter',name:'Mock provider',apiKey:'test-not-real',model:'mock',temperature:1,maxTokens:100},{model:'mock',prompt:'Retain this character',referenceImages:[data]});
  return generated[0].data===data;
 });
 expect(result).toBe(true);expect(calls).toBe(1);
});
