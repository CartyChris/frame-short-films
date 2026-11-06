import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {downloadMediaDescriptor,generateImage} from '../src/lib/media-client';
import type {ProviderConnection} from '../src/lib/types';

const connection=(provider='openrouter'):ProviderConnection=>({id:'test',provider,name:provider,model:'image-model',apiKey:'private-test-key',temperature:1,maxTokens:1000});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const imageDescriptor=(provider='openrouter')=>({provider,directKind:'image',download:{url:provider==='openrouter'?'https://openrouter.ai/api/v1/images':'https://api.venice.ai/api/v1/image/generate',method:'POST',auth:'bearer',body:{model:'image-model',prompt:'Paper city'},mime:'application/json'}});
const videoDescriptor=(url='https://openrouter.ai/api/v1/videos/job-123/content?index=0',auth='bearer',method='GET',body?:unknown)=>({download:{url,auth,method,body,mime:'video/mp4'}});
let mockFetch:ReturnType<typeof vi.fn>;
beforeEach(()=>{mockFetch=vi.fn();vi.stubGlobal('fetch',mockFetch);vi.stubGlobal('localStorage',{getItem:()=>null});});
afterEach(()=>vi.unstubAllGlobals());

describe('direct image transport',()=>{
  it('preserves a response larger than the Vercel function response limit',async()=>{
    const large='A'.repeat(5_000_000);
    mockFetch.mockResolvedValueOnce(json(imageDescriptor())).mockResolvedValueOnce(json({data:[{b64_json:large,media_type:'image/png'}]}));
    const images=await generateImage(connection(),{model:'image-model',prompt:'Paper city',aspectRatio:'16:9'});
    expect(images).toEqual([{data:'data:image/png;base64,'+large,mime:'image/png'}]);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({action:'image',provider:'openrouter',direct:true,aspectRatio:'16:9'});
    expect(mockFetch.mock.calls[1]).toEqual(['https://openrouter.ai/api/v1/images',expect.objectContaining({headers:{Authorization:'Bearer private-test-key','Content-Type':'application/json'},redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'})]);
  });
  it('normalizes Venice image arrays and existing data URLs',async()=>{
    mockFetch.mockResolvedValueOnce(json(imageDescriptor('venice'))).mockResolvedValueOnce(json({images:['YWJj','data:image/webp;base64,ZGVm']}));
    expect(await generateImage(connection('venice'),{model:'image-model',prompt:'Paper city',width:1024,height:1024})).toEqual([{data:'data:image/png;base64,YWJj',mime:'image/png'},{data:'data:image/webp;base64,ZGVm',mime:'image/webp'}]);
  });
  it('accepts embedded images from compatible local gateways without another fetch',async()=>{
    mockFetch.mockResolvedValueOnce(json({images:[{data:'data:image/png;base64,YWJj',mime:'image/png'}]}));
    expect(await generateImage(connection(),{model:'image-model',prompt:'Paper city'})).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it.each(['https://openrouter.ai.attacker.example/api/v1/images','https://api.venice.ai/api/v1/image/generate','http://openrouter.ai/api/v1/images','https://openrouter.ai:444/api/v1/images','https://secret@openrouter.ai/api/v1/images','https://openrouter.ai/api/v1/images?extra=1','https://openrouter.ai/api/v1/chat/completions'])('never forwards a key to an unexpected address: %s',async url=>{
    const result=imageDescriptor();result.download.url=url;mockFetch.mockResolvedValueOnce(json(result));
    await expect(generateImage(connection(),{model:'image-model',prompt:'Paper city'})).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a descriptor from a different selected provider',async()=>{
    mockFetch.mockResolvedValueOnce(json(imageDescriptor('venice')));
    await expect(generateImage(connection(),{model:'image-model',prompt:'Paper city'})).rejects.toThrow('different provider');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it('surfaces HTTP 200 provider errors and redacts the key',async()=>{
    mockFetch.mockResolvedValueOnce(json(imageDescriptor())).mockResolvedValueOnce(json({error:{message:'Invalid private-test-key'}}));
    await expect(generateImage(connection(),{model:'image-model',prompt:'Paper city'})).rejects.toThrow('Invalid [redacted]');
  });
  it('fails clearly for an empty image result',async()=>{
    mockFetch.mockResolvedValueOnce(json(imageDescriptor())).mockResolvedValueOnce(json({data:[]}));
    await expect(generateImage(connection(),{model:'image-model',prompt:'Paper city'})).rejects.toThrow('no image data');
  });
  it('does not follow image URLs embedded instead of image data',async()=>{
    mockFetch.mockResolvedValueOnce(json(imageDescriptor())).mockResolvedValueOnce(json({data:[{b64_json:'https://attacker.example/pixel'}]}));
    await expect(generateImage(connection(),{model:'image-model',prompt:'Paper city'})).rejects.toThrow('unsupported image format');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('direct video downloads',()=>{
  it('fetches OpenRouter video with a bearer key and no redirects',async()=>{
    mockFetch.mockResolvedValueOnce(new Response('video-bytes',{headers:{'Content-Type':'video/mp4'}}));
    const blob=await downloadMediaDescriptor(connection(),videoDescriptor());
    expect(blob.type).toBe('video/mp4');expect(await blob.text()).toBe('video-bytes');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({headers:{Authorization:'Bearer private-test-key'},redirect:'error',credentials:'omit'});
  });
  it('never adds the Venice API key to a signed private-share URL',async()=>{
    mockFetch.mockResolvedValueOnce(new Response('video-bytes',{headers:{'Content-Type':'video/mp4'}}));
    await downloadMediaDescriptor(connection('venice'),videoDescriptor('https://private-share.venice.ai/v1/share/read/asset-123?signature=abc','none'));
    expect(mockFetch.mock.calls[0][1].headers).toEqual({});
  });
  it('rejects credentials requested by a Venice share descriptor',async()=>{
    await expect(downloadMediaDescriptor(connection('venice'),videoDescriptor('https://private-share.venice.ai/v1/share/read/asset-123','bearer'))).rejects.toThrow('unexpected provider endpoint');
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('posts the saved Venice job ID to the official retrieval endpoint',async()=>{
    mockFetch.mockResolvedValueOnce(new Response('video-bytes',{headers:{'Content-Type':'video/mp4'}}));
    await downloadMediaDescriptor(connection('venice'),videoDescriptor('https://api.venice.ai/api/v1/video/retrieve','bearer','POST',{model:'video-model',queue_id:'job-123'}));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({model:'video-model',queue_id:'job-123'});
  });
  it.each(['https://openrouter.ai/api/v1/videos/%2Fadmin/content?index=0','https://openrouter.ai/api/v1/videos/job/content?index=1','https://evil.example/video.mp4','https://private-share.venice.ai.evil.example/v1/share/read/job'])('rejects arbitrary download addresses: %s',async url=>{
    await expect(downloadMediaDescriptor(connection(),videoDescriptor(url))).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('retains a retryable processing result instead of storing JSON as video',async()=>{
    mockFetch.mockResolvedValueOnce(json({status:'PROCESSING'}));
    await expect(downloadMediaDescriptor(connection('venice'),videoDescriptor('https://api.venice.ai/api/v1/video/retrieve','bearer','POST',{model:'video-model',queue_id:'job-123'}))).rejects.toThrow('still processing');
  });
  it('recognizes MP4 in an octet-stream response',async()=>{
    const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
    mockFetch.mockResolvedValueOnce(new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));
    const blob=await downloadMediaDescriptor(connection(),videoDescriptor());
    expect(blob.type).toBe('video/mp4');expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });
  it('rejects unrecognizable octet-stream content',async()=>{
    mockFetch.mockResolvedValueOnce(new Response('<html>error</html>',{headers:{'Content-Type':'application/octet-stream'}}));
    await expect(downloadMediaDescriptor(connection(),videoDescriptor())).rejects.toThrow('recognizable video');
  });
  it('rejects HTML and empty video responses',async()=>{
    mockFetch.mockResolvedValueOnce(new Response('<html>error</html>',{headers:{'Content-Type':'text/html'}}));
    await expect(downloadMediaDescriptor(connection(),videoDescriptor())).rejects.toThrow('non-video');
    mockFetch.mockResolvedValueOnce(new Response('',{headers:{'Content-Type':'video/mp4'}}));
    await expect(downloadMediaDescriptor(connection(),videoDescriptor())).rejects.toThrow('empty');
  });
  it('explains browser failures without losing the job identity in caller state',async()=>{
    const result=videoDescriptor();mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(downloadMediaDescriptor(connection(),result)).rejects.toThrow('Saved video jobs can be retried');
    expect(result.download.url).toContain('job-123');
  });
});
