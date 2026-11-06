import type {Project as MusicProject,Pattern} from './pulseforge/shared/project';
import {ticksToSeconds,TICKS_PER_STEP} from './pulseforge/shared/time';
import {SOUND_LIMITS} from './types';

/** Check expansion cost before the event compiler allocates repeated notes. */
export function assertRenderBounds(project:MusicProject,patternId?:string):void {
  const hits=(pattern:Pattern)=>Object.values(pattern.notes).reduce((n,a)=>n+a.length,0)+Object.values(pattern.steps).reduce((n,a)=>n+a.length,0);
  let endTick=0,count=0;
  if(patternId){const pattern=project.patterns.find(p=>p.id===patternId);if(pattern){endTick=pattern.lengthSteps*TICKS_PER_STEP;count=hits(pattern)}}
  else {
    const solo=project.tracks.some(t=>t.soloed),patterns=new Map(project.patterns.map(p=>[p.id,p]));
    for(const clip of project.clips){
      const track=project.tracks.find(t=>t.id===clip.trackId);if(!track||clip.muted||track.muted||(solo&&!track.soloed))continue;
      endTick=Math.max(endTick,clip.startTick+clip.lengthTicks);
      if(clip.kind==='pattern'){
        const pattern=patterns.get(clip.patternId??'');if(pattern)count+=Math.ceil(clip.lengthTicks/(pattern.lengthSteps*TICKS_PER_STEP))*hits(pattern);
      }else count+=clip.automationPoints.length;
    }
  }
  const duration=ticksToSeconds(endTick,project.bpm);
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Add a few notes or drum steps before rendering.');
  if(duration>SOUND_LIMITS.renderSeconds)throw new Error('Render a pattern or a cue up to 2 minutes, then loop or combine cues on the film timeline. The full editable score remains saved.');
  if(count>100000)throw new Error('This cue expands to too many scheduled events. Render a shorter pattern.');
}
