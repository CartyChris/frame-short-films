import {describe,it,expect} from 'vitest';
import {newThreeScene,createThreeDemo} from '../src/lib/three-project';
describe('blank and opt-in 3D shots',()=>{
 it('starts empty while honoring an explicitly requested environment',()=>{const blank=newThreeScene();expect(blank.three?.instances).toEqual([]);expect(blank.three?.environment.preset).toBe('studio');expect(blank.three?.environment.geometry).toBe(false);expect(newThreeScene('meadow').three?.environment.preset).toBe('meadow')});
 it('only loads the example cast when requested',()=>{const demo=createThreeDemo();expect(demo.scenes).toHaveLength(4);expect(demo.scenes.every(s=>(s.three?.instances.length||0)>0)).toBe(true)});
});
