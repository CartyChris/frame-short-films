/** Safe display subset of the MIT Freefield public app catalog. No workflows are executed here. */
export type FreefieldScalar=string|number|boolean;
export type FreefieldValue=FreefieldScalar|FreefieldScalar[]|File;
export type FreefieldValues=Record<string,FreefieldValue>;
export type FreefieldInput={id:string;type:'text'|'textarea'|'number'|'slider'|'select'|'toggle'|'seed'|'image'|'video'|'audio';label:string;help?:string;required:boolean;default?:FreefieldScalar|FreefieldScalar[];min?:number;max?:number;step?:number;multiple?:{max:number};options:{value:FreefieldScalar;label:string}[];maxMb:number};
export type FreefieldApp={id:string;name:string;section:'image'|'video'|'audio'|'utility';summary:string;status:'ready'|'draft';runnable:boolean;inputs:FreefieldInput[];outputs:{type:'image'|'video'|'audio';label:string}[];presets:{id:string;label:string}[];models:{name:string;license:string;gated:boolean;optional:boolean;gb?:number}[];credits:string[]};
export type FreefieldOutput={id:string;name:string;type:'image'|'video'|'audio'};
/** Local request identities are never treated as Freefield server history IDs. */
export type FreefieldJob={id:string;requestId:string;identity:'local'|'server';appId:string;status:'starting'|'queued'|'running'|'succeeded'|'failed'|'canceled'|'expired'|'lost'|'unknown';outputs:FreefieldOutput[];error?:string;acknowledged?:boolean};
export type FreefieldSubmit={requestId:string;appId:string;values:FreefieldValues;preset?:string};
export function unresolvedFreefieldRequest(job?:FreefieldJob){return !!job&&job.identity==='local'&&(job.status==='starting'||job.status==='unknown')&&!job.acknowledged}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const scalar=(v:unknown):v is FreefieldScalar=>typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v);
const text=(v:unknown,max:number)=>typeof v==='string'?v.slice(0,max):'';
const id=(v:unknown,pattern:RegExp)=>typeof v==='string'&&v.length<=80&&pattern.test(v);
const APP_ID=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,INPUT_ID=/^[a-z][a-z0-9_]*$/;
const types=['text','textarea','number','slider','select','toggle','seed','image','video','audio'] as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** Bound and validate persisted job records before accepting them from a backup or adapter. */
export function normalizeFreefieldJob(raw:unknown):FreefieldJob{
 if(!record(raw)||!id(raw.requestId,UUID)||!id(raw.appId,APP_ID)||!id(raw.id,SAFE_ID)||!['local','server'].includes(String(raw.identity))||!['starting','queued','running','succeeded','failed','canceled','expired','lost','unknown'].includes(String(raw.status))||!Array.isArray(raw.outputs)||raw.outputs.length>32)throw new Error('Invalid Freefield run record.');
 if(raw.identity==='local'&&(raw.id!==raw.requestId||!['starting','unknown'].includes(String(raw.status))||raw.outputs.length))throw new Error('Invalid local Freefield request record.');
 if(raw.acknowledged===true&&(raw.identity!=='local'||raw.status!=='unknown'))throw new Error('Invalid Freefield acknowledgement.');
 const outputs=raw.outputs.map(o=>{if(!record(o)||!id(o.id,SAFE_ID)||!text(o.name,200)||!['image','video','audio'].includes(String(o.type)))throw new Error('Invalid Freefield output.');return {id:o.id as string,name:text(o.name,200),type:o.type as FreefieldOutput['type']}});
 if(new Set(outputs.map(o=>o.id)).size!==outputs.length)throw new Error('Duplicate Freefield output.');
 return {id:raw.id as string,requestId:raw.requestId as string,identity:raw.identity as FreefieldJob['identity'],appId:raw.appId as string,status:raw.status as FreefieldJob['status'],outputs,...(text(raw.error,1000)?{error:text(raw.error,1000)}:{}),...(raw.acknowledged===true?{acknowledged:true}:{})};
}

