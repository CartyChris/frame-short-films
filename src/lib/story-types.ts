export type StoryMedium='code'|'3d'|'motion'|'video'|'mixed';
export interface StoryCharacter {id:string;name:string;role:string;appearance:string;personality:string;voice:string;referenceAssetIds:string[];locked:boolean}
export interface StoryLocation {id:string;name:string;description:string;lighting:string;referenceAssetIds:string[];locked:boolean}
export interface StoryBible {version:1;logline:string;world:string;visualStyle:string;lockedFacts:string[];initialState:Record<string,string>;targetDuration:number;characters:StoryCharacter[];locations:StoryLocation[]}
export interface SceneContinuity {summary:string;characterIds:string[];locationIds:string[];stateAfter:Record<string,string>;mustInclude:string[];medium:StoryMedium}
export type ProductionStatus='draft'|'ready'|'running'|'paused'|'review'|'complete';
export type ProductionItemStatus='pending'|'running'|'review'|'applied'|'skipped'|'interrupted';
export interface ProductionItem {id:string;sceneId?:string;title:string;instruction:string;summary:string;duration:number;medium:StoryMedium;characterIds:string[];locationIds:string[];stateAfter:Record<string,string>;status:ProductionItemStatus;runId?:string;error?:string}
export interface ProductionQueue {id:string;title:string;instruction:string;scope:'film'|'selected'|'new';status:ProductionStatus;createdAt:number;updatedAt:number;planRunId?:string;items:ProductionItem[]}
export type GenerationFormat='html'|'story-plan'|'motion-scene'|'three-scene'|'director-chat'|'studio-command';
