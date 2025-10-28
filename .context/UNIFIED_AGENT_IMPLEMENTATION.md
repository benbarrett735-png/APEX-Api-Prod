# Unified Agent System Implementation

## ✅ COMPLETED (API Repository)

### 1. Unified Agent Orchestrator (`src/services/unifiedOrchestrator.ts`)
- **Tool-based planning architecture** - Adapts research thinking system for ALL modes
- **Mode-specific tools** - Different tools for reports, charts, templates, plans, research
- **Dynamic plan creation** - APIM analyzes query and creates execution plan
- **Tool execution engine** - Executes analyze_documents, search_web, generate_chart, compile_report
- **Final compilation** - Gathers all results and compiles final output using APIM

**Key Features:**
- Subject extraction (not just query keywords)
- Format adaptation (brief/standard/comprehensive)
- Document analysis integration
- Web search integration (OpenAI)
- Chart generation hooks
- Template structure enforcement

### 2. Outputs Management (`src/routes/outputs.ts`)
- **POST /outputs/save** - Save generated content to files database
- **GET /outputs** - List user's saved outputs (filtered by type)
- **GET /outputs/:uploadId** - Get specific output content
- **DELETE /outputs/:uploadId** - Delete saved output
- **Integration with uploads/files tables** - Uses existing schema
- **Metadata tracking** - Stores type, runId, generation timestamp

**Supported Types:**
- `report` - Business reports
- `research` - Research outputs
- `template` - Template-based documents
- `chart` - Chart visualizations
- `plan` - Strategic plans

### 3. Mode Support Expanded
- **templates** mode - Now supported in agentic-flow
- **plans** mode - Now supported in agentic-flow
- All modes route through unified orchestrator
- Consistent tool-based execution

### 4. API Routes Updated
- `/outputs/*` - New output management endpoints
- `/agentic-flow/runs` - Now accepts templates and plans modes
- Registered in `src/index.ts`

---

## 🚧 TODO (Portal Repository)

### 1. Integrate CodeBlockActions Component
**File:** `components/chat/Messages.tsx` (LARGE FILE - needs careful integration)

**What to do:**
```tsx
import { CodeBlockActions } from './CodeBlockActions';

// Find where code blocks are rendered (look for <pre> or bg-gray-900 className)
// Add CodeBlockActions above the code content:

<div className="relative">
  <div className="absolute top-2 right-2 z-10">
    <CodeBlockActions
      content={codeContent}
      language={language}
      title={messageTitle}
      isAgent={isAgentMessage}  // true for reports/research/templates/charts/plans
      mode={agentMode}  // 'report', 'research', 'template', 'chart', 'plan'
      runId={runId}  // from message metadata
    />
  </div>
  
  <pre className="...">
    <code>{codeContent}</code>
  </pre>
</div>
```

**Detect Agent Messages:**
- Check if message has `runId` in metadata
- Check if message mode is 'reports', 'research', 'templates', 'charts', or 'plans'
- Only show Save button for agent outputs

### 2. Update Files Page (`pages/files/index.tsx`)
**Add filter for generated outputs:**

```tsx
const [filter, setFilter] = useState<'all' | 'uploaded' | 'generated'>('all');

// Add tabs/buttons:
<div className="flex gap-2 mb-4">
  <button onClick={() => setFilter('all')}>All Files</button>
  <button onClick={() => setFilter('uploaded')}>Uploaded</button>
  <button onClick={() => setFilter('generated')}>Generated</button>
</div>

// Filter files based on metadata:
const filteredFiles = files.filter(file => {
  if (filter === 'uploaded') return !file.metadata?.generated;
  if (filter === 'generated') return file.metadata?.generated === true;
  return true;
});

// Show type badge for generated files:
{file.metadata?.generated && (
  <span className="badge">{file.metadata.type}</span>
)}
```

### 3. Add Plans Mode UI (in `pages/chat.tsx`)
**Add Plans button selection UI** (similar to reports/templates):

