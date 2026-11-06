import {useEffect,useRef,useState} from 'react';
import {Atom,Play,RotateCcw,X} from 'lucide-react';
import type {ModelAsset,ThreeDocument,Vec3} from '../lib/three/types';
import type {PhysicsBody,PhysicsDocument} from '../lib/three/physics-types';
import {applyPhysicsBake,defaultPhysicsBody,defaultPhysicsDocument,normalizePhysicsDocument,physicsBakeStatus,physicsFingerprint,removePhysicsBody,restorePhysicsAnimation,PHYSICS_LIMITS} from '../lib/three/physics-types';
import {bakePhysics} from '../lib/three/physics';

export interface PhysicsPanelProps {doc:ThreeDocument;models:ModelAsset[];onChange:(document:ThreeDocument)=>void;selectedId?:string;onBusyChange?:(busy:boolean)=>void}
export function PhysicsPanel({doc,models,onChange,selectedId,onBusyChange}:PhysicsPanelProps){
 const [bodyId,setBodyId]=useState(selectedId||''),[running,setRunning]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[candidate,setCandidate]=useState<ThreeDocument>();
 const controller=useRef<AbortController|undefined>(undefined),latest=useRef(doc),alive=useRef(true);latest.current=doc;
 useEffect(()=>{if(selectedId)setBodyId(selectedId)},[selectedId]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();onBusyChange?.(false)}},[]);
 const physics=doc.physics||defaultPhysicsDocument(doc.duration),status=physicsBakeStatus(doc),instance=doc.instances.find(i=>i.id===bodyId),body=physics.bodies.find(b=>b.instanceId===bodyId);
 const ready=!!candidate?.physics?.bake&&candidate.physics.bake.fingerprint===physicsFingerprint(doc);
 function change(next:PhysicsDocument){try{const validated=normalizePhysicsDocument(next,doc.instances,doc.duration);onChange({...doc,physics:validated});setError('')}catch(e){setError(e instanceof Error?e.message:String(e))}}
 function patchBody(patch:Partial<PhysicsBody>){if(body)change({...physics,bodies:physics.bodies.map(b=>b.instanceId===bodyId?{...b,...patch}:b)})}
 async function simulate(){controller.current?.abort();const abort=new AbortController();controller.current=abort;setRunning(true);setProgress(0);setError('');setCandidate(undefined);onBusyChange?.(true);
  try{const baked=await bakePhysics(doc,models,{signal:abort.signal,onProgress:v=>{if(alive.current)setProgress(v)}});if(alive.current)setCandidate(baked)}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{if(alive.current){setRunning(false);onBusyChange?.(false)}if(controller.current===abort)controller.current=undefined}
 }
 function apply(){if(!candidate)return;try{onChange(applyPhysicsBake(latest.current,candidate));setCandidate(undefined);setError('')}catch(e){setError(e instanceof Error?e.message:String(e))}}
 const number=(label:string,value:number,update:(n:number)=>void,min:number,max:number,step=.1)=><label className="field"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={e=>{if(e.target.value!=='')update(Number(e.target.value))}}/></label>;
 const vector=(label:string,value:Vec3,update:(v:Vec3)=>void,min:number,max:number)=><div className="s3-vector"><span>{label}</span><div>{['X','Y','Z'].map((axis,index)=><label key={axis}><small>{axis}</small><input aria-label={`${label} ${axis}`} type="number" min={min} max={max} step=".1" value={value[index]} onChange={e=>{if(e.target.value==='')return;const next=[...value] as Vec3;next[index]=Number(e.target.value);update(next)}}/></label>)}</div></div>;
 return <section className="s3-look" aria-label="Physics simulation">
  <div className="section-caption"><Atom size={14}/>PHYSICS</div>
  <p className="hint">Give objects weight, bounce and momentum. Simulate once, then seek and export ordinary editable animation.</p>
  <fieldset disabled={running} style={{border:0,padding:0,margin:0,minWidth:0}}>
   <label className="field"><span>Physics object</span><select aria-label="Physics object" value={instance?bodyId:''} onChange={e=>setBodyId(e.target.value)}><option value="">Choose an object…</option>{doc.instances.map(i=><option value={i.id} key={i.id}>{i.name}{physics.bodies.some(b=>b.instanceId===i.id)?' · physics':''}</option>)}</select></label>
   {instance&&!body&&<button className="secondary full" disabled={physics.bodies.length>=PHYSICS_LIMITS.bodies} onClick={()=>change({...physics,bodies:[...physics.bodies,defaultPhysicsBody(instance.id)]})}>Add physics to {instance.name}</button>}
   {body&&<>
    <div className="field-grid"><label className="field"><span>Body movement</span><select aria-label="Body movement" value={body.motion} onChange={e=>patchBody({motion:e.target.value as PhysicsBody['motion']})}><option value="dynamic">Falls & collides</option><option value="static">Fixed obstacle</option></select></label><label className="field"><span>Collider shape</span><select aria-label="Collider shape" value={body.collider.shape} onChange={e=>patchBody({collider:{...body.collider,shape:e.target.value as 'box'|'sphere'}})}><option value="box">Box</option><option value="sphere">Sphere</option></select></label></div>
    {body.collider.shape==='box'?vector('Collider size',body.collider.size,size=>patchBody({collider:{...body.collider,size}}),.02,100):number('Sphere diameter',body.collider.size[0],n=>patchBody({collider:{...body.collider,size:[n,n,n]}}),.02,100)}
    {vector('Collider center',body.collider.offset,offset=>patchBody({collider:{...body.collider,offset}}),-100,100)}
    <p className="hint">Dimensions and center are in model space; object scale is applied. Set the collider to fit your model. These are simple shapes, not mesh or skeleton collisions.</p>
    <div className="field-grid">{number('Body friction',body.friction,friction=>patchBody({friction}),0,2)}{number('Body bounce',body.restitution,restitution=>patchBody({restitution}),0,1)}</div>
    {body.motion==='dynamic'&&<>
     {number('Mass (kg)',body.mass,mass=>patchBody({mass}),.01,10000)}
     {vector('Initial velocity',body.linearVelocity,linearVelocity=>patchBody({linearVelocity}),-100,100)}
     {vector('Initial spin (rad/s)',body.angularVelocity,angularVelocity=>patchBody({angularVelocity}),-20,20)}
     <details><summary>Air resistance</summary><div className="field-grid">{number('Linear damping',body.linearDamping,linearDamping=>patchBody({linearDamping}),0,1,.01)}{number('Angular damping',body.angularDamping,angularDamping=>patchBody({angularDamping}),0,1,.01)}</div></details>
    </>}
    <button className="text-button" onClick={()=>{onChange(removePhysicsBody(doc,bodyId));setError('')}}>Remove this physics body</button>
   </>}
   <details open={physics.bodies.length>0}><summary>World & timing</summary>
    {vector('Gravity',physics.gravity,gravity=>change({...physics,gravity}),-100,100)}
    {number('Simulation seconds',physics.duration,duration=>change({...physics,duration}),.1,Math.min(30,doc.duration))}
    <label className="checkbox"><input type="checkbox" checked={physics.ground.enabled} onChange={e=>change({...physics,ground:{...physics.ground,enabled:e.target.checked}})}/>Flat collision ground</label>
    {physics.ground.enabled&&<>{number('Ground height',physics.ground.height,height=>change({...physics,ground:{...physics.ground,height}}),-1000,1000)}<div className="field-grid">{number('Ground friction',physics.ground.friction,friction=>change({...physics,ground:{...physics.ground,friction}}),0,2)}{number('Ground bounce',physics.ground.restitution,restitution=>change({...physics,ground:{...physics.ground,restitution}}),0,1)}</div></>}
    <p className="hint">{physics.bodies.length}/32 bodies · fixed 60 steps/second · up to 30 seconds per bake. The last pose holds afterward. The flat ground spans 1,000 units; other scenery collides only when added as a fixed body.</p>
   </details>
  </fieldset>
  <p className="hint" role="status">{running?`Simulating locally… ${Math.round(progress*100)}%`:status==='ready'?'Baked motion is saved and ready to export.':status==='stale'?'Settings or animation changed. Bake again before exporting, or restore the original motion and remove physics.':status==='unbaked'?'Settings saved. Bake motion before exporting.':'Choose objects to simulate.'}</p>
  {error&&<p role="alert" className="hint" style={{color:'var(--danger, #c96b64)'}}>{error}</p>}
  {running?<button className="secondary full" onClick={()=>controller.current?.abort()}><X size={13}/>Cancel simulation</button>:<button className="secondary full" disabled={!physics.bodies.length} onClick={()=>void simulate()}><Play size={13}/>Bake physics motion</button>}
  {candidate&&<div style={{display:'grid',gap:8,marginTop:10}}><p className="hint">Simulation complete. {candidate.physics?.bake?.originals.length} tracks are ready. Applying replaces their motion and keeps their originals for restore.{!ready?' The scene changed; bake again to use the new settings.':''}</p><button className="primary full" disabled={!ready||running} onClick={apply}>Apply baked motion</button><button className="text-button" onClick={()=>setCandidate(undefined)}>Discard this bake</button></div>}
  {doc.physics?.bake&&<button className="text-button" disabled={running} onClick={()=>{onChange(restorePhysicsAnimation(doc));setCandidate(undefined);setError('Original tracks restored where the baked motion was unchanged. Any later manual edits were kept.')}}><RotateCcw size={12}/>Restore original motion</button>}
  {doc.physics&&<button className="text-button" disabled={running} onClick={()=>{const restored=restorePhysicsAnimation(doc);const {physics:_,...without}=restored;onChange(without);setCandidate(undefined);setError('')}}>Remove all physics & keep manual edits</button>}
 </section>;
}
export default PhysicsPanel;
