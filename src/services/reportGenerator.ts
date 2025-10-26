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

  // Determine word count target based on depth
  const wordTargets = {
    short: '300-500 words',
    medium: '500-800 words',
    long: '800-1200 words',
    comprehensive: '1200-2000 words'
  };

  const wordTarget = wordTargets[context.depth] || '500-800 words';

  // Build dynamic section structure
  let sectionStructure = '';
  
  if (context.reportSections && context.reportSections.length > 0) {
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
  
  if (context.sources && context.sources.length > 0) {
    sectionStructure += `\n\n## Sources\n(List of ${context.sources.length} sources referenced)`;
  }
  
  // Create APIM prompt
  const systemPrompt = `You are a professional research analyst creating a comprehensive research report.

CRITICAL REQUIREMENTS:
- Write in clear, professional markdown format
- Use proper headings (## for main sections)
- Include specific data points and findings
- Be factual and well-structured
- Target length: ${wordTarget}
- NO placeholder text or generic statements
- ONLY include information from the provided findings
- Adapt content to fit the requested sections naturally

${sectionStructure}`;

  const userPrompt = `Research Query: "${context.query}"

${combinedFindings}

Create a comprehensive research report based ONLY on the findings above. Be specific, include data points, and provide actionable insights.`;

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

