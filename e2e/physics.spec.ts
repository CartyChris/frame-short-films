import {test,expect,type Page} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {physicsBakeStatus} from '../src/lib/three/physics-types';

async function archive(page:Page){await page.getByRole('button',{name:'Export film',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:/Complete project/}).click();const download=await pending;const data=JSON.parse(await readFile((await download.path())!,'utf8'));await page.getByRole('button',{name:'Close export'}).click();return data}
const workspaces=(page:Page)=>page.getByRole('navigation',{name:'Workspaces'});
test('whole app bakes real browser Jolt, preserves its source through split/reload/restore, and exports seekable motion',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await workspaces(page).getByRole('button',{name:/3D studio/}).click();
 await page.getByRole('button',{name:'New 3D shot',exact:true}).click();await expect(page.locator('.s3-viewport canvas')).toBeVisible();
 await page.locator('.s3-outliner').getByRole('button',{name:'Leo',exact:true}).click();
 await page.getByLabel('Position Y',{exact:true}).fill('5');
 const panel=page.getByRole('region',{name:'Physics simulation'});
 await panel.getByRole('button',{name:'Add physics to Leo'}).click();await panel.getByLabel('Collider size Y',{exact:true}).fill('2');await panel.getByLabel('Collider center Y',{exact:true}).fill('1');
 await panel.getByLabel('Initial velocity X',{exact:true}).fill('2');await panel.getByLabel('Body bounce',{exact:true}).fill('.25');
 await panel.getByRole('button',{name:'Bake physics motion',exact:true}).click();await expect(panel.getByRole('button',{name:'Apply baked motion',exact:true})).toBeEnabled({timeout:30000});
 await panel.getByRole('button',{name:'Apply baked motion',exact:true}).click();await expect(panel.getByRole('status')).toHaveText('Baked motion is saved and ready to export.');
 const first=await archive(page),shot=first.project.scenes.find((s:any)=>s.three?.physics?.bake);expect(shot).toBeTruthy();expect(physicsBakeStatus(shot.three)).toBe('ready');
 const actor=shot.three.instances.find((i:any)=>i.id==='actor-leo');expect(actor.keyframes).toHaveLength(721);expect(actor.keyframes[0].position[1]).toBeCloseTo(5);expect(actor.keyframes.at(-1).position[1]).toBeLessThan(.1);expect(actor.keyframes.at(-1).position[0]).toBeGreaterThan(2.5);
 expect(shot.three.physics.bake.originals[0].animation.preset).toBe('wave');
 await page.getByLabel('3D playhead').fill('0');await page.waitForTimeout(120);const start=await page.locator('.s3-viewport canvas').screenshot();await page.getByLabel('3D playhead').fill('2');await page.waitForTimeout(120);const fallen=await page.locator('.s3-viewport canvas').screenshot();expect(start.equals(fallen)).toBe(false);expect(fallen.length).toBeGreaterThan(10000);
 await page.getByRole('button',{name:'Split at playhead',exact:true}).click();const split=await archive(page),parts=split.project.scenes.filter((s:any)=>s.three?.physics?.bake);expect(parts).toHaveLength(2);expect(parts.map((s:any)=>s.sourceOffset||0)).toEqual([0,2]);expect(parts.map((s:any)=>s.duration)).toEqual([2,10]);for(const part of parts)expect(physicsBakeStatus(part.three)).toBe('ready');
 await page.reload();await workspaces(page).getByRole('button',{name:/3D studio/}).click();await page.getByRole('button',{name:'Shots',exact:true}).click();await page.locator('.s3-shot-list button').last().click();await expect(page.getByRole('region',{name:'Physics simulation'}).getByRole('status')).toHaveText('Baked motion is saved and ready to export.');
 const reloaded=await archive(page);expect(reloaded.project.scenes.filter((s:any)=>s.three?.physics?.bake)).toHaveLength(2);
 await page.locator('.app>input[type=file]').setInputFiles({name:'physics.frame.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(reloaded))});await expect(page.locator('.toast')).toContainText('Project and all its saved drafts restored.');
 const imported=await archive(page);expect(imported.project.id).not.toBe(reloaded.project.id);expect(imported.project.scenes.filter((s:any)=>s.three?.physics?.bake).map((s:any)=>physicsBakeStatus(s.three))).toEqual(['ready','ready']);
 await page.getByRole('button',{name:'Export film',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:/Single-file HTML/}).click();const file=await download,path=test.info().outputPath('physics.html');await file.saveAs(path);const html=await readFile(path,'utf8');expect(html).not.toContain('WebAssembly.instantiate');expect(html).not.toContain('jolt-physics.wasm-compat');await page.getByRole('button',{name:'Close export'}).click();
 let offset=0;for(const s of imported.project.scenes){if(s.three?.physics?.bake)break;offset+=s.duration}
 const player=await page.context().newPage();await player.route(/^https?:\/\//,r=>r.abort());await player.goto('file://'+path);await player.waitForFunction(()=>!!(window as any).film);await player.evaluate(t=>(window as any).film.renderAt(t),offset+3);await player.waitForTimeout(250);const firstFrame=await player.screenshot();await player.evaluate(t=>(window as any).film.renderAt(t),offset+.2);await player.waitForTimeout(250);const earlierFrame=await player.screenshot();expect(firstFrame.equals(earlierFrame)).toBe(false);expect(firstFrame.length).toBeGreaterThan(10000);
 await mkdir('../../work/frame-5',{recursive:true});await player.screenshot({path:'../../work/frame-5/physics-offline-export.png'});await player.close();
 await workspaces(page).getByRole('button',{name:/3D studio/}).click();await page.getByRole('button',{name:'Shots',exact:true}).click();await page.locator('.s3-shot-list button').last().click();await page.getByRole('region',{name:'Physics simulation'}).scrollIntoViewIfNeeded();await page.screenshot({path:'../../work/frame-5/physics-main-app.png'});expect(errors).toEqual([]);
});
