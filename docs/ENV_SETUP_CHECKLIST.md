# Environment Variables Setup Checklist

**Target:** App Runner staging service (`apex-api-staging`)  
**Date:** 2025-10-16

---

## Already Configured ✅

- [x] `PORT` = 3000
- [x] `OIDC_AUTHORITY` = https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_JiQF0xM04
- [x] `OIDC_CLIENT_ID` = 6mvn1gc775h8ibei5phrkk60l1
- [x] `CORS_ORIGIN` = https://staging.d2umjimd2ilqq7.amplifyapp.com

---

## Priority 1: Critical - Add First 🔴

**These are REQUIRED for basic functionality:**

- [ ] `DATABASE_URL` = _________________
  - Source: Secrets Manager
  - Format: `postgres://user:pass@host:5432/dbname?sslmode=require`

- [ ] `OPENAI_API_KEY` = _________________
  - Source: Secrets Manager
  - Format: `sk-proj-...`

- [ ] `PGSSL` = true
  - Hardcoded value

---

## Priority 2: Chat Configuration 🟡

**Add these for full chat functionality:**

- [ ] `CHAT_MODEL_MINI` = _________________
  - Recommended: `gpt-3.5-turbo`

- [ ] `CHAT_MODEL_STRONG` = _________________
  - Recommended: `gpt-4`

- [ ] `MODEL` = _________________
  - Recommended: `gpt-4`

- [ ] `CHAT_URL_MINI` = _________________
  - Default: `https://api.openai.com/v1/chat/completions`

- [ ] `CHAT_URL_STRONG` = _________________
  - Default: `https://api.openai.com/v1/chat/completions`

- [ ] `CHAT_PATH_MINI` = _________________
  - Default: `/v1/chat/completions`

- [ ] `CHAT_PATH_STRONG` = _________________
  - Default: `/v1/chat/completions`

---

## Priority 3: Azure APIM (If Used) 🟢

**Only add if routing through Azure APIM:**

- [ ] `APIM_HOST` = _________________
  - Source: Secrets Manager
  - Format: `your-apim.azure-api.net`

- [ ] `APIM_SUBSCRIPTION_KEY` = _________________
  - Source: Secrets Manager

- [ ] `APIM_OPERATION` = _________________
  - Source: Secrets Manager

- [ ] `API_URL` = _________________
  - Source: Secrets Manager

---

## Priority 4: Azure Storage 🟢

**Add when testing file uploads/reports:**

- [ ] `AZURE_STORAGE_CONNECTION_STRING` = _________________
  - Source: Secrets Manager
  - Format: `DefaultEndpointsProtocol=https;AccountName=...`

---

## Priority 5: ADI Document Analysis 🟢

**Add when testing ADI features:**

- [ ] `ADI_ANALYZE_URL` = _________________
- [ ] `ADI_ANALYZE_PATH` = _________________
- [ ] `ADI_RESULT_URL` = _________________
- [ ] `ADI_RESULT_PATH` = _________________
- [ ] `ADI_API_VERSION` = _________________
- [ ] `ADI_MODEL_ID` = _________________
- [ ] `ADI_ANALYZE_OVERLOAD` = _________________

---

## Priority 6: Performance/Timeouts ⚪

**Optional - have sensible defaults in code:**

- [ ] `HTTP_TIMEOUT_MS` = 30000
- [ ] `POLL_INTERVAL_MS` = 1000
- [ ] `POLL_MAX_SECONDS` = 300

---

## Priority 7: Check for Duplicates ⚠️

- [ ] `OPEN_AI_KEY` = _________________
  - **NOTE:** Check if this is different from `OPENAI_API_KEY`
  - If same value, you might not need both
  - Check old config to see if both are used

---

## How to Add in App Runner

1. **AWS Console** → **App Runner** (eu-west-1)
2. Select service: **apex-api-staging**
3. **Configuration** tab → **Edit**
4. Scroll to **Environment variables**
5. Click **"Add environment variable"** for each
6. **Name:** (from list above)
7. **Value:** (from Secrets Manager)
8. Click **"Save changes"** when done
9. Wait 3-5 min for redeploy

---

## After Adding Variables

### Test Deployment

```bash
# Health check
curl https://gzejipnqbh.eu-west-1.awsapprunner.com/health

# Check logs in App Runner console
# Look for database connection messages
# Check for any env var errors
```

### Next Steps

1. [ ] All Priority 1 variables added
2. [ ] Deployment successful
3. [ ] Health check passing
4. [ ] Logs show no errors
5. [ ] Ready for Step 5.3 (re-enable routes)

---

## Secrets Manager Secret Names (Fill In)

**Where are your secrets stored?**

- Main secret name: _________________________________
- Backup/alternate: _________________________________

**To retrieve:**
1. AWS Console → Secrets Manager (eu-west-1)
2. Find secret by name
3. Click "Retrieve secret value"
4. Copy JSON values to this checklist

---

**Last Updated:** 2025-10-16  
**Status:** Ready to add variables

