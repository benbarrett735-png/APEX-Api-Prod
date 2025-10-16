# ADI Environment Variables - Required Configuration

## What ADI Needs to Work

### Critical Variables (MUST HAVE)

#### For ADI Analysis Service:
```bash
# These are the MINIMUM required for ADI to work
ADI_ANALYZE_PATH=/documentintelligence/documentModels/{model}:analyze
ADI_API_VERSION=2023-07-31
ADI_STRING_INDEX_TYPE=textElements
ADI_MODEL_ID=prebuilt-layout
```

#### For Azure Storage (Document Upload):
```bash
# If you're using Azure Blob Storage for documents
STORAGE_ACCOUNT=your-storage-account-name
STORAGE_ACCOUNT_KEY=your-storage-key-here
STORAGE_CONTAINER=documents
SAS_EXPIRY_HOURS=24
```

OR use the connection string:
```bash
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
```

#### For Azure APIM (if using API Management):
```bash
APIM_HOST=your-apim.azure-api.net
APIM_SUBSCRIPTION_KEY=your-subscription-key
```

---

## Check Your App Runner Configuration

### Go to App Runner Console:

1. Service: `apex-api-staging`
2. Configuration → Environment Variables
3. Verify you have ALL of these set:

**ADI Service:**
- [ ] `ADI_ANALYZE_PATH` - Should be something like `/documentintelligence/documentModels/{model}:analyze`
- [ ] `ADI_API_VERSION` - Should be `2023-07-31` or similar
- [ ] `ADI_STRING_INDEX_TYPE` - Should be `textElements` or `utf16CodeUnit`
- [ ] `ADI_MODEL_ID` - Should be `prebuilt-layout` or your custom model

**Azure Storage (ONE of these approaches):**

Option A: Individual credentials
- [ ] `STORAGE_ACCOUNT` - Your Azure storage account name
- [ ] `STORAGE_ACCOUNT_KEY` - Your Azure storage account key
- [ ] `STORAGE_CONTAINER` - Container name (e.g., `documents`)
- [ ] `SAS_EXPIRY_HOURS` - Default: `24`

Option B: Connection string
- [ ] `AZURE_STORAGE_CONNECTION_STRING` - Full connection string

**APIM (if applicable):**
- [ ] `APIM_HOST` - Azure APIM hostname
- [ ] `APIM_SUBSCRIPTION_KEY` - APIM subscription key

---

## Common Issues & Solutions

### Issue 1: "ADI environment variables not set"

**Cause:** Missing ADI_ANALYZE_PATH, ADI_API_VERSION, or ADI_STRING_INDEX_TYPE

**Solution:** Add these to App Runner:
```bash
ADI_ANALYZE_PATH=/documentintelligence/documentModels/{model}:analyze
ADI_API_VERSION=2023-07-31
ADI_STRING_INDEX_TYPE=textElements
```

### Issue 2: "Upload fails immediately"

**Cause:** Azure Storage credentials missing or wrong

**Check:**
1. Do you have `STORAGE_ACCOUNT` AND `STORAGE_ACCOUNT_KEY`?
2. OR do you have `AZURE_STORAGE_CONNECTION_STRING`?
3. Is `STORAGE_CONTAINER` set?

**Note:** You need EITHER:
- Individual creds (STORAGE_ACCOUNT + STORAGE_ACCOUNT_KEY + STORAGE_CONTAINER)
- OR connection string (AZURE_STORAGE_CONNECTION_STRING + STORAGE_CONTAINER)

### Issue 3: "APIM errors"

**Cause:** Using APIM but credentials missing

**Solution:** Add:
```bash
APIM_HOST=your-apim.azure-api.net
APIM_SUBSCRIPTION_KEY=abc123...
```

---

## How to Extract From Secrets Manager

If your ADI config is in Secrets Manager:

```bash
# AWS Console → Secrets Manager → Your secret
# Look for keys like:
{
  "ADI_ANALYZE_PATH": "...",
  "ADI_API_VERSION": "...",
  "STORAGE_ACCOUNT": "...",
  "STORAGE_ACCOUNT_KEY": "...",
  ...
}
```

Copy those exact values to App Runner environment variables.

---

## Environment Variable Naming - EXACT MATCH REQUIRED

The code looks for these EXACT names (case-sensitive):

❌ WRONG:
- `adi_analyze_path` (lowercase)
- `AdiAnalyzePath` (camelCase)
- `ADI_ANALYSIS_PATH` (different name)

✅ CORRECT:
- `ADI_ANALYZE_PATH` (exact match)
- `ADI_API_VERSION` (exact match)
- `STORAGE_ACCOUNT` (exact match)

---

## Quick Test

After adding variables, test with curl:

```bash
# Should return specific error (not "not configured")
curl -X POST https://gzejipnqbh.eu-west-1.awsapprunner.com/adi/analyze \
  -H "Content-Type: application/json" \
  -d '{"fileData":"test","fileName":"test.pdf"}'
```

If you get:
- ✅ Different error (auth, validation) = Variables loaded!
- ❌ "adi_not_configured" = Variables missing

---

## Variables You Might Be Missing

Based on the error, you're likely missing ONE of these:

1. `ADI_ANALYZE_PATH` - Check App Runner
2. `ADI_API_VERSION` - Check App Runner
3. `ADI_STRING_INDEX_TYPE` - Check App Runner

**These are separate from AZURE_STORAGE_CONNECTION_STRING!**

You need BOTH:
- Azure Storage variables (for file upload)
- AND ADI service variables (for document analysis)

---

## Next Steps

1. [ ] Check App Runner → Configuration → Environment Variables
2. [ ] Verify ALL ADI_* variables are present
3. [ ] Verify STORAGE_* variables are present
4. [ ] Check variable names are EXACT (case-sensitive)
5. [ ] Redeploy if you added any
6. [ ] Test again from portal

---

**Last Updated:** 2025-10-16

