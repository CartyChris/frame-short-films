import {test,expect,type Page} from '@playwright/test';
import {dismissWelcome} from './welcome-helper';

test('a saved model proposal continues after reload and requires explicit review and execution',async({page})=>{
 let generations=0,calls=0;
 const output='{"name":"describe_scene","arguments":{"detail":"lighting"}}',cut=25;
 await page.route('**/api/generate',async route=>{
  generations++;
  const body=JSON.stringify({type:'delta',text:generations===1?output.slice(0,cut):output.slice(cut)})+'\n'+(generations===1?'':JSON.stringify({type:'done',finishReason:'stop'})+'\n');
  await route.fulfill({contentType:'application/x-ndjson',body});
 });
 await page.route('http://127.0.0.1:4319/integrations/**',async route=>{
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'};
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return}
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/connect')){await route.fulfill({headers,contentType:'application/json',body:JSON.stringify({connectionId:'fixture',status:'connected',serverInfo:{name:'Fixture'},tools:[{name:'describe_scene',description:'Inspect the scene',inputSchema:{type:'object'}}]})});return}
  if(path.endsWith('/call')){calls++;await route.fulfill({headers,contentType:'application/json',body:JSON.stringify({requestId:route.request().postDataJSON().requestId,result:{content:[{type:'text',text:'Done'}]}})});return}
  await route.fulfill({headers,contentType:'application/json',body:'{}'});
 });
 async function connectModel(p:Page){await p.locator('.connection-pill').click();await p.getByPlaceholder('Paste your own API key').fill('fixture-key');await p.getByPlaceholder('Select above or type an exact model ID').fill('fixture-model');await p.getByRole('button',{name:'Add connection',exact:true}).click()}
 async function openTools(p:Page){await p.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Studios',exact:true}).click();await p.getByRole('button',{name:/Local tools/}).click();await p.getByLabel('Pairing token').fill('fixture-token');await p.getByRole('button',{name:'Connect & discover tools'}).click();await p.getByText('Ask a model to draft a call').click()}
 await page.goto('/');await dismissWelcome(page);await connectModel(page);await openTools(page);
 let panel=page.getByRole('region',{name:'Draft a tool call'});
 await panel.getByLabel('Instruction').fill('Inspect the lighting');await panel.getByRole('button',{name:'Draft with model'}).click();
 await expect(panel.getByRole('button',{name:'Continue saved draft'})).toBeVisible();
 await expect(panel.getByLabel('Proposed JSON')).toHaveValue(output.slice(0,cut));expect(calls).toBe(0);
 await page.reload();await connectModel(page);await openTools(page);
 panel=page.getByRole('region',{name:'Draft a tool call'});await expect(panel.getByLabel('Proposed JSON')).toHaveValue(output.slice(0,cut));
 await panel.getByRole('button',{name:'Continue saved draft'}).click();await expect(panel.getByLabel('Proposed JSON')).toHaveValue(output);
 await panel.getByRole('button',{name:'Use for review'}).click();
 await expect(page.getByText('Run describe_scene once?')).toBeVisible();expect(calls).toBe(0);
 await page.getByRole('button',{name:'Run this tool once'}).click();await expect.poll(()=>calls).toBe(1);
});
