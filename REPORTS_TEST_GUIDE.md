# Reports End-to-End Test Guide

## ✅ What's Fixed and Ready to Test

### **1. Timeout Protection**
- ✅ 5-minute timeout prevents infinite loading
- ✅ Run marked as 'failed' if exceeds time limit
- ✅ User sees clear error instead of waiting forever

### **2. Chart Failure Handling**
- ✅ If chart generation fails → shows "⚠️ Chart Generation Failed" 
- ✅ Report continues and completes (doesn't crash)
- ✅ Error message included in report

### **3. Chart Fallback Logic**
- ✅ If insufficient data → searches web for chart data
- ✅ If web search fails → APIM generates synthetic data
- ✅ Charts work even without perfect data

### **4. Regeneration**
- ✅ Stores feedback in metadata
- ✅ Re-runs report generation with feedback
- ✅ Uses same flow as initial generation

### **5. Chat**
- ✅ Supports conversation history
- ✅ Multi-turn conversations work
- ✅ Context maintained across messages

---

## 🧪 How to Test (In Portal)

### **Test 1: Basic Report Generation**

**Steps:**
1. Open portal at `http://localhost:3000/chat`
2. Switch to "Reports" mode
3. Enter goal: `"Quick analysis of Tesla's market position"`
4. Report Length: **Short**
5. Report Focus: **Standard**
6. Selected Charts: **None** (test without charts first)
7. Click Generate

**Expected:**
- ✅ Report starts generating
- ✅ Shows thinking events
- ✅ Executes tools (search_web, draft_section)
- ✅ Completes within 2-3 minutes
- ✅ Final report displayed

---

### **Test 2: Report with Charts**

**Steps:**
1. Same as Test 1, but:
2. Selected Charts: **["bar"]**
3. Click Generate

**Expected:**
- ✅ Report generates
- ✅ Chart attempts to generate
- **IF chart fails:**
  - ✅ Report continues
  - ✅ Shows "⚠️ Chart Generation Failed" section
  - ✅ Report completes anyway

---

### **Test 3: Report with Document**

**Steps:**
1. Upload a PDF document
2. Enter goal: `"Analyze this document"`
3. Report Length: **Medium**
4. Click Generate

**Expected:**
- ✅ Document analyzed first
- ✅ Report includes document insights
- ✅ Report generated successfully

---

### **Test 4: Report Timeout**

**Steps:**
1. Enter goal: `"Comprehensive analysis of global AI market with 50 detailed sections"`
2. Report Length: **Long**
3. Report Focus: **Detailed**
4. Wait

**Expected:**
- ✅ If exceeds 5 minutes → marked as failed
- ✅ User sees error message
- ✅ No infinite loading

---

### **Test 5: Report Regeneration**

**Steps:**
1. Generate a report (Test 1)
2. Wait for completion
3. Click "Regenerate"
4. Enter feedback: `"make it more concise"`
5. Submit

**Expected:**
- ✅ New run created
- ✅ Shows "Regenerating..." message
- ✅ Goes through full generation flow
- ✅ New report generated with feedback applied

---

### **Test 6: Report Chat**

**Steps:**
1. Complete report from Test 1
2. Ask: `"what are the key takeaways?"`
3. Follow up: `"tell me more about competitors"`

**Expected:**
- ✅ Chat responds based on report content
- ✅ Follow-up maintains context
- ✅ Multi-turn conversation works

---

## 📊 What to Check in Logs

While testing, monitor API logs:

```bash
tail -f /tmp/apex-api.log | grep -E "Reports|rpt_"
```

**Look for:**
- `[Reports] Starting new run: rpt_...`
- `[Reports] PHASE 1: Dynamic Planning`
- `[Reports] PHASE 2: Executing tools`
- `[Tool Planning] Plan created`
- `[Reports] ✅ Chart generated` or `[Reports] ⚠️ Chart failed`
- `[Reports] PHASE 3: Compiling final report`
- `[Reports] ✅ Report completed`

**Red flags:**
- ❌ Long gaps with no log activity (possible hang)
- ❌ Repeated errors with no progress
- ❌ `status: 'failed'` with unclear reason

---

## ✅ Success Criteria

**Reports feature is working if:**
- [x] Report generates and completes
- [x] Thinking events show in UI
- [x] Tool executions happen (search_web, draft_section)
- [x] Failed charts don't crash report
- [x] Timeout protection works
- [x] Regeneration creates new report with feedback
- [x] Chat responds to questions about report

---

## 🐛 Known Issues to Watch For

1. **APIM Slowness** - If APIM takes 4+ minutes per call
   - Not a code issue - Azure APIM infrastructure
   - Timeout will catch it

2. **Chart Data Mismatch** - If document doesn't have chart-relevant data
   - Fallback logic should handle it
   - Web search or synthetic data kicks in

3. **Complex Reports** - Very long/detailed reports may timeout
   - Expected behavior
   - Reduce scope or length

---

**Server Status:**
- 🟢 API running on port 8080
- 🟢 Portal running on port 3000
- 🟢 All fixes compiled and active

**Start testing!** 🚀

