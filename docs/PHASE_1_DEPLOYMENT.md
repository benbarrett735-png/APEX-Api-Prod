# Phase 1: Research Mode Deployment Guide

**Date:** October 26, 2025  
**Status:** Ready for AWS App Runner Staging  
**Alignment with Kevin's Plan:** ✅ 100%

---

## What Was Built (Phase 1)

### ✅ **Core Features**
- `POST /research/start` - Create research run, return run_id
- `GET /research/stream/:id` - SSE stream with thinking events
- Database: `research_runs` and `research_activities` tables
- Hardcoded events for testing Portal connection

### ✅ **Kevin's Plan Alignment**
- ✅ All business logic in API (not Portal)
- ✅ JWKS Bearer token auth (existing middleware)
- ✅ Uses existing APIM integration
- ✅ PostgreSQL database
- ✅ TypeScript → compiles to `dist/`
- ✅ No new environment variables needed
- ✅ Automatic deployment via GitHub push

---

## Environment Variables (Already in App Runner)

**No new env vars needed!** Phase 1 uses existing config:

```bash
# Auth (already configured)
OIDC_AUTHORITY=https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_JiQF0xM04
OIDC_CLIENT_ID=6mvn1gc775h8ibei5phrkk60l1

# Database (already configured)
DATABASE_URL=postgresql://apex_admin:...@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex
PGSSL=1

# APIM (already configured - used in Phase 2+)
APIM_HOST=https://nomad-apex.azure-api.net
APIM_SUBSCRIPTION_KEY=101dda01e4224459aca098ac88ba8e11

# OpenAI (already configured - used in Phase 4)
OPENAI_API_KEY=sk-proj-...
```

---

## Deployment Steps

### **1. Run Database Migration in Staging**

**After pushing to GitHub and App Runner deploys:**

```bash
# Use AWS RDS Query Editor or psql client

psql $DATABASE_URL -f migrations/023_research_runs.sql
```

**OR manually run SQL:**

```sql
-- Create o1_research_runs table (separate from legacy research_runs)
CREATE TABLE IF NOT EXISTS o1_research_runs (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    depth VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    uploaded_files JSONB DEFAULT '[]'::jsonb,
    include_charts JSONB DEFAULT '[]'::jsonb,
    target_sources JSONB DEFAULT '[]'::jsonb,
    report_content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_research_runs_user_id ON research_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_status ON research_runs(status);
CREATE INDEX IF NOT EXISTS idx_research_runs_created_at ON research_runs(created_at DESC);

-- Create research_activities table
CREATE TABLE IF NOT EXISTS o1_research_activities (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR(255) NOT NULL REFERENCES o1_research_runs(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    activity_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_o1_research_activities_run_id ON o1_research_activities(run_id);
CREATE INDEX IF NOT EXISTS idx_o1_research_activities_created_at ON o1_research_activities(created_at);
```

### **2. Push to GitHub**

```bash
git add migrations/023_research_runs.sql
git add src/routes/research.ts
git add docs/PHASE_1_DEPLOYMENT.md
git commit -m "feat: Phase 1 - Research mode with SSE streaming

- Add POST /research/start endpoint
- Add GET /research/stream/:id SSE endpoint
- Create research_runs and research_activities tables
- Emit hardcoded thinking events for Portal testing
- Full alignment with Kevin's plan
- Ready for AWS App Runner staging"

git push origin staging
```

### **3. Wait for App Runner Deployment**

App Runner will automatically:
1. Pull latest code from GitHub
2. Run `npm ci`
3. Run `npm run build` (compiles TypeScript)
4. Run `npm start` (starts `node dist/index.js`)
5. Deploy to staging URL

**Expected Time:** 3-5 minutes

### **4. Run Migration**

Use AWS Systems Manager Session Manager or RDS Query Editor to run the migration SQL.

### **5. Test Endpoints**

**Health Check:**
```bash
curl https://gzejipnqbh.eu-west-1.awsapprunner.com/research/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "module": "research",
  "version": "1.0.0",
  "phase": 1,
  "dependencies": {
    "database": true,
    "research_table": true,
    "apim": true,
    "openai": true
  }
}
```

---

## Testing from Portal (Staging)

**Portal Staging:** https://staging.d2umjimd2ilqq7.amplifyapp.com

1. Login to Portal staging
2. Navigate to `/chat`
3. Select "Research" mode
4. Enter query: "Test research system"
5. Click Send

**Expected Behavior:**
- Portal calls `POST /research/start`
- API returns `{ run_id: "run_...", status: "planning" }`
- Portal opens SSE connection to `GET /research/stream/{id}`
- Thinking events appear in real-time:
  - "Starting research analysis..."
  - "Analyzing query..."
  - Tool call events
  - Section completed events
  - Final report

**You should see:** Thinking display with animated events, followed by final report.

---

## Rollback Plan

If something breaks:

```bash
# Revert the commit
git revert HEAD

# Or force push previous version
git reset --hard HEAD~1
git push --force origin staging

# Drop tables if needed (CAREFUL!)
DROP TABLE IF EXISTS o1_research_activities CASCADE;
DROP TABLE IF EXISTS o1_research_runs CASCADE;
```

---

## Phase 2 Preview

**After Phase 1 is verified working in staging:**

- Replace hardcoded events with real APIM calls
- Process uploaded files (retrieve content by uploadId)
- Generate dynamic reports based on APIM analysis
- Emit real thinking events from APIM responses

**No new environment variables needed!**

---

## Checklist

- [x] TypeScript compiles successfully
- [x] No linter errors
- [x] Uses existing environment variables
- [x] Uses existing auth middleware
- [x] Migration file created
- [x] Documentation written
- [ ] Migration run in staging DB
- [ ] Pushed to GitHub staging branch
- [ ] App Runner deployment successful
- [ ] Health check passes
- [ ] Portal test successful

---

**Status:** Ready to push to GitHub ✅

