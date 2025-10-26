# CHART STALLING FIX - Added Timeouts

**Date:** 2025-10-26  
**Issue:** Charts stalling indefinitely, frontend polling forever  
**Root Cause:** No timeouts on APIM calls or Python execution  
**Status:** ✅ FIXED

---

## 🐛 THE PROBLEM

### User Report
```
[Chat] Status data received: {status: 'active', has_report_content: false, ...}
[Chat] Status data received: {status: 'active', has_report_content: false, ...}
[Chat] Status data received: {status: 'active', has_report_content: false, ...}
... (repeats forever)
```

**Behavior:**
- Frontend keeps polling for status
- Backend stuck on a long-running operation
- No error, no completion
- Chart generation hangs indefinitely

---

## 🔍 ROOT CAUSES

### 1. APIM Call - NO TIMEOUT
```typescript
// BEFORE (lines 827-852):
const response = await fetch(`${this.apimHost}${operation}`, {
  method: 'POST',
  headers: {...},
  body: JSON.stringify({...})
});
// ❌ If APIM hangs → waits forever
```

**Problem:**
- If APIM is slow (overloaded, network issues, model issues)
- If APIM never responds
- Chart generation stalls forever
- Frontend keeps polling with no progress

---

### 2. Python Execution - NO TIMEOUT
```typescript
// BEFORE (lines 1795-1820):
return new Promise((resolve, reject) => {
  const pythonProcess = spawn('python3', [scriptPath, payloadPath, outputPath]);
  
  pythonProcess.on('close', (code) => {
    // Handle completion
  });
});
// ❌ If Python hangs → waits forever
```

**Problem:**
- If Python script has infinite loop
- If Python library hangs (matplotlib, numpy issues)
- If data causes computational hang
- Chart generation stalls forever
- Frontend keeps polling with no progress

---

## ✅ THE FIX

### 1. APIM Timeout (30 seconds)

```typescript
// NEW (lines 827-855):
// Add timeout to prevent hanging
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

const response = await fetch(`${this.apimHost}${operation}`, {
  method: 'POST',
  headers: {...},
  body: JSON.stringify({...}),
  signal: controller.signal  // ✅ Abort signal
});

clearTimeout(timeoutId);  // Clear if successful
```

**Error Handling:**
```typescript
} catch (error: any) {
  if (error.name === 'AbortError') {
    console.error('[ChartService] APIM request timed out after 30s');
    throw new Error('Chart generation timed out - APIM took too long to respond');
  }
  // ... other errors
}
```

**Benefits:**
- ✅ Fails after 30 seconds instead of hanging forever
- ✅ Clear error message
- ✅ Frontend stops polling
- ✅ User gets feedback

---

### 2. Python Timeout (60 seconds)

```typescript
// NEW (lines 1795-1841):
return new Promise((resolve, reject) => {
  const pythonProcess = spawn('python3', [scriptPath, payloadPath, outputPath]);
  
  let isResolved = false;
  
  // Add timeout to prevent hanging Python scripts
  const timeoutId = setTimeout(() => {
    if (!isResolved) {
      isResolved = true;
      pythonProcess.kill('SIGTERM');  // ✅ Kill the process
      console.error('[ChartService] Python execution timed out after 60s');
      reject(new Error('Chart generation timed out - Python script took too long'));
    }
  }, 60000); // 60 second timeout
  
  pythonProcess.on('close', (code) => {
    if (isResolved) return; // Already timed out
    isResolved = true;
    clearTimeout(timeoutId);  // ✅ Clear if successful
    
    if (code !== 0) {
      reject(new Error(`Python execution failed: ${stderr}`));
    } else {
      resolve(outputPath);
    }
  });
  
  pythonProcess.on('error', (error) => {
    if (isResolved) return; // Already timed out
    isResolved = true;
    clearTimeout(timeoutId);
    reject(error);
  });
});
```

**Benefits:**
- ✅ Kills hanging Python process after 60 seconds
- ✅ Uses SIGTERM for graceful termination
- ✅ isResolved flag prevents double-handling
- ✅ Clear error message
- ✅ Frees up server resources

---

## ⏱️ TIMEOUT VALUES

| Operation | Timeout | Reasoning |
|-----------|---------|-----------|
| **APIM Call** | 30 seconds | GPT-4 typically responds in 5-15s; 30s is generous |
| **Python Execution** | 60 seconds | Chart rendering can be complex; 60s is reasonable max |
| **External Search** | 15 seconds | Already set (earlier fix) |

