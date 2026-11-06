// A real loopback companion + disposable MCP fixture. No provider/Blender call.
// Start the Vite app first; run: node integrations/tests/mcp-smoke.mjs
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
let callCount=0;
const fixture=createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 const request=JSON.parse(body);
 if(request.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
 const result=request.method==='initialize'?{protocolVersion:'2025-11-25',serverInfo:{name:'Local fixture',version:'1'},capabilities:{tools:{}}}:request.method==='tools/list'?{tools:[{name:'scene_info',description:'Read this fixture scene.',inputSchema:{type:'object'}}]}:{content:[{type:'text',text:'Fixture scene ready'}]};
 if(request.method==='tools/call')callCount++;
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
});
await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
const base=process.env.FRAME_TEST_URL||'http://127.0.0.1:5173';
const child=spawn('cargo',['run','--quiet','--manifest-path','companion/Cargo.toml'],{env:{...process.env,FRAME_ALLOWED_ORIGINS:new URL(base).origin},stdio:['ignore','pipe','pipe']});
let browser;
try{
 const token=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Companion did not start; port 4319 may be occupied')),30000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/\b[a-f0-9]{64}\b/);if(match){clearTimeout(timer);resolve(match[0]);output='';}});child.on('exit',code=>{clearTimeout(timer);reject(new Error('Companion startup exited '+code));});});
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('button',{name:'Studios',exact:true}).click();
 await page.getByRole('button',{name:'Local tools Connect an MCP studio'}).click();
 await page.getByLabel('Pairing token',{exact:true}).fill(token);
 await page.getByRole('button',{name:'Check installed tools',exact:true}).click();await page.locator('.integration-checks').waitFor();
 await page.getByLabel('Connection type').selectOption('http');
 await page.getByLabel('MCP endpoint').fill(`http://127.0.0.1:${fixture.address().port}/mcp`);
 await page.getByRole('button',{name:'Connect & discover tools',exact:true}).click();await page.getByLabel('Discovered tool').waitFor();
 await page.getByRole('button',{name:'Review this call',exact:true}).click();assert.equal(callCount,0);
 await page.getByRole('button',{name:'Run this tool once',exact:true}).click();await page.locator('.integration-result').filter({hasText:'Fixture scene ready'}).waitFor();assert.equal(callCount,1);assert.deepEqual(errors,[]);
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.getByRole('button',{name:'Connect & discover tools',exact:true}).waitFor();
 console.log('PASS: actual companion pairing, HTTP MCP discovery, explicit one-time call, result display, disconnect; no browser errors.');
}finally{
 if(browser)await browser.close();child.kill('SIGINT');fixture.close();
}
