import {afterEach,describe,expect,it,vi} from 'vitest';
import {base,generationResponse,listModels,validateGenerate} from '../server/providers';
import {consumeGeneration} from '../server/stream';

afterEach(()=>vi.restoreAllMocks());
describe('Kimi API and local subscription boundaries',()=>{
 it('uses the official Moonshot API endpoint and preserves ordinary API billing separation',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}}));
  const request=validateGenerate({provider:'moonshot',apiKey:'test-key',model:'kimi-model-selected-by-user',messages:[{role:'user',content:'Return the requested scene'}],maxTokens:2048});
  await generationResponse(request);
  expect(fetcher.mock.calls[0][0]).toBe('https://api.moonshot.ai/v1/chat/completions');
  const init=fetcher.mock.calls[0][1]!;
  expect(JSON.parse(String(init.body))).toMatchObject({model:'kimi-model-selected-by-user',stream:true,max_tokens:2048});
  expect(init.headers).toMatchObject({Authorization:'Bearer test-key'});
 });
 it('loads the actual Kimi catalog rather than presenting hardcoded model availability',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{id:'kimi-test',object:'model',context_length:100000}]}),{headers:{'content-type':'application/json'}}));
  const result=await listModels({provider:'moonshot',apiKey:'test-key'});
  expect(fetcher.mock.calls[0][0]).toBe('https://api.moonshot.ai/v1/models');
  expect(result.models[0]).toMatchObject({id:'kimi-test',contextLength:100000});
 });
 it('rejects local subscription IDs at the hosted API boundary',()=>{
  for(const provider of ['codex','claude-code','zai-coding','kimi-code','grok-build','custom-cli','cli:my-tool'])expect(()=>base(provider)).toThrow(/local companion/);
  expect(base('zai')).toBe('https://api.z.ai/api/paas/v4');
 });
 it('keeps received Kimi API text when the upstream stream is cut off',async()=>{
  const events:unknown[]=[];
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"saved 🌿"}}]}\n\n'));c.close();}});
  await consumeGeneration(stream,'moonshot',e=>{events.push(e);});
  expect(events[0]).toEqual({type:'delta',text:'saved 🌿'});
  expect(events.at(-1)).toMatchObject({type:'error'});
 });
});
