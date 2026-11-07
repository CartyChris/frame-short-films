import {test,expect} from '@playwright/test';
import {build} from '../tests/helpers/browser-build';
import {createServer,type Server} from 'node:http';
import {mkdir} from 'node:fs/promises';
let server:Server,origin='';
test.beforeAll(async()=>{
  const bundle=await build({stdin:{contents:`import React,{useState,useEffect,useRef} from 'react';import {createRoot} from 'react-dom/client';import {SoundStudio} from './src/components/SoundStudio';import {composeSoundtrack} from './src/lib/sound/compose';import {renderSoundtrack} from './src/lib/sound/render';import {SYNTH_ENGINES} from './src/lib/sound/pulseforge/src/engine/instruments';import {EFFECT_DEFS} from './src/lib/sound/pulseforge/src/engine/effects';import * as Store from './src/lib/storage';import './src/styles/app.css';window.sound={composeSoundtrack,renderSoundtrack,SYNTH_ENGINES,EFFECT_DEFS,Store};const initial={id:'sound-film',name:'A paper adventure',createdAt:0,updatedAt:0,brief:'',settings:{width:1280,height:720,fps:24,background:'#000',volume:1},audio:[],scenes:[{id:'scene',title:'Original',duration:30,code:'original',notes:'',transition:'cut',color:'#000',layers:[]}]};function App(){const [project,setProject]=useState(null),[assets,setAssets]=useState([]);const ref=useRef(project);ref.current=project;useEffect(()=>{Promise.all([Store.getProject(initial.id),Store.getAssets()]).then(([p,a])=>{setProject(p||initial);setAssets(a)})},[]);function edit(fn){const next=fn(ref.current);ref.current=next;setProject(next);Store.saveProject(next)}window.project=project;if(!project)return null;return <SoundStudio project={project} assets={assets} connections={[{id:'speech',name:'Test speech',provider:'openai',model:'manual',apiKey:'fixture-key',temperature:1,maxTokens:1000}]} connectionId='speech' onConnectionChange={()=>{}} onConnect={()=>{}} recording={false} onRecord={()=>{}} onChange={(soundtrack,id)=>{if(id===ref.current.id)edit(p=>({...p,soundtrack}))}} onEditProject={edit} onAddAudio={async result=>{if(window.failAudioSave)throw new Error('Simulated film save failure');const asset={id:Store.uid(),name:result.name,kind:'audio',mime:result.blob.type,data:await Store.fileData(result.blob),duration:result.duration,createdAt:Date.now()};await Store.putAsset(asset);setAssets(a=>[...a,asset]);edit(p=>({...p,audio:[...p.audio,{id:Store.uid(),name:result.name,assetId:asset.id,start:0,duration:result.duration,trim:0,volume:1,fadeIn:0,fadeOut:0,loop:result.loop,muted:false,opacity:1,fit:'cover',blend:'normal'}]}))}}/>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},outfile:'sound.js',external:['/fonts/*'],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env.VITE_API_ORIGIN':'""'}});
  const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text;
  server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/sound.js'?'text/javascript':req.url==='/sound.css'?'text/css':'text/html');res.end(req.url==='/sound.js'?js:req.url==='/sound.css'?css:`<html><head><link rel="stylesheet" href="/sound.css"><style>#root{height:100dvh;width:100%;display:flex;overflow:hidden}</style></head><body><div id="root"></div><script src="/sound.js"></script></body></html>`)});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
});
test.afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))});

test('PulseForge instruments and mixer really render a non-silent portable film cue',async({page})=>{
  test.setTimeout(90000);await page.goto(origin);
  const rendered=await page.evaluate(async()=>{
    const {composeSoundtrack,renderSoundtrack}=(window as any).sound;
    const source=composeSoundtrack({prompt:'Warm piano',genre:'lofi',mood:'warm',bpm:120,key:'C',seed:71,bars:1,parts:['drums','chords','melody']});
    const before=JSON.stringify(source),result=await renderSoundtrack(source,{loop:true});
    const bytes=await result.blob.arrayBuffer(),v=new DataView(bytes);let samplePeak=0,nonzero=0;
    for(let i=44;i<bytes.byteLength;i+=2){const value=Math.abs(v.getInt16(i,true));samplePeak=Math.max(samplePeak,value);if(value>30)nonzero++}
    return {duration:result.duration,peak:result.peak,waveform:Math.max(...result.peaks),nonzero,samplePeak,bytes:bytes.byteLength,channels:v.getUint16(22,true),rate:v.getUint32(24,true),unchanged:before===JSON.stringify(source)};
  });
  expect(rendered.duration).toBeCloseTo(2,3);expect(rendered.peak).toBeGreaterThan(.01);expect(rendered.peak).toBeLessThanOrEqual(.981);
  expect(rendered.nonzero).toBeGreaterThan(10000);expect(rendered.samplePeak).toBeGreaterThan(1000);expect(rendered.waveform).toBeGreaterThan(.01);
  expect(rendered.channels).toBe(2);expect(rendered.rate).toBe(44100);expect(rendered.bytes).toBe(44+2*44100*2*2);expect(rendered.unchanged).toBe(true);
});