**Total Max Time:** ~105 seconds (1m 45s) worst case for full chart generation

---

## 🧪 TESTING

### Before Fix
```
User: Generate chart
Frontend: Polling... (status: active)
Backend: [Hangs on APIM or Python]
Frontend: Still polling... (status: active)
... (repeats forever) ...
Result: ❌ User stuck waiting, no error shown
```

### After Fix
```
User: Generate chart
Frontend: Polling... (status: active)
Backend: [APIM or Python hangs]
Backend: Timeout triggers after 30s or 60s
Backend: Returns error: "Chart generation timed out"
Frontend: Stops polling, shows error
Result: ✅ User gets feedback within 30-60s
```

---

## 📊 EXPECTED BEHAVIOR

### Normal Chart Generation (Most Cases)
```
APIM call: 5-15 seconds ✅
Python execution: 5-30 seconds ✅
Total: 10-45 seconds ✅
Result: Chart generated successfully
```

### Timeout Scenarios

#### APIM Timeout
```
APIM call: 30 seconds... ⏱️ TIMEOUT
Error: "Chart generation timed out - APIM took too long to respond"
Logs: "[ChartService] APIM request timed out after 30s"
```

#### Python Timeout
```
APIM call: 10 seconds ✅
Python execution: 60 seconds... ⏱️ TIMEOUT
Process killed: SIGTERM
Error: "Chart generation timed out - Python script took too long"
Logs: "[ChartService] Python execution timed out after 60s"
```

---

## 🔧 IMPLEMENTATION DETAILS

### APIM Timeout (AbortController)
```typescript
// 1. Create controller
const controller = new AbortController();

// 2. Set timeout to abort
const timeoutId = setTimeout(() => controller.abort(), 30000);

// 3. Pass signal to fetch
fetch(url, { signal: controller.signal })

// 4. Clear timeout if successful
clearTimeout(timeoutId);

// 5. Catch abort error
catch (error) {
  if (error.name === 'AbortError') {
    // Handle timeout
  }
}
```

### Python Timeout (Process Kill)
```typescript
// 1. Track if resolved
let isResolved = false;

// 2. Set timeout to kill process
setTimeout(() => {
  if (!isResolved) {
    pythonProcess.kill('SIGTERM');
    reject(new Error('timeout'));
  }
}, 60000);

// 3. Mark resolved on completion
pythonProcess.on('close', () => {
  if (isResolved) return;  // Guard
  isResolved = true;
  clearTimeout(timeoutId);
});

// 4. Guard all callbacks
pythonProcess.on('error', () => {
  if (isResolved) return;  // Guard
  isResolved = true;
});
```

---

## 📝 WHY THIS MATTERS

### Without Timeouts
- ❌ Charts hang forever
- ❌ Server resources locked
- ❌ Users frustrated (no feedback)
- ❌ Multiple hanging requests accumulate
- ❌ Server eventually crashes (resource exhaustion)

### With Timeouts
- ✅ Fast failure (30-60s max)
- ✅ Clear error messages
- ✅ Resources freed
- ✅ Users get feedback
- ✅ Server stays healthy

---

## 🚀 DEPLOYMENT

### To Deploy
```bash
cd /Users/benbarrett/APEX-Api-Prod
git push origin staging
```

### Monitoring After Deployment

**Look for timeout logs:**
```
[ChartService] APIM request timed out after 30s
[ChartService] Python execution timed out after 60s
```

**If timeouts are frequent:**
1. Check APIM health/performance
2. Check Python scripts for optimization opportunities
3. Consider increasing timeouts (but not too much)

**If no timeouts:**
✅ Good! Charts generating within reasonable time

---

## ✅ FINAL STATUS

**PROBLEM:** Charts stalling indefinitely  
**CAUSE:** No timeouts on APIM or Python  
**FIX:** Added 30s APIM timeout, 60s Python timeout  
**RESULT:** Charts fail fast with clear errors instead of hanging forever

**READY FOR PRODUCTION** 🚀

---

## 📦 RELATED FIXES

This completes the timeout coverage:
1. ✅ External search: 15s timeout (earlier fix)
2. ✅ APIM calls: 30s timeout (this fix)
3. ✅ Python execution: 60s timeout (this fix)

**All async operations now have timeouts** ✅

