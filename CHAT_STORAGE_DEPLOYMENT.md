# Chat Storage Migration - Deployment & Verification

## ✅ What Was Fixed

### 1. **Assistant Messages Now Saved**
- **Problem**: User messages were saved, but assistant responses were lost
- **Fix**: Added save after streaming completes (line 1075 in `chat.tsx`)
- **Result**: Both user and assistant messages persist to PostgreSQL

### 2. **TypeScript Compilation Errors**
- **Problem**: Type mismatches between API response and Thread interface
- **Fix**: Added explicit type casting for `agentMode`, `selectedCharts`, etc.
- **Result**: Portal builds successfully

### 3. **Import Path Errors**
- **Problem**: API proxies importing `.js` when source is `.ts`
- **Fix**: Changed imports to omit extension (Next.js resolves automatically)
- **Result**: Webpack builds without errors

---

## 🔐 User Data Isolation (Per-User Storage)

### How It Works

**Authentication Flow:**
1. User logs in → AWS Cognito issues JWT
2. JWT contains `sub` (user ID) and `custom:org_id` (organization ID)
3. Portal stores JWT in httpOnly cookie (secure, not accessible to JavaScript)
4. Portal API proxies use `authFetch` to extract JWT and add `Authorization: Bearer <token>`
5. API middleware (`requireAuth`) decodes JWT and adds `req.auth.sub` (user ID)
6. All database queries filter by `user_id` → **each user only sees their own data**

**Database Schema:**
```sql
-- chat_threads table
CREATE TABLE chat_threads (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,           -- ✅ Extracted from JWT (req.auth.sub)
  org_id UUID DEFAULT '...',       -- ✅ Extracted from JWT (req.auth['custom:org_id'])
  title TEXT,
  mode TEXT DEFAULT 'agent',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- chat_messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  org_id UUID DEFAULT '...',
  user_id TEXT,                    -- ✅ Same user_id from thread
  thread_id UUID REFERENCES chat_threads(id),
  role TEXT NOT NULL,
  content_json JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**API Query Example (GET /chat/threads):**
```typescript
const userId = req.auth?.sub;  // e.g. "929544e4-a0c1-7056-dc20-d831ca39fbf7"

const result = await dbQuery(
  `SELECT * FROM chat_threads 
   WHERE user_id = $1 AND org_id = $2::uuid 
   ORDER BY updated_at DESC`,
  [userId, orgIdUuid]  // ✅ User can ONLY see their own threads
);
```

**Result:** 
- User A cannot see User B's data
- Each user's chat history is completely isolated
- Org admins could query by `org_id` to see all org data (future feature)

---

## 🚀 Deployment Status

### API (App Runner)
- **Branch**: `staging`
- **Commit**: `676e4d5` (empty commit to force rebuild)
- **Status**: Deployed
- **URL**: `https://gzejipnqbh.eu-west-1.awsapprunner.com`

**What to verify:**
1. Migration 026 ran successfully (check logs for "✅ Completed 026_chat_threads_storage.sql")
2. Route `/chat/threads` is registered (check logs for "Registered route: /chat/threads")

### Portal (Amplify)
- **Branch**: `staging`
- **Commit**: `ed107b7` (fixed TypeScript errors)
- **Status**: Building (~3-5 minutes)
- **URL**: `https://staging.d2umjimd2ilqq7.amplifyapp.com`

**What to verify:**
1. Build completes successfully
2. New JavaScript hash (`chat-<hash>.js`) indicates fresh build
3. Console logs show database save attempts

---

## ✅ Verification Steps (After Deployment)

### Step 1: Check Logs for Database Saves
Open staging Portal in browser (F12 console):
1. Look for `[Chat] Creating thread in database...`
2. Look for `[Chat] Thread created: <UUID>`
3. Look for `[ChatThreads API] Calling: /api/chat/threads`

**If you DON'T see these logs** → Portal hasn't redeployed yet (hard refresh: Cmd+Shift+R)

---

### Step 2: Test Data Persistence
1. Go to staging Portal
2. Send "hi" in chat
3. Wait for response
4. **Clear browser cache completely** (or open incognito)
5. Log in again
6. Chat should still be there

**Expected Result:** ✅ Chat history persists after cache clear

---

### Step 3: Test User Isolation (Two Users)
**User A:**
1. Log in as User A
2. Send "User A test message"

**User B (different account):**
1. Log in as User B (different Cognito account)
2. Check chat history
3. **Should NOT see User A's message**
4. Send "User B test message"

**User A (return):**
1. Log back in as User A
2. Should see "User A test message" but NOT "User B test message"

**Expected Result:** ✅ Each user sees only their own data

---

### Step 4: Verify Database (Optional)
```bash
# Connect to PostgreSQL
psql -h <RDS_ENDPOINT> -U apex_admin -d nomadapex

# Check threads
SELECT id, user_id, title, created_at FROM chat_threads ORDER BY created_at DESC LIMIT 10;

# Check messages
SELECT cm.id, cm.user_id, cm.role, cm.content_json->>'content' as content, cm.created_at
FROM chat_messages cm
JOIN chat_threads ct ON cm.thread_id = ct.id
ORDER BY cm.created_at DESC
LIMIT 10;
```

**Expected Result:**
- Multiple rows with different `user_id` values
- Each `user_id` matches a Cognito `sub` claim

---

## 🔍 Troubleshooting

### "No database logs in console"
- **Cause**: Portal hasn't redeployed yet
- **Fix**: Wait 3-5 min, hard refresh (Cmd+Shift+R), check JavaScript hash changed

### "Thread created but messages not saved"
- **Cause**: API route `/chat/threads/:id/messages` failing
- **Fix**: Check API logs for error (App Runner console → Logs)

### "Data disappears after cache clear"
- **Cause**: Portal still using `localStorage` (old build)
- **Fix**: Hard refresh, verify console logs show `[ChatThreads API] Calling...`

### "User B sees User A's data"
- **Cause**: Database query not filtering by `user_id` (critical bug!)
- **Fix**: Check API route uses `WHERE user_id = $1` in ALL queries

---

## 📦 What's Next (Future TODOs)

1. **Remove localStorage fallback** (after 100% confidence in PostgreSQL)
2. **Delete chatStore.ts** (no longer used)
3. **Add org-level admin queries** (for future admin dashboard)
4. **Migrate agent runs** (currently in-memory, should be in PostgreSQL)
5. **Migrate chart images** (currently ephemeral filesystem, should be S3)

---

## 📊 Summary

**Before:**
- ❌ Chat data in browser `localStorage` (lost on cache clear)
- ❌ Assistant messages never saved
- ❌ No multi-device support
- ❌ No per-user isolation (everyone shared same localStorage)

**After:**
- ✅ Chat data in PostgreSQL (persistent)
- ✅ Both user and assistant messages saved
- ✅ Works across devices (data follows user)
- ✅ Each user has isolated data (secure)
- ✅ Survives cache clears, browser changes, etc.

**Deployment:**
- API: `staging` branch deployed to App Runner
- Portal: `staging` branch building on Amplify
- Wait ~5 min, then test

**Verification:**
1. Console logs → database API calls visible
2. Cache clear → data persists
3. Two users → data isolated

**If it works:** ✅ Migration complete! Push to `main`.  
**If it fails:** Check logs, share errors, debug together.
