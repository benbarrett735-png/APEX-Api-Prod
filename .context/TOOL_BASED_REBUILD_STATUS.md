# TOOL-BASED ARCHITECTURE REBUILD - IN PROGRESS

## Status: 40% Complete

### ✅ Completed
1. Created new `createToolBasedPlan()` function (lines 26-282)
   - Defines 4 tools for APIM: analyze_documents, search_web, generate_chart, compile_report
   - Gives APIM full document content upfront
   - APIM returns understanding + tool calls with specific parameters
   - Smart fallback that extracts subject from query

2. Updated streaming endpoint start (lines 948-1024)
   - Replaced 3-phase (Understand -> Plan -> Execute) with tool-based planning
   - Call `createToolBasedPlan()` instead of separate understand/plan functions
   - Display understanding and tool plan to user

3. Started execution loop replacement (lines 1031-1051)
   - Changed from `for (researchPlan.steps)` to `for (plan.toolCalls)`
   - Switched from `if (action.includes(...))` to `switch (toolCall.tool)`
   - Started updating analyze_documents case

### ❌ Not Complete - Causing 33 Linter Errors
1. **Execution loop not fully replaced** (lines 1094-1422)
   - Still has old `if (action.includes(...))` blocks
   - References undefined variables: `action`, `description`, `step`, `researchPlan`
   - Need to replace ALL execution cases with switch cases for:
     * `case 'analyze_documents':`
     * `case 'search_web':`
     * `case 'generate_chart':`
     * `case 'compile_report':`

2. **Report generation not updated**
   - Still references `researchPlan.reportSections`
   - Should use `plan.toolCalls.find(tc => tc.tool === 'compile_report').parameters`

3. **Old functions not removed**
   - `OLD_createResearchPlan_DELETED()` function still exists (commented out)
   - Should be fully deleted

## What Needs to Happen Next

### 1. Complete Execution Loop Replacement
Replace lines 1094-1422 with clean switch cases:

```typescript
switch (toolCall.tool) {
  case 'analyze_documents': {
    // Use toolCall.parameters.focus
    // Extract findings from documents
    break;
  }
  
  case 'search_web': {
    // Use toolCall.parameters.searchQuery
    const searchQuery = toolCall.parameters.searchQuery; // e.g., "Tesla 2024 revenue market share"
    const results = await searchWeb(searchQuery);
    allFindings.push(...results.findings);
    sources.push(...results.sources);
    break;
  }
  
  case 'generate_chart': {
    // Use toolCall.parameters.chartType, dataNeeded, goal
    const chart = await chartService.generateChart({
      data: allFindings.join('\n'),
      chartType: toolCall.parameters.chartType,
      goal: toolCall.parameters.goal
    });
    chartUrls[toolCall.parameters.chartType] = chart.url;
    break;
  }
  
  case 'compile_report': {
    // Use toolCall.parameters.format, sections
    const finalReport = await generateReport({
      query: run.query,
      depth: run.depth as any,
      fileFindings: allFindings.filter(f => f.includes('From Uploaded Documents')),
      webFindings: allFindings.filter(f => !f.includes('From Uploaded Documents')),
      sources,
      outputStyle: toolCall.parameters.format,
      reportSections: toolCall.parameters.sections
    });
    break;
  }
}
```

### 2. Remove Quality Check Logic
- Old `quality_check` action is not needed in tool-based approach
- APIM decides upfront how many searches to do

### 3. Test with Simple Query
Once errors fixed:
```
Query: "Give me a quick summary of Tesla"

Expected APIM response:
{
  "understanding": {
    "coreSubject": "Tesla",
    "outputFormat": "brief"
  },
  "toolCalls": [
    {
      "tool": "search_web",
      "parameters": { "searchQuery": "Tesla 2024 revenue products market position latest news" }
    },
    {
      "tool": "compile_report",
      "parameters": { "format": "brief", "sections": null }
    }
  ]
}

Expected Output:
2 paragraphs, NO sections, ~200 words about Tesla
```

## Benefits Once Complete
1. ✅ Searches will be ABOUT THE SUBJECT, not the query
2. ✅ Format will be DYNAMIC (brief/standard/comprehensive)
3. ✅ Tool parameters will be SPECIFIC (not generic)
4. ✅ APIM makes ALL decisions upfront (true tool-based planning)
5. ✅ Simpler, cleaner execution loop

## Current Errors to Fix
- 33 linter errors, mostly:
  - `Cannot find name 'action'`
  - `Cannot find name 'description'`
  - `Cannot find name 'step'`
  - `Cannot find name 'researchPlan'`

Need to systematically replace all old execution code with new switch-based tool execution.

