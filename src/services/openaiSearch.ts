/**
 * Web Search Service
 * Uses Serper API for real Google search + GPT-4 for synthesis
 * 
 * Per Kevin's plan:
 * - Use Serper for actual web search (real Google results)
 * - Use GPT-4 for synthesis and structuring
 * - Use APIM for sensitive data processing
 * - Proper error handling and fallbacks
 */

interface SearchResult {
  summary: string;
  findings: string[];
  sources: string[];
}

interface SerperResult {
  organic?: Array<{
    title: string;
    link: string;
    snippet: string;
    date?: string;
  }>;
  answerBox?: {
    answer?: string;
    snippet?: string;
    title?: string;
  };
  knowledgeGraph?: {
    title?: string;
    description?: string;
    attributes?: Record<string, string>;
  };
}

/**
 * Search the public web using Serper API (real Google results)
 * Then synthesize findings using GPT-4
 */
export async function searchWeb(query: string): Promise<SearchResult> {
  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!SERPER_API_KEY) {
    throw new Error('SERPER_API_KEY not configured. Sign up at https://serper.dev');
  }
  
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  try {
    // Step 1: Get real search results from Serper (Google)
    console.log('[Web Search] Searching Google via Serper:', query);
    
    const serperController = new AbortController();
    const serperTimeout = setTimeout(() => serperController.abort(), 10000); // 10s for search

    const serperResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        num: 10, // Get top 10 results
      }),
      signal: serperController.signal
    });

    clearTimeout(serperTimeout);

    if (!serperResponse.ok) {
      const errorText = await serperResponse.text();
      throw new Error(`Serper API error: ${serperResponse.status} - ${errorText}`);
    }

    const serperData = await serperResponse.json() as SerperResult;
    
    console.log('[Web Search] Serper results:', {
      organicCount: serperData.organic?.length || 0,
      hasAnswerBox: !!serperData.answerBox,
      hasKnowledgeGraph: !!serperData.knowledgeGraph
    });

    // Step 2: Extract relevant content from search results
    let searchContext = '';
    
    // Add answer box if available
    if (serperData.answerBox) {
      searchContext += `\n**Direct Answer:**\n${serperData.answerBox.answer || serperData.answerBox.snippet || ''}\n`;
    }
    
    // Add knowledge graph if available
    if (serperData.knowledgeGraph) {
      const kg = serperData.knowledgeGraph;
      searchContext += `\n**Knowledge Graph:**\nTitle: ${kg.title || ''}\nDescription: ${kg.description || ''}\n`;
      if (kg.attributes) {
        searchContext += Object.entries(kg.attributes)
          .map(([key, val]) => `${key}: ${val}`)
          .join('\n');
      }
      searchContext += '\n';
    }
    
    // Add organic search results
    if (serperData.organic && serperData.organic.length > 0) {
      searchContext += '\n**Search Results:**\n';
      serperData.organic.slice(0, 10).forEach((result, idx) => {
        searchContext += `\n${idx + 1}. ${result.title}\n`;
        searchContext += `   URL: ${result.link}\n`;
        searchContext += `   ${result.snippet}\n`;
        if (result.date) {
          searchContext += `   Date: ${result.date}\n`;
        }
      });
    }

    if (!searchContext.trim()) {
      throw new Error('No search results found');
    }

    console.log('[Web Search] Search context length:', searchContext.length);

    // Step 3: Use GPT-4 to synthesize findings from search results
    const synthesisPrompt = `You are a research assistant analyzing web search results.

Query: "${query}"

Search Results from Google:
${searchContext}

Task:
1. Provide a comprehensive summary based on these REAL search results
2. Extract 10-15 SPECIFIC findings from the search results
3. Include concrete details: names, numbers, dates, locations, facts
4. Each finding should cite information from the search results
5. Cover multiple angles and aspects
6. Be factual - only include information from the results above

Format as JSON:
{
  "summary": "2-3 sentence overview based on search results",
  "findings": [
    "Specific finding 1 with concrete details from results",
    "Specific finding 2 from different aspect",
    ... (10-15 findings)
  ],
  "sources": ["Source URLs and titles from results above"]
}`;

    const gptController = new AbortController();
    const gptTimeout = setTimeout(() => gptController.abort(), 20000); // 20s for synthesis

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Use latest model for better synthesis
        messages: [
          {
            role: 'system',
            content: 'You are a research analyst. Extract and structure information from web search results. Always return valid JSON.'
          },
          {
            role: 'user',
            content: synthesisPrompt
          }
        ],
        temperature: 0.3, // Lower temp for factual synthesis
        max_tokens: 2000
      }),
      signal: gptController.signal
    });

    clearTimeout(gptTimeout);

    if (!gptResponse.ok) {
      const errorText = await gptResponse.text();
      throw new Error(`GPT-4 synthesis error: ${gptResponse.status} - ${errorText}`);
    }

    const gptData: any = await gptResponse.json();
    const content = gptData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in GPT-4 response');
    }

    // Parse JSON response
    let result: SearchResult;
    try {
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.warn('[Web Search] Failed to parse GPT-4 JSON, creating structured fallback');
      // Fallback: extract from raw search results
      const findings = serperData.organic?.slice(0, 10).map(r => r.snippet) || [];
      const sources = serperData.organic?.slice(0, 10).map(r => `${r.title} - ${r.link}`) || [];
      
      result = {
        summary: serperData.answerBox?.snippet || findings[0] || 'Search completed',
        findings,
        sources
      };
    }

    // Validate and ensure quality
    if (!result.summary) {
      result.summary = 'Search results found for: ' + query;
    }
    if (!Array.isArray(result.findings) || result.findings.length === 0) {
      result.findings = serperData.organic?.slice(0, 10).map(r => r.snippet) || ['No findings extracted'];
    }
    if (!Array.isArray(result.sources) || result.sources.length === 0) {
      result.sources = serperData.organic?.slice(0, 5).map(r => r.link) || [];
    }

    console.log('[Web Search] ✅ Success:', {
      query: query.substring(0, 50),
      findingsCount: result.findings.length,
      sourcesCount: result.sources.length
    });

    return result;

  } catch (error: any) {
    console.error('[Web Search] Error:', error);

    if (error.name === 'AbortError') {
      throw new Error('Web search timed out');
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

