import type {MotionDocument} from './types';
let runtimeSource='',loading:Promise<void>|undefined;
export function setMotionRuntime(source:string){if(!source.includes('FrameMotion'))throw new Error('The bundled Motion runtime is invalid.');runtimeSource=source}
export function getMotionRuntime(){return runtimeSource}
export async function initMotionRuntime(){if(runtimeSource)return;if(!loading)loading=fetch(new URL('runtime/frame-motion.js',document.baseURI)).then(async response=>{if(!response.ok)throw new Error('The offline Motion runtime is missing. Rebuild the app and try again.');setMotionRuntime(await response.text())}).catch(error=>{loading=undefined;throw error});return loading}
/** Closure-free: the portable film serializes this function beside its shared clock. */
export function buildMotionChildDocument(doc:MotionDocument,runtime:string):string{
 const json=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const open='<scr'+'ipt>',close='</scr'+'ipt>';
 return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src \'none\'; font-src \'none\'"><style>*{box-sizing:border-box}html,body,#stage{margin:0;width:100%;height:100%;overflow:hidden}#error{position:absolute;inset:12%;padding:24px;background:#172b2f;color:#fff;font:16px/1.5 system-ui;border-radius:16px;display:none}</style></head><body><div id="stage"></div><div id="error" role="alert"></div>'+open+runtime.replace(/<\/script/gi,'<\\/script')+close+open+`
const doc=${json(doc)};let engine,error,time=0,playing=false,last=0;const fail=e=>{error=e instanceof Error?e:new Error(String(e));const box=document.getElementById('error');box.textContent=error.message;box.style.display='block'};
try{if(!window.FrameMotion)throw new Error('The offline Motion runtime is missing. Reopen Frame and export again.');engine=FrameMotion.mount(document.getElementById('stage'),doc);engine.ready.catch(fail)}catch(e){fail(e)}
async function renderAt(t){time=Math.max(0,Math.min(doc.duration,Number(t)||0));if(error)throw error;if(!engine)throw new Error('Motion renderer unavailable');await engine.ready;engine.renderAt(time);return time}
window.film={duration:doc.duration,renderAt,seek:renderAt,pause(){playing=false},play(){playing=true;last=performance.now()}};function tick(now){if(playing){time=Math.min(doc.duration,time+(now-last)/1000);renderAt(time).catch(fail);if(time>=doc.duration)playing=false}last=now;requestAnimationFrame(tick)}addEventListener('pagehide',()=>engine?.dispose());renderAt(0).catch(fail);requestAnimationFrame(tick);
`+close+'</body></html>';
}
export async function buildMotionHtml(doc:MotionDocument){await initMotionRuntime();return buildMotionChildDocument(doc,runtimeSource)}
