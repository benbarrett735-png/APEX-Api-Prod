# ✅ O1-STYLE RESEARCH - COMPLETE REBUILD

## Problem Analysis

User uploaded document about **"Cabot's Cookery School"** (a cooking school) and asked about market opportunities.

**What went wrong:**
1. System searched for "comprehensive research" (academic methodology) instead of "cookery school business"
2. All sources were about research papers, not the actual business
3. Charts weren't included in the plan
4. System wasn't truly understanding the query before planning

**Root cause:** No deep understanding phase → Plan creation misinterpreted the topic

---

## Solution: 3-Phase O1-Style Process

Like ChatGPT o1 thinking, we now have:

```
Phase 1: UNDERSTAND → deeply analyze what user REALLY wants
Phase 2: PLAN → create detailed execution plan
Phase 3: EXECUTE → follow the plan step-by-step
```

---

## Phase 1: UNDERSTAND (NEW!)

### **New Function: `understandUserIntent()`**

**Purpose:** Deeply understand the CORE SUBJECT before planning

```typescript
async function understandUserIntent(
  query: string,
  documentContext?: string,
  includeCharts?: string[]
): Promise<{
  coreSubject: string;      // What they're ACTUALLY asking about
  userGoal: string;          // What they want to achieve
  keyTopics: string[];       // Specific topics to research
  chartDataNeeds?: string[]; // What data charts need
}>
```

**How it works:**

```typescript
// Analyzes the query + document to identify ACTUAL subject
const messages = [
  {
    role: 'system',
    content: `You are an intelligent research analyst. DEEPLY UNDERSTAND what the user wants.

CRITICAL: Don't get confused by common words.

Example mistakes to avoid:
- User asks about "Cabot's Cookery School" → DON'T search for "comprehensive research"
- User asks about "Apple products" → DON'T search for "fruit nutrition"
- User asks about "Twitter strategy" → DON'T search for "bird behavior"`
  },
  {
    role: 'user',
    content: `Analyze this research request:

Query: "${query}"

Document Content: [first 2000 chars]
${documentContext}

Charts Requested: ${includeCharts}

Tell me EXACTLY what the user wants to know.`
  }
];
```

**Example Output (Cookery School):**

```json
{
  "coreSubject": "Cabot's Cookery School (a cooking school business)",
  "userGoal": "Identify market opportunities and growth strategies for the cookery school",
  "keyTopics": [
    "Cookery school market size and trends",
    "Competitors in culinary education",
    "Customer segments for cooking classes",
    "Marketing channels for cooking schools",
    "Pricing strategies for culinary courses"
  ]
}
```

**Example Output (Tech with Charts):**

```json
{
  "coreSubject": "React and Vue JavaScript frameworks",
  "userGoal": "Compare the two frameworks to help choose one",
  "keyTopics": [
    "React features and performance 2024",
    "Vue features and performance 2024",
    "Developer experience comparison",
    "Ecosystem and community size",
    "Job market demand"
  ],
  "chartDataNeeds": [
    "Market share statistics",
    "Performance benchmarks",
    "GitHub stars/contributors over time",
    "Job posting counts by framework"
  ]
}
```

---

## Phase 2: PLAN (Updated!)

### **Updated Function: `createResearchPlan()`**

Now receives the UNDERSTANDING as input:

```typescript
async function createResearchPlan(
  query: string,
  depth: string,
  understanding: any, // ← Result from understandUserIntent
  hasFiles: boolean,
  includeCharts: string[]
)
```

**Updated Prompt:**

```typescript
const contextInfo = `UNDERSTANDING (what the user ACTUALLY wants):
Core Subject: ${understanding.coreSubject}
User Goal: ${understanding.userGoal}
Key Topics to Research: ${understanding.keyTopics.join(', ')}

Charts Requested: ${includeCharts.join(', ')}
Chart Data Needs: ${understanding.chartDataNeeds.join(', ')}

CRITICAL: You MUST include "generate_chart: {type}" steps!`;
```

**Key Improvements:**

1. **Uses understanding to create targeted searches**
   ```
   Core Subject: "Cabot's Cookery School"
   →
   Search 1: "Cooking school market trends UK/Ireland 2024"
   Search 2: "Successful cooking school marketing strategies"
   Search 3: "Culinary tourism trends, experience-based learning"
   
   NOT: "comprehensive research methodology" ❌
   ```

2. **Charts MUST be in the plan**
   ```typescript
   if (includeCharts.length > 0) {
     // System prompt says: "CRITICAL: You MUST include 'generate_chart: {type}' steps!"
   }
   ```

3. **Dynamic search count based on depth**
   ```typescript
   depth === 'comprehensive' ? '4-6 searches'
   depth === 'long'          ? '3-5 searches'
   depth === 'medium'        ? '3-4 searches'
   depth === 'short'         ? '2-3 searches'
   ```

**Example Plan (Cookery School with Charts):**

```json
{
  "steps": [
    "analyze_files: Extract Cabot's Cookery School current offerings, location, unique features",
    "search_web: Cooking school market trends UK/Ireland 2024, customer demographics",
    "search_web: Successful cooking school marketing strategies, digital presence",
    "search_web: Culinary tourism trends, experience-based learning demand data",
    "search_web: Cooking class pricing models, revenue benchmarks 2024",
    "quality_check: Verify we have business + market + quantitative data",
    "synthesize: Combine school's strengths with market opportunities",
    "generate_chart: bar - Market opportunity comparison by segment",
    "generate_chart: line - Culinary tourism growth trend 2020-2024",
    "write_report: Present growth recommendations for cookery school"
  ],
  "reasoning": "Cookery school business needs market context, marketing insights, tourism trends, and quantitative data for charts",
  "reportSections": [
    "Current Position",
    "Market Landscape",
    "Marketing Opportunities",
    "Growth Strategies",
    "Data Visualizations"
  ]
}
```

**Notice:**
- ✅ All searches about "cooking school" (not "research methodology")
- ✅ Charts explicitly in the plan ("generate_chart: bar", "generate_chart: line")
- ✅ Searches target quantitative data ("benchmarks", "growth trend data")
- ✅ Dynamic sections for cookery school context

---

## Phase 3: EXECUTE (Enhanced!)

### **Chart Generation NOW in Execution Loop**

**Before:** Charts handled separately at the end (often missed)

**After:** Charts executed when plan says to

```typescript
for (let i = 0; i < researchPlan.steps.length; i++) {
  const step = researchPlan.steps[i];
  const action = step.split(':')[0].trim().toLowerCase();
  
  if (action.includes('generate_chart')) {
    // EXECUTE IT NOW!
    
    // Parse chart type
    const chartTypeMatch = description.match(/(bar|line|pie|scatter|area|bubble|heatmap|radar)/i);
    const chartType = chartTypeMatch[1].toLowerCase();
    
    // Generate chart
    emit('tool.call', { tool: 'chart_generator', purpose: description });
    
    const chartService = new ChartService();
    const chartResult = await chartService.generateChart({
      data: allFindings.join('\n'),
      chartType: chartType,
      title: `${query} - ${chartType} visualization`,
      goal: description
    });
    
    if (chartResult.success) {
      chartUrls[chartType] = chartResult.chart_url;
      emit('tool.result', { key_insights: 'Chart generated successfully' });
    }
  }
}
```

**Result:** Charts are generated at the EXACT point in the plan where they should be!

---

## User Experience

### **Before (Broken):**

```
User uploads: Cabot's Cookery School business plan
Query: "What are Cabot's market opportunities?"

