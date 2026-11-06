import 'fake-indexeddb/auto';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {generateScene} from '../src/lib/generation';
import {appendChunk,getDraft,getProject,getRun,resetDbForTest,saveProject,saveRun} from '../src/lib/storage';
import {appendProductionQueue,approveProductionPlan,recoverProductionQueues,revisionQueue,setProductionItemState} from '../src/lib/production';
import {emptyStory} from '../src/lib/story';
import type {GenerationRun,Project,ProviderConnection} from '../src/lib/types';
const project=():Project=>({id:crypto.randomUUID(),name:'Durable feature',createdAt:0,updatedAt:0,brief:'A coherent story.',settings:{width:1920,height:1080,fps:30,background:'#000',volume:1},audio:[],story:emptyStory(7200),scenes:[{id:crypto.randomUUID(),title:'Opening',duration:60,code:'<html>Original source</html>',notes:'',transition:'cut',color:'#000',layers:[]}]});
const connection=(provider='openrouter'):ProviderConnection=>({id:provider,provider,name:provider,model:'test-model',apiKey:'not-a-real-key',temperature:1,maxTokens:1000});
const response=(events:unknown[])=>new Response(events.map(v=>JSON.stringify(v)).join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson'}});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('durable long-film iteration',()=>{
 it('persists a partial JSON plan and continues it with another provider without losing the prefix',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});const p=project(),prefix='{"title":"Long film","scope":"new","scenes":[',suffix=']}',controller=new AbortController();let first:GenerationRun|undefined;
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(response([{type:'delta',text:prefix}])).mockResolvedValueOnce(response([{type:'delta',text:suffix},{type:'done',finishReason:'stop'}]));
  await expect(generateScene({project:p,scene:p.scenes[0],connection:connection(),format:'story-plan',prompt:'Plan two hours.',signal:controller.signal,onStart:r=>{first=r},onDelta:()=>{}})).rejects.toThrow('ended early');
  expect((await getRun(first!.id))?.purpose).toBe('plan');expect((await getRun(first!.id))?.format).toBe('story-plan');expect(await getDraft(first!)).toBe(prefix);
  await resetDbForTest();const next=await generateScene({project:p,scene:p.scenes[0],connection:connection('venice'),prompt:'Plan two hours.',parent:first,signal:controller.signal,onStart:()=>{},onDelta:()=>{}});
  expect(next.text).toBe(prefix+suffix);expect(next.run.format).toBe('story-plan');expect(await getDraft(first!)).toBe(prefix);const request=JSON.parse(String(fetcher.mock.calls[1][1]?.body));expect(request.provider).toBe('venice');expect(request.messages.some((m:{role:string;content:string})=>m.role==='assistant'&&m.content===prefix)).toBe(true);
 });
 it('links a queued generation durably before the upstream request and recovers interruption',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});const p=project(),queue=revisionQueue(p,'Improve the entire film');let current=approveProductionPlan(appendProductionQueue(p,queue),queue.id);const item=queue.items[0];let savedRun:GenerationRun|undefined;
  await saveProject(current);
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{const persisted=await getProject(p.id);expect(persisted!.production![0].items[0].runId).toBe(savedRun!.id);expect(persisted!.production![0].items[0].status).toBe('running');return response([{type:'delta',text:'<html>Saved partial'}]);});
  await expect(generateScene({project:current,scene:current.scenes[0],connection:connection(),prompt:'Revise opening',queueId:queue.id,queueItemId:item.id,signal:new AbortController().signal,onStart:async r=>{savedRun=r;current=setProductionItemState(current,queue.id,item.id,'running',{runId:r.id});await saveProject(current)},onDelta:()=>{}})).rejects.toThrow();
  await resetDbForTest();const recovered=recoverProductionQueues((await getProject(p.id))!);expect(recovered.production![0].status).toBe('paused');expect(recovered.production![0].items[0].status).toBe('interrupted');expect(recovered.production![0].items[0].runId).toBe(savedRun!.id);expect(await getDraft(savedRun!)).toBe('<html>Saved partial');expect(recovered.scenes[0].code).toBe('<html>Original source</html>');
 });
 it('does not call a provider if persisting the queue link fails',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});const p=project(),fetcher=vi.spyOn(globalThis,'fetch');let run:GenerationRun|undefined;
  await expect(generateScene({project:p,scene:p.scenes[0],connection:connection(),prompt:'Make scene',signal:new AbortController().signal,onStart:async r=>{run=r;throw new Error('Disk full')},onDelta:()=>{}})).rejects.toThrow('Disk full');expect(fetcher).not.toHaveBeenCalled();expect((await getRun(run!.id))?.status).toBe('interrupted');
 });
 it('keeps 3D JSON output and the original scene separate in the existing journal',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});const p=project(),json='{"version":1,"duration":60,"instances":[]}';vi.spyOn(globalThis,'fetch').mockResolvedValue(response([{type:'delta',text:json},{type:'done',finishReason:'stop'}]));
  const result=await generateScene({project:p,scene:p.scenes[0],connection:connection(),format:'three-scene',prompt:'Animate reusable models',signal:new AbortController().signal,onStart:()=>{},onDelta:()=>{}});expect(result.run.format).toBe('three-scene');expect(await getDraft(result.run)).toBe(json);expect(p.scenes[0].code).toBe('<html>Original source</html>');
 });
});