test('oversized renders fail before allocating a long audio buffer',async({page})=>{
  await page.goto(origin);const message=await page.evaluate(async()=>{
    const {composeSoundtrack,renderSoundtrack}=(window as any).sound;
    const source=composeSoundtrack({prompt:'Piano',genre:'lofi',mood:'warm',bpm:50,key:'C',seed:71,bars:32,parts:['chords']});
    try{await renderSoundtrack(source);return 'unexpected success'}catch(e){return (e as Error).message}
  });expect(message).toContain('up to 2 minutes');
});

test('edits a score, renders it, saves an audio layer, and keeps the editable source after reload',async({page})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
  await page.getByLabel('Bars',{exact:true}).fill('1');await page.getByRole('button',{name:'Compose score',exact:true}).click();
  await page.getByRole('button',{name:'Piano roll',exact:true}).click();await expect(page.getByRole('combobox',{name:'Piano-roll instrument',exact:true})).toBeVisible();
  const source=await page.evaluate(()=>(window as any).project.soundtrack);expect(source.project.channels.length).toBeGreaterThan(3);
  const grid=page.getByRole('application',{name:'Piano roll note grid'});await grid.click({position:{x:130,y:550}});
  await expect(page.getByLabel('Pitch',{exact:true})).toBeVisible();await page.getByLabel('Pitch',{exact:true}).fill('50');
  await page.getByRole('button',{name:'Preview score',exact:true}).click();await page.getByRole('button',{name:'Add to film',exact:true}).waitFor();await mkdir('../../work/frame-6',{recursive:true});await page.locator('.sound-scroll').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'../../work/frame-6/sound-studio-score-desktop.png'});await page.getByRole('button',{name:'Add to film',exact:true}).click();
  await page.getByRole('button',{name:'Film mix',exact:true}).click();await expect(page.locator('.sound-film-track')).toHaveCount(1);
  await page.getByLabel('Start (s)',{exact:true}).fill('2.5');await page.reload();
  await page.getByRole('button',{name:'Film mix',exact:true}).click();await expect(page.getByLabel('Start (s)',{exact:true})).toHaveValue('2.5');
  const result=await page.evaluate(()=>(window as any).project);expect(result.soundtrack.project.patterns.length).toBeGreaterThan(0);expect(result.audio[0].duration).toBeGreaterThan(0);expect(errors).toEqual([]);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'../../work/frame-6/sound-studio-mix-mobile.png'});
});


test('every offered procedural engine and mixer effect constructs and renders finite audio',async({page})=>{
  test.setTimeout(120000);await page.goto(origin);
  const result=await page.evaluate(async()=>{
    const {composeSoundtrack,renderSoundtrack,SYNTH_ENGINES,EFFECT_DEFS}=(window as any).sound;
    const base=composeSoundtrack({prompt:'Warm piano',genre:'lofi',mood:'warm',bpm:200,key:'C',seed:71,bars:1,parts:['chords']});
    const failures:string[]=[],successes:string[]=[];
    for(const mx of base.project.mixer.channels){mx.effects=[];mx.sidechainFromId=null}
    for(const engine of SYNTH_ENGINES){const cue=structuredClone(base);for(const ch of cue.project.channels)if(ch.instrument.type==='synth')ch.instrument={type:'synth',synthId:engine.id,presetId:'test',params:Object.fromEntries(engine.params.map((p:any)=>[p.key,p.default]))};try{const out=await renderSoundtrack(cue,{loop:true});if(!Number.isFinite(out.peak)||out.peak<.0001)throw new Error('No finite audible PCM');successes.push(engine.id)}catch(e){failures.push(engine.id+': '+(e as Error).message)}}
    for(const fx of Object.values(EFFECT_DEFS) as any[]){const cue=structuredClone(base);cue.project.mixer.channels.find((m:any)=>m.kind==='master').effects=[{id:'test-fx',type:fx.type,enabled:true,params:Object.fromEntries(fx.params.map((p:any)=>[p.key,p.default]))}];try{const out=await renderSoundtrack(cue,{loop:true});if(!Number.isFinite(out.peak)||out.peak<.0001)throw new Error('No finite audible PCM');successes.push(fx.type)}catch(e){failures.push(fx.type+': '+(e as Error).message)}}
    return {failures,successes};
  });expect(result.failures).toEqual([]);expect(result.successes.length).toBeGreaterThanOrEqual(40);
});


test('keeps returned provider narration when adding it to the film fails',async({page})=>{
  const samples=2400,wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)wav.writeInt16LE(Math.sin(i*.1)*1000,44+i*2);
  let requests=0;await page.route('**/api/voice',route=>{requests++;return route.fulfill({contentType:'audio/wav',body:wav})});await page.goto(origin);await page.getByRole('button',{name:'Voice',exact:true}).click();await page.getByRole('button',{name:'Connected provider',exact:true}).click();expect(requests).toBe(0);
  await page.getByLabel('Speech model ID',{exact:true}).fill('explicit-model');await page.getByLabel('Voice ID',{exact:true}).fill('explicit-voice');await page.evaluate(()=>(window as any).failAudioSave=true);
  await page.getByRole('button',{name:'Generate provider narration',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Simulated film save failure');await expect(page.getByRole('button',{name:'Add completed narration',exact:true})).toBeEnabled();expect(requests).toBe(1);
  const assets=await page.evaluate(()=>(window as any).sound.Store.getAssets());expect(assets.some((a:any)=>a.name==='Provider narration · recovery copy'&&a.data.startsWith('data:audio/wav'))).toBe(true);
});
