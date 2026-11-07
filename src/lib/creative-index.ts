import type {Project} from './types';
export const CREATIVE_INDEX_PREFIX='creative-index:';
export interface CreativeIndex {projectId:string;name:string;style:string;characters:string[];scenes:string[];updatedAt:number}
export function creativeIndex(project:Project):CreativeIndex{return {projectId:project.id,name:(project.name||'').slice(0,200),style:(project.story?.visualStyle||'').slice(0,1500),characters:[...(project.story?.characters||[]).map(c=>c.name),...(project.models||[]).filter(m=>!m.builtin||m.sourceFormat==='Frame Casting'||m.sourceFormat==='Frame AI parts').map(m=>m.name)].filter(Boolean).slice(0,40).map(v=>v.slice(0,120)),scenes:project.scenes.slice(0,40).map(s=>s.title.slice(0,120)),updatedAt:project.updatedAt}}
