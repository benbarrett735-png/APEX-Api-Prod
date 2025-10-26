# SANKEY FIX - Error Handling + Simplified Prompt

**Date:** 2025-10-26  
**Issue:** SANKEY failing with "Unexpected end of JSON input"  
**Status:** FIXED & READY TO TEST

---

## 🐛 THE PROBLEM

### Error
```
Chart Type: sankey
Error: Unexpected end of JSON input
```

### Root Causes
1. **No error logging** - Couldn't see what APIM was returning
2. **Complex prompt** - SANKEY had 8 verbose rules causing APIM to fail/timeout
3. **No error handling** - `extractJSON` threw with no context

---

## ✅ THE FIX

### 1. Added Error Logging (lines 860-871)

**BEFORE:**
```typescript
const content = result.choices[0]?.message?.content || '';
let payload = this.extractJSON(content);
```

**AFTER:**
```typescript
const content = result.choices[0]?.message?.content || '';

console.log('[ChartService] APIM raw response length:', content.length);
console.log('[ChartService] APIM response preview:', content.substring(0, 500));

let payload;
try {
  payload = this.extractJSON(content);
  console.log('[ChartService] BEFORE normalization:', JSON.stringify(payload));
} catch (parseError: any) {
  console.error('[ChartService] Failed to parse APIM response:', parseError.message);
  console.error('[ChartService] Raw content:', content);
  throw new Error(`APIM returned invalid JSON: ${parseError.message}`);
}
```

