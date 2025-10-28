# Polling Architecture Implementation

**Status:** Phase 1 Complete (Foundation)  
**Date:** 2025-10-28  
**Reason:** AWS Amplify Lambda@Edge 30-second timeout (cannot be bypassed)

---

## Problem Statement

### SSE Architecture Issues:
- AWS Amplify uses Lambda@Edge for Next.js API routes
- **Hard 30-second timeout** on origin requests (cannot be increased)
- Keep-alive pings don't help - connection killed regardless
- Research/Reports take 2-5 minutes → incompatible

### Evidence:
```
05:50:46 - [Research] ✅ KEEP-ALIVE INTERVAL STARTING
05:50:48 - 📡 Keep-alive ping #1 sent
05:50:50 - 📡 Keep-alive ping #2 sent
... 14 pings sent over 28 seconds ...
05:51:16 - Client disconnected (at 30s exactly) ❌
05:51:17 - Backend keeps processing ✅
05:52:47 - Research completes successfully ✅
```

**Conclusion:** Backend works perfectly, but frontend times out. SSE is incompatible with Amplify's edge infrastructure.

---

## Solution: Polling Architecture

### Pattern: start → poll → append

```
1. POST /research-polling/runs
   → Enqueue job, return { runId } in < 1s
   
2. GET /research-polling/runs/:runId/poll?cursor=0
   → Return { items[], cursor, done } in < 5s
   → Poll every 1-2 seconds
   
3. DELETE /research-polling/runs/:runId (optional)
   → Cancel run
```

### Benefits:
- ✅ No timeout issues (each request < 10s)
- ✅ Works on ANY platform (Amplify, Vercel, Cloudflare Workers)
- ✅ Edge/serverless friendly
- ✅ Kevin-aligned (infrastructure simplification)
- ✅ More reliable than SSE

---

## Implementation (Phase 1)

### Database Schema:

**`agent_runs` table:**
```sql
id TEXT PRIMARY KEY
user_id TEXT NOT NULL
type TEXT NOT NULL -- 'research' | 'report' | 'template' | 'chart'
status TEXT NOT NULL -- 'queued' | 'running' | 'done' | 'error' | 'cancelled'
input JSONB NOT NULL
metadata JSONB DEFAULT '{}'
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
```

**`agent_run_items` table:**
```sql
id SERIAL PRIMARY KEY
run_id TEXT REFERENCES agent_runs(id)
seq INTEGER NOT NULL -- cursor
type TEXT NOT NULL -- 'text_delta' | 'partial_replace' | 'status' | 'complete'
payload JSONB NOT NULL
created_at TIMESTAMPTZ
```

### API Endpoints:

**POST `/research-polling/runs`**
- Body: `{ query, depth, uploaded_files[], include_charts[] }`
- Response: `{ runId }` (< 1s)
- Side effect: Inserts row, starts background worker

**GET `/research-polling/runs/:runId/poll?cursor=N`**
- Response: `{ items[], cursor, done, status }` (< 5s)
- Returns only new items since cursor
- Poll every 1-2 seconds until done=true

**DELETE `/research-polling/runs/:runId`**
- Cancels run
- Background worker checks status and stops

### Item Types:

```typescript
{ t: 'status', stage: 'planning', label: 'Planning research...' }
{ t: 'text_delta', id: 'm1', text: ' more tokens...' }
{ t: 'partial_replace', id: 'm1', text: ' revised chunk' }
{ t: 'complete' } // final item when done
```

---

## Files Changed (Phase 1)

```
migrations/025_polling_state.sql          // Tables + helper functions
src/services/agentStore.ts               // State management + polling
src/routes/research-polling.ts           // Research polling endpoints
src/index.ts                             // Register routes
```

---

## Next Phases

### Phase 2: Integrate with Existing Logic (1-2 days)
- [ ] Adapt existing `processResearch()` to emit items
- [ ] Add polling routes for reports (`/reports-polling/runs`)
- [ ] Add polling routes for templates (`/templates-polling/runs`)
- [ ] Add polling routes for charts (`/agentic-flow-polling/runs`)
- [ ] Test all 4 agent types

### Phase 3: Portal Changes (1 day)
- [ ] Create `usePolling()` hook to replace EventSource
- [ ] Update Research component to use polling
- [ ] Update Reports component to use polling
- [ ] Update Templates component to use polling
- [ ] Update Charts component to use polling

### Phase 4: Cleanup (0.5 day)
- [ ] Remove old SSE endpoints once polling proven
- [ ] Update documentation
- [ ] Deploy to production

---

## Testing Plan

### Local Testing:
```bash
# Start server
npm run dev

# Start research run
curl -X POST http://localhost:3000/research-polling/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"test","depth":"medium"}'

# Poll for updates (repeat until done=true)
curl "http://localhost:3000/research-polling/runs/run_xxx/poll?cursor=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Staging Testing:
1. Deploy to App Runner
2. Run migration 025
3. Test polling endpoints
4. Verify < 10s response times
5. Verify no timeouts on long operations

---

## Performance Characteristics

### API Load:
- **Poll frequency:** 1-2 seconds
- **Requests per 3-min operation:** ~90-180 polls
- **Response time:** < 100ms per poll (fast DB query)
- **Network overhead:** Minimal (small JSON responses)

### User Experience:
- **Feels real-time:** 1-2s polling indistinguishable from SSE
- **More reliable:** No connection drops
- **Better error handling:** Simple HTTP retry logic

---

## Alignment with Kevin's Plan

✅ **Infrastructure Simplification:**  
- No complex SSE/WebSocket infrastructure
- Works with simple HTTP endpoints
- Platform-agnostic (Amplify, Vercel, etc.)

✅ **Deployment Speed:**  
- No special configuration needed
- Standard REST API patterns

✅ **Cost Efficiency:**  
- Fewer failed requests
- No need for dedicated streaming infrastructure

✅ **Maintainability:**  
- Easier to debug (standard HTTP)
- Simpler error handling
- Better observability

---

## References

- AWS Lambda@Edge timeout: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-requirements-limits.html
- Amplify timeout issues: https://github.com/aws-amplify/amplify-hosting/issues/XXX
- Polling vs SSE comparison: https://ably.com/topic/long-polling

---

**Author:** APEX Team  
**Reviewed:** Kevin (Architecture Owner)  
**Status:** Phase 1 Complete, Ready for Phase 2

