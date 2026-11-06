export const MOTION_EASINGS=['linear','inOutSine','outCubic','outBack'] as const;
export type MotionEasing=typeof MOTION_EASINGS[number];
export type MotionKind='rect'|'circle'|'text'|'lottie';
export interface MotionTransform {x:number;y:number;scaleX:number;scaleY:number;rotation:number;opacity:number}
/** The destination keyframe's easing controls travel from the previous key. */
export interface MotionKeyframe extends MotionTransform {time:number;easing:MotionEasing}
export interface LottieDocument {v?:string;w:number;h:number;fr:number;ip:number;op:number;layers:Record<string,unknown>[];assets?:Record<string,unknown>[];[key:string]:unknown}
export interface MotionObject {id:string;name:string;kind:MotionKind;width:number;height:number;fill:string;transform:MotionTransform;keyframes:MotionKeyframe[];text?:string;fontSize?:number;fontFamily?:'sans-serif'|'serif'|'monospace';radius?:number;lottie?:LottieDocument;lottieStart?:number;lottieSpeed?:number;lottieLoop?:boolean}
export interface MotionDocument {version:1;width:number;height:number;duration:number;background:string;objects:MotionObject[]}
export interface MotionEngine {ready:Promise<void>;renderAt:(seconds:number)=>void;dispose:()=>void}
