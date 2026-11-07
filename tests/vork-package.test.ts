import {describe,it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {unpackVorkPackage} from '../src/lib/three/vork-package';
describe('Vork source packages',()=>{
 it('preserves scene, Slang and asset paths',()=>{const result=unpackVorkPackage(zipSync({'scene.json':strToU8('{}'),'programs/look.slang':strToU8('import vork;'),'assets/texture.png':new Uint8Array([1,2])}));expect(Object.keys(result)).toEqual(['scene.json','programs/look.slang','assets/texture.png'])});
 it('rejects traversal, reserved files and missing scenes',()=>{expect(()=>unpackVorkPackage(zipSync({'../scene.json':strToU8('{}')}))).toThrow();expect(()=>unpackVorkPackage(zipSync({'scene.json':strToU8('{}'),'record.json':strToU8('{}')}))).toThrow();expect(()=>unpackVorkPackage(zipSync({'look.slang':strToU8('test')}))).toThrow()});
});
