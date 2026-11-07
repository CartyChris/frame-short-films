import type { GenerateRequest, MediaRequest, Model } from '../src/lib/types.js';
import { ApiError, readLimited, requireOk, upstream, validateCustomUrl } from './network.js';
import {validateReferenceImages,validateReferenceMode} from '../src/lib/reference-contract.js';

export const BASES:Record<string,string>={moonshot:'https://api.moonshot.ai/v1',openrouter:'https://openrouter.ai/api/v1',venice:'https://api.venice.ai/api/v1',anthropic:'https://api.anthropic.com/v1',openai:'https://api.openai.com/v1',xai:'https://api.x.ai/v1',zai:'https://api.z.ai/api/paas/v4',deepseek:'https://api.deepseek.com',groq:'https://api.groq.com/openai/v1',mistral:'https://api.mistral.ai/v1',together:'https://api.together.xyz/v1',fireworks:'https://api.fireworks.ai/inference/v1',gemini:'https://generativelanguage.googleapis.com/v1beta/openai'};
export function text(value:unknown,name:string,max=1000,optional=false):string{if(optional&&(value===undefined||value===''))return '';if(typeof value!=='string'||!value.trim()||value.length>max)throw new ApiError(`${name} is required and must be at most ${max} characters.`);return value.trim();}
export function base(provider:string,baseUrl?:string){if(provider==='custom'){if(!baseUrl)throw new ApiError('A custom provider needs its public HTTPS API base URL.');return validateCustomUrl(baseUrl).toString().replace(/\/$/,'');}if(!BASES[provider])throw new ApiError('Select a supported API provider. Signed-in coding tools connect through the local companion.');return BASES[provider];}
export function headers(provider:string,key:string){return {'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{ }),...(provider==='anthropic'?{'anthropic-version':'2026-10-21'}:{})};}
function number(value:unknown,fallback:number,min:number,max:number){if(value===undefined)return fallback;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new ApiError(`Number must be between ${min} and ${max}.`);return value;}
/** The only binary chat inputs accepted here are explicit, bounded local image data for OpenRouter. */
function validateChatImages(value:unknown,provider:string,messages:{role:string;content:string}[]):NonNullable<GenerateRequest['images']>{
 if(value===undefined)return [];if(!Array.isArray(value)||value.length>3||(value.length>0&&provider!=='openrouter'))throw new ApiError('Image sharing is available only with OpenRouter, up to three images.');let total=0;return value.map(item=>{if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['messageIndex','dataUrl'].includes(k))||!Number.isInteger(item.messageIndex)||item.messageIndex<0||item.messageIndex>=messages.length||messages[item.messageIndex].role!=='user'||typeof item.dataUrl!=='string'||item.dataUrl.length>1_048_600)throw new ApiError('Invalid shared image selection.');const match=/^data:(image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.dataUrl);if(!match||match[2].length%4!==0)throw new ApiError('Only PNG, JPEG, or WebP image data is supported.');const bytes=Buffer.from(match[2],'base64');if(bytes.toString('base64')!==match[2])throw new ApiError('Invalid image encoding.');total+=bytes.length;if(total>750*1024)throw new ApiError('Shared images must total at most 750 KiB.',413);const mime=match[1],png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=bytes.length>=12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(!((mime==='image/png'&&png)||(mime==='image/jpeg'&&jpg)||(mime==='image/webp'&&webp)))throw new ApiError('A shared image does not match its declared type.');return {messageIndex:item.messageIndex,dataUrl:item.dataUrl};});
}
export function validateGenerate(input:unknown):GenerateRequest{
 const b=input as GenerateRequest;if(!b||typeof b!=='object')throw new ApiError('Expected a generation request.');
 const provider=text(b.provider,'Provider',40),apiKey=text(b.apiKey,'API key',8192),model=text(b.model,'Model',300);base(provider,b.baseUrl);
 if(!Array.isArray(b.messages)||!b.messages.length||b.messages.length>100)throw new ApiError('Provide between 1 and 100 messages.');
 let size=0;const messages=b.messages.map(m=>{if(!m||!['user','assistant','system','developer'].includes(m.role)||typeof m.content!=='string')throw new ApiError('Messages must contain a supported role and text content.');size+=m.content.length;return {role:m.role,content:m.content};});
 const images=validateChatImages(b.images,provider,messages);size+=images.reduce((n,i)=>n+i.dataUrl.length,0);if(size>1_800_000)throw new ApiError('This context is too large for one request. Generate or continue one scene at a time.',413);
 return {provider,apiKey,model,baseUrl:b.baseUrl,messages,...(images.length?{images}:{}),temperature:number(b.temperature,.7,0,2),maxTokens:Math.round(number(b.maxTokens,8192,1,262144))};
}
export async function generationResponse(input:GenerateRequest,signal?:AbortSignal):Promise<Response>{
 const provider=input.provider;const root=base(provider,input.baseUrl);let body:Record<string,unknown>;
 if(provider==='anthropic'){
   body={model:input.model,max_tokens:input.maxTokens,stream:true,messages:input.messages.filter(m=>m.role==='user'||m.role==='assistant'),system:input.messages.filter(m=>m.role==='system'||m.role==='developer').map(m=>m.content).join('\n\n')};
   // Sampling controls are model-dependent; omit for broad compatibility.
 }else{
   const messages=input.images?.length?input.messages.map((m,index)=>{const selected=input.images!.filter(image=>image.messageIndex===index);return selected.length?{role:m.role,content:[{type:'text',text:m.content},...selected.map(image=>({type:'image_url',image_url:{url:image.dataUrl}}))]}:m}):input.messages;
   body={model:input.model,messages,stream:true,...(provider==='openai'?{max_completion_tokens:input.maxTokens}:{max_tokens:input.maxTokens})};
   if(provider!=='openai'&&provider!=='moonshot')body.temperature=input.temperature;
 }
 const response=await requireOk(await upstream(root+(provider==='anthropic'?'/messages':'/chat/completions'),{method:'POST',headers:headers(provider,input.apiKey),body:JSON.stringify(body),signal},provider==='custom'),input.apiKey);
 if(!response.body)throw new ApiError('The provider returned an empty stream.',502);
 if(!response.headers.get('content-type')?.includes('text/event-stream')){await response.body.cancel();throw new ApiError('This model did not return a streaming response. Choose a chat model that supports streaming.',502);}
 return response;
}
function inferKind(id:string,m:Record<string,any>,forced?:string):string{
 if(m.type==='inpaint')return 'image';
 if(forced)return forced;if(['text','image','video','tts','audio','speech','embedding','asr','music'].includes(m.type))return m.type==='tts'||m.type==='speech'?'audio':m.type;
 const output=m.architecture?.output_modalities||m.output_modalities;
 if(Array.isArray(output)){if(output.includes('video'))return 'video';if(output.includes('image'))return 'image';if(output.includes('speech')||output.includes('audio'))return 'audio';if(output.includes('text'))return 'text';}
 if(/(?:embedding|embed|rerank)/i.test(id))return 'embedding';
 return 'text';
}
export function normalizeModel(m:Record<string,any>,forced?:string):Model&{capabilities:Record<string,unknown>}{
 const id=String(m.id||m.name||'');const kind=inferKind(id,m,forced);const supported=m.supported_voices||m.model_spec?.voices||[];
 return {id,name:String(m.display_name||m.displayName||m.model_spec?.name||m.name||id),contextLength:m.context_length||m.context_window||m.max_context_length||m.model_spec?.availableContextTokens,modalities:m.architecture?.output_modalities||m.output_modalities||[kind],kind,pricing:m.pricing,capabilities:{...m.model_spec?.capabilities,...m.model_spec?.constraints,...(m.supported_parameters?{supportedParameters:m.supported_parameters}:{}),...(m.supported_frame_images?{frameImages:m.supported_frame_images}:{}),...(m.type==='inpaint'?{imageEditing:true}:{}),...(m.supported_durations?{durations:m.supported_durations}:{}),...(m.supported_resolutions?{resolutions:m.supported_resolutions}:{}),...(m.supported_aspect_ratios?{aspectRatios:m.supported_aspect_ratios}:{})},voices:Array.isArray(supported)?supported.map(v=>typeof v==='string'?v:String(v.id||v.name||'')).filter(Boolean):Object.keys(supported)};
}
export async function listModels(input:Record<string,any>,signal?:AbortSignal):Promise<{models:Model[]}>{
 const provider=text(input.provider,'Provider',40),key=text(input.apiKey,'API key',8192,provider==='openrouter');const root=base(provider,input.baseUrl);let path='/models';let forced:string|undefined;
 if(provider==='openrouter'&&input.kind==='image'){path='/images/models';forced='image';}
 else if(provider==='openrouter'&&input.kind==='video'){path='/videos/models';forced='video';}
 else if(provider==='openrouter'&&input.kind==='audio'){path='/models?output_modalities=speech';forced='audio';}
 else if(provider==='venice')path=`/models?type=${input.kind==='audio'?'tts':input.kind==='image'?'all':input.kind||'all'}`;
 else if(provider==='xai'){path='/language-models';forced='text';}
 const models:Model[]=[];let cursor='';const seen=new Set<string>();
 for(let page=0;page<100;page++){
   let url=root+path;if(provider==='fireworks')url='https://api.fireworks.ai/v1/accounts/fireworks/models?pageSize=200';
   if(cursor)url+=(url.includes('?')?'&':'?')+(provider==='anthropic'?'after_id=':'pageToken=')+encodeURIComponent(cursor);
   if(provider==='anthropic')url+=(url.includes('?')?'&':'?')+'limit=1000';
   const response=await requireOk(await upstream(url,{headers:headers(provider,key),signal},provider==='custom'),key);
   const value=await response.json();const entries=Array.isArray(value)?value:value.data||value.models;
   if(!Array.isArray(entries))throw new ApiError('The provider did not return a model catalog. You can still enter a model ID manually.',502);
   for(const item of entries){const m=normalizeModel(item,forced);if(m.id&&!seen.has(m.id)){seen.add(m.id);models.push(m);}}
   const next=provider==='anthropic'?(value.has_more?value.last_id:''):(value.nextPageToken||value.next_page_token||'');if(!next||next===cursor)break;cursor=next;
 }
 // Keep OpenRouter's entire unfiltered catalog unless the user chooses a modality.
 return {models:models.filter(m=>!input.kind||m.kind===input.kind||(input.kind==='text'&&m.modalities?.includes('text'))).sort((a,b)=>a.name.localeCompare(b.name))};
}
export interface DirectDownload {url:string;method:'GET'|'POST';auth:'bearer'|'none';body?:Record<string,unknown>;mime:string}
function download(url:string,method:'GET'|'POST',auth:'bearer'|'none',body?:Record<string,unknown>,mime='video/mp4'):DirectDownload{return {url,method,auth,body,mime};}
function safeVeniceDownload(raw:string){const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='private-share.venice.ai'||!u.pathname.startsWith('/v1/share/read/')||u.username||u.password||u.port)throw new ApiError('Venice returned an unexpected download address.',502);return u.toString();}
function normalizeImage(data:string,mime:string){return {data:data.startsWith('data:')?data:`data:${mime};base64,${data}`,mime};}
export async function media(input:MediaRequest&{direct?:boolean},signal?:AbortSignal):Promise<Record<string,unknown>>{
 const provider=text(input.provider,'Provider',40),key=text(input.apiKey,'API key',8192),model=text(input.model,'Model',300);
 if(!['openrouter','venice'].includes(provider))throw new ApiError('Generated images and video are supported through OpenRouter and Venice. Other media can be imported as files.');
 const root=base(provider);const request=async(path:string,method:'GET'|'POST',body?:Record<string,unknown>)=>requireOk(await upstream(root+path,{method,headers:headers(provider,key),body:body?JSON.stringify(body):undefined,signal}),key);
 let references:string[],referenceMode:ReturnType<typeof validateReferenceMode>;
 try{references=validateReferenceImages(input.referenceImages);referenceMode=validateReferenceMode(input.referenceMode,references.length);}catch(error){throw new ApiError((error as Error).message);}
 if(references.length&&!['image','video-start'].includes(input.action))throw new ApiError('Reference images belong on a new image or video request.');
 if(input.action==='image'){
   if(referenceMode!=='reference')throw new ApiError('First and last frames apply to video. Use reference guidance for images.');
   const prompt=text(input.prompt,'Image direction',30_000);const editing=provider==='venice'&&references.length>0;const path=provider==='openrouter'?'/images':editing?'/image/multi-edit':'/image/generate';
   const body:Record<string,unknown>={model,prompt};if(input.aspectRatio)body.aspect_ratio=text(input.aspectRatio,'Aspect ratio',20);if(input.resolution)body.resolution=text(input.resolution,'Resolution',20);
   if(references.length){
    // Confirm image-edit capability before spending credits; never retry without references.
    const catalog=await (await request(provider==='venice'?'/models?type=inpaint':'/images/models','GET')).json();
    const entry=(Array.isArray(catalog.data)?catalog.data:[]).find((entry:Record<string,unknown>)=>entry.id===model);
    if(!entry)throw new ApiError('This model is not in the reference-capable image catalog. Choose an image editing model or turn references off explicitly.');
    if(editing){const constraints=entry.model_spec?.constraints||{};const capabilities=entry.model_spec?.capabilities||entry.capabilities||{};const maximum=constraints.maxInputImages??capabilities.maxInputImages??((constraints.combineImages??capabilities.combineImages)===false?1:3);if(references.length>maximum)throw new ApiError(`This Venice editing model accepts at most ${maximum} reference images. Choose fewer in Story & cast.`);delete body.model;Object.assign(body,{modelId:model,images:references,output_format:'png',safe_mode:true});}
    else {if(!Array.isArray(entry.supported_parameters)||!entry.supported_parameters.includes('input_references'))throw new ApiError('This OpenRouter model does not advertise reference images. Choose a model that supports input_references.');body.input_references=references.map(url=>({type:'image_url',image_url:{url}}));}
   }
   if(provider==='venice'&&!editing){Object.assign(body,{format:'png',return_binary:false,variants:1,safe_mode:true});if(input.width)body.width=number(input.width,1024,64,8192);if(input.height)body.height=number(input.height,1024,64,8192);}
   else body.n=1;
   if(editing)delete body.n;
   if(input.direct)return {download:download(root+path,'POST','bearer',body,editing?'image/png':'application/json'),directKind:'image',provider};
   const response=await request(path,'POST',body);const bytes=await readLimited(response,editing?3_000_000:3_500_000);
   if(editing){const mime=(response.headers.get('content-type')||'').split(';')[0];if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new ApiError('The image editing model did not return an image.',502);return {images:[normalizeImage(Buffer.from(bytes).toString('base64'),mime)]};}
   const value=JSON.parse(new TextDecoder().decode(bytes));
   const images=provider==='openrouter'?(value.data||[]).filter((a:Record<string,any>)=>typeof a.b64_json==='string').map((a:Record<string,any>)=>normalizeImage(a.b64_json,a.media_type||'image/png')):(value.images||[]).filter((a:unknown)=>typeof a==='string').map((a:string)=>normalizeImage(a,'image/png'));
   if(!images.length)throw new ApiError('The image provider returned no image data.',502);return {images};
 }
 if(input.action==='video-start'){
   const prompt=text(input.prompt,'Video direction',30_000);const duration=number(input.duration,5,1,120);const body:Record<string,unknown>={model,prompt,duration:provider==='venice'?`${duration}s`:duration,aspect_ratio:input.aspectRatio||'16:9',resolution:input.resolution||'720p'};
   if(references.length){
    if(provider==='venice'){
     if(referenceMode==='reference')body.reference_image_urls=references;
     else{body.image_url=references[0];if(referenceMode==='first-last-frame')body.end_image_url=references[1];}
    }else if(referenceMode==='reference')body.input_references=references.map(url=>({type:'image_url',image_url:{url}}));
    else body.frame_images=references.map((url,index)=>({type:'image_url',image_url:{url},frame_type:index===0?'first_frame':'last_frame'}));
   }
   const response=await request(provider==='venice'?'/video/queue':'/videos','POST',body);const value=await response.json();const id=provider==='venice'?value.queue_id:value.id;if(typeof id!=='string'||!id)throw new ApiError('The provider did not return a video job ID.',502);
   return {job:{id,model,status:provider==='venice'?'pending':value.status||'pending',...(value.download_url?{downloadUrl:safeVeniceDownload(value.download_url)}:{})}};
 }
 const id=text(input.jobId,'Video job ID',300);if(!/^[a-zA-Z0-9._:-]+$/.test(id))throw new ApiError('Invalid video job ID.');
 if(input.action==='video-content'){
   if(provider==='openrouter')return {download:download(`${root}/videos/${encodeURIComponent(id)}/content?index=0`,'GET','bearer')};
   return {download:input.downloadUrl?download(safeVeniceDownload(input.downloadUrl),'GET','none'):download(root+'/video/retrieve','POST','bearer',{model,queue_id:id})};
 }
 if(input.action==='video-poll'){
   const response=await request(provider==='venice'?'/video/retrieve':`/videos/${encodeURIComponent(id)}`,provider==='venice'?'POST':'GET',provider==='venice'?{model,queue_id:id}:undefined);
   if(response.headers.get('content-type')?.includes('video/')){await response.body?.cancel();return {job:{id,model,status:'completed'},download:download(root+'/video/retrieve','POST','bearer',{model,queue_id:id})};}
   const value=await response.json();let status=String(value.status||'pending').toLowerCase();if(status==='processing')status='in_progress';
   const job={id,model,status,...(input.downloadUrl?{downloadUrl:safeVeniceDownload(input.downloadUrl)}:{}),...(value.error?{error:String(value.error?.message||value.error).slice(0,1200)}:{})};
   return {job};
 }
 throw new ApiError('Unknown media action.');
}
export async function voice(input:Record<string,any>,signal?:AbortSignal):Promise<{bytes:Uint8Array;mime:string}>{
 const provider=text(input.provider,'Provider',40),key=text(input.apiKey,'API key',8192),model=text(input.model,'Voice model',300),voiceId=text(input.voice,'Voice',200);const words=text(input.text,'Narration',provider==='elevenlabs'?40_000:4096);
 if(!['openrouter','venice','openai','elevenlabs'].includes(provider))throw new ApiError('Choose OpenRouter, Venice, ElevenLabs, or OpenAI for generated narration.');
 const url=provider==='elevenlabs'?`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`:base(provider)+'/audio/speech';
 const body=provider==='elevenlabs'?{model_id:model,text:words,voice_settings:{speed:number(input.speed,1,.7,1.2)}}:{model,input:words,voice:voiceId,response_format:'mp3',...(input.speed!==undefined?{speed:number(input.speed,1,.25,4)}:{})};
 const response=await requireOk(await upstream(url,{method:'POST',headers:provider==='elevenlabs'?{'xi-api-key':key,'Content-Type':'application/json'}:headers(provider,key),body:JSON.stringify(body),signal}),key);
 const mime=(response.headers.get('content-type')||'audio/mpeg').split(';')[0];if(!mime.startsWith('audio/')&&mime!=='application/octet-stream'){await response.body?.cancel();throw new ApiError('The voice provider did not return audio.',502);}
 return {bytes:await readLimited(response,4_000_000),mime:mime==='application/octet-stream'?'audio/mpeg':mime};
}
