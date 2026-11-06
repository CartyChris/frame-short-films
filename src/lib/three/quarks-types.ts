export type QuarksVec3=[number,number,number];
export type QuarksPreset='fireflies'|'sparks'|'snow'|'confetti';
export interface QuarksEmitter {
 id:string;name:string;enabled:boolean;preset:QuarksPreset;seed:number;
 position:QuarksVec3;direction:QuarksVec3;shape:'point'|'sphere'|'cone'|'box';radius:number;spread:number;
 rate:number;life:[number,number];speed:[number,number];size:[number,number];
 color:string;endColor:string;opacity:number;gravity:QuarksVec3;drag:number;rotationSpeed:number;
 /** Source-clock start, emission duration, and repeat of the full emission-plus-tail cue. */
 start:number;duration:number;loop:boolean;blending:'additive'|'normal';
}
export interface QuarksDocument {version:1;enabled:boolean;emitters:QuarksEmitter[]}
