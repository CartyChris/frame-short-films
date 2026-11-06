import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {PHONEMIZER_RUNTIME,verifyPhonemizer} from '../src/lib/local-phonemizer';
describe('optional upstream phonemizer integrity',()=>{
 it('accepts only bytes matching the pinned publisher package',async()=>{const source=new Uint8Array(await readFile('node_modules/phonemizer/dist/phonemizer.js'));expect(source.byteLength).toBe(PHONEMIZER_RUNTIME.bytes);await expect(verifyPhonemizer(source.buffer)).resolves.toBeUndefined();source[100]^=1;await expect(verifyPhonemizer(source.buffer)).rejects.toThrow('fingerprint');});
 it('rejects truncation before executing anything',async()=>{await expect(verifyPhonemizer(new ArrayBuffer(100))).rejects.toThrow('unexpected size');});
});
