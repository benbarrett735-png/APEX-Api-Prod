# Database Connection Scenarios - What Might Go Wrong

**Database:** AWS RDS PostgreSQL  
**Endpoint:** `nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com`  
**Already Configured:** `DATABASE_URL` in App Runner ✅

---

## Scenario 1: Everything Works ✅ (Best Case)

**What This Means:**
- App Runner CAN reach RDS (network OK)
- Database tables EXIST (migrations already run)
- Agent modes work immediately

**How to Know:**
- Agent mode starts
- Run ID created
- Streaming updates appear
- No errors in logs

**Action Needed:** None! Move to Step 6 (production)

**Probability:** 30% (if DB was used in old EB setup)

---

## Scenario 2: Missing Tables ⚠️ (Most Likely)

### Symptom
```
Error: relation "agentic_runs" does not exist
```

### What This Means
- Network connection works ✅
- Database exists ✅
- But agentic flow tables were never created

### Why This Happens
- Migrations only run manually
- Old EB deployment may not have used agent features
- Tables for reports/research/charts need to be created

### How to Fix (10 minutes)

**Step 1: Check What Tables Exist**
```bash
# Connect to RDS
psql "postgresql://apex_admin:w1g(j6BF1ZFIit]!)kYv]Zyk2Zdp@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex"

# List all tables
\dt

# Check specifically for agentic tables
\dt agentic*
```

**Expected Output if Missing:**
```
No matching relations found.
```

**Step 2: Run Migrations**
```bash
# Still connected in psql:

-- Migration 1: Create agentic flow tables
\i /Users/benbarrett/APEX-Api-Prod/migrations/016_agentic_flow.sql

-- Migration 2: Add more agentic features
\i /Users/benbarrett/APEX-Api-Prod/migrations/020_agentic_flow.sql

-- Migration 3: Add mode column
\i /Users/benbarrett/APEX-Api-Prod/migrations/022_add_mode_to_agentic_runs.sql
```

**Step 3: Verify Tables Created**
```bash
\dt agentic*

# Should now show:
#  agentic_runs
#  agentic_steps
#  agentic_events
```

**Step 4: Test Agent Mode Again**
- Should now work ✅

**Probability:** 60%

---

## Scenario 3: Network Connection Blocked 🔴 (Possible)

### Symptom
```
Error: connect ECONNREFUSED
Error: connect ETIMEDOUT
Error: Connection timed out
```

### What This Means
- App Runner CAN'T reach RDS
- Network blocked by:
  - RDS in private VPC subnet
  - Security group doesn't allow App Runner IPs
  - App Runner not in same VPC as RDS

### Why This Happens
**App Runner Default:** Runs in AWS public network  
**RDS Default:** Runs in private VPC subnet  
**Problem:** They can't talk to each other

### How to Fix (5 minutes)

**Step 1: Check RDS VPC Configuration**
```
AWS Console → RDS → Databases → nomad-apex-db
Look for:
- VPC ID: vpc-xxxxx
- Subnets: subnet-xxxx, subnet-yyyy (private)
- Security Group: sg-xxxxx
```

**Step 2: Configure App Runner to Use Custom VPC**
```
AWS Console → App Runner → apex-api-staging
→ Configuration → Networking → Edit

Enable: Custom VPC

Select:
- VPC: [Same as RDS - vpc-xxxxx]
- Subnets: [Same private subnets as RDS]
- Security Group: [Create new or select one]
```

**Step 3: Security Group Configuration**

**Option A: Create New Security Group**
```
Name: apex-api-to-rds
VPC: [Same as RDS]
Outbound Rules:
  - Type: PostgreSQL
  - Port: 5432
  - Destination: [RDS security group]
```

**Option B: Update RDS Security Group**
```
Go to RDS security group
Add Inbound Rule:
  - Type: PostgreSQL
  - Port: 5432
  - Source: [App Runner security group]
```

**Step 4: Wait for App Runner Redeploy**
- Takes ~5 minutes

**Step 5: Test Connection**
- Check logs for connection success
- Try agent mode again

