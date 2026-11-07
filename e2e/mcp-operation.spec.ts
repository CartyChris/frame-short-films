import {test,expect} from '@playwright/test';
import {dismissWelcome} from './welcome-helper';

test('a reviewed local tool call is journaled before it is sent',async({page})=>{
 let requestId='',observedState='';
 await page.route('http://127.0.0.1:4319/integrations/**',async route=>{
  const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'};
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return}
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/connect')){await route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify({connectionId:'fixture-session',status:'connected',serverInfo:{name:'Fixture',version:'1'},tools:[{name:'describe_scene',description:'Describe the current scene.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]})});return}
  if(url.pathname.endsWith('/call')){
   requestId=route.request().postDataJSON().requestId;
   observedState=await page.evaluate(async id=>new Promise<string>((resolve,reject)=>{const open=indexedDB.open('frame-mcp-operation-journal');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('operations'),get=tx.objectStore('operations').get(id);get.onsuccess=()=>{resolve(get.result?.state||'missing');db.close()};get.onerror=()=>reject(get.error)}}),requestId);
   await route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify({requestId,result:{content:[{type:'text',text:'Scene inspected'}]}})});return
  }
  await route.fulfill({headers:cors,contentType:'application/json',body:'{}'});
 });
 await page.goto('/');await dismissWelcome(page);
 await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Studios',exact:true}).click();
 await page.getByRole('button',{name:/Local tools/}).click();
 await page.getByLabel('Pairing token').fill('test-pairing-token');
 await page.getByRole('button',{name:'Connect & discover tools'}).click();
 await page.getByRole('button',{name:'Review this call'}).click();
 await page.getByRole('button',{name:'Run this tool once'}).click();
 await expect(page.getByText('Scene inspected')).toBeVisible();
 expect(requestId).toMatch(/^[0-9a-f-]{36}$/);expect(observedState).toBe('unknown');
 const saved=await page.evaluate(async id=>new Promise<any>((resolve,reject)=>{const open=indexedDB.open('frame-mcp-operation-journal');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,get=db.transaction('operations').objectStore('operations').get(id);get.onsuccess=()=>{resolve(get.result);db.close()};get.onerror=()=>reject(get.error)}}),requestId);
 expect(saved.state).toBe('complete');expect(JSON.stringify(saved)).not.toContain('test-pairing-token');
});
