import {test,expect,type Page} from '@playwright/test';

async function openStudio(page:Page){
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Play film',exact:true})).toBeVisible();
}
async function connectImageProvider(page:Page){
  await page.getByRole('button',{name:/Connect a model/}).click();
  await page.getByPlaceholder('Paste your own API key').fill('test-media-key-not-a-real-credential');
  await page.getByPlaceholder('Select above or type an exact model ID').fill('test-image-model');
  await page.getByRole('button',{name:'Add connection',exact:true}).click();
}

test('a delayed generated image preserves a concurrently imported and edited layer',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let release!:()=>void,started!:()=>void;
  const delayed=new Promise<void>(resolve=>{release=resolve});
  const providerStarted=new Promise<void>(resolve=>{started=resolve});
  const generatedName='Late generated image';
  let paidRequests=0;
  await page.route('**/api/media',async route=>{
    const request=route.request().postDataJSON();
    expect(request).toMatchObject({action:'image',provider:'openrouter',model:'test-image-model',direct:true});
    await route.fulfill({contentType:'application/json',body:JSON.stringify({provider:'openrouter',directKind:'image',download:{url:'https://openrouter.ai/api/v1/images',method:'POST',auth:'bearer',mime:'application/json',body:{model:request.model,prompt:request.prompt,n:1}}})});
  });
  // Match the official descriptor URL, rather than an unrelated API hostname.
  await page.route('https://openrouter.ai/api/v1/images',async route=>{
    const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'};
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
    paidRequests++;
    expect(route.request().headers().authorization).toBe('Bearer test-media-key-not-a-real-credential');
    started();await delayed;
    await route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify({data:[{media_type:'image/png',b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII='}]})});
  });
  try{
    await openStudio(page);await connectImageProvider(page);
    await page.getByRole('button',{name:'Generate',exact:true}).click();
    await page.getByLabel('Describe the shot',{exact:true}).fill(generatedName);
    await page.getByPlaceholder('Choose or enter a model ID').fill('test-image-model');
    await page.getByRole('button',{name:'Generate image',exact:true}).click();
    await providerStarted;
    await expect(page.getByRole('button',{name:'Working…',exact:true})).toBeDisabled();
    await page.locator('.app > input[type=file][multiple]').setInputFiles({name:'concurrent.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="orange"/></svg>')});
    await page.getByRole('button',{name:'Add concurrent.svg to timeline',exact:true}).click();
    await expect(page.locator('.layer-row').filter({hasText:'concurrent.svg'})).toHaveCount(1);
    await page.getByLabel('Name',{exact:true}).fill('Edited while waiting');
    release();
    await expect(page.locator('.layer-row').filter({hasText:generatedName})).toHaveCount(1);
    await expect(page.locator('.layer-row').filter({hasText:'Edited while waiting'})).toHaveCount(1);
    await expect(page.locator('.layer-row')).toHaveCount(3); // base animation + both image layers
    await expect(page.locator('.project-title')).toContainText('Saved on this device');
    expect(paidRequests).toBe(1);
    await page.reload();await expect(page.getByRole('button',{name:'Play film',exact:true})).toBeVisible();
    await page.locator('.inspector-tabs').getByRole('button',{name:'Scene',exact:true}).click();
    await expect(page.locator('.layer-row').filter({hasText:generatedName})).toHaveCount(1);
    await expect(page.locator('.layer-row').filter({hasText:'Edited while waiting'})).toHaveCount(1);
    expect(errors).toEqual([]);
  }finally{release();}
});

test('opening the active project card cannot restore stale title or scene edits',async({page})=>{
  await openStudio(page);
  await page.getByRole('button',{name:'Projects',exact:true}).click();
  await expect(page.locator('.project-card.active')).toHaveCount(1);
  await page.getByLabel('Film name',{exact:true}).fill('Renamed without losing changes');
  await page.locator('.inspector-tabs').getByRole('button',{name:'Scene',exact:true}).click();
  await page.getByLabel('Scene title',{exact:true}).fill('My freshly edited scene');
  await expect(page.locator('.project-title')).toContainText('Saved on this device');
  await page.locator('.project-card.active').click();
  await expect(page.getByLabel('Film name',{exact:true})).toHaveValue('Renamed without losing changes');
  await expect(page.getByLabel('Scene title',{exact:true})).toHaveValue('My freshly edited scene');
  await page.reload();await expect(page.getByRole('button',{name:'Play film',exact:true})).toBeVisible();
  await expect(page.getByLabel('Film name',{exact:true})).toHaveValue('Renamed without losing changes');
  await page.locator('.inspector-tabs').getByRole('button',{name:'Scene',exact:true}).click();
  await expect(page.getByLabel('Scene title',{exact:true})).toHaveValue('My freshly edited scene');
});
