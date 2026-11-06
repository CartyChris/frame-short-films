import {test,expect,webkit,type Browser} from '@playwright/test';
import {build} from '../tests/helpers/browser-build';
import {createServer,type Server} from 'node:http';
import {readFile} from 'node:fs/promises';

let server:Server,browser:Browser,origin='';
test.beforeAll(async()=>{
  const csp=JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8')).app.security.csp as string;
  const blocked=csp.split(';').map(rule=>rule.trim().startsWith('connect-src ')?rule.replace(/\sblob:/g,''):rule).join(';');
  const bundled=await build({stdin:{contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {SoundStudio} from './src/components/SoundStudio';import {composeSoundtrack} from './src/lib/sound/compose';
const soundtrack=composeSoundtrack({prompt:'Warm piano',genre:'lofi',mood:'warm',bpm:120,key:'C',seed:71,bars:4,parts:['drums','chords','melody']});
window.sourceBefore=JSON.stringify(soundtrack);window.soundtrack=soundtrack;
const initial={id:'webkit-sound',name:'WebKit cue',createdAt:0,updatedAt:0,brief:'',soundtrack,settings:{width:1280,height:720,fps:24,background:'#000',volume:1},scenes:[],audio:[]};
function App(){const [project,setProject]=useState(initial);window.soundtrack=project.soundtrack;return <SoundStudio project={project} assets={[]} connections={[]} connectionId='' onConnectionChange={()=>{}} onConnect={()=>{}} recording={false} onRecord={()=>{}} onChange={soundtrack=>setProject(p=>({...p,soundtrack}))} onEditProject={setProject} onAddAudio={async()=>{}}/>}
createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},outfile:'test.js',bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env.VITE_API_ORIGIN':'""'}});
  const js=bundled.outputFiles.find(f=>f.path.endsWith('.js'))!.text,css=bundled.outputFiles.find(f=>f.path.endsWith('.css'))!.text;
  server=createServer((req,res)=>{res.setHeader('Content-Security-Policy',req.url==='/blocked'?blocked:csp);res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':req.url==='/test.css'?'text/css':'text/html');res.end(req.url==='/test.js'?js:req.url==='/test.css'?css:'<!doctype html><html><head><link rel="stylesheet" href="/test.css"><style>body{margin:0;background:#17191c;color:#eee}#root{height:100vh}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/test.js"></script></body></html>')});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
  browser=await webkit.launch({headless:true,executablePath:webkit.executablePath()});
});
test.afterAll(async()=>{await browser?.close();server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))});

test('WebKit renders real non-silent 8-second WAV under the actual native content policy',async()=>{
  test.setTimeout(90000);const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message||e.name));
  try{await page.goto(origin);await page.getByRole('button',{name:'Preview score',exact:true}).click();await expect(page.getByRole('button',{name:'Save WAV',exact:true})).toBeVisible({timeout:60000});
    const audio=await page.locator('.sound-preview audio').evaluate(async(node:HTMLAudioElement)=>{const data=await(await fetch(node.src)).arrayBuffer(),view=new DataView(data);let peak=0,nonzero=0;for(let i=44;i<data.byteLength;i+=2){const n=Math.abs(view.getInt16(i,true));peak=Math.max(peak,n);if(n>30)nonzero++}return{bytes:data.byteLength,channels:view.getUint16(22,true),rate:view.getUint32(24,true),peak,nonzero,sourceUnchanged:(window as any).sourceBefore===JSON.stringify((window as any).soundtrack)}});
    expect(audio).toMatchObject({bytes:44+8*44100*2*2,channels:2,rate:44100,sourceUnchanged:true});expect(audio.peak).toBeGreaterThan(1000);expect(audio.nonzero).toBeGreaterThan(10000);expect(errors).toEqual([]);
  }finally{await page.close()}
});

test('WebKit blocked worklet failure stays visible and leaves the editable score intact',async()=>{
  test.setTimeout(90000);const page=await browser.newPage();
  try{await page.goto(origin+'/blocked');await page.getByRole('button',{name:'Preview score',exact:true}).click();await expect(page.getByRole('alert')).toContainText('AbortError',{timeout:60000});
    await expect(page.getByRole('button',{name:'Preview score',exact:true})).toBeEnabled();await expect(page.locator('.sound-status')).toContainText('Audio preview could not be created');await expect(page.getByRole('button',{name:'Save WAV',exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>(window as any).sourceBefore===JSON.stringify((window as any).soundtrack))).toBe(true);
  }finally{await page.close()}
});
