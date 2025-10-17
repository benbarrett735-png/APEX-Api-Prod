# Complete Migration Plan - Final Status & Next Steps

**Project:** Nomad APEX Infrastructure Simplification  
**Author:** Per Kevin's Plan  
**Last Updated:** 2025-10-16 18:30  
**Current Status:** Step 5 COMPLETE ✅ - Ready for Production

---

## Executive Summary

**Goal:** Move from complex Elastic Beanstalk monorepo to simple Amplify + App Runner setup

**Progress:** 60% Complete (5 of 9 steps done)  
**Time Spent:** 19 hours  
**Time Remaining:** 7-11 hours  
**Expected Completion:** 1-2 days

---

## What's Been Accomplished ✅

### Infrastructure Migration
- ✅ Separated monorepo into 3 clean repositories
- ✅ Portal deployed to Amplify (staging)
- ✅ API deployed to App Runner (staging)
- ✅ Auto-deploy configured (git push = deploy)
- ✅ All features working in staging

### Features Verified Working
- ✅ Authentication (Cognito + JWT/JWKS)
- ✅ Normal chat (APIM + OpenAI)
- ✅ Document analysis (Azure Document Intelligence)
- ✅ Agent modes (reports, research, charts)
- ✅ Database connected (RDS PostgreSQL)
- ✅ CORS locked down
- ✅ Health checks passing

### Cost Savings Achieved
- **Current (old EB):** $51/month
- **New (Amplify + App Runner):** $24/month
- **Monthly Savings:** $27/month
- **Annual Savings:** $324/year

---

## The Complete 9-Step Plan

### ✅ COMPLETED STEPS (Steps 1-5)

#### ✅ Step 1: Repository Setup (1 hour)
**What We Did:**
- Created `APEX-Portal-Prod` repository
- Created `APEX-Api-Prod` repository
- Set up `staging` and `main` branches
- Imported legacy code from monorepo
- Created `.context/` folders with plan documentation

**Outcome:** Clean separation, no monorepo complexity

---

#### ✅ Step 2: Portal to Amplify Staging (2 hours)
**What We Did:**
- Removed monorepo workspace dependencies
- Deployed portal to Amplify Gen 2 (`staging` branch)
- Connected custom domain: `staging.nomadapex.com`
- Configured Cognito authentication
- Set up environment variables
- Verified auto-deploy on git push

**Outcome:** 
- Portal live at https://staging.nomadapex.com
- Auto-deploys in 3-4 minutes
- Login working

---

#### ✅ Step 3: API Standalone Repo (6 hours)
**What We Did:**
- Extracted API from monorepo
- Removed `@nomadapex/*` workspace dependencies
- Created local `src/config/index.ts` for configuration
- Added JWKS-based JWT authentication
- Implemented strict CORS
- Created multi-stage Dockerfile
- Added `/health` and `/secure/ping` endpoints
- Restored all business logic (chat, ADI, agentic flow)
- Fixed TypeScript compilation errors
- Created guardrails to prevent code deletion

**Outcome:**
- API builds locally
- All features compile
- Dockerfile ready for App Runner

---

#### ✅ Step 4: API to App Runner Staging (4 hours)
**What We Did:**
- Created App Runner service `apex-api-staging`
- Connected to GitHub `staging` branch
- Configured auto-deploy
- Added 31 environment variables
- Connected custom domain: `staging.api.nomadapex.com`
- Verified health checks
- Tested authentication endpoint

**Outcome:**
- API live at https://staging.api.nomadapex.com
- Auto-deploys in 3-5 minutes
- Health checks passing

---

#### ✅ Step 5: E2E Staging Testing (5 hours)
**What We Did:**
- Tested normal chat - ✅ Working
- Tested ADI document upload - ✅ Working
- Tested agent modes - ✅ Working
- Fixed database connection (RDS security group)
- Fixed TypeScript build errors (chartService)
- Fixed auth middleware issue
- Fixed ADI config path handling
- Verified all 31 environment variables
- Connected to RDS database
- Tested file uploads up to 10mb

**Issues Resolved:**
1. TypeScript type errors in chartService
2. Auth middleware breaking routes
3. Database connection timeout (ETIMEDOUT)
4. ADI path parameter replacement

**Outcome:**
- All features working in staging
- Database connected
- No CORS errors
- No auth errors
- Ready for production

---

### ⏸️ REMAINING STEPS (Steps 6-9)

#### ⏸️ Step 6: Portal to Production (1-2 hours)
**What We'll Do:**
1. Merge `staging` → `main` in APEX-Portal-Prod
2. Amplify auto-deploys `main` branch
3. Configure custom domain: `app.nomadapex.com`
4. Update environment variables (if different from staging)
5. Test login and navigation
6. Verify production Cognito pool

