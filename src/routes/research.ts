/**
 * Research API Routes - o1-Style Continuous Reasoning
 * Phase 2: Real APIM reasoning, OpenAI search, file processing
 * 
 * Per Kevin's plan: All business logic stays in API
 */

import { Router } from 'express';
import { query as dbQuery } from '../db/query.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { searchWeb, isOpenAIConfigured } from '../services/openaiSearch.js';
import { getMultipleFiles, combineFileContents } from '../services/fileRetrieval.js';
import { generateReport, generateSectionSummary } from '../services/reportGenerator.js';
import { ChartService } from '../services/chartService.js';
import { callAPIM } from '../services/agenticFlow.js';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * TOOL-BASED PLANNING
 * Give APIM everything + available tools, let it decide what to do
 */
async function createToolBasedPlan(
  query: string,
  uploadedFiles: UploadedFile[],
  depth: string,
  requestedCharts?: Array<{type: string; goal?: string}>
): Promise<{
  understanding: {
    coreSubject: string;
    userGoal: string;
    needsExternal: boolean;
    needsDocAnalysis: boolean;
    outputFormat: 'brief' | 'standard' | 'comprehensive';
  };
  toolCalls: Array<{
    tool: string;
    parameters: any;
    reasoning: string;
  }>;
}> {
  // Define available tools for APIM
  const tools = [
    {
      name: "analyze_documents",
      description: "Extract key insights, facts, and context from uploaded documents",
      parameters: {
        focus: "string - what specific information to look for in the documents"
      }
    },
    {
      name: "search_web",
      description: "Search public web for information (powered by OpenAI)",
      parameters: {
        searchQuery: "string - specific, targeted search query (NOT the user's question!)"
      },
      examples: [
        { bad: "Tell me about Tesla", good: "Tesla 2024 revenue market share products latest news" },
        { bad: "Give me a summary of Apple", good: "Apple iPhone sales 2024 market position competitors" }
      ]
    },
    {
      name: "generate_chart",
      description: "Create data visualization from research findings",
      parameters: {
        chartType: "string - bar, line, pie, scatter, heatmap, etc",
        dataNeeded: "string - what specific quantitative data points are needed",
        goal: "string - what the chart should communicate to the user"
      }
    },
    {
      name: "compile_report",
      description: "Format final research output",
      parameters: {
        format: "string - brief (150-300 words, 2 paragraphs, NO sections), standard (500-800 words, 3-5 sections), comprehensive (1500+ words, 5-8+ sections)",
        sections: "array of strings or null - section names if structured report, null if brief"
      }
    }
  ];

  // Extract document content if available
  const documentContent = uploadedFiles.length > 0
    ? uploadedFiles.map(f => `FILE: ${f.fileName}\nCONTENT:\n${f.content || '(no content)'}`).join('\n\n---\n\n')
    : null;

  const systemPrompt = `You are an intelligent research planning AI with access to tools.

YOUR JOB:
1. UNDERSTAND what the user wants (identify the REAL subject, not query keywords!)
2. CHOOSE which tools to use
3. CREATE specific parameters for each tool

CRITICAL RULES:
- Extract the SUBJECT from the query, NOT the query itself!
  * Query: "Give me a quick summary of Tesla" → Subject: "Tesla"
  * Query: "Tell me about Cabot's opportunities" → Subject: "Cabot's Cookery School" (from document)
  * Query: "Compare React vs Vue" → Subject: "React and Vue frameworks"

- If user says "quick" / "summary" / "brief":
  → Use search_web ONCE with focused query
  → Use compile_report with format="brief" (NO sections!)

- If user uploads documents:
  → ALWAYS use analyze_documents FIRST
  → Then search_web for external context
  → Use compile_report with format="comprehensive"

- For search_web parameters:
  → Create queries ABOUT THE SUBJECT, not about the user's question!
  → Include year "2024" for current info
  → Be specific about what data you need
  
- For compile_report:
  → "brief" = 2 paragraphs, NO sections, ~200 words
  → "standard" = 3-5 sections, ~600 words
  → "comprehensive" = 5-8+ sections, ~1800 words

AVAILABLE TOOLS:
${JSON.stringify(tools, null, 2)}

Respond with ONLY valid JSON:
{
  "understanding": {
    "coreSubject": "the REAL subject (extract from query + documents)",
    "userGoal": "what they want",
    "needsExternal": boolean,
    "needsDocAnalysis": boolean,
    "outputFormat": "brief|standard|comprehensive"
  },
  "toolCalls": [
    {
      "tool": "tool_name",
      "parameters": { ...specific params... },
      "reasoning": "why this tool with these exact params"
    }
  ]
}`;

  const userPrompt = `Query: "${query}"
Depth requested: ${depth}

${documentContent ? `UPLOADED DOCUMENTS (${uploadedFiles.length} files, ~${documentContent.length} chars total):
${documentContent.substring(0, 4000)}${documentContent.length > 4000 ? '...(truncated)' : ''}` : 'No uploaded documents.'}

${requestedCharts && requestedCharts.length > 0 ? `\nREQUESTED CHARTS: ${requestedCharts.map(c => `${c.type}${c.goal ? ` (goal: ${c.goal})` : ''}`).join(', ')}` : ''}

Create a tool-based research plan. Remember:
- Extract the SUBJECT, not the query words!
- Match output format to user intent (brief, standard, comprehensive)
- Create SPECIFIC search queries about the subject
- Use tools in logical order`;

  try {
    const response = await callAPIM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // Extract content from APIM response
    const content = response.choices?.[0]?.message?.content || '';
    
    console.log('[Tool Planning] APIM response:', content.substring(0, 500));

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse APIM response - no JSON found');
    }

    const plan = JSON.parse(jsonMatch[0]);
    console.log('[Tool Planning] Plan created:', plan);

    return plan;

  } catch (error: any) {
    console.error('[Tool Planning] Error:', error);
    
    // Smart fallback: parse query to extract subject
    let subject = query;
    const queryLower = query.toLowerCase();
    
    // Remove common query words to find the subject
    subject = query
      .replace(/give me (a |an )?/gi, '')
      .replace(/tell me about/gi, '')
      .replace(/what (is|are)/gi, '')
      .replace(/quick summary of/gi, '')
      .replace(/summary of/gi, '')
      .replace(/brief on/gi, '')
      .replace(/research on/gi, '')
      .replace(/analyze/gi, '')
      .replace(/compare/gi, '')
      .trim();
    
    // If document provided, try to extract subject from it
    if (documentContent && documentContent.length > 100) {
      const lines = documentContent.split('\n').filter(l => l.trim().length > 15);
      for (const line of lines.slice(0, 20)) {
        const cleaned = line.replace(/[#*\[\]]/g, '').trim();
        if (cleaned.length > 10 && cleaned.length < 100 &&
            !cleaned.toLowerCase().includes('file:') &&
            !cleaned.toLowerCase().includes('content:') &&
            !cleaned.match(/\.(pdf|doc)/i)) {
          subject = cleaned;
          break;
        }
      }
    }

    console.log('[Tool Planning] Fallback extracted subject:', subject);

    // Determine format
    const isBrief = queryLower.includes('quick') || queryLower.includes('brief') || queryLower.includes('summary');
    const hasDoc = uploadedFiles.length > 0;
    const format = isBrief && !hasDoc ? 'brief' : hasDoc ? 'comprehensive' : 'standard';

    // Build fallback plan
    const toolCalls: any[] = [];

    if (hasDoc) {
      toolCalls.push({
        tool: 'analyze_documents',
        parameters: { focus: `Extract key information about ${subject}` },
        reasoning: 'User uploaded documents'
      });
    }

    if (format === 'brief') {
      toolCalls.push({
        tool: 'search_web',
        parameters: { searchQuery: `${subject} overview key facts 2024` },
        reasoning: 'Quick summary needs focused search'
      });
    } else {
      toolCalls.push({
        tool: 'search_web',
        parameters: { searchQuery: `${subject} market position industry trends 2024` },
        reasoning: 'Need market context'
      });
      if (format === 'comprehensive') {
        toolCalls.push({
          tool: 'search_web',
          parameters: { searchQuery: `${subject} competitors analysis opportunities 2024` },
          reasoning: 'Comprehensive analysis needs competition data'
        });
      }
    }

    if (requestedCharts && requestedCharts.length > 0) {
      for (const chart of requestedCharts) {
        toolCalls.push({
          tool: 'generate_chart',
          parameters: {
            chartType: chart.type,
            dataNeeded: `Quantitative data about ${subject}`,
            goal: chart.goal || `Visualize ${subject} data`
          },
          reasoning: `User requested ${chart.type} chart`
        });
      }
    }

    toolCalls.push({
      tool: 'compile_report',
      parameters: {
        format,
        sections: format === 'brief' ? null : (hasDoc ? ['Current State', 'Analysis', 'Insights', 'Recommendations'] : ['Overview', 'Analysis', 'Key Insights'])
      },
      reasoning: `${format} format requested`
    });

    return {
      understanding: {
        coreSubject: subject,
        userGoal: `Research about ${subject}`,
        needsExternal: true,
        needsDocAnalysis: hasDoc,
        outputFormat: format as any
      },
      toolCalls
    };
  }
}

// OLD createResearchPlan function removed - now using tool-based planning

/**
 * DELETED OLD FUNCTION - Using createToolBasedPlan instead
 */
/*
async function OLD_createResearchPlan_DELETED(
  query: string,
  depth: string,
  understanding: any,
  hasFiles: boolean,
  includeCharts: string[],
  documentContext?: string, // NEW: Full document content
  chartRequests?: Array<{type: string; goal?: string}> // NEW: Chart goals
): Promise<{ steps: string[]; reasoning: string; reportSections?: string[]; outputStyle?: string; outputLength?: string }> {
  try {
    // Build COMPLETE context with ALL information
    let contextInfo = `UNDERSTANDING (what the user ACTUALLY wants):
Core Subject: ${understanding.coreSubject}
User Goal: ${understanding.userGoal}
Key Topics to Research: ${understanding.keyTopics.join(', ')}

Query: "${query}"
Depth: ${depth}
Has uploaded files: ${hasFiles}

${documentContext ? `FULL DOCUMENT CONTENT (${documentContext.length} chars):
${documentContext}

CRITICAL: Read this document CAREFULLY. Base your plan on what's IN the document and what's MISSING that needs external research!` : ''}

${chartRequests && chartRequests.length > 0 ? `CHART REQUIREMENTS:
${chartRequests.map(cr => `- ${cr.type} chart${cr.goal ? `: Goal = "${cr.goal}"` : ' (no specific goal provided)'}`).join('\n')}

CRITICAL: You MUST include "generate_chart: ${chartRequests.map(c => c.type).join(', ')}" steps in the plan!
For each chart, searches must target the DATA needed for that visualization!` : ''}`;

    if (understanding.chartDataNeeds && understanding.chartDataNeeds.length > 0) {
      contextInfo += `\n\nChart Data Needs (from understanding): ${understanding.chartDataNeeds.join(', ')}`;
    }
    
    const messages = [
      { 
        role: 'system', 
        content: `You are a research planner. Create a comprehensive, specific step-by-step research plan.

CRITICAL PRINCIPLES:
1. READ THE FULL DOCUMENT CONTENT CAREFULLY - understand what it says and what's missing
2. Use the UNDERSTANDING to create searches about the CORE SUBJECT (not related words!)
3. Make multiple specific searches (${depth === 'comprehensive' ? '4-6' : depth === 'long' ? '3-5' : depth === 'medium' ? '3-4' : '2-3'} searches) that:
   - Find information NOT in the document
   - Provide external context, market data, comparisons
   - Target QUANTITATIVE data for charts
4. For document analysis: Be SPECIFIC about what to extract (don't just say "analyze files")
5. For charts: You MUST include "generate_chart: {type} - {what it shows}" steps
6. For each chart, ensure searches gather the DATA needed for that specific visualization
7. Report sections should reflect the document's content + external research

CHART HANDLING:
- If user provided chart GOALS, use those goals in the generate_chart steps
- Each chart step should be: "generate_chart: {type} - {goal or description}"
- Searches BEFORE chart generation must target relevant data` 
      },
      { 
        role: 'user', 
        content: `${contextInfo}

Create a research plan with specific steps. Available actions:
- "analyze_files": Extract insights from uploaded documents
- "search_web: {specific query}": Search for specific information (be VERY specific)
- "search_web_refined: {refined query}": Follow-up search with different angle
- "synthesize": Combine findings into coherent analysis
- "generate_chart: {type}": Create a specific chart
- "quality_check": Evaluate if we have enough information
- "write_report": Generate final report with dynamic sections

SEARCH QUERY RULES:
- Be SPECIFIC (not "search about X" but "latest market data for X in 2024")
- If document provided, search for things that COMPLEMENT it (external context, comparisons, recent updates)
- Make 3-5 different searches for comprehensive depth
- Each search should target different aspects

REPORT SECTIONS (suggest dynamic sections based on query):
- Don't always use "Executive Summary, Key Findings, Analysis"
- Adapt sections to the query type
- Examples: "Market Analysis", "Technical Comparison", "Historical Timeline", "Current State", "Future Outlook"

Respond with ONLY valid JSON:
{
  "steps": ["step 1 with SPECIFIC details", "step 2...", ...],
  "reasoning": "why this plan makes sense",
  "reportSections": ["Section 1", "Section 2", ...] // Dynamic sections for the report
}

Example 1 - Cookery School WITH document and charts:
Understanding: Core Subject = "Cabot's Cookery School (cooking school business)"
Document says: "12-acre organic farm, Kinlooey Lough location, expert chefs, 2025 promotional campaign"
Charts requested: bar (Goal: "Compare market segments"), line (Goal: "Show tourism growth")
{
  "steps": [
    "analyze_files: Extract Cabot's specific assets (farm, location, chefs), current offerings, 2025 campaign details, target audiences",
    "search_web: Cooking school market size UK/Ireland 2024, market segments breakdown with percentages",
    "search_web: Culinary tourism growth statistics 2020-2024, yearly visitor numbers",
    "search_web: Successful cooking school digital marketing ROI, channel performance data",
    "search_web: Experiential learning demand trends, customer demographics by segment",
    "quality_check: Verify we have document insights + market data + quantitative data for charts",
    "synthesize: Combine Cabot's unique strengths with external market opportunities",
    "generate_chart: bar - Compare market segments (locals vs tourists vs groups) with size data from searches",
    "generate_chart: line - Show culinary tourism growth trend 2020-2024 from visitor statistics",
    "write_report: Market positioning and growth strategies for Cabot's Cookery School"
  ],
  "reasoning": "Document provides Cabot's unique assets and 2025 plans. Searches provide market context and quantitative data for the requested charts. Bar chart needs segment comparison data, line chart needs tourism growth numbers.",
  "reportSections": ["Current Position (from document)", "Market Landscape", "Opportunities by Segment", "2025 Campaign Alignment", "Growth Projections"]
}

Example 2 - Tech with Charts:
Understanding: Core Subject = "React vs Vue", Chart Data Needs = "Market share, Performance benchmarks"
Charts requested: bar, line
{
  "steps": [
    "search_web: React 18 market share statistics, npm downloads, GitHub stars 2024",
    "search_web: Vue 3 market share statistics, npm downloads, adoption metrics 2024",
    "search_web: React vs Vue performance benchmarks, load times, bundle sizes",
    "search_web: Developer experience surveys, job market demand by framework",
    "quality_check: Verify balanced quantitative data for both",
    "synthesize: Compare all metrics",
    "generate_chart: bar - Market share and adoption comparison",
    "generate_chart: line - Performance metrics comparison",
    "write_report: Present comparison with data visualizations"
  ],
  "reasoning": "Comparison needs quantitative data for charts, multiple search angles for comprehensive view",
  "reportSections": ["Overview", "Adoption Metrics", "Performance Analysis", "Developer Experience", "Recommendation"]
}

CRITICAL: If charts requested, you MUST include "generate_chart: {type}" steps!`
      }
    ];
    
    const response = await callAPIM(messages);

    // Extract content from APIM response
    const content = response.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Plan Creation] Could not parse APIM response, using intelligent fallback');
      console.warn('[Plan Creation] APIM response was:', content.substring(0, 500));
      
      // Create SMART fallback using document + query context
      const subject = understanding.coreSubject || query;
      const topics = understanding.keyTopics || [subject];
      
      // Analyze query intent
      const queryLower = query.toLowerCase();
      const wantsMarket = queryLower.includes('market') || queryLower.includes('position') || queryLower.includes('competitive');
      const wantsOpportunities = queryLower.includes('opportunit') || queryLower.includes('growth') || queryLower.includes('expand');
      const wantsStrategy = queryLower.includes('strategy') || queryLower.includes('recommend') || queryLower.includes('plan');
      
      const fallbackSteps: string[] = [];
      
      // Document analysis
      if (hasFiles) {
        fallbackSteps.push(`analyze_files: Extract ${subject}'s key assets, offerings, unique features, and current strategy`);
      }
      
      // Create RELEVANT searches based on subject + query intent
      const searches: string[] = [];
      
      // Always search for market context about the SUBJECT
      searches.push(`${subject} market size, industry trends, and customer demographics 2024`);
      
      // Add intent-specific searches
      if (wantsMarket || wantsOpportunities) {
        searches.push(`${subject} competitors, market positioning, and competitive landscape`);
        searches.push(`${subject} growth opportunities and emerging market trends`);
      }
      
      if (wantsStrategy || wantsOpportunities) {
        searches.push(`Successful strategies for businesses like ${subject}`);
      }
      
      // If no specific intent, add general business searches
      if (!wantsMarket && !wantsOpportunities && !wantsStrategy) {
        searches.push(`${subject} industry analysis and best practices`);
      }
      
      // Add searches (limit to 3-4)
      searches.slice(0, depth === 'comprehensive' ? 4 : 3).forEach(search => {
        fallbackSteps.push(`search_web: ${search}`);
      });
      
      // Quality check
      fallbackSteps.push('quality_check: Verify we have comprehensive information from document and external sources');
      
      // Charts if requested
      if (includeCharts.length > 0) {
        fallbackSteps.push('synthesize: Combine findings to prepare for visualizations');
        includeCharts.forEach(chartType => {
          fallbackSteps.push(`generate_chart: ${chartType} - Visualize key data about ${subject}`);
        });
      } else {
        fallbackSteps.push('synthesize: Combine document insights with market research');
      }
      
      fallbackSteps.push('write_report: Create comprehensive analysis report');
      
      console.log('[Plan Creation] Fallback plan with smart searches:', fallbackSteps);
      
      return {
        steps: fallbackSteps,
        reasoning: `Smart fallback: analyzing ${subject} with focus on ${wantsMarket ? 'market position' : wantsOpportunities ? 'opportunities' : wantsStrategy ? 'strategy' : 'comprehensive analysis'}`,
        reportSections: hasFiles 
          ? ['Current Position', 'Market Analysis', 'Opportunities', 'Strategic Recommendations']
          : ['Overview', 'Industry Analysis', 'Key Insights', 'Recommendations']
      };
    }
    
    const plan = JSON.parse(jsonMatch[0]);
    return {
      steps: plan.steps || [],
      reasoning: plan.reasoning || 'Research plan created',
      reportSections: plan.reportSections || plan.report_sections || undefined
    };
  } catch (error: any) {
    console.error('[Plan Creation] Error:', error);
    console.error('[Plan Creation] Error details:', error.message);
    
    // SMART fallback using document + query context
    const subject = understanding.coreSubject || query;
    
    // Analyze query intent
    const queryLower = query.toLowerCase();
    const wantsMarket = queryLower.includes('market') || queryLower.includes('position') || queryLower.includes('competitive');
    const wantsOpportunities = queryLower.includes('opportunit') || queryLower.includes('growth') || queryLower.includes('expand');
    const wantsStrategy = queryLower.includes('strategy') || queryLower.includes('recommend') || queryLower.includes('plan');
    
    const fallbackSteps: string[] = [];
    
    // Document analysis
    if (hasFiles) {
      fallbackSteps.push(`analyze_files: Extract ${subject}'s key assets, offerings, unique features, and current strategy`);
    }
    
    // Create RELEVANT searches
    const searches: string[] = [];
    searches.push(`${subject} market size, industry trends, and customer demographics 2024`);
    
    if (wantsMarket || wantsOpportunities) {
      searches.push(`${subject} competitors, market positioning, and competitive landscape`);
      searches.push(`${subject} growth opportunities and emerging market trends`);
    }
    
    if (wantsStrategy || wantsOpportunities) {
      searches.push(`Successful strategies for businesses like ${subject}`);
    }
    
    if (!wantsMarket && !wantsOpportunities && !wantsStrategy) {
      searches.push(`${subject} industry analysis and best practices`);
    }
    
    searches.slice(0, depth === 'comprehensive' ? 4 : 3).forEach(search => {
      fallbackSteps.push(`search_web: ${search}`);
    });
    
    fallbackSteps.push('quality_check: Verify comprehensive information');
    
    if (includeCharts.length > 0) {
      fallbackSteps.push('synthesize: Prepare for visualizations');
      includeCharts.forEach(chartType => {
        fallbackSteps.push(`generate_chart: ${chartType} - Visualize key data about ${subject}`);
      });
    } else {
      fallbackSteps.push('synthesize: Combine document insights with market research');
    }
    
    fallbackSteps.push('write_report: Create comprehensive analysis report');
    
    console.log('[Plan Creation] Error fallback plan with smart searches:', fallbackSteps);
    
    return {
      steps: fallbackSteps,
      reasoning: `Smart fallback: analyzing ${subject} with focus on ${wantsMarket ? 'market position' : wantsOpportunities ? 'opportunities' : wantsStrategy ? 'strategy' : 'comprehensive analysis'}`,
      reportSections: hasFiles 
        ? ['Current Position', 'Market Analysis', 'Opportunities', 'Strategic Recommendations']
        : ['Overview', 'Industry Analysis', 'Key Insights', 'Recommendations']
    };
  }
}

/**
 * o1-Style Quality Assessment
 * Evaluates research findings and suggests next action
 */
async function assessFindingsQuality(findings: string[], query: string): Promise<{
  score: number;
  reasoning: string;
  nextAction?: string;
  shouldContinue: boolean;
}> {
  if (findings.length === 0) {
    return {
      score: 0,
      reasoning: 'No findings collected',
      nextAction: 'search_web',
      shouldContinue: true
    };
  }
  
  try {
    const messages = [
      { role: 'system', content: 'You are a research quality evaluator. Assess if findings adequately answer the query.' },
      { role: 'user', content: `Query: "${query}"

Findings (${findings.length} total):
${findings.slice(0, 5).map((f, i) => `${i + 1}. ${f.substring(0, 200)}...`).join('\n\n')}

Evaluate:
1. Do these findings answer the query comprehensively?
2. Quality score (1-10)
3. What should we do next? (continue_plan, search_more, or finish)

Respond with ONLY valid JSON:
{
  "score": 1-10,
  "reasoning": "brief explanation",
  "next_action": "continue_plan or search_web_refined or finish",
  "should_continue": true/false
}` }
    ];
    
    const response = await callAPIM(messages);

    // Extract content from APIM response
    const content = response.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Quality Assessment] Could not parse APIM response');
      return { score: 7, reasoning: 'Assessment unavailable', shouldContinue: true };
    }
    
    const assessment = JSON.parse(jsonMatch[0]);
    return {
      score: assessment.score || 7,
      reasoning: assessment.reasoning || 'Quality assessment complete',
      nextAction: assessment.next_action,
      shouldContinue: assessment.should_continue !== false
    };
  } catch (error: any) {
    console.error('[Quality Assessment] Error:', error);
    return { score: 7, reasoning: 'Assessment failed, proceeding', shouldContinue: true };
  }
}

