import {describe,it,expect} from 'vitest';
import {defaultDesign,puppetSvg,validateDesign} from '../src/lib/casting';
describe('2D character rig',()=>{
 it('renders articulated arms in front of the torso and keeps a stable resting pose',()=>{const d=defaultDesign();const a=puppetSvg(d,0,'rest'),b=puppetSvg(d,5,'rest');for(const part of ['left-arm','right-arm']){expect(a.indexOf(`data-part="${part}"`)).toBeGreaterThan(a.indexOf('data-part="torso"'));const transform=(s:string)=>s.match(new RegExp(`data-part="${part}" transform="([^"]+)"`))?.[1];expect(transform(a)).toEqual(transform(b))}expect(a).toContain('translate(0 39)')});
 it('supports adjustable poses and rejects invalid dimensions',()=>{const d=defaultDesign();d.rig={armSpread:30,armLength:.8};validateDesign(d);expect(puppetSvg(d,0,'rest')).toContain('rotate(30)');d.rig.armSpread=-1;expect(()=>validateDesign(d)).toThrow()});
});
