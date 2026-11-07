import {invoke} from '@tauri-apps/api/core';
import {isNative} from '../lib/native';
import {useState} from 'react';
import {X,KeyRound,Search,Check,RefreshCw,Lock,Monitor,ChevronRight,Trash2} from 'lucide-react';
import type {ProviderConnection,Model} from '../lib/types';
import {PROVIDERS,isLocalProvider,apiUrl} from '../lib/generation';
import {uid} from '../lib/storage';
import {saveVault,unlockVault} from '../lib/vault';
import './Connections.css';

type CliProfile={id:string;name:string;executable:string;args:string[];output:'frame-ndjson'|'text'};
type CliStatus={name:string;installed:boolean;adapter:boolean;authentication:'unchecked';executable?:string;login?:string;custom?:boolean};
const LOCAL_GUIDES:Record<string,{login:string;url:string}>={
 codex:{login:'codex login',url:'https://developers.openai.com/codex/auth/'},
 'claude-code':{login:'claude auth login',url:'https://code.claude.com/docs/en/headless'},
 'kimi-code':{login:'kimi login',url:'https://moonshotai.github.io/kimi-code/en/reference/kimi-command.html'},
 'grok-build':{login:'grok login',url:'https://docs.x.ai/build/cli/headless-scripting'},
 'zai-coding':{login:'Use your Coding Plan key below',url:'https://docs.z.ai/devpack/tool/claude'},
};
function loopback(value:string){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Use a local companion address such as http://127.0.0.1:4319.');return u.origin;}

export function Connections({connections,onChange,onClose,notify}:{connections:ProviderConnection[];onChange:(v:ProviderConnection[])=>void;onClose:()=>void;notify:(v:string)=>void}){
 const initial=connections[0];
 const [provider,setProvider]=useState(initial?.provider.startsWith('cli:')?'custom-cli':initial?.provider||'openrouter');
 const [key,setKey]=useState(''),[model,setModel]=useState(''),[baseUrl,setBaseUrl]=useState('');
 const [bridgeUrl,setBridgeUrl]=useState(initial?.bridgeUrl||'http://127.0.0.1:4319'),[bridgeToken,setBridgeToken]=useState(initial?.bridgeToken||'');
 const [models,setModels]=useState<Model[]>([]),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [ollamaThink,setOllamaThink]=useState<'default'|'on'|'off'>('default');
 const [pass,setPass]=useState(''),[temp,setTemp]=useState(.75),[max,setMax]=useState(16000),[apiOrigin,setApiOrigin]=useState(localStorage.getItem('frame-api-origin')||'');
 const [inventory,setInventory]=useState<Record<string,CliStatus>|null>(null),[profiles,setProfiles]=useState<CliProfile[]>([]);
 const [profileId,setProfileId]=useState(initial?.provider.startsWith('cli:')?initial.provider.slice(4):'');
 const [customName,setCustomName]=useState(''),[customId,setCustomId]=useState(''),[customPath,setCustomPath]=useState(''),[customArgs,setCustomArgs]=useState('[]');
 const [customOutput,setCustomOutput]=useState<CliProfile['output']>('frame-ndjson'),[reviewed,setReviewed]=useState(false);
 const local=isLocalProvider(provider),preset=PROVIDERS.find(p=>p.id===provider)||PROVIDERS[0],guide=LOCAL_GUIDES[provider];
 function select(id:string){setProvider(id);setKey('');setModels([]);setModel('');setError('');}
 async function companion(path:string,body?:unknown,url=bridgeUrl,token=bridgeToken){
  if(!token)throw new Error('Enter the companion pairing token first.');
  const response=await fetch(loopback(url)+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Companion could not connect. Check its pairing token and allowed origin.');return data;
 }
 async function scan(url=bridgeUrl,token=bridgeToken){
  const [status,registry]=await Promise.all([companion('/health',undefined,url,token),companion('/cli/profiles',undefined,url,token)]);
  setInventory(status.providers||{});setProfiles(registry.profiles||[]);
  if(!profileId&&registry.profiles?.[0])setProfileId(registry.profiles[0].id);
  return status.providers as Record<string,CliStatus>;
 }
 async function catalog(){setBusy(true);setError('');try{
  if(provider==='ollama'){const data=await companion('/ollama/models');setModels(data.models||[]);if(data.models?.length&&!model)setModel(data.models[0].id);notify('Installed Ollama models loaded. No models were downloaded.');return;}
  if(local){await scan();notify('Companion paired. Installed tools are listed; account sign-in is checked when a tool handles a request.');return;}
  const response=await fetch(apiUrl('/api/models'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,apiKey:key,baseUrl})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load models.');setModels(data.models||[]);if(data.models?.length&&!model)setModel(data.models[0].id);
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 function connection(id:string,name:string):ProviderConnection{return {id:uid(),provider:id,name,model,apiKey:key,baseUrl,bridgeUrl:local?loopback(bridgeUrl):bridgeUrl,bridgeToken,temperature:temp,maxTokens:max,...(provider==='ollama'&&ollamaThink!=='default'?{ollamaThink:ollamaThink==='on'}:{})};}
 function add(){try{
  if(!local&&!key)throw new Error('Add your provider API key.');if(!local&&!model)throw new Error('Choose a model or enter its model ID.');if(local&&!bridgeToken)throw new Error('Enter the token shown by your local companion.');if(provider==='ollama'&&!model)throw new Error('Choose an installed Ollama model.');
  const profile=profiles.find(p=>p.id===profileId);if(provider==='custom-cli'&&!profile)throw new Error('Scan the companion, then select or register a trusted CLI profile.');
  const id=profile&&provider==='custom-cli'?'cli:'+profile.id:provider,name=profile&&provider==='custom-cli'?profile.name:preset.name;
  onChange([...connections,connection(id,name)]);notify(`${name} connection added. Keys stay in memory unless saved in your vault.`);onClose();
 }catch(e){setError((e as Error).message);}}
 async function syncInstalled(){setBusy(true);setError('');try{
  const found=await scan();const added=Object.entries(found).filter(([id,v])=>v.installed&&v.adapter&&id!=='zai-coding'&&!connections.some(c=>c.provider===id&&c.bridgeUrl===loopback(bridgeUrl))).map(([id,v])=>({...connection(id,v.name),model:'',apiKey:'',baseUrl:''}));
  onChange([...connections,...added]);notify(`${added.length} local connection${added.length===1?'':'s'} added. Sign-in and model access remain unchecked.`);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function registerProfile(){setBusy(true);setError('');try{
  const args:unknown=JSON.parse(customArgs);if(!Array.isArray(args)||!args.every(a=>typeof a==='string'))throw new Error('Arguments must be a JSON array of strings.');
  if(!reviewed)throw new Error('Review and confirm the executable and fixed arguments first.');
  const data=await companion('/cli/profiles',{profile:{id:customId,name:customName,executable:customPath,args,output:customOutput},reviewed:true});
  setProfiles(data.profiles);setProfileId(customId);setReviewed(false);notify('Trusted CLI profile saved. It will run only when you generate with its connection.');await scan();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal connections" role="dialog" aria-modal="true" aria-labelledby="connections-title">
  <header className="modal-head"><div><p className="eyebrow">Model connections</p><h2 id="connections-title">Connect a model</h2></div><button className="icon" aria-label="Close connections" onClick={onClose}><X size={20}/></button></header>
  <div className="connection-layout"><aside className="provider-list">{PROVIDERS.map(p=><button key={p.id} className={provider===p.id?'active':''} onClick={()=>select(p.id)}><span className="provider-letter">{p.name[0]}</span><span>{p.name}<small>{p.group}</small></span><ChevronRight size={13}/></button>)}</aside>
  <div className="connection-detail"><div className="provider-heading"><div className="provider-emblem">{local?<Monitor/>:<KeyRound/>}</div><div><h3>{preset.name}</h3><p>{preset.description}</p></div></div>
  {local?<>
   {isNative()&&<button className="primary full" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const result=await invoke<{url:string;token:string}>('start_companion');setBridgeUrl(result.url);setBridgeToken(result.token);await scan(result.url,result.token);notify('Local companion paired. CLI account sign-in stays with each tool.');}catch(e){setError(String(e));}finally{setBusy(false);}}}><Monitor size={14}/>Start local companion</button>}
   <div className="notice">{provider==='zai-coding'?'Use your Coding Plan through the officially supported Claude Code tool. Frame does not claim direct Coding Plan API eligibility.':guide?<>Sign in once in Terminal with <code>{guide.login}</code>. The CLI handles its own account; Frame does not copy OAuth tokens.</>:'Run a trusted local AI command with fixed arguments. Registration never runs the executable.'}{guide&&<> <a href={guide.url} target="_blank" rel="noreferrer">Official guide ↗</a></>}</div>
   {(provider==='kimi-code'||provider==='grok-build')&&<p className="hint">This route uses your installed tool and its existing account/configuration. User-installed hooks may still run, and the CLI may keep its own sessions. Review that tool’s customizations before using it here.</p>}
   {provider==='kimi-code'&&<p className="hint">Kimi 2.2 buffers machine-readable output until it finishes a message. Frame saves everything it receives; text still buffered inside Kimi cannot be recovered here. Requests over 96 KiB are rejected without truncation. Use the Kimi / Moonshot API for streaming large requests. Kimi’s prompt is passed as a process argument.</p>}
   {provider==='zai-coding'&&<label>Z.AI Coding Plan key<input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Your Coding Plan API key" autoComplete="off"/><span className="hint">Sent only to the authenticated local companion. Leave blank only if its process already has the supported Z.AI environment.</span></label>}
   <label>Companion address<input value={bridgeUrl} onChange={e=>{setBridgeUrl(e.target.value);setInventory(null);setProfiles([]);}} placeholder="http://127.0.0.1:4319"/></label>
   <label>Pairing token<input type="password" value={bridgeToken} onChange={e=>{setBridgeToken(e.target.value);setInventory(null);}} placeholder="Token printed by the companion" autoComplete="off"/></label>
   <p className="hint">Allow this app’s exact origin in the companion: <code>{location.origin}</code>. Browser/PWA local tools require the companion on the same computer. Mobile uses API connections.</p>
  </>:<><label>API key<input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Paste your own API key" autoComplete="off" spellCheck={false}/></label>{provider==='custom'&&<label>API base URL<input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://your-provider.com/v1"/></label>}</>}
  <div className="row"><button className="secondary" disabled={busy} onClick={catalog}><RefreshCw size={14} className={busy?'spin':''}/>{provider==='ollama'?'Load installed models':local?'Scan local tools':'Load live models'}</button>{local&&inventory&&<button className="secondary" disabled={busy} onClick={syncInstalled}>Add installed connections</button>}{models.length>0&&<span className="hint">{models.length.toLocaleString()} models</span>}</div>
  {local&&inventory&&<div className="model-list" aria-label="Installed CLI inventory">{Object.entries(inventory).map(([id,item])=><button key={id} disabled={!item.adapter} className={(provider===id||provider==='custom-cli'&&id==='cli:'+profileId)?'active':''} onClick={()=>{select(id.startsWith('cli:')?'custom-cli':id);if(id.startsWith('cli:'))setProfileId(id.slice(4));}}><span>{item.name}<small>{item.installed?'Installed':'Not installed'} · {item.adapter?'Sign-in unchecked':'Custom adapter required'}</small>{item.executable&&<small title={item.executable}>{item.executable}</small>}</span>{item.installed&&<Check size={14}/>}</button>)}</div>}
  {provider==='ollama'&&<><p className="hint">The list includes all installed Ollama models. Embedding-only models cannot answer chat or generate films; choose a chat-capable model.</p><label>Ollama reasoning<select value={ollamaThink} onChange={e=>setOllamaThink(e.target.value as typeof ollamaThink)}><option value="default">Model default</option><option value="on">On, if supported</option><option value="off">Off, for faster replies</option></select></label></>}
  {provider==='custom-cli'&&<>
   <label>Saved CLI profile<select value={profileId} onChange={e=>setProfileId(e.target.value)}><option value="">Select a registered profile</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   {profileId&&profiles.some(p=>p.id===profileId)&&<button className="text-button" disabled={busy} onClick={async()=>{try{const data=await companion('/cli/profiles/remove',{id:profileId});setProfiles(data.profiles);setProfileId('');await scan();notify('CLI profile removed. Existing connections to it will need a new profile.');}catch(e){setError((e as Error).message);}}}><Trash2 size={13}/>Remove profile</button>}
   <details className="custom-cli-editor"><summary>Register a trusted CLI</summary><p className="hint">Choose an executable you trust. It runs with your account’s permissions. No shell is involved; no AI may write this configuration. Do not put credentials in arguments. Standard input receives the conversation. Frame NDJSON emits delta, done, and error events; plain text streams until a successful exit.</p>
    <div className="field-grid"><label>Name<input value={customName} onChange={e=>{setCustomName(e.target.value);setReviewed(false);}} placeholder="My local AI"/></label><label>Profile ID<input value={customId} onChange={e=>{setCustomId(e.target.value);setReviewed(false);}} placeholder="my-ai"/></label></div>
    <label>Absolute executable path<input value={customPath} onChange={e=>{setCustomPath(e.target.value);setReviewed(false);}} placeholder="/absolute/path/to/your-ai" spellCheck={false}/></label>
    <label>Fixed arguments (JSON array)<textarea rows={3} value={customArgs} onChange={e=>{setCustomArgs(e.target.value);setReviewed(false);}} spellCheck={false}/><span className="hint">Optional exact argument <code>{'{model}'}</code> receives the model field. Prompt substitution and shells are rejected.</span></label>
    <label>Output format<select value={customOutput} onChange={e=>{setCustomOutput(e.target.value as CliProfile['output']);setReviewed(false);}}><option value="frame-ndjson">Frame NDJSON</option><option value="text">Plain text</option></select></label>
    <label className="row"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed and trust this exact executable and argument list.</label>
    <button className="secondary" disabled={busy||!reviewed} onClick={registerProfile}>Save trusted profile</button>
   </details>
  </>}
  {models.length>0&&<><div className="searchbox"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find any model…"/></div><div className="model-list">{models.filter(m=>(m.id+' '+m.name).toLowerCase().includes(search.toLowerCase())).slice(0,150).map(m=><button key={m.id} onClick={()=>setModel(m.id)} className={model===m.id?'active':''}><span>{m.name}<small>{m.id}{m.contextLength?` · ${Math.round(m.contextLength/1000)}k context`:''}</small></span>{model===m.id&&<Check size={14}/>}</button>)}</div></>}
  <label>{local?'Model override (optional)':'Model ID'}<input value={model} onChange={e=>setModel(e.target.value)} placeholder={local?'Use the CLI’s selected model':'Select above or type an exact model ID'}/></label>
  <details><summary>Advanced generation settings</summary><div className="field-grid"><label>Temperature<input type="number" min="0" max="2" step=".05" value={temp} onChange={e=>setTemp(Number(e.target.value))}/></label><label>Output token budget<input type="number" min="256" max="200000" value={max} onChange={e=>setMax(Number(e.target.value))}/></label></div>{local&&<p className="hint">CLI tools use their own sampling and output limits. These API settings are not sent as unsupported CLI flags.</p>}</details>
  {error&&<p className="error-message" role="alert">{error}</p>}<button className="primary full" onClick={add}><Check size={15}/>Add connection</button>
  </div></div>
  <div className="vault-panel"><div><Lock size={16}/><strong>Optional encrypted vault</strong><span>Otherwise, keys disappear when this tab closes.</span></div><div className="row"><input type="password" placeholder="Your vault password (10+ characters)" value={pass} onChange={e=>setPass(e.target.value)}/><button className="secondary" onClick={()=>saveVault(connections,pass).then(()=>notify('Connections encrypted and saved on this device.')).catch(e=>setError(e.message))}>Lock &amp; save</button><button className="secondary" onClick={()=>unlockVault(pass).then(v=>{onChange(v);notify('Vault unlocked.');onClose();}).catch(e=>setError(e.message))}>Unlock</button></div></div>
  <details className="backend-setting"><summary>Desktop / self-hosted API address</summary><p className="hint">Use your Vercel deployment’s HTTPS address when running the desktop mirror. Leave empty on Vercel or during local development.</p><div className="row"><input value={apiOrigin} placeholder="https://your-frame-studio.vercel.app" onChange={e=>setApiOrigin(e.target.value)}/><button className="secondary" onClick={()=>{try{if(apiOrigin&&new URL(apiOrigin).protocol!=='https:')throw new Error('Use an HTTPS deployment address.');localStorage.setItem('frame-api-origin',apiOrigin.replace(/\/$/,''));notify('API address saved.');}catch(e){setError((e as Error).message);}}}>Save address</button></div></details>
 </section></div>;
}