**Prerequisites:**
- ✅ Staging portal fully tested
- ✅ All features working
- ⏸️ Production secrets ready (Cognito, etc.)
- ⏸️ Domain DNS ready

**Commands:**
```bash
cd ~/APEX-Portal-Prod
git checkout main
git merge staging
git push origin main

# Amplify auto-deploys (~3-4 min)
# Then configure app.nomadapex.com in Amplify console
```

**Outcome:**
- Production portal live at `app.nomadapex.com`
- Users can access production site
- Auto-deploys on push to `main`

---

#### ⏸️ Step 7: API to Production (2-3 hours)
**What We'll Do:**

**7.1: Security Lockdown FIRST**
1. Configure App Runner Custom VPC
   - AWS Console → App Runner → apex-api-staging
   - Configuration → Networking → Edit
   - Enable Custom VPC
   - Select same VPC as RDS
   - Select private subnets
   - Create/select security group
   
2. Update RDS Security Group
   - Remove `0.0.0.0/0` rule
   - Add App Runner security group only
   - Keep Kevin's IP
   - Keep your IP

**7.2: Create Production API Service**
1. Create App Runner service `apex-api-prod`
2. Connect to GitHub `main` branch
3. Copy all 31 environment variables from staging
4. Update with production values:
   - `CORS_ORIGIN=https://app.nomadapex.com`
   - `NODE_ENV=production`
   - Production OpenAI key (if different)
   - Production APIM keys (if different)
   - Same `DATABASE_URL` (shared RDS)

**7.3: Configure Domain**
1. Custom domain: `api.nomadapex.com`
2. Verify health checks
3. Test `/secure/ping` with production token

**7.4: E2E Production Testing**
1. Test from production portal
2. Verify all features work
3. Check CloudWatch logs
4. Monitor error rates

**Prerequisites:**
- ✅ Staging API fully tested
- ✅ Production portal deployed
- ⏸️ Production secrets in Secrets Manager
- ⏸️ VPC configuration planned

**Outcome:**
- Production API live at `api.nomadapex.com`
- Secure VPC configuration
- All features working in production

---

#### ⏸️ Step 8: DNS Cutover & Go Live (1-2 hours)
**What We'll Do:**

**8.1: Update DNS Records**
```
Route 53 → Hosted zones → nomadapex.com

Update/Create records:
- app.nomadapex.com → Amplify production (CNAME)
- api.nomadapex.com → App Runner production (CNAME)
```

**8.2: Verification Checklist**
- [ ] HTTPS working on both domains
- [ ] Health checks passing
- [ ] Login works
- [ ] Normal chat works
- [ ] ADI upload works
- [ ] Agent modes work
- [ ] No CORS errors
- [ ] No 404s or 500s

**8.3: Monitoring**
- Check CloudWatch logs (first 30 min)
- Monitor error rates
- Test full user journey
- Keep old EB running as backup (24 hours)

**8.4: User Communication**
- Notify users of upgrade (if needed)
- Monitor support channels
- Be ready to rollback if issues

**Prerequisites:**
- ✅ Production portal working
- ✅ Production API working
- ✅ All E2E tests passing

**Rollback Plan:**
- Keep old EB environments running for 24 hours
- Can switch DNS back if critical issues
- Database unchanged (shared resource)

**Outcome:**
- Users access production at `app.nomadapex.com`
- All traffic on new infrastructure
- Old EB idle as backup

---

#### ⏸️ Step 9: Cleanup & Monitoring (3-4 hours)
**What We'll Do:**

**9.1: Decommission Old Infrastructure** (After 24h stable)
```
Elastic Beanstalk:
- Terminate portal environment
- Terminate API environment
- Delete EB applications
- Remove EB-specific IAM roles

CloudFront:
- Delete manual distributions (if not needed)
- Keep Amplify-managed distributions

Lambda:
- Keep: apex-cognito-post-signup
- Delete: All CDK-generated functions
  - apexlive-stack-event-event-watcher
  - apexlive-dev-devapexlivec-LogRetentionaae0aa3c5b4d
  - apexlive-global-CustomS3AutoDeleteObjectsCustomRes
  - (etc. - all the legacy CDK artifacts)

S3:
- Delete EB deployment buckets
- Keep user data buckets
- Keep Azure blob storage

IAM:
- Remove EB-specific roles
- Keep Cognito roles
- Keep App Runner roles
```

**9.2: Setup Monitoring**
```
CloudWatch Dashboards:
- API response times
- Error rates (4xx, 5xx)
- Request counts
- Database connections

CloudWatch Alarms:
- API 5xx errors > 10 in 5 min
- API response time > 5s
- App Runner deployment failures
- Database connection failures

SNS Topics:
- Email alerts for critical errors
- Slack integration (optional)
```

