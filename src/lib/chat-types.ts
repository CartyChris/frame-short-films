import type {StoryBible,StoryCharacter,StoryLocation,ProductionQueue} from './story-types';
export interface DirectorQuestion {id:string;question:string;choices?:string[]}
export type DirectorStoryPatch=Partial<Pick<StoryBible,'logline'|'world'|'visualStyle'|'lockedFacts'|'initialState'|'targetDuration'>>;
export interface DirectorProposal {id:string;title:string;summary:string;story?:DirectorStoryPatch;characters:StoryCharacter[];locations:StoryLocation[];plan?:ProductionQueue}
export interface DirectorResponse {version:1;reply:string;questions:DirectorQuestion[];proposal?:DirectorProposal}
export interface DirectorMessage {id:string;role:'user'|'assistant';createdAt:number;text?:string;runId?:string;attemptRunIds?:string[];replyTo?:string;answers?:Record<string,string>;attachmentIds?:string[];visionAttachmentIds?:string[];attachmentContext?:string;autoProceed?:boolean;source?:'ai'|'guide';basis?:StoryBible;response?:DirectorResponse;application?:{at:number;queueId?:string}}
export interface DirectorChat {version:1;messages:DirectorMessage[];executionMode?:'review'|'auto';mediaAliases?:Record<string,string>}
export interface DirectorRemap {runId:(id:string)=>string;mediaId:(id:string)=>string;sceneId:(id:string)=>string;queueId:(id:string)=>string;itemId?:(id:string)=>string;mediaIds?:string[];attachmentId?:(id:string)=>string}