export function parseFreefieldCatalog(raw:unknown):{apps:FreefieldApp[];rejected:number}{
 if(!record(raw)||!Array.isArray(raw.apps)||raw.apps.length>500)throw new Error('Invalid or oversized Freefield catalog.');
 const apps:FreefieldApp[]=[],seen=new Set<string>();let rejected=0;
 for(const v of raw.apps){try{
  if(!record(v)||!id(v.id,APP_ID)||seen.has(v.id as string)||!text(v.name,80)||!['image','video','audio','utility'].includes(String(v.section))||!['ready','draft'].includes(String(v.status))||!Array.isArray(v.inputs)||v.inputs.length>80||!Array.isArray(v.outputs)||v.outputs.length>30||!Array.isArray(v.models)||v.models.length>100)throw Error();
  const used=new Set<string>();const inputs=v.inputs.map((x):FreefieldInput=>{
   if(!record(x)||!id(x.id,INPUT_ID)||['constructor','prototype'].includes(String(x.id))||used.has(x.id as string)||!types.includes(x.type as typeof types[number])||!text(x.label,120))throw Error();
   used.add(x.id as string);const type=x.type as FreefieldInput['type'];
   const options=x.options===undefined?[]:Array.isArray(x.options)&&x.options.length<=200?x.options.map(o=>{if(!record(o)||!scalar(o.value)||!text(o.label,160)||typeof o.value==='string'&&o.value.length>500)throw Error();return {value:o.value,label:text(o.label,160)}}):(()=>{throw Error()})();
   if(new Set(options.map(o=>String(o.value))).size!==options.length||type==='select'&&!options.length)throw Error();
   const min=typeof x.min==='number'&&Number.isFinite(x.min)?x.min:undefined,max=typeof x.max==='number'&&Number.isFinite(x.max)?x.max:undefined,step=typeof x.step==='number'&&Number.isFinite(x.step)&&x.step>0?x.step:undefined;
   if(min!==undefined&&max!==undefined&&min>max)throw Error();
   const multiple=type==='select'&&record(x.multiple)?{max:typeof x.multiple.max==='number'&&Number.isInteger(x.multiple.max)?Math.max(2,Math.min(200,x.multiple.max)):options.length}:undefined;
   const def=scalar(x.default)?x.default:Array.isArray(x.default)&&x.default.length<=200&&x.default.every(scalar)?x.default:undefined;
   const limits=record(x.limits)?x.limits:{};const maxMb=typeof limits.max_mb==='number'&&Number.isFinite(limits.max_mb)?Math.max(0.01,Math.min(100,limits.max_mb)):50;
   return {id:x.id as string,type,label:text(x.label,120),help:text(x.help,1000)||undefined,required:x.required===true,default:def,min,max,step,multiple,options,maxMb};
  });
  const outputs=v.outputs.map(o=>{if(!record(o)||!['image','video','audio'].includes(String(o.type)))throw Error();return {type:o.type as 'image'|'video'|'audio',label:text(o.label,120)||String(o.type)}});
  const models=v.models.map(m=>{if(!record(m))throw Error();return {name:text(m.name||m.file,240)||'Model',license:text(m.license,240)||'Not specified',gated:m.gated===true,optional:m.optional===true,gb:typeof m.gb==='number'&&Number.isFinite(m.gb)?Math.max(0,m.gb):undefined}});
  const presets=Array.isArray(v.presets)&&v.presets.length<=100?v.presets.map(p=>{if(!record(p)||!id(p.id,APP_ID)||!text(p.label,120))throw Error();return {id:p.id as string,label:text(p.label,120)}}):[];
  const credits=Array.isArray(v.credits)?v.credits.slice(0,50).map(c=>text(c,500)).filter(Boolean):[];
  const app:FreefieldApp={id:v.id as string,name:text(v.name,80),section:v.section as FreefieldApp['section'],summary:text(v.summary,500),status:v.status as FreefieldApp['status'],runnable:v.runnable===true,inputs,outputs,presets,models,credits};apps.push(app);seen.add(app.id);
 }catch{rejected++}}
 return {apps,rejected};
}
export function freefieldDefaults(app:FreefieldApp):FreefieldValues{
 const result:FreefieldValues=Object.create(null);for(const input of app.inputs){if(input.default!==undefined)result[input.id]=input.default;else if(input.type==='toggle')result[input.id]=false;else if(input.multiple)result[input.id]=[];}return result;
}
export function validateFreefieldValues(app:FreefieldApp,values:FreefieldValues,preset?:string):void{
 if(preset&&!app.presets.some(p=>p.id===preset))throw new Error('Choose a listed preset.');
 if(Object.keys(values).some(k=>!app.inputs.some(i=>i.id===k)))throw new Error('Unknown workflow input.');
 for(const input of app.inputs){const v=values[input.id],empty=v===undefined||v===''||Array.isArray(v)&&v.length===0;
  if(empty){if(input.required)throw new Error(`${input.label} is required.`);continue}
  if(input.type==='text'||input.type==='textarea'){if(typeof v!=='string'||v.length>16000)throw new Error(`${input.label} must be text of at most 16,000 characters.`)}
  else if(input.type==='toggle'){if(typeof v!=='boolean')throw new Error(`${input.label} must be on or off.`)}
  else if(['number','slider','seed'].includes(input.type)){if(typeof v!=='number'||!Number.isFinite(v)||input.min!==undefined&&v<input.min||input.max!==undefined&&v>input.max)throw new Error(`${input.label} is outside its permitted range.`)}
  else if(input.type==='select'){const chosen=Array.isArray(v)?v:[v];if((!!input.multiple)!==Array.isArray(v)||chosen.length>(input.multiple?.max||1)||chosen.some(c=>!input.options.some(o=>Object.is(o.value,c))))throw new Error(`${input.label} has an invalid selection.`)}
  else if(typeof File==='undefined'||!(v instanceof File)||v.size>input.maxMb*1024*1024||v.size===0)throw new Error(`${input.label} needs a file no larger than ${input.maxMb} MB.`);
 }
}
