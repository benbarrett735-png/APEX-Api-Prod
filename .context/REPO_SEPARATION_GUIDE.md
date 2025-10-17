# Repository Separation - Per Kevin's Plan

**Created:** 2025-10-16  
**Purpose:** Define what goes where (API repo vs Portal repo)

---

## Kevin's Plan: Clear Separation of Concerns

### 3 Separate Repositories

```
1. APEX-Landing (Marketing Site)
   └── Already deployed ✅

2. APEX-Portal-Prod (Frontend Application)
   └── Next.js app for users
   
3. APEX-Api-Prod (Backend API)
   └── Express API for all backend logic
```

---

## API Repo (APEX-Api-Prod) - What Belongs Here

### ✅ ONLY Backend Code

**1. HTTP Routes**
- `/health` - Health checks
- `/chat/normal` - Normal chat endpoint
- `/adi/*` - Document analysis endpoints
- `/agentic-flow/*` - Agent orchestration endpoints
- Future: `/reports/*`, `/research/*`, etc.

**2. Business Logic (Services)**
- `agenticFlow.ts` - Agent orchestration engine
- `normalChatService.ts` - Chat logic
- `azureBlob.ts` - Azure storage integration
- `chartService.ts` - Chart generation
- `researchFlow.ts` - Research logic
- `reportExporter.ts` - Report generation

**3. Database**
- Database connection pool
- Migrations (SQL files)
- Query helpers

**4. Middleware**
- `requireAuth.ts` - JWT validation
- CORS configuration
- Helmet security

**5. Configuration**
- Environment variable management
- APIM/OpenAI/Azure config
- Model definitions

**6. Infrastructure**
- `Dockerfile` - Container definition
- App Runner configuration (via AWS Console)
- Environment variables (via AWS Console)

### ❌ NEVER in API Repo

- React/Next.js components
- Frontend routing
- UI state management
- CSS/styling
- Browser-specific code
- Frontend build tools (webpack, etc.)

---

## Portal Repo (APEX-Portal-Prod) - What Belongs There

### ✅ ONLY Frontend Code

**1. UI Components**
- Chat interface
- Document upload UI
- Agent mode selectors
- Report displays
- Charts rendering

**2. Frontend Logic**
- API client (calls APEX-Api-Prod)
- State management (React state, context, etc.)
- Form validation
- UI routing
- WebSocket/SSE handling

**3. Authentication (Client Side)**
- NextAuth configuration
- Cognito integration
- Session management
- Login/logout UI

**4. Styling**
- CSS/Tailwind
- Component styles
- Theme configuration

**5. Frontend Infrastructure**
- Next.js configuration
- Amplify configuration
- Build settings

### ❌ NEVER in Portal Repo

- Database connections
- OpenAI API calls
- APIM integration
- Business logic (agent orchestration, etc.)
- Direct Azure service calls
- Backend authentication logic

---

## Communication Flow (How They Work Together)

```
User Browser
    ↓
Portal (Next.js)
    ↓ HTTP/HTTPS
API (Express)
    ↓
├─→ Database (RDS)
├─→ OpenAI (APIM)
├─→ Azure Blob Storage
└─→ Azure Document Intelligence
```

### Example: Agent Report Generation

**Portal Responsibilities:**
1. User clicks "Generate Report" button
2. Show loading state
3. Call API: `POST /agentic-flow/runs`
4. Poll API: `GET /agentic-flow/runs/:runId`
5. Display streaming updates
6. Show final report

**API Responsibilities:**
1. Receive `/agentic-flow/runs` request
2. Validate auth token
3. Create database entry
4. Start orchestrator (AgenticFlow.execute())
5. Call OpenAI for planning
6. Execute steps
7. Store results in database
8. Return results to polling requests

---

## Where New Features Go

### Feature: New Chat Mode (e.g., "Templates")

**API Changes:**
```
APEX-Api-Prod/
├── src/routes/templates.ts          NEW - HTTP endpoint
├── src/services/templateService.ts  NEW - Business logic
└── src/index.ts                     EDIT - Mount route
```

**Portal Changes:**
```
APEX-Portal-Prod/
├── src/components/TemplateChat.tsx  NEW - UI component
├── src/lib/api/templates.ts         NEW - API client
└── src/pages/chat.tsx               EDIT - Add mode selector
```

---

### Feature: Export Reports to PDF

**API Changes:**
```
APEX-Api-Prod/
├── src/routes/reports.ts            EDIT - Add export endpoint
├── src/services/pdfExporter.ts      NEW - PDF generation
└── package.json                     EDIT - Add pdf library
```

**Portal Changes:**
```
APEX-Portal-Prod/
├── src/components/ExportButton.tsx  NEW - Export button UI
└── src/lib/api/reports.ts           EDIT - Add export call
```

---

### Feature: Real-time Notifications

**API Changes:**
```
APEX-Api-Prod/
├── src/routes/websocket.ts          NEW - WebSocket server
├── src/services/notifications.ts    NEW - Notification logic
└── src/index.ts                     EDIT - Add WS server
```

