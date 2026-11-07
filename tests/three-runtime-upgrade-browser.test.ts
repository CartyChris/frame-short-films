import {afterAll,beforeAll,expect,it} from 'vitest';
import {build} from './helpers/browser-build';
import {chromium,type Browser} from 'playwright';
import {createServer,type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {builtInModels,createThreeDocument} from '../src/lib/three/document';

const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser:Browser,server:Server,origin='',newRuntimeRequests=0;
beforeAll(async()=>{
 if(!existsSync(chrome))return;
 const script=(await build({entryPoints:['src/lib/three/html.ts'],bundle:true,format:'iife',globalName:'FilmRuntime',write:false})).outputFiles[0].text;
 const runtime=await readFile('public/runtime/frame-three-v6.js','utf8');
 const oldRuntime='window.FrameThree={mount(){return {ready:Promise.resolve(),resize(){},renderAt(){},dispose(){}}}};';
 const worker=`self.addEventListener('install',e=>e.waitUntil(caches.open('old-frame').then(c=>c.put('/runtime/frame-three.js',new Response(${JSON.stringify(oldRuntime)})))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname==='/runtime/frame-three.js')e.respondWith(caches.match(e.request))})`;
 server=createServer((req,res)=>{const url=req.url||'';if(url==='/sw.js'){res.writeHead(200,{'content-type':'text/javascript','service-worker-allowed':'/'});res.end(worker)}else if(url==='/api.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(script)}else if(url==='/runtime/frame-three-v6.js'){newRuntimeRequests++;res.writeHead(200,{'content-type':'text/javascript'});res.end(runtime)}else{res.writeHead(200,{'content-type':'text/html'});res.end('<html><body><script src="/api.js"></script></body></html>')}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
 browser=await chromium.launch({executablePath:chrome,headless:true});
},30000);
afterAll(async()=>{await browser?.close();server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))});
it.skipIf(!existsSync(chrome))('renders a real 3D frame while an old service worker holds an incompatible runtime',async()=>{
 const page=await browser.newPage({viewport:{width:640,height:360}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin);await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready});await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const legacy=await page.evaluate(async()=>await (await fetch('/runtime/frame-three.js')).text());expect(legacy).not.toContain('renderComplete');
  const doc=createThreeDocument('studio',4);doc.instances=doc.instances.slice(0,1);
  await page.evaluate(async({doc,models})=>{const api=(window as any).FilmRuntime;await api.initThreeRuntime();const iframe=document.createElement('iframe');iframe.style.cssText='width:640px;height:360px';iframe.srcdoc=api.buildThreeChildDocument(doc,models,api.getThreeRuntime());document.body.append(iframe)}, {doc,models:builtInModels});
  const frame=await page.locator('iframe').contentFrame();await expect.poll(async()=>await frame.locator('#error').textContent()).toBe('');await frame.locator('canvas').waitFor();
  const result=await frame.locator('canvas').evaluate(async(canvas:HTMLCanvasElement)=>{await (window as any).film.renderAt(1);const gl=canvas.getContext('webgl2')!,pixel=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return {pixels:new Set(pixel).size,error:document.querySelector('#error')?.textContent}});
  expect(result.pixels).toBeGreaterThan(10);expect(result.error).toBe('');expect(newRuntimeRequests).toBe(1);expect(errors).toEqual([]);
 }finally{await page.close()}
},60000);
it.skipIf(!existsSync(chrome))('shows a useful recovery message instead of a missing-method error for an old embedded runtime',async()=>{
 const page=await browser.newPage();
 try{
  await page.goto(origin);const doc=createThreeDocument('studio',2);doc.instances=[];
  await page.evaluate(({doc})=>{const api=(window as any).FilmRuntime,frame=document.createElement('iframe');frame.srcdoc=api.buildThreeChildDocument(doc,[],'window.FrameThree={mount(){return {ready:Promise.resolve(),resize(){},renderAt(){},dispose(){}}}};');document.body.append(frame)},{doc});
  const frame=page.locator('iframe').contentFrame();await expect.poll(async()=>await frame.locator('#error').textContent()).toContain('3D runtime is out of date');
  expect(await frame.locator('#error').textContent()).not.toContain('is not a function');
 }finally{await page.close()}
},30000);
