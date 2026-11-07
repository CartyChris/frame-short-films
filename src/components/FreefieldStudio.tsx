import {useRef,useState} from 'react';
import {freefieldDefaults,parseFreefieldCatalog,validateFreefieldValues,type FreefieldApp,type FreefieldInput,type FreefieldJob,type FreefieldOutput,type FreefieldScalar,type FreefieldSubmit,type FreefieldValues} from '../lib/freefield';
import './FreefieldStudio.css';

export interface FreefieldStudioProps {
 connected:boolean;
 /** Pair the companion and local server. No network request is made by this component. */
 onConnect:()=>Promise<void>;
 /** Return the public Freefield {apps:[...]} catalog through the paired adapter. */
 onDiscover:()=>Promise<unknown>;
 /** The adapter must journal requestId before dispatch and never retry an uncertain submission. */
 onSubmit:(request:FreefieldSubmit)=>Promise<FreefieldJob>;
 onStatus:(jobId:string)=>Promise<FreefieldJob>;
 /** Import by a validated output identity, never by an arbitrary catalog URL. */
 onImport:(job:FreefieldJob,output:FreefieldOutput)=>Promise<void>;
 /** Restore a persisted job supplied by the adapter after reopening the studio. */
 initialJob?:FreefieldJob;
 onJobChange?:(job:FreefieldJob)=>void;
}

