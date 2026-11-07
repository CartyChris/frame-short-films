import {describe,it,expect} from 'vitest';
import {newProject,newScene} from '../src/lib/defaults';
import {mayReplacePristineStarter} from '../src/lib/chat-production';

function ready(){const p=newProject();p.production=[{id:'plan',scope:'new',title:'Plan',status:'draft',instruction:'A story',items:[],createdAt:0,updatedAt:0} as any];return p}
describe('Chat production preserves the user’s work',()=>{
 it('recognizes only the untouched starter scene in a new plan',()=>{const p=ready();expect(mayReplacePristineStarter(p,'plan')).toBe(true);p.scenes[0].title='My own shot';expect(mayReplacePristineStarter(p,'plan')).toBe(false)});
 it('keeps edited code, media, additional scenes, and existing-film plans',()=>{const p=ready();p.scenes[0].code+=' ';expect(mayReplacePristineStarter(p,'plan')).toBe(false);const withAudio=ready();withAudio.audio.push({assetId:'sound'} as any);expect(mayReplacePristineStarter(withAudio,'plan')).toBe(false);const multiple=ready();multiple.scenes.push(newScene());expect(mayReplacePristineStarter(multiple,'plan')).toBe(false);const revision=ready();revision.production![0].scope='film';expect(mayReplacePristineStarter(revision,'plan')).toBe(false)});
});
