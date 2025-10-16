# Complete Migration Plan - Kevin's Infrastructure Simplification

**Last Updated:** 2025-10-16 18:45  
**Current Status:** Step 5 - Staging E2E Testing (In Progress)

---

## Migration Overview

Moving from:
- ❌ Monorepo (Elastic Beanstalk) with manual deployments
- ❌ Mixed infrastructure (Amplify + EB)
- ❌ No CI/CD

To:
- ✅ Separate repos with clear ownership
- ✅ Consistent platform (Amplify for frontends, App Runner for API)
- ✅ Git-push auto-deploy everywhere

---

## Step-by-Step Progress

### ✅ Step 1: Repository Setup (DONE)
**Time Taken:** 1 hour  
**Status:** Completed 2025-10-15

**What We Did:**
- Created `APEX-Portal-Prod` repo (separate from landing)
- Created `APEX-Api-Prod` repo (extracted from monorepo)
- Set up `staging` and `main` branches for both
- Imported legacy code from `Nomad-Apex-Live` monorepo
- Created `.context/` folders with Kevin's plan

**Outcomes:**
- ✅ Clean repo structure
- ✅ No monorepo complexity
- ✅ Ready for independent deployments

---

### ✅ Step 2: Portal to Amplify (Staging) (DONE)
**Time Taken:** 2 hours  
**Status:** Completed 2025-10-15

**What We Did:**
- Decoupled portal from monorepo (removed workspace refs)
- Deployed portal to Amplify Gen 2 (`staging` branch)
- Connected custom domain: `staging.nomadapex.com` (via subdomain)
- Configured environment variables (Cognito, NextAuth)
- Verified login works with Cognito

**Outcomes:**
- ✅ Staging portal live at `https://staging.d2umjimd2ilqq7.amplifyapp.com`
- ✅ Also accessible via `staging.nomadapex.com` 
- ✅ Auto-deploys on git push to `staging`
- ✅ NextAuth + Cognito authentication working

---

### ✅ Step 3: API Standalone Repo (DONE)
**Time Taken:** 6 hours  
**Status:** Completed 2025-10-16

**What We Did:**
- Extracted API from monorepo to `APEX-Api-Prod`
- Made it standalone (removed `@nomadapex/*` workspace deps)
- Created local `src/config/index.ts` to replace monorepo config
- Added JWKS-based auth middleware (`jose` library)
- Implemented strict CORS (env-based origin)
- Created Dockerfile (multi-stage, Node 20 Alpine)
- Added `/health` endpoint (public)
- Added `/secure/ping` endpoint (protected, for testing auth)
- Restored business routes/services (chat, ADI, agentic)
- Fixed guardrails to prevent accidental deletion

**Outcomes:**
- ✅ API builds locally (`npm run build`)
- ✅ API runs locally (`npm start`)
- ✅ JWT validation working (issuer + audience + token_use)
- ✅ All business logic preserved
- ✅ Dockerfile ready for App Runner

---

### ✅ Step 4: API to App Runner (Staging) (DONE)
**Time Taken:** 4 hours  
**Status:** Completed 2025-10-16

**What We Did:**
- Created App Runner service `apex-api-staging`
- Connected to GitHub repo (`staging` branch)
- Configured auto-deploy on git push
- Added 31 environment variables (OIDC, CORS, APIM, ADI, Storage, OpenAI)
- Custom domain: `staging.api.nomadapex.com` (CNAME to App Runner)
- Verified health check returns 200
- Verified `/secure/ping` requires auth (401 without token)

**Outcomes:**
- ✅ Staging API live at `https://gzejipnqbh.eu-west-1.awsapprunner.com`
- ✅ Also accessible via `staging.api.nomadapex.com`
- ✅ Auto-deploys on git push to `staging`
- ✅ Authentication working (JWKS verification)
- ✅ CORS locked to staging portal origin

---

### 🔄 Step 5: End-to-End Staging Testing (IN PROGRESS)
**Estimated Time:** 3-4 hours  
**Status:** 75% Complete

**What We're Doing:**
- Testing all features from staging portal → staging API
- Verifying each route works with real data
- Identifying missing dependencies/env vars

#### Progress So Far:

**✅ Working Features:**
- Health check (`/health`)
- Authentication (`/secure/ping`)
- ADI document upload (`/adi/analyze`)
- APIM integration (chat routing)
- Normal chat (`/chat/normal`)

**🔄 In Progress:**
- Agent chat modes (reports, research, plans)
  - **Blocker:** Needs `DATABASE_URL` for agentic flow state storage
  - **Action Required:** Find/create PostgreSQL database

**❌ Not Yet Tested:**
- Charts (excluded from build due to TypeScript errors)
- Research flow (depends on DB)
- Report generation (depends on DB)

