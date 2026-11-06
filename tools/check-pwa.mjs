/** Production-only offline acceptance. No provider calls or credentials. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin=process.env.FRAME_TEST_URL||'https://frame-short-films.vercel.app';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin);await page.getByRole('button',{name:'3D studio'}).waitFor();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.getByRole('button',{name:'3D studio'}).click();await page.getByRole('button',{name:'Explore the animated example'}).click();await page.locator('.s3-viewport canvas').waitFor();
 await page.getByRole('button',{name:'Film camera',exact:true}).click();
 await page.getByLabel('3D playhead').fill('3');await page.waitForTimeout(300);
 const prior=await page.locator('.s3-viewport canvas').screenshot();
 const cached=await page.evaluate(async()=>{const keys=await caches.keys();return (await Promise.all(keys.map(async k=>(await (await caches.open(k)).keys()).map(r=>r.url)))).flat()});
 assert(cached.some(url=>url.endsWith('/runtime/frame-three.js')));assert(cached.some(url=>url.endsWith('/runtime/frame-motion.js')));assert(cached.some(url=>url.endsWith('/film_core.wasm')));assert(!cached.some(url=>new URL(url).pathname.startsWith('/api/')));
 await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'3D studio'}).click();await page.locator('.s3-viewport canvas').waitFor();await page.getByRole('button',{name:'Film camera',exact:true}).click();await page.getByLabel('3D playhead').fill('3');await page.waitForTimeout(300);
 assert.equal(await page.getByLabel('Film name').inputValue(),'The Lantern Road');assert(prior.equals(await page.locator('.s3-viewport canvas').screenshot()));
 await page.getByRole('button',{name:'Play 3D scene'}).click();await page.waitForTimeout(300);await page.getByRole('button',{name:'Pause 3D scene'}).click();assert(!prior.equals(await page.locator('.s3-viewport canvas').screenshot()));
 await page.getByRole('button',{name:'Story & cast'}).click();await page.getByRole('button',{name:'Cast',exact:true}).click();assert.equal(await page.getByLabel('Character name').filter({visible:true}).count(),3);await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Chat',exact:true}).click();await page.getByLabel('Message your director').waitFor();await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Produce',exact:true}).click();await page.getByLabel('Automatic film prompt').waitFor();await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Casting',exact:true}).click();await page.getByLabel('Cast character name',{exact:true}).waitFor();await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Sound & music',exact:true}).click();await page.getByRole('button',{name:'Voice',exact:true}).waitFor();await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Motion',exact:true}).click();await page.getByRole('button',{name:/In orbit/}).click();await page.locator('.motion-preview [data-motion-id]').first().waitFor();await page.getByLabel('Motion playhead').fill('2');const motionFrame=await page.locator('.motion-preview').screenshot();await page.getByLabel('Motion playhead').fill('5');assert(!motionFrame.equals(await page.locator('.motion-preview').screenshot()));await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Studios',exact:true}).click();await page.getByRole('heading',{name:'Finishing tools'}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS: hosted PWA reloads offline, retains project/cast, reproduces the 3D frame and plays animation; Chat/Produce/Casting/Sound/Production tools open offline; Motion animates offline; bundled runtime/WASM cached, API absent from cache.');
}finally{await browser.close()}
