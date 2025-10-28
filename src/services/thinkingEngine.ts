/**
 * Unified Thinking Engine
 * ONE system used by ALL agent modes (research, templates, reports, charts, plans)
 * Per Kevin's plan: All business logic in API, APIM for secure processing
 */

import { callAPIM } from './agenticFlow.js';
import { searchWeb } from './openaiSearch.js';
import { ChartService } from './chartService.js';
import { query as dbQuery } from '../db/query.js';
import { v4 as uuidv4 } from 'uuid';

export interface ThinkingContext {
  mode: 'research' | 'templates' | 'reports' | 'charts' | 'plans';
  query: string;
  userId: string;
  orgId: string;
  depth: 'short' | 'medium' | 'long' | 'comprehensive';
  uploadedFiles?: Array<{ uploadId: string; fileName: string; content: string }>;
  templateType?: string;
  chartTypes?: string[];
  planFormat?: string;
}

export interface ToolCall {
  tool: string;
  parameters: any;
  reasoning: string;
}

export interface ThinkingPlan {
  understanding: {
    coreSubject: string;
    userGoal: string;
    needsExternal: boolean;
    needsDocAnalysis: boolean;
    outputFormat: 'brief' | 'standard' | 'comprehensive';
  };
  toolCalls: ToolCall[];
}

/**
 * Start a thinking run - creates DB record and returns runId
 */
export async function startThinking(context: ThinkingContext): Promise<string> {
  const runId = uuidv4();

  await dbQuery(
    `INSERT INTO thinking_runs 
     (id, user_id, org_id, query, depth, status, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      runId,
      context.userId,
      context.orgId,
      context.query,
      context.depth,
      'running',
      JSON.stringify({
        mode: context.mode,
        templateType: context.templateType,
        chartTypes: context.chartTypes,
        planFormat: context.planFormat,
        uploadedFilesCount: context.uploadedFiles?.length || 0
      })
    ]
  );

  console.log(`[ThinkingEngine] Started ${context.mode} run: ${runId}`);
  return runId;
}

/**
 * Create a tool-based plan using APIM
 */
export async function createThinkingPlan(context: ThinkingContext): Promise<ThinkingPlan> {
  const tools = defineToolsForMode(context.mode, context);
  const documentContent = extractDocumentContent(context.uploadedFiles);
  
  const systemPrompt = buildPlanningPrompt(context, tools);
  const userPrompt = buildUserPrompt(context, documentContent);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  console.log(`[ThinkingEngine] Creating plan for ${context.mode}...`);
  
  const response = await callAPIM(messages);
  const content = response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('APIM did not return planning content');
  }

  // Parse JSON response
  try {
    const plan = JSON.parse(content) as ThinkingPlan;
    console.log(`[ThinkingEngine] Plan created: ${plan.toolCalls.length} tools`);
    return plan;
  } catch {
    // Try extracting JSON from markdown
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as ThinkingPlan;
    }
    throw new Error('Failed to parse APIM planning response');
  }
}

/**
 * Execute tools from plan
 */
export async function executeTools(
  toolCalls: ToolCall[],
  context: ThinkingContext
): Promise<Map<string, any>> {
  const results = new Map<string, any>();

  for (const toolCall of toolCalls) {
    console.log(`[ThinkingEngine] Executing: ${toolCall.tool}`);
    
    try {
      let result: any;

      switch (toolCall.tool) {
        case 'analyze_documents':
          result = await analyzeDocuments(context.uploadedFiles || [], toolCall.parameters);
          break;

        case 'search_web':
          result = await searchWeb(toolCall.parameters.searchQuery);
          break;

        case 'generate_chart':
          result = await generateChart(toolCall.parameters);
          break;

        default:
          console.warn(`[ThinkingEngine] Unknown tool: ${toolCall.tool}`);
          result = { error: `Tool not implemented: ${toolCall.tool}` };
      }

      results.set(toolCall.tool, result);
    } catch (error: any) {
      console.error(`[ThinkingEngine] Tool execution failed: ${toolCall.tool}`, error);
      results.set(toolCall.tool, { error: error.message });
    }
  }

  return results;
}

/**
 * Generate final output using APIM
 */
export async function generateOutput(
  plan: ThinkingPlan,
  results: Map<string, any>,
  context: ThinkingContext
): Promise<string> {
  // Build context from results
  const gatheredData: string[] = [];

  results.forEach((result, tool) => {
    if (tool === 'analyze_documents' && result.insights) {
      gatheredData.push(`### Document Analysis\n${result.insights}`);
    }
    if (tool === 'search_web' && result.choices?.[0]?.message?.content) {
      gatheredData.push(`### Research\n${result.choices[0].message.content}`);
    }
  });

  const systemPrompt = buildOutputPrompt(context, plan);
  const userPrompt = `Subject: ${plan.understanding.coreSubject}
Goal: ${plan.understanding.userGoal}

Gathered Data:
${gatheredData.join('\n\n')}

Generate the final ${context.mode} output.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const response = await callAPIM(messages);
  return response.choices?.[0]?.message?.content || '';
}

/**
 * Complete thinking run
 */
export async function completeThinking(runId: string, output: string): Promise<void> {
  await dbQuery(
    `UPDATE thinking_runs
     SET status = 'completed',
         report_content = $2,
         metadata = jsonb_set(metadata, '{completed_at}', to_jsonb($3::text)),
         updated_at = NOW()
     WHERE id = $1`,
    [runId, output, new Date().toISOString()]
  );
  
  console.log(`[ThinkingEngine] Completed run: ${runId}`);
}

/**
 * Fail thinking run
 */
export async function failThinking(runId: string, error: string): Promise<void> {
  await dbQuery(
    `UPDATE thinking_runs
     SET status = 'failed',
         metadata = jsonb_set(metadata, '{error}', to_jsonb($2::text)),
         updated_at = NOW()
     WHERE id = $1`,
    [runId, error]
  );
  
  console.error(`[ThinkingEngine] Failed run: ${runId}`, error);
}

// ============================================================================
// Helper Functions
// ============================================================================

function defineToolsForMode(mode: string, context: ThinkingContext): any[] {
  const baseTools: any[] = [
    {
      name: "analyze_documents",
      description: "Extract insights from uploaded documents",
      parameters: { focus: "string - what to look for" }
    },
    {
      name: "search_web",
      description: "Search public web (OpenAI)",
      parameters: { searchQuery: "string - specific search query" }
    }
  ];

  if (mode === 'charts' || context.chartTypes) {
    baseTools.push({
      name: "generate_chart",
      description: "Create data visualization",
      parameters: {
        chartType: "string",
        dataNeeded: "string",
        goal: "string"
      }
    });
  }

  return baseTools;
}

function extractDocumentContent(files?: Array<{ fileName: string; content: string }>): string | null {
  if (!files || files.length === 0) return null;
  return files.map(f => `FILE: ${f.fileName}\nCONTENT:\n${f.content}`).join('\n\n---\n\n');
}

function buildPlanningPrompt(context: ThinkingContext, tools: any[]): string {
  const modeInstructions: Record<string, string> = {
    research: 'Conduct comprehensive research with deep analysis',
    templates: `Fill ${context.templateType || 'template'} structure with researched information`,
    reports: 'Create professional business report',
    charts: 'Generate data visualizations',
    plans: `Create ${context.planFormat || 'strategic'} plan with milestones`
  };

  return `You are an intelligent planning AI for ${context.mode} generation.

