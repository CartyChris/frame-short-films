import {useEffect,useRef,useState} from 'react';
import {cancelCloudJob,pollCloudJob,recoverComfyCloudJob,submitCloudJob,type ComfyCloudJob} from '../lib/comfy-cloud';
import './ComfyCloudPanel.css';

export interface ComfyCloudPanelProps {
 /** Supply the saved jobs for this film and remount the panel when the film changes. */
 initialJobs:ComfyCloudJob[];
 /** Must resolve only after the originating film's project has been durably saved. */
 onSave:(job:ComfyCloudJob)=>Promise<void>;
 workflowText?:string;
}
export function ComfyCloudPanel({initialJobs,onSave,workflowText=''}:ComfyCloudPanelProps){
 const [baseUrl,setBaseUrl]=useState('https://cloud.comfy.org'),[key,setKey]=useState(''),[name,setName]=useState('Cloud workflow'),[workflow,setWorkflow]=useState(workflowText),[reviewed,setReviewed]=useState(false),[partner,setPartner]=useState(false),[jobs,setJobs]=useState(()=>initialJobs.map(recoverComfyCloudJob)),[busy,setBusy]=useState(''),[error,setError]=useState(''),[confirmCancel,setConfirmCancel]=useState('');
 const active=useRef(false),mounted=useRef(true),controller=useRef<AbortController|undefined>(undefined);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort()}},[]);
 useEffect(()=>{if(!active.current)setJobs(initialJobs.map(recoverComfyCloudJob))},[initialJobs]);
 async function save(job:ComfyCloudJob){await onSave(job);if(mounted.current)setJobs(current=>[...current.filter(item=>item.id!==job.id),job])}
 async function run(label:string,work:(signal:AbortSignal)=>Promise<unknown>){if(active.current)return;active.current=true;const abort=new AbortController();controller.current=abort;setBusy(label);setError('');try{await work(abort.signal)}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'The cloud request could not be completed.')}finally{active.current=false;controller.current=undefined;if(mounted.current)setBusy('')}}
 return <section className="comfy-cloud-panel" aria-label="Comfy Cloud">
  <div className="comfy-cloud-heading"><div><h3>Comfy Cloud</h3><p>Run a reviewed API workflow on Comfy Cloud or your own official deployment.</p></div></div>
  <p className="comfy-cloud-note">Comfy Cloud API access requires a paid plan. Runs and partner nodes may use credits. Your key is sent to your configured Frame backend and Comfy for each request; it is never saved in the film.</p>
  <div className="comfy-cloud-grid"><label>Cloud or deployment address<input aria-label="Comfy Cloud address" value={baseUrl} disabled={!!busy} onChange={e=>{setBaseUrl(e.target.value);setReviewed(false)}} placeholder="https://cloud.comfy.org"/></label><label>Comfy API key<input aria-label="Comfy API key" type="password" autoComplete="off" value={key} disabled={!!busy} onChange={e=>setKey(e.target.value)}/></label><label>Job name<input aria-label="Comfy Cloud job name" value={name} maxLength={250} disabled={!!busy} onChange={e=>setName(e.target.value)}/></label></div>
  <label className="comfy-cloud-label">API-format workflow<textarea aria-label="Comfy Cloud API workflow" value={workflow} disabled={!!busy} onChange={e=>{setWorkflow(e.target.value);setReviewed(false)}} placeholder={'{"1":{"class_type":"...","inputs":{}}}'}/></label>
  <label className="comfy-cloud-check"><input type="checkbox" checked={partner} disabled={!!busy} onChange={e=>setPartner(e.target.checked)}/>Allow this Comfy key to be sent to partner nodes in the workflow.</label>
  <label className="comfy-cloud-check"><input type="checkbox" checked={reviewed} disabled={!!busy} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the workflow and understand that running it can use credits.</label>
  <button className="primary" disabled={!!busy||!reviewed||!workflow.trim()||!key} onClick={()=>void run('Submitting workflow',async signal=>{await submitCloudJob(name,baseUrl,workflow,key,partner,save,signal);if(mounted.current)setReviewed(false)})}>Save cloud job &amp; submit once</button>
  <p className="comfy-cloud-note">A lost response is marked unknown and never resubmitted automatically. Open Comfy job history to investigate it. Output metadata is shown here; downloading and importing cloud outputs is not implemented yet.</p>
  {busy&&<p role="status">{busy}…</p>}{error&&<p className="comfy-cloud-error" role="alert">{error}</p>}
  <div className="comfy-cloud-jobs">{jobs.slice().reverse().map(original=>{const job=recoverComfyCloudJob(original),cancelable=!!job.remoteId&&!['succeeded','failed','canceled','expired'].includes(job.status);return <article key={job.id} className="comfy-cloud-job"><div className="comfy-cloud-job-heading"><div><strong>{job.name}</strong><p>{job.status} · {new Date(job.updatedAt).toLocaleString()}</p></div><button className="secondary" disabled={!!busy||!job.remoteId} onClick={()=>void run('Checking status',signal=>pollCloudJob(job,key,save,signal))}>Check status</button></div><code>{job.remoteId||job.requestId}</code>{job.error&&<p className="comfy-cloud-note">{job.error}</p>}{job.progress!==undefined&&<p>Progress: {Math.round(job.progress*100)}%</p>}{job.outputs.map(item=><p className="comfy-cloud-output" key={item.id}>{item.name||item.id} · {item.type}{item.sizeBytes!==null?` · ${item.sizeBytes.toLocaleString()} bytes`:''}</p>)}{cancelable&&(confirmCancel===job.id?<div className="comfy-cloud-confirm"><span>Cancel this cloud job? Work already used may still be billed.</span><button className="secondary" disabled={!!busy} onClick={()=>{setConfirmCancel('');void run('Requesting cancellation',signal=>cancelCloudJob(job,key,save,signal))}}>Confirm cancellation</button><button className="text-button" onClick={()=>setConfirmCancel('')}>Keep running</button></div>:<button className="text-button" disabled={!!busy} onClick={()=>setConfirmCancel(job.id)}>Cancel job</button>)}</article>})}</div>
 </section>;
}
