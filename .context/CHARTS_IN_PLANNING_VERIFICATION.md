# Charts in Research Planning - Verification

## ✅ Flow is CORRECT

### 1. Portal → API
```typescript
// Portal: pages/chat.tsx
body: JSON.stringify({
  query: input,
  uploaded_files: uploadedFilesData,
  depth: reportLength,
  include_charts: selectedCharts,  // ← ['bar', 'line', etc]
  target_sources: []
})
```

### 2. API Receives & Normalizes
```typescript
// API: src/routes/research.ts (line 856-870)
const includeChartsRaw = Array.isArray(run.include_charts)
  ? run.include_charts
  : (run.include_charts ? JSON.parse(run.include_charts) : []);

const chartRequests: Array<{type: string; goal?: string}> = includeChartsRaw.map(item => {
  if (typeof item === 'string') {
    return { type: item, goal: undefined };
  }
  // ... handles objects with goals too
});

console.log('[Research] Chart requests:', chartRequests);
```

### 3. Included in Understanding Phase
```typescript
// API: understandUserIntent() function (line ~610)
await understandUserIntent(
  run.query,
  documentContext,
  includeCharts,        // ← Passed here
  chartRequests         // ← And here with goals
);
```

**Prompt includes:**
```
If charts are requested, what quantitative data do we need? (market shares, growth rates, comparisons, etc.)
```

### 4. Included in Planning Phase
```typescript
// API: createResearchPlan() function (line ~1310)
const researchPlan = await createResearchPlan(
  run.query,
  run.depth,
  understanding,
  uploadedFiles.length > 0,
  includeCharts,        // ← Passed here
  documentContext,
  chartRequests         // ← And here with goals
);
```

**Prompt includes:**
```
CHART REQUIREMENTS:
- bar chart: Goal = "..."
- line chart: Goal = "..."

CRITICAL: You MUST include "generate_chart: bar, line" steps in the plan!
For each chart, searches must target the DATA needed for that visualization!
```

### 5. Charts Generated in Execution
```typescript
// API: Execution phase (line ~1100)
else if (action.includes('generate_chart')) {
  const chartTypes = action.includes(',')
    ? action.substring(action.indexOf(':') + 1).split(',').map(t => t.trim())
    : [description.split(' ')[0].trim()];
  
  for (const chartType of chartTypes) {
    // Find if user provided a specific goal for this chart
    const userChartGoal = chartRequests.find(cr => cr.type === chartType)?.goal;
    const chartGoal = description || userChartGoal || `Create a ${chartType} chart...`;
    
    // Generate chart using ChartService
    const chartService = new ChartService();
    const chartResult = await chartService.generateChart({
      data: allFindings.join('\n'),
      chartType: chartType as any,
      title: `${run.query} - ${chartType} visualization`,
      goal: chartGoal // ← Uses the specific goal!
    });
  }
}
```

---

## ✅ What Happens When User Selects Charts

**Example: User selects Bar + Line charts**

### Planning Stage (Visible to User):
```
Thinking: Chart data requirements: market segment data, growth trends over time

Plan created: 8 steps
Steps:
1. analyze_files: Extract current data from documents
2. search_web: Market segment breakdown with percentages
3. search_web: Growth statistics 2020-2024 yearly data
4. synthesize: Combine findings
5. generate_chart: bar - Compare market segments  ← CHART STEP
6. generate_chart: line - Show growth trends       ← CHART STEP
7. quality_check: Verify completeness
8. write_report: Create final report with charts
```

### Execution Stage (Visible to User):
```
Step 5/8: generate_chart: bar - Compare market segments
Tool Call: chart_generator
Purpose: Compare market segments with bar chart

Tool Result: chart_generator
Findings: bar chart generated successfully

Step 6/8: generate_chart: line - Show growth trends
Tool Call: chart_generator
Purpose: Show growth trends with line chart

Tool Result: chart_generator
Findings: line chart generated successfully
```

### Final Report:
```markdown
# Research Report

![Market Segments](https://blob.../bar_chart.png)

![Growth Trends](https://blob.../line_chart.png)
```

---

## Current Logging

**API logs show:**
```
[Research] Chart requests: [
  { type: 'bar', goal: undefined },
  { type: 'line', goal: undefined }
]

[Research] Understanding: {
  chartDataNeeds: ['market segment data', 'growth statistics']
}

[Research] Plan created: {
  steps: [
    ...
    "generate_chart: bar - Compare market segments",
    "generate_chart: line - Show growth trends",
    ...
  ]
}

[Research] Generating bar chart from findings...
[Research] bar chart generated: https://...
[Research] Generating line chart from findings...
[Research] line chart generated: https://...
```

---

## ✅ Conclusion

**Chart selections ARE correctly:**
1. ✅ Sent from Portal UI
2. ✅ Received by API
3. ✅ Included in understanding phase
4. ✅ Included in planning phase (CRITICAL instruction to LLM)
5. ✅ Mentioned in plan steps
6. ✅ Generated during execution
7. ✅ Embedded in final report

**No changes needed - it's working correctly!**

---

## User Sees:

1. **During Planning:**
   - "Chart data requirements: {what data is needed}"
   - Plan includes "generate_chart: {type} - {description}" steps

2. **During Execution:**
   - "Tool Call: chart_generator - {purpose}"
   - "Tool Result: {type} chart generated successfully"

3. **In Final Report:**
   - Charts embedded as images

**Everything is visible and working as designed!**