**Probability:** 30% (if RDS is in private subnet)

---

## Scenario 4: Wrong Credentials 🔴 (Unlikely)

### Symptom
```
Error: password authentication failed for user "apex_admin"
Error: FATAL: password authentication failed
```

### What This Means
- Network works ✅
- Database exists ✅
- But username/password wrong

### Why This Happens
- Password changed in RDS
- Typo in DATABASE_URL
- Wrong database name

### How to Fix (2 minutes)

**Check DATABASE_URL Format:**
```
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE

Current:
postgresql://apex_admin:w1g(j6BF1ZFIit]!)kYv]Zyk2Zdp@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex
           ^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^
           username    password (note special chars!)                    endpoint                           db name
```

**Special Characters in Password:**
- Your password has: `()[]!`
- May need URL encoding: `%28 %29 %5B %5D %21`

**If This Fails:**
```bash
# Test connection manually:
psql "postgresql://apex_admin:w1g(j6BF1ZFIit]!)kYv]Zyk2Zdp@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex"

# If it fails, try URL-encoding the password:
psql "postgresql://apex_admin:w1g%28j6BF1ZFIit%5D%21%29kYv%5DZyk2Zdp@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex"
```

**Probability:** 10%

---

## Scenario 5: Database Doesn't Exist 🔴 (Very Unlikely)

### Symptom
```
Error: database "apex" does not exist
```

### What This Means
- Network works ✅
- RDS instance exists ✅
- But database named "apex" was never created

### How to Fix (5 minutes)

```bash
# Connect to default postgres database
psql "postgresql://apex_admin:PASSWORD@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/postgres"

# Create database
CREATE DATABASE apex;

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE apex TO apex_admin;

# Reconnect to new database
\c apex

# Run ALL migrations (not just agentic)
\i 001_init.sql
\i 002_helpers.sql
...
\i 016_agentic_flow.sql
...
```

**Probability:** 5% (DB should exist if EB was using it)

---

## Most Likely Outcome: Scenario 2 (Missing Tables)

**Why:**
- You already connected to the DB (so network OK)
- DATABASE_URL works (you added it)
- But agentic features are new
- Tables probably don't exist

**Total Fix Time:** 10 minutes (run 3 migrations)

---

## How to Diagnose Quickly

### Test 1: Check App Runner Logs (1 min)
```
App Runner → apex-api-staging → Logs

Look for:
✅ "API on 3000" = Server started, DB not blocking startup
❌ "ECONNREFUSED" = Network issue (Scenario 3)
❌ "password authentication failed" = Credentials issue (Scenario 4)
```

### Test 2: Try Agent Mode (1 min)
```
Portal → Agent → Reports → Generate

Look for:
✅ Run starts = Everything works (Scenario 1)
❌ "relation does not exist" = Missing tables (Scenario 2)
❌ Hangs/timeout = Network issue (Scenario 3)
```

---

## Kevin's Plan - Database Expectation

**Per Kevin's plan:**
- Database SHOULD exist from old EB setup
- Tables MAY exist (if old monorepo used them)
- Network MAY need VPC config (depends on RDS setup)

**Most Conservative Estimate:**
- Scenario 2 (missing tables) = 10 min fix
- Scenario 3 (network) = 5 min fix
- Total worst case = 15 minutes

**After fixing:** Agent modes work, Step 5 complete! ✅

---

## Summary

| Scenario | Symptom | Fix Time | Probability |
|----------|---------|----------|-------------|
| 1. Works immediately | No errors | 0 min | 30% |
| 2. Missing tables | "relation does not exist" | 10 min | 60% |
| 3. Network blocked | "ECONNREFUSED" | 5 min | 30% |
| 4. Wrong credentials | "auth failed" | 2 min | 10% |
| 5. No database | "database does not exist" | 30 min | 5% |

**Most Likely:** You'll need to run 3 migration files (Scenario 2).

**Worst Case:** Run migrations + configure VPC = 15 minutes.

**Best Case:** Everything works immediately.

---

**Test in ~5 min when deploy finishes, then we'll know which scenario we're in!**

