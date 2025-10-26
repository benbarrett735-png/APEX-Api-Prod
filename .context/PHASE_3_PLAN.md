# Phase 3: Continuous Reasoning Loop - Implementation Plan

**Date:** October 26, 2025  
**Status:** 🚧 In Progress

---

## What is o1-Style Reasoning?

ChatGPT o1 uses **continuous thinking** where the AI:
1. **Plans** an approach
2. **Executes** actions
3. **Self-critiques** its work
4. **Pivots** if the approach isn't working
5. **Iterates** until satisfied with the result

**Key difference from current system:**
- **Current:** Fixed linear flow (plan → execute → report)
- **o1-style:** Adaptive loop (plan → execute → critique → adjust → repeat)

---

## Architecture

### **Current Flow (Phase 2)**
```
1. Analyze query type
2. Determine steps
3. Process files (if any)
4. Search web (if configured)
5. Generate report
6. Done
```

### **o1-Style Flow (Phase 3)**
```
1. Initial plan
2. Execute step
3. Self-critique: "Is this working?"
   → YES: Continue
   → NO: Pivot to different approach
4. Check completion criteria
   → COMPLETE: Generate report
   → INCOMPLETE: Loop back to step 2
5. Done
```

---

## Implementation Strategy

### **Core Components**

#### **1. Reasoning Engine**
Manages the continuous loop and decides next actions.

```typescript
class ReasoningEngine {
  private query: string;
  private findings: Finding[];
  private currentPlan: Plan;
  private maxIterations: number;
  
  async run(): Promise<ResearchResult> {
    let iteration = 0;
    
    while (iteration < this.maxIterations) {
      // Execute current plan step
      const result = await this.executeStep();
      
      // Self-critique
      const critique = await this.selfCritique();
      
      // Check if we should pivot
      if (critique.shouldPivot) {
        this.currentPlan = await this.generateNewPlan(critique);
        emit('thinking', { thought: 'Pivoting strategy...', thought_type: 'pivot' });
      }
      
      // Check completion
      if (this.isComplete()) {
        break;
      }
      
      iteration++;
    }
    
    return this.generateFinalReport();
  }
}
```

#### **2. Self-Critique Function**
Uses APIM to evaluate progress and decide if pivot is needed.

```typescript
async selfCritique(): Promise<Critique> {
  const messages = [
    { role: 'system', content: 'You are a research quality evaluator.' },
    { role: 'user', content: `
      Query: "${this.query}"
      Findings so far: ${this.findings.length}
      Current approach: ${this.currentPlan.approach}
      
      Evaluate:
      1. Are we making progress toward answering the query?
      2. Is the current approach working?
      3. Should we pivot to a different strategy?
      
      Respond with JSON:
      {
        "progress_score": 1-10,
        "is_working": true/false,
        "should_pivot": true/false,
        "reasoning": "...",
        "suggested_pivot": "..." (if should_pivot is true)
      }
    `}
  ];
  
  const response = await callAPIM(messages);
  return JSON.parse(response);
}
```

#### **3. Pivot Logic**
Generates new plans when current approach isn't working.

```typescript
async generateNewPlan(critique: Critique): Promise<Plan> {
  // If web search yielded no results, try file-focused approach
  // If file analysis is stuck, try external context
  // If query is too broad, narrow it down
  // If query is too narrow, expand scope
  
  const messages = [
    { role: 'system', content: 'You are a research strategy planner.' },
    { role: 'user', content: `
      Original query: "${this.query}"
      Current approach failed because: ${critique.reasoning}
      Suggested pivot: ${critique.suggested_pivot}
      
      Generate a new research plan.
    `}
  ];
  
  const response = await callAPIM(messages);
  return JSON.parse(response);
}
```

#### **4. Completion Criteria**
Determines when research is "good enough" to stop.

```typescript
isComplete(): boolean {
  // Minimum findings threshold
  if (this.findings.length < 5) return false;
  
  // Quality check via APIM
  const qualityScore = await this.assessQuality();
  if (qualityScore < 7) return false;
  
  // Sources diversity
  const uniqueSources = new Set(this.findings.map(f => f.source)).size;
  if (uniqueSources < 2) return false;
  
  return true;
}
```

---

## Implementation Phases

### **Phase 3A: Self-Critique (30 min)**
Add self-critique after each major step.

**Changes:**
- Add `selfCritique()` function using APIM
- Emit `thinking` events with `thought_type: 'self_critique'`
- Log critique results

**Test:** Run research, verify critique events appear

### **Phase 3B: Pivot Logic (45 min)**
Implement strategy pivoting when critique fails.

**Changes:**
- Add `generateNewPlan()` function
- Detect pivot scenarios (no results, low quality, stuck)
- Emit `thinking` events with `thought_type: 'pivot'`
- Adjust step count dynamically

**Test:** Force a pivot (e.g., disable OpenAI), verify new plan

### **Phase 3C: Completion Loop (30 min)**
Add iterative loop with completion criteria.

**Changes:**
- Wrap research logic in `while` loop
- Add `isComplete()` check
- Max iterations safety (prevent infinite loops)
- Dynamic metadata (iterations, pivots)

**Test:** Research should iterate 2-3 times before completing

---

## Simplified Phase 3 (MVP)

**To keep it realistic for tonight:**

### **Minimal o1-Style Reasoning**
1. **After web search:** Self-critique quality of findings
2. **If quality < 7:** Emit pivot thinking, try alternative search
3. **After file processing:** Self-critique completeness
4. **If incomplete:** Emit pivot thinking, look for external context
5. **Before report:** Final quality check

**No full reasoning engine, just smart checkpoints.**

---

## Code Changes Required

### **File: `src/routes/research.ts`**

**Add:**
```typescript
// After web search
const webQuality = await assessFindingsQuality(allFindings, run.query);
if (webQuality.score < 7) {
  emit('thinking', {
    thought: `Initial findings score: ${webQuality.score}/10. ${webQuality.reasoning}. Trying alternative approach...`,
    thought_type: 'self_critique'
  });
  
  emit('thinking', {
    thought: 'Pivoting to more specific search terms...',
    thought_type: 'pivot'
  });
  
  // Try refined search
  const refinedResults = await searchWeb(webQuality.suggestedQuery);
  allFindings.push(...refinedResults.findings);
  sources.push(...refinedResults.sources);
}

// Final quality gate before report
const finalQuality = await assessFindingsQuality(allFindings, run.query);
if (finalQuality.score < 5) {
  emit('thinking', {
    thought: `Research quality: ${finalQuality.score}/10. Expanding scope for better coverage...`,
    thought_type: 'self_critique'
  });
  
  // One more search attempt
  // ... (simplified pivot logic)
}
```

---

## Decision Point

**Option A: Full Implementation (2-3 hours)**
- Complete reasoning engine
- Full pivot logic
- Iterative loops
- Complex quality assessment

**Option B: Simplified MVP (30-45 min)**
- Self-critique checkpoints after major steps
- Simple pivot (retry with refined query)
- Quality gate before report
- No loops, just smart fallbacks

**Recommendation:** **Option B** for tonight
- Demonstrates o1-style thinking
- Production-ready and testable
- Leaves room for enhancement later
- Aligns with "keep going" but stays practical

---

## Next Steps

**If proceeding with Option B (MVP):**
1. Add `assessFindingsQuality()` function (calls APIM)
2. Add self-critique after web search
3. Add pivot logic for low-quality results
4. Add final quality gate
5. Test with various queries
6. Document in `.context/PHASE_3_COMPLETE.md`

**Ready to implement?** 🚀