**9.3: Documentation**
```
Update:
- Architecture diagrams
- Deployment runbooks
- Troubleshooting guides
- Environment variable documentation
- Onboarding docs for new developers

Create:
- Incident response plan
- Rollback procedures
- Monitoring runbook
```

**9.4: Security Review**
```
Checklist:
- [ ] RDS security group locked down
- [ ] No 0.0.0.0/0 rules in production
- [ ] App Runner in VPC
- [ ] Secrets in Secrets Manager (not env vars)
- [ ] CORS locked to production domain
- [ ] HTTPS enforced everywhere
- [ ] JWT validation working
- [ ] Rate limiting considered
```

**Prerequisites:**
- ✅ Production stable for 24+ hours
- ✅ No critical issues
- ✅ User feedback positive

**Outcome:**
- Clean AWS account (no unused resources)
- Monitoring in place
- Cost savings visible
- Documentation updated
- Team trained

---

## Repository Structure (Final State)

```
GitHub Organization: benbarrett735-png
├── APEX-Landing (Separate - Marketing)
│   └── Amplify → nomadapex.com
│
├── APEX-Portal-Prod (Frontend)
│   ├── staging branch → staging.nomadapex.com
│   └── main branch → app.nomadapex.com
│
└── APEX-Api-Prod (Backend)
    ├── staging branch → staging.api.nomadapex.com
    └── main branch → api.nomadapex.com
```

---

## Environment Variables Summary

### Portal (Amplify)
```
NEXTAUTH_URL=https://app.nomadapex.com
NEXTAUTH_SECRET=***
NEXT_PUBLIC_API_URL=https://api.nomadapex.com
COGNITO_CLIENT_ID=***
COGNITO_CLIENT_SECRET=***
COGNITO_ISSUER=https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_JiQF0xM04
```

### API (App Runner) - 31 Variables
```
# Core
NODE_ENV=production
PORT=3000

# Auth
OIDC_AUTHORITY=https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_JiQF0xM04
OIDC_CLIENT_ID=***
OIDC_CLIENT_SECRET=***
CORS_ORIGIN=https://app.nomadapex.com

# Database
DATABASE_URL=postgresql://apex_admin:***@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex
PGSSL=1

# APIM
APIM_HOST=https://nomad-apex.azure-api.net
APIM_SUBSCRIPTION_KEY=***
APIM_OPERATION=/chat/strong

# OpenAI
OPENAI_API_KEY=***

# ADI (9 variables)
ADI_ANALYZE_PATH=/di/analyze/:modelId
ADI_API_VERSION=2024-07-31-preview
ADI_STRING_INDEX_TYPE=utf16CodeUnit
ADI_MODEL_ID_DEFAULT=prebuilt-read
ADI_MODEL_ID_LAYOUT=prebuilt-layout
ADI_MODEL_ID_INVOICE=prebuilt-invoice
ADI_MODEL_ID_RECEIPT=prebuilt-receipt
ADI_RESULT_PATH=/di/results/:modelId/:resultId
ADI_BASE=/di

# Azure Storage (4 variables)
STORAGE_ACCOUNT=documentsdocintel
STORAGE_ACCOUNT_KEY=***
STORAGE_CONTAINER=docs-in
SAS_EXPIRY_HOURS=2

# Other
OUTPUT_DIR=/tmp
OVERWRITE_BLOB=true
RESULTS_POLL_INTERVAL=1
```

---

## Infrastructure Costs

### Current (Old Elastic Beanstalk)
```
Elastic Beanstalk (API):
├── EC2 t3.small (24/7)      $17/mo
├── EBS Volume (10GB)         $1/mo
└── Data Transfer             $5/mo
Subtotal:                    $23/mo

Elastic Beanstalk (Portal):
├── EC2 t3.small (24/7)      $17/mo
├── EBS Volume (10GB)         $1/mo
└── Data Transfer             $5/mo
Subtotal:                    $23/mo

CloudFront (Manual):          $5/mo

TOTAL:                       $51/mo
```

### New (Amplify + App Runner)
```
Amplify (Landing):
├── Build minutes (free tier) $0/mo
└── Hosting (free tier)       $0/mo
Subtotal:                     $0/mo

Amplify (Portal):
├── Build minutes             $1/mo
└── Hosting                   $1/mo
Subtotal:                     $2/mo

App Runner (API):
├── Compute (0.25vCPU,512MB) $12/mo
├── Requests (1M)             $2/mo
└── Data Transfer             $3/mo
Subtotal:                    $17/mo

CloudFront (Amplify-managed): $5/mo

TOTAL:                       $24/mo

SAVINGS:                     $27/mo ($324/year)
```

### Shared Resources (Unchanged)
```
RDS PostgreSQL:              ~$20-30/mo
Cognito (free tier):          $0/mo
Azure Services:              (Kevin's existing costs)
```

