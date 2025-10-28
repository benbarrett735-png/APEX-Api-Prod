# Reports Mode - Intelligent Tool-Based Rebuild

**Date:** October 26, 2025  
**Status:** ✅ COMPLETE  
**Alignment:** Per Kevin's plan - Thin proxy pattern, JWT auth, standalone API

---

## Overview

Complete rebuild of Reports mode using the same intelligent tool-based thinking system as Research mode, but optimized for comprehensive report generation with integrated chart visualizations.

---

## The Challenge

**Old System Issues:**
- ❌ Generic, templated planning (not specific to user's goal)
- ❌ Not data-driven (didn't use document content effectively)
- ❌ Fixed structure regardless of goal
- ❌ Charts were often decorative, not valuable
- ❌ Polling-based UI (slow, no real-time feedback)

**What We Kept:**
- ✅ ChartService (working chart generation)
- ✅ 17 chart types (bar, line, pie, heatmap, etc)
- ✅ UI inputs (length, focus, chart selection)

---

## The New System

### 1. Intelligent Planning (APIM-Driven)

APIM analyzes:
- User's goal
- Report length (short/medium/long)
- Report focus
- Requested charts
- Uploaded documents (full content)

Then creates a **SPECIFIC execution plan** with tool calls:
- `analyze_documents` - Extract insights from uploads
- `search_web` - Find additional data/benchmarks
- `generate_chart` - Create visualizations
- `draft_section` - Write report sections
- `compile_report` - Assemble final output

### 2. Tool-Based Execution

Each tool is executed sequentially:
- Document analysis uses full ADI-extracted content
- Web search finds missing data/benchmarks
- Charts are generated from combined document + web data
- Sections are written with APIM using all available context
- Final report assembles everything with proper formatting

### 3. Integrated Chart Generation

- **Keeps ChartService** - No changes to working system
- Charts are planned based on available data
- If data is missing, searches for it externally
- Charts embedded in report markdown with context
- 17 chart types available

### 4. SSE Streaming UI

- Real-time progress updates
- Shows tool calls and reasoning
- Displays thinking process (like Research mode)
- Final output in grey box with Copy/Save
- No polling required

---

## Architecture

### Backend API

**New Files:**
```
src/routes/reports.ts
  ├── POST /reports/generate
  │   ├── Receives: goal, reportLength, reportFocus, selectedCharts, uploaded_files
  │   ├── Creates run record in o1_research_runs table
  │   └── Starts async generation
  │
  └── GET /reports/stream/:runId
      ├── SSE endpoint for real-time updates
      ├── Events: report.init, report.progress, report.completed
      └── Polls database for progress updates

createReportPlan(goal, files, length, focus, charts)
  ├── Constructs APIM prompt with tools
  ├── Analyzes user intent and data gaps
  ├── Returns: { understanding, toolCalls[] }
  └── Fallback plan if APIM fails

generateReportAsync(runId, ...)
  ├── Phase 1: Create plan
  ├── Phase 2: Execute tools
  │   ├── analyze_documents
  │   ├── search_web
  │   ├── generate_chart (ChartService)
  │   ├── draft_section (APIM)
  │   └── compile_report
  └── Phase 3: Save to database
```

**Modified Files:**
```
src/index.ts
  └── app.use("/reports", reportsRouter)
```

### Portal Frontend

**New Files:**
```
pages/api/reports/generate.ts
  └── Thin proxy with JWT auth (per Kevin's plan)

pages/api/reports/stream/[runId].ts
  └── SSE stream proxy with JWT auth
```

**Modified Files:**
```
pages/chat.tsx
  ├── Reports mode routes through new system
  ├── SSE event listeners: report.init, report.progress, report.completed
  ├── Thinking UI display
  └── Grey box output with Copy/Save
```

---

## How It Works

### Example Flow: "Sales Report with Bar Chart"

**User Input:**
- Goal: "Sales report for Q4 2024"
- Length: medium
- Focus: "financial performance"
- Charts: bar, line
- Files: sales_data.pdf

**Phase 1: Intelligent Planning**

APIM creates specific plan:
```json
{
  "understanding": {
    "coreSubject": "Q4 2024 sales performance",
    "reportType": "analytical",
    "keyQuestions": ["What were Q4 sales?", "How did we perform?"],
    "dataGaps": ["industry benchmarks", "competitor data"],
    "chartOpportunities": [
      {"type": "bar", "purpose": "Q4 revenue by month"},
      {"type": "line", "purpose": "sales trend over year"}
    ]
  },
  "toolCalls": [
    {
      "tool": "analyze_documents",
      "parameters": {"focus": "Q4 sales metrics and performance"},
      "reasoning": "extract Q4 data from uploaded sales report"
    },
    {
      "tool": "search_web",
      "parameters": {"searchQuery": "Q4 2024 sales industry benchmarks"},
      "reasoning": "get benchmarks for comparison"
    },
    {
      "tool": "generate_chart",
      "parameters": {
        "chartType": "bar",
        "dataNeeded": "Q4 monthly revenue",
        "goal": "show Q4 revenue breakdown"
      },
      "reasoning": "visualize Q4 performance"
    },
    {
      "tool": "generate_chart",
      "parameters": {
        "chartType": "line",
        "dataNeeded": "annual sales trend",
        "goal": "show year-over-year growth"
      },
      "reasoning": "show sales trajectory"
    },
    {
      "tool": "draft_section",
      "parameters": {
        "sectionName": "Executive Summary",
        "content": "high-level Q4 performance overview"
      },
      "reasoning": "start with summary"
    },
    {
      "tool": "draft_section",
      "parameters": {
        "sectionName": "Q4 Analysis",
        "content": "detailed Q4 metrics and trends"
      },
      "reasoning": "analyze the data"
    },
    {
      "tool": "draft_section",
      "parameters": {
        "sectionName": "Recommendations",
        "content": "actionable next steps based on Q4"
      },
      "reasoning": "provide guidance"
    },
    {
      "tool": "compile_report",
      "parameters": {
        "structure": ["Executive Summary", "Q4 Analysis", "Recommendations"]
      },
      "reasoning": "assemble final report"
    }
  ]
}
```

**Phase 2: Execution**

1. **analyze_documents:**
   ```
   FROM: sales_data.pdf (full ADI content)
   EXTRACT:
   - Q4 revenue: $5.2M
   - Q4 growth: +15% vs Q3
   - Top product: Widget X ($2.1M)
   - Regional breakdown
   ```

2. **search_web:**
   ```
   QUERY: "Q4 2024 sales industry benchmarks"
   FINDINGS:
   - Industry avg growth: +12%
   - Leading companies: +20%
   - Our position: above average
   ```

3. **generate_chart (bar):**
   ```
   DATA: Oct ($1.5M), Nov ($1.8M), Dec ($1.9M)
   CHART: /charts/bar_1730000000.png
   ```

4. **generate_chart (line):**
   ```
   DATA: Q1-Q4 revenue trend
   CHART: /charts/line_1730000001.png
   ```

5. **draft_section (Executive Summary):**
   ```
   APIM generates:
   "Q4 2024 delivered strong results with $5.2M in revenue,
   representing 15% growth over Q3. This exceeds the industry
   average of 12% growth, positioning us favorably..."
   ```

6. **draft_section (Q4 Analysis):**
   ```
   APIM generates detailed analysis using:
   - Document data (Q4 metrics)
   - Web findings (benchmarks)
   - Chart references
   ```

7. **draft_section (Recommendations):**
   ```
   APIM generates:
   1. Focus on Widget X expansion (top performer)
   2. Replicate Q4 strategies in Q1
   3. Target 20% growth to match leaders
   ```

**Phase 3: Compilation**

Final report:
```markdown
# Sales Report for Q4 2024

**Report Type:** analytical
**Generated:** 10/26/2025

---

## Executive Summary

Q4 2024 delivered strong results with $5.2M in revenue...

## Q4 Analysis

### Performance Metrics
...

### Benchmark Comparison
...

## Data Visualizations

### Q4 Revenue Breakdown

![bar chart](/charts/bar_1730000000.png)

### Annual Sales Trend

![line chart](/charts/line_1730000001.png)

## Recommendations

1. Focus on Widget X expansion...
2. Replicate Q4 strategies...
3. Target 20% growth...

## Sources

1. Search: "Q4 2024 sales industry benchmarks"
2. Uploaded: sales_data.pdf
```

**Portal Display:**
- Thinking process visible during execution
- Tool calls shown with reasoning
- Final report in grey box
- Copy/Save buttons available

---

## Key Improvements

| Feature | Old System | New System |
|---------|-----------|------------|
| Planning | Generic templates | APIM-driven, specific to goal |
| Structure | Fixed | Adaptive (short/medium/long) |
| Data Use | Superficial | Deep analysis of docs + web |
| Charts | Often decorative | Intelligently planned, data-driven |
| Execution | Black box | Transparent (SSE streaming) |
| UI Feedback | Polling (slow) | Real-time SSE |
| Output Quality | Generic | Professional, specific |
| Save/Share | Limited | Copy/Save to files |

---

## Report Features

### Data-Driven
- ✅ Analyzes full ADI-extracted content from uploads
- ✅ Searches web for missing data/benchmarks
- ✅ Combines document + web sources
- ✅ Cites sources

### Chart Integration
- ✅ 17 chart types (bar, line, pie, heatmap, radar, funnel, sankey, treemap, sunburst, candlestick, gantt, flow, stackbar, wordcloud, etc)
- ✅ Intelligent data sourcing (docs + web)
- ✅ Charts placed with context
- ✅ Images embedded in markdown

### Adaptive Structure
- ✅ Short: 2-3 sections
- ✅ Medium: 4-6 sections
- ✅ Long: 7-10 sections
- ✅ Section names based on goal/focus
- ✅ Professional formatting

### Quality
- ✅ Specific to user's goal (not generic)
- ✅ Uses real data from docs/web
- ✅ Actionable recommendations
- ✅ Proper markdown formatting
- ✅ Source citations

---

## Database Schema

Uses existing `o1_research_runs` table (same as Research/Templates):

```sql
o1_research_runs
  ├── id (VARCHAR) - run identifier
  ├── user_id (VARCHAR) - from JWT
  ├── query (TEXT) - report goal
  ├── depth (VARCHAR) - report length
  ├── status (VARCHAR) - running/completed/failed
  ├── metadata (JSONB) - mode, focus, charts, etc
  ├── report_content (TEXT) - final markdown
  └── created_at, updated_at (TIMESTAMP)
```

Metadata structure for reports:
```json
{
  "mode": "report",
  "reportFocus": "financial performance",
  "selectedCharts": ["bar", "line"],
  "uploadIds": ["..."],
  "currentStep": 3,
  "totalSteps": 8,
  "currentMessage": "Generating bar chart...",
  "completed_at": "2025-10-26T..."
}
```

---

## API Endpoints

### POST /reports/generate

**Request:**
```json
{
  "goal": "Sales report for Q4 2024",
  "reportLength": "medium",
  "reportFocus": "financial performance",
  "selectedCharts": ["bar", "line"],
  "uploaded_files": [
    {
      "uploadId": "...",
      "fileName": "sales_data.pdf",
      "content": "... full ADI-extracted text ..."
    }
  ]
}
```

**Response:**
```json
{
  "run_id": "rpt_1730000000_abc123",
  "status": "running",
  "message": "Report generation started"
}
```

### GET /reports/stream/:runId

**SSE Events:**

```
event: report.init
data: {"run_id": "rpt_...", "goal": "...", "length": "medium", "status": "running"}

event: report.progress
data: {"step": 1, "total": 8, "message": "Creating report plan..."}

event: report.progress
data: {"step": 2, "total": 8, "message": "Analyzing documents..."}

event: report.progress
data: {"step": 3, "total": 8, "message": "Searching web for benchmarks..."}

event: report.progress
data: {"step": 4, "total": 8, "message": "Generating bar chart..."}

event: report.completed
data: {"run_id": "rpt_...", "report_content": "# Sales Report...", "status": "completed"}
```

---

## Testing

### Test Scenario 1: Simple Report with Charts

**Steps:**
1. Go to chat
2. Click "Agent" → "Reports"
3. Select charts: bar, line
4. Set length: medium
5. Set focus: "financial performance"
6. Enter: "Sales report for Q4 2024"
7. Hit send

**Expected:**
- ✅ Shows "Creating report plan..."
- ✅ Displays thinking process
- ✅ Shows tool calls (search, chart, draft)
- ✅ Generates 2 charts (bar, line)
- ✅ Creates 4-6 section report
- ✅ Final report in grey box
- ✅ Copy/Save buttons work

### Test Scenario 2: Report with Uploaded Document

**Steps:**
1. Upload document (e.g. financial_report.pdf)
2. Wait for ADI processing
3. Select charts: pie, bar
4. Set length: long
5. Enter: "Analyze the financial data"
6. Hit send

**Expected:**
- ✅ Analyzes uploaded document FIRST
- ✅ Extracts specific insights/data
- ✅ Creates charts from document data
- ✅ Searches for benchmarks
- ✅ Comprehensive 7-10 section report
- ✅ Data-driven, specific content

### Test Scenario 3: Save to Files

**Steps:**
1. Generate any report
2. Wait for completion (grey box)
3. Click "Save" button
4. Go to /files page
5. Click "Generated" tab
6. Find your report
7. Click to open

**Expected:**
- ✅ Save succeeds
- ✅ Appears in files list with proper name
- ✅ Opens in new tab
- ✅ Can download (Cmd+S)

---

## Alignment with Kevin's Plan

✅ **Thin Proxy Pattern**
- Portal proxies are simple forwards with JWT
- All business logic in API

✅ **JWT Authentication**
- All routes protected with requireAuth middleware
- User ID extracted from JWT

✅ **Standalone API**
- No coupling to Portal
- Can be used by any client

✅ **Existing Database Schema**
- Uses `o1_research_runs` table
- No new migrations required

✅ **Production-Ready**
- Error handling and fallbacks
- Progress tracking
- Proper logging

---

## Chart Types Available

**Working (17 types):**
- bar, line, area, pie
- scatter, bubble, heatmap
- radar, funnel, sankey
- treemap, sunburst
- candlestick, gantt, flow
- stackbar, wordcloud

**Integration:**
- All types work through ChartService
- Can use document data
- Can search external data
- Embedded in report markdown
- Images served via `/charts/serve/:filename`

---

## Summary

Reports mode has been completely rebuilt to use intelligent tool-based planning and execution, matching the quality and UX of Research mode while maintaining the excellent chart generation capabilities of the old system.

**Key Wins:**
- 🧠 Intelligent APIM planning
- 📊 Data-driven from docs + web
- 📈 17 chart types integrated
- ⚡ Real-time SSE streaming
- 💾 Copy/Save functionality
- 🎯 Professional, specific output
- ✅ Per Kevin's plan (thin proxy, JWT auth)

The system is production-ready and can handle reports of any complexity with adaptive structure, comprehensive data analysis, and intelligent chart integration.

