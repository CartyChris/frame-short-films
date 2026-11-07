import type {Project,Scene} from './types';
import {newProject} from './defaults';

/** Only the original, completely untouched starter shot can be replaced automatically.
 * The pipeline writes a revision before removing it; every edited scene is kept. */
export function mayReplacePristineStarter(project:Project,queueId:string):boolean {
 if(project.scenes.length!==1||project.audio.length||project.production?.find(q=>q.id===queueId)?.scope!=='new')return false;
 const withoutId=(scene:Scene)=>{const {id:_id,...rest}=scene;return rest};
 return JSON.stringify(withoutId(project.scenes[0]))===JSON.stringify(withoutId(newProject().scenes[0]));
}
