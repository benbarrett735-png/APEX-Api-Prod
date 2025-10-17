# SIGTERM Issue - App Runner Killing Long-Running Agents

**Problem:** Agent flows die after ~2 minutes with SIGTERM signal

**Log Example:**
```
npm error signal SIGTERM
npm error command sh -c node dist/index.js
```

---

## What's Happening

1. Portal calls `/agentic-flow/runs` ✅
2. API responds immediately with run_id ✅
3. Agent starts in background ✅
4. After ~2 minutes, process gets SIGTERM ❌
5. Agent execution stops mid-flow ❌

---

## Why This Happens

App Runner has implicit request timeout of **120 seconds**.

Even though the agent runs async, something is keeping the original request context alive, causing App Runner to think it's a hung request and killing the process.

---

## The Fix - App Runner Configuration

**We need to tell App Runner to allow longer processing times.**

### Option 1: Increase Request Timeout (If Available)

Check if App Runner has a configurable request timeout:
```
AWS Console → App Runner → apex-api-staging
→ Configuration → Service settings
→ Look for "Request timeout" or similar
```

If it exists, set to **15 minutes (900 seconds)** or **disable**.

### Option 2: Use Environment Variable

Some services respect environment variables for timeouts:
```
REQUEST_TIMEOUT=900
NODE_OPTIONS=--max-old-space-size=2048
```

### Option 3: Keep-Alive Pattern (Best)

The agent SHOULD be fully detached. The issue might be that Node.js isn't actually closing the response.

---

## Code Check - Is Response Actually Closed?

In `src/routes/agentic-flow.ts` line 64-79:

```typescript
res.json({ 
  run_id: runId,
  message: 'Agentic flow run created successfully'
}); // ← Response sent here

// Start execution asynchronously
executeFlowAsync(runId, userId, mode || 'general').catch((error) => {
  console.error(`[POST /runs] ❌ executeFlowAsync failed:`, error.message);
});
```

This SHOULD close the response immediately. But Node.js might be keeping event loop open.

---

## Potential Fixes

### Fix 1: Explicitly End Response
```typescript
res.json({ run_id: runId, message: '...' });
res.end(); // ← Add this
```

### Fix 2: Detach with setImmediate
```typescript
res.json({ run_id: runId, message: '...' });

setImmediate(() => {
  executeFlowAsync(runId, userId, mode).catch(console.error);
});
```

### Fix 3: Use Process.nextTick
```typescript
res.json({ run_id: runId, message: '...' });

process.nextTick(() => {
  executeFlowAsync(runId, userId, mode).catch(console.error);
});
```

---

## Most Likely Solution

**The issue is App Runner's default 120 second request timeout.**

Since we can't configure it directly in App Runner, we need to ensure the response is TRULY closed before the async work starts.

---

## Recommended Action

Add explicit response closure:

```typescript
res.json({ 
  run_id: runId,
  message: 'Agentic flow run created successfully'
});

// Close the HTTP response completely
req.socket?.end();

// Then start async work
setImmediate(() => {
  executeFlowAsync(runId, userId, mode || 'general').catch((error) => {
    console.error(`[POST /runs] ❌ executeFlowAsync failed:`, error.message);
  });
});
```

---

## Test After Fix

1. Upload document
2. Start agent (reports/research/charts)
3. Check logs - should NOT see SIGTERM
4. Agent should complete all steps
5. Report should generate fully

---

## If Still Fails

Check:
1. App Runner logs for any other timeout config
2. Portal code - is it keeping connection open?
3. Load balancer timeout (if any)
4. CloudFront timeout (if in front of App Runner)

---

**Next:** Apply the explicit response closure fix

