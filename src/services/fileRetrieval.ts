/**
 * File Retrieval Service
 * Phase 2: Retrieve uploaded file content for research
 * 
 * UPDATED: Portal passes file content directly (not stored in DB yet)
 * Files are parsed by ADI and content returned to Portal
 * Portal stores temporarily and sends uploadId to research
 * 
 * TODO: In future, store file content in database for retrieval
 * For now, Portal needs to send file content in request
 */

import { query as dbQuery } from '../db/query.js';

interface FileContent {
  uploadId: string;
  fileName: string;
  content: string;
  contentType: string;
  parsedAt: Date;
}

/**
 * Retrieve file content by upload ID
 * 
 * NOTE: Current implementation expects Portal to send file content
 * Future: Query uploads table when file storage is implemented
 */
export async function getFileContent(uploadId: string): Promise<FileContent> {
  try {
    console.log('[File Retrieval] Attempting to fetch content for:', uploadId);

    // Try to query uploads table (if implemented)
    const result = await dbQuery(
      `SELECT 
        id as upload_id,
        file_name,
        extracted_text as content,
        content_type,
        created_at as parsed_at
       FROM uploads
       WHERE id = $1 AND deleted_at IS NULL`,
      [uploadId]
    );

    if (result.rows.length === 0) {
      // File not in database - this is expected currently
      console.warn('[File Retrieval] File not found in database:', uploadId);
      throw new Error(`File not stored in database. Portal should send file content directly.`);
    }

    const row = result.rows[0];

    if (!row.content || row.content.trim().length === 0) {
      throw new Error(`File has no extracted content: ${uploadId}`);
    }

    console.log('[File Retrieval] Success:', {
      uploadId,
      fileName: row.file_name,
      contentLength: row.content.length
    });

    return {
      uploadId: row.upload_id,
      fileName: row.file_name,
      content: row.content,
      contentType: row.content_type,
      parsedAt: row.parsed_at
    };

  } catch (error: any) {
    console.error('[File Retrieval] Error:', error);
    throw error; // Propagate error to caller
  }
}

/**
 * Retrieve multiple files in parallel
 */
export async function getMultipleFiles(uploadIds: string[]): Promise<FileContent[]> {
  if (uploadIds.length === 0) {
    return [];
  }

  console.log('[File Retrieval] Fetching multiple files:', uploadIds.length);

  try {
    const results = await Promise.all(
      uploadIds.map(id => getFileContent(id))
    );

    console.log('[File Retrieval] Retrieved all files successfully');
    return results;

  } catch (error: any) {
    console.error('[File Retrieval] Error fetching multiple files:', error);
    throw error;
  }
}

/**
 * Combine multiple file contents into single context
 */
export function combineFileContents(files: FileContent[]): string {
  if (files.length === 0) {
    return '';
  }

  return files.map(file => 
    `=== File: ${file.fileName} ===\n\n${file.content}\n\n`
  ).join('\n');
}

