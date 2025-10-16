/**
 * Report Export Service
 * Handles exporting reports to various formats (PDF, DOCX, HTML)
 */

import { query as dbQuery } from '../db/query.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ExportRequest {
  session_id: string;
  format: 'pdf' | 'docx' | 'html';
  styling?: {
    template?: string;
    include_toc?: boolean;
    include_summary?: boolean;
    header?: string;
    footer?: string;
  };
}

export interface ExportResult {
  success: boolean;
  file_path?: string;
  download_url?: string;
  file_size?: number;
  error?: string;
}

// ============================================================================
// Report Exporter Class
// ============================================================================

export class ReportExporter {
  private outputDir: string;

  constructor(outputDir: string = '/tmp/reports') {
    this.outputDir = outputDir;
  }

  /**
   * Export a report to the specified format
   */
  async exportReport(request: ExportRequest): Promise<ExportResult> {
    try {
      // Get session data
      const sessionData = await this.getSessionData(request.session_id);
      if (!sessionData) {
        return { success: false, error: 'Session not found' };
      }

      // Get all artifacts for the session
      const artifacts = await this.getSessionArtifacts(request.session_id);
      
      // Generate report content
      const reportContent = await this.generateReportContent(sessionData, artifacts, request.styling);

      // Export based on format
      switch (request.format) {
        case 'html':
          return await this.exportToHTML(reportContent, request.session_id, request.styling);
        case 'pdf':
          return await this.exportToPDF(reportContent, request.session_id, request.styling);
        case 'docx':
          return await this.exportToDOCX(reportContent, request.session_id, request.styling);
        default:
          return { success: false, error: 'Unsupported format' };
      }

    } catch (error: any) {
      console.error('Export error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get session data
   */
  private async getSessionData(sessionId: string): Promise<any> {
    const result = await dbQuery(
      `SELECT * FROM apex_sessions WHERE id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];
    return {
      ...session,
      context: JSON.parse(session.context),
      state: JSON.parse(session.state)
    };
  }

  /**
   * Get all artifacts for a session
   */
  private async getSessionArtifacts(sessionId: string): Promise<any[]> {
    const result = await dbQuery(
      `SELECT * FROM apex_artifacts WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );

    return result.rows.map(row => ({
      ...row,
      content: JSON.parse(row.content),
      metadata: JSON.parse(row.metadata)
    }));
  }

  /**
   * Generate report content from session data and artifacts
   */
  private async generateReportContent(sessionData: any, artifacts: any[], styling?: any): Promise<any> {
    const sections = [];
    const charts = [];

    // Process artifacts
    for (const artifact of artifacts) {
      switch (artifact.type) {
        case 'analyzed_docs':
          sections.push({
            type: 'analysis',
            title: 'Document Analysis',
            content: artifact.content.summary,
            key_findings: artifact.content.key_findings
          });
          break;

        case 'extracted_data':
          sections.push({
            type: 'data',
            title: 'Data Summary',
            content: 'Extracted data points for visualization',
            data: artifact.content.structured_data
          });
          break;

        case 'chart':
          charts.push({
            id: artifact.id,
            type: artifact.content.chart_type,
            title: artifact.content.title,
            url: `/api/charts/${artifact.id}`
          });
          break;

        case 'report_section':
          sections.push({
            type: 'section',
            title: artifact.content.section_title,
            content: artifact.content.content,
            position: artifact.content.position
          });
          break;

        case 'final_report':
          sections.push({
            type: 'final',
            title: 'Final Report',
            content: artifact.content.html_content
          });
          break;
      }
    }

    return {
      title: sessionData.goal,
      sections,
      charts,
      metadata: {
        created_at: sessionData.created_at,
        session_id: sessionData.id,
        report_type: sessionData.context.report_type
      }
    };
  }

  /**
   * Export to HTML format
   */
  private async exportToHTML(content: any, sessionId: string, styling?: any): Promise<ExportResult> {
    const html = this.generateHTML(content, styling);
    const filename = `report_${sessionId}.html`;
    const filePath = `${this.outputDir}/${filename}`;

    // Write HTML file
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, html, 'utf8');

    // Get file size
    const stats = await fs.stat(filePath);

    return {
      success: true,
      file_path: filePath,
      download_url: `/api/reports/download/${filename}`,
      file_size: stats.size
    };
  }

  /**
   * Export to PDF format
   */
  private async exportToPDF(content: any, sessionId: string, styling?: any): Promise<ExportResult> {
    // Generate HTML first
    const html = this.generateHTML(content, styling);
    
    // Use Python to convert HTML to PDF
    const pythonCode = `
import pdfkit
import os
from pathlib import Path

# HTML content
html_content = """${html.replace(/"/g, '\\"')}"""

# Output path
output_path = "${this.outputDir}/report_${sessionId}.pdf"

# Convert HTML to PDF
options = {
    'page-size': 'A4',
    'margin-top': '0.75in',
    'margin-right': '0.75in',
    'margin-bottom': '0.75in',
    'margin-left': '0.75in',
    'encoding': "UTF-8",
    'no-outline': None
}

pdfkit.from_string(html_content, output_path, options=options)
print("PDF generated successfully")
`;

    // Python executor disabled
    return { success: false, error: 'Python execution not available' };
  }

  /**
   * Export to DOCX format
   */
  private async exportToDOCX(content: any, sessionId: string, styling?: any): Promise<ExportResult> {
    // Use Python to generate DOCX
    const pythonCode = `
from docx import Document
from docx.shared import Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
import requests
import os
from pathlib import Path

# Create document
doc = Document()

# Add title
title = doc.add_heading('${content.title.replace(/'/g, "\\'")}', 0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER

# Add metadata
meta_para = doc.add_paragraph()
meta_para.add_run(f"Generated: ${content.metadata.created_at}").italic = True
meta_para.add_run(f"\\nSession ID: ${content.metadata.session_id}").italic = True

# Add sections
for section in ${JSON.stringify(content.sections).replace(/"/g, '\\"')}:
    if section['type'] == 'analysis':
        doc.add_heading(section['title'], level=1)
        doc.add_paragraph(section['content'])
        
        if 'key_findings' in section:
            doc.add_heading('Key Findings', level=2)
            for finding in section['key_findings']:
                p = doc.add_paragraph(finding, style='List Bullet')
    
    elif section['type'] == 'data':
        doc.add_heading(section['title'], level=1)
        doc.add_paragraph(section['content'])
    
    elif section['type'] == 'section':
        doc.add_heading(section['title'], level=1)
        doc.add_paragraph(section['content'])
    
    elif section['type'] == 'final':
        doc.add_heading(section['title'], level=1)
        # Add final report content
        doc.add_paragraph("Report content generated successfully.")

# Add charts section if any
if ${JSON.stringify(content.charts).replace(/"/g, '\\"')}:
    doc.add_heading('Charts and Visualizations', level=1)
    for chart in ${JSON.stringify(content.charts).replace(/"/g, '\\"')}:
        doc.add_heading(chart['title'], level=2)
        doc.add_paragraph(f"Chart type: {chart['type']}")
        doc.add_paragraph(f"Chart URL: {chart['url']}")

# Save document
output_path = "${this.outputDir}/report_${sessionId}.docx"
doc.save(output_path)
print("DOCX generated successfully")
`;

    // Python executor disabled
    return { success: false, error: 'Python execution not available' };
  }

  /**
   * Generate HTML content
   */
  private generateHTML(content: any, styling?: any): string {
    const template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${content.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        h2 {
            color: #34495e;
            margin-top: 30px;
        }
        h3 {
            color: #7f8c8d;
        }
        .metadata {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 30px;
            font-size: 0.9em;
            color: #6c757d;
        }
        .section {
            margin-bottom: 30px;
        }
        .key-findings {
            background: #e8f5e8;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #28a745;
        }
        .key-findings ul {
            margin: 0;
            padding-left: 20px;
        }
        .chart-placeholder {
            background: #f8f9fa;
            border: 2px dashed #dee2e6;
            padding: 20px;
            text-align: center;
            border-radius: 5px;
            margin: 20px 0;
        }
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            font-size: 0.8em;
            color: #6c757d;
            text-align: center;
        }
    </style>
</head>
<body>
    <h1>${content.title}</h1>
    
    <div class="metadata">
        <strong>Generated:</strong> ${new Date(content.metadata.created_at).toLocaleString()}<br>
        <strong>Session ID:</strong> ${content.metadata.session_id}<br>
        <strong>Report Type:</strong> ${content.metadata.report_type || 'Custom'}
    </div>

    ${content.sections.map((section: any) => {
      switch (section.type) {
        case 'analysis':
          return `
            <div class="section">
              <h2>${section.title}</h2>
              <p>${section.content}</p>
              ${section.key_findings ? `
                <div class="key-findings">
                  <h3>Key Findings</h3>
                  <ul>
                    ${section.key_findings.map((finding: string) => `<li>${finding}</li>`).join('')}
                  </ul>
                </div>
              ` : ''}
            </div>
          `;
        case 'data':
          return `
            <div class="section">
              <h2>${section.title}</h2>
              <p>${section.content}</p>
            </div>
          `;
        case 'section':
          return `
            <div class="section">
              <h2>${section.title}</h2>
              <p>${section.content}</p>
            </div>
          `;
        case 'final':
          return `
            <div class="section">
              <h2>${section.title}</h2>
              <div>${section.content}</div>
            </div>
          `;
        default:
          return '';
      }
    }).join('')}

    ${content.charts.length > 0 ? `
      <div class="section">
        <h2>Charts and Visualizations</h2>
        ${content.charts.map((chart: any) => `
          <div class="chart-placeholder">
            <h3>${chart.title}</h3>
            <p>Chart type: ${chart.type}</p>
            <p>Chart URL: ${chart.url}</p>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="footer">
      <p>Generated by NomadApex Report Flow Builder</p>
    </div>
</body>
</html>
    `;

    return template;
  }

  /**
   * Get export history for a session
   */
  static async getExportHistory(sessionId: string): Promise<any[]> {
    const result = await dbQuery(
      `SELECT * FROM report_exports WHERE session_id = $1 ORDER BY created_at DESC`,
      [sessionId]
    );

    return result.rows;
  }

  /**
   * Log export activity
   */
  static async logExport(sessionId: string, format: string, filePath: string, fileSize: number): Promise<void> {
    await dbQuery(
      `INSERT INTO report_exports (session_id, format, file_path, file_size, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [sessionId, format, filePath, fileSize]
    );
  }
}
