import {test,expect} from '@playwright/test';
import {dismissWelcome} from './welcome-helper';

test('Freefield inputs and run identity survive reload and output enters Media',async({page})=>{
 let sent=0,storedBeforeSend=false,retainedBeforeSend=false,localId='';
 const catalog={apps:[{id:'video',name:'Image to video',section:'video',status:'ready',runnable:true,summary:'Animate an image',inputs:[{id:'image',type:'image',label:'First frame',required:true,limits:{max_mb:20}},{id:'prompt',type:'text',label:'Prompt',required:true,default:'Move gently'}],outputs:[{type:'video',label:'Video'}],models:[],presets:[],credits:[]}]};
 await page.route('http://127.0.0.1:4319/production/freefield/**',async route=>{
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'};
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return}
  const action=new URL(route.request().url()).pathname.split('/').at(-1);
  if(action==='discover'){await route.fulfill({headers,contentType:'application/json',body:JSON.stringify(catalog)});return}
  if(action==='submit'){
   sent++;localId=route.request().postData()?.match(/"requestId":"([0-9a-f-]{36})"/)?.[1]||'';
   const saved=await page.evaluate(async()=>new Promise<any>((resolve,reject)=>{const open=indexedDB.open('frame-studio-v1');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['projects','assets']),p=tx.objectStore('projects').getAll(),a=tx.objectStore('assets').getAll();tx.oncomplete=()=>{resolve({projects:p.result,assets:a.result});db.close()}}}));
   storedBeforeSend=saved.projects.some((p:any)=>p.productionTools?.freefieldJobs?.some((j:any)=>j.job.requestId===localId&&j.job.status==='starting'));
   retainedBeforeSend=saved.assets.some((a:any)=>a.name==='first.png');
   await route.fulfill({headers,contentType:'application/json',body:JSON.stringify({requestId:localId,remoteId:'run-123',status:'submitted'})});return
  }
  if(action==='poll'){await route.fulfill({headers,contentType:'application/json',body:JSON.stringify({remoteId:'run-123',status:'succeeded',outputs:[{index:0,name:'out-01.png',kind:'image'}]})});return}
  if(action==='download'){await route.fulfill({headers,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aS8AAAAASUVORK5CYII=','base64')});return}
  await route.fulfill({headers,contentType:'application/json',body:'{}'});
 });
 await page.goto('/');await dismissWelcome(page);await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Studios',exact:true}).click();
 await page.getByRole('navigation',{name:'Production tool categories'}).getByRole('button',{name:'Freefield',exact:true}).click();
 await page.locator('.pt-panel').getByLabel('Pairing token').fill('fixture-token');await page.getByRole('button',{name:'Connect local server'}).click();await page.getByRole('button',{name:'Discover workflows'}).click();
 await page.getByRole('navigation',{name:'Freefield workflow catalog'}).getByRole('button',{name:/Image to video/}).click();
 await page.getByLabel('First frame').setInputFiles({name:'first.png',mimeType:'image/png',buffer:Buffer.from('fixture-image')});await page.getByRole('button',{name:'Start workflow'}).click();
 await expect(page.getByText('Server run ID: run-123')).toBeVisible();expect(sent).toBe(1);expect(storedBeforeSend).toBe(true);expect(retainedBeforeSend).toBe(true);
 await page.reload();await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Studios',exact:true}).click();await page.getByRole('navigation',{name:'Production tool categories'}).getByRole('button',{name:'Freefield',exact:true}).click();
 await expect(page.getByText('Server run ID: run-123')).toBeVisible();await page.locator('.pt-panel').getByLabel('Pairing token').fill('fixture-token');await page.getByRole('button',{name:'Connect local server'}).click();await page.getByRole('button',{name:'Refresh status'}).click();await page.getByRole('button',{name:'Import to Frame'}).click();await expect(page.getByRole('status')).toContainText('saved in Media');expect(sent).toBe(1);
});
