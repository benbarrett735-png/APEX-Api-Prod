/**
 * File Retrieval Service
 * Phase 2: Retrieve uploaded file content for research
 * 
 * Per Kevin's plan:
 * - Files are parsed by ADI during upload
 * - Content is stored in database with uploadId
 * - Research retrieves by uploadId
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
 * Files were already parsed by ADI during upload via /adi/analyze
 */
export async function getFileContent(uploadId: string): Promise<FileContent> {
  try {
    console.log('[File Retrieval] Fetching content for:', uploadId);

    // Query uploads table for file content
    // Note: uploads table created in earlier migrations (004_uploads_indexes.sql)
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
      throw new Error(`File not found: ${uploadId}`);
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
    throw new Error(`Failed to retrieve file: ${error.message}`);
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

