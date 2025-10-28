/**
 * Unified Agent Orchestrator
 * Adapts tool-based thinking system for ALL agent modes
 * Per Kevin's plan: All business logic in API, APIM for secure processing
 */

import { callAPIM } from './agenticFlow.js';
import { searchWeb } from './openaiSearch.js';
import { ChartService } from './chartService.js';

export interface UploadedFile {
  fileName: string;
  content: string;
}

export interface AgentContext {
  mode: 'reports' | 'charts' | 'templates' | 'plans' | 'research';
  goal: string;
  uploadedFiles: UploadedFile[];
  depth?: string;
  focus?: string;
  selectedCharts?: string[];
  selectedTemplates?: string[];
  planFormat?: string;
  templateType?: string;
}

export interface ToolCall {
  tool: string;
  parameters: any;
  reasoning: string;
}

export interface Plan {
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
 * Create a tool-based plan adapted for each mode
 */
export async function createUnifiedPlan(context: AgentContext): Promise<Plan> {
  const tools = defineToolsForMode(context.mode);
  const documentContent = extractDocumentContent(context.uploadedFiles);
  
  const systemPrompt = buildSystemPrompt(context.mode, tools);
  const userPrompt = buildUserPrompt(context, documentContent);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  console.log(`[UnifiedOrchestrator] Creating plan for mode: ${context.mode}`);
  
  const response = await callAPIM(messages);
  const content = response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('APIM did not return planning content');
  }

  // Parse JSON response
  try {
    const plan = JSON.parse(content) as Plan;
    console.log(`[UnifiedOrchestrator] Plan created:`, {
      subject: plan.understanding.coreSubject,
      toolCount: plan.toolCalls.length,
      tools: plan.toolCalls.map(t => t.tool)
    });
    return plan;
  } catch (parseError) {
    // Fallback: extract JSON from markdown
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[1]) as Plan;
      return plan;
    }
    throw new Error(`Failed to parse APIM planning response: ${parseError}`);
  }
}

/**
 * Execute tool calls from plan
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  context: AgentContext,
  onProgress?: (tool: string, result: any) => void
): Promise<Map<string, any>> {
  const results = new Map<string, any>();

  for (const toolCall of toolCalls) {
    console.log(`[UnifiedOrchestrator] Executing tool: ${toolCall.tool}`);
    
    try {
      let result: any;

      switch (toolCall.tool) {
        case 'analyze_documents':
          result = await analyzeDocuments(context.uploadedFiles, toolCall.parameters);
          break;

        case 'search_web':
          result = await searchWeb(toolCall.parameters.searchQuery);
          break;

        case 'generate_chart':
          result = await generateChart(toolCall.parameters, context);
          break;

        case 'compile_report':
          // This is handled separately as final step
          result = { format: toolCall.parameters.format, sections: toolCall.parameters.sections };
          break;

        default:
          console.warn(`[UnifiedOrchestrator] Unknown tool: ${toolCall.tool}`);
          result = { error: `Tool not implemented: ${toolCall.tool}` };
      }

      results.set(toolCall.tool, result);
      
      if (onProgress) {
        onProgress(toolCall.tool, result);
      }
    } catch (error: any) {
      console.error(`[UnifiedOrchestrator] Tool execution failed: ${toolCall.tool}`, error);
      results.set(toolCall.tool, { error: error.message });
    }
  }

  return results;
}

/**
 * Compile final output using gathered results
 */
