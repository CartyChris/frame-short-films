import {useSyncExternalStore} from 'react';
import {currentMcpSession,subscribeMcpSession} from '../lib/mcp-session';

export interface McpProductionGrant {enabled:boolean;serverFingerprint:string;tools:string[];mode?:'once'|'per-scene'}
interface Props {projectId:string;value?:McpProductionGrant;disabled:boolean;onChange:(grant:McpProductionGrant)=>void;onOpenTools:()=>void}

/** Grants stay scoped to this production and the currently connected server. */
export function McpProductionSettings({projectId,value,disabled,onChange,onOpenTools}:Props){
 const session=useSyncExternalStore(subscribeMcpSession,currentMcpSession,()=>null);
 const available=session?.projectId===projectId?session:null;
 const active=!!(available&&value?.enabled&&value.serverFingerprint===available.serverFingerprint);
 function enable(enabled:boolean){onChange({enabled,serverFingerprint:available?.serverFingerprint||'',tools:enabled&&value&&value.serverFingerprint===available?.serverFingerprint?value.tools:[],mode:value?.mode||'once'})}
 function toggle(name:string,checked:boolean){if(!available)return;const tools=new Set(active?value?.tools||[]:[]);if(checked&&tools.size>=50)return;checked?tools.add(name):tools.delete(name);onChange({enabled:true,serverFingerprint:available.serverFingerprint,tools:[...tools],mode:value?.mode||'once'})}
 return <details className="production-mcp"><summary>Connected studio tools <span>Optional</span></summary>
  <p className="hint">Let the production model select from the tools you enable here. A tool may change files, modify a scene, contact a service, or spend credits. Review the server and its tools before enabling them. An uncertain call stops rather than submitting it again.</p>
  {!available?<><p className="hint">No tool server is connected to this film.</p><button className="secondary" type="button" disabled={disabled} onClick={onOpenTools}>Open Studios → Local tools</button></>:<>
   <p className="hint">Connected: {available.connection.serverInfo.name||'Local MCP server'} · {available.connection.tools.length} tools</p>
   {value?.enabled&&!active&&<p className="hint">The connected server changed. Review and enable tools again for this production.</p>}
   <label className="checkbox"><input type="checkbox" disabled={disabled} checked={active} onChange={e=>enable(e.target.checked)}/>Allow this production to use selected tools</label>
   {active&&<><label>Tool workflow<select aria-label="Production tool workflow" disabled={disabled} value={value?.mode||'once'} onChange={e=>onChange({...value!,mode:e.target.value as 'once'|'per-scene'})}><option value="once">One tool call for the film</option><option value="per-scene">Inspect, animate and review each scene</option></select></label>{value?.mode==='per-scene'&&<p className="hint">Adds up to three model-selected calls per scene, plus a film-level call. Text returned by those tools may be sent to your selected model to guide the next call and included in this project’s backup. External edits still need importing. This setting applies when a new production is created.</p>}<div className="production-mcp-tools">{available.connection.tools.slice(0,100).map(tool=><label key={tool.name}><input type="checkbox" disabled={disabled||(!value?.tools.includes(tool.name)&&(value?.tools.length||0)>=50)} checked={value?.tools.includes(tool.name)||false} onChange={e=>toggle(tool.name,e.target.checked)}/><span><strong>{tool.name}</strong><small>{tool.description||'No description provided by the server.'}</small></span></label>)}</div></>}
   {active&&(value?.tools.length||0)>=50&&<p className="hint">Up to 50 tools can be enabled for one production.</p>}
   {active&&!value?.tools.length&&<p className="hint">Choose at least one tool, or turn this option off.</p>}
   <p className="hint">A Blender operation changes the connected Blender session. Bringing edited geometry back into Frame still requires the Blender exchange workflow.</p>
  </>}
 </details>;
}
