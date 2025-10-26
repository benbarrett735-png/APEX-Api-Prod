# Research Mode - o1-Style Continuous Reasoning

**Status:** Phase 1 Complete ✅  
**Deployment:** Ready for AWS App Runner Staging  
**Alignment:** 100% with Kevin's Plan

---

## Overview

This implements ChatGPT o1-style research mode with visible thinking process, streaming via SSE (Server-Sent Events). The system will evolve through 4 phases:

- ✅ **Phase 1:** Basic SSE streaming with hardcoded events (COMPLETE)
- 🔄 **Phase 2:** APIM integration for real processing
- 🔄 **Phase 3:** Continuous reasoning loop with self-critique
- 🔄 **Phase 4:** OpenAI external search

---

## Architecture

```
Portal (Frontend)
  ↓
  POST /research/start { query, uploaded_files, depth }
  ↓
API (Backend)
  ↓
  Returns: { run_id, status: "planning" }
  ↓
Portal opens SSE connection:
  GET /research/stream/{run_id}
  ↓
API streams events:
  - event: thinking
  - event: tool.call
  - event: tool.result
  - event: section.completed
  - event: research.completed
```

---

## API Endpoints

### POST /research/start

**Request:**
```json
{
  "query": "Research question or goal",
  "uploaded_files": ["upload_id_1", "upload_id_2"],
  "depth": "short" | "medium" | "long" | "comprehensive",
  "include_charts": ["line", "bar"],
  "target_sources": ["https://example.com"]
}
```

**Response:**
```json
{
  "run_id": "run_1730000000000_abc123",
  "status": "planning",
  "stream_url": "/research/stream/run_1730000000000_abc123"
}
```

---

### GET /research/stream/:id

**SSE Stream Events:**

```typescript
// Thinking event
event: thinking
data: {"thought": "Starting analysis...", "thought_type": "planning"}

// Tool call event
event: tool.call
data: {"tool": "apim_process", "purpose": "Analyze documents"}

// Tool result event
event: tool.result
data: {"tool": "apim_process", "findings_count": 5}

// Section completed event
event: section.completed
data: {"section": "Executive Summary", "preview": "Based on..."}

// Final completion event
event: research.completed
data: {"run_id": "...", "report_content": "# Report...", "metadata": {}}
```

---

## Database Schema

### o1_research_runs

