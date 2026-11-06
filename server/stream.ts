import type { StreamEvent } from '../src/lib/types.js';

export interface SSEEvent {event:string;data:string}
export async function* parseSSE(stream:ReadableStream<Uint8Array>):AsyncGenerator<SSEEvent>{
  const reader=stream.getReader();const decoder=new TextDecoder();let buffer='',data:string[]=[],event='message';
  function line(text:string):SSEEvent|undefined{
    if(text===''){if(!data.length){event='message';return;}const result={event,data:data.join('\n')};data=[];event='message';return result;}
    if(text.startsWith(':'))return;const colon=text.indexOf(':');const field=colon<0?text:text.slice(0,colon);let value=colon<0?'':text.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);
    if(field==='data')data.push(value);else if(field==='event')event=value;return;
  }
  try{
    while(true){const chunk=await reader.read();buffer+=chunk.done?decoder.decode():decoder.decode(chunk.value,{stream:true});
      let newline:number;while((newline=buffer.indexOf('\n'))>=0){const text=buffer.slice(0,newline).replace(/\r$/,'');buffer=buffer.slice(newline+1);const parsed=line(text);if(parsed)yield parsed;}
      if(buffer.length>2_000_000)throw new Error('Provider emitted an oversized streaming event.');if(chunk.done)break;
    }
    // A final complete data event may legally lack a trailing blank line.
    if(buffer){const parsed=line(buffer.replace(/\r$/,''));if(parsed)yield parsed;}
    const tail=line('');if(tail)yield tail;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function consumeGeneration(stream:ReadableStream<Uint8Array>,provider:string,emit:(event:StreamEvent)=>void|Promise<void>,secret=''):Promise<void>{
  let terminal=false,finishReason='',failed=false;
  const error=(message:string)=>({type:'error' as const,message:(secret?message.split(secret).join('[redacted]'):message).slice(0,1800)});
  try{
    for await(const event of parseSSE(stream)){
      if(event.data==='[DONE]'){if(provider!=='anthropic'){terminal=true;finishReason||='stop';}continue;}
      let item:Record<string,any>;try{item=JSON.parse(event.data);}catch{throw new Error('The provider sent a malformed streaming event; received text has been preserved.');}
      if(item.error||event.event==='error'||item.type==='error'){failed=true;await emit(error(String(item.error?.message||item.error||item.message||'Provider failed during generation.')));break;}
      if(provider==='anthropic'){
        if(item.type==='content_block_start'&&item.content_block?.type==='text'&&item.content_block.text)await emit({type:'delta',text:String(item.content_block.text)});
        if(item.type==='content_block_delta'&&item.delta?.type==='text_delta'&&typeof item.delta.text==='string')await emit({type:'delta',text:item.delta.text});
        if(item.type==='message_delta'&&item.delta?.stop_reason)finishReason=String(item.delta.stop_reason);
        if(item.type==='message_stop'){terminal=true;finishReason||='end_turn';}
      }else{
        const choice=item.choices?.[0];const content=choice?.delta?.content;
        if(typeof content==='string'&&content)await emit({type:'delta',text:content});
        else if(Array.isArray(content)){for(const part of content)if(typeof part.text==='string')await emit({type:'delta',text:part.text});}
        if(choice?.finish_reason){finishReason=String(choice.finish_reason);terminal=true;}
      }
    }
    if(failed)return;
    if(!terminal){await emit(error('The provider connection ended before completion. Your received code is saved; use Continue to resume.'));return;}
    const normalized=finishReason==='max_tokens'?'length':finishReason;
    await emit({type:'done',finishReason:normalized||'stop'});
  }catch(e){if(!failed)await emit(error(e instanceof Error?e.message:'The provider stream was interrupted. Received code is preserved.'));}
}
