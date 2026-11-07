import type {CompanionSettings,McpConnection} from './integrations';

/** Live connection and pairing credentials exist only in this page's memory. */
export interface ActiveMcpSession {
 projectId:string;
 companion:CompanionSettings;
 connection:McpConnection;
 serverFingerprint:string;
}
let active:ActiveMcpSession|null=null;
const subscribers=new Set<()=>void>();
export function currentMcpSession(){return active}
export function subscribeMcpSession(listener:()=>void){subscribers.add(listener);return()=>subscribers.delete(listener)}
export function setMcpSession(session:ActiveMcpSession|null){active=session;for(const listener of subscribers)listener()}
export async function mcpServerFingerprint(transport:string,endpoint:string,info:McpConnection['serverInfo'],serverFingerprint?:string){
 if(transport==='custom-stdio'){
  if(!serverFingerprint||!/^[a-f0-9]{64}$/.test(serverFingerprint))throw new Error('The companion did not identify this local server profile.');
  return serverFingerprint;
 }
 const bytes=new TextEncoder().encode(JSON.stringify({transport,endpoint:transport==='http'?endpoint:'installed-blender-mcp',name:info.name||'',version:info.version||''}));
 const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
