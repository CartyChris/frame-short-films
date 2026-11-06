import {describe,it,expect} from 'vitest';
import {ease,locateScene} from '../src/lib/wasm';
describe('timeline core fallback',()=>{
 it('preserves final frames and advances exactly at scene boundaries',()=>{
  expect(locateScene([3,5,4],3)).toEqual({index:1,localTime:0});
  expect(locateScene([3,5,4],12)).toEqual({index:2,localTime:4});
  expect(locateScene([3,5,4],1e6)).toEqual({index:2,localTime:4});
 });
 it('handles empty and malformed timelines',()=>{
  expect(locateScene([],10)).toEqual({index:-1,localTime:0});
  expect(locateScene([0,NaN,-1,5,0],-2)).toEqual({index:3,localTime:0});
  expect(ease(NaN)).toBe(0);expect(ease(.5)).toBe(.5);
 });
 it('supports long films',()=>expect(locateScene(Array(10000).fill(10),98765)).toEqual({index:9876,localTime:5}));
});
