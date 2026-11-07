import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {newProject} from '../src/lib/defaults';
import {emptyStory} from '../src/lib/story';
import {createThreeDemo} from '../src/lib/three-project';
import {reuseScene} from '../src/lib/creative-copy';
import {creativeContext,importGolden,injectCreativeContext,listCreativeIndex,listGolden,saveGolden} from '../src/lib/creative-memory';
import {purgeProject,saveProject,setSetting,setTrashed} from '../src/lib/storage';

describe('creative library',()=>{
 it('indexes saved styles and approved notes, respects disable and removes purged sources',async()=>{const p=newProject('Amber observatory');p.story={...emptyStory(),visualStyle:'Amber lanterns and soft moonlight'};p.scenes[0].title='Lantern arrival';await saveProject(p);const id=crypto.randomUUID();await saveGolden({id,kind:'preference',title:'Natural motion',guidance:'Use gentle, grounded movement.',tags:['lantern'],createdAt:1,sourceProjectId:p.id});let context=await creativeContext('another-film','Make an amber lantern story');expect(context).toContain('Amber observatory');expect(context).toContain('grounded movement');await setSetting('creative-memory-enabled',false);expect(await creativeContext('another-film','amber lantern')).toBe('');await setSetting('creative-memory-enabled',true);await setTrashed('projects',p.id,true);expect((await listCreativeIndex()).some(i=>i.projectId===p.id)).toBe(false);await purgeProject(p.id);expect((await listGolden()).some(i=>i.id===id)).toBe(false)});
 it('rejects an invalid reference import without changing existing notes',async()=>{const before=await listGolden();await expect(importGolden([{kind:'scene',title:'Broken'}])).rejects.toThrow();expect(await listGolden()).toEqual(before)});
 it('keeps final continuation instructions last and does not change message indices',()=>{const messages=[{role:'system',content:'system'},{role:'user',content:'Original prompt'},{role:'assistant',content:'prefix'},{role:'user',content:'Continue exactly.'}];const next=injectCreativeContext(messages,'Reference data');expect(next).toHaveLength(4);expect(next[1]).toEqual(messages[1]);expect(next[3].content.endsWith('Continue exactly.')).toBe(true);expect(messages[3].content).toBe('Continue exactly.')});
 it('copies editable 3D scene and model data without changing the original film',()=>{const source=createThreeDemo(),target=newProject('New film'),scene=source.scenes[0],before=JSON.stringify(source);const result=reuseScene(target,source,scene),copy=result.scenes.at(-1)!;expect(copy.id).not.toBe(scene.id);expect(copy.three?.instances.length).toBe(scene.three?.instances.length);for(const item of copy.three?.instances||[])expect(result.models?.some(m=>m.id===item.assetId)).toBe(true);expect(JSON.stringify(source)).toBe(before)});
});
