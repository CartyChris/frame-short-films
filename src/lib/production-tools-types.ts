import type {ComfyCloudJob} from './comfy-cloud';
import type {HiggsfieldJob} from './higgsfield-cloud';
import type {FreefieldJob} from './freefield';
export interface CaptionCue {id:string;start:number;end:number;text:string;speaker?:string}
export interface CaptionImport {id:string;name:string;format:'srt'|'vtt'|'whisperx';createdAt:number;offset:number;cues:CaptionCue[];warnings:string[];applied?:boolean}
export interface BeatAnalysis {id:string;name:string;createdAt:number;sourceAssetId?:string;duration:number;tempo?:number;offset:number;beats:number[];onsets:number[];rms?:{time:number;value:number}[];sourceHash?:string}
export interface CutRange {id:string;start:number;end:number;name:string}
export interface CutList {id:string;name:string;createdAt:number;sourceAssetId?:string;ranges:CutRange[];applied?:boolean}
export type ComfyWorkflow=Record<string,{class_type:string;inputs:Record<string,unknown>;_meta?:{title?:string}}>;
export interface ComfyOutput {index:number;node:string;filename:string;subfolder:string;type:'output';kind:'image'|'video'|'audio'}
export interface ComfyJob {id:string;name:string;serverUrl:string;requestedId:string;remoteId?:string;createdAt:number;updatedAt:number;status:'prepared'|'submitting'|'queued'|'running'|'succeeded'|'failed'|'unknown';workflow:ComfyWorkflow;outputs:ComfyOutput[];importedOutputs:number[];error?:string}
export interface ProductionToolsDocument {version:1;captionImports:CaptionImport[];beatAnalyses:BeatAnalysis[];cutLists:CutList[];comfyJobs:ComfyJob[];freefieldJobs?:{serverUrl:string;job:FreefieldJob}[];comfyCloudJobs?:ComfyCloudJob[];higgsfieldJobs?:HiggsfieldJob[]}
export interface ComfyStatus {status:'queued'|'running'|'succeeded'|'failed'|'unknown';remoteId:string;outputs:ComfyOutput[];error?:string}
