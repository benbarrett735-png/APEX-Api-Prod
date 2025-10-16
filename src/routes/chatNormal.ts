/**
 * Normal Chat Route
 * 
 * Simple chatbot mode - APIM + chat history
 * NO agent functionality here - see chatAgent.ts for that
 */

import { Router } from "express";
import { NormalChatService } from "../services/normalChatService.js";

const router = Router();

/**
 * POST /chat/normal
 * 
 * Simple chat with APIM - streaming response
 * Body: { messages: [{role, content}], fileContext?: string }
 */
router.post("/", async (req, res) => {
  try {
    const { messages, fileContext } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        error: "invalid_request", 
        detail: "messages array required" 
      });
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
                if (chunkCount === 1) {
                  console.log('[NormalChat] First chunk received');
                }
                // Forward to client
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
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

export default router;

