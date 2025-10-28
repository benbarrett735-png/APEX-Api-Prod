/**
 * Normal Chat Route
 * 
 * Simple chatbot mode - APIM + chat history
 * NO agent functionality here - see chatAgent.ts for that
 */

import { Router } from "express";
import { NormalChatService } from "../services/normalChatService.js";
import { query as dbQuery } from "../db/query.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Apply auth middleware
router.use(requireAuth);

/**
 * POST /chat/normal
 * 
 * Simple chat with APIM - streaming response
 * Body: { messages: [{role, content}], fileContext?: string, sessionId?: string }
 */
router.post("/", async (req, res) => {
  try {
    const { messages, fileContext, sessionId: clientSessionId } = req.body;
    const userId = req.auth?.sub as string;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        error: "invalid_request", 
        detail: "messages array required" 
      });
    }

    // Get or create session
    let sessionId = clientSessionId;
    if (!sessionId) {
      sessionId = uuidv4();
      // Create new session with title from first message
      const firstUserMsg = messages.find((m: any) => m.role === 'user');
      const title = firstUserMsg?.content?.substring(0, 50) || 'New Chat';
      
      await dbQuery(
        `INSERT INTO chat_sessions (session_id, user_id, title, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (session_id) DO NOTHING`,
        [sessionId, userId, title]
      );
      console.log(`[NormalChat] Created new session: ${sessionId}`);
    }

    // Save the user's latest message (last message should be from user)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      await dbQuery(
        `INSERT INTO chat_history (user_id, session_id, message_role, message_content, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, sessionId, 'user', lastMessage.content]
      );
    }

    // Disable timeouts for streaming
    req.socket.setTimeout(0);
    res.socket?.setTimeout(0);

    // Set SSE headers
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("connection", "keep-alive");
    res.setHeader("access-control-allow-origin", "*");

    console.log('[NormalChat] Request:', { 
      messageCount: messages.length, 
      hasFileContext: !!fileContext 
    });

    // If there's file context, prepend it to the last user message
    let processedMessages = [...messages];
    if (fileContext && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user') {
        processedMessages = [
          ...messages.slice(0, -1),
          {
            ...lastMessage,
            content: `${fileContext}\n\n${lastMessage.content}`
          }
        ];
        console.log('[NormalChat] Added file context to last message');
      }
    }

    // Create chat service and stream response
    const chatService = new NormalChatService();
    const systemPrompt = chatService.getDefaultSystemPrompt();
    
    const apimResponse = await chatService.streamChat(processedMessages, systemPrompt);

    // Stream APIM response to client
    if (!apimResponse.body) {
      console.error('[NormalChat] No response body from APIM');
      res.write(`data: ${JSON.stringify({ error: "no_response_body" })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      return res.end();
    }

    let buffer = "";
    let chunkCount = 0;
    let assistantResponse = ""; // ✅ Accumulate full response to save to DB

    const reader = apimResponse.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log(`[NormalChat] Stream completed (${chunkCount} chunks)`);
          break;
        }

        const chunkStr = decoder.decode(value, { stream: true });
        buffer += chunkStr;
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            try {
              const data = JSON.parse(dataStr);
              
              // Extract content from Azure OpenAI format
              const content = data.choices?.[0]?.delta?.content || "";
              
              if (content) {
                chunkCount++;
                assistantResponse += content; // ✅ Accumulate for DB
                if (chunkCount === 1) {
                  console.log('[NormalChat] First chunk received');
                }
                // Forward to client (include sessionId in first chunk)
                if (chunkCount === 1) {
                  res.write(`data: ${JSON.stringify({ content, sessionId })}\n\n`);
                } else {
                  res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
              }
            } catch (parseError) {
              console.error("[NormalChat] Parse error:", dataStr.substring(0, 100));
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // ✅ Save assistant's response to DB
    if (assistantResponse.trim()) {
      await dbQuery(
        `INSERT INTO chat_history (user_id, session_id, message_role, message_content, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, sessionId, 'assistant', assistantResponse]
      );
      console.log(`[NormalChat] Saved assistant response (${assistantResponse.length} chars) to session ${sessionId}`);
    }

    // Update session timestamp
    await dbQuery(
      `UPDATE chat_sessions SET updated_at = NOW() WHERE session_id = $1`,
      [sessionId]
    );

    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (e: any) {
    console.error("[NormalChat] Error:", e);
    if (!res.headersSent) {
      res.status(502).json({ 
        error: "chat_failed", 
        detail: String(e?.message || e) 
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: "stream_error", detail: String(e?.message || e) })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
});

/**
 * GET /chat/normal/sessions
 * 
 * Get user's chat sessions (list of conversations)
 */
router.get("/sessions", async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    
    const result = await dbQuery(
      `SELECT session_id, title, created_at, updated_at
       FROM chat_sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({ sessions: result.rows });
  } catch (e: any) {
    console.error("[NormalChat] Error fetching sessions:", e);
    res.status(500).json({ error: "failed_to_fetch_sessions" });
  }
});

/**
 * GET /chat/normal/history/:sessionId
 * 
 * Get chat history for a specific session
 */
router.get("/history/:sessionId", async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const { sessionId } = req.params;
    
    // Verify session belongs to user
    const sessionCheck = await dbQuery(
      `SELECT 1 FROM chat_sessions WHERE session_id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    
    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: "session_not_found" });
    }

    const result = await dbQuery(
      `SELECT message_role as role, message_content as content, created_at
       FROM chat_history
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    res.json({ 
      sessionId,
      messages: result.rows.map(r => ({ role: r.role, content: r.content }))
    });
  } catch (e: any) {
    console.error("[NormalChat] Error fetching history:", e);
    res.status(500).json({ error: "failed_to_fetch_history" });
  }
});

/**
 * DELETE /chat/normal/sessions/:sessionId
 * 
 * Delete a chat session and its history
 */
router.delete("/sessions/:sessionId", async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const { sessionId } = req.params;
    
    // Delete history first (foreign key constraint)
    await dbQuery(
      `DELETE FROM chat_history 
       WHERE session_id = $1 
       AND user_id = $2`,
      [sessionId, userId]
    );
    
    // Delete session
    const result = await dbQuery(
      `DELETE FROM chat_sessions 
       WHERE session_id = $1 
       AND user_id = $2
       RETURNING session_id`,
      [sessionId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "session_not_found" });
    }

    res.json({ success: true, deleted: sessionId });
  } catch (e: any) {
    console.error("[NormalChat] Error deleting session:", e);
    res.status(500).json({ error: "failed_to_delete_session" });
  }
});

export default router;

