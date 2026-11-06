import type {Project as MusicProject} from './pulseforge/shared/project';
import type {ProductionSpec} from './pulseforge/shared/producer';

/** Editable source travels in the Frame project; rendered WAVs are normal Frame assets. */
export interface SoundtrackDocument {
  version:1;
  project:MusicProject;
  spec?:ProductionSpec;
}
export interface SoundtrackAudioResult {projectId:string;blob:Blob;name:string;duration:number;loop:boolean}
export interface SoundRenderResult {blob:Blob;duration:number;peak:number;peaks:Float32Array;sampleRate:number}
export const SOUND_LIMITS={jsonBytes:4_000_000,channels:48,patterns:128,clips:1024,mixer:64,notes:30_000,effectsPerChannel:12,scoreSeconds:1800,renderSeconds:120,sampleRate:44100} as const;
