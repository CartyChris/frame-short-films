import type {ProductionToolsDocument} from './production-tools-types';
import type {MotionDocument} from './motion/types';
import type {IntegrationJob} from './integrations';
import type {ThreeDocument,ModelAsset} from './three/types';
import type {StoryBible,SceneContinuity,ProductionQueue} from './story-types';
import type {DirectorChat} from './chat-types';
import type {CharacterDesign,CastScene} from './casting-types';
import type {SoundtrackDocument} from './sound/types';
import type {PipelineRun} from './pipeline-types';
export type Theme = 'noir'|'paper'|'aurora'|'cosmos';
export type AssetKind = 'image'|'video'|'audio';
export interface Asset {id:string;name:string;kind:AssetKind;mime:string;data:string;createdAt:number;duration?:number;source?:string}
export interface Layer {id:string;assetId:string;name:string;type:AssetKind|'text';text?:string;start:number;duration:number;x:number;y:number;width:number;opacity:number;rotation:number;blend:string;volume:number;muted:boolean;loop:boolean;fadeIn:number;fadeOut:number;trim:number;envelopeOffset?:number;envelopeDuration?:number}
export interface Scene {id:string;title:string;duration:number;code:string;notes:string;transition:'cut'|'dissolve'|'fade';color:string;layers:Layer[];template?:string;sourceOffset?:number;three?:ThreeDocument;motion?:MotionDocument;cast?:CastScene;continuity?:SceneContinuity}
export interface Project {id:string;name:string;createdAt:number;updatedAt:number;scenes:Scene[];audio:Layer[];settings:{width:number;height:number;fps:number;background:string;volume:number};brief:string;models?:ModelAsset[];hiddenModelIds?:string[];story?:StoryBible;production?:ProductionQueue[];integrationJobs?:IntegrationJob[];productionTools?:ProductionToolsDocument;sceneAliases?:Record<string,string>;assetAliases?:Record<string,string>;chat?:DirectorChat;castDesigns?:Record<string,CharacterDesign>;soundtrack?:SoundtrackDocument;pipelines?:PipelineRun[]}
export interface ProviderConnection {id:string;provider:string;name:string;model:string;apiKey:string;baseUrl?:string;bridgeUrl?:string;bridgeToken?:string;temperature:number;maxTokens:number}
export interface Model {id:string;name:string;contextLength?:number;modalities?:string[];kind?:string;pricing?:Record<string,string>;voices?:string[]}
export interface GenerationRun {id:string;projectId:string;sceneId:string;prompt:string;provider:string;model:string;status:'streaming'|'interrupted'|'complete'|'applied';createdAt:number;updatedAt:number;parentId?:string;baseText:string;lastSeq:number;error?:string;finishReason?:string;purpose?:'scene'|'plan'|'director'|'orchestrator';format?:'html'|'story-plan'|'motion-scene'|'three-scene'|'director-chat'|'studio-command';queueId?:string;queueItemId?:string;chatMessageId?:string;pipelineId?:string;taskId?:string}
export interface Chunk {runId:string;seq:number;text:string;createdAt:number}
export interface Revision {id:string;projectId:string;sceneId:string;code:string;title:string;createdAt:number;scene?:Scene}
export interface MediaJob {id:string;projectId:string;sceneId:string;provider:string;model:string;kind:'image'|'video';prompt:string;status:string;remoteId?:string;downloadUrl?:string;createdAt:number;error?:string;queueId?:string;queueItemId?:string;assetId?:string}
export type StreamEvent={type:'delta';text:string}|{type:'done';finishReason:string}|{type:'error';message:string};
export interface GenerateRequest {provider:string;apiKey:string;baseUrl?:string;model:string;messages:{role:string;content:string}[];temperature?:number;maxTokens?:number}
export interface MediaRequest {action:'image'|'video-start'|'video-poll'|'video-content';provider:string;apiKey:string;model:string;prompt?:string;jobId?:string;downloadUrl?:string;aspectRatio?:string;duration?:number;resolution?:string;width?:number;height?:number;referenceImages?:string[];referenceMode?:'reference'|'first-frame'|'first-last-frame'}