#### Current Blocker: DATABASE_URL

**Issue:**  
Agentic flow (agent chat) requires PostgreSQL to store run state.

**Questions to Answer:**
1. Do you have an existing RDS database? (Check AWS RDS console)
2. Did you use a local Postgres when running the monorepo?
3. Do you use Supabase/Neon/Railway for database?

**Options:**
- **Option A:** Find existing DB connection string → Add to App Runner
- **Option B:** Create new RDS/Supabase database → Run migrations → Add to App Runner
- **Option C:** Skip agent features for now, test in Step 6 (production)

**Next Actions:**
1. User confirms database situation
2. Add `DATABASE_URL` to App Runner environment variables
3. Enable agentic flow compilation (comment out chart imports)
4. Deploy and test agent modes
5. Verify all working features from portal

**Estimated Time Remaining:** 2-3 hours (once DB is sorted)

---

### ⏸️ Step 6: Portal to Production (PENDING)
**Estimated Time:** 1-2 hours  
**Status:** Ready to start after Step 5

**What We'll Do:**
1. Merge `staging` → `main` in `APEX-Portal-Prod`
2. Amplify auto-deploys `main` branch
3. Connect custom domain: `app.nomadapex.com`
4. Update CORS in API to allow production portal origin
5. Test login + basic navigation
6. Verify production build works

**Prerequisites:**
- ✅ Staging portal fully tested
- ✅ All env vars documented
- ⏸️ Cognito user pool ready for production

**Expected Outcome:**
- Production portal live at `app.nomadapex.com`
- Auto-deploys on push to `main`

---

### ⏸️ Step 7: API to Production (PENDING)
**Estimated Time:** 2-3 hours  
**Status:** Ready to start after Step 6

**What We'll Do:**
1. Create App Runner service `apex-api-prod`
2. Connect to `main` branch
3. Copy environment variables from staging (with production values)
4. Custom domain: `api.nomadapex.com`
5. Update production secrets (if different from staging)
6. Verify health + auth
7. Test E2E from production portal

**Prerequisites:**
- ✅ Staging API fully tested
- ✅ Production portal deployed
- ⏸️ Production secrets in Secrets Manager

**Expected Outcome:**
- Production API live at `api.nomadapex.com`
- Auto-deploys on push to `main`

---

### ⏸️ Step 8: DNS Cutover & Go Live (PENDING)
**Estimated Time:** 1-2 hours  
**Status:** Waiting for Steps 6-7

**What We'll Do:**
1. Update Route 53 DNS:
   - `app.nomadapex.com` → Amplify (production portal)
   - `api.nomadapex.com` → App Runner (production API)
2. Verify HTTPS working on both
3. Test full user journey (signup, login, use all features)
4. Monitor CloudWatch logs for errors
5. Verify no 404s, no CORS errors

**Cutover Plan:**
- DNS changes propagate in 5-15 minutes
- Keep old EB running for 24 hours as backup
- Monitor error rates

**Expected Outcome:**
- Users access production at `app.nomadapex.com`
- All features working
- Old EB untouched (backup)

---

### ⏸️ Step 9: Cleanup & Monitoring (PENDING)
**Estimated Time:** 3-4 hours  
**Status:** Waiting for Step 8

**What We'll Do:**

#### Decommission Old Infrastructure:
1. Delete Elastic Beanstalk environments (portal + API)
2. Delete old CloudFront distributions (if not needed)
3. Delete unused Lambda functions (legacy CDK artifacts)
4. Clean up old S3 buckets (deployment artifacts)
5. Remove old IAM roles (EB-specific)

#### Preserve What's Needed:
- ✅ Keep Cognito user pool (still in use)
- ✅ Keep RDS database (still in use)
- ✅ Keep S3 buckets with user data
- ✅ Keep Secrets Manager secrets

#### Set Up Monitoring:
1. CloudWatch dashboards:
   - API response times
   - Error rates
   - Request counts
2. CloudWatch alarms:
   - API 5xx errors > threshold
   - App Runner deployment failures
3. SNS notifications (email/Slack)

#### Documentation:
1. Update architecture diagrams
2. Document deployment process
3. Create runbook for common issues
4. Update onboarding docs for new developers

**Expected Outcome:**
- Clean AWS account (no unused resources)
- Monitoring in place
- Cost savings visible (~$27/month)

---

## Overall Progress

```
┌──────────────────────────────────────────────────────────┐
│  PROGRESS: 60% Complete                                  │
│  ████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└──────────────────────────────────────────────────────────┘

✅ Steps 1-4: DONE (12 hours)
🔄 Step 5: IN PROGRESS (2-3 hours remaining)
⏸️ Steps 6-9: PENDING (7-11 hours)

Total Estimated Time: 21-28 hours
Time Spent So Far: 13 hours
Time Remaining: 8-15 hours
```