export async function compileFinalOutput(
  plan: Plan,
  results: Map<string, any>,
  context: AgentContext
): Promise<string> {
  // Find compile_report tool call to get format/sections
  const compileCall = plan.toolCalls.find(tc => tc.tool === 'compile_report');
  const outputFormat = plan.understanding.outputFormat;
  const sections = compileCall?.parameters?.sections || null;

  // Build context for APIM
  const gatheredData: string[] = [];

  // Add document analysis
  if (results.has('analyze_documents')) {
    gatheredData.push('## Document Analysis\n' + results.get('analyze_documents').insights);
  }

  // Add search results
  if (results.has('search_web')) {
    const searchData = results.get('search_web');
    if (searchData.choices?.[0]?.message?.content) {
      gatheredData.push('## External Research\n' + searchData.choices[0].message.content);
    }
  }

  // Add chart references
  if (results.has('generate_chart')) {
    const chartData = results.get('generate_chart');
    if (chartData.path) {
      gatheredData.push(`## Chart\n![Chart](${chartData.path})`);
    }
  }

  // Compile using APIM
  const systemPrompt = buildCompilationPrompt(context.mode, outputFormat, sections);
  const userPrompt = `Subject: ${plan.understanding.coreSubject}
Goal: ${plan.understanding.userGoal}

Gathered Data:
${gatheredData.join('\n\n')}

Create the final ${context.mode} output.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const response = await callAPIM(messages);
  const content = response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('APIM did not return compilation content');
  }

  return content;
}

// ============================================================================
// Helper Functions
// ============================================================================

function defineToolsForMode(mode: string) {
  const baseTools = [
    {
      name: "analyze_documents",
      description: "Extract key insights, facts, and context from uploaded documents",
      parameters: { focus: "string - what specific information to look for" }
    },
    {
      name: "search_web",
      description: "Search public web for information (powered by OpenAI)",
      parameters: { searchQuery: "string - specific, targeted search query" }
    }
  ];

  if (mode === 'charts') {
    return [
      ...baseTools,
      {
        name: "generate_chart",
        description: "Create data visualization",
        parameters: {
          chartType: "string - bar, line, pie, scatter, etc",
          dataNeeded: "string - what data points are needed",
          goal: "string - what the chart should communicate"
        }
      }
    ];
  }

  if (mode === 'templates') {
    return [
      ...baseTools,
      {
        name: "compile_report",
        description: "Format output using template structure",
        parameters: {
          templateType: "string - template type to use",
          sections: "array of strings - required sections"
        }
      }
    ];
  }

  if (mode === 'plans') {
    return [
      ...baseTools,
      {
        name: "compile_report",
        description: "Create structured plan document",
        parameters: {
          format: "string - plan format (strategic, project, marketing, etc)",
          sections: "array of strings - plan sections",
          milestones: "array - key milestones and timelines"
        }
      }
    ];
  }

  // Default (reports, research)
  return [
    ...baseTools,
    {
      name: "generate_chart",
      description: "Create data visualization",
      parameters: {
        chartType: "string",
        dataNeeded: "string",
        goal: "string"
      }
    },
    {
      name: "compile_report",
      description: "Format final research output",
      parameters: {
        format: "string - brief, standard, comprehensive",
        sections: "array of strings or null"
      }
    }
  ];
}

function extractDocumentContent(files: UploadedFile[]): string | null {
  if (files.length === 0) return null;
  return files.map(f => `FILE: ${f.fileName}\nCONTENT:\n${f.content || '(no content)'}`).join('\n\n---\n\n');
}

function buildSystemPrompt(mode: string, tools: any[]): string {
  const modeInstructions: Record<string, string> = {
    reports: `You create professional business reports with clear structure and insights.
Focus on: Executive summaries, data analysis, actionable recommendations.`,
    
    charts: `You create data visualizations that tell a clear story.
Focus on: Identifying key metrics, choosing appropriate chart types, clear labels.`,
    
    templates: `You fill structured templates with researched information.
Focus on: Completeness, accuracy, professional formatting, template adherence.`,
    
    plans: `You create actionable strategic plans with clear milestones.
Focus on: Objectives, timelines, resources, risks, success metrics.`,
    
    research: `You conduct comprehensive research with deep analysis.
Focus on: Multiple sources, critical evaluation, detailed synthesis, evidence-based conclusions.`
  };

  return `You are an intelligent planning AI for ${mode} generation.

${modeInstructions[mode] || modeInstructions.research}

YOUR JOB:
1. UNDERSTAND what the user wants (identify the REAL subject!)
2. CHOOSE which tools to use
3. CREATE specific parameters for each tool

CRITICAL RULES:
- Extract the SUBJECT from the query, NOT the query itself!
- If user says "quick"/"summary"/"brief" → format="brief" (NO sections)
- If user uploads documents → ALWAYS analyze_documents FIRST
- For search_web → Create queries ABOUT THE SUBJECT, include year "2024"
- For compile_report → Match format to user intent (brief/standard/comprehensive)

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

function buildUserPrompt(context: AgentContext, documentContent: string | null): string {
  let prompt = `Mode: ${context.mode}
Query: "${context.goal}"`;

  if (context.depth) {
    prompt += `\nDepth requested: ${context.depth}`;
  }

  if (context.focus) {
    prompt += `\nFocus: ${context.focus}`;
  }

  if (documentContent) {
    prompt += `\n\nUPLOADED DOCUMENTS (${context.uploadedFiles.length} files):
${documentContent.substring(0, 4000)}${documentContent.length > 4000 ? '...(truncated)' : ''}`;
  } else {
    prompt += `\n\nNo uploaded documents.`;
  }

  if (context.selectedCharts && context.selectedCharts.length > 0) {
    prompt += `\n\nREQUESTED CHARTS: ${context.selectedCharts.join(', ')}`;
  }

  if (context.templateType) {
    prompt += `\n\nTEMPLATE TYPE: ${context.templateType}`;
  }

  if (context.planFormat) {
    prompt += `\n\nPLAN FORMAT: ${context.planFormat}`;
  }

  prompt += `\n\nCreate a tool-based plan. Remember: Extract the SUBJECT, choose appropriate tools, create specific parameters.`;

  return prompt;
}

function buildCompilationPrompt(mode: string, format: string, sections: string[] | null): string {
  const formatGuidelines: Record<string, string> = {
    brief: '150-300 words, 2 paragraphs, NO sections, conversational',
    standard: '500-800 words, 3-5 sections with headers, professional',
    comprehensive: '1500+ words, 5-8+ sections, detailed analysis, citations'
  };

  const modeSpecific: Record<string, string> = {
    reports: 'Use business report format with executive summary, findings, and recommendations.',
    charts: 'Provide chart with clear title, labels, and interpretation.',
    templates: 'Follow the template structure exactly, fill all required sections.',
    plans: 'Include objectives, timeline, milestones, resources, risks, and success metrics.',
    research: 'Provide comprehensive analysis with multiple perspectives and evidence.'
  };

  return `You are compiling a final ${mode} output.

FORMAT: ${formatGuidelines[format] || formatGuidelines.standard}

${modeSpecific[mode] || modeSpecific.research}

${sections && sections.length > 0 ? `\nREQUIRED SECTIONS:\n${sections.map(s => `- ${s}`).join('\n')}` : ''}

Use markdown formatting. Be clear, concise, and professional.`;
}

async function analyzeDocuments(files: UploadedFile[], parameters: any): Promise<any> {
  const focus = parameters.focus || 'general insights';
  const combinedContent = files.map(f => f.content).join('\n\n');

  const messages = [
    {
      role: 'system',
      content: `You are a document analysis expert. Extract key insights focused on: ${focus}`
    },
    {
      role: 'user',
      content: `Analyze these documents:\n\n${combinedContent.substring(0, 10000)}`
    }
  ];

  const response = await callAPIM(messages);
  const insights = response.choices?.[0]?.message?.content || 'No insights extracted';

  return { insights, focus };
}

async function generateChart(parameters: any, context: AgentContext): Promise<any> {
  const chartService = new ChartService();
  
  // For now, return placeholder - full implementation would integrate with ChartService
  return {
    type: parameters.chartType,
    path: `/charts/placeholder-${parameters.chartType}.png`,
    goal: parameters.goal
  };
}

