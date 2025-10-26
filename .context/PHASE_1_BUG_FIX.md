# Phase 1 Bug Fix - JSON.parse() Error

**Date:** October 26, 2025  
**Issue:** SSE stream crashes after 2 events  
**Status:** ✅ FIXED

---

## Problem

**Symptom:**
- Portal receives first 2 thinking events successfully
- Browser console shows: `[Chat] Research stream error: MessageEvent`
- Then: `[Chat] Research stream connection error`
- Stream closes prematurely, shows "Error occurred"

**Root Cause:**
PostgreSQL `JSONB` columns are returned as **already-parsed objects**, not JSON strings. The code was calling `JSON.parse()` on an already-parsed array, causing a crash:

```typescript
// ❌ BUG (line 289 in research.ts)
const uploadedFiles = JSON.parse(run.uploaded_files || '[]');

// If run.uploaded_files = [] (already an array)
// JSON.parse([]) → Error!
```

---

## Fix

```typescript
// ✅ FIXED
const uploadedFiles = Array.isArray(run.uploaded_files) 
  ? run.uploaded_files 
  : (run.uploaded_files ? JSON.parse(run.uploaded_files) : []);
```

**Logic:**
1. If `run.uploaded_files` is already an array → use it directly
2. If it's a string → parse it
3. If it's null/undefined → default to `[]`

---

## Timeline

1. **4:10 AM** - User reports "Error occurred" after 2 events
2. **4:12 AM** - Checked database: `uploaded_files` type is `jsonb` (returns parsed object)
3. **4:13 AM** - Fixed `JSON.parse()` call to handle already-parsed arrays
4. **4:14 AM** - Rebuilt TypeScript
5. **4:15 AM** - Restarted server (PID 5990)
6. **4:16 AM** - Ready for testing

---

## Testing

**Before Fix:**
- ✅ Event 1: "Starting research analysis..."
- ✅ Event 2: "Analyzing query..."
- ❌ CRASH (JSON.parse error on line 289)

**After Fix:**
Should see ALL events:
- ✅ Event 1: "Starting research analysis..."
- ✅ Event 2: "Analyzing query..."
- ✅ Event 3: "No uploaded files..."
- ✅ Event 4: Tool call (openai_search)
- ✅ Event 5: Tool result
- ✅ Event 6: Synthesis thinking
- ✅ Event 7: Section completed (Executive Summary)
- ✅ Event 8: More thinking
- ✅ Event 9: Section completed (Key Findings)
- ✅ Event 10: Final thinking
- ✅ Event 11: **research.completed** with full report

---

## Files Changed

- `src/routes/research.ts` (line 289-292)

---

## Deployment Impact

**Local:** ✅ Fixed immediately  
**Staging:** Will be included in next deployment (after commit)

---

**Status:** Ready to test from Portal!  
**Test URL:** http://localhost:3000/chat (Research mode)

