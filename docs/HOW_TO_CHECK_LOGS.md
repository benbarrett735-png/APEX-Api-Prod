# How to Check Application Logs in App Runner

**What You Showed:** Deployment logs ✅ (Build successful)  
**What We Need:** Application logs (runtime errors)

---

## Where to Find Application Logs

### AWS Console → App Runner → apex-api-staging

**Click on "Logs" tab at the top**

You'll see two types of logs:

1. **Deployment logs** (what you showed) - Build success/failure
2. **Application logs** (what we need) - Runtime errors

---

## How to See Application Logs

### Option 1: App Runner Console (Easier)

1. Go to: **App Runner → apex-api-staging**
2. Click: **"Logs"** tab
3. Look for: **"Application logs"** section (not "Deployment logs")
4. Filter by: Last 30 minutes
5. Search for: `executeFlowAsync` or `AgenticFlow`

### Option 2: CloudWatch (More Detailed)

1. Go to: **CloudWatch → Log groups**
2. Find: `/aws/apprunner/apex-api-staging/application`
3. Click on latest log stream
4. Search for: `executeFlowAsync` or `AgenticFlow` or errors

---

## What to Look For

### When You Trigger Agent Mode

**You should see these logs in sequence:**

```
✅ Good - API received request:
[POST /runs] Request received:
[POST /runs] Goal: Create a sales summary
[POST /runs] Mode: reports

✅ Good - Starting async execution:
[POST /runs] Starting async execution for run abc123
[POST /runs] About to call executeFlowAsync

✅ Good - Orchestrator started:
[executeFlowAsync] ========== STARTING FLOW ==========
[executeFlowAsync] Run ID: abc123
[executeFlowAsync] User ID: user123
[executeFlowAsync] Mode: reports

✅ Good - Flow instance created:
[executeFlowAsync] ✅ AgenticFlow instance created
[executeFlowAsync] About to call flow.execute()...

✅ Good - Execution started:
[AgenticFlow] Starting execution for run abc123
[AgenticFlow] Mode: reports

❓ THEN WHAT HAPPENS?
```

### Common Failure Points

**1. Database Error (Most Likely)**
```
❌ Error: relation "agentic_runs" does not exist
❌ Error: insert into agentic_steps...
❌ Error: ECONNREFUSED (can't reach database)
```

**Fix:** Run migrations or configure VPC

**2. OpenAI/APIM Error**
```
❌ Error: 401 Unauthorized (OpenAI)
❌ Error: Invalid API key
❌ Error: Rate limit exceeded
```

**Fix:** Check OPENAI_API_KEY or APIM_SUBSCRIPTION_KEY

**3. Code Crash**
```
❌ TypeError: Cannot read property 'x' of undefined
❌ ReferenceError: X is not defined
```

**Fix:** Code issue - need to debug specific error

---

## Quick Test - Simplified Logging

If you can't find the logs easily, let's add more logging:

### Add Console Logs to See What's Happening

Tell me if you want me to add extra logging to the code to help debug.

---

## What I Need From You

**Go to App Runner → Logs → Application logs**

Then tell me:

1. **Do you see `[POST /runs]` logs?**
   - YES = API received the request ✅
   - NO = Request not reaching API ❌

2. **Do you see `[executeFlowAsync] STARTING FLOW`?**
   - YES = Orchestrator started ✅
   - NO = Orchestrator not being called ❌

3. **Do you see `[AgenticFlow]` logs?**
   - YES = Flow executing ✅
   - NO = Flow crashed before starting ❌

4. **Do you see any ERROR or ❌ messages?**
   - Copy the full error message

---

## Alternative: Test Database Directly

If you can't find logs, let's test if database tables exist:

```bash
psql "postgresql://apex_admin:w1g(j6BF1ZFIit]!)kYv]Zyk2Zdp@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex"

# Check tables
\dt agentic*

# Expected:
#  agentic_runs
#  agentic_steps  
#  agentic_events

# If they don't exist, run:
\i /Users/benbarrett/APEX-Api-Prod/migrations/016_agentic_flow.sql
\i /Users/benbarrett/APEX-Api-Prod/migrations/020_agentic_flow.sql
\i /Users/benbarrett/APEX-Api-Prod/migrations/022_add_mode_to_agentic_runs.sql
```

---

## Summary

**Deployment logs = Build status** (what you showed - all successful ✅)  
**Application logs = Runtime errors** (what we need to see agent flow issues)

**Next step:** Check Application logs for agent-related errors.

