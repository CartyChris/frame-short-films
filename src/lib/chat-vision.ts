import type {DirectorMessage} from './chat-types';
import type {FilmAttachment,ProviderConnection} from './types';
import {getAttachments} from './storage';
export const CHAT_VISION_MAX_IMAGES=3,CHAT_VISION_MAX_BYTES=750*1024;
const supported=new Set(['image/png','image/jpeg','image/webp']);
function matchesMime(bytes:Uint8Array,mime:string){return mime==='image/png'?bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n):mime==='image/jpeg'?bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/webp'?bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP':false}
function base64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary)}
/** Only explicitly opted-in images from the original saved user message leave the device. */
export async function loadDirectorImages(projectId:string,user:DirectorMessage|undefined,connection:ProviderConnection,load:(projectId:string)=>Promise<FilmAttachment[]>=getAttachments):Promise<string[]>{
 const ids=user?.visionAttachmentIds||[];if(!ids.length)return [];if(connection.provider!=='openrouter')throw new Error('This reply includes images explicitly shared with OpenRouter. Continue with an OpenRouter vision model, or start a new text-only message.');
 if(ids.length>CHAT_VISION_MAX_IMAGES||new Set(ids).size!==ids.length||!user?.attachmentIds||ids.some(id=>!user.attachmentIds!.includes(id)))throw new Error('The saved image selection is invalid. Your original files are preserved.');
 const files=await load(projectId),chosen=ids.map(id=>files.find(f=>f.id===id));if(chosen.some(f=>!f||f.projectId!==projectId))throw new Error('A shared image is missing. Reattach it in a new message; no image was sent.');
 const items=chosen as FilmAttachment[];if(items.some(f=>!supported.has(f.mime)||f.size!==f.data.size||f.size<1)||items.reduce((n,f)=>n+f.size,0)>CHAT_VISION_MAX_BYTES)throw new Error('Choose up to three PNG, JPEG, or WebP images totaling at most 750 KiB. Originals remain saved.');
 const result:string[]=[];for(const f of items){const bytes=new Uint8Array(await f.data.arrayBuffer());if(!matchesMime(bytes,f.mime))throw new Error('A selected image does not match its file type. Originals remain saved.');result.push(`data:${f.mime};base64,${base64(bytes)}`)}return result;
}
