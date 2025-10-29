/**
 * Templates API Routes - Simple Implementation
 * Per Kevin's plan: All business logic in API
 */

import { Router } from 'express';
import { query as dbQuery } from '../db/query.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { searchWeb } from '../services/openaiSearch.js';
import { callAPIM } from '../services/agenticFlow.js';

const router = Router();

// Apply auth middleware to all routes EXCEPT /stream/:runId (EventSource can't send headers)
router.use((req, res, next) => {
  if (req.path.match(/^\/stream\//)) {
    return next();
  }
  return requireAuth(req, res, next);
});

// Interface for uploaded files (matches research/reports)
interface UploadedFile {
  uploadId: string;
  fileName: string;
  content?: string; // ADI-extracted text from Portal
}

// Template structures definition - All 31 templates
const TEMPLATE_STRUCTURES: Record<string, string[]> = {
  // Strategy & Planning (7)
  executive_brief: ['Overview', 'Key Findings', 'Strategic Implications', 'Recommendations'],
  deep_research: ['Executive Summary', 'Background & Context', 'Methodology', 'Findings & Analysis', 'Conclusions', 'References'],
  market_landscape: ['Market Overview', 'Market Segments', 'Key Players', 'Market Trends', 'Competitive Dynamics', 'Outlook'],
  tam_sam_som: ['Executive Summary', 'Market Definition', 'TAM Analysis', 'SAM Analysis', 'SOM Sizing', 'Assumptions & Methodology', 'Growth Projections'],
  porters_five_forces: ['Overview', 'Competitive Rivalry', 'Threat of New Entrants', 'Bargaining Power of Suppliers', 'Bargaining Power of Buyers', 'Threat of Substitutes', 'Strategic Implications'],
  pestle_analysis: ['Overview', 'Political Factors', 'Economic Factors', 'Social Factors', 'Technological Factors', 'Legal Factors', 'Environmental Factors', 'Strategic Implications'],
  swot_analysis: ['Overview', 'Strengths', 'Weaknesses', 'Opportunities', 'Threats', 'Strategic Recommendations'],
  
  // Competitive Intelligence (4)
  competitive_feature_matrix: ['Executive Summary', 'Competitor Overview', 'Feature Comparison Matrix', 'Gap Analysis', 'Strategic Insights', 'Recommendations'],
  competitor_dossier: ['Executive Summary', 'Company Profile', 'Product Portfolio', 'Strengths & Weaknesses', 'Strategic Initiatives', 'Market Position', 'Financial Overview', 'Recommendations'],
  win_loss_analysis: ['Executive Summary', 'Win Analysis', 'Loss Analysis', 'Key Patterns & Themes', 'Competitive Positioning', 'Recommendations'],
  pricing_packaging_review: ['Executive Summary', 'Current Pricing Analysis', 'Competitive Pricing Landscape', 'Value Positioning', 'Packaging Options', 'Price Sensitivity Analysis', 'Recommendations'],
  
  // Go-to-Market (2)
  gtm_channels_assessment: ['Executive Summary', 'Channel Landscape', 'Channel Performance', 'Coverage Analysis', 'Channel Economics', 'Recommendations'],
  customer_jtbd_personas: ['Executive Summary', 'Jobs-to-be-Done Framework', 'Persona Profiles', 'User Journey Maps', 'Pain Points & Motivations', 'Implications for Product Strategy'],
  
  // Customer Insights (1)
  voc_theme_analysis: ['Executive Summary', 'Data Sources & Methodology', 'Thematic Analysis', 'Key Insights by Theme', 'Sentiment Analysis', 'Actionable Recommendations'],
  
  // Technical & Engineering (3)
  technical_literature_review: ['Abstract', 'Introduction', 'Methodology', 'Literature Review', 'Key Findings', 'Gaps & Future Research', 'Conclusions', 'References'],
  benchmark_performance_evaluation: ['Executive Summary', 'Test Methodology', 'System Configurations', 'Performance Results', 'Comparative Analysis', 'Recommendations'],
  architecture_options_adr: ['Context', 'Decision', 'Options Considered', 'Chosen Option', 'Rationale', 'Consequences', 'Trade-offs'],
  
  // Regulatory & Compliance (3)
  regulatory_compliance_map: ['Executive Summary', 'Regulatory Landscape', 'Compliance Requirements by Jurisdiction', 'Gap Analysis', 'Implementation Roadmap', 'Ongoing Monitoring'],
  regulatory_impact_assessment: ['Executive Summary', 'Regulatory Overview', 'Impact on Operations', 'Impact on Data & Systems', 'Compliance Requirements', 'Risk Assessment', 'Mitigation Plan'],
  policy_analysis_stakeholder_mapping: ['Executive Summary', 'Policy Context', 'Stakeholder Analysis', 'Impact Assessment', 'Positions & Interests', 'Engagement Strategy', 'Recommendations'],
  
  // Procurement & Vendor (3)
  vendor_evaluation_rfi: ['Executive Summary', 'Vendor Overview', 'Capability Assessment', 'Strengths & Weaknesses', 'Pricing & Commercial Terms', 'Fit Analysis', 'Recommendations'],
  rfp_scoring_decision_matrix: ['Executive Summary', 'Evaluation Criteria', 'Vendor Scores', 'Weighted Analysis', 'Trade-off Discussion', 'Final Recommendation'],
  security_compliance_diligence: ['Executive Summary', 'Security Posture Assessment', 'Compliance Status', 'Risk Analysis', 'Gap Identification', 'Mitigation Recommendations', 'Ongoing Monitoring'],
  
  // Financial (2)
  company_financial_teardown: ['Executive Summary', 'Revenue Analysis', 'Cost Structure', 'Profitability Metrics', 'Cash Flow Analysis', 'Financial Health Indicators', 'Projections & Outlook'],
  scenario_sensitivity_analysis: ['Executive Summary', 'Baseline Scenario', 'Alternative Scenarios', 'Sensitivity Analysis', 'Key Drivers & Assumptions', 'Risk Factors', 'Strategic Implications'],
  
  // Risk & Operations (4)
  risk_register_mitigation_plan: ['Executive Summary', 'Risk Identification', 'Risk Assessment', 'Prioritized Risk Register', 'Mitigation Strategies', 'Monitoring Plan'],
  operational_sop_extraction: ['Executive Summary', 'Process Overview', 'Standard Operating Procedures', 'Process Maps', 'Roles & Responsibilities', 'Quality Controls', 'Improvement Opportunities'],
  implementation_roadmap: ['Executive Summary', 'Objectives & Scope', 'Phase Breakdown', 'Timeline & Milestones', 'Resource Requirements', 'Dependencies & Risks', 'Success Criteria'],
  source_change_tracking_digest: ['Executive Summary', 'Change Overview', 'Key Changes by Source', 'Impact Analysis', 'Trend Identification', 'Recommendations'],
  
  // Knowledge Management (2)
  annotated_bibliography_evidence_pack: ['Introduction', 'Annotated Bibliography', 'Key Evidence by Theme', 'Source Quality Assessment', 'Research Gaps', 'Recommendations'],
  data_dictionary_kpis_entities: ['Overview', 'Data Entities', 'Key Performance Indicators', 'Field Definitions', 'Data Relationships', 'Usage Guidelines']
};

/**
 * POST /templates/generate
 * Generate a template-based report using tool-based thinking
 */
router.post('/generate', async (req, res) => {
  try {
    const { query, templateType, depth, uploaded_files } = req.body;
    const userId = req.auth?.sub as string;
    const orgId = req.auth?.['custom:org_id'] as string || '00000000-0000-0000-0000-000000000001';

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    if (!query || !templateType) {
      return res.status(400).json({ error: 'query and templateType are required' });
    }

    // Validate template type
    if (!TEMPLATE_STRUCTURES[templateType]) {
      return res.status(400).json({ 
        error: 'Invalid template type',
        availableTemplates: Object.keys(TEMPLATE_STRUCTURES)
      });
    }

    const depthValue = depth || 'medium';
    const uploadedFiles: UploadedFile[] = uploaded_files || [];

    console.log(`[Templates] Starting generation:`, {
      templateType,
      query: query.substring(0, 50),
      depth: depthValue,
      uploadedFiles: uploadedFiles.length
    });

    // Create template run record (using existing o1_research_runs table)
    const runId = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await dbQuery(
      `INSERT INTO o1_research_runs (id, user_id, query, depth, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        runId,
        userId,
        query,
        depthValue,
        'running',
        JSON.stringify({
          mode: 'template',
          templateType,
          uploadedFilesCount: uploadedFiles.length
        })
      ]
    );

    res.json({
      run_id: runId,
      status: 'running',
      message: 'Template generation started'
    });

    // Start async generation
    generateTemplateAsync(runId, userId, orgId, query, templateType, depthValue, uploadedFiles).catch(err => {
      console.error('[Templates] Async generation error:', err);
    });

  } catch (error: any) {
    console.error('[Templates] Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /templates/stream/:runId
 * SSE stream for template generation progress
 */
router.get('/stream/:runId', async (req, res) => {
  const { runId } = req.params;
  const userId = req.auth?.sub as string; // Optional - EventSource can't send auth headers

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const emit = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Get run details (runId is crypto-random, acts as access token)
    const result = await dbQuery(
      `SELECT * FROM o1_research_runs WHERE id = $1`,
      [runId]
    );

    if (result.rows.length === 0) {
      emit('error', { message: 'Template run not found' });
      return res.end();
    }

    const run = result.rows[0];

    emit('template.init', {
      run_id: runId,
      query: run.query,
      templateType: run.metadata?.templateType,
      status: run.status
    });

    // If already completed, send result and close
    if (run.status === 'completed' && run.report_content) {
      emit('template.complete', {
        run_id: runId,
        report: run.report_content
      });
      return res.end();
    }

    // Poll for completion
    const pollInterval = setInterval(async () => {
      try {
        const statusResult = await dbQuery(
          `SELECT status, report_content FROM o1_research_runs WHERE id = $1`,
          [runId]
        );

        if (statusResult.rows.length === 0) {
          clearInterval(pollInterval);
          emit('error', { message: 'Run not found' });
          return res.end();
        }

        const status = statusResult.rows[0].status;
        const report = statusResult.rows[0].report_content;

        if (status === 'completed') {
          clearInterval(pollInterval);
          emit('template.complete', {
            run_id: runId,
            report
          });
          res.end();
        } else if (status === 'failed') {
          clearInterval(pollInterval);
          emit('error', { message: 'Template generation failed' });
          res.end();
        }
      } catch (pollError) {
        console.error('[Templates] Poll error:', pollError);
      }
    }, 1000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(pollInterval);
      res.end();
    });

  } catch (error: any) {
    console.error('[Templates] Stream error:', error);
    emit('error', { message: error.message });
    res.end();
  }
});

/**
 * Async template generation (simple implementation)
 */
export async function generateTemplateAsync(
  runId: string,
  userId: string,
  orgId: string,
  query: string,
  templateType: string,
  depth: string,
  uploadedFiles?: UploadedFile[]
) {
  try {
    console.log(`[Templates] Generating ${templateType} for: ${query}`);

    // Check if this is a regeneration
    const runResult = await dbQuery(
      `SELECT metadata FROM o1_research_runs WHERE id = $1`,
      [runId]
    );
    const metadata = runResult.rows[0]?.metadata || {};
    const isRegeneration = !!metadata.regenerated_from;
    const regenerationFeedback = metadata.feedback || null;
    const originalReport = metadata.original_report || null;

    // Helper to log activities for polling
    const logActivity = async (activityType: string, activityData: any) => {
      try {
        await dbQuery(
          `INSERT INTO o1_research_activities (run_id, activity_type, activity_data, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [runId, activityType, JSON.stringify(activityData)]
        );
      } catch (err) {
        console.error('[Templates] Error logging activity:', err);
      }
    };

    // Log start
    await logActivity('thinking', {
      thought: `Starting ${templateType} generation...`,
      thought_type: 'planning'
    });

    // Get template structure
    const sections = TEMPLATE_STRUCTURES[templateType];

    let findings = '';
    let documentContent = '';

    // STEP 1: Process uploaded documents if provided
    if (uploadedFiles && uploadedFiles.length > 0) {
      const filesWithContent = uploadedFiles.filter(f => f.content && f.content.trim().length > 0);
      
      if (filesWithContent.length > 0) {
        documentContent = filesWithContent
          .map(f => `${f.content}`)
          .join('\n\n');
        
        findings = documentContent;
      }
    }

    // STEP 2: Web search for additional context (if no documents)
    if (!documentContent) {
      const searchQuery = `${query} ${templateType} analysis overview`;
      
      try {
        const searchResult: any = await searchWeb(searchQuery);
        findings = searchResult.choices?.[0]?.message?.content || 'No data found';
      } catch (searchError) {
        console.error('[Templates] Search error:', searchError);
        findings = 'Unable to retrieve external data. Using general knowledge.';
      }
    }

    // Generate template report using APIM
    const regenerationContext = isRegeneration ? `

🔄 REGENERATION MODE:
This is a regeneration request. The user already received a template and wants you to improve/modify it.

ORIGINAL TEMPLATE:
${originalReport || '(not available)'}

USER FEEDBACK:
${regenerationFeedback || '(no specific feedback - regenerate fresh with improvements)'}

Your task: Generate a new version that incorporates the feedback while maintaining template structure.
` : '';

    const systemPrompt = `You are generating a ${templateType} report.${regenerationContext}

REQUIRED SECTIONS (in this exact order):
${sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

CRITICAL RULES:
- Include ALL required sections
- Use ## for section headers
- Each section should be distinct and comprehensive
- Use markdown formatting
- Be professional and actionable`;

    const userPrompt = `Subject: ${query}

${findings}

Generate the complete ${templateType} report with ALL required sections.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await callAPIM(messages);
    const finalReport = response.choices?.[0]?.message?.content || 'Failed to generate report';

    // Log completion activity for polling
    await logActivity('template.complete', {
      template_type: templateType,
      report: finalReport
    });

    // Save completed template
    await dbQuery(
      `UPDATE o1_research_runs
       SET status = 'completed',
           report_content = $2,
           metadata = jsonb_set(metadata, '{completed_at}', to_jsonb($3::text)),
           updated_at = NOW()
       WHERE id = $1`,
      [runId, finalReport, new Date().toISOString()]
    );

    console.log('[Templates] Completed:', runId);

  } catch (error: any) {
    console.error('[Templates] Generation error:', error);

    await dbQuery(
      `UPDATE o1_research_runs
       SET status = 'failed',
           metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text)),
           updated_at = NOW()
       WHERE id = $1`,
      [runId, error.message]
    );
  }
}

/**
 * POST /templates/:runId/chat
 * Follow-up conversational chat about a completed template
 */
router.post('/:runId/chat', async (req, res) => {
  try {
    const { runId } = req.params;
    const { message, chatHistory } = req.body;
    const userId = req.auth?.sub as string;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('[Templates Chat] Follow-up question:', { runId, userId, message: message.substring(0, 100), historyLength: chatHistory?.length || 0 });

    // Retrieve the template run
    const result = await dbQuery(
      `SELECT id, user_id, query, report_content, status, metadata
       FROM o1_research_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template run not found' });
    }

    const run = result.rows[0];

    if (run.status !== 'completed') {
      return res.status(400).json({ error: 'Template is not yet completed. Please wait for the template to finish generating.' });
    }

    if (!run.report_content || run.report_content.trim().length === 0) {
      return res.status(400).json({ error: 'No template content available.' });
    }

    // Build context for APIM
    const templateMetadata = run.metadata || {};
    const templateType = templateMetadata.templateType || 'template';
    const reportContext = `TEMPLATE (Type: "${templateType}", Generated for query: "${run.query}"):\n\n${run.report_content}`;

    const systemPrompt = `You are a helpful business analyst assistant. The user has a structured template report and is asking follow-up questions about it.

TEMPLATE CONTEXT:
${reportContext}

YOUR JOB:
- Answer questions BASED ON THE TEMPLATE CONTENT
- Maintain conversation context from previous messages
- Be conversational and professional
- Reference specific sections/findings from the template
- If asked something not in the template, acknowledge limitations

CRITICAL:
- DO NOT make up information
- Keep responses focused and concise`;

    // Build message array with conversation history
    const messages: Array<{role: string; content: string}> = [
      { role: 'system', content: systemPrompt }
    ];

    // Add chat history if provided
    if (chatHistory && Array.isArray(chatHistory)) {
      for (const msg of chatHistory) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    console.log('[Templates Chat] Calling APIM with', messages.length, 'messages...');

    // Call APIM for conversational response
    const response = await callAPIM(messages);

    const answer = response.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';

    console.log('[Templates Chat] ✅ Follow-up answer generated');

    return res.json({
      success: true,
      answer
    });

  } catch (error: any) {
    console.error('[Templates Chat] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /templates/:runId/regenerate
 * Regenerate template based on feedback/modifications
 */
router.post('/:runId/regenerate', async (req, res) => {
  try {
    const { runId } = req.params;
    const { feedback } = req.body;
    const userId = req.auth?.sub as string;

    // Feedback is optional
    const feedbackText = (feedback && typeof feedback === 'string') ? feedback.trim() : '';

    console.log('[Templates Regenerate] Regenerating:', { 
      runId, 
      userId, 
      hasFeedback: feedbackText.length > 0,
      feedback: feedbackText ? feedbackText.substring(0, 100) : '(no feedback - regenerating fresh)'
    });

    // Retrieve the original template run
    const result = await dbQuery(
      `SELECT id, user_id, query, report_content, status, metadata, depth
       FROM o1_research_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template run not found' });
    }

    const originalRun = result.rows[0];

    if (originalRun.status !== 'completed') {
      return res.status(400).json({ error: 'Cannot regenerate - original template is not yet completed.' });
    }

    if (!originalRun.report_content || originalRun.report_content.trim().length === 0) {
      return res.status(400).json({ error: 'No template content available to regenerate from.' });
    }

    // Create a new run for the regenerated template
    const newRunId = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const originalMetadata = originalRun.metadata || {};
    const templateType = originalMetadata.templateType || 'generic';
    
    await dbQuery(
      `INSERT INTO o1_research_runs (
        id, user_id, query, depth, status, 
        metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        newRunId,
        userId,
        originalRun.query, // Use ORIGINAL query unchanged
        originalRun.depth || 'medium',
        'running',
        JSON.stringify({
          ...originalMetadata,
          regenerated_from: runId,
          feedback: feedbackText || null,
          original_report: originalRun.report_content.substring(0, 10000), // Store original for context
          started_at: new Date().toISOString()
        })
      ]
    );

    console.log('[Templates Regenerate] Created new run:', newRunId);

    // Start async regeneration - same flow, but with regeneration context
    setImmediate(() => {
      generateTemplateAsync(
        newRunId,
        userId,
        originalMetadata.orgId || '00000000-0000-0000-0000-000000000001',
        originalRun.query, // UNCHANGED original query
        templateType,
        originalRun.depth || 'medium',
        undefined // Regeneration doesn't include uploaded files
      ).catch((error) => {
        console.error('[Templates Regenerate] Background processing error:', error);
        dbQuery(
          `UPDATE o1_research_runs 
           SET status = 'failed', 
               metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text))
           WHERE id = $1`,
          [newRunId, error.message]
        );
      });
    });

    return res.json({
      success: true,
      run_id: newRunId,
      status: 'running',
      message: 'Template regeneration started'
    });

  } catch (error: any) {
    console.error('[Templates Regenerate] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to start regeneration',
      details: error.message 
    });
  }
});

export default router;