```sql
CREATE TABLE o1_research_runs (
    id VARCHAR(255) PRIMARY KEY,           -- run_TIMESTAMP_RANDOM
    user_id VARCHAR(255) NOT NULL,         -- From JWT sub
    query TEXT NOT NULL,                    -- User's research question
    depth VARCHAR(50) NOT NULL,             -- short/medium/long/comprehensive
    status VARCHAR(50) NOT NULL,            -- planning/processing/completed/failed
    uploaded_files JSONB DEFAULT '[]',      -- Array of file IDs
    include_charts JSONB DEFAULT '[]',      -- Array of chart types
    target_sources JSONB DEFAULT '[]',      -- Array of URLs
    report_content TEXT,                    -- Final markdown report
    metadata JSONB DEFAULT '{}',            -- Duration, phase, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### o1_research_activities

```sql
CREATE TABLE o1_research_activities (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR(255) NOT NULL REFERENCES o1_research_runs(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,    -- thinking/tool_call/tool_result/etc
    activity_data JSONB NOT NULL,          -- Event payload
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Environment Variables

**No new env vars needed!** Uses existing App Runner config:

```bash
# Auth
OIDC_AUTHORITY=https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_JiQF0xM04
OIDC_CLIENT_ID=6mvn1gc775h8ibei5phrkk60l1

# Database
DATABASE_URL=postgresql://apex_admin:...@nomad-apex-db.cxe4igg44f5w.eu-west-1.rds.amazonaws.com:5432/apex
PGSSL=1

# APIM (Phase 2+)
APIM_HOST=https://nomad-apex.azure-api.net
APIM_SUBSCRIPTION_KEY=101dda01e4224459aca098ac88ba8e11

# OpenAI (Phase 4)
OPENAI_API_KEY=sk-proj-...
```

---

## Phase 1: Current Implementation

### What Works

✅ **POST /research/start**
- Creates run in `o1_research_runs` table
- Returns run_id immediately
- Background processing starts async

✅ **GET /research/stream/:id**
- SSE streaming with correct headers
- Emits 6 event types (thinking, tool.call, tool.result, section.completed, research.completed, error)
- Hardcoded events for Portal testing
- Updates database with final report

✅ **Authentication**
- Uses existing JWKS Bearer token validation
- User auto-created from JWT if not exists

✅ **Database**
- New tables: `o1_research_runs` and `o1_research_activities`
- Separate from legacy `research_runs` table
- JSONB for flexible metadata

### What's Hardcoded (Phase 1)

- Thinking events (pre-scripted)
- Tool calls (simulated)
- Report content (template)
- Timing (sleep delays)

### Testing Phase 1

```bash
# Health check (requires auth)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://gzejipnqbh.eu-west-1.awsapprunner.com/research/health

# Start research
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "Test query", "depth": "medium"}' \
  https://gzejipnqbh.eu-west-1.awsapprunner.com/research/start

# Stream events (SSE)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://gzejipnqbh.eu-west-1.awsapprunner.com/research/stream/RUN_ID
```

---

## Phase 2: Next Steps

**Goal:** Replace hardcoded events with real APIM processing

### Changes Needed

1. **File Retrieval**
   - Implement `getFileContent(uploadId)` to retrieve parsed files from ADI
   - Files were already parsed during upload via `/adi/analyze`

2. **APIM Integration**
   - Use existing `callAPIM()` function from `agenticFlow.ts`
   - Send file content + query to APIM
   - Parse APIM response for insights

3. **Dynamic Report Generation**
   - Generate report based on APIM analysis
   - Include actual findings from uploaded files
   - Emit real thinking events

4. **Real-Time Events**
   - Replace sleep() delays with actual processing time
   - Emit thinking as APIM processes
   - Stream tool results as they complete

### Code Changes (Phase 2)

```typescript
// In processResearch():
// 1. Retrieve file contents
const fileContents = await Promise.all(
  files.map(id => getFileContent(id))
);

// 2. Call APIM for analysis
const analysis = await callAPIM([
  { role: 'system', content: 'Analyze these documents' },
  { role: 'user', content: query },
  { role: 'user', content: fileContents.join('\n\n') }
]);

// 3. Emit real thinking
emit('thinking', {
  thought: analysis.thinking,
  thought_type: 'analyzing'
});

// 4. Generate report
const report = await callAPIM([
  { role: 'system', content: 'Create research report' },
  { role: 'user', content: JSON.stringify(analysis) }
]);
```

---

## Phase 3: Continuous Reasoning

**Goal:** Implement o1-style adaptive reasoning loop

### Features

- **Dynamic Planning:** LLM decides next action (not fixed steps)
- **Self-Critique:** LLM assesses own work quality
- **Pivot Logic:** Change approach if current one isn't working
- **Section Building:** Incremental coherent output
- **Quality Gates:** Don't proceed if quality score < threshold

### Reasoning Loop

```typescript
while (!done) {
  // 1. Think about next action
  thought = await llm.think(context, previousThoughts);
  emit('thinking', thought);
  
  // 2. Execute action
  result = await executeAction(thought.action);
  emit('tool.result', result);
  
  // 3. Self-assess
  assessment = await llm.assess(result);
  emit('thinking', assessment);
  
  // 4. Check if section complete
  if (llm.isSectionComplete()) {
    section = await llm.synthesizeSection();
    emit('section.completed', section);
  }
  
  // 5. Check if research complete
  if (llm.isComplete()) {
    done = true;
  }
}
```

---

## Phase 4: External Search

**Goal:** Add OpenAI web search for public research

### Features

- **Tool Selection Logic:**
  - Uploaded files? → APIM (secure)
  - External research? → OpenAI (public web)
  - Default → APIM (more secure)

- **OpenAI Search Tool:**
  - Search public web
  - Find recent articles/news
  - Return sources with content

- **Synthesis:**
  - Combine internal (APIM) + external (OpenAI) findings
  - Use APIM to synthesize final report (keeps data secure)

---

## Deployment

### Local Development

```bash
# 1. Run migration
psql $DATABASE_URL -f migrations/023_research_runs.sql

# 2. Start API
npm run dev

# 3. Test health
curl http://localhost:8080/health  # Should return {"ok": true}
```

### AWS App Runner Staging

```bash
# 1. Push to GitHub
git push origin staging

# 2. Wait for App Runner deployment (3-5 min)

# 3. Run migration in RDS
psql $DATABASE_URL -f migrations/023_research_runs.sql

# 4. Test
curl https://gzejipnqbh.eu-west-1.awsapprunner.com/health
```

---

## Files Changed

```
migrations/023_research_runs.sql       (NEW - DB schema)
src/routes/research.ts                 (REPLACED - SSE endpoints)
docs/PHASE_1_DEPLOYMENT.md             (NEW - Deployment guide)
docs/RESEARCH_MODE_README.md           (NEW - This file)
```

---

## Success Criteria

### Phase 1 ✅
- [x] Database tables created
- [x] POST /research/start returns run_id
- [x] GET /research/stream/:id emits SSE events
- [x] Portal displays thinking events
- [x] Final report appears in Portal
- [x] No linter errors
- [x] TypeScript compiles
- [x] Aligned with Kevin's plan

### Phase 2 (Next)
- [ ] Retrieve file content by uploadId
- [ ] Call APIM for analysis
- [ ] Generate dynamic reports
- [ ] Emit real thinking events

### Phase 3 (Future)
- [ ] Continuous reasoning loop
- [ ] Self-critique mechanism
- [ ] Pivot logic
- [ ] Section building

### Phase 4 (Future)
- [ ] OpenAI search integration
- [ ] Tool selection logic
- [ ] Combined synthesis

---

## Links

- **Portal Staging:** https://staging.d2umjimd2ilqq7.amplifyapp.com
- **API Staging:** https://gzejipnqbh.eu-west-1.awsapprunner.com
- **Portal Spec:** `/Users/benbarrett/APEX-Portal-Prod-3/.context/API_REPO_PROMPT_CORRECTED.md`
- **Tool Architecture:** `/Users/benbarrett/APEX-Portal-Prod-3/.context/TOOL_ARCHITECTURE_CORRECTED.md`

---

**Phase 1 Status:** ✅ COMPLETE - Ready to deploy to staging

