/**
 * Output Management Routes
 * Save generated reports, charts, templates, plans to files database
 * Per Kevin's plan: All business logic in API
 */

import { Router } from 'express';
import { query as dbQuery } from '../db/query.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * Save generated output to files
 * POST /outputs/save
 */
router.post('/save', async (req, res) => {
  try {
    const { content, title, type, runId, metadata } = req.body;
    
    // Extract user from validated JWT (per Kevin's plan)
    const userId = req.auth?.sub as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    if (!content || !title || !type) {
      return res.status(400).json({ error: 'content, title, and type are required' });
    }
    
    // Validate type and map to document kind
    const validTypes = ['report', 'research', 'template', 'chart', 'plan'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
      });
    }
    
    // Map type to document kind (documents table only supports: report, plan, research, sim_day)
    const kindMap: Record<string, string> = {
      'report': 'report',
      'research': 'research',
      'template': 'report', // Templates saved as reports
      'chart': 'report',    // Charts saved as reports
      'plan': 'plan'
    };
    const kind = kindMap[type] || 'report';
    
    const documentId = uuidv4();
    const fileSize = Buffer.byteLength(content, 'utf8');
    
    console.log(`[SaveOutput] Saving ${type}: ${title} (${fileSize} bytes)`);
    
    // Insert into documents table
    await dbQuery(
      `INSERT INTO documents (
        id, 
        org_id, 
        kind,
        title,
        status,
        spec_json,
        created_by,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        documentId,
        orgId,
        kind,
        title,
        'final',
        JSON.stringify({
          content,
          type,
          runId,
          generated: true,
          generatedAt: new Date().toISOString(),
          size: fileSize,
          ...metadata
        }),
        userId  // $7 - created_by
      ]
    );
    
    console.log(`[SaveOutput] ✅ Saved ${type} as ${title} (document_id: ${documentId})`);
    
    res.json({
      success: true,
      uploadId: documentId, // Return as uploadId for compatibility
      documentId,
      fileName: `${title}.md`,
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} saved successfully`
    });
    
  } catch (error: any) {
    console.error('[SaveOutput] Error saving output:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to save output to database'
    });
  }
});

/**
 * Get user's generated outputs
 * GET /outputs
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.auth?.sub as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    const type = req.query.type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    let query = `
      SELECT 
        id as upload_id,
        title as file_name,
        kind,
        spec_json->>'size' as file_size,
        spec_json as metadata,
        created_at
      FROM documents
      WHERE org_id = $1 
        AND spec_json->>'generated' = 'true'
        AND status = 'final'
    `;
    
    const params: any[] = [orgId];
    
    if (type) {
      query += ` AND spec_json->>'type' = $2`;
      params.push(type);
      query += ` ORDER BY created_at DESC LIMIT $3 OFFSET $4`;
      params.push(limit, offset);
    } else {
      query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
      params.push(limit, offset);
    }
    
    const result = await dbQuery(query, params);
    
    res.json({
      outputs: result.rows,
      count: result.rows.length
    });
    
  } catch (error: any) {
    console.error('[SaveOutput] Error fetching outputs:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch outputs'
    });
  }
});

/**
 * Get specific output content
 * GET /outputs/:uploadId
 */
router.get('/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.auth?.sub as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    // Get document content
    const result = await dbQuery(
      `SELECT 
        id,
        title,
        kind,
        spec_json
      FROM documents
      WHERE id = $1 
        AND org_id = $2
        AND spec_json->>'generated' = 'true'
        AND status = 'final'`,
      [uploadId, orgId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Output not found' });
    }
    
    const doc = result.rows[0];
    const specJson = doc.spec_json;
    
    res.json({
      content: specJson.content,
      fileName: `${doc.title}.md`,
      mimeType: 'text/markdown',
      metadata: specJson
    });
    
  } catch (error: any) {
    console.error('[SaveOutput] Error fetching output:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch output content'
    });
  }
});

/**
 * Delete saved output
 * DELETE /outputs/:uploadId
 */
router.delete('/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.auth?.sub as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    // Soft delete document (set status to 'deleted')
    await dbQuery(
      `UPDATE documents
       SET status = 'deleted', updated_at = NOW()
       WHERE id = $1 
         AND org_id = $2 
         AND spec_json->>'generated' = 'true'`,
      [uploadId, orgId]
    );
    
    res.json({
      success: true,
      message: 'Output deleted successfully'
    });
    
  } catch (error: any) {
    console.error('[SaveOutput] Error deleting output:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to delete output'
    });
  }
});

export default router;

