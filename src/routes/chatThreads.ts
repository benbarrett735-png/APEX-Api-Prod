/**
 * Chat Threads Route (Agent Mode)
 * 
 * Manages chat threads and messages for agent mode conversations
 * Portal stores threads in localStorage - this migrates to PostgreSQL
 */

import { Router } from "express";
import { query as dbQuery } from "../db/query.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Apply auth middleware
router.use(requireAuth);

/**
 * GET /chat/threads
 * 
 * Get all threads for the authenticated user
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    // Convert org_id to UUID if it's a string (handle both formats)
    const orgIdUuid = orgId.length === 36 && orgId.includes('-') ? orgId : '00000000-0000-0000-0000-000000000001';
    
    const result = await dbQuery(
      `SELECT 
        id,
        title,
        mode,
        metadata,
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM chat_threads
       WHERE user_id = $1 AND org_id = $2::uuid
       ORDER BY updated_at DESC
       LIMIT 100`,
      [userId, orgIdUuid]
    );

    // Transform to Portal format
    const threads = await Promise.all(result.rows.map(async (row) => {
      // Get message count for each thread
      const msgCount = await dbQuery(
        `SELECT COUNT(*) as count FROM chat_messages WHERE thread_id = $1`,
        [row.id]
      );
      
      return {
        id: row.id,
        title: row.title,
        mode: row.mode || 'agent',
        messages: [], // Messages loaded separately via /threads/:id/messages
        agentMode: row.metadata?.agentMode || null,
        selectedCharts: row.metadata?.selectedCharts || [],
        selectedResearch: row.metadata?.selectedResearch || [],
        selectedTemplates: row.metadata?.selectedTemplates || [],
        selectedPlans: row.metadata?.selectedPlans || [],
        updatedAt: row.updatedAt
      };
    }));

    res.json({ threads });
  } catch (e: any) {
    console.error("[ChatThreads] Error fetching threads:", e);
    res.status(500).json({ error: "failed_to_fetch_threads", detail: String(e.message) });
  }
});

/**
 * POST /chat/threads
 * 
 * Create a new thread
 */
router.post("/", async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';
    const { title, mode, agentMode, selectedCharts, selectedResearch, selectedTemplates, selectedPlans } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    const metadata = {
      agentMode: agentMode || null,
      selectedCharts: selectedCharts || [],
      selectedResearch: selectedResearch || [],
      selectedTemplates: selectedTemplates || [],
      selectedPlans: selectedPlans || []
    };

    // Convert org_id to UUID if it's a string (handle both formats)
    const orgIdUuid = orgId.length === 36 && orgId.includes('-') ? orgId : '00000000-0000-0000-0000-000000000001';
    
    const result = await dbQuery(
      `INSERT INTO chat_threads (id, org_id, user_id, title, mode, metadata, created_at, updated_at)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, title, mode, metadata, created_at as "createdAt", updated_at as "updatedAt"`,
      [uuidv4(), orgIdUuid, userId, title || null, mode || 'agent', JSON.stringify(metadata)]
    );

    const thread = result.rows[0];
    res.json({
      id: thread.id,
      title: thread.title,
      mode: thread.mode,
      messages: [],
      agentMode: thread.metadata?.agentMode || null,
      selectedCharts: thread.metadata?.selectedCharts || [],
      selectedResearch: thread.metadata?.selectedResearch || [],
      selectedTemplates: thread.metadata?.selectedTemplates || [],
      selectedPlans: thread.metadata?.selectedPlans || [],
      updatedAt: thread.updatedAt
    });
  } catch (e: any) {
    console.error("[ChatThreads] Error creating thread:", e);
    res.status(500).json({ error: "failed_to_create_thread", detail: String(e.message) });
  }
});

/**
 * GET /chat/threads/:id/messages
 * 
 * Get all messages for a specific thread
 */
router.get("/:id/messages", async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    // Verify thread belongs to user
    const threadCheck = await dbQuery(
      `SELECT 1 FROM chat_threads WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ error: "thread_not_found" });
    }

    const result = await dbQuery(
      `SELECT 
        id,
        role,
        content_json as "contentJson",
        metadata,
        created_at as "createdAt"
       FROM chat_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    // Transform to Portal message format
    const messages = result.rows.map(row => {
      let contentJson;
      try {
        contentJson = typeof row.contentJson === 'string' 
          ? JSON.parse(row.contentJson) 
          : row.contentJson;
      } catch (e) {
        console.error('[ChatThreads] Failed to parse contentJson for message:', row.id, e);
        // Fallback: treat as plain string
        contentJson = String(row.contentJson);
      }
      
      return {
        id: row.id,
        role: row.role,
        content: typeof contentJson === 'string' ? contentJson : contentJson.content || '',
        timestamp: new Date(row.createdAt).getTime(),
        files: row.metadata?.files || [],
        researchState: row.metadata?.researchState,
        metadata: row.metadata?.metadata || row.metadata || {}
      };
    });

    res.json({ messages });
  } catch (e: any) {
    console.error("[ChatThreads] Error fetching messages:", e);
    res.status(500).json({ error: "failed_to_fetch_messages", detail: String(e.message) });
  }
});

