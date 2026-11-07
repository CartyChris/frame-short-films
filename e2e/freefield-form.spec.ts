import {test,expect,type Page} from '@playwright/test';

async function mount(page:Page){
 await page.evaluate(async()=>{
  const load=new Function('p','return import(p)');
  const React=(await load('/node_modules/.vite/deps/react.js')).default,dom=(await load('/node_modules/.vite/deps/react-dom_client.js')).default,studio=await load('/src/components/FreefieldStudio.tsx');
  const root=document.createElement('div');root.style.cssText='position:fixed;inset:0;z-index:99999;overflow:auto;background:#17191c;color:white;padding:20px';document.body.append(root);
  const log=(s:string)=>{const list=JSON.parse(localStorage.getItem('freefield-test-log')||'[]');list.push(s);localStorage.setItem('freefield-test-log',JSON.stringify(list))};
  const saved=localStorage.getItem('freefield-test-job');
  const props={connected:true,initialJob:saved?JSON.parse(saved):undefined,onConnect:async()=>{},onDiscover:async()=>({apps:[{id:'sample',name:'Sample workflow',section:'image',status:'ready',runnable:true,summary:'Editable example',inputs:[{id:'prompt',type:'textarea',label:'Prompt',required:true,default:'First draft'},{id:'image',type:'image',label:'Reference',required:true,limits:{max_mb:1}}],outputs:[{type:'image',label:'Image'}],models:[]}]}),onRetainInputs:async(request:any)=>{log('retain');localStorage.setItem('freefield-test-file',await request.values.image.text())},onJobChange:async(job:any)=>{log('save:'+job.status);localStorage.setItem('freefield-test-job',JSON.stringify(job))},onSubmit:async(request:any)=>{log('submit');if(localStorage.getItem('freefield-mode')==='success')return {id:'remote-job',requestId:request.requestId,identity:'server',appId:request.appId,status:'queued',outputs:[]};throw new Error('Connection lost')},onStatus:async()=>{throw new Error('not used')},onImport:async()=>{},onCancel:async(job:any)=>{log('cancel');return {...job,status:'canceled'}},onRecover:async(job:any)=>{log('recover');return localStorage.getItem('freefield-receipt')==='yes'?{...job,id:'recovered-job',identity:'server',status:'queued',error:undefined}:null}};
  dom.createRoot(root).render(React.createElement(studio.FreefieldStudio,props));
 });
 await page.getByRole('button',{name:'Discover workflows'}).click();
 await page.getByRole('button',{name:/Sample workflow/}).click();
}

test('retains inputs and starting identity before submission; uncertain runs stay blocked after reload',async({page})=>{
 await page.goto('/');await mount(page);
 await page.getByRole('region',{name:'Freefield workflows'}).getByLabel('Prompt').fill('An illuminated city');
 await page.getByRole('region',{name:'Freefield workflows'}).getByLabel('Reference').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from('original input')});
 await page.getByRole('button',{name:'Start workflow'}).click();
 await expect(page.getByText('Run status: unknown')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('freefield-test-log')||'[]'))).toEqual(['retain','save:starting','submit','save:unknown']);
 expect(await page.evaluate(()=>localStorage.getItem('freefield-test-file'))).toBe('original input');
 await page.reload();await mount(page);
 await expect(page.getByRole('button',{name:'Start workflow'})).toBeDisabled();
 await expect(page.getByText(/Local request ID:/)).toBeVisible();
 await page.getByRole('button',{name:'I checked server history'}).click();
 await expect(page.getByRole('button',{name:'Start workflow'})).toBeEnabled();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('freefield-test-job')||'{}').acknowledged)).toBe(true);
});

test('a queued server run requires confirmation before cancellation',async({page})=>{
 await page.goto('/');await page.evaluate(()=>localStorage.setItem('freefield-mode','success'));await mount(page);
 await page.getByRole('region',{name:'Freefield workflows'}).getByLabel('Reference').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from('original')});
 await page.getByRole('button',{name:'Start workflow'}).click();await expect(page.getByText('Run status: queued')).toBeVisible();
 await page.getByRole('button',{name:'Cancel run',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('freefield-test-log')||'[]'))).not.toContain('cancel');
 await page.getByRole('button',{name:'Confirm cancellation'}).click();await expect(page.getByText('Run status: canceled')).toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('freefield-test-job')||'{}'));expect(saved.status).toBe('canceled');expect(saved.identity).toBe('server');expect(saved.requestId).toMatch(/^[0-9a-f-]{36}$/);
});

test('an uncertain request can look up its saved receipt without resubmitting',async({page})=>{
 await page.goto('/');await mount(page);
 await page.getByRole('region',{name:'Freefield workflows'}).getByLabel('Reference').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from('original')});
 await page.getByRole('button',{name:'Start workflow'}).click();await expect(page.getByText('Run status: unknown')).toBeVisible();
 await page.getByRole('button',{name:'Look for saved receipt'}).click();await expect(page.getByText(/No saved server receipt/)).toBeVisible();await expect(page.getByRole('button',{name:'Start workflow'})).toBeDisabled();
 await page.evaluate(()=>localStorage.setItem('freefield-receipt','yes'));await page.getByRole('button',{name:'Look for saved receipt'}).click();await expect(page.getByText('Run status: queued')).toBeVisible();
 const log=await page.evaluate(()=>JSON.parse(localStorage.getItem('freefield-test-log')||'[]'));expect(log.filter((s:string)=>s==='submit')).toHaveLength(1);expect(log.filter((s:string)=>s==='recover')).toHaveLength(2);
});