**Portal Changes:**
```
APEX-Portal-Prod/
├── src/hooks/useNotifications.ts    NEW - WebSocket client
├── src/components/NotificationBell.tsx  NEW - UI
└── src/components/Layout.tsx        EDIT - Add notification display
```

---

## Current Agentic Flow Issue - Where to Look

### Problem: "Thinking step appears but doesn't build report"

**This is BACKEND (API repo) issue:**

**Check in API:**
1. App Runner logs - Look for `executeFlowAsync` errors
2. Database - Check if steps are being created
3. OpenAI calls - Check if APIM/OpenAI responding

**Check in Portal:**
4. Network tab - Is polling working?
5. Console - Any errors in API responses?

**Most Likely Issues (All API-side):**

### Issue 1: Database Missing Tables
**Symptom:** Run creates but no steps appear  
**Location:** API database  
**Fix:** Run migrations in API repo

### Issue 2: OpenAI/APIM Errors
**Symptom:** Thinking step appears but fails  
**Location:** API service calls  
**Fix:** Check APIM credentials in API env vars

### Issue 3: Orchestrator Crashes
**Symptom:** Run starts but stops  
**Location:** API agenticFlow service  
**Fix:** Check App Runner logs

---

## Portal's Role in Agentic Flow

**Portal ONLY does this:**

```typescript
// 1. Start run
const response = await fetch('/agentic-flow/runs', {
  method: 'POST',
  body: JSON.stringify({ goal, mode })
});
const { run_id } = await response.json();

// 2. Poll for updates
const interval = setInterval(async () => {
  const status = await fetch(`/agentic-flow/runs/${run_id}`);
  const data = await status.json();
  
  // Display data.status, data.steps, etc.
  setSteps(data.steps);
  
  if (data.status === 'completed') {
    clearInterval(interval);
  }
}, 2000);
```

**That's it!** Portal just displays what API returns.

**All the actual work (thinking, planning, executing) happens in API.**

---

## Debugging the Agentic Flow Issue

### Step 1: Check API Logs (App Runner)

Look for these log lines:
```
[executeFlowAsync] ========== STARTING FLOW ==========
[executeFlowAsync] Run ID: xxx
[AgenticFlow] Starting execution
[AgenticFlow] Calling planner...
```

**If you DON'T see these:**
- executeFlowAsync isn't running
- Check database connection
- Check if run was created

**If you DO see these but it stops:**
- Check for errors after the logs
- Check OpenAI/APIM response
- Check database writes

### Step 2: Check Database

```sql
-- Check if run was created
SELECT * FROM agentic_runs ORDER BY created_at DESC LIMIT 5;

-- Check if steps are being created
SELECT * FROM agentic_steps WHERE run_id = 'YOUR_RUN_ID';

-- Check events
SELECT * FROM agentic_events WHERE run_id = 'YOUR_RUN_ID' ORDER BY ts;
```

### Step 3: Check Portal Polling

**Browser Console:**
```
// Should see polling requests every 2 seconds
Network tab → Filter by "runs"
Should see: GET /agentic-flow/runs/:runId
Response should have: { status, steps, events }
```

---

## What to Change Where - Summary

| Change Type | API Repo | Portal Repo |
|-------------|----------|-------------|
| New HTTP endpoint | ✅ Yes | ❌ No |
| Business logic | ✅ Yes | ❌ No |
| Database queries | ✅ Yes | ❌ No |
| External API calls (OpenAI, Azure) | ✅ Yes | ❌ No |
| UI components | ❌ No | ✅ Yes |
| Styling | ❌ No | ✅ Yes |
| Frontend routing | ❌ No | ✅ Yes |
| API client code | ❌ No | ✅ Yes |
| Authentication UI | ❌ No | ✅ Yes |
| JWT validation | ✅ Yes | ❌ No |
| Environment vars (backend) | ✅ Yes (App Runner) | ❌ No |
| Environment vars (frontend) | ❌ No | ✅ Yes (Amplify) |

---

## Kevin's Plan Checklist - Is This Repo Correct?

### ✅ What SHOULD Be Here (API Repo)
- [x] Express server
- [x] HTTP routes
- [x] Business logic services
- [x] Database connection
- [x] Migrations
- [x] Auth middleware
- [x] Dockerfile
- [x] No frontend code

### ❌ What Should NOT Be Here
- [ ] React components (should be in Portal)
- [ ] Next.js config (should be in Portal)
- [ ] Frontend state management (should be in Portal)
- [ ] UI styling (should be in Portal)

**Current Status:** ✅ Clean - API repo only has backend code

---

## Next: Fix Agentic Flow

**Action:** Check App Runner logs for orchestrator errors

**Tell me:**
1. What logs do you see after "STARTING FLOW"?
2. Are there any error messages?
3. Does the database have entries in `agentic_runs`?

**Then we'll know if it's:**
- Database issue (missing tables/permissions)
- OpenAI/APIM issue (API key/rate limit)
- Code issue (orchestrator crash)

