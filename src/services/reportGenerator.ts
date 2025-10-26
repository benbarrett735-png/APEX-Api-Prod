/**
 * Report Generator Service
 * Phase 2: Generate research reports using APIM
 * 
 * Per Kevin's plan:
 * - Use APIM for all synthesis (more secure than OpenAI)
 * - Generate coherent, well-structured reports
 * - Include findings from all sources (files + web search)
 */

interface ReportContext {
  query: string;
  depth: 'short' | 'medium' | 'long' | 'comprehensive';
  fileFindings?: string[];
  webFindings?: string[];
  sources?: string[];
  reportSections?: string[]; // NEW: Dynamic sections from plan
  outputStyle?: 'brief' | 'standard' | 'comprehensive'; // NEW: Output format hint
  outputLength?: string; // NEW: Expected length hint
}

/**
 * Call APIM for report generation
 * Uses existing callAPIM function from agenticFlow
 */
async function callAPIM(messages: any[]): Promise<string> {
  const APIM_HOST = process.env.APIM_HOST;
  const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
  const APIM_OPERATION = process.env.APIM_OPERATION || '/chat/strong';

  if (!APIM_HOST || !APIM_SUBSCRIPTION_KEY) {
    throw new Error('APIM not configured');
  }

  const url = `${APIM_HOST}${APIM_OPERATION}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': APIM_SUBSCRIPTION_KEY
      },
      body: JSON.stringify({
        messages,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`APIM request failed: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';

  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('APIM request timed out after 60 seconds');
    }
    
    throw error;
  }
}

/**
 * Generate research report using APIM
 */
export async function generateReport(context: ReportContext): Promise<string> {
  console.log('[Report Generator] Generating report:', {
    query: context.query.substring(0, 50),
    depth: context.depth,
    hasFiles: !!context.fileFindings,
    hasWeb: !!context.webFindings
  });

  // Build comprehensive context
  const sections: string[] = [];

  if (context.fileFindings && context.fileFindings.length > 0) {
    sections.push('=== Findings from Uploaded Documents ===\n' + context.fileFindings.join('\n\n'));
  }

  if (context.webFindings && context.webFindings.length > 0) {
    sections.push('=== Findings from External Research ===\n' + context.webFindings.join('\n\n'));
  }

  const combinedFindings = sections.join('\n\n');

  // Determine output style and word target
  const outputStyle = context.outputStyle || 'standard';
  const outputLength = context.outputLength;
  
  let wordTarget = '';
  let formatInstructions = '';
  
  if (outputStyle === 'brief') {
    wordTarget = outputLength || '150-300 words (2 concise paragraphs)';
    formatInstructions = `FORMAT: BRIEF (NO sections!)
- Write 2 concise, narrative paragraphs (NO markdown headers!)
- First paragraph: Quick overview and key point
- Second paragraph: Main takeaway or recommendation
- Total: ${wordTarget}
- NO bullet lists, NO sections, NO "Executive Summary" header
- Just clear, concise prose`;
  } else if (outputStyle === 'comprehensive') {
    wordTarget = outputLength || '1500-2500 words (detailed analysis)';
    formatInstructions = `FORMAT: COMPREHENSIVE
- Detailed multi-section report with ${wordTarget}
- Include all findings with supporting data
- Deep analysis and context for each point
- Comprehensive recommendations`;
  } else {
    // standard
    const depthMap = {
      short: '300-500 words',
      medium: '500-800 words',
      long: '800-1200 words',
      comprehensive: '1200-2000 words'
    };
    wordTarget = outputLength || depthMap[context.depth] || '500-800 words';
    formatInstructions = `FORMAT: STANDARD
- Balanced multi-section report with ${wordTarget}
- Clear structure with appropriate depth
- Key findings with supporting data
- Actionable recommendations`;
  }

  // Build dynamic section structure
  let sectionStructure = '';
  
  if (outputStyle === 'brief') {
    // NO sections for brief
    sectionStructure = `NO SECTIONS. Write 2 narrative paragraphs.`;
  } else if (context.reportSections && context.reportSections.length > 0) {
    // Use DYNAMIC sections from the plan
    console.log('[Report Generator] Using dynamic sections from plan:', context.reportSections);
    sectionStructure = `Structure (ADAPT to the content):\n`;
    context.reportSections.forEach(section => {
      sectionStructure += `\n## ${section}\n(Relevant content for this section based on findings)`;
    });
  } else {
    // Fallback to default structure
    console.log('[Report Generator] Using default section structure');
    sectionStructure = `Structure:
## Executive Summary
(2-3 paragraph overview)

## Key Findings
(Numbered list of 5-8 specific findings with data/context)

## Detailed Analysis
(In-depth exploration organized by themes/topics)

## Recommendations
(3-5 actionable recommendations)

## Conclusion
(Brief summary and next steps)`;
  }
  
  if (outputStyle !== 'brief' && context.sources && context.sources.length > 0) {
    sectionStructure += `\n\n## Sources\n(List of ${context.sources.length} sources referenced)`;
  }
  
  // Create APIM prompt
  const systemPrompt = `You are a professional research analyst creating a research report.

OUTPUT STYLE: ${outputStyle.toUpperCase()}
${formatInstructions}

CRITICAL REQUIREMENTS:
- Write in clear, professional markdown format${outputStyle === 'brief' ? ' (but NO section headers!)' : ''}
- ${outputStyle === 'brief' ? 'NO headings' : 'Use proper headings (## for main sections)'}
- Include specific data points and findings
- Be factual and well-structured
- Target length: ${wordTarget}
- NO placeholder text or generic statements
- ONLY include information from the provided findings
- ${outputStyle === 'brief' ? 'Write as flowing paragraphs, NOT structured sections' : 'Adapt content to fit the requested sections naturally'}

${sectionStructure}`;

  const userPrompt = `Research Query: "${context.query}"

${combinedFindings}

Create a ${outputStyle} research report based ONLY on the findings above. ${outputStyle === 'brief' ? 'Write 2 concise paragraphs with key takeaways.' : 'Be specific, include data points, and provide actionable insights.'}`;

  try {
    const report = await callAPIM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    if (!report || report.trim().length === 0) {
      throw new Error('APIM returned empty report');
    }

    console.log('[Report Generator] Report generated successfully:', {
      length: report.length,
      wordCount: report.split(/\s+/).length
    });

    return report;

  } catch (error: any) {
    console.error('[Report Generator] Error:', error);
    throw new Error(`Failed to generate report: ${error.message}`);
  }
}

/**
 * Generate section summary (for section.completed events)
 */
export async function generateSectionSummary(
  sectionTitle: string,
  findings: string[]
): Promise<string> {
  console.log('[Report Generator] Generating section summary:', sectionTitle);

  const prompt = `Summarize these findings for the "${sectionTitle}" section in 2-3 sentences:

${findings.join('\n\n')}

Provide a concise, informative summary.`;

  try {
    const summary = await callAPIM([
      { role: 'system', content: 'You are a research analyst providing concise summaries.' },
      { role: 'user', content: prompt }
    ]);

    return summary.trim();

  } catch (error: any) {
    console.error('[Report Generator] Error generating section summary:', error);
    // Return fallback summary
    return `Analysis of ${findings.length} data points for ${sectionTitle}.`;
  }
}

