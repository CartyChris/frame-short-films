import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {createArchive,importArchive,saveProject} from '../src/lib/storage';
import {normalizeHiggsfieldJob} from '../src/lib/higgsfield-cloud';
import type {Project} from '../src/lib/types';

describe('Higgsfield project backup',()=>{
 it('restores the original prompt, generation inputs, reference URL and request IDs without credentials',async()=>{const job=normalizeHiggsfieldJob({operationId:'ee5b45a5-c28a-469e-99ac-0b65a0df8118',requestId:'d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff',model:'kling-video/v2.5-turbo/pro/image-to-video',status:'queued',createdAt:1,updatedAt:1,outputs:[],inputs:{prompt:'A fox walks through a forest',image_url:'https://images.example.com/ref.png?signature=private',duration:5}});const project:Project={id:crypto.randomUUID(),name:'Cloud film',createdAt:0,updatedAt:0,brief:'',settings:{width:1280,height:720,fps:24,background:'#000',volume:1},audio:[],scenes:[{id:crypto.randomUUID(),title:'Shot',duration:10,code:'<html/>',notes:'',transition:'cut',color:'#000',layers:[]}],productionTools:{version:1,captionImports:[],beatAnalyses:[],cutLists:[],comfyJobs:[],higgsfieldJobs:[job]}};await saveProject(project);const archive=await createArchive(project),text=JSON.stringify(archive);expect(text).not.toContain('apiSecret');expect(text).toContain('A fox walks through a forest');const restored=await importArchive(archive);expect(restored.id).not.toBe(project.id);expect(restored.productionTools?.higgsfieldJobs?.[0]).toEqual(job)});
});
