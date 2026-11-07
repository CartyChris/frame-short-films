import {describe,expect,it} from 'vitest';
import {currentMcpSession,mcpServerFingerprint,setMcpSession,subscribeMcpSession} from '../src/lib/mcp-session';

describe('local MCP session',()=>{
 it('notifies listeners and keeps credentials only in the live in-memory session',async()=>{
  let updates=0;const unsubscribe=subscribeMcpSession(()=>updates++);
  const serverFingerprint=await mcpServerFingerprint('http','http://127.0.0.1:8000/mcp',{name:'fixture',version:'1'});
  setMcpSession({projectId:'project',companion:{url:'http://127.0.0.1:4319',token:'test-secret'},serverFingerprint,connection:{connectionId:'session',status:'connected',serverInfo:{name:'fixture'},tools:[]}});
  expect(currentMcpSession()?.serverFingerprint).toBe(serverFingerprint);expect(serverFingerprint).toMatch(/^[a-f0-9]{64}$/);expect(serverFingerprint).not.toContain('test-secret');
  setMcpSession(null);unsubscribe();expect(currentMcpSession()).toBeNull();expect(updates).toBe(2);
 });
});
