/**
 * Smart Report Generator
 * Fixes repetition problem by generating DISTINCT sections with specific purposes
 * Each section has a clear, non-overlapping mandate
 * 
 * PAGE TARGETS BY DEPTH:
 * - short (Brief):        ~1 page  (~500 words total)
 * - medium (Standard):    ~2 pages (~1000 words total)
 * - long (Detailed):      ~3-4 pages (~1500-2000 words total)
 * - comprehensive:        ~5-6 pages (~2500-3000 words total)
 */

import { callAPIM } from './agenticFlow.js';

interface ReportContext {
  query: string;
  depth: 'short' | 'medium' | 'long' | 'comprehensive';
  fileFindings?: string[];
  webFindings?: string[];
  sources?: string[];
}

/**
 * Generate report with DISTINCT, NON-REPETITIVE sections
 * Depth controls section length and detail level based on target page counts
 */
export async function generateSmartReport(context: ReportContext): Promise<string> {
  console.log('[SmartReportGenerator] Creating non-repetitive report (depth:', context.depth, ')');

  // Combine all data ONCE
  const allData = buildDataContext(context);

  // Generate DISTINCT sections in sequence, each with specific purpose
  // Depth controls how detailed each section is
  const sections: string[] = [];

  // 1. OVERVIEW - High-level context and what this is about
  sections.push(await generateOverview(context.query, allData, context.depth));

  // 2. KEY FINDINGS - Bullet list of specific, concrete facts/findings
  sections.push(await generateKeyFindings(allData, context.depth));

  // 3. ANALYSIS - Interpret what the findings mean, implications
  sections.push(await generateAnalysis(context.query, allData, context.depth));

  // 4. RECOMMENDATIONS - Specific actions based on the analysis
  sections.push(await generateRecommendations(context.query, allData, context.depth));

  // 5. SOURCES (if available)
  if (context.sources && context.sources.length > 0) {
    sections.push(generateSourcesList(context.sources));
  }

  return sections.join('\n\n---\n\n');
}

function buildDataContext(context: ReportContext): string {
  const parts: string[] = [];

  if (context.fileFindings && context.fileFindings.length > 0) {
    parts.push('DOCUMENT FINDINGS:\n' + context.fileFindings.join('\n\n'));
  }

  if (context.webFindings && context.webFindings.length > 0) {
    parts.push('RESEARCH FINDINGS:\n' + context.webFindings.join('\n\n'));
  }

  return parts.join('\n\n===\n\n');
}

/**
 * SECTION 1: Overview
 * PURPOSE: Set context, define scope, explain what this is about
 * MANDATE: Length varies by depth (short/medium/long)
 */
async function generateOverview(query: string, data: string, depth: string): Promise<string> {
  // Adjust length based on depth (target page counts)
  let lengthGuidance = '';
  let wordTarget = '';
  
  if (depth === 'short') {
    // Brief = 1 page total, Overview ~100 words
    lengthGuidance = '1 concise paragraph';
    wordTarget = '~100 words';
  } else if (depth === 'medium') {
    // Standard = 2 pages total, Overview ~200 words
    lengthGuidance = '2-3 paragraphs';
    wordTarget = '~200 words';
  } else if (depth === 'long') {
    // Detailed = 3-4 pages total, Overview ~300 words
    lengthGuidance = '3-4 detailed paragraphs';
    wordTarget = '~300 words';
  } else {
    // Comprehensive = maximum depth, Overview ~400 words
    lengthGuidance = '4-5 comprehensive paragraphs';
    wordTarget = '~400 words';
  }

  const messages = [
    {
      role: 'system',
      content: `You write the OVERVIEW section of research reports.

YOUR SPECIFIC JOB:
- Set the context (what is this about? why does it matter?)
- Define the scope (what will be covered based on ALL the data provided?)
- Frame the situation (background, relevance)

CRITICAL RULES:
- ${lengthGuidance} (${wordTarget})
- Review ALL the research data to understand the full scope
- NO specific findings or facts (those go in Key Findings)
- NO analysis or interpretation (that goes in Analysis)
- NO recommendations (those go in Recommendations)
- Just context-setting and framing based on the breadth of research

Think of this as: "Here's what we're looking at and why it matters."`
    },
    {
      role: 'user',
      content: `Query: ${query}
Research Depth: ${depth}

All Research Data:
${data}

Write the OVERVIEW section (${lengthGuidance}, ${wordTarget}, context-setting only, NO findings detail). Review all the data above to understand the full scope.`
    }
  ];

  const response = await callAPIM(messages);
  const content = response.choices?.[0]?.message?.content || '';
  
  return `## Overview\n\n${content}`;
}

