import {invoke} from '@tauri-apps/api/core';
import type {Project} from './types';
import {createArchive,importArchive} from './storage';
export const isNative=()=> '__TAURI_INTERNALS__' in window;
export interface NativeBackup {id:string;projectId:string;bytes:number;createdAtMs:number}
export async function nativeBackup(project:Project){if(!isNative())return;return invoke<NativeBackup>('save_project_backup',{projectId:project.id,source:JSON.stringify(await createArchive(project))})}
export async function nativeBackups(projectId:string){if(!isNative())return [];return invoke<NativeBackup[]>('list_project_backups',{projectId})}
export async function restoreNative(projectId:string,backupId:string){const source=await invoke<string>('read_project_backup',{projectId,backupId});return importArchive(JSON.parse(source))}

export async function openExportsFolder(){if(isNative())await invoke('open_exports_folder')}
