import {useState} from 'react';
import {Trash2} from 'lucide-react';
import type {Asset,Project} from '../lib/types';
import {purgeAsset,purgeProject,purgeRevision,purgeRun} from '../lib/storage';
import './RecoveryTrash.css';

type Kind='projects'|'assets'|'runs'|'revisions';
interface DeleteProps {kind:Kind;id:string;name:string;projectId?:string;onComplete:()=>Promise<void>|void;disabled?:boolean}
/** A deliberate, two-step action. Never silently erase shared media or exported/native copies. */
export function PermanentRecoveryButton({kind,id,name,projectId,onComplete,disabled}:DeleteProps){
 const [confirming,setConfirming]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const message=kind==='projects'?'This permanently deletes this film, its attached files, drafts, and saved versions from this device. Shared media, exported files, and Mac disk backups are kept.':kind==='assets'?'This permanently deletes this media from this device only if no saved film, attached file, or recovery record still uses it. Exported backups are kept.':kind==='runs'?'This permanently deletes this draft and its saved chunks. Drafts still referenced by a film or a later draft cannot be deleted.':'This permanently deletes this saved scene version. Other copies and backups are kept.';
 async function remove(){if(busy)return;setBusy(true);setError('');try{if(kind==='projects')await purgeProject(id);else if(kind==='assets')await purgeAsset(id);else if(kind==='runs')await purgeRun(id,projectId||'');else await purgeRevision(id,projectId||'');await onComplete();setConfirming(false)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <span className="recovery-permanent">
  {!confirming?<button className="text-button danger" type="button" disabled={disabled} aria-label={`Delete ${name} permanently`} onClick={()=>{setError('');setConfirming(true)}}><Trash2 size={13}/>Delete permanently</button>:
   <span className="recovery-confirm" role="group" aria-label={`Confirm permanent deletion of ${name}`}><span>{message}</span><span className="row"><button className="secondary" type="button" disabled={busy} onClick={()=>{setConfirming(false);setError('')}}>Cancel</button><button className="danger-button" type="button" disabled={busy} onClick={()=>void remove()}>{busy?'Deleting…':'Confirm permanent deletion'}</button></span>{error&&<span role="alert">{error}</span>}</span>}
 </span>;
}
interface TrashProps {projects:Project[];assets:Asset[];onRestore:(kind:'projects'|'assets',id:string)=>Promise<void>|void;onChanged:()=>Promise<void>|void;disabled?:boolean}
export function RecoveryTrash({projects,assets,onRestore,onChanged,disabled}:TrashProps){
 const items=[...projects.map(p=>({id:p.id,name:p.name,kind:'projects' as const})),...assets.map(a=>({id:a.id,name:a.name,kind:'assets' as const}))];
 return <div className="recovery-trash"><h3>Recently removed</h3>{items.length===0&&<p className="empty-note">Removed films and media appear here.</p>}{items.map(item=><div className="recovery-trash-item" key={item.kind+item.id}><strong>{item.name}</strong><div className="row"><button className="text-button" type="button" disabled={disabled} onClick={()=>void onRestore(item.kind,item.id)}>Restore</button><PermanentRecoveryButton {...item} onComplete={onChanged} disabled={disabled}/></div></div>)}</div>;
}
