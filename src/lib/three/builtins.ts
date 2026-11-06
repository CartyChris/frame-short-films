import * as T from 'three';
import type {ModelAsset,ThreeInstance} from './types';
import {builtInModels,normalizeAppearance} from './document';
const mat=(color:string,roughness=.85)=>new T.MeshStandardMaterial({color,roughness});
function mesh(g:T.BufferGeometry,m:T.Material,parent:T.Object3D,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
const sphere=(r:number,m:T.Material,p:T.Object3D,x=0,y=0,z=0)=>mesh(new T.SphereGeometry(r,16,12),m,p,x,y,z);
const box=(w:number,h:number,d:number,m:T.Material,p:T.Object3D,x=0,y=0,z=0)=>mesh(new T.BoxGeometry(w,h,d),m,p,x,y,z);
const cyl=(r1:number,r2:number,h:number,m:T.Material,p:T.Object3D,x=0,y=0,z=0)=>mesh(new T.CylinderGeometry(r1,r2,h,12),m,p,x,y,z);
function joint(parent:T.Object3D,name:string,x=0,y=0,z=0){const g=new T.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g}
export function makeBuiltin(model:ModelAsset):T.Group{
 const g=new T.Group();g.name=model.name;
 const type=model.builtin||'rock';
 if(['ava','leo','mira'].includes(type)){
  const fallback=builtInModels.find(m=>m.builtin===type)?.appearance!,a=normalizeAppearance(model.appearance,fallback);
  const skin=mat(a.skin),hair=mat(a.hair),shirt=mat(a.shirt),pants=mat(a.pants),accent=mat(a.accent!),sole=mat('#283440');
  const body=joint(g,'rig_body',0,0,0);body.scale.setScalar(a.bodyScale!);
  const hips=joint(body,'rig_hips',0,.88,0);box(.42,.23,.29,pants,hips);
  const torso=joint(hips,'rig_torso',0,.12,0);const jacket=cyl(.27,.22,.55,shirt,torso,0,.22);jacket.scale.z=.64;
  box(.035,.4,.025,accent,torso,0,.22,.18);box(.13,.13,.025,accent,torso,-.13,.27,.178);
  cyl(.09,.1,.13,skin,torso,0,.54);
  const head=joint(torso,'rig_head',0,.77,0);const face=sphere(.235,skin,head);face.scale.set(.88,1.12,.9);
  sphere(.055,skin,head,-.215,-.02);sphere(.055,skin,head,.215,-.02);sphere(.042,skin,head,0,-.02,.207);
  const eyeMat=mat('#1b252a');for(const x of [-.081,.081]){sphere(.037,mat('#fff5e0'),head,x,.025,.19).scale.set(1,.85,.45);sphere(.018,eyeMat,head,x,.025,.211);box(.06,.014,.015,hair,head,x,.09,.18)}
  const smile=new T.Mesh(new T.TorusGeometry(.063,.009,5,16,Math.PI),mat('#733c37'));smile.rotation.z=Math.PI;smile.position.set(0,-.075,.2);head.add(smile);
  if(a.hairStyle==='curly'){for(let i=0;i<20;i++){const q=i*2.3999,r=.12+.07*Math.sin(i);sphere(.09,hair,head,Math.cos(q)*r,.19+.07*Math.cos(i*.7),Math.sin(q)*r)}}else if(a.hairStyle==='bob'){sphere(.25,hair,head,0,.08,-.06).scale.set(.98,1.05,.85);box(.39,.12,.24,hair,head,0,.205,.045);sphere(.09,hair,head,-.18,-.08,-.025);sphere(.09,hair,head,.18,-.08,-.025)}else{sphere(.24,hair,head,0,.13,-.035).scale.set(1,.65,.9);sphere(.13,hair,head,.09,.23,.09)}
  for(const side of [-1,1]){const tag=side<0?'L':'R';const arm=joint(torso,'rig_arm'+tag,side*.285,.43,0);cyl(.079,.069,.29,shirt,arm,0,-.125);const elbow=joint(arm,'rig_elbow'+tag,0,-.27);sphere(.071,shirt,elbow);cyl(.063,.052,.25,skin,elbow,0,-.12);sphere(.075,skin,elbow,0,-.28).scale.y=1.2;const leg=joint(hips,'rig_leg'+tag,side*.13,-.08);cyl(.1,.073,.36,pants,leg,0,-.18);const knee=joint(leg,'rig_knee'+tag,0,-.36);sphere(.076,pants,knee);cyl(.069,.055,.33,pants,knee,0,-.165);const foot=box(.15,.11,.28,sole,knee,0,-.35,.065);foot.rotation.x=.025}
  return g;
 }
 if(type==='tree'){const bark=mat('#7e6552'),leaf=[mat('#436b54'),mat('#69906b'),mat('#84a779')];cyl(.16,.27,2.7,bark,g,0,1.35);for(let i=0;i<7;i++){const angle=i*2.3999,branch=cyl(.045,.085,1.2,bark,g,Math.cos(angle)*.34,2+i*.09,Math.sin(angle)*.34);branch.rotation.z=Math.sin(angle)*.6;branch.rotation.x=Math.cos(angle)*.6;const crown=sphere(.83,leaf[i%3],g,Math.cos(angle)*.65,2.7+Math.sin(i)*.28,Math.sin(angle)*.65);crown.scale.y=.8}for(let i=0;i<5;i++){const r=box(.15,.06,.8,bark,g,0,.04,.25);r.rotation.y=i*1.25}}
 if(type==='house'){const wall=mat('#e4caa2'),trim=mat('#f4e5bd'),roof=mat('#b85f48'),glass=new T.MeshStandardMaterial({color:'#5e8190',roughness:.25,metalness:.15});box(2.5,2.5,2,wall,g,0,1.25);const r=mesh(new T.ConeGeometry(1.97,1.1,4),roof,g,0,3.03);r.rotation.y=Math.PI/4;r.scale.z=.84;box(2.7,.13,2.2,trim,g,0,2.55);box(.48,.82,.08,mat('#655044'),g,0,.42,1.04);sphere(.04,mat('#d6a54d'),g,.14,.43,1.1);for(const x of [-.78,.78])for(const y of [.65,1.8]){box(.49,.59,.1,trim,g,x,y,1.04);box(.38,.46,.12,glass,g,x,y,1.06);box(.025,.47,.02,trim,g,x,y,1.13);box(.39,.025,.02,trim,g,x,y,1.13)}box(.33,.9,.36,roof,g,.65,3.05,-.3);for(let i=0;i<3;i++)box(.62+i*.18,.1,.25,mat('#b8af91'),g,0,.06+i*.04,1.18+i*.12);for(let i=0;i<8;i++){box(.1,.3,.1,trim,g,-1.3+i*.37,.15,1.58)}box(2.8,.06,.06,trim,g,0,.23,1.58)}
 if(type==='arch'){const stone=mat('#d8c9a5');for(const x of [-1.05,1.05]){box(.45,2.4,.5,stone,g,x,1.2);box(.65,.16,.7,stone,g,x,.08);box(.65,.18,.68,stone,g,x,2.4)}const arch=mesh(new T.TorusGeometry(1.05,.24,8,24,Math.PI),stone,g,0,2.4);arch.scale.z=1.2;for(let i=0;i<9;i++){const angle=i/8*Math.PI;const vine=sphere(.16,mat(i%2?'#72916a':'#426d57'),g,Math.cos(angle)*1.1,2.4+Math.sin(angle)*1.05,.24);vine.scale.x=1.5}}
 if(type==='lantern'){const iron=mat('#40514c'),gold=mat('#d6b76c');cyl(.055,.08,2.3,iron,g,0,1.15);cyl(.24,.3,.15,iron,g,0,.075);box(.42,.1,.42,iron,g,0,2.28);box(.35,.4,.35,new T.MeshStandardMaterial({color:'#ffe4a4',emissive:'#f1b34c',emissiveIntensity:.8,transparent:true,opacity:.8}),g,0,2.53);mesh(new T.ConeGeometry(.36,.25,4),gold,g,0,2.87).rotation.y=Math.PI/4;for(const x of [-.18,.18])for(const z of [-.18,.18])box(.025,.45,.025,iron,g,x,2.53,z)}
 if(type==='rock'){const rock=mesh(new T.IcosahedronGeometry(.7,1),mat('#8d9692'),g,0,.35);rock.scale.set(1.1,.65,.8);rock.rotation.set(.1,.4,.2)}
 return g;
}
export function animateBuiltin(object:T.Object3D,instance:ThreeInstance,time:number){const phase=time*instance.animation.speed+instance.animation.phase,preset=instance.animation.preset;const get=(name:string)=>object.getObjectByName('rig_'+name);const body=get('body');if(!body)return;const wave=phase*5.8;const hips=get('hips')!,torso=get('torso')!,head=get('head')!;hips.position.y=.88;hips.rotation.set(0,0,0);torso.rotation.set(0,0,0);head.rotation.set(0,0,0);for(const tag of ['L','R'])for(const part of ['arm','elbow','leg','knee'])get(part+tag)!.rotation.set(0,0,0);
 if(preset==='none')return;
 hips.position.y+=Math.sin(phase*2)*.012;head.rotation.y=Math.sin(phase*.8)*.1;
 if(preset==='walk'){hips.position.y+=Math.abs(Math.sin(wave))*.035;torso.rotation.y=Math.sin(wave)*.06;for(const side of [-1,1]){const tag=side<0?'L':'R';get('leg'+tag)!.rotation.x=Math.sin(wave)*side*.5;get('knee'+tag)!.rotation.x=Math.max(0,-Math.sin(wave)*side)*.55;get('arm'+tag)!.rotation.x=-Math.sin(wave)*side*.4;get('elbow'+tag)!.rotation.x=-.15}}
 if(preset==='wave'){get('armR')!.rotation.set(-.15,0,2.1);get('elbowR')!.rotation.set(0,Math.sin(phase*5)*.3,.4+Math.sin(phase*5)*.4);head.rotation.z=-.1;get('armL')!.rotation.z=.12}
 if(preset==='dance'){hips.rotation.y=Math.sin(phase*2)*.3;hips.position.y+=Math.abs(Math.sin(phase*4))*.1;torso.rotation.z=Math.sin(phase*4)*.1;get('armL')!.rotation.z=.8+Math.sin(phase*4)*.4;get('armR')!.rotation.z=-.8+Math.sin(phase*4)*.4;get('elbowL')!.rotation.x=-.6;get('elbowR')!.rotation.x=-.6;get('legL')!.rotation.x=Math.sin(phase*4)*.2;get('legR')!.rotation.x=-Math.sin(phase*4)*.2}
}
export function makeEnvironment(preset:string,groundColor:string):T.Group{const g=new T.Group();g.name='Scenery';const ground=mat(groundColor);const island=cyl(11,10.5,.5,ground,g,0,-.3);island.receiveShadow=true;const path=mesh(new T.TorusGeometry(4.6,.55,4,80),mat('#d2c6a6'),g,0,-.015);path.rotation.x=-Math.PI/2;path.scale.y=.7;path.scale.z=.045;const rand=(i:number)=>{const x=Math.sin(i*127.1+31.7)*43758.5453;return x-Math.floor(x)};
 if(preset==='studio'){path.visible=false;island.scale.set(4,1,4);return g}
 if(preset==='cosmos'){path.material=mat('#8895b9');for(let i=0;i<8;i++){const o=mesh(new T.IcosahedronGeometry(.3+rand(i)*.6,0),mat(i%2?'#7580a6':'#b5a1c0'),g,(rand(i+10)-.5)*18,.5+rand(i+40)*4,-5-rand(i+80)*4);o.rotation.set(i,0,i*.5)}return g}
 for(let i=0;i<80;i++){const a=rand(i)*Math.PI*2,r=5.5+rand(i+300)*4;const x=Math.cos(a)*r,z=Math.sin(a)*r;if(i%3===0){const flower=joint(g,'flower_'+i,x,0,z);cyl(.015,.015,.2,mat('#567953'),flower,0,.1);sphere(.065,mat(i%2?'#f4d58c':'#d9988c'),flower,0,.23)}else{const blade=mesh(new T.ConeGeometry(.06,.25+rand(i)*.2,3),mat(i%2?'#87a577':'#507c61'),g,x,.12,z);blade.rotation.z=rand(i)*.4}}
 for(let i=0;i<7;i++){const mountain=mesh(new T.ConeGeometry(3+rand(i)*2,3+rand(i+9)*4,5),mat(i%2?'#91ada5':'#7f9e99'),g,-15+i*5,0,-15-rand(i+5)*3);mountain.rotation.y=i*.7}
 if(preset==='city'){for(let i=0;i<9;i++){const h=makeBuiltin({id:'bg'+i,name:'Townhouse',builtin:'house'});h.position.set(-11+i*2.8,0,-9-Math.abs(i-4)*.4);h.scale.setScalar(.7+rand(i)*.3);g.add(h)}}
 return g;
}
