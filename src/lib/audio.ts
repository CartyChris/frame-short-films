/** Original procedural audio, stored as ordinary WAV bytes for offline HTML. */
export type ToneKind='ambient'|'piano'|'chime'|'pulse';
export function generateToneWav(kind:ToneKind,duration:number):Blob{
 if(!Number.isFinite(duration)||duration<=0)throw new Error('Choose a sound duration greater than zero.');
 if(duration>600)throw new Error('Generate a sound clip up to 10 minutes, then loop it on the timeline for longer films.');
 const rate=22050,frames=Math.round(duration*rate),left=new Float32Array(frames),right=new Float32Array(frames);
 const chords=[[62,66,69],[59,62,66],[55,59,62],[57,61,64]],beat=60/96,bar=beat*4;
 const freq=(n:number)=>440*Math.pow(2,(n-69)/12),sin=Math.sin,TAU=Math.PI*2;
 const envelope=(t:number)=>Math.sin(Math.min(1,t/.12)*Math.PI/2)**2*Math.sin(Math.min(1,Math.max(0,duration-t)/Math.min(1.3,duration/3))*Math.PI/2)**2;
 let peak=0;
 for(let i=0;i<frames;i++){
  const t=i/rate,chord=chords[Math.floor(t/bar)%4];let l=0,r=0;
  if(kind==='ambient')for(let n=0;n<3;n++){const f=freq(chord[n]-12),swell=.75+.25*sin(t*.7+n);l+=(sin(TAU*f*t+n)+.14*sin(TAU*f*2*t))*.14*swell;r+=(sin(TAU*f*1.0018*t+n)+.14*sin(TAU*f*2.002*t))*.14*swell;}
  if(kind==='piano'){
   const step=Math.floor(t/(beat/2));for(let k=0;k<6;k++){const j=step-k;if(j<0)continue;const elapsed=t-j*(beat/2),notes=chords[Math.floor(j/8)%4],midi=notes[[0,1,2,1,0,2,1,2][j%8]]+(j%4===3?12:0),f=freq(midi);const amp=(1-Math.exp(-elapsed/.008))*Math.exp(-elapsed/1.25);const note=(sin(TAU*f*elapsed)+.23*sin(TAU*f*2.001*elapsed)+.06*sin(TAU*f*3.004*elapsed))*amp*.2;const pan=sin(j*1.17)*.3;l+=note*(.7-pan);r+=note*(.7+pan)}
   const bass=freq(chord[0]-24);l+=sin(TAU*bass*t)*.05;r+=sin(TAU*bass*1.0004*t)*.05;
  }
  if(kind==='chime'){const step=Math.floor(t/1.25);for(let k=0;k<4;k++){const j=step-k;if(j<0)continue;const elapsed=t-j*1.25,f=freq([74,78,81,85,81,78,76,73][j%8]),amp=(1-Math.exp(-elapsed/.004))*Math.exp(-elapsed/1.1),note=(sin(TAU*f*elapsed)+.12*sin(TAU*f*2.76*elapsed))*amp*.24;l+=note*(.7+.15*sin(j));r+=note*(.7-.15*sin(j))}}
  if(kind==='pulse'){const phase=t%beat,f=freq(chord[0]-24),kick=sin(TAU*f*phase+1.8*Math.exp(-phase*28))*Math.exp(-phase*13)*.31;const high=freq(chord[Math.floor(t/beat)%3]),arp=sin(TAU*high*phase)*Math.exp(-phase*7)*.09;l=kick+arp;r=kick+arp*.92;}
  const fade=envelope(t);left[i]=l*fade;right[i]=r*fade;peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
 }
 const scale=peak>0?.78/peak:0,buffer=new ArrayBuffer(44+frames*4),view=new DataView(buffer);const str=(offset:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i))};
 str(0,'RIFF');view.setUint32(4,36+frames*4,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,rate,true);view.setUint32(28,rate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,frames*4,true);
 for(let i=0;i<frames;i++){view.setInt16(44+i*4,Math.round(left[i]*scale*32767),true);view.setInt16(46+i*4,Math.round(right[i]*scale*32767),true)}return new Blob([buffer],{type:'audio/wav'});
}
export async function blobToDataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error||new Error('Could not read audio'));reader.readAsDataURL(blob)})}
