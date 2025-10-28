# Reports Infinite Loop Fix - SSE Polling Issue

## Problem Report

User reported that Reports mode was stuck in an infinite loop with 411 steps, repeating the same events over and over:

```
06:11:40 PM Planning - Analyzing your request... (repeated 24 times, every 2 seconds)
06:12:28 PM Tool Call - search_web (repeated 7-10 times per search)
06:15:16 PM Tool Call - generate_chart (repeated 10 times per chart)
06:16:14 PM Tool Call - draft_section (repeated 15-31+ times per section)
```

Eventually resulted in: `Connection Error: Failed to connect to research stream`

## Root Cause Analysis

The SSE stream endpoint for reports (`GET /reports/stream/:runId`) was **re-emitting the same activities on every poll cycle**.

### The Broken Logic

```typescript
// BEFORE (broken):
let lastActivityTs = new Date(0);

const pollInterval = setInterval(async () => {
  const activitiesResult = await dbQuery(
    `SELECT * FROM o1_research_activities 
     WHERE run_id = $1 AND created_at > $2 
     ORDER BY created_at ASC`,
    [runId, lastActivityTs]
  );

  for (const activity of activitiesResult.rows) {
    emit(activity.activity_type, activity.activity_data);
    lastActivityTs = new Date(activity.created_at);
  }
}, 2000);
```

### Why It Failed

**Timestamp Precision Issue:**

1. Multiple activities can be inserted with the **same timestamp** (PostgreSQL `NOW()` has millisecond precision, but multiple INSERTs in rapid succession often get the same millisecond).

2. After emitting activities A, B, C all with timestamp `2024-01-01 18:11:40.123`:
   - `lastActivityTs` is set to `2024-01-01 18:11:40.123`

3. Next poll (2 seconds later):
   - Query: `created_at > '2024-01-01 18:11:40.123'`
   - This misses activity D if it also has timestamp `2024-01-01 18:11:40.123`!
   - Worse: If database rounds to seconds, ALL activities in that second get re-queried and re-emitted!

4. **Result:** Every poll cycle (2 seconds) re-emits the same activities!

### Impact

- **100s of duplicate API calls** to OpenAI (wasted money)
- **100s of duplicate APIM calls** (wasted compute)
- **UI flooded** with duplicate thinking events (411 steps!)
- **Connection timeout** eventually kills the stream
- **Reports completely unusable** 💥

## The Fix

**Track by Activity ID instead of Timestamp:**

```typescript
// AFTER (fixed):
let lastActivityId = 0;

const pollInterval = setInterval(async () => {
  const activitiesResult = await dbQuery(
    `SELECT * FROM o1_research_activities 
     WHERE run_id = $1 AND id > $2 
     ORDER BY id ASC`,
    [runId, lastActivityId]
  );

  for (const activity of activitiesResult.rows) {
    emit(activity.activity_type, activity.activity_data);
    lastActivityId = activity.id; // Use ID, not timestamp!
  }
}, 2000);
```

### Why This Works

- **IDs are auto-incrementing integers** (SERIAL in PostgreSQL)
- **Guaranteed unique and sequential**
- `id > $2` ensures we **never re-emit the same activity**
- **No timestamp precision issues**
- **Simple and reliable**

## Expected Behavior After Fix

Reports mode should now execute cleanly, with each event appearing **exactly once**:

```
Planning Phase:
  ✓ "Analyzing your request..." (1x)
  ✓ "Report Subject: OpenAI" (1x)
  ✓ "Execution Plan: 26 tools" (1x)

Execution Phase:
  ✓ Tool 1/26: search_web (1x)
  ✓ Tool Call: search_web - revenue (1x)
  ✓ Result: web_search (1x)
  
  ✓ Tool 2/26: search_web (1x)
  ✓ Tool Call: search_web - users (1x)
  ✓ Result: web_search (1x)
  
  ... (each tool executes once)
  
  ✓ Tool 13/26: generate_chart (1x)
  ✓ Tool Call: generate_chart - line chart (1x)
  ✓ Result: chart_generated (1x)
  
  ✓ Tool 16/26: draft_section (1x)
  ✓ Tool Call: draft_section - Executive Summary (1x)
  ✓ Result: section_drafted (1x)
  
  ... (each section drafted once)

Completion:
  ✓ "Compiling report..." (1x)
  ✓ "Report completed" (1x)
  ✓ Final report in grey box
```

## Files Changed

- `src/routes/reports.ts`:
  - Changed SSE polling to track by `lastActivityId` instead of `lastActivityTs`
  - Query changed from `created_at > $2` to `id > $2`
  - Variable rename: `lastActivityTs` → `lastActivityId`

## Testing Verification

**Test Case:**
1. Go to Portal → Agent → Reports
2. Select: Length: Comprehensive, Focus: Data-Driven, Charts: Bar
3. Enter: "OpenAI market analysis"
4. Send

**Expected Result:**
- Each thinking event appears **once**
- Each tool call appears **once**
- Each result appears **once**
- Total events: ~30-50 (not 411!)
- Report completes in 2-5 minutes (not timeout)

## Comparison: Research vs Reports

**Research Mode:**
- Executes **inline** in the SSE stream
- Events emitted **directly** with `emit()` function
- 50ms delays between events to prevent overwhelming client
- **No database polling** - no opportunity for re-emission bug

**Reports Mode:**
- Executes **async** in background
- Events logged to **database** (`o1_research_activities` table)
- SSE stream **polls database** every 2 seconds for new activities
- **Had bug:** Timestamp-based tracking caused re-emission
- **Now fixed:** ID-based tracking prevents re-emission

## Deployment Status

- ✅ Fix implemented in `src/routes/reports.ts`
- ✅ API rebuilt and restarted
- ✅ Ready for testing

## Related Issues

This is similar to the "thinking display not showing" issue from earlier, but the ROOT CAUSE was different:
- Thinking display issue: Portal not rendering `ResearchThinking` component
- Reports loop issue: Backend SSE polling re-emitting same activities

Both were SSE-related issues but at different layers of the stack!

