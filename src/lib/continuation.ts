/** Canonical display/recovery assembly. Raw chunks remain immutable in the journal. */
export function combineContinuation(base:string,newText:string){if(!base)return newText;const max=Math.min(16000,base.length,newText.length);for(let n=max;n>=32;n--){if(base.endsWith(newText.slice(0,n)))return base+newText.slice(n);}return base+newText;}
