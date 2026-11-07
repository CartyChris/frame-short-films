import {describe,expect,it} from 'vitest';
import {freefieldDefaults,parseFreefieldCatalog,validateFreefieldValues} from '../src/lib/freefield';

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
});
