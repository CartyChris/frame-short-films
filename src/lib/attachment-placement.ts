import type {Layer,Scene,Asset} from './types';
import type {ProductionPlacement} from './story-types';
import {newLayer} from './defaults';
import * as Store from './storage';

/** Read source duration without silently cutting an unrecognized audio/video file. */
export async function probeAttachmentDuration(blob:Blob,kind:'audio'|'video',signal:AbortSignal):Promise<number>{
 if(typeof document==='undefined'||typeof URL.createObjectURL!=='function')throw new Error('This device could not inspect the file duration. The original remains saved.');
 if(signal.aborted)throw new DOMException('Production paused.','AbortError');
 const url=URL.createObjectURL(blob),media=document.createElement(kind);media.preload='metadata';
 try{return await new Promise<number>((resolve,reject)=>{
  let settled=false;const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);media.onloadedmetadata=null;media.onerror=null;if(error)reject(error);else if(Number.isFinite(media.duration)&&media.duration>0)resolve(media.duration);else reject(new Error('The file duration could not be read. The original remains saved.'))};
  const abort=()=>finish(new DOMException('Production paused.','AbortError'));const timer=setTimeout(()=>finish(new Error('The file duration could not be read. The original remains saved.')),15000);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return}media.onloadedmetadata=()=>finish();media.onerror=()=>finish(new Error('This device cannot read that media file. The original remains saved.'));media.src=url;media.load();
 })}finally{media.removeAttribute('src');media.load();URL.revokeObjectURL(url)}
}

/** Build editable layers without changing the shot; caller applies them atomically with the scene. */
export async function attachmentLayers(projectId:string,scene:Scene,placements:ProductionPlacement[],signal:AbortSignal,probe=probeAttachmentDuration):Promise<Layer[]>{
 if(!Array.isArray(placements)||placements.length>32)throw new Error('A shot can use at most 32 attached files.');
 const ids=new Set<string>(),layers:Layer[]=[],resolved=new Map<string,{asset:Asset;name:string;duration?:number}>();
 for(const placement of placements){
  if(signal.aborted)throw new DOMException('Production paused.','AbortError');
  if(!placement||typeof placement.id!=='string'||!placement.id||ids.has(placement.id)||typeof placement.attachmentId!=='string'||!placement.attachmentId||![placement.start,placement.duration,placement.trim].every(Number.isFinite)||placement.start<0||placement.duration<=0||placement.trim<0||placement.start+placement.duration>scene.duration+.001)throw new Error('A planned file placement has invalid timing or identity. Review the shot outline.');
  ids.add(placement.id);
  let prepared=resolved.get(placement.attachmentId);
  if(!prepared){const source=await Store.getAttachment(projectId,placement.attachmentId);if(!source)throw new Error('A planned file is missing or belongs to another film. Its shot was not changed.');const asset=await Store.ensureAttachmentMedia(projectId,placement.attachmentId);prepared={asset,name:source.name,...(asset.kind==='image'?{}:{duration:await probe(source.data,asset.kind,signal)})};resolved.set(placement.attachmentId,prepared)}
  const {asset,duration}=prepared;
  if(duration!==undefined&&placement.trim+placement.duration>duration+.05)throw new Error(`${prepared.name} is shorter than its planned placement. Shorten the placement or choose another file; the original is saved.`);
  layers.push({...newLayer(asset,scene.duration),id:placement.id,start:placement.start,duration:placement.duration,trim:placement.trim,width:100,volume:1,fadeIn:0,fadeOut:0,loop:false});
 }
 return layers;
}
