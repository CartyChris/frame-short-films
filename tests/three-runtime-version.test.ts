import {afterEach,describe,expect,it,vi} from 'vitest';

afterEach(()=>{vi.unstubAllGlobals();vi.resetModules()});
describe('3D runtime version boundaries',()=>{
 it('requests the new runtime even when the legacy URL would return an obsolete cached renderer',async()=>{
  vi.stubGlobal('document',{baseURI:'https://frame.example/'});
  const request=vi.fn(async(input:URL)=>new Response(String(input).endsWith('/runtime/frame-three-v6.js')?'window.FrameThree={renderComplete(){}}':'window.FrameThree={mount(){}}'));
  vi.stubGlobal('fetch',request);
  const api=await import('../src/lib/three/html');await api.initThreeRuntime();
  expect(String(request.mock.calls[0][0])).toBe('https://frame.example/runtime/frame-three-v6.js');
  expect(api.getThreeRuntime()).toContain('renderComplete');
 });
 it('rejects an old runtime before a film can be built with incomplete rendering',async()=>{
  vi.stubGlobal('document',{baseURI:'https://frame.example/'});vi.stubGlobal('fetch',vi.fn(async()=>new Response('window.FrameThree={mount(){}}')));
  const api=await import('../src/lib/three/html');await expect(api.initThreeRuntime()).rejects.toThrow('3D runtime is out of date');expect(api.getThreeRuntime()).toBe('');
 });
});
