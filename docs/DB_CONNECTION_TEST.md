# Database Connection Test Log

**Date:** 2025-10-16  
**Database Found:** AWS RDS PostgreSQL  
**Endpoint:** `nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com`

---

## Step 1: Added Environment Variables ✅

Added to App Runner `apex-api-staging`:

```bash
DATABASE_URL=postgresql://apex_admin:w1g(j6BF1ZFIit]!)kYv]Zyk2Zdp@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex
PGSSL=1
```

**Status:** Deployment in progress...

---

## Step 2: Check Network Connectivity

### Potential Issues:

**Issue 1: RDS Security Group**
- RDS may only allow connections from specific IPs/security groups
- App Runner uses dynamic IPs unless in Custom VPC

**Issue 2: RDS in Private Subnet**
- RDS may be in VPC private subnet
- App Runner (default) can't reach private subnets

**Issue 3: RDS Public Access**
- RDS public access may be disabled

---

## What to Check After Deployment

### A) Check App Runner Logs

1. AWS Console → App Runner → apex-api-staging
2. Logs tab
3. Look for:
   - ✅ Good: `API on 3000` (server started)
   - ❌ Bad: `ECONNREFUSED` (can't reach DB)
   - ❌ Bad: `ETIMEDOUT` (firewall/security group blocking)
   - ❌ Bad: `password authentication failed` (wrong credentials)

### B) Test with a Simple DB Query

Once deployed, test:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://gzejipnqbh.eu-west-1.awsapprunner.com/agentic-flow/runs \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"goal":"test database connection","mode":"reports"}'
```

If it works: Returns `{"run_id":"...","message":"..."}`  
If DB fails: Returns 500 error

---

## If Connection Fails: Network Fix

### Solution: Move App Runner to Custom VPC

**Why:** App Runner needs to be in same VPC as RDS to connect.

**Steps:**
1. App Runner → apex-api-staging → Configuration → Networking
2. Edit → Enable "Custom VPC"
3. Select:
   - **VPC:** Same as RDS (check RDS → Connectivity)
   - **Subnets:** Private subnets (same as RDS)
   - **Security Group:** Create new or use existing that allows 5432 from App Runner
4. Save → Redeploy

**Time:** 5-10 minutes

---

## If Connection Succeeds: Next Steps

1. ✅ Database connected
2. Enable agentic flow compilation
3. Test agent modes from portal
4. Complete Step 5 testing
5. Move to production!

---

## Status: Waiting for Deployment

Checking logs next...

