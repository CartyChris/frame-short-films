import type {QuarksDocument} from './quarks-types';
import type {PhysicsDocument} from './physics-types';
import type {PathTracingSettings} from './pathtracing-types';
export type Vec3=[number,number,number];
export type BuiltinModel='ava'|'leo'|'mira'|'tree'|'house'|'arch'|'lantern'|'rock';
export interface Appearance {skin:string;hair:string;shirt:string;pants:string;accent?:string;hairStyle?:'curly'|'short'|'bob';bodyScale?:number}
export type ProceduralJoint='body'|'head'|'armL'|'armR'|'elbowL'|'elbowR'|'legL'|'legR'|'kneeL'|'kneeR';
export interface ProceduralPart {id:string;name:string;shape:'box'|'sphere'|'cylinder'|'cone'|'torus';color:string;position:Vec3;rotation:Vec3;scale:Vec3;parent?:string;pivot?:Vec3;joint?:ProceduralJoint}
export interface ProceduralModel {version:1;parts:ProceduralPart[]}
export interface ModelAsset {procedural?:ProceduralModel;id:string;name:string;data?:string;builtin?:BuiltinModel;appearance?:Appearance;clips?:string[];sourceFormat?:string}
export interface TransformKeyframe {time:number;position?:Vec3;rotation?:Vec3;scale?:Vec3;easing?:'linear'|'ease'}
export interface CameraKeyframe {time:number;position:Vec3;target:Vec3;fov?:number;easing?:'linear'|'ease'}
export interface ThreeInstance {id:string;assetId:string;name:string;position:Vec3;rotation:Vec3;scale:Vec3;visible:boolean;animation:{preset:'idle'|'walk'|'wave'|'dance'|'none';speed:number;phase:number;path?:Vec3[];clip?:string};keyframes?:TransformKeyframe[]}
export interface ThreeDocument {version:1;physics?:PhysicsDocument;quarks?:QuarksDocument;pathTracing?:PathTracingSettings;duration:number;postprocessing?:ThreePostprocessing;environment:{preset:'meadow'|'city'|'cosmos'|'studio';sky:string;ground:string;fog:boolean;lightIntensity:number;particles:boolean;geometry?:boolean;defaultLights?:boolean};camera:{position:Vec3;target:Vec3;fov:number;motion:'static'|'orbit'|'dolly';amplitude:number;keyframes?:CameraKeyframe[]};instances:ThreeInstance[];title?:string;subtitle?:string}
export interface TransformValue {position:Vec3;rotation:Vec3;scale:Vec3}
export interface EditorCamera {position:Vec3;target:Vec3;fov:number}
export interface ThreePostprocessing {enabled:boolean;bloom:number;bloomThreshold:number;vignette:number;brightness:number;contrast:number;hue:number;saturation:number;exposure:number}
