import {afterEach,describe,expect,it,vi} from 'vitest';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('@tauri-apps/api/core',()=>({invoke}));
import {download} from '../src/lib/storage';
afterEach(()=>{vi.unstubAllGlobals();invoke.mockReset()});
function bridge(){const events:any[]=[];let complete!:(value:any)=>void;const result=new Promise<any>(resolve=>complete=resolve);vi.stubGlobal('window',{__TAURI_INTERNALS__:{},dispatchEvent(event:CustomEvent){events.push(event.detail);if(!event.detail.pending)complete(event.detail)}});vi.stubGlobal('FileReader',class{constructor(){throw new Error('Native exports must not depend on FileReader')}});return {events,result};}
describe('native export delivery',()=>{
 it('converts arbitrary binary across chunk boundaries and reports completion only after native write',async()=>{const {events,result}=bridge();const bytes=Uint8Array.from({length:100001},(_,i)=>i%256);invoke.mockResolvedValue('/Downloads/Frame exports/film.glb');download(new Blob([bytes]),'film.glb');expect(await result).toEqual({path:'/Downloads/Frame exports/film.glb'});expect(events[0]).toEqual({pending:true});expect(invoke).toHaveBeenCalledTimes(1);expect(invoke.mock.calls[0][0]).toBe('save_export');expect(Buffer.from(invoke.mock.calls[0][1].base64,'base64')).toEqual(Buffer.from(bytes));});
 it('preserves Unicode source exactly and surfaces a failed native writer',async()=>{const {events,result}=bridge();invoke.mockRejectedValue(new Error('Disk full'));const source='<!doctype html>\nAva • Mira — 世界\u0000';download(source,'scene.html','text/html');expect((await result).error).toContain('Disk full');expect(Buffer.from(invoke.mock.calls[0][1].base64,'base64').toString('utf8')).toBe(source);expect(events.some(e=>e.path)).toBe(false);});
});
