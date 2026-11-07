/** Local records contain no API credentials; save before network submission. */
export const HIGGSFIELD_MODELS=[
 {id:'higgsfield-ai/soul/standard',label:'Soul standard · image',kind:'image',reference:false},
 {id:'kling-video/v2.5-turbo/pro/image-to-video',label:'Kling 2.5 Turbo Pro · image to video',kind:'video',reference:true},
 {id:'kling-video/v2.5-turbo/pro/text-to-video',label:'Kling 2.5 Turbo Pro · text to video',kind:'video',reference:false},
 {id:'kling-video/v2.5-turbo/standard/image-to-video',label:'Kling 2.5 Turbo Standard · image to video',kind:'video',reference:true},
 {id:'minimax/hailuo-2.3/standard/image-to-video',label:'Hailuo 2.3 Standard · image to video',kind:'video',reference:true},
 {id:'minimax/hailuo-2.3/standard/text-to-video',label:'Hailuo 2.3 Standard · text to video',kind:'video',reference:false},
] as const;
export type HiggsfieldModel=typeof HIGGSFIELD_MODELS[number]['id'];
export type HiggsfieldOutput={kind:'image'|'video'|'audio';url:string};
export type HiggsfieldStatus='starting'|'unknown'|'queued'|'in_progress'|'nsfw'|'failed'|'completed'|'canceled'|'cancel_requested';
export interface HiggsfieldJob {operationId:string;model:HiggsfieldModel;status:HiggsfieldStatus;createdAt:number;updatedAt:number;requestId?:string;outputs:HiggsfieldOutput[];acknowledged?:boolean}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validPublicHttps(value:unknown):value is string{if(typeof value!=='string'||value.length>8192)return false;try{const u=new URL(value),h=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443')&&h.includes('.')&&!/^\d+\.\d+\.\d+\.\d+$/.test(h)&&!h.startsWith('[')&&h!=='localhost'&&!h.endsWith('.localhost')&&!h.endsWith('.local')&&!h.endsWith('.internal')}catch{return false}}
export function normalizeHiggsfieldJob(value:unknown):HiggsfieldJob{
 if(!obj(value)||typeof value.operationId!=='string'||!UUID.test(value.operationId)||!HIGGSFIELD_MODELS.some(m=>m.id===value.model)||!['starting','unknown','queued','in_progress','nsfw','failed','completed','canceled','cancel_requested'].includes(String(value.status))||typeof value.createdAt!=='number'||!Number.isFinite(value.createdAt)||typeof value.updatedAt!=='number'||!Number.isFinite(value.updatedAt)||value.updatedAt<value.createdAt||!Array.isArray(value.outputs)||value.outputs.length>42)throw new Error('Invalid saved Higgsfield run.');
 const requestId=value.requestId;if(requestId!==undefined&&(typeof requestId!=='string'||!UUID.test(requestId)))throw new Error('Invalid saved Higgsfield request ID.');if(!['starting','unknown'].includes(String(value.status))&&!requestId)throw new Error('A server run needs a Higgsfield request ID.');if(value.acknowledged!==undefined&&typeof value.acknowledged!=='boolean')throw new Error('Invalid saved run acknowledgement.');if(value.acknowledged&&value.status!=='unknown')throw new Error('Only an uncertain run can be acknowledged.');
 const outputs=value.outputs.map(o=>{if(!obj(o)||!['image','video','audio'].includes(String(o.kind))||!validPublicHttps(o.url))throw new Error('Invalid saved Higgsfield media link.');return {kind:o.kind as HiggsfieldOutput['kind'],url:o.url as string}});
 return {operationId:value.operationId.toLowerCase(),model:value.model as HiggsfieldModel,status:value.status as HiggsfieldStatus,createdAt:value.createdAt,updatedAt:value.updatedAt,...(requestId?{requestId:(requestId as string).toLowerCase()}:{}),outputs,...(value.acknowledged?{acknowledged:true}:{})};
}
export function isUnresolvedHiggsfield(job:HiggsfieldJob){return (job.status==='starting'||job.status==='unknown')&&!job.acknowledged}
export function validateHiggsfieldPrompt(model:HiggsfieldModel,prompt:string,reference:string){const selected=HIGGSFIELD_MODELS.find(m=>m.id===model);if(!selected)throw new Error('Choose a supported model.');if(!prompt.trim()||prompt.length>16000)throw new Error('Enter a prompt of at most 16,000 characters.');if(selected.reference&&!validPublicHttps(reference))throw new Error('Enter a public HTTPS reference image URL.');}
/** Check identity and only accept the API's constrained status/output envelope. */
export function applyHiggsfieldResponse(job:HiggsfieldJob,value:unknown):HiggsfieldJob{if(!obj(value)||typeof value.requestId!=='string'||!UUID.test(value.requestId)||!['queued','in_progress','nsfw','failed','completed','canceled','cancel_requested'].includes(String(value.status))||!Array.isArray(value.outputs??[]))throw new Error('The provider returned an invalid response.');if(value.operationId!==undefined&&value.operationId!==job.operationId||job.requestId&&value.requestId.toLowerCase()!==job.requestId)throw new Error('The response belongs to a different run.');return normalizeHiggsfieldJob({...job,requestId:value.requestId,status:value.status,updatedAt:Math.max(Date.now(),job.updatedAt),outputs:value.outputs??[]});}
