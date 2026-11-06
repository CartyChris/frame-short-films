export interface PipelineSettings {
 duration:number;mode:'planned'|'code'|'3d'|'motion'|'cast';music:boolean;narration:boolean;voice:string;
 assembleOnly:boolean;maxRequests:number;imageModel:string;videoModel:string;mediaConnectionId:string;portraits:boolean;
}
export interface PipelineTask {id:string;kind:'plan'|'design'|'portrait'|'scene'|'overlay'|'score'|'narration';label:string;targetId?:string;status:'pending'|'running'|'complete'|'blocked';runId?:string;attempts:number;error?:string;assetId?:string;jobId?:string;basis?:string;resultText?:string}
export interface PipelineRun {id:string;createdAt:number;updatedAt:number;brief:string;queueId?:string;state:'ready'|'running'|'paused'|'complete';settings:PipelineSettings;tasks:PipelineTask[];requests:number;messageId:string}
export const defaultPipelineSettings=():PipelineSettings=>({duration:30,mode:'3d',music:true,narration:false,voice:'af_heart',assembleOnly:true,maxRequests:100,imageModel:'',videoModel:'',mediaConnectionId:'',portraits:false});
