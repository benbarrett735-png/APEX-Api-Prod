/**
 * Reports API Routes
 * Handles report export, download, and sharing functionality
 */

import { Router } from 'express';
import { ReportExporter } from '../services/reportExporter.js';
import { query as dbQuery } from '../db/query.js';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

const router = Router();

// ============================================================================
// Report Export
// ============================================================================

/**
 * Export a report to the specified format
 */
router.post('/export', async (req, res) => {
  try {
    const { session_id, format, styling } = req.body;
    
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    if (!format || !['pdf', 'docx', 'html'].includes(format)) {
      return res.status(400).json({ error: 'Valid format is required (pdf, docx, html)' });
    }

    // Create exporter
    const exporter = new ReportExporter();
    
    // Export report
    const result = await exporter.exportReport({
      session_id,
      format,
      styling
    });

    if (!result.success) {
      return res.status(500).json({ 
        error: 'Export failed',
        details: result.error
      });
    }

    // Log export
    await ReportExporter.logExport(
      session_id, 
      format, 
      result.file_path!, 
      result.file_size!
    );

    res.json({
      success: true,
      download_url: result.download_url,
      file_size: result.file_size,
      format
    });

  } catch (error: any) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Download a report file
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = join('/tmp/reports', filename);
    
    // Check if file exists
    try {
      await stat(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Read file
    const fileBuffer = await readFile(filePath);
    
    // Set appropriate headers
    const ext = filename.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case 'pdf':
        contentType = 'application/pdf';
        break;
      case 'docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'html':
        contentType = 'text/html';
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    res.send(fileBuffer);

  } catch (error: any) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Report Sharing
// ============================================================================

/**
 * Create a shareable link for a report
 */
router.post('/share', async (req, res) => {
  try {
    const { session_id, expires_in_hours, max_access_count } = req.body;
    const userId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000002';
    
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Generate share token
    const shareToken = randomBytes(32).toString('hex');
    
    // Calculate expiration
    const expiresAt = expires_in_hours 
      ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000)
      : null;

    // Create share record
    const result = await dbQuery(
      `INSERT INTO report_shares (session_id, share_token, expires_at, max_access_count, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, share_token, expires_at`,
      [session_id, shareToken, expiresAt, max_access_count, userId]
    );

    const share = result.rows[0];
    const shareUrl = `${req.protocol}://${req.get('host')}/api/reports/shared/${share.share_token}`;

    res.json({
      success: true,
      share_token: share.share_token,
      share_url: shareUrl,
      expires_at: share.expires_at,
      max_access_count
    });

  } catch (error: any) {
    console.error('Error creating share:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Access a shared report
 */
router.get('/shared/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Get share record
    const result = await dbQuery(
      `SELECT * FROM report_shares WHERE share_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const share = result.rows[0];

    // Check expiration
    if (share.expires_at && new Date() > new Date(share.expires_at)) {
      return res.status(410).json({ error: 'Share has expired' });
    }

    // Check access count
    if (share.max_access_count && share.access_count >= share.max_access_count) {
      return res.status(410).json({ error: 'Share access limit reached' });
    }

    // Increment access count
    await dbQuery(
      `UPDATE report_shares SET access_count = access_count + 1 WHERE id = $1`,
      [share.id]
    );

    // Get session data
    const sessionResult = await dbQuery(
      `SELECT * FROM apex_sessions WHERE id = $1`,
      [share.session_id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Get artifacts
    const artifactsResult = await dbQuery(
      `SELECT * FROM apex_artifacts WHERE session_id = $1 ORDER BY created_at ASC`,
      [share.session_id]
    );

    const artifacts = artifactsResult.rows.map(row => ({
      ...row,
      content: JSON.parse(row.content),
      metadata: JSON.parse(row.metadata)
    }));

    res.json({
      session: {
        ...session,
        context: JSON.parse(session.context),
        state: JSON.parse(session.state)
      },
      artifacts,
      share_info: {
        created_at: share.created_at,
        expires_at: share.expires_at,
        access_count: share.access_count + 1,
        max_access_count: share.max_access_count
      }
    });

  } catch (error: any) {
    console.error('Error accessing shared report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List shares for a session
 */
router.get('/shares/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000002';
    
    const result = await dbQuery(
      `SELECT id, share_token, expires_at, access_count, max_access_count, created_at
       FROM report_shares
       WHERE session_id = $1 AND created_by = $2
       ORDER BY created_at DESC`,
      [sessionId, userId]
    );

    const shares = result.rows.map(share => ({
      ...share,
      share_url: `${req.protocol}://${req.get('host')}/api/reports/shared/${share.share_token}`,
      is_expired: share.expires_at ? new Date() > new Date(share.expires_at) : false,
      is_limit_reached: share.max_access_count ? share.access_count >= share.max_access_count : false
    }));

    res.json({ shares });

  } catch (error: any) {
    console.error('Error listing shares:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Revoke a share
 */
router.delete('/shares/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000002';
    
    const result = await dbQuery(
      `DELETE FROM report_shares 
       WHERE share_token = $1 AND created_by = $2
       RETURNING id`,
      [token, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    res.json({ success: true, message: 'Share revoked successfully' });

  } catch (error: any) {
    console.error('Error revoking share:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Export History
// ============================================================================

/**
 * Get export history for a session
 */
router.get('/exports/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const exports = await ReportExporter.getExportHistory(sessionId);
    res.json({ exports });

  } catch (error: any) {
    console.error('Error getting export history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Report Management
// ============================================================================

/**
 * Get report summary
 */
router.get('/summary/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get session data
    const sessionResult = await dbQuery(
      `SELECT * FROM apex_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Get artifacts count
    const artifactsResult = await dbQuery(
      `SELECT type, COUNT(*) as count FROM apex_artifacts WHERE session_id = $1 GROUP BY type`,
      [sessionId]
    );

    // Get exports count
    const exportsResult = await dbQuery(
      `SELECT format, COUNT(*) as count FROM report_exports WHERE session_id = $1 GROUP BY format`,
      [sessionId]
    );

    // Get shares count
    const sharesResult = await dbQuery(
      `SELECT COUNT(*) as count FROM report_shares WHERE session_id = $1`,
      [sessionId]
    );

    res.json({
      session: {
        id: session.id,
        goal: session.goal,
        status: session.status,
        created_at: session.created_at,
        updated_at: session.updated_at
      },
      artifacts: artifactsResult.rows,
      exports: exportsResult.rows,
      shares_count: sharesResult.rows[0].count
    });

  } catch (error: any) {
    console.error('Error getting report summary:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
