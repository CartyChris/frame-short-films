import {unzipSync} from 'fflate';
export function unpackVorkPackage(input:Uint8Array):Record<string,Uint8Array>{
 const limit=100*1024*1024;if(input.length>limit)throw new Error('The Vork package exceeds 100 MiB.');let total=0,count=0;const seen=new Set<string>();
 const files=unzipSync(input,{filter:file=>{const name=file.name;if(name.endsWith('/'))return false;const segments=name.split('/');if(!name||name.length>500||name.startsWith('-')||name.includes('\\')||name.includes(':')||/[\x00-\x1f\x7f]/.test(name)||segments.some(p=>!p||p==='.'||p==='..')||['record.json','record.tmp','output.png','output.mp4'].includes(name)||seen.has(name))throw new Error('The Vork package has an unsafe or duplicate file path.');seen.add(name);count++;total+=file.originalSize;if(count>500||total>limit)throw new Error('The Vork package exceeds the 500-file or 100 MiB limit.');return true}});
 if(!Object.keys(files).some(name=>name.endsWith('.json')))throw new Error('The Vork package must include a JSON scene.');return files;
}