PURPOSE: ${modeInstructions[context.mode] || 'Generate output'}

YOUR JOB:
1. Understand what the user wants (identify the REAL subject!)
2. Choose which tools to use
3. Create specific parameters for each tool

CRITICAL RULES:
- Extract the SUBJECT from the query, NOT the query itself!
- If user says "quick"/"summary"/"brief" → format="brief"
- If user uploads documents → ALWAYS analyze_documents FIRST
- For search_web → Create queries ABOUT THE SUBJECT, include year "2024"

AVAILABLE TOOLS:
${JSON.stringify(tools, null, 2)}

Respond with ONLY valid JSON:
{
  "understanding": {
    "coreSubject": "the REAL subject",
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
}

function buildUserPrompt(context: ThinkingContext, documentContent: string | null): string {
  let prompt = `Mode: ${context.mode}
Query: "${context.query}"
Depth: ${context.depth}`;

  if (context.templateType) {
    prompt += `\nTemplate Type: ${context.templateType}`;
  }

  if (context.chartTypes && context.chartTypes.length > 0) {
    prompt += `\nChart Types: ${context.chartTypes.join(', ')}`;
  }

  if (context.planFormat) {
    prompt += `\nPlan Format: ${context.planFormat}`;
  }

  if (documentContent) {
    prompt += `\n\nUPLOADED DOCUMENTS:
${documentContent.substring(0, 4000)}${documentContent.length > 4000 ? '...(truncated)' : ''}`;
  } else {
    prompt += `\n\nNo uploaded documents.`;
  }

  prompt += `\n\nCreate a tool-based plan.`;

  return prompt;
}

function buildOutputPrompt(context: ThinkingContext, plan: ThinkingPlan): string {
  const formatGuidelines: Record<string, string> = {
    brief: '150-300 words, 2 paragraphs, NO sections',
    standard: '500-800 words, 3-5 sections, professional',
    comprehensive: '1500+ words, 5-8+ sections, detailed'
  };

  return `You are generating a final ${context.mode} output.

FORMAT: ${formatGuidelines[plan.understanding.outputFormat] || formatGuidelines.standard}

Use markdown formatting. Be clear, concise, and professional.

${context.templateType ? `Template Type: ${context.templateType}\nFollow the template structure.` : ''}
${context.planFormat ? `Plan Format: ${context.planFormat}\nInclude objectives, timeline, milestones.` : ''}`;
}

async function analyzeDocuments(files: Array<any>, parameters: any): Promise<any> {
  const focus = parameters.focus || 'general insights';
  const combinedContent = files.map(f => f.content).join('\n\n');

  const messages = [
    {
      role: 'system',
      content: `Extract key insights focused on: ${focus}`
    },
    {
      role: 'user',
      content: `Analyze:\n\n${combinedContent.substring(0, 10000)}`
    }
  ];

  const response = await callAPIM(messages);
  const insights = response.choices?.[0]?.message?.content || 'No insights';

  return { insights, focus };
}

async function generateChart(parameters: any): Promise<any> {
  // Placeholder - integrate with ChartService
  const chartType = parameters.chartType || 'bar';
  return {
    type: chartType,
    path: `/charts/placeholder-${chartType}.png`,
    goal: parameters.goal || 'Data visualization'
  };
}

