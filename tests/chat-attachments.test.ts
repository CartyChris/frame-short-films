import {describe,it,expect} from 'vitest';
import {attachmentContext,isTextAttachment,mediaKind,projectAttachmentContext} from '../src/lib/chat-attachments';
import type {FilmAttachment,Project} from '../src/lib/types';
const a=(name:string,mime:string,data:Blob):FilmAttachment=>({id:name,projectId:'p',name,mime,size:data.size,createdAt:1,data});
describe('original chat file references',()=>{
 it('shares a bounded text excerpt and leaves the complete original bytes intact',async()=>{const original='START '+('x'.repeat(18000))+' END',item=a('game.html','text/html',new Blob([original],{type:'text/html'}));const record=JSON.parse(await attachmentContext([item]))[0];expect(record.excerpt).toHaveLength(12000);expect(record.truncated).toBe(true);expect(await item.data.text()).toBe(original);expect(isTextAttachment(item)).toBe(true)});
 it('labels unparsed binary honestly and retains linked media identity without encoding bytes in context',async()=>{const item={...a('movie.mp4','video/mp4',new Blob([new Uint8Array([0,1,2,3])])),assetId:'asset-1'};const context=await attachmentContext([item]),row=JSON.parse(context)[0];expect(row).toMatchObject({name:'movie.mp4',size:4,assetId:'asset-1'});expect(row.analysis).toContain('not viewed or heard');expect(context).not.toContain('AAECAw');expect(mediaKind(item.mime)).toBe('video')});
 it('includes reference content in later scene context as untrusted, not executable instructions',()=>{const project={chat:{version:1,messages:[{id:'m',role:'user',createdAt:1,attachmentContext:'[{"name":"source.html"}]'}]}} as Project;const result=projectAttachmentContext(project);expect(result).toContain('untrusted source content');expect(result).toContain('source.html')});
});