export function FreefieldStudio(props:FreefieldStudioProps){
 const [apps,setApps]=useState<FreefieldApp[]>([]),[rejected,setRejected]=useState(0),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[section,setSection]=useState('all'),[values,setValues]=useState<FreefieldValues>({}),[preset,setPreset]=useState(''),[job,setJob]=useState<FreefieldJob|undefined>(props.initialJob),[busy,setBusy]=useState(''),[error,setError]=useState(''),[unknown,setUnknown]=useState(false);
 const lock=useRef(false);const app=apps.find(a=>a.id===selected);
 async function perform(kind:string,fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(kind);setError('');try{await fn()}catch(e){setError((e as Error).message||String(e))}finally{lock.current=false;setBusy('')}}
 function select(next:FreefieldApp){setSelected(next.id);setValues(freefieldDefaults(next));setPreset('');setError('')}
 function change(id:string,value:FreefieldValues[string]){setValues(v=>({...v,[id]:value}))}
 function setCurrentJob(next:FreefieldJob){setJob(next);props.onJobChange?.(next)}
 async function submit(){if(!app)return;try{validateFreefieldValues(app,values,preset||undefined)}catch(e){setError((e as Error).message);return}const request:FreefieldSubmit={requestId:crypto.randomUUID(),appId:app.id,values,preset:preset||undefined};await perform('submit',async()=>{try{const result=await props.onSubmit(request);setCurrentJob(result)}catch(e){setUnknown(true);throw new Error(`The submission may have reached the server. Check its history before starting another run. ${String(e)}`)}})}
 const visible=apps.filter(a=>(section==='all'||a.section===section)&&(a.name+' '+a.summary).toLowerCase().includes(search.toLowerCase()));
 return <section className="freefield-studio" aria-label="Freefield workflows"><header><div><h3>Freefield workflows</h3><p>Discover workflows from your paired local server, adjust inputs, and bring finished media into Frame.</p></div>{!props.connected?<button className="secondary" disabled={!!busy} onClick={()=>void perform('connect',props.onConnect)}>Connect local server</button>:<button className="secondary" disabled={!!busy} onClick={()=>void perform('discover',async()=>{const result=parseFreefieldCatalog(await props.onDiscover());setApps(result.apps);setRejected(result.rejected);setSelected('');setValues({});setPreset('')})}>Discover workflows</button>}</header>
 <p className="hint">Freefield and its models run separately. Availability, hardware, downloads, and model licenses depend on your server; no model weights are included.</p>
 {error&&<p role="alert" className="freefield-error">{error}</p>}{rejected>0&&<p className="hint">{rejected} malformed or unsupported catalog {rejected===1?'entry was':'entries were'} skipped.</p>}
 {!!apps.length&&<div className="freefield-layout"><aside><label>Find a workflow<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workflows"/></label><label>Media type<select value={section} onChange={e=>setSection(e.target.value)}>{['all','image','video','audio','utility'].map(v=><option key={v} value={v}>{v==='all'?'All workflows':v}</option>)}</select></label><nav aria-label="Freefield workflow catalog">{visible.map(item=><button key={item.id} className={item.id===selected?'active':''} onClick={()=>select(item)}><strong>{item.name}</strong><small>{item.section} · {item.runnable?'Available':'Not available'}</small></button>)}{!visible.length&&<p className="hint">No matching workflows.</p>}</nav></aside><main>{app?<><h4>{app.name}</h4><p>{app.summary}</p>{!app.runnable&&<p className="hint">This server reports that this workflow is not currently runnable.</p>}{app.presets.length>0&&<label className="freefield-field">Preset<select value={preset} onChange={e=>setPreset(e.target.value)}><option value="">No preset</option>{app.presets.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}{app.inputs.map(input=><WorkflowInput key={input.id} input={input} value={values[input.id]} onChange={v=>change(input.id,v)}/>)}<details><summary>Model requirements &amp; credits</summary>{app.models.map((m,i)=><p key={i}>{m.name}{m.gb!==undefined?` · ${m.gb} GB`:''} · {m.license}{m.gated?' · access required':''}{m.optional?' · optional':''}</p>)}{app.credits.map((c,i)=><p key={i}>{c}</p>)}</details><button className="primary" disabled={!props.connected||!app.runnable||!!busy||unknown} onClick={()=>void submit()}>{busy==='submit'?'Starting…':'Start workflow'}</button>{unknown&&<div className="freefield-unknown"><p>The server may still be processing the last request. Check server history first; the app will not retry it automatically.</p><button className="secondary" onClick={()=>setUnknown(false)}>I checked server history</button></div>}</>:<p className="hint">Choose a workflow to see its editable inputs and model requirements.</p>}</main></div>}
 {job&&<section className="freefield-job" aria-label="Freefield run"><h4>Run status: {job.status}</h4><p>Server run ID: {job.id}</p>{job.error&&<p role="alert">{job.error}</p>}<button className="secondary" disabled={!!busy||!props.connected} onClick={()=>void perform('status',async()=>setCurrentJob(await props.onStatus(job.id)))}>Refresh status</button>{job.status==='succeeded'&&job.outputs.map(output=><div className="freefield-output" key={output.id}><span>{output.name} · {output.type}</span><button className="secondary" disabled={!!busy} onClick={()=>void perform('import',()=>props.onImport(job,output))}>Import to Frame</button></div>)}</section>}
 </section>;
}

function WorkflowInput({input,value,onChange}:{input:FreefieldInput;value:FreefieldValues[string]|undefined;onChange:(value:FreefieldValues[string])=>void}){
 const label=<>{input.label}{input.required?' *':''}</>,help=input.help&&<small>{input.help}</small>;
 if(input.type==='toggle')return <label className="freefield-toggle"><input type="checkbox" checked={value===true} onChange={e=>onChange(e.target.checked)}/>{label}{help}</label>;
 if(input.type==='select'&&input.multiple){const chosen=Array.isArray(value)?value:[];return <fieldset className="freefield-field"><legend>{label}</legend>{input.options.map((o,i)=><label key={i}><input type="checkbox" checked={chosen.some(v=>Object.is(v,o.value))} onChange={e=>onChange(e.target.checked?[...chosen,o.value]:chosen.filter(v=>!Object.is(v,o.value)))}/>{o.label}{chosen.some(v=>Object.is(v,o.value))&&` (${chosen.findIndex(v=>Object.is(v,o.value))+1})`}</label>)}{help}</fieldset>}
 if(input.type==='select'){const index=input.options.findIndex(o=>Object.is(o.value,value));return <label className="freefield-field">{label}<select value={index<0?'':String(index)} onChange={e=>{const option=input.options[Number(e.target.value)];if(e.target.value!==''&&option)onChange(option.value)}}><option value="">Choose an option</option>{input.options.map((o,i)=><option key={i} value={i}>{o.label}</option>)}</select>{help}</label>}
 if(['image','video','audio'].includes(input.type))return <label className="freefield-field">{label}<input type="file" accept={`${input.type}/*`} onChange={e=>{const file=e.target.files?.[0];if(file)onChange(file)}}/><small>Up to {input.maxMb} MB. {input.help||''}</small></label>;
 if(input.type==='textarea')return <label className="freefield-field">{label}<textarea rows={4} maxLength={16000} value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>{help}</label>;
 const numeric=['number','slider','seed'].includes(input.type);return <label className="freefield-field">{label}<input type={numeric?'number':'text'} min={input.min} max={input.max} step={input.step} maxLength={numeric?undefined:16000} value={typeof value==='string'||typeof value==='number'?value:''} onChange={e=>onChange(numeric?(e.target.value===''?'' as FreefieldScalar:Number(e.target.value)):e.target.value)}/>{help}</label>;
}
