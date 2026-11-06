type FilmCore = {
  core_version(): number;
  core_ease(t:number): number;
  core_timeline_reset():void;
  core_timeline_push(duration:number):void;
  core_timeline_index(time:number):number;
  core_timeline_local_time(time:number):number;
};
let core:FilmCore|undefined;
let pending:Promise<boolean>|undefined;
export let engineLabel = 'JavaScript fallback';
export function initCore():Promise<boolean> {
  return pending ??= (async()=>{
    try {
      const response=await fetch(`${import.meta.env.BASE_URL || '/'}film_core.wasm`);
      if(!response.ok) return false;
      const result=await WebAssembly.instantiate(await response.arrayBuffer());
      const exports=result.instance.exports as unknown as FilmCore;
      if(exports.core_version()!==1) return false;
      core=exports; engineLabel='Rust · WebAssembly'; return true;
    } catch { return false; }
  })();
}
function duration(value:number){return Number.isFinite(value)&&value>0?value:0}
export function locateScene(durations:number[],time:number):{index:number;localTime:number} {
  if(core){
    core.core_timeline_reset();
    for(const value of durations) core.core_timeline_push(value);
    return {index:core.core_timeline_index(time),localTime:core.core_timeline_local_time(time)};
  }
  if(!durations.length)return {index:-1,localTime:0};
  const t=Number.isNaN(time)||time<0?0:time;
  let offset=0,result={index:durations.length-1,localTime:0};
  for(let i=0;i<durations.length;i++){
    const length=duration(durations[i]);
    if(length>0){
      result={index:i,localTime:length};
      if(t<offset+length)return {index:i,localTime:t-offset};
      offset+=length;
    }
  }
  return result;
}
export function ease(time:number):number {
  if(core)return core.core_ease(time);
  const t=Number.isNaN(time)?0:Math.max(0,Math.min(1,time));
  return t*t*(3-2*t);
}
