# Follow-Up Chat for Research Reports

## Overview
After a research report is completed, users can ask follow-up questions about the report in a conversational manner without triggering new research.

---

## API Endpoint

### `POST /research/:runId/chat`

**Purpose:** Answer follow-up questions about a completed research report

**Authentication:** Required (JWT)

**Parameters:**
- `runId` (path) - The ID of the completed research run

**Request Body:**
```json
{
  "message": "Can you explain the market analysis section in more detail?"
}
```

**Response:**
```json
{
  "run_id": "run_1234567890_abc123",
  "message": "Based on the market analysis section of the report, Tesla holds...",
  "original_query": "Give me a comprehensive analysis of Tesla in 2024"
}
```

**Error Responses:**
- `400` - Message is required / Research not completed yet / No report content
- `404` - Research run not found
- `500` - Failed to process follow-up question

---

## How It Works

```
1. User completes research
   POST /research/start → returns run_id
   GET /research/stream/:id → generates report
   
2. Research completes
   report_content saved to o1_research_runs table
   
3. User asks follow-up question
   POST /research/:runId/chat { message: "..." }
   
4. Backend:
   - Retrieves full report from database
   - Sends to APIM with report as context
   - APIM answers conversationally
   - Returns answer
```

---

## Portal Integration

### State Management

```typescript
interface ResearchState {
  runId: string | null;
  status: 'idle' | 'planning' | 'researching' | 'completed';
  report: string | null;
  chatMode: boolean; // NEW: true after research completes
}
```

### After Research Completes

```typescript
// When research.completed event received:
setResearchState({
  runId: event.run_id,
  status: 'completed',
  report: event.report_content,
  chatMode: true // Enable chat mode
});

// Show indicator to user:
<div className="chat-mode-banner">
  Research completed! Ask follow-up questions about the report.
</div>
```

### Sending Follow-Up Messages

```typescript
async function sendFollowUpMessage(runId: string, message: string) {
  try {
    const response = await fetch(`${API_URL}/research/${runId}/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error('Follow-up chat failed');
    }

    const data = await response.json();
    return data.message; // The APIM response
  } catch (error) {
    console.error('[Follow-up Chat] Error:', error);
    throw error;
  }
}
```

### Message Flow UI

```typescript
// In chat input handler:
const handleSendMessage = async (message: string) => {
  if (researchState.chatMode && researchState.runId) {
    // Follow-up chat mode
    const answer = await sendFollowUpMessage(researchState.runId, message);
    
    // Display in chat:
    addMessage({ role: 'user', content: message });
    addMessage({ role: 'assistant', content: answer });
  } else {
    // Normal research mode
    // Start new research...
  }
};
```

### Exiting Chat Mode

```typescript
// User wants to start new research:
const startNewResearch = () => {
  setResearchState({
    runId: null,
    status: 'idle',
    report: null,
    chatMode: false
  });
};
```

---

## Example Conversations

### Example 1: Clarification

**User:** "Give me a quick summary of Tesla"  
**System:** *[Generates 2-paragraph report]*  

**User:** "Can you explain their market position?"  
**API:** `POST /research/{runId}/chat`  
**Response:** "According to the report, Tesla holds approximately 20% of the global EV market in 2024, making them the market leader. Their revenue reached $85 billion..."

---

### Example 2: Expansion

**User:** "Research Cabot's Cookery School opportunities"  
**System:** *[Generates comprehensive report with sections]*  

**User:** "Tell me more about the competitive landscape"  
**API:** `POST /research/{runId}/chat`  
**Response:** "The report identified several key competitors in the culinary education space. Cabot's main differentiation is their 12-acre organic farm..."

---

### Example 3: Summarization

**User:** "Comprehensive analysis of React vs Vue"  
**System:** *[Generates 10-page technical comparison]*  

**User:** "Give me a 3-sentence summary"  
**API:** `POST /research/{runId}/chat`  
**Response:** "React has a larger market share (65%) and stronger ecosystem, but Vue offers simpler learning curve and better performance in specific scenarios. React is better for large enterprise apps, Vue for smaller teams and rapid prototyping. Job market strongly favors React with 3x more postings."

---

### Example 4: Outside Report Scope

**User:** "Research Tesla 2024"  
**System:** *[Generates report about Tesla]*  

**User:** "What about Apple?"  
**API:** `POST /research/{runId}/chat`  
**Response:** "The report focused on Tesla and doesn't contain information about Apple. Would you like me to start a new research query about Apple instead?"

---

## Best Practices

### For Portal UI

1. **Visual Indicator**: Show users they're in "chat mode" after research completes
2. **Context Awareness**: Display original query and report title
3. **New Research Button**: Easy way to exit chat mode and start fresh
4. **Loading States**: Show when follow-up is being processed
5. **Error Handling**: Graceful fallback if follow-up fails

### For Users

Suggest prompts after research completes:
- "Can you summarize the key findings?"
- "Explain [section name] in more detail"
- "What are the main recommendations?"
- "Make this shorter"
- "Compare [X] vs [Y] from the report"

---

## Technical Notes

### Performance
- Report retrieval: Fast (indexed query on runId + userId)
- APIM processing: ~2-5 seconds depending on report length
- No SSE needed (single response)

### Security
- User can only chat about their own research (userId check)
- No access to other users' reports
- Report must be completed (status check)

### Limitations
- Chat is stateless (each message sends full report context)
- For very long reports (>20k chars), APIM might truncate
- No conversation history (each message is independent)

### Future Enhancements
- Store chat history per runId
- Multi-turn conversations with context
- Ability to update/refine research based on chat
- Export chat transcript along with report

---

## Testing

### cURL Example

```bash
# After completing a research:
RUN_ID="run_1234567890_abc123"
TOKEN="your-jwt-token"

curl -X POST "http://localhost:3000/research/$RUN_ID/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Can you summarize the key findings?"}'
```

### Expected Response
```json
{
  "run_id": "run_1234567890_abc123",
  "message": "Based on the research report, the key findings are: 1. Tesla holds 20% market share...",
  "original_query": "Give me a quick summary of Tesla"
}
```

---

## Status
✅ **Backend:** Implemented  
✅ **Endpoint:** `/research/:runId/chat`  
🔲 **Portal:** Needs implementation  
🔲 **Testing:** Needs manual testing with real reports  

---

## Questions?
See `src/routes/research.ts` lines 1486-1582 for implementation details.

