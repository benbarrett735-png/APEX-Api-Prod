type Message = { role:'system'|'user'|'assistant'; content:string; ts:number };
const mem = new Map<string, Message[]>();
export const chatStore = {
  async get(threadId:string, limit=50){ const a=mem.get(threadId)||[]; return a.slice(-limit); },
  async create(){ const id=globalThis.crypto?.randomUUID() || Math.random().toString(36).slice(2); mem.set(id, []); return { threadId:id }; },
  async append(id:string, m:Message){ const a=mem.get(id)||[]; a.push(m); mem.set(id,a); },
};