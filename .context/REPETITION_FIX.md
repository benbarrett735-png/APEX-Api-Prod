# Report Repetition Fix

## Problem
Reports were generating 5 sections (Executive Summary, Data Analysis, Key Findings, Detailed Insights, Market Trends) that all said THE SAME THING in slightly different words. Massive repetition, no distinct value per section.

**Example of bad output:**
```
Executive Summary: Lists all the specific details from the brief
Data Analysis: Lists all the specific details from the brief again
Key Findings: Lists all the specific details from the brief AGAIN
Detailed Insights: Lists all the specific details from the brief YET AGAIN
Market Trends: Lists all the specific details from the brief ONE MORE TIME
```

## Root Cause
The old `generateReport()` function was asking APIM to generate all sections at once without clear, distinct mandates for each section. APIM would just restate the same information multiple times with different section headers.

## Solution
Created **`smartReportGenerator.ts`** with a completely different approach:

### Each Section Has a SPECIFIC, NON-OVERLAPPING Purpose

1. **Overview** (2-3 paragraphs)
   - **ONLY:** Set context, define scope, explain what this is about
   - **NO:** Findings, facts, analysis, recommendations
   - Think: "Here's what we're looking at and why it matters"

2. **Key Findings** (bullet list)
   - **ONLY:** Specific, concrete facts found in data
   - **NO:** Interpretation, analysis, recommendations, generic statements
   - Think: "Here are the specific things we found"
   - Format: Bullet points with facts: "X was found", "Y shows Z"

3. **Analysis** (3-5 paragraphs)
   - **ONLY:** Interpret what findings MEAN, connect dots, identify patterns
   - **NO:** Repeat the findings, give recommendations
   - Think: "Here's what the findings actually mean and why they matter"

4. **Recommendations** (numbered list)
   - **ONLY:** Specific, actionable next steps based on analysis
   - **NO:** Repeat findings or analysis
   - Think: "Here's what to do next based on this"
   - Format: Numbered list (1. 2. 3.) of concrete actions

5. **Sources** (if available)
   - Simple list of sources

### How It Works

Each section is generated **separately** with **explicit instructions** to ONLY do its job and NOT do other sections' jobs.

```typescript
// Generate DISTINCT sections in sequence
const sections: string[] = [];

sections.push(await generateOverview(query, data));    // Context only
sections.push(await generateKeyFindings(data));        // Facts only
sections.push(await generateAnalysis(query, data));    // Interpretation only
sections.push(await generateRecommendations(query, data)); // Actions only
sections.push(generateSourcesList(sources));           // Sources

return sections.join('\n\n---\n\n');
```

Each generator function has a **strict system prompt** that:
- Defines EXACTLY what to do
- Defines EXACTLY what NOT to do
- Explains how this section differs from others
- Prevents overlap and repetition

## Implementation

### Files Created
- **`src/services/smartReportGenerator.ts`** - New report generator

### Files Modified
- **`src/routes/research.ts`** - Now uses smart generator:
  ```typescript
  if (reportFormat === 'brief') {
    finalReport = await generateBriefReport(context); // 2 paragraphs, NO sections
  } else {
    finalReport = await generateSmartReport(context);  // DISTINCT sections
  }
  ```

### Old System (DEPRECATED)
- `src/services/reportGenerator.ts` - Still exists but NO LONGER USED for research
- Had repetition problem because it asked APIM to generate everything at once

## Results

### Before (Repetitive)
```markdown
## Executive Summary
The brief is for Cabots Cookery School dated July 2025...
Lists: channels, formats, dates, proof points

## Data Analysis
The brief is for Cabots Cookery School dated July 2025...
Lists: channels, formats, dates, proof points (SAME STUFF)

## Key Findings
The brief is for Cabots Cookery School dated July 2025...
Lists: channels, formats, dates, proof points (SAME STUFF AGAIN)
```

### After (Distinct)
```markdown
## Overview
Sets context: what is Cabots, why this project, what's the scope

## Key Findings
- Bullet 1: Specific fact about the brief
- Bullet 2: Specific channel requirement
- Bullet 3: Specific timeline constraint
(JUST FACTS)

## Analysis
Interprets what those facts mean for creative execution,
identifies patterns, explains implications
(MEANING, not facts)

## Recommendations
1. Action 1: Specific thing to do based on analysis
2. Action 2: Another concrete action
(ACTIONS, not interpretation)
```

## Testing

Test the fix:
1. Generate a research report
2. Verify sections are DISTINCT (no repetition)
3. Each section should serve a unique purpose:
   - Overview = context
   - Key Findings = facts
   - Analysis = interpretation
   - Recommendations = actions

## Architecture

Follows Kevin's plan:
- ✅ All business logic in API
- ✅ APIM for secure text processing (called separately per section)
- ✅ Sequential generation with clear mandates
- ✅ No business logic in Portal

## Migration

- **Old route:** Still works but will show repetition
- **New route (research):** Uses smart generator, NO repetition
- **Agentic flow (reports mode):** Still uses old generator (TODO: migrate)

## Next Steps

1. Migrate agentic flow reports mode to use smart generator
2. Update templates mode to use smart generator
3. Update plans mode to use smart generator
4. Delete old `generateReport` from reportGenerator.ts once all modes migrated

---

**Status:** ✅ FIXED for research mode  
**Date:** 2025-10-26  
**Impact:** Reports no longer repeat the same information 5 times

