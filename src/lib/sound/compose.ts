import {createEmptyProject} from './pulseforge/shared/project';
import {buildProduction,validateProductionSpec,type ProductionSpec,type GenreId} from './pulseforge/shared/producer';
import {directFromPrompt} from './pulseforge/shared/director';
import {validateSoundtrack} from './document';
import type {SoundtrackDocument} from './types';
import {applyProduction} from './pulseforge/src/state/production';

export interface ComposeOptions {prompt:string;genre:GenreId;mood:string;bpm:number;key:string;seed:number;bars:number;parts?:ProductionSpec['sections'] extends (infer S)[]|undefined ? S extends {parts?:infer P}?P:never:never}
export function composeSoundtrack(direction:string|ProductionSpec|ComposeOptions):SoundtrackDocument{
  if(typeof direction==='string'){
    const interpreted=directFromPrompt(direction,42).spec;
    return composeSoundtrack({...interpreted,sections:[{name:'Film cue',role:'hook',bars:8,energy:.65,parts:['drums','bass','chords','melody']} ]});
  }
  if('version' in direction){
    const spec=validateProductionSpec(direction);
    return validateSoundtrack({version:1,project:applyProduction(createEmptyProject(spec.title,spec.bpm),buildProduction(spec)),spec});
  }
  const opts=direction;
  if(!Number.isInteger(opts.bars)||opts.bars<1||opts.bars>32)throw new Error('Choose 1–32 bars for each cue.');
  const interpreted=directFromPrompt(opts.prompt,opts.seed).spec;
  const spec=validateProductionSpec({...interpreted,title:interpreted.title,genre:opts.genre,mood:opts.mood,bpm:opts.bpm,key:opts.key,seed:opts.seed,length:'short',sections:[{name:'Film cue',role:'hook',bars:opts.bars,energy:.7,parts:opts.parts??['drums','bass','chords','melody','counter']}]});
  const project=applyProduction(createEmptyProject(spec.title,spec.bpm),buildProduction(spec));
  return validateSoundtrack({version:1,project,spec});
}
