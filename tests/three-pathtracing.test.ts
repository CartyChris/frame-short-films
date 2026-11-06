import {describe,it,expect} from 'vitest';
import {DEFAULT_PATH_TRACING,normalizePathTracing,PATH_TRACING_AGENT_SCHEMA} from '../src/lib/three/pathtracing-types';
import {builtInModels,createThreeDocument,normalizeThreeDocument} from '../src/lib/three/document';
describe('bounded opt-in path tracing',()=>{
 it('keeps old scenes disabled and rejects truthy non-boolean activation',()=>{for(const input of [undefined,null,[],{},'yes',{enabled:'true'}])expect(normalizePathTracing(input)).toEqual(DEFAULT_PATH_TRACING);expect(normalizeThreeDocument(createThreeDocument(),builtInModels).pathTracing).toBeUndefined()});
 it('bounds workload and rejects non-finite values without losing settings',()=>{expect(normalizePathTracing({enabled:true,samples:999,previewSamples:-3,bounces:2.7,renderScale:0})).toEqual({enabled:true,samples:64,previewSamples:1,bounces:3,renderScale:.25});expect(normalizePathTracing({samples:NaN,previewSamples:Infinity,bounces:'8',renderScale:-Infinity})).toEqual(DEFAULT_PATH_TRACING)});
 it('roundtrips the AI-editable document and describes real sampling',()=>{const doc=createThreeDocument();doc.pathTracing={enabled:true,samples:6,previewSamples:2,bounces:3,renderScale:.75};expect(normalizeThreeDocument(JSON.parse(JSON.stringify(doc)),builtInModels).pathTracing).toEqual(doc.pathTracing);expect(PATH_TRACING_AGENT_SCHEMA).toContain('final sample count');expect(PATH_TRACING_AGENT_SCHEMA).toContain('1..64')});
});