/**
 * POST /chat/threads/:id/messages
 * 
 * Add a message to a thread
 */
router.post("/:id/messages", async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';
    const { id } = req.params;
    const { role, content, timestamp, files, researchState, metadata } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    if (!role || !content) {
      return res.status(400).json({ error: 'role and content required' });
    }

    // Verify thread belongs to user
    const threadCheck = await dbQuery(
      `SELECT 1 FROM chat_threads WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ error: "thread_not_found" });
    }

    // Store content as valid JSON (always stringify to ensure valid JSON)
    const contentJson = JSON.stringify(content);
    
    // Store Portal metadata
    const messageMetadata = {
      files: files || [],
      researchState: researchState || null,
      metadata: metadata || {}
    };

    // Convert org_id to UUID if it's a string (handle both formats)
    const orgIdUuid = orgId.length === 36 && orgId.includes('-') ? orgId : '00000000-0000-0000-0000-000000000001';
    
    const result = await dbQuery(
      `INSERT INTO chat_messages (id, org_id, user_id, thread_id, role, content_json, metadata, created_at)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, COALESCE(to_timestamp($8::bigint / 1000.0), NOW()))
       RETURNING id, role, content_json as "contentJson", metadata, created_at as "createdAt"`,
      [
        uuidv4(),
        orgIdUuid,
        userId,
        id,
        role,
        contentJson,
        JSON.stringify(messageMetadata),
        timestamp || Date.now()
      ]
    );

    // Update thread updated_at timestamp
    await dbQuery(
      `UPDATE chat_threads SET updated_at = NOW() WHERE id = $1`,
      [id]
    );

    const row = result.rows[0];
    const contentJsonParsed = typeof row.contentJson === 'string' 
      ? row.contentJson 
      : row.contentJson.content || '';

    res.json({
      id: row.id,
      role: row.role,
      content: contentJsonParsed,
      timestamp: new Date(row.createdAt).getTime(),
      files: row.metadata?.files || [],
      researchState: row.metadata?.researchState,
      metadata: row.metadata?.metadata || {}
    });
  } catch (e: any) {
    console.error("[ChatThreads] Error adding message:", e);
    res.status(500).json({ error: "failed_to_add_message", detail: String(e.message) });
  }
});

/**
 * PUT /chat/threads/:id
 * 
 * Update thread (title, metadata)
 */
router.put("/:id", async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const { id } = req.params;
    const { title, agentMode, selectedCharts, selectedResearch, selectedTemplates, selectedPlans } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    // Verify thread belongs to user
    const threadCheck = await dbQuery(
      `SELECT metadata FROM chat_threads WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ error: "thread_not_found" });
    }

    // Merge metadata
    const existingMetadata = threadCheck.rows[0].metadata || {};
    const metadata = {
      ...existingMetadata,
      ...(agentMode !== undefined && { agentMode }),
      ...(selectedCharts !== undefined && { selectedCharts }),
      ...(selectedResearch !== undefined && { selectedResearch }),
      ...(selectedTemplates !== undefined && { selectedTemplates }),
      ...(selectedPlans !== undefined && { selectedPlans })
    };

    const result = await dbQuery(
      `UPDATE chat_threads 
       SET title = COALESCE($1, title),
           metadata = $2,
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING id, title, mode, metadata, updated_at as "updatedAt"`,
      [title || null, JSON.stringify(metadata), id, userId]
    );

    const thread = result.rows[0];
    res.json({
      id: thread.id,
      title: thread.title,
      mode: thread.mode,
      agentMode: thread.metadata?.agentMode || null,
      selectedCharts: thread.metadata?.selectedCharts || [],
      selectedResearch: thread.metadata?.selectedResearch || [],
      selectedTemplates: thread.metadata?.selectedTemplates || [],
      selectedPlans: thread.metadata?.selectedPlans || [],
      updatedAt: thread.updatedAt
    });
  } catch (e: any) {
    console.error("[ChatThreads] Error updating thread:", e);
    res.status(500).json({ error: "failed_to_update_thread", detail: String(e.message) });
  }
});

/**
 * DELETE /chat/threads/:id
 * 
 * Delete a thread and all its messages
 */
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    // Verify thread belongs to user and delete (CASCADE will delete messages)
    const result = await dbQuery(
      `DELETE FROM chat_threads 
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "thread_not_found" });
    }

    res.json({ success: true, deleted: id });
  } catch (e: any) {
    console.error("[ChatThreads] Error deleting thread:", e);
    res.status(500).json({ error: "failed_to_delete_thread", detail: String(e.message) });
  }
});

export default router;

