# Staging E2E Test Checklist

**Date:** 2025-10-16  
**Environment:** Staging  
**Portal:** https://staging.nomadapex.com  
**API:** https://staging.api.nomadapex.com

---

## Deployment Status

**Latest Commit:** `ce276b1` - "fix(build): resolve TypeScript errors in chartService"

**What Changed:**
- ✅ Fixed TypeScript compilation errors
- ✅ Added auth middleware to all routes
- ✅ Increased JSON payload limit to 10mb
- ✅ Added DATABASE_URL connection
- ✅ Enabled all agent flows (reports, research, charts)

**Expected Deploy Time:** 3-5 minutes

---

## Tests to Run (After Deployment Completes)

### 1. Basic Health ✅
- [ ] GET `/health` returns `{"ok":true}`
- [ ] API responds without errors

### 2. Authentication ✅
- [ ] Login to portal works
- [ ] Protected routes require JWT
- [ ] Invalid token returns 401

### 3. Normal Chat ✅
- [ ] Open chat in portal
- [ ] Send message
- [ ] Verify streaming response
- [ ] Check APIM integration working

### 4. Document Analysis (ADI) ✅
- [ ] Upload a PDF document
- [ ] Verify upload to Azure Blob
- [ ] Check analysis completes
- [ ] Verify results returned

### 5. Agent Mode - Reports 🔄
- [ ] Switch to "Reports" mode
- [ ] Set goal (e.g., "Create a sales report")
- [ ] Upload file context (optional)
- [ ] Click generate
- [ ] Check run is created in database
- [ ] Verify agent starts processing
- [ ] Check streaming updates
- [ ] Verify final report generated

### 6. Agent Mode - Research 🔄
- [ ] Switch to "Research" mode
- [ ] Set research goal
- [ ] Verify agent workflow starts
- [ ] Check research steps appear
- [ ] Verify final research output

### 7. Agent Mode - Charts 🔄
- [ ] Switch to "Charts" mode
- [ ] Upload data file
- [ ] Request chart generation
- [ ] Verify chart creation
- [ ] Check chart renders

### 8. Error Handling
- [ ] Invalid requests return proper errors
- [ ] CORS blocks unauthorized origins
- [ ] Database errors handled gracefully
- [ ] OpenAI API errors handled

---

## Common Issues & Solutions

### Issue 1: Database Connection Failed

**Symptoms:**
- Agent modes fail immediately
- Logs show `ECONNREFUSED` or `ETIMEDOUT`
- Error: "relation 'agentic_runs' does not exist"

**Check:**
1. App Runner logs for DB errors
2. RDS security group allows App Runner IPs
3. Database tables exist (run migrations)

**Fix:**
- Configure App Runner Custom VPC
- Update RDS security group
- Run migrations on database

### Issue 2: Agent Modes Don't Start

**Symptoms:**
- Reports/research mode buttons don't work
- No run created
- Silent failure

**Check:**
1. Browser console for errors
2. Network tab for failed API calls
3. App Runner logs

**Fix:**
- Check DATABASE_URL is set
- Verify auth token is valid
- Check OPENAI_API_KEY is valid

### Issue 3: Charts Don't Generate

**Symptoms:**
- Chart mode fails
- Error in chart generation

**Check:**
1. App Runner logs for chartService errors
2. APIM credentials valid
3. Data format correct

**Fix:**
- Verify APIM_HOST and APIM_SUBSCRIPTION_KEY
- Check data source format

---

## Database Check

### Verify Tables Exist

If you get "relation does not exist" errors:

```sql
-- Connect to RDS and check:
\dt agentic*

-- Should show:
-- agentic_runs
-- agentic_steps
-- agentic_events
```

### Run Migrations if Needed

```bash
# From your local machine:
cd ~/APEX-Api-Prod/migrations
psql "postgresql://apex_admin:PASSWORD@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex"

# Then run:
\i 016_agentic_flow.sql
\i 020_agentic_flow.sql
\i 022_add_mode_to_agentic_runs.sql
```

---

## Success Criteria

**All features working:**
- ✅ Portal loads and login works
- ✅ Normal chat works
- ✅ Document upload/analysis works
- ✅ Agent modes (reports, research) work
- ✅ No CORS errors
- ✅ No authentication errors
- ✅ Database connected

**Once all tests pass:**
- Move to Step 6: Production Portal Deploy
- Move to Step 7: Production API Deploy
- Complete migration!

---

## Next Steps After Testing

### If All Tests Pass ✅
1. Document any issues found
2. Prepare production environment variables
3. Start Step 6 (Portal production deploy)

### If Tests Fail ❌
1. Note which feature failed
2. Check logs for errors
3. Share error with AI for debugging
4. Fix and redeploy
5. Re-test

---

**Status:** Waiting for App Runner deployment to complete (~3-5 min)

**When ready, start testing from the top of the checklist!**

