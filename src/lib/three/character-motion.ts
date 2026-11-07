/** Deterministic, additive rig offsets. Evaluated from film time so seeking and exports agree. */
export type RigJoint='body'|'torso'|'head'|'armL'|'armR'|'elbowL'|'elbowR'|'legL'|'legR'|'kneeL'|'kneeR';
export type RigOffset={x?:number;y?:number;z?:number;lift?:number};
export function characterMotion(preset:string,phase:number):Partial<Record<RigJoint,RigOffset>> {
 if(preset==='none')return {};
 const breath=Math.sin(phase*1.55),look=Math.sin(phase*.73),cycle=phase*5.8,step=Math.sin(cycle);
 const result:Partial<Record<RigJoint,RigOffset>>={body:{lift:breath*.012,z:Math.sin(phase*.7)*.012},torso:{x:breath*.018,y:look*.025},head:{x:-breath*.025,y:look*.1,z:Math.sin(phase*.51)*.025}};
 if(preset==='walk'){
  result.body={lift:.018*(1-Math.cos(cycle*2)),z:step*.035,y:step*.055};
  result.torso={x:.06,y:-step*.08,z:-step*.025};result.head={x:-.035,y:step*.025,z:step*.018};
  for(const side of ['L','R'] as const){const sign=side==='L'?-1:1,forward=step*sign;result[('leg'+side) as RigJoint]={x:forward*.52,z:sign*.025};result[('knee'+side) as RigJoint]={x:Math.pow(Math.max(0,-forward),2)*.7};result[('arm'+side) as RigJoint]={x:-forward*.42,z:sign*.07};result[('elbow'+side) as RigJoint]={x:-.22-Math.max(0,forward)*.12};}
 }else if(preset==='wave'){
  const gesture=Math.sin(phase*4.4);result.body={lift:breath*.012,y:Math.sin(phase*.7)*.05,z:-.025};result.torso={y:-.12+look*.035,z:-.025};result.head={y:.12+look*.07,z:-.12};result.armR={x:-.2,z:2.1};result.elbowR={x:-.12,y:gesture*.2,z:.4+gesture*.32};result.armL={x:breath*.025,z:-.1};
 }else if(preset==='dance'){
  const sway=Math.sin(phase*3.5),bounce=(1-Math.cos(phase*7))*.045;result.body={lift:bounce,y:Math.sin(phase*1.75)*.24,z:sway*.08};result.torso={x:.04,y:-sway*.1,z:-sway*.08};result.head={y:look*.12,z:sway*.09};result.armL={x:-.2,z:-.7+sway*.28};result.armR={x:-.2,z:.7+sway*.28};result.elbowL={x:-.55};result.elbowR={x:-.55};result.legL={x:sway*.24};result.legR={x:-sway*.24};result.kneeL={x:Math.max(0,-sway)*.24};result.kneeR={x:Math.max(0,sway)*.24};
 }
 return result;
}
