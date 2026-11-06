import {afterEach,describe,expect,it,vi} from 'vitest';
import {listModels,media} from '../server/providers';
import {generateImage} from '../src/lib/media-client';
import type {MediaRequest,ProviderConnection} from '../src/lib/types';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFZkAAAAASUVORK5CYII=';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const request=(provider='openrouter'):MediaRequest&{direct:true}=>({provider,apiKey:'test-key',model:'image-model',action:'image',prompt:'Keep this character identity; show her in the tower.',direct:true,referenceImages:[PNG]});
const connection=(provider='openrouter'):ProviderConnection=>({id:'c',name:provider,provider,apiKey:'test-key',model:'image-model',maxTokens:1000,temperature:1});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('actual image conditioning',()=>{
 it('places uploaded OpenRouter bytes in input_references and verifies capability before any paid call',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(json({data:[{id:'image-model',supported_parameters:['prompt','input_references']}]}));
  const result=await media(request());expect(f).toHaveBeenCalledTimes(1);expect(f.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/images/models');expect((result.download as any).body.input_references).toEqual([{type:'image_url',image_url:{url:PNG}}]);expect(JSON.stringify(result)).not.toContain('test-key');
 });
 it('refuses to silently drop references for an unsupported OpenRouter image model',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(json({data:[{id:'image-model',supported_parameters:['prompt']}]}));
  await expect(media(request())).rejects.toThrow('does not advertise');expect(f).toHaveBeenCalledTimes(1);
 });
 it('uses Venice multi-edit, modelId, images, and binary PNG when references are present',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(json({data:[{id:'image-model',type:'inpaint',model_spec:{constraints:{maxInputImages:2}}}]}));
  const result=await media({...request('venice'),width:1024,height:1024,aspectRatio:'16:9'});expect(f.mock.calls[0][0]).toBe('https://api.venice.ai/api/v1/models?type=inpaint');expect(result.download).toMatchObject({url:'https://api.venice.ai/api/v1/image/multi-edit',mime:'image/png',body:{modelId:'image-model',images:[PNG],output_format:'png',aspect_ratio:'16:9'}});expect((result.download as any).body.model).toBeUndefined();expect((result.download as any).body.width).toBeUndefined();
 });
 it('honors Venice per-model image count limits without submitting generation',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(json({data:[{id:'image-model',type:'inpaint',model_spec:{constraints:{combineImages:false}}}]}));
  await expect(media({...request('venice'),referenceImages:[PNG,PNG]})).rejects.toThrow('at most 1');expect(f).toHaveBeenCalledTimes(1);
 });
 it('includes Venice editing models in the searchable image catalog and retains capability arrays',async()=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(json({data:[{id:'text',type:'text'},{id:'generate',type:'image'},{id:'edit',type:'inpaint',model_spec:{constraints:{maxInputImages:3}}}]}));
  const result=await listModels({provider:'venice',apiKey:'key',kind:'image'});expect(f.mock.calls[0][0]).toBe('https://api.venice.ai/api/v1/models?type=all');expect(result.models.map(m=>m.id)).toEqual(['edit','generate']);expect((result.models[0] as any).capabilities).toMatchObject({maxInputImages:3,imageEditing:true});
 });
 it('normalizes binary edits through the server adapter when not using direct transport',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(json({data:[{id:'image-model',type:'inpaint'}]})).mockResolvedValueOnce(new Response(Buffer.from(PNG.split(',')[1],'base64'),{headers:{'Content-Type':'image/png'}}));
  const result=await media({...request('venice'),direct:false});expect(result.images).toEqual([{data:PNG,mime:'image/png'}]);
 });
 it.each(['https://evil.example/image.png','data:image/svg+xml;base64,PHN2Zz4='])('rejects unsafe reference input before any network request: %s',async reference=>{
  const f=vi.spyOn(globalThis,'fetch');await expect(media({...request(),referenceImages:[reference]})).rejects.toThrow();expect(f).not.toHaveBeenCalled();
 });
 it('preserves the selected bytes in the authorized browser request and reads a binary Venice edit',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});const body={modelId:'image-model',prompt:'Keep the face',images:[PNG],output_format:'png'};
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(json({provider:'venice',directKind:'image',download:{url:'https://api.venice.ai/api/v1/image/multi-edit',method:'POST',auth:'bearer',body,mime:'image/png'}})).mockResolvedValueOnce(new Response(Buffer.from(PNG.split(',')[1],'base64'),{headers:{'Content-Type':'image/png'}}));
  expect(await generateImage(connection('venice'),{model:'image-model',prompt:'Keep the face',referenceImages:[PNG]})).toEqual([{data:PNG,mime:'image/png'}]);
  expect(JSON.parse(f.mock.calls[0][1]?.body as string).referenceImages).toEqual([PNG]);expect(JSON.parse(f.mock.calls[1][1]?.body as string).images).toEqual([PNG]);expect(f.mock.calls[1][1]?.redirect).toBe('error');
 });
 it('does not submit a browser generation if a gateway strips the requested references',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});const f=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(json({provider:'openrouter',download:{url:'https://openrouter.ai/api/v1/images',method:'POST',auth:'bearer',body:{model:'image-model',prompt:'keep face'},mime:'application/json'}}));
  await expect(generateImage(connection(),{model:'image-model',prompt:'keep face',referenceImages:[PNG]})).rejects.toThrow('did not preserve');expect(f).toHaveBeenCalledTimes(1);
 });
});