// ============================================================================
// Types
// ============================================================================

interface UploadedFile {
  uploadId: string;
  fileName: string;
  content?: string; // ADI-extracted text
}

interface ChartRequest {
  type: string; // 'bar', 'line', 'pie', etc.
  goal?: string; // Optional: User's goal/prompt for this specific chart
}

interface ResearchStartRequest {
  query: string;
  uploaded_files?: string[] | UploadedFile[]; // Can be string IDs or full objects with content
  depth: 'short' | 'medium' | 'long' | 'comprehensive';
  include_charts?: string[] | ChartRequest[]; // Can be simple strings or objects with goals
  target_sources?: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `run_${timestamp}_${random}`;
}

/**
 * Sleep utility for phased event emission
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure user exists in database (auto-create from JWT)
 */
async function ensureUser(userId: string, email?: string, orgId?: string) {
  try {
    // Ensure org exists first
    const defaultOrgId = orgId || '00000000-0000-0000-0000-000000000001';
    const orgCheck = await dbQuery('SELECT id FROM orgs WHERE id = $1', [defaultOrgId]);
    
    if (orgCheck.rows.length === 0) {
      console.log('[Research] Auto-creating org:', defaultOrgId);
      await dbQuery(
        `INSERT INTO orgs (id, name, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [defaultOrgId, 'Default Organization']
      );
    }
    
    // Check if user exists
    const userCheck = await dbQuery('SELECT id FROM users WHERE id = $1', [userId]);
    
    if (userCheck.rows.length === 0) {
      console.log('[Research] Auto-creating user:', userId, email);
      await dbQuery(
        `INSERT INTO users (id, org_id, email, role, external_sub, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [userId, defaultOrgId, email || `${userId}@cognito.local`, 'member', userId]
      );
    }
  } catch (error) {
    console.error('[Research] Error ensuring user:', error);
    throw error;
  }
}

// ============================================================================
// PHASE 1: Background Processing (Hardcoded for now)
// ============================================================================

/**
 * Background research processor
 * Phase 2: Real research execution (runs async from SSE stream)
 */
async function processResearch(
  runId: string,
  query: string,
  files: string[] | UploadedFile[],
  depth: string
): Promise<void> {
  console.log(`[Research] Background processing started for ${runId}`);
  console.log(`[Research] Query: "${query}", Depth: ${depth}, Files: ${files.length}`);
  
  // Update status to processing
  await dbQuery(
    `UPDATE o1_research_runs 
     SET status = 'processing', updated_at = NOW()
     WHERE id = $1`,
    [runId]
  );
  
  // Note: SSE stream handles the actual research
  // This background task just ensures DB status is updated
  // Real work happens in the SSE stream to emit events in real-time
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /research/start
 * Create a new research run and start processing
 */
router.post('/start', async (req, res) => {
  try {
    const {
      query,
      uploaded_files = [],
      depth = 'medium',
      include_charts = [],
      target_sources = []
    }: ResearchStartRequest = req.body;
    
    // Debug logging for file upload issue
    console.log('[Research] POST /start received:');
    console.log('  Query:', query?.substring(0, 100));
    console.log('  Depth:', depth);
    console.log('  uploaded_files type:', typeof uploaded_files);
    console.log('  uploaded_files is array:', Array.isArray(uploaded_files));
    console.log('  uploaded_files length:', uploaded_files?.length || 0);
    if (uploaded_files && uploaded_files.length > 0) {
      console.log('  First file:', JSON.stringify(uploaded_files[0], null, 2));
    }
    
    // Extract user from validated JWT
    const userId = req.auth?.sub as string;
    const email = req.auth?.email as string;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    // Validate request
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    if (!['short', 'medium', 'long', 'comprehensive'].includes(depth)) {
      return res.status(400).json({ error: 'Invalid depth value' });
    }
    
    // Ensure user exists
    await ensureUser(userId, email);

    // Generate run ID
    const runId = generateRunId();
    
    console.log('[Research] Starting new run:', {
      runId,
      userId,
      query: query.substring(0, 100),
      depth,
      filesCount: uploaded_files.length
    });
    
    // Create run in database
    await dbQuery(
      `INSERT INTO o1_research_runs (
        id, user_id, query, depth, status, 
        uploaded_files, include_charts, target_sources, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        runId,
        userId,
        query,
        depth,
        'planning',
        JSON.stringify(uploaded_files),
        JSON.stringify(include_charts),
        JSON.stringify(target_sources),
        JSON.stringify({
          started_at: new Date().toISOString(),
          phase: 1 // Phase 1: Hardcoded events
        })
      ]
    );
    
    // Start background processing (async, don't await)
    setImmediate(() => {
      processResearch(runId, query, uploaded_files, depth).catch((error) => {
        console.error('[Research] Background processing error:', error);
        // Update run status to failed
        dbQuery(
          `UPDATE o1_research_runs 
           SET status = 'failed', 
               metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text)),
               updated_at = NOW()
           WHERE id = $1`,
          [runId, error.message]
        ).catch(err => console.error('[Research] Failed to update error status:', err));
      });
    });
    
    // Return immediately
    return res.json({
      run_id: runId,
      status: 'planning',
      stream_url: `/research/stream/${runId}`
    });
    
  } catch (error: any) {
    console.error('[Research] Start error:', error);
    return res.status(500).json({ 
      error: 'Failed to start research',
      message: error.message 
    });
  }
});

/**
 * GET /research/stream/:id
 * SSE stream of research events (thinking, tool calls, results, completion)
 */
router.get('/stream/:id', async (req, res) => {
  try {
    const runId = req.params.id;
    const userId = req.auth?.sub as string;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    console.log('[Research] Stream requested:', { runId, userId });
    
    // Verify run exists and belongs to user
    const result = await dbQuery(
      `SELECT id, user_id, query, status, uploaded_files, depth
       FROM o1_research_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Research run not found' });
    }

    const run = result.rows[0];

    // Set SSE headers (CRITICAL for streaming)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();
    
    // Helper to emit SSE events
    const emit = (event: string, data: any) => {
      // SSE format: event: <type>\ndata: <json>\n\n
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    
    // ========================================================================
    // PHASE 3: TRUE DYNAMIC PLANNING + EXECUTION (o1-Style)
    // ========================================================================
    
    const startTime = Date.now();
    console.log('[Research] Starting o1-style research with dynamic planning...');
    
    // Track all findings and charts
    const allFindings: string[] = [];
    const sources: string[] = [];
    const chartUrls: Record<string, string> = {}; // Charts generated during execution
    let documentAnalysisResult: string | null = null;
    
    // Parse uploaded files and chart requests
    console.log('[Research] Raw uploaded_files from DB:', typeof run.uploaded_files, run.uploaded_files);
    const uploadedFiles: UploadedFile[] = Array.isArray(run.uploaded_files) 
      ? run.uploaded_files 
      : (run.uploaded_files ? JSON.parse(run.uploaded_files) : []);
    console.log('[Research] Parsed uploadedFiles:', uploadedFiles.length, 'files');
    if (uploadedFiles.length > 0) {
      console.log('[Research] First file:', {
        hasUploadId: !!uploadedFiles[0]?.uploadId,
        hasFileName: !!uploadedFiles[0]?.fileName,
        hasContent: !!uploadedFiles[0]?.content,
        contentLength: uploadedFiles[0]?.content?.length || 0
      });
    }
    
    // Parse include_charts - can be string[] or ChartRequest[]
    const includeChartsRaw = Array.isArray(run.include_charts)
      ? run.include_charts
      : (run.include_charts ? JSON.parse(run.include_charts) : []);
    
    // Normalize to always have type and goal
    const chartRequests: Array<{type: string; goal?: string}> = includeChartsRaw.map((item: any) => {
      if (typeof item === 'string') {
        return { type: item, goal: undefined };
      } else if (item && typeof item === 'object' && item.type) {
        return { type: item.type, goal: item.goal };
      }
      return { type: 'bar', goal: undefined }; // Fallback
    });
    
    const includeCharts = chartRequests.map(c => c.type); // For backward compat
    
    console.log('[Research] Chart requests:', chartRequests);
    
    // ========================================================================
    // TOOL-BASED RESEARCH: Plan with tools, then execute
    // ========================================================================
    
    emit('thinking', {
      thought: 'Analyzing your request and planning research approach...',
      thought_type: 'planning'
    });
    
    // Extract document content if needed
    let documentContext: string | undefined;
    
    if (uploadedFiles.length > 0) {
      const filesWithContent = uploadedFiles.filter((f: any) => f.content && f.content.trim().length > 0) as UploadedFile[];
      
      if (filesWithContent.length > 0) {
        // Extract content - DON'T put filename first (causes fallback issues)
        documentContext = filesWithContent
          .map((f: UploadedFile) => {
            // Extract actual content, looking for real text
            const content = f.content || '';
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            
            // Find first substantial line (not just filename/title markers)
            let firstSubstantialLine = '';
            for (const line of lines.slice(0, 10)) {
              const cleaned = line.replace(/[#*\[\]]/g, '').trim();
              if (cleaned.length > 10 && !cleaned.toLowerCase().includes('.pdf') && !cleaned.toLowerCase().includes('.doc')) {
                firstSubstantialLine = cleaned;
                break;
              }
            }
            
            return `Document: ${f.fileName}\nKey Subject: ${firstSubstantialLine || 'See content below'}\n\n${content}`;
          })
          .join('\n\n---\n\n');
        
        // Don't limit to 4000 chars - use more for understanding!
        documentContext = documentContext.substring(0, 8000);
        
        console.log(`[Research] Document context extracted: ${documentContext.length} chars`);
        console.log(`[Research] First 200 chars:`, documentContext.substring(0, 200));
      }
    }
    
    // Create tool-based research plan
    const plan = await createToolBasedPlan(
      run.query,
      uploadedFiles,
      run.depth,
      chartRequests
    );
    
    console.log('[Tool Planning] Plan created:', JSON.stringify(plan, null, 2));
    
    // Show understanding
    emit('thinking', {
      thought: `Researching: "${plan.understanding.coreSubject}"`,
      thought_type: 'analyzing'
    });
    
    emit('thinking', {
      thought: `Goal: ${plan.understanding.userGoal}`,
      thought_type: 'analyzing'
    });
    
    emit('thinking', {
      thought: `Format: ${plan.understanding.outputFormat} (${plan.toolCalls.length} tools)`,
      thought_type: 'planning'
    });
    
    // Show tool plan
    emit('thinking', {
      thought: `Tool Plan:\n${plan.toolCalls.map((tc, i) => `${i + 1}. ${tc.tool}(${Object.keys(tc.parameters).join(', ')})\n   → ${tc.reasoning}`).join('\n')}`,
      thought_type: 'planning'
    });
    
    // ========================================================================
    // EXECUTE TOOL CALLS
    // ========================================================================
    
    emit('thinking', {
      thought: `Executing ${plan.toolCalls.length} tool${plan.toolCalls.length > 1 ? 's' : ''}...`,
      thought_type: 'executing'
    });
    
    for (let i = 0; i < plan.toolCalls.length; i++) {
      const toolCall = plan.toolCalls[i];
      console.log(`[Tool Execution] Tool ${i + 1}/${plan.toolCalls.length}: ${toolCall.tool}`, toolCall.parameters);
      
      emit('thinking', {
        thought: `Tool ${i + 1}/${plan.toolCalls.length}: ${toolCall.tool}`,
        thought_type: 'executing'
      });
      
      try {
        // Execute based on tool type
        switch (toolCall.tool) {
          case 'analyze_documents': {
            // File analysis
            const filesWithContent = uploadedFiles.filter((f: any) => f.content && f.content.trim().length > 0) as UploadedFile[];
          
            if (filesWithContent.length > 0) {
              emit('tool.call', {
                tool: 'analyze_documents',
                purpose: toolCall.parameters.focus || `Analyze ${filesWithContent.length} uploaded document${filesWithContent.length > 1 ? 's' : ''}`
              });
            
            try {
              const combinedContent = filesWithContent
                .map((f: UploadedFile) => `### ${f.fileName}\n\n${f.content}`)
                .join('\n\n---\n\n');
              
              console.log(`[Research] Processing ${filesWithContent.length} files with content (${combinedContent.length} chars total)`);
              
              documentAnalysisResult = await generateSectionSummary(
                'Document Analysis', 
                [`Extracted content from ${filesWithContent.length} document(s):\n\n${combinedContent.substring(0, 8000)}`]
              );
              
              const documentFindings = documentAnalysisResult
                .split('\n')
                .filter(line => line.trim().length > 20 && !line.startsWith('#'))
                .map(line => `[From Uploaded Documents] ${line.trim()}`)
                .slice(0, 10);
              
              allFindings.push(...documentFindings);
              sources.push(...filesWithContent.map((f: UploadedFile) => `Uploaded: ${f.fileName}`));
              
              emit('tool.result', {
                tool: 'document_analysis',
                findings_count: documentFindings.length,
                key_insights: `Extracted ${documentFindings.length} key insights from uploaded documents`
    });
  } catch (error: any) {
              console.error('[Research] Document analysis error:', error);
              emit('tool.result', {
                tool: 'document_analysis',
                findings_count: 0,
                key_insights: `Analysis failed: ${error.message}`
              });
            }
          } else {
            emit('thinking', {
              thought: 'Files uploaded but content not available. Skipping this step.',
              thought_type: 'pivot'
            });
          }
            break;
          }
          
          case 'search_web': {
            // Web search - use SPECIFIC query from tool parameters!
            if (isOpenAIConfigured()) {
              const searchQuery = toolCall.parameters.searchQuery || run.query;
              
              emit('tool.call', {
                tool: 'search_web',
                purpose: `Search: ${searchQuery}`
              });
              
              try {
                console.log(`[Tool Execution] Executing search: "${searchQuery}"`);
                const searchResult = await searchWeb(searchQuery);
                
                allFindings.push(...searchResult.findings);
                sources.push(...searchResult.sources);
                
                emit('tool.result', {
                  tool: 'search_web',
                  findings_count: searchResult.findings.length,
                  key_insights: searchResult.summary
                });
              } catch (error: any) {
                console.error('[Tool Execution] Web search error:', error);
                emit('tool.result', {
                  tool: 'search_web',
                  findings_count: 0,
                  key_insights: `Search failed: ${error.message}`
                });
              }
            } else {
              emit('thinking', {
                thought: 'External search not available (OpenAI not configured).',
                thought_type: 'pivot'
              });
            }
            break;
          }
          
          case 'generate_chart': {
            // Chart generation from tool parameters
            emit('thinking', {
              thought: `Generating ${toolCall.parameters.chartType} chart...`,
              thought_type: 'synthesis'
            });

            
            if (allFindings.length > 0) {
              try {
                const chartType = toolCall.parameters.chartType || 'bar';
                const chartGoal = toolCall.parameters.goal || `Create a ${chartType} chart from research findings`;
                
                emit('tool.call', {
                  tool: 'generate_chart',
                  purpose: chartGoal
                });
                
                const chartService = new ChartService();
                const chartData = {
                  data: allFindings.join('\n'),
                  chartType: chartType as any,
                  title: `${plan.understanding.coreSubject} - ${chartType} visualization`,
                  goal: chartGoal
                };
                
                console.log(`[Tool Execution] Generating ${chartType} chart...`);
                const chartResult = await chartService.generateChart(chartData);
                
                if (chartResult.success && chartResult.chart_url) {
                  chartUrls[chartType] = chartResult.chart_url;
                  console.log(`[Tool Execution] ${chartType} chart generated: ${chartResult.chart_url}`);
                  
                  emit('tool.result', {
                    tool: 'generate_chart',
                    findings_count: 1,
                    key_insights: `${chartType} chart generated successfully`
                  });
                } else {
                  console.warn(`[Tool Execution] ${chartType} chart generation failed:`, chartResult.error);
                  emit('tool.result', {
                    tool: 'generate_chart',
                    findings_count: 0,
                    key_insights: `${chartType} chart generation failed: ${chartResult.error || 'Unknown error'}`
                  });
                }
  } catch (error: any) {
                console.error(`[Tool Execution] Error generating chart:`, error);
                emit('tool.result', {
                  tool: 'generate_chart',
                  findings_count: 0,
                  key_insights: `Error: ${error.message}`
                });
              }
            } else {
              emit('thinking', {
                thought: 'No findings available yet for chart generation. Skipping.',
                thought_type: 'pivot'
              });
            }
            break;
          }
          
          case 'compile_report': {
            // Report compilation - will be handled after loop
            emit('thinking', {
              thought: 'Preparing to compile final report...',
              thought_type: 'writing'
            });
            // Store report parameters for later
            break;
          }
          
          default: {
            // Unknown tool
            emit('thinking', {
              thought: `Executing tool: ${toolCall.tool}`,
              thought_type: 'executing'
            });
          }
        }
        
  } catch (error: any) {
        console.error(`[Tool Execution] Error executing tool "${toolCall.tool}":`, error);
        emit('thinking', {
          thought: `Tool encountered an issue: ${error.message}. Continuing with next tool.`,
          thought_type: 'pivot'
        });
      }
    }
    
    // Charts already generated during execution (if plan included generate_chart steps)
    emit('thinking', {
      thought: 'Plan execution complete. Finalizing report...',
      thought_type: 'synthesis'
    });
    
    // Step 4: Generate section previews
    if (allFindings.length > 0) {
      let execSummary = 'Analysis of research findings';
      try {
        execSummary = await generateSectionSummary('Executive Summary', allFindings.slice(0, 3));
  } catch (error: any) {
        console.error('[Research] Executive summary generation error:', error);
        execSummary = `Research on "${run.query}" with ${allFindings.length} findings from ${sources.length} sources.`;
      }
      
      emit('section.completed', {
        section: 'Executive Summary',
        preview: execSummary.substring(0, 200) + (execSummary.length > 200 ? '...' : '')
      });
      
      const keyFindingsPreview = allFindings.slice(0, 5).map((f, i) => `${i + 1}. ${f.substring(0, 80)}${f.length > 80 ? '...' : ''}`).join('\n');
      
      emit('section.completed', {
        section: 'Key Findings',
        preview: keyFindingsPreview
      });
    }
    
    emit('thinking', {
      thought: 'Finalizing report with actionable insights...',
      thought_type: 'final_review'
    });
    
    // Step 5: Generate final comprehensive report
    let finalReport: string;
    
    // If no findings, create simple report
    if (allFindings.length === 0) {
      finalReport = `# Research Report

## Query
"${run.query}"

## Status
Research completed but no specific findings were returned. This may be due to:
- OpenAI API configuration issues
- Query requires more specific parameters
- External search limitations

## Recommendation
Please try rephrasing your query or check API configuration.`;
    } else {
      // Try APIM synthesis with fallback
      try {
        // Get compile_report tool parameters
        const compileReportTool = plan.toolCalls.find(tc => tc.tool === 'compile_report');
        const reportFormat = compileReportTool?.parameters.format || plan.understanding.outputFormat;
        const reportSections = compileReportTool?.parameters.sections;
        
        finalReport = await generateReport({
          query: run.query,
          depth: run.depth as any,
          fileFindings: uploadedFiles.length > 0 ? allFindings.filter(f => f.includes('From Uploaded Documents')) : undefined,
          webFindings: allFindings.filter(f => !f.includes('From Uploaded Documents')),
          sources,
          outputStyle: reportFormat as any,
          reportSections: reportSections
    });
  } catch (error: any) {
        console.error('[Research] APIM report generation error:', error);
        
        // Create fallback report without APIM
        finalReport = `# Research Report

## Executive Summary

Research on "${run.query}" with ${allFindings.length} findings from ${sources.length} sources.

## Key Findings

${allFindings.map((f, i) => `${i + 1}. ${f}`).join('\n\n')}

## Analysis

The research covered ${allFindings.length} key findings from ${sources.length} sources.

## Sources

${sources.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Conclusion

This ${run.depth}-depth research provides foundational information on the topic. Further analysis may be needed for specific aspects.

---

*Research completed at ${new Date().toISOString()}*  
*Note: Advanced synthesis temporarily unavailable*`;
      }
      
      // Append charts to report if generated
      if (Object.keys(chartUrls).length > 0) {
        finalReport += `\n\n## Visualizations\n\n`;
        for (const [chartType, chartUrl] of Object.entries(chartUrls)) {
          finalReport += `### ${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart\n\n![${chartType} visualization](${chartUrl})\n\n`;
        }
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Final completion event
    emit('research.completed', {
      run_id: runId,
      report_content: finalReport,
      metadata: {
        word_count: finalReport.split(/\s+/).length,
        duration_seconds: duration,
        phase: 4, // Phase 4: Tool-based planning
        tools_executed: plan.toolCalls.length,
        output_format: plan.understanding.outputFormat,
        files_analyzed: uploadedFiles.length,
        web_sources: sources.length,
        findings_count: allFindings.length,
        charts_generated: Object.keys(chartUrls).length,
        chart_types: Object.keys(chartUrls),
        depth: run.depth
      }
    });
    
    // Update database with final report
    await dbQuery(
      `UPDATE o1_research_runs 
       SET status = 'completed',
           report_content = $2,
           metadata = jsonb_set(metadata, '{completed_at}', to_jsonb($3::text)),
           updated_at = NOW()
       WHERE id = $1`,
      [runId, finalReport, new Date().toISOString()]
    );
    
    console.log('[Research] Stream completed:', runId);
    
    // Close SSE connection
    res.end();
    
  } catch (error: any) {
    console.error('[Research] Stream error:', error);
    
    // Emit error event if possible
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ 
        message: 'Stream error occurred',
        error: error.message 
      })}\n\n`);
    } catch (writeError) {
      console.error('[Research] Failed to write error event:', writeError);
    }
    
    res.end();
  }
});

/**
 * GET /research/status/:id
 * Get current status of a research run
 */
router.get('/status/:id', async (req, res) => {
  try {
    const runId = req.params.id;
    const userId = req.auth?.sub as string;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    const result = await dbQuery(
      `SELECT id, status, query, depth, report_content, metadata, created_at, updated_at
       FROM o1_research_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Research run not found' });
    }

    const run = result.rows[0];

    res.json({
      run_id: run.id,
      status: run.status,
      query: run.query,
      depth: run.depth,
      has_report: !!run.report_content,
      metadata: run.metadata,
      created_at: run.created_at,
      updated_at: run.updated_at
    });
    
  } catch (error: any) {
    console.error('[Research] Status error:', error);
    res.status(500).json({ error: 'Failed to get research status' });
  }
});

/**
 * GET /research/health
 * Health check for research module
 */
router.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    await dbQuery('SELECT 1');
    
    // Check if o1_research_runs table exists
    const tableCheck = await dbQuery(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'o1_research_runs'
      )`
    );
    
    const tableExists = tableCheck.rows[0]?.exists;

    res.json({
      status: 'ok',
      module: 'research',
      version: '1.0.0',
      phase: 1,
      timestamp: new Date().toISOString(),
      dependencies: {
        database: true,
        research_table: tableExists,
        apim: !!process.env.APIM_HOST,
        openai: !!process.env.OPENAI_API_KEY
      }
    });
  } catch (error: any) {
    console.error('[Research] Health check error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * POST /research/:runId/chat
 * Follow-up conversational chat about a completed research report
 */
router.post('/:runId/chat', async (req, res) => {
  try {
    const { runId } = req.params;
    const { message } = req.body;
    const userId = (req as any).user?.sub;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('[Research Chat] Follow-up question:', { runId, userId, message: message.substring(0, 100) });

    // Retrieve the research run
    const result = await dbQuery(
      `SELECT id, user_id, query, report_content, status, metadata
       FROM o1_research_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Research run not found' });
    }

    const run = result.rows[0];

    if (run.status !== 'completed') {
      return res.status(400).json({ error: 'Research is not yet completed. Please wait for the report to finish.' });
    }

    if (!run.report_content || run.report_content.trim().length === 0) {
      return res.status(400).json({ error: 'No report content available for this research.' });
    }

    // Build context for APIM
    const reportContext = `RESEARCH REPORT (Generated for query: "${run.query}"):\n\n${run.report_content}`;

    const systemPrompt = `You are a helpful research assistant. The user has just received a research report and wants to ask follow-up questions about it.

CONTEXT:
- Original research query: "${run.query}"
- A comprehensive research report was generated (provided below)
- User is now asking follow-up questions about this report

YOUR JOB:
- Answer questions BASED ON THE REPORT CONTENT
- Be conversational and helpful
- If the user asks for clarification, provide it
- If the user asks for more detail on a specific section, expand on it
- If the user asks something NOT in the report, acknowledge that and offer to help differently
- Keep responses concise unless user asks for detail

CRITICAL:
- DO NOT make up information not in the report
- DO NOT trigger new research (this is just Q&A about existing report)
- Reference specific sections/findings from the report when answering`;

    const userPrompt = `${reportContext}

---

USER'S FOLLOW-UP QUESTION:
${message}

Provide a helpful, conversational answer based on the research report above.`;

    console.log('[Research Chat] Calling APIM for follow-up answer...');

    // Call APIM for conversational response
    const response = await callAPIM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // Extract content from APIM response
    const content = (response as any).choices?.[0]?.message?.content || response;
    
    console.log('[Research Chat] APIM response:', content.substring(0, 200));

    return res.json({
      run_id: runId,
      message: content,
      original_query: run.query
    });

  } catch (error: any) {
    console.error('[Research Chat] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process follow-up question',
      details: error.message 
    });
  }
});

export default router;
