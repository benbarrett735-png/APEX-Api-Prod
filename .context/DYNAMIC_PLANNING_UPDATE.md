# Dynamic Planning Update

**Date:** October 26, 2025  
**Issue:** "plan always ten steps it should be dynamic"  
**Status:** ✅ Fixed

---

## What Changed

### Before: Fixed 10 Steps
Every query had the same hardcoded sequence regardless of complexity.

### After: Dynamic Planning Based on Query

**Now analyzes each query and creates a custom plan:**

#### **1. Query Type Detection**
```typescript
const hasComparison = query.includes('compare') || query.includes('vs');
const hasTimeline = query.includes('history') || query.includes('timeline');
const hasAnalysis = query.includes('analyze') || query.includes('breakdown');
const hasData = query.includes('data') || query.includes('statistics');
```

#### **2. Dynamic Step Calculation**
```typescript
// Base steps by depth
if (depth === 'comprehensive') estimatedSteps = 12;
else if (depth === 'long') estimatedSteps = 9;
else if (depth === 'medium') estimatedSteps = 7;
else estimatedSteps = 5;

// Add steps based on query complexity
if (hasComparison) estimatedSteps += 2;  // Compare X vs Y needs more steps
if (hasTimeline) estimatedSteps += 2;    // Historical research needs more
if (hasAnalysis) estimatedSteps += 1;    // Deep dive needs extra
if (uploadedFiles > 0) estimatedSteps += 2;  // File analysis adds steps
```

#### **3. Query-Specific Thinking**
```typescript
emit('thinking', {
  thought: `Query type: ${
    hasComparison ? 'Comparative analysis' : 
    hasTimeline ? 'Historical research' : 
    hasAnalysis ? 'Deep analysis' : 
    'Informational research'
  }. Planning ${estimatedSteps} research steps.`,
  thought_type: 'planning'
});
```

#### **4. Dynamic Section Generation**
```typescript
const sections = ['Executive Summary', 'Key Findings'];
if (hasComparison) sections.push('Comparative Analysis');
if (hasTimeline) sections.push('Historical Context');
if (hasAnalysis) sections.push('Detailed Analysis');
if (hasData) sections.push('Data & Metrics');
sections.push('Recommendations', 'Conclusion');
```

---

## Examples

### Query: "Compare React vs Vue"
- Detects: **Comparative analysis**
- Steps: **9** (7 base + 2 for comparison)
- Sections: Executive Summary, Key Findings, **Comparative Analysis**, Recommendations, Conclusion

### Query: "Analyze the history of AI"
- Detects: **Historical research + Deep analysis**
- Steps: **10** (7 base + 2 timeline + 1 analysis)
- Sections: Executive Summary, Key Findings, **Historical Context**, **Detailed Analysis**, Recommendations, Conclusion

### Query: "What is machine learning?"
- Detects: **Informational research**
- Steps: **7** (medium depth base)
- Sections: Executive Summary, Key Findings, Recommendations, Conclusion

### Query: "Statistics on AI adoption" + file upload
- Detects: **Data query + Files**
- Steps: **10** (7 base + 1 data + 2 files)
- Sections: Executive Summary, Key Findings, **Data & Metrics**, Recommendations, Conclusion

---

## Portal Display Issue

**User Request:** "put it into the chat not its own scroll box"

### Current State (Portal)
Thinking is displayed in a separate `<ResearchThinking>` component with its own scroll area.

### What Needs to Change (Portal Side)

**File:** `/Users/benbarrett/APEX-Portal-Prod-3/pages/chat.tsx`

**Current:**
```typescript
{message.researchState && (
  <ResearchThinking 
    activities={message.researchState.activities}
    status={message.researchState.status}
  />
)}
```

**Needs to be:**
```typescript
{message.researchState && (
  <div className="space-y-2">
    {message.researchState.activities.map(activity => (
      <div key={activity.id} className="text-sm text-gray-700">
        {activity.type === 'thinking' && (
          <div className="italic">💭 {activity.thought}</div>
        )}
        {activity.type === 'tool_call' && (
          <div className="text-blue-600">🔧 {activity.tool}: {activity.purpose}</div>
        )}
        {activity.type === 'tool_result' && (
          <div className="text-green-600">✅ Found {activity.findings_count} items</div>
        )}
      </div>
    ))}
  </div>
)}
```

**Result:** Thinking appears inline in the chat message, not in a separate box.

---

## API Changes

**File:** `src/routes/research.ts`

```typescript
// Lines 276-310: Dynamic planning logic added
// Lines 370-382: Dynamic section generation added
```

---

## Testing

**Try these queries to see dynamic planning:**

1. **"Compare Python vs JavaScript"**
   - Should say "Comparative analysis. Planning 9 research steps"

2. **"History of artificial intelligence"**
   - Should say "Historical research. Planning 9 research steps"

3. **"Analyze Tesla's market strategy"**
   - Should say "Deep analysis. Planning 8 research steps"

4. **"What is quantum computing?"**
   - Should say "Informational research. Planning 7 research steps"

---

## Files Changed

```
MODIFIED:
- src/routes/research.ts (Lines 265-420)

NEW:
- .context/DYNAMIC_PLANNING_UPDATE.md (This file)
```

---

**Status:** ✅ Dynamic planning implemented, server running

**TODO:** Portal needs update to display thinking inline (not in scroll box)