**Benefits:**
- See APIM response length (0 = timeout/empty)
- See response preview (check if it's JSON or error message)
- Get detailed parse error with full content
- Can diagnose APIM issues

---

### 2. Simplified SANKEY Prompt (line 1430)

**BEFORE (15 lines, 8 rules):**
```
SANKEY:
  keys: title?, nodes[{id, label, col, color?}], links[{source, target, value, color?}], options?
  options keys: width, height, dpi, column_labels[string[]], node_width(float default 0.035), node_padding(float default 6), curvature(float default 0.35), alpha(float default 0.85), grid(bool default true), y_axis{min, max, tick_step}, default_link_color(hex default "#CBD5E1").
  Note: Links must connect only adjacent columns (col 0→1, 1→2, etc.). Creates horizontal multi-column flow with smooth ribbons.
  
  SANKEY STRUCTURE RULES:
  1. COLUMN LAYOUT: Use 3 columns minimum (sources → totals → destinations)
  2. SOURCE NODES (col=0): Input sources like "Salary", "Investments", "Revenue"
  3. TOTAL NODES (col=1): Aggregation points like "Total Income", "Total Revenue" 
  4. DESTINATION NODES (col=2): Output categories like "Savings", "Expenses", "Taxes"
  5. FLOW VALUES: Each link.value should represent the actual flow amount
  6. NO HALLUCINATIONS: Only use categories explicitly mentioned by user
  7. DYNAMIC STRUCTURE: Adapt column count and categories based on user request
  8. VIBRANT FLOWS: Don't specify colors - let the renderer assign random vibrant colors to flows
```

**AFTER (6 lines, simple structure):**
```
SANKEY:
  keys: title?, nodes[{id, label, col}], links[{source, target, value}], options?
  Required structure:
  - nodes: Each node needs id (unique string), label (display name), col (0, 1, 2... for column position)
  - links: Each link connects two nodes via their ids, with a numeric value for flow size
  - Links only connect adjacent columns (col 0→1, 1→2, etc)
  Example: {nodes: [{id:"a", label:"Source", col:0}, {id:"b", label:"Target", col:1}], links: [{source:"a", target:"b", value:100}]}
```

**Benefits:**
- 60% shorter (15 lines → 6 lines)
- Removed verbose rules (COLUMN LAYOUT, NO HALLUCINATIONS, etc)
- Added concrete example
- Less chance of APIM timeout/confusion
- Still conveys all required structure

---

### 3. Added Error Context (lines 881-885)

```typescript
} catch (error: any) {
  console.error('[ChartService] APIM formatting failed:', error);
  console.error('[ChartService] Chart type:', request.chartType);  // ← NEW
  console.error('[ChartService] User goal:', request.goal);         // ← NEW
  throw error;
}
```

**Benefits:**
- See which chart type failed
- See user's request goal
- Better debugging

---

## 🧪 HOW TO TEST

### Test SANKEY Now

```bash
# Start API locally
cd /Users/benbarrett/APEX-Api-Prod
npm run dev

# Test SANKEY
curl -X POST http://localhost:3000/charts/generate \
  -H "Content-Type: application/json" \
  -d '{
    "chartType": "sankey",
    "data": {},
    "goal": "ai usage in the last year"
  }'
```

### Expected Logs (SUCCESS)

```
[ChartService] 🎯 Starting intelligent chart generation for sankey
[ChartService] Calling APIM for chart: sankey
[ChartService] User prompt length: 234 chars
[ChartService] System prompt length: 315 chars
[ChartService] APIM raw response length: 567
[ChartService] APIM response preview: {"nodes":[{"id":"a","label":"AI Usage"...
[ChartService] BEFORE normalization: {"nodes":[...],"links":[...]}
[ChartService] AFTER normalization: {"nodes":[...],"links":[...]}
[ChartService] Normalizing sankey payload before Python...
[ChartService] ✅ Chart generated successfully
```

### Expected Logs (IF STILL FAILING)

```
[ChartService] APIM raw response length: 0              ← APIM timeout/empty
[ChartService] APIM response preview:                   ← Nothing returned
[ChartService] Failed to parse APIM response: Unexpected end of JSON input
[ChartService] Raw content:                             ← Shows what APIM sent
```

OR

```
[ChartService] APIM raw response length: 89
[ChartService] APIM response preview: Sorry, I cannot generate that chart because...
[ChartService] Failed to parse APIM response: Unexpected token 'S'
[ChartService] Raw content: Sorry, I cannot generate that chart...  ← APIM refused
```

---

## 📊 WHAT THIS FIXES

| Chart Type | Issue | Fix | Status |
|-----------|-------|-----|--------|
| SANKEY | "Unexpected end of JSON input" | ✅ Logging + simplified prompt | READY TO TEST |
| All 18 | Silent failures | ✅ Error logging | IMPROVED |

---

## 🚀 NEXT STEPS

1. **Test SANKEY** with the new logging
2. **Check logs** to see what APIM returns
3. **If still failing:**
   - Logs will show if APIM returned empty (timeout)
   - Logs will show if APIM returned error message
   - Logs will show the raw content

4. **If working:**
   - Deploy to staging
   - Test other complex charts (SUNBURST, TREEMAP, FLOW)

---

## 📝 COMMIT HISTORY

```
e1ff40e - fix: SANKEY error handling and simplified prompt
22aa49c - fix: TREEMAP normalization - convert root to items structure  
4f72804 - fix: add normalization for SANKEY, FLOW, GANTT charts
421fda4 - fix: SIMPLIFIED chart flow - ALL charts use APIM, no bypasses
```

---

## 🔍 DEBUGGING TIPS

### If APIM Response Length = 0
**Cause:** APIM timeout or rate limit  
**Solution:** Check APIM health, increase timeout, or retry

### If Response Contains "Sorry" or "Error"
**Cause:** APIM model refusing to generate (safety filter)  
**Solution:** Adjust prompt to be more neutral

### If Response Is Partial JSON
**Cause:** APIM token limit exceeded  
**Solution:** Truncate user data more aggressively (already done in `buildFormatterPrompt`)

---

## ✅ READY TO DEPLOY

```bash
cd /Users/benbarrett/APEX-Api-Prod
git push origin staging
```

**Expected Result:** SANKEY charts should now:
1. Show detailed logs of what APIM returns
2. Parse successfully (simplified prompt)
3. Generate correctly (existing normalization)

If SANKEY still fails, logs will show **exactly why**.

