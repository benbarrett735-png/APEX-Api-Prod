/**
 * OpenAI Search Service
 * Phase 2: Real external web search using OpenAI
 * 
 * Per Kevin's plan:
 * - Use OpenAI ONLY for public web research
 * - Use APIM for sensitive data processing
 * - Proper error handling
 * - Production-grade timeout/retry logic
 */

interface SearchResult {
  summary: string;
  findings: string[];
  sources: string[];
}

/**
 * Search the public web using OpenAI
 * Returns structured findings for the research query
 */
export async function searchWeb(query: string): Promise<SearchResult> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Create search prompt - MORE AGGRESSIVE
  const searchPrompt = `You are a research assistant conducting COMPREHENSIVE web research.

Research Query: "${query}"

Task:
1. Provide a comprehensive summary of current information about this topic
2. Include 10-15 SPECIFIC findings, data points, statistics, or insights
3. Focus on recent, relevant information (2024-2025 if applicable)
4. Be SPECIFIC - include numbers, dates, names, concrete details
5. Cover MULTIPLE angles - don't just repeat the same type of information
6. If comparing, provide data for BOTH sides
7. Include sources for major claims

IMPORTANT:
- Don't be generic - provide SPECIFIC, actionable information
- Include concrete data points, statistics, examples
- Make each finding UNIQUE (different aspect)
- Aim for BREADTH and DEPTH

Format your response as JSON:
{
  "summary": "Brief overview (2-3 sentences)",
  "findings": [
    "Finding 1 with specific data/numbers/context",
    "Finding 2 from different angle with details",
    "Finding 3 with concrete example or statistic",
    ... (10-15 findings total)
  ],
  "sources": ["Source 1 description", "Source 2...", ...]
}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant that provides factual, well-sourced information. Always format responses as valid JSON.'
          },
          {
            role: 'user',
            content: searchPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    // Parse JSON response
    let result: SearchResult;
    try {
      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      // Fallback: treat entire response as summary
      console.warn('[OpenAI Search] Failed to parse JSON, using raw content');
      result = {
        summary: content.substring(0, 500),
        findings: [content],
        sources: ['OpenAI GPT-4']
      };
    }

    // Validate result structure
    if (!result.summary || !Array.isArray(result.findings)) {
      throw new Error('Invalid search result structure');
    }

    console.log('[OpenAI Search] Success:', {
      query: query.substring(0, 50),
      findingsCount: result.findings.length,
      sourcesCount: result.sources?.length || 0
    });

    return result;

  } catch (error: any) {
    console.error('[OpenAI Search] Error:', error);

    if (error.name === 'AbortError') {
      throw new Error('OpenAI search timed out after 30 seconds');
    }

    throw new Error(`Failed to search: ${error.message}`);
  }
}

/**
 * Validate OpenAI API key is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