```tsx
{agentMode === 'plans' && (
  <div className="space-y-4 bg-gray-50 rounded-2xl p-6">
    <h3>Select Plan Format</h3>
    <div className="grid grid-cols-3 gap-2">
      {['strategic_plan', 'project_plan', 'marketing_plan', 'business_plan', 'operational_plan'].map(format => (
        <button
          key={format}
          onClick={() => setPlanFormat(format)}
          className={`px-3 py-2 rounded-lg ${
            planFormat === format ? 'bg-blue-500 text-white' : 'bg-white'
          }`}
        >
          {format.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </button>
      ))}
    </div>
    
    {/* Plan depth */}
    <div>
      <label>Plan Depth</label>
      <select value={reportLength} onChange={e => setReportLength(e.target.value)}>
        <option value="short">Basic Outline</option>
        <option value="medium">Standard Plan</option>
        <option value="long">Detailed Plan</option>
        <option value="comprehensive">Comprehensive Strategy</option>
      </select>
    </div>
    
    {/* Allow conversational updates */}
    <div className="text-xs text-gray-600">
      💡 Tip: After generating, you can ask to update specific sections
    </div>
  </div>
)}
```

### 4. Message Metadata Tracking
**Ensure messages store runId and mode:**

```tsx
// When creating assistant message:
const assistantMessage = {
  id: uuid(),
  role: 'assistant',
  content: '...',
  metadata: {
    runId: runIdFromAPI,
    mode: agentMode,  // 'reports', 'research', 'templates', 'charts', 'plans'
    timestamp: new Date().toISOString()
  }
};
```

### 5. API Proxy Routes (DONE ✅)
- `/api/outputs/save` - Already created

---

## Architecture Alignment with Kevin's Plan

### ✅ API Repository (APEX-Api-Prod)
1. **All business logic in API** - Unified orchestrator handles all planning/execution
2. **APIM for secure processing** - All text processing through APIM
3. **OpenAI for public search** - External web search via OpenAI API
4. **Database operations** - Outputs saved to uploads/files tables
5. **Authentication** - JWT validation via requireAuth middleware

### ✅ Portal Repository (APEX-Portal-Prod-3)
1. **Thin proxy pattern** - `/api/outputs/save` forwards to backend with auth
2. **UI components only** - CodeBlockActions is pure UI
3. **No business logic** - All decisions made by backend API
4. **Authentication** - next-auth provides JWT tokens

---

## Testing Checklist

### API Testing
```bash
# 1. Test outputs save endpoint
curl -X POST http://localhost:8080/outputs/save \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Test Report\n\nThis is a test.",
    "title": "Test Report",
    "type": "report",
    "runId": "test-123"
  }'

# 2. Test outputs list
curl http://localhost:8080/outputs \
  -H "Authorization: Bearer <JWT>"

# 3. Test outputs by type
curl "http://localhost:8080/outputs?type=report" \
  -H "Authorization: Bearer <JWT>"
```

### Portal Testing
1. Generate a report → Click Copy → Verify copied
2. Generate a report → Click Save → Check /files page
3. Generate research → Click Save → Verify appears in files
4. Filter files by "Generated" → Verify only generated outputs show
5. Click Plans mode → Verify UI shows plan format options
6. Generate a plan → Click Save → Verify saved with type="plan"

---

## Next Steps (Priority Order)

1. **Messages.tsx Integration** - Add CodeBlockActions to code blocks
2. **Files Page Update** - Add generated filter and type badges
3. **Plans Mode UI** - Add plan format selection in chat.tsx
4. **Message Metadata** - Ensure runId and mode are tracked
5. **Testing** - Test all modes with copy/save functionality

---

## Key Files Modified

### API
- ✅ `src/services/unifiedOrchestrator.ts` (NEW)
- ✅ `src/routes/outputs.ts` (NEW)
- ✅ `src/routes/agentic-flow.ts` (UPDATED - templates/plans support)
- ✅ `src/index.ts` (UPDATED - registered outputs routes)

### Portal (TODO)
- 🚧 `components/chat/CodeBlockActions.tsx` (NEW - DONE)
- 🚧 `pages/api/outputs/save.ts` (NEW - DONE)
- 🚧 `components/chat/Messages.tsx` (NEEDS INTEGRATION)
- 🚧 `pages/files/index.tsx` (NEEDS UPDATE)
- 🚧 `pages/chat.tsx` (NEEDS PLANS UI)

