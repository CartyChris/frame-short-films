import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
import {strToU8,zipSync} from 'fflate';
import {newProject} from '../src/lib/defaults';
import {createArchive,getAttachments,importArchive,putAttachment,saveProject,uid} from '../src/lib/storage';
import {validateVorkDraft} from '../src/lib/three/vork-draft';
vi.stubGlobal('FileReader',class {result:string|undefined;error:unknown;onload?:()=>void;onerror?:()=>void;readAsDataURL(blob:Blob){void blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;this.onload?.()}).catch(error=>{this.error=error;this.onerror?.()})}});
it('restores the original Vork package and its edited source with a remapped attachment ID',async()=>{const p=newProject('Vork source'),id=uid(),data=new Blob([zipSync({'scene.json':strToU8('{}'),'look.slang':strToU8('original')}) as Uint8Array<ArrayBuffer>],{type:'application/zip'});await saveProject(p);await putAttachment({id,projectId:p.id,name:'source.zip',mime:data.type,size:data.size,createdAt:1,data});p.vorkDraft={attachmentId:id,scenePath:'scene.json',edits:{'look.slang':'edited shader'}};await saveProject(p);const restored=await importArchive(await createArchive(p));expect(restored.vorkDraft?.attachmentId).not.toBe(id);expect(restored.vorkDraft?.edits['look.slang']).toBe('edited shader');expect((await getAttachments(restored.id)).some(a=>a.id===restored.vorkDraft?.attachmentId)).toBe(true)});
it('rejects unsafe or oversized edited source',()=>{expect(()=>validateVorkDraft({attachmentId:'a',scenePath:'scene.json',edits:{'../bad.slang':'x'}})).toThrow();expect(()=>validateVorkDraft({attachmentId:'a',scenePath:'scene.json',edits:{'scene.json':'x'.repeat(512*1024+1)}})).toThrow()});
