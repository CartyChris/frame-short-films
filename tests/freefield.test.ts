import {describe,expect,it} from 'vitest';
import {freefieldDefaults,normalizeFreefieldJob,parseFreefieldCatalog,snapshotFreefieldRequest,unresolvedFreefieldRequest,validateFreefieldValues} from '../src/lib/freefield';
import {emptyProductionTools,remapProductionToolsDocument} from '../src/lib/production-tools';

const fixture={id:'sound-effects',name:'Sound effects',section:'audio',status:'ready',runnable:true,summary:'Create audio',inputs:[
 {id:'prompt',type:'textarea',label:'Description',required:true,default:'rain'},
 {id:'seconds',type:'slider',label:'Seconds',min:1,max:180,default:20},
 {id:'layers',type:'select',label:'Layers',multiple:{max:2,ordered:true},options:[{value:'wind',label:'Wind'},{value:'rain',label:'Rain'},{value:'birds',label:'Birds'}],default:['rain']},
 {id:'reference',type:'audio',label:'Reference',limits:{max_mb:1}},
 ],outputs:[{type:'audio',label:'Sound'}],models:[{name:'audio-model',gb:9.2,license:'Community',gated:true}],credits:['Model creator']};

describe('Freefield catalog and inputs',()=>{
 it('normalizes a public manifest and preserves editable defaults',()=>{
  const {apps,rejected}=parseFreefieldCatalog({apps:[fixture]});expect(rejected).toBe(0);expect(apps[0].runnable).toBe(true);expect(apps[0].models[0].license).toBe('Community');
  expect(freefieldDefaults(apps[0])).toMatchObject({prompt:'rain',seconds:20,layers:['rain']});expect(()=>validateFreefieldValues(apps[0],freefieldDefaults(apps[0]))).not.toThrow();
 });
 it('rejects malformed, duplicate, unbounded and unsupported input manifests',()=>{
  const bad={...fixture,id:'bad',inputs:[{id:'payload',type:'script',label:'Run'}]};
  const {apps,rejected}=parseFreefieldCatalog({apps:[fixture,fixture,bad]});expect(apps).toHaveLength(1);expect(rejected).toBe(2);
  expect(()=>parseFreefieldCatalog({apps:Array(501).fill(fixture)})).toThrow(/oversized/);
 });
 it('checks required, numeric, selected and file inputs before submit',()=>{
  const [app]=parseFreefieldCatalog({apps:[fixture]}).apps;const values=freefieldDefaults(app);
  expect(()=>validateFreefieldValues(app,{...values,prompt:''})).toThrow(/required/);
  expect(()=>validateFreefieldValues(app,{...values,seconds:181})).toThrow(/range/);
  expect(()=>validateFreefieldValues(app,{...values,layers:['wind','rain','birds']})).toThrow(/selection/);
  expect(()=>validateFreefieldValues(app,{...values,reference:new File([new Uint8Array(1024*1024+1)],'large.wav',{type:'audio/wav'})})).toThrow(/no larger/);
  expect(()=>validateFreefieldValues(app,{...values,unknown:'x'})).toThrow(/Unknown/);
 });
 it('never treats a raw manifest without a runtime runnable flag as ready to run',()=>{
  const {runnable,...manifest}=fixture;expect(runnable).toBe(true);expect(parseFreefieldCatalog({apps:[manifest]}).apps[0].runnable).toBe(false);
 });
 it('blocks restored local requests until explicit acknowledgement, but accepts server IDs',()=>{
  const starting={id:'12345678-1234-4234-8234-123456789abc',requestId:'12345678-1234-4234-8234-123456789abc',identity:'local' as const,appId:'sound-effects',status:'starting' as const,outputs:[]};
  expect(unresolvedFreefieldRequest(starting)).toBe(true);
  expect(unresolvedFreefieldRequest({...starting,status:'unknown'})).toBe(true);
  expect(unresolvedFreefieldRequest({...starting,status:'unknown',acknowledged:true})).toBe(false);
  expect(unresolvedFreefieldRequest({...starting,identity:'server'})).toBe(false);
 });
 it('bounds saved run identities and output references before restoring a backup',()=>{
  const requestId='12345678-1234-4234-8234-123456789abc';
  const record={id:'20261106-123456789-abcd',requestId,identity:'server',appId:'sound-effects',status:'succeeded',outputs:[{id:'out-1.wav',name:'Sound',type:'audio'}]};
  expect(normalizeFreefieldJob(record).requestId).toBe(requestId);
  expect(()=>normalizeFreefieldJob({...record,outputs:[{id:'../secret',name:'Secret',type:'audio'}]})).toThrow();
  expect(()=>normalizeFreefieldJob({...record,requestId:'not-a-uuid'})).toThrow();
  expect(()=>normalizeFreefieldJob({...record,identity:'local'})).toThrow();
  expect(()=>normalizeFreefieldJob({...record,outputs:Array(33).fill(record.outputs[0])})).toThrow();
 });
 it('retains prompt, preset and original file identity and remaps that identity on import',()=>{
  const requestId='12345678-1234-4234-8234-123456789abc';const request={requestId,appId:'sound-effects',preset:'gentle',values:{prompt:'Night rain',reference:new File(['original'],'rain.wav',{type:'audio/wav'})}};
  const snapshot=snapshotFreefieldRequest(request,{reference:'asset-original'});expect(snapshot.values.prompt).toBe('Night rain');expect(snapshot.preset).toBe('gentle');
  expect(()=>snapshotFreefieldRequest(request,{})).toThrow(/retained/);
  const job={id:requestId,requestId,identity:'local' as const,appId:request.appId,status:'unknown' as const,outputs:[],snapshot};
  const doc={...emptyProductionTools(),freefieldJobs:[{serverUrl:'http://127.0.0.1:3000',job}]};
  const restored=remapProductionToolsDocument(doc,{assetId:id=>`copy-${id}`});expect(restored.freefieldJobs?.[0].job.snapshot?.files.reference).toBe('copy-asset-original');expect(restored.freefieldJobs?.[0].job.snapshot?.values.prompt).toBe('Night rain');
 });
 it('accepts a discovered empty-string option as a real choice',()=>{
  const app=parseFreefieldCatalog({apps:[{...fixture,inputs:[{id:'style',label:'Style',type:'select',required:true,options:[{value:'',label:'Any'},{value:'dramatic',label:'Dramatic'}],default:''}]}]}).apps[0];
  expect(()=>validateFreefieldValues(app,freefieldDefaults(app))).not.toThrow();
 });
});
