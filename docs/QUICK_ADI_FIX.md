# ADI Quick Fix - What to Check Right Now

## The Problem

ADI uploads fail immediately - documents don't process.

## Most Likely Causes

### 1. Missing ADI Environment Variables ⚠️

The code checks for these **3 REQUIRED variables**:
```typescript
if (!ENV.ADI_ANALYZE_PATH || !ENV.ADI_API_VERSION || !ENV.ADI_STRING_INDEX_TYPE)
```

**Go to App Runner → Configuration → Environment Variables**

Check you have EXACTLY these names:
- `ADI_ANALYZE_PATH`
- `ADI_API_VERSION`  
- `ADI_STRING_INDEX_TYPE`

### 2. Missing or Wrong Storage Credentials ⚠️

The code checks:
```typescript
const hasStorage = !!(ENV.STORAGE_ACCOUNT && ENV.STORAGE_ACCOUNT_KEY && ENV.STORAGE_CONTAINER);
```

**Option A: Individual Credentials**
- `STORAGE_ACCOUNT` = your Azure storage account name
- `STORAGE_ACCOUNT_KEY` = your Azure storage key
- `STORAGE_CONTAINER` = container name (e.g., `documents`)

**Option B: Use Connection String**
If you have `AZURE_STORAGE_CONNECTION_STRING`, the code needs to extract account name and key from it.

**BUT** the current code expects `ENV.STORAGE_ACCOUNT` which won't exist if you only have the connection string!

---

## Quick Fix - Two Options

### Option A: Add Individual Storage Credentials (Recommended)

If you have `AZURE_STORAGE_CONNECTION_STRING`, parse it:

```
DefaultEndpointsProtocol=https;AccountName=YOUR_ACCOUNT_NAME;AccountKey=YOUR_KEY;EndpointSuffix=core.windows.net
```

Extract:
- `AccountName=` → Put in `STORAGE_ACCOUNT`
- `AccountKey=` → Put in `STORAGE_ACCOUNT_KEY`
- Add `STORAGE_CONTAINER` = `documents` (or your container name)

**Add to App Runner:**
```bash
STORAGE_ACCOUNT=YOUR_ACCOUNT_NAME
STORAGE_ACCOUNT_KEY=YOUR_KEY
STORAGE_CONTAINER=documents
```

### Option B: Update Code to Parse Connection String

If you want to ONLY use `AZURE_STORAGE_CONNECTION_STRING`, we need to update the code to parse it.

---

## Required Environment Variables Checklist

### App Runner - MUST HAVE:

**ADI Service (3 required):**
- [ ] `ADI_ANALYZE_PATH` (e.g., `/documentintelligence/documentModels/{model}:analyze`)
- [ ] `ADI_API_VERSION` (e.g., `2023-07-31`)
- [ ] `ADI_STRING_INDEX_TYPE` (e.g., `textElements`)

**Azure Storage (3 required if using Option A):**
- [ ] `STORAGE_ACCOUNT` (account name)
- [ ] `STORAGE_ACCOUNT_KEY` (account key)
- [ ] `STORAGE_CONTAINER` (container name)

**OR (if using Option B):**
- [ ] `AZURE_STORAGE_CONNECTION_STRING` (full connection string)
- [ ] Code update needed to parse it

**Optional but helpful:**
- [ ] `ADI_MODEL_ID` (e.g., `prebuilt-layout`)
- [ ] `APIM_HOST` (if using APIM)
- [ ] `APIM_SUBSCRIPTION_KEY` (if using APIM)

---

## How to Verify

### Step 1: Check App Runner Environment Variables

1. AWS Console → App Runner
2. Service: `apex-api-staging`
3. Configuration → Environment Variables
4. Look for the 6 variables above

### Step 2: Check Naming (Case-Sensitive!)

❌ Wrong:
- `adi_analyze_path` (lowercase)
- `Adi_Analyze_Path` (mixed case)
- `ADI_ANALYSIS_PATH` (wrong name)

✅ Correct:
- `ADI_ANALYZE_PATH` (exact)
- `ADI_API_VERSION` (exact)
- `STORAGE_ACCOUNT` (exact)

### Step 3: Test After Adding

Wait for redeploy (~3-5 min), then test from portal.

---

## What Probably Happened

You likely added:
- ✅ `AZURE_STORAGE_CONNECTION_STRING`
- ❌ But NOT `STORAGE_ACCOUNT`, `STORAGE_ACCOUNT_KEY`, `STORAGE_CONTAINER`
- ❌ And NOT the 3 ADI_* variables

The code expects individual storage credentials, NOT the connection string.

---

## Quick Action Items

1. **Open AWS Secrets Manager** - get your staging secrets
2. **Find these values:**
   - ADI analyze path
   - ADI API version  
   - Storage account name
   - Storage account key
   - Container name
3. **Add to App Runner** as individual environment variables
4. **Wait for redeploy** (~3-5 min)
5. **Test again**

---

## If Still Failing After Adding Variables

Check CloudWatch Logs in App Runner:
1. App Runner → Service → Logs
2. Look for error messages
3. Share the error with me

Common errors:
- `adi_not_configured` = Missing ADI_* variables
- `Invalid storage credentials` = Wrong STORAGE_* values
- `Container not found` = Wrong STORAGE_CONTAINER name
- `403 Forbidden` = Wrong APIM_SUBSCRIPTION_KEY

---

**Most Likely Solution:** Add the 6 individual environment variables to App Runner (not just the connection string).