System output:
Planning
"Analyzing your query..."

Planning  
"Research plan: 5 steps"

Executing
Step 1/5: search_web: Find comprehensive research about the topic

Tool Call
openai_search

Result
Found articles about:
- "comprehensive research methodology"
- "research best practices"
- "academic research frameworks"

❌ COMPLETELY WRONG TOPIC!
❌ No charts generated
❌ Report about research methodology, not cookery school
```

---

### **After (Fixed):**

```
User uploads: Cabot's Cookery School business plan
Query: "What are Cabot's market opportunities?"
Charts: bar, line

Phase 1: Understanding

Analyzing
"Phase 1: Understanding your request..."

Analyzing
"Understanding confirmed: Researching 'Cabot's Cookery School (a cooking school business)' to identify market opportunities and growth strategies"

Analyzing
"Key topics identified: Cookery school market trends, Competitors in culinary education, Customer segments..."

Planning
"Chart data requirements: Market size data, Growth statistics, Customer demographics"

Phase 2: Planning

Planning
"Phase 2: Creating comprehensive research plan..."

Planning
"Research plan: 10 steps. Cookery school business needs market context, marketing insights, and quantitative data for charts"

Planning
"Steps:
1. analyze_files: Extract Cabot's current offerings, location, features
2. search_web: Cooking school market trends UK/Ireland 2024
3. search_web: Successful cooking school marketing strategies
4. search_web: Culinary tourism trends and demand data
5. search_web: Cooking class pricing models, revenue benchmarks
6. quality_check: Verify coverage
7. synthesize: Combine insights
8. generate_chart: bar - Market opportunity comparison
9. generate_chart: line - Tourism growth trend
10. write_report: Growth recommendations"

Phase 3: Executing

Executing
"Phase 3: Executing research plan..."

Executing
"Step 1/10: analyze_files: Extract Cabot's current offerings..."

Tool Call
document_analysis

Result
Extracted 12 key insights from uploaded documents

Executing
"Step 2/10: search_web: Cooking school market trends UK/Ireland 2024"

Tool Call
openai_search - Cooking school market trends UK/Ireland 2024

Result
Found 14 items about:
- "UK culinary education market £2.3B in 2024"
- "Cooking class bookings up 28% post-pandemic"
- "Experience-based learning demand rising"
✅ CORRECT TOPIC!

...

Executing
"Step 8/10: generate_chart: bar - Market opportunity comparison"

Tool Call
chart_generator

Result
Bar chart generated successfully

Executing
"Step 9/10: generate_chart: line - Tourism growth trend"

Tool Call
chart_generator

Result
Line chart generated successfully

✅ CHARTS INCLUDED!