describe('actual video reference and frame transport',()=>{
 it.each(['openrouter','venice'])('forwards reference-image bytes to %s and preserves the job identity',async provider=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(json(provider==='venice'?{queue_id:'job-ref'}:{id:'job-ref',status:'pending'}));
  const result=await media({...request(provider),action:'video-start',referenceImages:[PNG],referenceMode:'reference'});const body=JSON.parse(f.mock.calls[0][1]?.body as string);
  expect(provider==='venice'?body.reference_image_urls:body.input_references).toEqual(provider==='venice'?[PNG]:[{type:'image_url',image_url:{url:PNG}}]);expect(result.job).toMatchObject({id:'job-ref',model:'image-model',status:'pending'});expect(body.frame_images).toBeUndefined();expect(body.image_url).toBeUndefined();
 });
 it.each(['openrouter','venice'])('uses exact first/last-frame fields without mixing reference guidance for %s',async provider=>{
  const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(json(provider==='venice'?{queue_id:'job-frames'}:{id:'job-frames'}));
  await media({...request(provider),action:'video-start',referenceImages:[PNG,PNG],referenceMode:'first-last-frame'});const body=JSON.parse(f.mock.calls[0][1]?.body as string);
  if(provider==='venice'){expect(body.image_url).toBe(PNG);expect(body.end_image_url).toBe(PNG);expect(body.reference_image_urls).toBeUndefined();}else{expect(body.frame_images).toEqual([{type:'image_url',image_url:{url:PNG},frame_type:'first_frame'},{type:'image_url',image_url:{url:PNG},frame_type:'last_frame'}]);expect(body.input_references).toBeUndefined();}
 });
 it('rejects ambiguous frame counts before contacting a provider',async()=>{const f=vi.spyOn(globalThis,'fetch');await expect(media({...request(),action:'video-start',referenceImages:[PNG,PNG],referenceMode:'first-frame'})).rejects.toThrow('exactly one');expect(f).not.toHaveBeenCalled();});
 it('surfaces unsupported provider/model errors and never retries unconditioned',async()=>{const f=vi.spyOn(globalThis,'fetch').mockResolvedValue(json({error:'This model does not support reference images'},400));await expect(media({...request('venice'),action:'video-start'})).rejects.toThrow('does not support');expect(f).toHaveBeenCalledTimes(1);});
});