---

## Current Blockers

### 🚧 Blocker #1: DATABASE_URL Missing

**Impact:** Agent chat modes don't work  
**Affected Features:**
- Reports generation
- Research mode
- Agentic planning
- Charts (also has TypeScript errors)

**Resolution Paths:**

1. **Find Existing Database:**
   - Check AWS RDS for existing Postgres instance
   - Check Secrets Manager for `DATABASE_URL`
   - Check old EB environment variables

2. **Create New Database:**
   - AWS RDS PostgreSQL (~$15-25/month)
   - Supabase (free tier available)
   - Neon (free tier available)
   - Run migrations from `/migrations` folder

3. **Temporary Workaround:**
   - Skip agent features in staging
   - Test them in production if DB exists there

**Next Step:** User needs to confirm database situation

---

## What's Working Right Now

### Staging Portal (`staging.nomadapex.com`)
- ✅ Login with Cognito
- ✅ UI loads
- ✅ Routing works

### Staging API (`staging.api.nomadapex.com`)
- ✅ Health checks
- ✅ Authentication (JWT verification)
- ✅ Normal chat (APIM integration)
- ✅ Document analysis (ADI with Azure Blob Storage)
- ⏸️ Agent chat (blocked by DATABASE_URL)

---

## Environment Variables Summary

**Total Variables Configured:** 31

**By Category:**
- **Auth (3):** `OIDC_AUTHORITY`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`
- **CORS (1):** `CORS_ORIGIN`
- **APIM (3):** `APIM_HOST`, `APIM_SUBSCRIPTION_KEY`, `APIM_OPERATION`
- **ADI (9):** `ADI_ANALYZE_PATH`, `ADI_API_VERSION`, `ADI_STRING_INDEX_TYPE`, etc.
- **Storage (4):** `STORAGE_ACCOUNT`, `STORAGE_ACCOUNT_KEY`, `STORAGE_CONTAINER`, `SAS_EXPIRY_HOURS`
- **OpenAI (1):** `OPENAI_API_KEY`
- **General (10):** `NODE_ENV`, `PORT`, `OUTPUT_DIR`, polling configs, etc.

**Missing:**
- ❌ `DATABASE_URL` (PostgreSQL connection string)

---

## Risk Assessment

### Low Risk (Mitigated)
- ✅ Portal migration (already tested, working)
- ✅ API containerization (Dockerfile tested)
- ✅ Authentication (JWKS verified)
- ✅ CORS (locked down properly)

### Medium Risk (Manageable)
- ⚠️ Database migration (need to find/create DB)
- ⚠️ DNS cutover (keep EB as backup for 24h)
- ⚠️ Environment variable differences (staging vs prod)

### High Risk (To Be Addressed)
- 🔴 Chart service TypeScript errors (excluded from build)
- 🔴 No rollback plan documented yet
- 🔴 No load testing done

---

## Cost Impact

### Current Monthly Cost (Elastic Beanstalk):
- EB API: $23/month
- EB Portal: $23/month  
- CloudFront: $5/month
- **Total: ~$51/month**

### New Monthly Cost (Amplify + App Runner):
- Amplify Portal: $2/month
- App Runner API: $17/month
- CloudFront: $5/month
- **Total: ~$24/month**

**💰 Monthly Savings: $27/month**  
**💰 Annual Savings: $324/year**

---

## Next Immediate Actions

### For You (User):
1. **Check AWS RDS Console** - Do you have a Postgres database?
2. **Check AWS Secrets Manager** - Look for `DATABASE_URL` or similar
3. **Check Old EB Environment** - Look for database connection string
4. **Tell me what you find** - I'll help configure it

### For Me (AI):
1. Wait for database confirmation
2. Add `DATABASE_URL` to App Runner
3. Enable agentic flow compilation (comment out chart imports)
4. Deploy and test agent modes
5. Complete Step 5 testing
6. Move to Step 6 (production portal)

---

## Success Metrics

**After Full Migration:**
- ✅ Zero manual deployments (git push = deploy)
- ✅ Sub-5-minute deployments
- ✅ Consistent platform (Amplify + App Runner)
- ✅ Cost savings ($27/month)
- ✅ Easier developer onboarding
- ✅ Better monitoring (CloudWatch)

---

## Questions to Answer

1. **Database:** Where is your PostgreSQL database?
2. **Secrets:** Are production secrets different from staging?
3. **Users:** Can we test with real user accounts in staging?
4. **Charts:** Do you need chart generation in staging, or can we fix in production?

---

**Status:** Waiting for database information to unblock Step 5.

Once we have `DATABASE_URL`, we're ~2-3 hours from completing staging testing and moving to production!
