# CHART ISSUES ANALYSIS

**Date:** 2025-10-26  
**Issue:** FLOW getting 500 error even after fixes  
**Status:** Investigating

---

## 🚨 CURRENT PROBLEM

### FLOW Chart Failing
```
Error: APIM request failed: 500 - Internal server error
Chart Type: flow
Prompt: "ai usage recently"
```

**Despite fixes applied:**
- ✅ Simplified system prompt
- ✅ Added user prompt instructions
- ✅ Added timeout

**Still getting 500 from APIM**

---

## 🔍 POSSIBLE CAUSES

### 1. Vague Prompt + Flow Chart Mismatch
**Problem:** "ai usage recently" doesn't describe a process/flow
**APIM confusion:** How to create a flow chart from non-process data?

### 2. Empty Data Object
**Request sends:** `{"data": {}}`
**APIM might expect:** Some data to work with

### 3. Safety Filter
**Word "flow"** might trigger content filters in some contexts

### 4. Model Issues
GPT-4 occasionally has temporary issues with specific prompts

---

## 💡 POTENTIAL SOLUTIONS

### Option 1: Make FLOW user prompt even simpler
```typescript
if (chartType === 'flow') {
  prompt += `You MUST create a simple process flow diagram.
Even if the topic is not a process, create a generic 3-5 step flow.

Example for "ai usage": 
- Start → Data Collection → AI Processing → Results → End

Return ONLY this JSON structure (no explanations):
{
  "nodes": [
    {"id": "1", "label": "Start", "type": "start"},
    {"id": "2", "label": "Process", "type": "process"},
    {"id": "3", "label": "End", "type": "end"}
  ],
  "edges": [
    {"from": "1", "to": "2"},
    {"from": "2", "to": "3"}
  ]
}`;
}
```

### Option 2: Add fallback for FLOW
If APIM fails, return hardcoded generic flow

### Option 3: Skip APIM for FLOW entirely
Generate nodes/edges directly from any topic

---

## 📊 OTHER CHARTS TO CHECK

### Likely to Work (Standard Charts)
- **AREA** - Same as LINE (already working)
- **BUBBLE** - Same as SCATTER (already working)
- **STACKBAR** - Standard x/series
- **THEMERIVER** - Standard x/series

### Might Have Issues (Special Structure)
- **SUNBURST** - Requires hierarchical data (root/children)
- **CANDLESTICK** - Requires OHLC data (might be odd for "ai usage")
- **WORDCLOUD** - Requires words/weights
- **FLOW** - Currently failing 500

---

## 🎯 RECOMMENDED APPROACH

### Test in This Order:

1. **AREA, BUBBLE, STACKBAR, THEMERIVER** (should work - standard)
2. **WORDCLOUD** (has normalization)
3. **SUNBURST** (has normalization)
4. **CANDLESTICK** (might be weird for non-price data)
5. **FLOW** (currently broken, needs fix)

---

## 🔧 QUICK FIX FOR FLOW

Make the user prompt more directive and add explicit instruction to create a flow even from non-process topics:

```typescript
if (chartType === 'flow') {
  prompt += `Create a process flow diagram with nodes and edges.

IMPORTANT: Even if the topic is not a process, you MUST create a logical flow.
For example, "ai usage" could be: Research → Development → Testing → Deployment → Usage

Return this EXACT structure:
{
  "nodes": [
    {"id": "1", "label": "Step 1", "type": "start"},
    {"id": "2", "label": "Step 2", "type": "process"},
    {"id": "3", "label": "Step 3", "type": "process"},
    {"id": "4", "label": "Step 4", "type": "end"}
  ],
  "edges": [
    {"from": "1", "to": "2"},
    {"from": "2", "to": "3"},
    {"from": "3", "to": "4"}
  ]
}

Adapt the labels to the topic but keep this structure.`;
}
```

---

## 📝 ACTION ITEMS

1. ✅ Test AREA, BUBBLE, STACKBAR, THEMERIVER
2. ✅ Test WORDCLOUD, SUNBURST
3. ⏳ Fix FLOW prompt to be more directive
4. ⏳ Test CANDLESTICK (might need special handling)
5. ⏳ Add fallbacks for charts that struggle with vague prompts

---

## 🚀 NEXT STEPS

1. Update FLOW prompt with more explicit instructions
2. Test remaining 7 charts
3. Fix any that fail
4. Get to 18/18 working

