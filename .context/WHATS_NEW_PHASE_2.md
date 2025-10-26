# What's New: Dynamic Planning + Inline Display

**Date:** October 26, 2025  
**Status:** ✅ Complete and Running

---

## 🎯 What You Asked For

> "ok also is the plan always twn steps it should be dynamic it shoudl make a new plan base on every prompt it kinda skips to the open ai search not ot is that just speed but yeah different plans different steps, also put it into the chat not its own scroll box"

---

## ✅ What's Fixed

### 1. **Dynamic Planning** (API Side)
**Before:** Every query = 10 steps (hardcoded)  
**Now:** Steps calculated based on:
- Query type (comparison, history, analysis, data)
- Depth setting (short=5, medium=7, long=9, comprehensive=12)
- File uploads (+2 steps)
- Query complexity (+1-2 steps)

**Examples:**
```
"Compare React vs Vue" → 9 steps (7 base + 2 for comparison)
"History of AI" → 9 steps (7 base + 2 for timeline)
"Analyze Tesla strategy" → 8 steps (7 base + 1 for analysis)
"What is ML?" → 7 steps (medium depth, straightforward)
```

**Code:** `src/routes/research.ts` lines 276-310

---

### 2. **Inline Thinking Display** (Portal Side)
**Before:** Thinking in separate scroll box (`max-h-[500px] overflow-y-auto`)  
**Now:** Flows naturally in chat message

**Changes:**
- ❌ Removed: Separate scrollable container
- ✅ Added: Compact header (status + step count in one line)
- ✅ Reduced padding on all activity items
- ✅ Border-left accent instead of full boxes
- ✅ Activities scroll with chat naturally

**Code:** `components/chat/ResearchThinking.tsx`

---

## 🧪 Test It Now

**Both servers running:**
- API: http://localhost:8080
- Portal: http://localhost:3000

**Try these queries to see dynamic planning:**

1. **"Compare Python vs JavaScript"**
   - Should say: "Comparative analysis. Planning 9 research steps"
   - Should show thinking inline in chat (no scroll box)

2. **"History of artificial intelligence"**
   - Should say: "Historical research. Planning 9 research steps"
   - Should include "Historical Context" section

3. **"Analyze Tesla's market strategy"**
   - Should say: "Deep analysis. Planning 8 research steps"
   - Should include "Detailed Analysis" section

4. **"What is quantum computing?"**
   - Should say: "Informational research. Planning 7 research steps"
   - Standard sections only

---

## 📊 What Sections Get Generated

Dynamic sections based on query type:

| Query Type | Added Section | Example |
|------------|--------------|---------|
| Comparison (`compare`, `vs`) | "Comparative Analysis" | "React vs Vue" |
| Historical (`history`, `timeline`) | "Historical Context" | "History of AI" |
| Analysis (`analyze`, `breakdown`) | "Detailed Analysis" | "Analyze Tesla" |
| Data (`data`, `statistics`) | "Data & Metrics" | "AI adoption stats" |

**All queries get:**
- Executive Summary
- Key Findings
- Recommendations
- Conclusion
- Sources

---

## 📁 Files Changed

### API Repo (`APEX-Api-Prod`)
```
MODIFIED:
- src/routes/research.ts (Lines 265-420)
  - Query analysis logic
  - Dynamic step calculation
  - Dynamic section generation

NEW:
- .context/DYNAMIC_PLANNING_UPDATE.md
- .context/WHATS_NEW_PHASE_2.md (this file)
```

### Portal Repo (`APEX-Portal-Prod-3`)
```
MODIFIED:
- components/chat/ResearchThinking.tsx
  - Removed scroll container
  - Compact inline layout
  - Border-left accents
```

---

## 🚀 Commits

### API
```
feat: Dynamic research planning based on query type

Issues fixed:
- Plans are no longer fixed at 10 steps
- Each query analyzed for type (comparison, timeline, analysis, data)
- Step count calculated dynamically (5-14 steps based on depth + query type)
- Sections generated based on query needs
```

### Portal
```
fix: Display research thinking inline in chat (no scroll box)

Changes:
- Removed separate scrollable container (max-h-[500px] overflow-y-auto)
- Made header compact (status + step count in one line)
- Reduced padding/spacing on all activity items
- Activities now flow naturally in chat message
- Border-left accent instead of full boxes for tool calls/results
```

---

## ⏭️ Next Steps

**Pending (choose priority):**

1. **Charts Integration**
   - Use `include_charts` from Portal request
   - Generate charts/graphs in reports
   - Display charts in report output

2. **Phase 3: Continuous Reasoning**
   - Self-critique loops
   - Adaptive plan adjustments
   - True o1-style pivoting

**Which should I prioritize?**

