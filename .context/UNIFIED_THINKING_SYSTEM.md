# Unified Thinking System

## 🎯 What Changed

**BEFORE:** Each mode (research, templates, reports, charts, plans) had its own implementation  
**AFTER:** ONE unified thinking engine used by ALL modes

## 🏗️ Architecture

### Core Service: `thinkingEngine.ts`

```
src/services/thinkingEngine.ts
├── startThinking()        - Create thinking run
├── createThinkingPlan()   - APIM plans tool execution
├── executeTools()         - Run tools (search_web, analyze_documents, generate_chart)
├── generateOutput()       - APIM generates final output
├── completeThinking()     - Mark run as complete
└── failThinking()         - Handle failures
```

### Mode Adapters

Each mode (research, templates, etc.) is now a THIN WRAPPER around the thinking engine:

```typescript
// Example: src/routes/templates.ts

POST /templates/generate:
  1. startThinking({ mode: 'templates', ... })
  2. createThinkingPlan(context)
  3. executeTools(toolCalls, context)
  4. generateOutput(plan, results, context)
  5. completeThinking(runId, output)
```

## 🗄️ Database Changes

### Migration: `024_unified_thinking.sql`

**Changes:**
- `o1_research_runs` → `thinking_runs`
- `o1_research_activities` → `thinking_activities`
- Added `org_id` column to `thinking_runs`
- Updated indexes and foreign keys

### Apply Migration

```bash
# Local (if you have DATABASE_URL set)
cd /Users/benbarrett/APEX-Api-Prod
psql "$DATABASE_URL" -f migrations/024_unified_thinking.sql

# AWS RDS (via AWS Console or CLI)
# Upload migration file and execute via RDS Query Editor
```

## 🔧 How It Works

### 1. Planning Phase
```
User Query → APIM Planning AI → Tool-Based Plan
                                  ├── analyze_documents (if files)
                                  ├── search_web (if external)
                                  ├── generate_chart (if charts)
                                  └── compile_report
```

### 2. Execution Phase
```
For each tool in plan:
  ├── analyze_documents → callAPIM(extract insights)
  ├── search_web → OpenAI search
  └── generate_chart → ChartService (placeholder)
```

### 3. Generation Phase
```
Plan + Tool Results → APIM Output Generator → Final Report
                                               ├── Templates: Follow template structure
                                               ├── Research: Comprehensive analysis
                                               ├── Reports: Professional format
                                               ├── Charts: Data viz
                                               └── Plans: Strategic roadmap
```

## 🎨 Mode-Specific Customization

Each mode customizes the thinking engine through `ThinkingContext`:

```typescript
interface ThinkingContext {
  mode: 'research' | 'templates' | 'reports' | 'charts' | 'plans';
  query: string;
  userId: string;
  orgId: string;
  depth: 'short' | 'medium' | 'long' | 'comprehensive';
  
  // Mode-specific
  uploadedFiles?: Array<{ uploadId: string; fileName: string; content: string }>;
  templateType?: string;        // For templates
  chartTypes?: string[];        // For charts
  planFormat?: string;          // For plans
}
```

## ✅ Benefits

1. **DRY Principle:** One implementation, many uses
2. **Consistency:** All modes use the same thinking process
3. **Maintainability:** Fix once, all modes benefit
4. **Scalability:** Easy to add new modes
5. **Debugging:** Single place to add logging/monitoring

## 🚀 Next Steps

1. **Apply Migration:** Run `024_unified_thinking.sql` on production DB
2. **Test Templates:** Already updated to use unified system
3. **Update Research:** Migrate `src/routes/research.ts` to use thinking engine
4. **Add Reports:** Create `src/routes/reports.ts` using thinking engine
5. **Add Plans:** Create `src/routes/plans.ts` using thinking engine
6. **Update Charts:** Integrate chart generation into thinking engine

## 📋 Migration Checklist

- [x] Create unified thinking engine (`thinkingEngine.ts`)
- [x] Update templates route to use it
- [x] Create migration SQL (`024_unified_thinking.sql`)
- [ ] Apply migration to database
- [ ] Update research route
- [ ] Create reports route
- [ ] Create plans route
- [ ] Update charts integration
- [ ] Test all modes end-to-end
- [ ] Deploy to staging
- [ ] Deploy to production

## 🔗 Related Files

- `src/services/thinkingEngine.ts` - Core engine
- `src/routes/templates.ts` - Example usage
- `migrations/024_unified_thinking.sql` - DB migration
- `src/routes/research.ts` - To be updated
- `src/routes/agentic-flow.ts` - Old system (will be deprecated)

