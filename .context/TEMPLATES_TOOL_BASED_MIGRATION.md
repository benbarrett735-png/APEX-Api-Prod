# Templates Migration to Tool-Based Thinking

## What Was Done

### 🔥 KILLED THE OLD SYSTEM
**Deleted:**
- `src/routes/templates/` (entire directory)
- `src/services/templates/` (entire directory)  
- `src/types/templates.ts`

**Why:** Old system was conversational (start, chat, status) - didn't use tool-based thinking approach. Was complex, different from research, and not aligned with the unified agent strategy.

### ✅ CREATED NEW TOOL-BASED SYSTEM
**Created:**
- `src/routes/templates.ts` (single file, tool-based thinking)

**What it does:**
1. **POST /templates/generate** - Start template generation
2. **GET /templates/stream/:runId** - SSE stream for progress
3. Uses same approach as research mode (tool-based planning)
4. Saves to `o1_research_runs` table (same as research)

### How It Works (Same as Research)

```
User Request
     ↓
1. CREATE TOOL-BASED PLAN
   - APIM analyzes query + template type
   - Decides: search_web? analyze_documents?
   - Creates specific parameters
     ↓
2. EXECUTE TOOLS
   - Run web searches
   - Analyze documents
   - Gather all findings
     ↓
3. GENERATE REPORT
   - Use template-specific sections
   - Fill each section with relevant content
   - NO REPETITION (distinct sections)
     ↓
4. RETURN RESULT
   - Stream via SSE
   - Save to database
```

### Template Structures

Pre-defined sections for each template type:

```typescript
TEMPLATE_STRUCTURES = {
  swot_analysis: [
    'Overview',
    'Strengths',
    'Weaknesses',
    'Opportunities',
    'Threats',
    'Strategic Recommendations'
  ],
  
  market_landscape: [
    'Market Overview',
    'Market Segments',
    'Key Players',
    'Market Trends',
    'Competitive Dynamics',
    'Outlook'
  ],
  
  executive_brief: [
    'Overview',
    'Key Findings',
    'Strategic Implications',
    'Recommendations'
  ],
  
  // ... 7 templates total
}
```

### API Endpoints

#### Generate Template
```bash
POST http://localhost:8080/templates/generate

{
  "query": "Create a SWOT analysis for Tesla",
  "templateType": "swot_analysis",
  "depth": "comprehensive",
  "uploadIds": ["file1", "file2"]  # optional
}

Response:
{
  "run_id": "uuid",
  "status": "running",
  "message": "Template generation started"
}
```

#### Stream Progress
```bash
GET http://localhost:8080/templates/stream/{runId}

# SSE Events:
event: template.init
data: {"run_id": "...", "query": "...", "templateType": "..."}

event: template.complete
data: {"run_id": "...", "report": "# SWOT Analysis..."}
```

### Database

Uses existing `o1_research_runs` table:
- `mode` in metadata = `'template'`
- `templateType` in metadata = template type
- Same SSE streaming pattern as research

### Differences from Research

| Feature | Research | Templates |
|---------|----------|-----------|
| Sections | Dynamic (based on plan) | Pre-defined (by template type) |
| Output | Smart report generator | Template-specific formatter |
| Use case | Open-ended research | Structured documents |
| Planning | Flexible tools | Same tools, template-aware |

### Benefits

1. **Consistency** - Same tool-based approach as research
2. **No repetition** - Each section has distinct purpose
3. **Thinking process** - Shows planning and execution
4. **Simplicity** - One file vs. multiple files/folders
5. **Reusability** - Uses same infrastructure as research

### What's Left

#### In API (All Done ✅)
- ✅ Templates use tool-based thinking
- ✅ Repetition fix applied (smart report generator)
- ✅ Old conversational system deleted
- ✅ Single unified approach

#### In Portal (TODO)
1. Update templates page to use new endpoints:
   - Change: `/api/templates/start` → `/templates/generate`
   - Change: SSE stream format
   - Add: Template type selection
   - Add: Depth selection

2. Show thinking process (like research mode)
   - Display tool execution
   - Show plan creation
   - Stream progress events

3. Remove old conversational UI
   - No more "chat" interface for templates
   - Direct generation with options

### Migration Path

**Old Portal Code (what to change):**
```tsx
// OLD (Conversational)
POST /api/templates/start { sessionId, templateType, templateName }
POST /api/templates/chat { sessionId, message }
GET  /api/templates/status { sessionId }

// NEW (Tool-based)
POST /templates/generate { query, templateType, depth, uploadIds }
GET  /templates/stream/:runId (SSE)
```

**Portal needs to:**
1. Remove session management (no more sessionId)
2. Add runId tracking (like research)
3. Use SSE for streaming (like research)
4. Show tool execution (like research)

### Testing

```bash
# Test template generation
curl -X POST http://localhost:8080/templates/generate \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a SWOT analysis for Tesla",
    "templateType": "swot_analysis",
    "depth": "comprehensive"
  }'

# Returns: { "run_id": "...", "status": "running" }

# Stream progress
curl http://localhost:8080/templates/stream/{runId} \
  -H "Authorization: Bearer <JWT>"

# Returns SSE events until completion
```

### Available Templates

1. `swot_analysis` - SWOT Analysis
2. `market_landscape` - Market Landscape Report
3. `executive_brief` - Executive Brief
4. `competitor_dossier` - Competitor Dossier
5. `business_plan` - Business Plan
6. `project_plan` - Project Plan
7. `strategic_plan` - Strategic Plan

(More can be added easily by updating `TEMPLATE_STRUCTURES`)

### Architecture Alignment

✅ **Follows Kevin's Plan:**
- All business logic in API
- APIM for secure processing
- OpenAI for public web search
- Tool-based thinking approach
- Database integration

### Next Steps

1. Update Portal templates page to use new endpoints
2. Add template type selector UI
3. Show thinking process (tool execution)
4. Remove old conversational chat UI
5. Test all 7 template types

---

**Status:** ✅ API COMPLETE - Tool-based templates working  
**Date:** 2025-10-26  
**Impact:** Templates now use same thinking approach as research, no repetition