/**
 * SECTION 2: Key Findings
 * PURPOSE: List specific, concrete facts discovered
 * MANDATE: Number of findings varies by depth
 */
async function generateKeyFindings(data: string, depth: string): Promise<string> {
  // Adjust number of findings based on depth (target page counts)
  let findingsCount = '';
  let wordTarget = '';
  
  if (depth === 'short') {
    // Brief = 1 page total, Findings ~150 words
    findingsCount = '5-6 key findings';
    wordTarget = '~150 words total';
  } else if (depth === 'medium') {
    // Standard = 2 pages total, Findings ~300 words
    findingsCount = '8-10 findings';
    wordTarget = '~300 words total';
  } else if (depth === 'long') {
    // Detailed = 3-4 pages total, Findings ~500 words
    findingsCount = '12-15 findings';
    wordTarget = '~500 words total';
  } else {
    // Comprehensive = maximum depth, Findings ~700 words
    findingsCount = '15-20 comprehensive findings';
    wordTarget = '~700 words total';
  }

  const messages = [
    {
      role: 'system',
      content: `You extract and list KEY FINDINGS from research data.

YOUR SPECIFIC JOB:
- List specific, concrete facts found in the data
- Use bullet points (-)
- Be factual and specific (include numbers, dates, names, specifics)
- NO interpretation or analysis (that goes in Analysis section)
- NO recommendations (those go in Recommendations section)

CRITICAL RULES:
- ${findingsCount} (${wordTarget})
- Each bullet = ONE specific finding
- NO repetition between bullets
- NO generic statements ("it's important", "this matters")
- Just facts: "X was found", "Y shows Z", "The document states..."

Think of this as: "Here are the specific things we found."`
    },
    {
      role: 'user',
      content: `Research Depth: ${depth}

All Research Data:
${data}

Extract and list KEY FINDINGS (${findingsCount}, ${wordTarget}, bullet points, facts only, NO interpretation).`
    }
  ];

  const response = await callAPIM(messages);
  const content = response.choices?.[0]?.message?.content || '';
  
  return `## Key Findings\n\n${content}`;
}

/**
 * SECTION 3: Analysis
 * PURPOSE: Interpret findings, explain what they mean
 * MANDATE: Depth varies by research level
 */
async function generateAnalysis(query: string, data: string, depth: string): Promise<string> {
  // Adjust depth of analysis (target page counts)
  let analysisDepth = '';
  let wordTarget = '';
  
  if (depth === 'short') {
    // Brief = 1 page total, Analysis ~150 words
    analysisDepth = '1-2 concise paragraphs';
    wordTarget = '~150 words';
  } else if (depth === 'medium') {
    // Standard = 2 pages total, Analysis ~300 words
    analysisDepth = '2-3 paragraphs';
    wordTarget = '~300 words';
  } else if (depth === 'long') {
    // Detailed = 3-4 pages total, Analysis ~500 words
    analysisDepth = '3-5 detailed paragraphs';
    wordTarget = '~500 words';
  } else {
    // Comprehensive = maximum depth, Analysis ~800 words
    analysisDepth = '5-7 in-depth paragraphs';
    wordTarget = '~800 words';
  }

  const messages = [
    {
      role: 'system',
      content: `You write the ANALYSIS section of research reports.

YOUR SPECIFIC JOB:
- Interpret what ALL the findings MEAN (review all data provided)
- Connect dots between different findings
- Identify patterns, trends, or themes across all sources
- Explain implications and significance
- Answer: "So what? Why does this matter?"

CRITICAL RULES:
- ${analysisDepth} (${wordTarget})
- Analyze ALL the research data (not just a subset)
- DO NOT repeat the findings themselves (they're already listed in Key Findings)
- Focus on interpretation: "This suggests...", "This indicates...", "The pattern shows..."
- NO recommendations (those go in Recommendations section)
- Think critically about what the complete data set tells us

Think of this as: "Here's what the findings actually mean and why they matter."`
    },
    {
      role: 'user',
      content: `Query: ${query}
Research Depth: ${depth}

All Research Data & Findings:
${data}

Write the ANALYSIS section (${analysisDepth}, ${wordTarget}, interpret what ALL the findings mean based on the complete data set, NO recommendations yet).`
    }
  ];

  const response = await callAPIM(messages);
  const content = response.choices?.[0]?.message?.content || '';
  
  return `## Analysis\n\n${content}`;
}

