import {describe,it,expect} from 'vitest';
import {build} from './helpers/browser-build';

describe('browser fixture bundling',()=>{
 it('bundles real Lucide icons and preserves caller aliases',async()=>{
  const result=await build({stdin:{contents:"import React from 'fixture-react'; import {Check} from 'lucide-react'; globalThis.fixture = [React,Check];",resolveDir:process.cwd(),loader:'js'},alias:{'fixture-react':'react'},bundle:true,write:false,format:'iife'});
  const code=result.outputFiles[0].text;
  expect(code).toContain('svg');
  expect(code).toContain('fixture');
 });
 it('bundles the real Web Audio wrapper',async()=>{
  const result=await build({stdin:{contents:"import {AudioContext,OfflineAudioContext} from 'standardized-audio-context'; globalThis.fixtureAudio = [AudioContext,OfflineAudioContext];",resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'iife'});
  expect(result.outputFiles[0].text).toContain('fixtureAudio');
 },30000);
});
