/**
 * Normal Chat Service
 * 
 * Simple chatbot functionality:
 * - Sends messages to APIM (GPT-4o)
 * - Maintains chat history context
 * - Supports file uploads via ADI
 * - Returns nicely formatted responses
 * 
 * DOES NOT handle Agent Mode - that's in agenticFlow.ts
 */

export class NormalChatService {
  private apimHost: string;
  private apimKey: string;

  constructor() {
    this.apimHost = process.env.APIM_HOST || '';
    this.apimKey = process.env.APIM_SUBSCRIPTION_KEY || '';

    if (!this.apimHost || !this.apimKey) {
      throw new Error('APIM_HOST and APIM_SUBSCRIPTION_KEY must be set for chat');
    }
  }

  /**
   * Send a chat message to APIM and stream the response
   * @param messages - Full conversation history
   * @param systemPrompt - Optional system prompt for formatting
   */
  async streamChat(messages: any[], systemPrompt?: string): Promise<Response> {
    // Use APIM_OPERATION from env (e.g., /chat/strong)
    const operation = process.env.APIM_OPERATION || '/chat/strong';
    const chatUrl = `${this.apimHost}${operation}`;

    // Add system prompt if provided
    const fullMessages = systemPrompt 
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    console.log('[NormalChat] Calling APIM with', fullMessages.length, 'messages');

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': this.apimKey
      },
      body: JSON.stringify({
        messages: fullMessages,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[NormalChat] APIM error:', response.status, errorText);
      throw new Error(`APIM error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  /**
   * Get default system prompt for nice formatting
   */
  getDefaultSystemPrompt(): string {
    return `You are Apex, an AI assistant created by Nomad AI (nomadai.ie) and powered by the GPT family of models.

YOUR CAPABILITIES:
- Search live web sources for current information
- Summarise official documents (Revenue, Department of Finance, Oireachtas, Irish Statute Book)
- Provide direct links and timestamps
- Analyze data and extract insights

INTERNET SEARCH:
- When the question would benefit from current information, recent data, news, or real-time facts, SEARCH THE INTERNET
- Search for relevant context that would improve your answer
- Use search results to provide accurate, up-to-date information
- Always search when asked about recent events, current statistics, or live data

RESPONSE STYLE:
- Simple questions (greetings, basic queries) → Keep responses SHORT and conversational
- Complex questions or data analysis → Use full formatting with structure and depth
- Match the user's energy: casual query = casual answer, technical query = detailed answer
- Focus on insights over obvious facts when analyzing data
- Be direct and concise - no unnecessary preambles

FORMATTING RULES (MUST OBEY):
Simple responses:
- Just answer naturally, maybe 1-2 sentences
- Use **bold** sparingly for key points

Complex responses (MUST USE ALL FORMATTING COMPONENTS):
- ALWAYS use # for main title
- ALWAYS use ## for major sections or key insights  
- ALWAYS use ### for subsections and supporting points
- ALWAYS use bullet points (-) liberally for lists and key findings
- ALWAYS use numbered lists (1. 2. 3.) for steps or rankings
- ALWAYS use **bold** for important terms, metrics, and conclusions
- Break up text with headers - never long blocks of text
- Keep paragraphs short (2-3 sentences max)
- USE ALL FORMATTING TOOLS AVAILABLE`;
  }
}

