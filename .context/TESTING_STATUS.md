# CHART TESTING STATUS

**Date:** 2025-10-26  
**Total Charts:** 18  
**Tested & Working:** 10  
**Remaining to Test:** 8

---

## ✅ CONFIRMED WORKING (10/18)

User tested with "ai usage in the last year":

1. **PIE** ✅
2. **SCATTER** ✅
3. **TREEMAP** ✅ (fixed root→items)
4. **SANKEY** ✅ (fixed prompt + user prompt)
5. **BAR** ✅
6. **RADAR** ✅
7. **FUNNEL** ✅
8. **GANTT** ✅ (fixed prompt + user prompt)
9. **LINE** ✅
10. **HEATMAP** ✅ (fixed field names: x, y, values)

---

## ⏳ REMAINING TO TEST (8/18)

### Recently Fixed (High Priority)
11. **CANDLESTICK** - Simplified prompt, added user prompt
12. **FLOW** - Simplified prompt, added user prompt

### Should Be Working (No Issues Found)
13. **AREA** - Standard chart, should work
14. **BUBBLE** - Standard chart, should work
15. **STACKBAR** - Standard chart, should work
16. **THEMERIVER** - Standard chart, should work
17. **SUNBURST** - Has normalization, should work
18. **WORDCLOUD** - Has normalization, should work

---

## 🧪 HOW TO TEST

### Option 1: Automated Test Script

```bash
# Start the API
cd /Users/benbarrett/APEX-Api-Prod
npm run dev

# In another terminal, run the test script
cd /Users/benbarrett/APEX-Api-Prod
./test-remaining-charts.sh
```

**Script will test all 8 charts and show:**
- ✅ SUCCESS with chart URL
- ❌ FAILED with error message

---

### Option 2: Manual Testing via Frontend

Test each chart type in the UI with prompt: **"ai usage in the world"**

1. Go to your app
2. Request chart generation
3. Select chart type from dropdown
4. Enter prompt: "ai usage in the world"
5. Click generate
6. Check if chart appears or error shows

---

### Option 3: Manual cURL Commands

```bash
# Test AREA
curl -X POST http://localhost:3000/charts/generate \
  -H "Content-Type: application/json" \
  -d '{"chartType":"area","data":{},"goal":"ai usage in the world"}'

# Test BUBBLE
curl -X POST http://localhost:3000/charts/generate \
  -H "Content-Type: application/json" \
  -d '{"chartType":"bubble","data":{},"goal":"ai usage in the world"}'

# Test SUNBURST
curl -X POST http://localhost:3000/charts/generate \
  -H "Content-Type: application/json" \
  -d '{"chartType":"sunburst","data":{},"goal":"ai usage in the world"}'

# Test CANDLESTICK
curl -X POST http://localhost:3000/charts/generate \
  -H "Content-Type: application/json" \
  -d '{"chartType":"candlestick","data":{},"goal":"ai usage in the world"}'

# Test FLOW
curl -X POST http://localhost:3000/charts/generate \
  -H "Content-Type: application/json" \
  -d '{"chartType":"flow","data":{},"goal":"ai usage in the world"}'

# Test STACKBAR
curl -X POST http://localhost:3000/charts/generate \
  -H "Content-Type: application/json" \
  -d '{"chartType":"stackbar","data":{},"goal":"ai usage in the world"}'

# Test THEMERIVER
curl -X POST http://localhost:3000/charts/generate \
  -H "Content-Type: application/json" \
  -d '{"chartType":"themeriver","data":{},"goal":"ai usage in the world"}'

# Test WORDCLOUD
curl -X POST http://localhost:3000/charts/generate \
  -H "Content-Type: application/json" \
  -d '{"chartType":"wordcloud","data":{},"goal":"ai usage in the world"}'
```

---

## 📊 EXPECTED RESULTS

### All 8 Should Work Because:

1. **AREA, BUBBLE, STACKBAR, THEMERIVER**
   - Standard charts (x + series)
   - No complex prompts
   - No special structures
   - Should work like BAR, LINE, SCATTER ✅

2. **CANDLESTICK, FLOW**
   - Just fixed with simplified prompts
   - Added user prompt instructions
   - Same fixes that worked for SANKEY, GANTT ✅

3. **SUNBURST, WORDCLOUD**
   - Have normalization to fix APIM mistakes
   - Fallback data if needed
   - Should work like TREEMAP, FUNNEL ✅

---

## 🚨 IF ANY FAIL

### Check Logs For:
1. **APIM timeout** (after 30s)
   - Log: `[ChartService] APIM request timed out after 30s`
   - Solution: Prompt might still be too complex

2. **Python timeout** (after 60s)
   - Log: `[ChartService] Python execution timed out after 60s`
   - Solution: Python script might have issue

3. **Invalid JSON**
   - Log: `[ChartService] Failed to parse APIM response`
   - Log: `[ChartService] Raw content: ...`
   - Solution: Prompt mismatch, need to add user prompt

4. **Missing fields**
   - Log: `Python execution failed: missing X`
   - Solution: Normalization needs to create that field

---

## 📝 TESTING CHECKLIST

```
[ ] AREA
[ ] BUBBLE
[ ] SUNBURST
[ ] CANDLESTICK
[ ] FLOW
[ ] STACKBAR
[ ] THEMERIVER
[ ] WORDCLOUD
```

---

## ✅ SUCCESS CRITERIA

**All 8 charts should:**
1. Generate within 30-60 seconds
2. Return `{"success": true, "chart_url": "..."}`
3. Display a PNG chart image
4. Show relevant data about "ai usage in the world"

**If all pass:** 🎉 **18/18 CHARTS WORKING!**

---

## 🎯 FINAL MILESTONE

**Current:** 10/18 working (56%)  
**Target:** 18/18 working (100%)  
**Remaining:** 8 charts to verify

**Expected outcome:** All 8 should work based on the fixes applied ✅