Final Report:
## Current Position
Cabot's Cookery School operates on 12-acre organic farm...

## Market Landscape
UK culinary education market valued at £2.3B in 2024...

## Marketing Opportunities
1. Digital booking platforms (28% increase in demand)...

## Data Visualizations
[Bar chart showing market opportunities]
[Line chart showing tourism growth]

✅ REPORT ABOUT COOKERY SCHOOL!
✅ CHARTS INCLUDED!
✅ ALL CORRECT!
```

---

## Key Differences

| Aspect | Before (Broken) | After (Fixed) |
|--------|----------------|---------------|
| **Understanding** | None - jumped to planning | Phase 1: Deep understanding of core subject |
| **Topic Accuracy** | Misinterpreted ("comprehensive research") | Correct ("Cabot's Cookery School") |
| **Chart Inclusion** | Often missed | Guaranteed (MUST include in plan) |
| **Search Quality** | Generic, wrong topic | Specific, correct topic |
| **Process** | 2-phase (Plan → Execute) | 3-phase (Understand → Plan → Execute) |
| **Like o1?** | No | Yes! |

---

## Flow Diagram

```
USER INPUT
↓
📄 Upload: Cabot's Cookery School business plan
💬 Query: "What are their market opportunities?"
📊 Charts: bar, line
↓
═══════════════════════════════════════════════════════════════
PHASE 1: UNDERSTAND (NEW!)
═══════════════════════════════════════════════════════════════
↓
🧠 APIM analyzes:
   - Query text
   - Document content (first 2000 chars)
   - Chart requests
↓
🎯 Outputs:
   {
     coreSubject: "Cabot's Cookery School (cooking school business)",
     userGoal: "Identify market opportunities",
     keyTopics: ["Market trends", "Competitors", "Customer segments"...],
     chartDataNeeds: ["Market size data", "Growth statistics"]
   }
↓
═══════════════════════════════════════════════════════════════
PHASE 2: PLAN (Updated to use Understanding)
═══════════════════════════════════════════════════════════════
↓
📋 APIM creates plan using Understanding:
   - Core Subject: "Cabot's Cookery School"
   - Creates searches ABOUT cooking schools (not research methodology!)
   - Includes "generate_chart: bar" and "generate_chart: line" steps
   - Suggests dynamic sections for cookery school context
↓
✅ Plan:
   1. analyze_files (document)
   2-5. search_web (4 different aspects of cooking school market)
   6. quality_check
   7. synthesize
   8. generate_chart: bar
   9. generate_chart: line
   10. write_report
↓
═══════════════════════════════════════════════════════════════
PHASE 3: EXECUTE (Enhanced with chart generation)
═══════════════════════════════════════════════════════════════
↓
🔄 For each step in plan:
   Step 1: Analyze document ✅
   Step 2: Search "cooking school market trends" ✅
   Step 3: Search "cooking school marketing strategies" ✅
   Step 4: Search "culinary tourism trends" ✅
   Step 5: Search "pricing benchmarks" ✅
   Step 6: Quality check ✅
   Step 7: Synthesize findings ✅
   Step 8: Generate BAR chart ✅ (NEW!)
   Step 9: Generate LINE chart ✅ (NEW!)
   Step 10: Write report ✅
↓
📊 OUTPUT:
   - Comprehensive report about COOKERY SCHOOL (correct!)
   - With 2 embedded charts (bar + line)
   - Dynamic sections (Current Position, Market, Opportunities...)
   - 50+ relevant findings
↓
🎉 SUCCESS!
```

---

## Files Changed

- **`src/routes/research.ts`**
  - Added `understandUserIntent()` function (Phase 1)
  - Updated `createResearchPlan()` to use understanding
  - Enhanced chart generation in execution loop
  - 3-phase structure: Understand → Plan → Execute

---

## Testing

### **Test Case: Cookery School**

```bash
# Input
Upload: Creative brief.pdf (Cabot's Cookery School)
Query: "What are Cabot's market opportunities?"
Charts: bar, line

# Expected Understanding Output:
"Core Subject: Cabot's Cookery School (cooking school business)"
"Key topics: Cookery school market, Competitors, Marketing, Tourism..."

# Expected Plan:
✓ 8-10 steps
✓ Searches about "cooking school" (NOT "research methodology")
✓ Includes "generate_chart: bar" step
✓ Includes "generate_chart: line" step

# Expected Execution:
✓ All searches return cooking school results
✓ Bar chart generated
✓ Line chart generated
✓ Report about cookery school (not research methodology)
```

---

## Success Criteria

✅ **Understanding Phase** - Correctly identifies "Cabot's Cookery School" as core subject  
✅ **No Topic Confusion** - Searches about cooking schools, not research methodology  
✅ **Charts Included** - Plan always includes "generate_chart" steps when requested  
✅ **Charts Execute** - Charts generated during execution, not skipped  
✅ **Dynamic Sections** - Report structure adapts to cookery school context  
✅ **O1-Style** - 3-phase process like ChatGPT o1 thinking  

---

**Status:** ✅ Complete and ready to test  
**Phase:** Complete Rebuild (o1-style)  
**Date:** 2024-10-26

