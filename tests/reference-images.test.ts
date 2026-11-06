import {afterEach,describe,expect,it,vi} from 'vitest';
import {sceneReferenceAssets,sceneReferenceImages} from '../src/lib/reference-images';
import {validateReferenceImages,validateReferenceMode} from '../src/lib/reference-contract';
import {emptyStory} from '../src/lib/story';
import type {Asset,Project,Scene} from '../src/lib/types';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFZkAAAAASUVORK5CYII=';
const JPEG='data:image/jpeg;base64,'+btoa('\xff\xd8\xff'+ 'reference'.repeat(8));
const asset=(id:string,data=PNG):Asset=>({id,name:id,kind:'image',mime:'image/png',data,createdAt:0});
function fixture(){
 const scene:Scene={id:'scene',title:'A shot',duration:5,code:'',notes:'',transition:'cut',color:'#000',layers:[],continuity:{summary:'A meets the tower',characterIds:['a'],locationIds:['tower'],stateAfter:{},mustInclude:[],medium:'video'}};
 const character=(id:string,referenceAssetIds:string[])=>({id,name:id,role:'',appearance:'Same face',personality:'',voice:'',referenceAssetIds,locked:true});
 const project:Project={id:'p',name:'Film',createdAt:0,updatedAt:0,brief:'',settings:{width:1920,height:1080,fps:30,background:'#000',volume:1},scenes:[scene],audio:[],story:{...emptyStory(),characters:[character('a',['portrait','same-model']),character('b',['unrelated'])],locations:[{id:'tower',name:'Tower',description:'',lighting:'',referenceAssetIds:['portrait','tower-image'],locked:true}]},models:[{id:'same-model',name:'Canonical geometry',builtin:'mira'}]};
 return {project,scene,assets:[asset('portrait'),asset('tower-image'),asset('unrelated')]};
}
function mockImage(width=512,height=512,error=false){vi.stubGlobal('Image',class {naturalWidth=width;naturalHeight=height;onload?:()=>void;onerror?:()=>void;set src(_value:string){queueMicrotask(()=>error?this.onerror?.():this.onload?.());}});}
afterEach(()=>vi.unstubAllGlobals());

describe('canonical reference selection and bounded uploads',()=>{
 it('selects only the current cast and location, deduplicates, and skips reusable 3D models',()=>{const f=fixture();expect(sceneReferenceAssets(f.project,f.scene,f.assets).map(a=>a.id)).toEqual(['portrait','tower-image']);});
 it('never attaches all cast images when this scene has no selected cast',async()=>{const f=fixture();f.scene.continuity=undefined;expect(await sceneReferenceImages(f.project,f.scene,f.assets)).toEqual([]);});
 it('rejects missing references rather than silently generating a different face',()=>{const f=fixture();expect(()=>sceneReferenceAssets(f.project,f.scene,[asset('tower-image')])).toThrow('missing');});
 it('requires the user to reduce references instead of silently truncating them',()=>{const f=fixture();f.project.story!.characters[0].referenceAssetIds=['one','two','three','four'];expect(()=>sceneReferenceAssets(f.project,f.scene,['one','two','three','four','portrait','tower-image'].map(id=>asset(id)))).toThrow('at most 3');});
 it('returns untouched embedded bytes for suitably sized images',async()=>{const f=fixture();mockImage();const originals=structuredClone(f.assets);expect(await sceneReferenceImages(f.project,f.scene,f.assets)).toEqual([PNG,PNG]);expect(f.assets).toEqual(originals);});
 it('makes a resized copy of a large reference without changing the stored image',async()=>{const f=fixture();mockImage(2048,1024);const drawImage=vi.fn();const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect:vi.fn(),drawImage}),toDataURL:vi.fn(()=>JPEG)};vi.stubGlobal('document',{createElement:()=>canvas});const images=await sceneReferenceImages(f.project,f.scene,f.assets);expect(images).toEqual([JPEG,JPEG]);expect(canvas.width).toBe(1024);expect(canvas.height).toBe(512);expect(drawImage).toHaveBeenCalledTimes(2);expect(f.assets[0].data).toBe(PNG);});
 it.each([[1,1],[10000,10000]])('rejects unusable reference dimensions %s×%s',async(width,height)=>{const f=fixture();mockImage(width,height);await expect(sceneReferenceImages(f.project,f.scene,f.assets)).rejects.toThrow('65,536');});
 it('surfaces decoding failures before a provider request',async()=>{const f=fixture();mockImage(512,512,true);await expect(sceneReferenceImages(f.project,f.scene,f.assets)).rejects.toThrow('could not be decoded');});
 it.each(['https://example.com/portrait.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,YWJj','data:image/jpeg;base64,%%%','data:image/webp;base64,iVBORw0KGgoAAA=='])('rejects non-uploaded or invalid reference bytes: %s',data=>{expect(()=>validateReferenceImages([data])).toThrow();});
 it('enforces total upload size and exact first/last frame counts',()=>{const large='data:image/png;base64,'+btoa('\x89PNG\r\n\x1a\n'+'A'.repeat(600000));expect(()=>validateReferenceImages([large,large])).toThrow('together');expect(validateReferenceMode('first-last-frame',2)).toBe('first-last-frame');expect(()=>validateReferenceMode('first-frame',2)).toThrow('exactly one');expect(()=>validateReferenceMode('first-last-frame',3)).toThrow('exactly two');});
});
