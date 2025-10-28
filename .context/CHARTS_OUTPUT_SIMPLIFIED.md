# Charts Mode Output Simplification

## Problem Report

User reported that charts mode was producing way too much extra text and formatting:

```markdown
# use a radar chart to show ai usage in different industries over last 2 years and use the stacked bar ti show ai companies with best models and usage

**Generated:** 10/27/2025, 3:08:18 PM

---

# 📊 Data Visualizations

## use a radar chart to show ai usage in different industries over last 2 years and use the stacked bar ti show ai companies with best models and usage - stackbar chart

![use a radar chart to show ai usage in different industries over last 2 years and use the stacked bar ti show ai companies with best models and usage - stackbar chart](/api/charts/serve/a67542de873d7a2d.png)

**Chart Type:** stackbar

## use a radar chart to show ai usage in different industries over last 2 years and use the stacked bar ti show ai companies with best models and usage - radar chart

![use a radar chart to show ai usage in different industries over last 2 years and use the stacked bar ti show ai companies with best models and usage - radar chart](/api/charts/serve/1e65bbce2f95dac0.png)

**Chart Type:** radar

---
```

**User feedback:** "what the fuck is this this is bs the grey container is fine but the other shit is way to much extra text"

## Root Cause

The `agenticFlow.ts` service was applying the same verbose markdown formatting to ALL agent modes, including charts mode. Charts mode should be minimal - just show the charts, no extra headers or metadata.

## The Fix

Modified `src/services/agenticFlow.ts` to check for `charts` mode and skip all the extra formatting:

### Change 1: Skip Title and Metadata

**Before:**
```typescript
const run = await this.getRun();
const reportTitle = run.goal;

fullReport += `# ${reportTitle}\n\n`;
fullReport += `**Generated:** ${new Date().toLocaleString()}\n\n`;
fullReport += `---\n\n`;
```

**After:**
```typescript
const run = await this.getRun();
const reportTitle = run.goal;

// For charts mode: Skip all the extra formatting, just show charts
if (this.mode !== 'charts') {
  fullReport += `# ${reportTitle}\n\n`;
  fullReport += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  fullReport += `---\n\n`;
}
```

### Change 2: Simplified Chart Embedding

**Before:**
```typescript
if (chartData.length > 0) {
  fullReport += `\n# 📊 Data Visualizations\n\n`;
  chartData.forEach((chart, idx) => {
    fullReport += `## ${chart.title}\n\n`;
    if (chart.failed) {
      fullReport += `⚠️ **Chart Generation Failed**\n\n`;
      fullReport += `**Error:** ${chart.error}\n\n`;
      fullReport += `**Chart Type:** ${chart.type}\n\n`;
    } else {
      fullReport += `![${chart.title}](${chart.url})\n\n`;
      fullReport += `**Chart Type:** ${chart.type}\n\n`;
    }
  });
  fullReport += `---\n\n`;
}
```

**After:**
```typescript
if (chartData.length > 0) {
  // For charts mode: Clean, minimal output - just the charts
  if (this.mode === 'charts') {
    chartData.forEach((chart, idx) => {
      if (chart.failed) {
        fullReport += `**${chart.title}:** Chart generation failed (${chart.error})\n\n`;
      } else {
        fullReport += `![${chart.title}](${chart.url})\n\n`;
      }
    });
  } else {
    // For other modes: Full formatting
    fullReport += `\n# 📊 Data Visualizations\n\n`;
    chartData.forEach((chart, idx) => {
      fullReport += `## ${chart.title}\n\n`;
      if (chart.failed) {
        fullReport += `⚠️ **Chart Generation Failed**\n\n`;
        fullReport += `**Error:** ${chart.error}\n\n`;
        fullReport += `**Chart Type:** ${chart.type}\n\n`;
      } else {
        fullReport += `![${chart.title}](${chart.url})\n\n`;
        fullReport += `**Chart Type:** ${chart.type}\n\n`;
      }
    });
    fullReport += `---\n\n`;
  }
}
```

## Expected Output After Fix

**Charts mode output (clean):**
```markdown
![radar chart](/api/charts/serve/1e65bbce2f95dac0.png)

![stackbar chart](/api/charts/serve/a67542de873d7a2d.png)
```

**Reports mode output (full formatting unchanged):**
```markdown
# Market Analysis Report

**Generated:** 10/27/2025, 3:08:18 PM

---

# 📊 Data Visualizations

## Revenue Growth Chart

![Revenue Growth Chart](/api/charts/serve/abc123.png)

**Chart Type:** line

---
```

## What Was Removed for Charts Mode

1. ❌ `# ${goal}` - Main title header
2. ❌ `**Generated:** ${date}` - Generation timestamp
3. ❌ `---` - Top divider
4. ❌ `# 📊 Data Visualizations` - Section header
5. ❌ `## ${chart.title}` - Individual chart headers
6. ❌ `**Chart Type:** ${type}` - Chart type labels
7. ❌ `---` - Bottom divider
8. ❌ `## Report Summary` - Summary section (still skipped for charts mode)

## What Remains for Charts Mode

✅ **Just the chart images** - `![title](url)` markdown
✅ **Error messages if chart fails** - Brief, inline format
✅ **Grey box container** - Provided by Portal's Messages component

## Testing

**Test Steps:**
1. Go to Portal → Agent → Charts
2. Select 2+ chart types (e.g., Radar + Stacked Bar)
3. Enter: "AI usage in different industries"
4. Send

**Expected Result:**
- Grey box appears
- Contains ONLY the chart images
- No headers, no metadata, no extra text
- Clean, minimal, professional

**If Charts Don't Display:**
- Check if chart files are being generated: `ls public/charts/`
- Check if chart proxy is working: Access chart URL directly
- Check browser console for 404s or CORS errors
- This is a separate issue from formatting (likely ChartService or Python script issues)

## Files Changed

- `src/services/agenticFlow.ts`:
  - Added `if (this.mode !== 'charts')` check before title/metadata
  - Added `if (this.mode === 'charts')` condition in chart embedding logic
  - Charts mode now produces minimal output

## Deployment Status

- ✅ Fix implemented
- ✅ API rebuilt
- ✅ API restarted
- ✅ Ready for testing

## Related Context

This fix addresses **output formatting only**. If charts are not generating at all (image files not created), that's a separate issue related to:
- ChartService configuration
- Python script execution
- APIM data formatting
- External data search

The grey box container mentioned by the user is working correctly - it's provided by the Portal's Messages component and renders agent outputs with Copy/Save buttons. The issue was purely the excessive markdown formatting inside that container.