---

## Timeline & Estimates

### Time Breakdown
```
✅ Step 1: Repo Setup              1h    DONE
✅ Step 2: Portal Staging          2h    DONE
✅ Step 3: API Standalone          6h    DONE
✅ Step 4: API Staging             4h    DONE
✅ Step 5: E2E Testing             5h    DONE
⏸️ Step 6: Portal Production      1-2h   NEXT (1-2 hours)
⏸️ Step 7: API Production         2-3h   (2-3 hours)
⏸️ Step 8: DNS Cutover            1-2h   (1-2 hours)
⏸️ Step 9: Cleanup                3-4h   (3-4 hours)

TOTAL:                         19-28h
COMPLETED:                        18h
REMAINING:                      7-11h
```

### Calendar Estimate
```
Today (2025-10-16):
✅ Steps 1-5 complete (18 hours over 2 days)

Tomorrow (2025-10-17):
- Step 6: Portal Production (1-2h)
- Step 7: API Production (2-3h)
- Step 8: DNS Cutover (1-2h)
TOTAL: 4-7 hours

Day After (2025-10-18):
- Step 9: Cleanup & Monitoring (3-4h)
- Buffer for issues (2h)
TOTAL: 5-6 hours

COMPLETION DATE: 2025-10-18 (in 2 days)
```

---

## Risk Assessment

### Low Risk ✅
- Portal migration (proven in staging)
- API containerization (tested)
- Authentication (verified working)
- Database connection (tested)
- CORS (locked down)

### Medium Risk ⚠️
- DNS cutover (mitigated: keep EB as backup)
- Production secrets (need to verify different from staging)
- User impact (mitigated: off-hours deployment)

### Mitigation Strategies
1. **Keep old EB running 24 hours** after cutover
2. **Test production thoroughly** before DNS switch
3. **Deploy during low-traffic hours**
4. **Have rollback plan ready**
5. **Monitor closely first 24 hours**

---

## Success Criteria

### Technical
- [x] All features work in staging
- [ ] All features work in production
- [ ] Auto-deploy configured (both repos)
- [ ] Health checks passing
- [ ] Authentication working
- [ ] Database connected
- [ ] No CORS errors
- [ ] HTTPS working
- [ ] Monitoring in place

### Business
- [ ] Cost savings realized ($27/mo)
- [ ] Deployment time reduced (15min → 5min)
- [ ] Zero manual deployment steps
- [ ] Easier developer onboarding
- [ ] Better security (VPC, locked-down access)

### User Experience
- [ ] No downtime during migration
- [ ] All features continue working
- [ ] Performance same or better
- [ ] No user-facing errors

---

## Next Immediate Actions

### Step 6: Portal Production (Start Now)

**Action 1: Merge to Main**
```bash
cd ~/APEX-Portal-Prod
git checkout main
git pull origin main
git merge staging
git push origin main
```

**Action 2: Configure Amplify**
```
AWS Console → Amplify → APEX-Portal-Prod
→ Domain management
→ Add domain: app.nomadapex.com
→ Wait for SSL certificate (~15 min)
```

**Action 3: Test Production Portal**
```
Visit: https://app.nomadapex.com
Test: Login
Test: Navigation
Test: Basic functionality
```

**Time:** 1-2 hours  
**Risk:** Low  
**Rollback:** Revert git merge if needed

---

## Questions to Answer Before Production

1. **Secrets:** Are production API keys different from staging?
2. **Database:** Use same RDS or separate production database?
3. **Cognito:** Separate production user pool or shared?
4. **Timing:** Deploy during business hours or off-hours?
5. **Users:** Notify existing users of upgrade?

---

## Contact & Support

**Repository Links:**
- Portal: https://github.com/benbarrett735-png/APEX-Portal-Prod
- API: https://github.com/benbarrett735-png/APEX-Api-Prod

**AWS Resources:**
- Amplify: APEX-Portal-Prod
- App Runner: apex-api-staging, apex-api-prod (soon)
- RDS: nomad-apex-db
- Cognito: eu-west-1_JiQF0xM04

**Documentation:**
- Kevin's Plan: `.context/INFRASTRUCTURE_SIMPLIFICATION.md`
- Repo Guide: `.context/REPO_SEPARATION_GUIDE.md`
- Step 5 Complete: `docs/STEP_5_COMPLETE.md`

---

## Summary

**Current Status:** Step 5 Complete ✅  
**Next Step:** Step 6 - Portal Production Deploy  
**Time to Completion:** 7-11 hours (1-2 days)  
**Confidence Level:** HIGH  

**All staging features verified working. Ready for production deployment.**

---

**Last Updated:** 2025-10-16 18:30  
**Status:** Ready to proceed to Step 6

