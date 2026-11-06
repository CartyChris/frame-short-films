import {test,expect} from '@playwright/test';
async function waitStudio(page:any){await page.goto('/');await page.getByRole('button',{name:'Play film',exact:true}).waitFor();await expect(page.locator('.inspector-footer')).toContainText('Rust');}
async function connect(page:any,provider='OpenRouter',model='test-model'){
 await page.getByRole('button',{name:/Connect a model/}).click();
 if(provider!=='OpenRouter')await page.locator('.provider-list').getByRole('button',{name:new RegExp(provider)}).click();
 await page.getByPlaceholder('Paste your own API key').fill('test-key-not-a-real-credential');
 await page.getByPlaceholder('Select above or type an exact model ID').fill(model);
 await page.getByRole('button',{name:'Add connection',exact:true}).click();
}
test('studio transport, theme, resize, layers, sound and portable export',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await waitStudio(page);
 await page.getByRole('button',{name:'Play film',exact:true}).click();await page.waitForTimeout(600);await page.getByRole('button',{name:'Pause film',exact:true}).click();
 await page.getByRole('button',{name:'Customize studio'}).click();await page.getByRole('button',{name:/Deep space/}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','cosmos');await page.getByRole('button',{name:'Close settings'}).click();
 const divider=page.getByRole('separator',{name:'Resize library'});const before=await page.locator('.library-panel').boundingBox();await divider.focus();await page.keyboard.press('ArrowRight');const after=await page.locator('.library-panel').boundingBox();expect(after!.width).toBeGreaterThan(before!.width);
 await page.getByRole('button',{name:'Sound',exact:true}).click();await page.getByRole('button',{name:'Compose a soundtrack'}).click();await expect(page.locator('.audio-clip')).toHaveCount(1);
 await page.locator('.app > input[type=file][multiple]').setInputFiles({name:'sample.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="9" fill="orange"/></svg>')});
 await page.getByRole('button',{name:'Add sample.svg to timeline'}).click();await expect(page.locator('.layer-row').filter({hasText:'sample.svg'})).toHaveCount(1);
 await page.getByRole('button',{name:'Export film',exact:true}).click();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:/Single-file HTML/}).click();const downloaded=await downloadPromise;const path=test.info().outputPath('exported.html');await downloaded.saveAs(path);const exported=await page.context().newPage();await exported.route(/^https?:\/\//,r=>r.abort());await exported.goto('file://'+path);await exported.waitForFunction(()=>!!(window as any).film);expect(await exported.evaluate(()=>(window as any).film.duration)).toBe(30);await exported.close();await page.getByRole('button',{name:'Close export'}).click();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Create',exact:true}).click();await expect(page.getByRole('button',{name:'Create with AI'})).toBeVisible();
 expect(errors).toEqual([]);
});
test('cutoff survives reload, provider handoff continues exact code, prior version survives',async({page})=>{
 await waitStudio(page);await connect(page);
 const prefix='<!doctype html><html><body><canvas id="c"></canvas><script>const title="preserved';
 let requests:any[]=[];
 await page.route('**/api/generate',async route=>{requests.push(route.request().postDataJSON());await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'delta',text:prefix})+'\n'});});
 await page.getByLabel('Direct this scene').fill('Make a cinematic test scene');await page.getByRole('button',{name:'Create with AI'}).click();await expect(page.locator('.draft-card pre')).toContainText('preserved');await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeEnabled();
 await page.reload();await page.getByRole('button',{name:'Recovery',exact:true}).click();await page.locator('.recovery-card').first().click();await expect(page.locator('.draft-card pre')).toContainText(prefix);
 await connect(page,'Venice AI','other-test-model');
 await page.unroute('**/api/generate');const suffix=' forever";window.film={duration:7,renderAt(t){},pause(){}};</script></body></html>';
 await page.route('**/api/generate',async route=>{requests.push(route.request().postDataJSON());await route.fulfill({status:200,contentType:'application/x-ndjson',body:JSON.stringify({type:'delta',text:suffix})+'\n'+JSON.stringify({type:'done',finishReason:'stop'})+'\n'});});
 await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.draft-card pre')).toContainText('preserved forever');await expect(page.getByRole('button',{name:'Use draft',exact:true})).toBeEnabled();expect(requests[1].provider).toBe('venice');expect(requests[1].messages.some((m:any)=>m.content===prefix)).toBe(true);
 await page.getByRole('button',{name:'Use draft',exact:true}).click();await page.getByRole('button',{name:'Code',exact:true}).click();await expect(page.locator('.cm-content')).toContainText('preserved forever');
 await page.getByRole('button',{name:'Recovery',exact:true}).click();await expect(page.locator('.revision')).toHaveCount(1);await expect(page.locator('.recovery-card')).toHaveCount(2);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Save a portable backup'}).click();const d=await downloadPromise;const path=await d.path();const fs=await import('node:fs/promises');const archive=JSON.parse(await fs.readFile(path!,'utf8'));expect(archive.runs.length).toBe(2);expect(archive.chunks.map((c:any)=>c.text).join('')).toContain('preserved');expect(JSON.stringify(archive)).not.toContain('test-key-not-a-real-credential');
 await page.locator('.app > input[type=file][multiple]').setInputFiles({name:'restore.frame.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(archive))});await expect(page.locator('.recovery-card')).toHaveCount(2);
});
test('adapted reference is offline and supports the editor clock',async({page})=>{await waitStudio(page);await page.getByRole('button',{name:'Add reference film'}).click();await expect(page.locator('.scene-clip')).toHaveCount(5);await page.locator('.scene-clip').last().click();await page.waitForTimeout(900);await page.getByRole('button',{name:'Play film',exact:true}).click();await page.waitForTimeout(600);await page.getByRole('button',{name:'Pause film',exact:true}).click();await expect(page.locator('.time-total')).toContainText('01:00');});
test('adding and editing a scene keeps the matching preview playhead',async({page})=>{
 await waitStudio(page);
 await expect(page.locator('.timecode')).toContainText('00:00');
 await page.locator('.template-card').first().click();
 await expect(page.locator('.scene-clip.selected')).toContainText('Paper & light');
 await expect.poll(async()=>page.locator('.timecode').textContent()).toContain('00:30');
 await page.locator('.inspector-tabs').getByRole('button',{name:'Scene',exact:true}).click();
 await page.getByLabel('Scene title',{exact:true}).fill('New story');
 await expect(page.locator('.scene-clip.selected')).toContainText('New story');
 await page.waitForTimeout(500);
 await expect(page.locator('.timecode')).toContainText('00:30');
});