/**
 * SECTION 4: Recommendations
 * PURPOSE: Provide specific, actionable next steps
 * MANDATE: Number varies by depth
 */
async function generateRecommendations(query: string, data: string, depth: string): Promise<string> {
  // Adjust number of recommendations based on depth (target page counts)
  let recsCount = '';
  let wordTarget = '';
  
  if (depth === 'short') {
    // Brief = 1 page total, Recommendations ~100 words
    recsCount = '3 key recommendations';
    wordTarget = '~100 words total';
  } else if (depth === 'medium') {
    // Standard = 2 pages total, Recommendations ~200 words
    recsCount = '4-5 recommendations';
    wordTarget = '~200 words total';
  } else if (depth === 'long') {
    // Detailed = 3-4 pages total, Recommendations ~300 words
    recsCount = '6-8 recommendations';
    wordTarget = '~300 words total';
  } else {
    // Comprehensive = maximum depth, Recommendations ~400 words
    recsCount = '8-10 comprehensive recommendations';
    wordTarget = '~400 words total';
  }

  const messages = [
    {
      role: 'system',
      content: `You write the RECOMMENDATIONS section of research reports.

YOUR SPECIFIC JOB:
- Provide specific, actionable recommendations based on ALL the research
- Base recommendations on the complete set of findings and analysis
- Make them concrete and practical
- Prioritize by importance

CRITICAL RULES:
- Numbered list (1. 2. 3.)
- ${recsCount} (${wordTarget})
- Each recommendation should be:
  * Specific (what exactly to do)
  * Actionable (can actually be done)
  * Based on findings from the complete data set (not generic advice)
- NO repetition of findings or analysis (those are in previous sections)
- Think: "Based on ALL the research, here's what to do next"

Think of this as: "Here are the concrete actions to take based on this complete analysis."`
    },
    {
      role: 'user',
      content: `Query: ${query}
Research Depth: ${depth}

All Research Data & Context:
${data}

Write the RECOMMENDATIONS section (${recsCount}, ${wordTarget}, specific and actionable, based on ALL the findings in the complete data set).`
    }
  ];

  const response = await callAPIM(messages);
  const content = response.choices?.[0]?.message?.content || '';
  
  return `## Recommendations\n\n${content}`;
}

/**
 * SECTION 5: Sources
 * PURPOSE: List where information came from
 */
function generateSourcesList(sources: string[]): string {
  const uniqueSources = [...new Set(sources)];
  const sourcesList = uniqueSources.map((source, idx) => `${idx + 1}. ${source}`).join('\n');
  
  return `## Sources\n\n${sourcesList}`;
}

/**
 * Generate brief report (2 paragraphs, NO sections)
 */
export async function generateBriefReport(context: ReportContext): Promise<string> {
  const allData = buildDataContext(context);

  const messages = [
    {
      role: 'system',
      content: `You write BRIEF reports (2 paragraphs, NO sections).

YOUR JOB:
- Paragraph 1: Quick overview and most important findings (synthesize ALL the data provided)
- Paragraph 2: Main takeaway, specific details (contact info, location, services), and action item

CRITICAL RULES:
- 150-300 words TOTAL
- USE ALL THE DATA PROVIDED (don't skip findings!)
- NO markdown headers
- NO bullet lists
- NO sections
- Just 2 concise, narrative paragraphs
- Be specific: include names, numbers, contact details, locations
- Get straight to the point with actionable info`
    },
    {
      role: 'user',
      content: `Query: ${context.query}
Depth: ${context.depth}

All Research Data:
${allData}

Sources (include these for credibility):
${context.sources ? context.sources.slice(0, 5).join('\n') : 'No specific sources'}

Write a BRIEF 2-paragraph report that synthesizes ALL the findings above. Include specific details like location, contact info, services, and any key facts. Make it actionable.`
    }
  ];

  const response = await callAPIM(messages);
  return response.choices?.[0]?.message?.content || '';
}

