import {openDB, type IDBPDatabase} from 'idb';

/**
 * Durable local journal only. It does not dispatch MCP calls. Project/pipeline/task
 * values must be opaque IDs, never credentials, prompts, URLs, or arguments.
 * Compute fingerprints/digests from canonical bytes before calling claim().
 */
export interface McpOperationIdentity {
 requestId:string;
 serverFingerprint:string;
 toolName:string;
 argumentsDigest:string;
 projectId:string;
 pipelineId:string;
 taskId:string;
}
export type McpOperationState='pending'|'unknown'|'complete'|'failed';
/** Restricted fields prevent raw server text, tool arguments, and returned media entering the journal. */
export interface McpReceipt {outcome:'success'|'rejected'|'cancelled'; artifactCount?:number; errorCode?:'INVALID_INPUT'|'NOT_FOUND'|'DENIED'|'UNAVAILABLE'|'TIMEOUT'|'OTHER'}
export interface McpJournalRecord {identity:McpOperationIdentity;state:McpOperationState;createdAt:number;updatedAt:number;dispatchedAt?:number;receipt?:McpReceipt}
interface StoredRecord extends McpJournalRecord {ownerToken?:string}
export interface McpClaim {created:boolean;record:McpJournalRecord;ownerToken?:string}
export interface McpJournal {claim(identity:McpOperationIdentity):Promise<McpClaim>;markDispatched(requestId:string,ownerToken:string):Promise<boolean>;finish(requestId:string,ownerToken:string,receipt:McpReceipt):Promise<McpJournalRecord>;resolveUncertain(requestId:string,receipt:McpReceipt):Promise<McpJournalRecord>;get(requestId:string):Promise<McpJournalRecord|undefined>;list(projectId:string):Promise<McpJournalRecord[]>;exportRecords(projectId:string):Promise<McpJournalRecord[]>;importRecords(records:McpJournalRecord[]):Promise<void>;close():Promise<void>}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,hex=/^[0-9a-f]{64}$/;
const outcomes=new Set(['success','rejected','cancelled']),codes=new Set(['INVALID_INPUT','NOT_FOUND','DENIED','UNAVAILABLE','TIMEOUT','OTHER']);
function cleanIdentity(value:McpOperationIdentity):McpOperationIdentity {
 if(!value||typeof value!=='object'||!uuid.test(value.requestId)||!hex.test(value.serverFingerprint)||!hex.test(value.argumentsDigest)||!/^[-a-zA-Z0-9_.:]{1,200}$/.test(value.toolName))throw new Error('Invalid MCP operation identity.');
 for(const key of ['projectId','pipelineId','taskId'] as const)if(typeof value[key]!=='string'||!value[key]||value[key].length>200||/[\x00-\x1f]/.test(value[key]))throw new Error('Invalid MCP operation identity.');
 return {requestId:value.requestId.toLowerCase(),serverFingerprint:value.serverFingerprint,toolName:value.toolName,argumentsDigest:value.argumentsDigest,projectId:value.projectId,pipelineId:value.pipelineId,taskId:value.taskId};
}
function cleanReceipt(value:McpReceipt):McpReceipt {
 if(!value||typeof value!=='object'||!outcomes.has(value.outcome)||Object.keys(value).some(k=>!['outcome','artifactCount','errorCode'].includes(k)))throw new Error('Invalid MCP receipt.');
 if(value.artifactCount!==undefined&&(!Number.isSafeInteger(value.artifactCount)||value.artifactCount<0||value.artifactCount>1_000_000))throw new Error('Invalid MCP receipt.');
 if(value.errorCode!==undefined&&!codes.has(value.errorCode))throw new Error('Invalid MCP receipt.');
 if(value.outcome==='success'&&value.errorCode!==undefined)throw new Error('A successful receipt cannot include an error code.');
 return {outcome:value.outcome,...(value.artifactCount!==undefined?{artifactCount:value.artifactCount}:{}),...(value.errorCode!==undefined?{errorCode:value.errorCode}:{})};
}
function cleanRecord(value:McpJournalRecord):McpJournalRecord {
 if(!value||typeof value!=='object'||!['pending','unknown','complete','failed'].includes(value.state)||!Number.isFinite(value.createdAt)||!Number.isFinite(value.updatedAt)||value.updatedAt<value.createdAt||(value.dispatchedAt!==undefined&&(!Number.isFinite(value.dispatchedAt)||value.dispatchedAt<value.createdAt||value.dispatchedAt>value.updatedAt)))throw new Error('Invalid MCP journal record.');
 const receipt=value.receipt===undefined?undefined:cleanReceipt(value.receipt);
 if((value.state==='complete'&&receipt?.outcome!=='success')||(value.state==='failed'&&(!receipt||receipt.outcome==='success'))||((value.state==='pending'||value.state==='unknown')&&receipt))throw new Error('Invalid MCP journal state.');
 return {identity:cleanIdentity(value.identity),state:value.state,createdAt:value.createdAt,updatedAt:value.updatedAt,...(value.dispatchedAt!==undefined?{dispatchedAt:value.dispatchedAt}:{}),...(receipt?{receipt}:{})};
}
function same(a:McpOperationIdentity,b:McpOperationIdentity){return (Object.keys(a) as (keyof McpOperationIdentity)[]).every(k=>a[k]===b[k])}
function publicRecord(value:StoredRecord):McpJournalRecord {return cleanRecord(value)}
export async function digestMcpBytes(bytes:Uint8Array):Promise<string>{const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
/** A separate database allows adoption without changing the main project schema. */
export function createMcpJournal(databaseName='frame-mcp-operation-journal'):McpJournal {
 const opened:Promise<IDBPDatabase>=openDB(databaseName,1,{upgrade(db){db.createObjectStore('operations',{keyPath:'identity.requestId'})}});
 async function transaction<T>(work:(store:any)=>Promise<T>):Promise<T>{const db=await opened,tx=db.transaction('operations','readwrite');try{const result=await work(tx.objectStore('operations'));await tx.done;return result}catch(e){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw e}}
 async function claim(input:McpOperationIdentity):Promise<McpClaim>{const identity=cleanIdentity(input);return transaction(async store=>{const old=await store.get(identity.requestId) as StoredRecord|undefined;if(old){if(!same(cleanIdentity(old.identity),identity))throw new Error('This MCP request ID belongs to a different operation.');return {created:false,record:publicRecord(old)}}const now=Date.now(),ownerToken=crypto.randomUUID(),record:StoredRecord={identity,state:'pending',createdAt:now,updatedAt:now,ownerToken};await store.add(record);return {created:true,record:publicRecord(record),ownerToken}})}
 async function markDispatched(id:string,token:string):Promise<boolean>{return transaction(async store=>{const record=await store.get(id.toLowerCase()) as StoredRecord|undefined;if(!record||record.ownerToken!==token||record.state!=='pending')return false;const now=Math.max(Date.now(),record.updatedAt);await store.put({...record,state:'unknown',dispatchedAt:now,updatedAt:now});return true})}
 async function settle(id:string,token:string|undefined,raw:McpReceipt,manual:boolean):Promise<McpJournalRecord>{const receipt=cleanReceipt(raw);return transaction(async store=>{const record=await store.get(id.toLowerCase()) as StoredRecord|undefined;if(!record||record.state!=='unknown'||(!manual&&record.ownerToken!==token))throw new Error('This MCP operation cannot be resolved from its current state.');const next:StoredRecord={...record,state:receipt.outcome==='success'?'complete':'failed',receipt,updatedAt:Math.max(Date.now(),record.updatedAt)};delete next.ownerToken;await store.put(next);return publicRecord(next)})}
 async function get(id:string){const db=await opened,record=await db.get('operations',id.toLowerCase()) as StoredRecord|undefined;return record?publicRecord(record):undefined}
 async function list(projectId:string){const db=await opened,records=await db.getAll('operations') as StoredRecord[];return records.filter(v=>v.identity.projectId===projectId).map(publicRecord)}
 async function importRecords(input:McpJournalRecord[]){if(!Array.isArray(input)||input.length>10000)throw new Error('Invalid MCP journal archive.');const seen=new Set<string>(),records=input.map(raw=>{const record=cleanRecord(raw),id=record.identity.requestId;if(seen.has(id))throw new Error('Duplicate MCP request ID in archive.');seen.add(id);return record});await transaction(async store=>{for(const record of records){const id=record.identity.requestId,old=await store.get(id) as StoredRecord|undefined;if(old){if(!same(cleanIdentity(old.identity),record.identity))throw new Error('This MCP request ID belongs to a different operation.');continue}/* A restored pending claim may have dispatched elsewhere. Never give it a dispatch permit. */await store.add(record.state==='pending'?{...record,state:'unknown',updatedAt:Math.max(Date.now(),record.updatedAt)}:record)}})}
 return {claim,markDispatched,finish:(id,token,receipt)=>settle(id,token,receipt,false),resolveUncertain:(id,receipt)=>settle(id,undefined,receipt,true),get,list,exportRecords:list,importRecords,close:async()=>{(await opened).close()}};
}
