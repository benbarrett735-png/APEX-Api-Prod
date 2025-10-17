# Orchestrator Debug - Agent Flow Dying Midway

**Issue:** Orchestrator starts but dies partway through execution  
**Status:** Need to check logs

---

## What to Check in App Runner Logs

Go to: **App Runner → apex-api-staging → Logs → Application logs**

Search for your recent agent run and look for these patterns:

### 1. Initial Start (Should See This)
```
[POST /runs] Request received
[POST /runs] Starting async execution
[executeFlowAsync] ========== STARTING FLOW ==========
[AgenticFlow] Starting execution
```

### 2. Where Does It Die? (Look for errors after this)

**Common Failure Points:**

#### A) Planner Call Fails
```
[AgenticFlow] Calling planner...
❌ Error: 401 Unauthorized (OpenAI)
❌ Error: Rate limit exceeded
❌ Error: APIM error
```

#### B) Step Creation Fails
```
[AgenticFlow] Creating step: thinking
❌ Error: insert into agentic_steps
❌ Database error
```

#### C) Execution Loop Crashes
```
[AgenticFlow] Executing step 1
[AgenticFlow] Calling tool: research
❌ TypeError: Cannot read property...
❌ ReferenceError: X is not defined
```

#### D) Silent Timeout
```
[AgenticFlow] Starting execution
[AgenticFlow] Mode: reports
(then nothing - no more logs)
```

---

## What to Tell Me

**Copy and paste the logs from:**

1. When you see `[POST /runs] Request received`
2. Through to where it stops or errors
3. Include any ❌ or Error messages

**Or tell me:**
- Does it get past "STARTING FLOW"?
- Does it get past "Calling planner"?
- Where does it stop (last log message)?
- Any error messages?

---

## Quick Checks While We Wait

### Check 1: Database Tables Exist

```bash
psql "postgresql://apex_admin:w1g(j6BF1ZFIit]!)kYv]Zyk2Zdp@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex"

-- Check tables
\dt agentic*

-- Check if runs are being created
SELECT id, goal, status, mode, created_at 
FROM agentic_runs 
ORDER BY created_at DESC 
LIMIT 5;

-- Check if steps are being created
SELECT run_id, step_order, step_type, status, created_at
FROM agentic_steps
ORDER BY created_at DESC
LIMIT 10;
```

### Check 2: Recent Run Status

If you know the run ID from the portal:
```sql
-- Replace YOUR_RUN_ID
SELECT * FROM agentic_runs WHERE id = 'YOUR_RUN_ID';
SELECT * FROM agentic_steps WHERE run_id = 'YOUR_RUN_ID' ORDER BY step_order;
SELECT * FROM agentic_events WHERE run_id = 'YOUR_RUN_ID' ORDER BY ts;
```

---

## Most Likely Issues

### Issue 1: OpenAI Rate Limit or API Error
**Symptom:** Gets to planner call then stops  
**Check:** OPENAI_API_KEY valid and not rate limited

### Issue 2: Database Write Fails
**Symptom:** Run created but no steps  
**Check:** Database permissions, table structure

### Issue 3: Code Crash in Orchestrator
**Symptom:** Partial execution then silence  
**Check:** TypeError or ReferenceError in logs

### Issue 4: Missing Migration
**Symptom:** Specific table/column doesn't exist  
**Check:** All agentic flow migrations run

---

## Next Steps

1. **Get the logs** - Copy from App Runner
2. **Share the error** - Tell me where it dies
3. **We'll fix it** - Based on the specific error

**Go check App Runner logs now and tell me what you see!**

