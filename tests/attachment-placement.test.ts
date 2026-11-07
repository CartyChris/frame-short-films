import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {attachmentLayers} from '../src/lib/attachment-placement';
import * as Store from '../src/lib/storage';
import type {FilmAttachment,Scene} from '../src/lib/types';

const id=()=>crypto.randomUUID();
const shot=():Scene=>({id:id(),title:'Shot',duration:5,code:'',notes:'',transition:'cut',color:'#000',layers:[]});
function attachment(projectId:string,mime='image/png'):FilmAttachment{const data=new Blob(['original bytes'],{type:mime});return {id:id(),projectId,name:'Original file',mime,size:data.size,createdAt:Date.now(),data}}
beforeEach(()=>vi.stubGlobal('FileReader',class{result:string|undefined;onload?:()=>void;onerror?:()=>void;readAsDataURL(blob:Blob){void blob.arrayBuffer().then(data=>{this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(data).toString('base64')}`;this.onload?.()}).catch(()=>this.onerror?.())}}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()});
describe('approved attachment placements',()=>{
 it('materializes the same original once even when two requests race',async()=>{
  const projectId=id(),file=attachment(projectId);await Store.putAttachment(file);
  const [a,b]=await Promise.all([Store.ensureAttachmentMedia(projectId,file.id),Store.ensureAttachmentMedia(projectId,file.id)]);
  expect(a.id).toBe(b.id);expect(a.data).toBe('data:image/png;base64,b3JpZ2luYWwgYnl0ZXM=');
  expect((await Store.getAttachments(projectId))[0].assetId).toBe(a.id);
  await expect(Store.ensureAttachmentMedia(id(),file.id)).rejects.toThrow('another film');
 });
 it('retains original media and reports invalid source timing instead of truncating',async()=>{
  const projectId=id(),file=attachment(projectId,'audio/wav'),scene=shot();await Store.putAttachment(file);
  const placement={id:id(),attachmentId:file.id,start:1,duration:3,trim:0};
  await expect(attachmentLayers(projectId,scene,[placement],new AbortController().signal,async()=>2)).rejects.toThrow('shorter');
  expect((await Store.getAttachments(projectId))[0].data.size).toBe(file.size);
  const layers=await attachmentLayers(projectId,scene,[placement],new AbortController().signal,async()=>4);
  expect(layers[0]).toMatchObject({id:placement.id,start:1,duration:3,trim:0,volume:1,fadeIn:0,fadeOut:0,loop:false});
 });
 it('rejects duplicate identities and unsupported files before changing a scene',async()=>{
  const projectId=id(),file=attachment(projectId,'text/plain'),scene=shot();await Store.putAttachment(file);
  const placement={id:id(),attachmentId:file.id,start:0,duration:1,trim:0};
  await expect(attachmentLayers(projectId,scene,[placement],new AbortController().signal)).rejects.toThrow('not supported');
  const image=attachment(projectId);await Store.putAttachment(image);const duplicate={...placement,attachmentId:image.id};
  await expect(attachmentLayers(projectId,scene,[duplicate,duplicate],new AbortController().signal)).rejects.toThrow('invalid timing or identity');
  expect(scene.layers).toEqual([]);
 });
});
