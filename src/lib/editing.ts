import type {Layer,Scene} from './types';
/** Split without restarting animation, replaying media, or changing fade envelopes. */
export function splitScene(scene:Scene,localTime:number):[Scene,Scene]{
 if(!Number.isFinite(localTime)||!Number.isFinite(scene.duration)||localTime<=0||localTime>=scene.duration)throw new Error('Split inside the scene, after its start and before its end.');
 const sourceOffset=Number.isFinite(scene.sourceOffset)?Math.max(0,scene.sourceOffset!):0;
 function sliceLayers(begin:number,end:number,right:boolean):Layer[]{return scene.layers.flatMap(layer=>{
  const start=Number.isFinite(layer.start)?layer.start:0,duration=Number.isFinite(layer.duration)?Math.max(0,layer.duration):0;
  const clipStart=Math.max(begin,start),clipEnd=Math.min(end,start+duration);if(clipEnd<=clipStart)return [];
  const advanced=clipStart-start;
  return [{...structuredClone(layer),id:right?crypto.randomUUID():layer.id,start:clipStart-begin,duration:clipEnd-clipStart,
   trim:(layer.trim||0)+((layer.type==='audio'||layer.type==='video')?advanced:0),
   envelopeOffset:(layer.envelopeOffset||0)+advanced,envelopeDuration:layer.envelopeDuration??duration}];
 })}
 return [
  {...structuredClone(scene),duration:localTime,sourceOffset,continuity:scene.continuity?{...structuredClone(scene.continuity),stateAfter:{}}:undefined,layers:sliceLayers(0,localTime,false)},
  {...structuredClone(scene),id:crypto.randomUUID(),title:scene.title+' · part 2',duration:scene.duration-localTime,sourceOffset:sourceOffset+localTime,transition:'cut',layers:sliceLayers(localTime,scene.duration,true)},
 ];
}
/** Keep a local clip range while preserving the original animation's clock. */
export function trimScene(scene:Scene,from:number,to:number):Scene{
 if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to>scene.duration||to-from<.1)throw new Error('Choose a range of at least 0.1 seconds inside this clip.');
 let result=structuredClone(scene);
 if(to<result.duration)result=splitScene(result,to)[0];
 if(from>0)result=splitScene(result,from)[1];
 return {...result,id:scene.id,title:scene.title,transition:scene.transition,continuity:scene.continuity?structuredClone(scene.continuity):undefined};
}
