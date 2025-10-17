# Step 5 Completion Guide - Staging E2E Testing

**Deploy Status:** Pushed to staging - deploying now (~3-5 min)  
**Commit:** `d225008`

---

## What Will Happen (Deployment Timeline)

### ⏱️ Next 3-5 Minutes
App Runner builds and deploys the new code.

### ✅ After Deployment
Test all features to complete Step 5.

---

## Testing Checklist (In Order)

### 1. Test What Was Already Working (2 min)

**A) Normal Chat**
- Go to portal → Chat mode
- Send message: "Hello"
- ✅ Should get streaming response

**B) ADI Document Upload**
- Upload a PDF
- ✅ Should analyze and return results

**Result:** If these work → Code deployment successful ✅

---

### 2. Test Agent Modes (New Feature)

**A) Try Reports Mode**
- Portal → Switch to Reports agent
- Set goal: "Create a sales summary"
- Click generate

**Expected Outcomes:**

**✅ SUCCESS:**
```
Agent starts processing
Run ID created
Streaming updates appear
Report generates
```

**❌ FAIL - Missing Tables:**
```
Error: relation "agentic_runs" does not exist
```
**Fix:** Run migrations (see below) → Takes 10 minutes

**❌ FAIL - Network:**
```
Error: ECONNREFUSED or ETIMEDOUT
```
**Fix:** Configure App Runner VPC (see below) → Takes 5 minutes

---

## If Agent Fails: Database Tables Missing

### Check if Tables Exist

```bash
# Connect to your RDS database
psql "postgresql://apex_admin:w1g(j6BF1ZFIit]!)kYv]Zyk2Zdp@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex"

# Check for agentic tables
\dt agentic*

# Expected output:
#  agentic_runs
#  agentic_steps
#  agentic_events
```

### If Tables Don't Exist - Run Migrations

```bash
# Still in psql connection:
\i /path/to/APEX-Api-Prod/migrations/016_agentic_flow.sql
\i /path/to/APEX-Api-Prod/migrations/020_agentic_flow.sql
\i /path/to/APEX-Api-Prod/migrations/022_add_mode_to_agentic_runs.sql

# Verify tables created:
\dt agentic*
```

**Alternative - From Local Machine:**

```bash
cd ~/APEX-Api-Prod/migrations

# Run each migration
psql "postgresql://apex_admin:PASSWORD@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex" \
  -f 016_agentic_flow.sql

psql "postgresql://apex_admin:PASSWORD@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex" \
  -f 020_agentic_flow.sql

psql "postgresql://apex_admin:PASSWORD@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex" \
  -f 022_add_mode_to_agentic_runs.sql
```

**After Migrations:** Test agent mode again → Should work ✅

---

## If Agent Fails: Network Connection

### Symptom
Logs show: `ECONNREFUSED` or `ETIMEDOUT`

### Fix: Configure App Runner Custom VPC

**Steps:**

1. **Find RDS VPC:**
   - AWS Console → RDS → Databases
   - Click your database
   - Note the VPC ID and subnets

2. **Configure App Runner VPC:**
   - App Runner → apex-api-staging
   - Configuration → Networking
   - Click "Edit"
   - Enable "Custom VPC"
   - Select:
     - **VPC:** Same as RDS
     - **Subnets:** Same as RDS (or private subnets)
     - **Security Group:** Create new or use one that allows port 5432
   - Save

3. **Wait for Redeploy:** ~5 minutes

4. **Test Again:** Agent should connect ✅

---

## Step 5 Complete When:

✅ **All Features Tested and Working:**
- [ ] Portal loads and login works
- [ ] Normal chat works (streaming)
- [ ] ADI document upload works
- [ ] Agent mode (Reports) works
- [ ] Agent mode (Research) works
- [ ] No CORS errors
- [ ] No authentication errors
- [ ] Database connected

---

## After Step 5 Complete

### ✅ Move to Step 6: Production Portal Deploy

**What We'll Do:**
1. Merge `staging` → `main` in Portal repo
2. Amplify auto-deploys production
3. Connect `app.nomadapex.com` domain
4. Test production portal

**Time:** 1-2 hours

---

## Quick Reference: What's Different

**Before (Commit 7bb4916):**
- ✅ Chat working
- ✅ ADI working
- ❌ No agent modes

**Now (Commit d225008):**
- ✅ Chat still working
- ✅ ADI still working
- 🆕 Agent modes enabled
- 🆕 Database connected
- 🆕 10mb JSON limit

**Only 3 lines changed from working state.**

---

## Troubleshooting

### Issue: Portal Can't Reach API
**Check:** CORS_ORIGIN matches portal URL  
**Fix:** Should already be set to staging portal

### Issue: Auth Fails
**Check:** Portal sending Authorization header  
**Fix:** Should already work (was working before)

### Issue: ADI Stopped Working
**Check:** App Runner logs for errors  
**Fix:** Revert to commit 7bb4916 (but this shouldn't happen)

---

## Kevin's Plan Status

**Step 1:** ✅ Repos created  
**Step 2:** ✅ Portal staging deployed  
**Step 3:** ✅ API standalone  
**Step 4:** ✅ API staging deployed  
**Step 5:** 🔄 **IN PROGRESS** (testing now)  
**Step 6:** ⏸️ Portal production  
**Step 7:** ⏸️ API production  
**Step 8:** ⏸️ DNS cutover  
**Step 9:** ⏸️ Cleanup  

---

## What to Do Now

1. **Wait 3-5 minutes** for App Runner deployment
2. **Test normal chat and ADI** (should still work)
3. **Test agent mode** (reports)
4. **If DB error:** Run migrations
5. **If network error:** Configure VPC
6. **Once all working:** Report "Step 5 complete!" ✅

---

**Deployment in progress. Test in ~5 minutes!**

