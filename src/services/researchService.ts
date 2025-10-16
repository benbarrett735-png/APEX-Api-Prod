// Types for research reports
type ReportType = string;
const REPORT_TEMPLATES: Record<string, any> = {};

export interface ResearchSession {
  id: string;
  orgId: string;
  userId: string;
  status: string;
  currentStep: string;
  selectedTemplate?: ReportType;
  requirementsConversation?: any[];
  requestedWebsites?: string[];
  uploadedFiles?: any[];
  researchPlan?: any;
  researchData?: any;
  compiledReport?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchPlan {
  id: string;
  createdAt: string;
  template: string;
  templateName: string;
  objectives: string[];
  sources: {
    specified: string[];
    additional: string[];
  };
  context: {
    uploadedFiles: number;
    fileTypes: string[];
    totalSize: number;
  };
  methodology: {
    scraping: string;
    analysis: string;
    synthesis: string;
    quality: string;
  };
  expectedOutput: {
    sections: any[];
    length: string;
    audience: string;
    format: string;
  };
}

export interface ResearchData {
  id: string;
  executedAt: string;
  sources: {
    scraped: any[];
    additional: any[];
  };
  insights: {
    keyFindings: string[];
    trends: string[];
    recommendations: string[];
  };
  data: {
    statistics: any;
    citations: any[];
  };
}

export interface CompiledReport {
  id: string;
  compiledAt: string;
  template: string;
  title: string;
  sections: any[];
  metadata: any;
  appendices: any[];
}

export class ResearchService {
  // All AI calls go through APIM only - no direct OpenAI or Azure OpenAI keys
  constructor() {
    // APIM configuration is handled by env.ts
  }

  /**
   * Create a comprehensive research plan using Azure APIM
   */
  async createResearchPlan(session: ResearchSession): Promise<ResearchPlan> {
    const template = REPORT_TEMPLATES[session.selectedTemplate!];
    const requestedWebsites = session.requestedWebsites || [];
    const uploadedFiles = session.uploadedFiles || [];
    
    // Extract requirements from conversation
    const requirements = this.extractRequirements(session.requirementsConversation || []);
    
    const prompt = `You are an expert research strategist. Create a comprehensive research plan for a ${template?.name} report.

REQUIREMENTS:
- Report Type: ${template?.name}
- Topic: ${requirements.topic || 'Not specified'}
- Audience: ${requirements.audience || template?.audience || 'General'}
- Purpose: ${requirements.purpose || 'Research analysis'}
- Specific Focus: ${requirements.focus || 'General analysis'}

SPECIFIED SOURCES:
${requestedWebsites.map(url => `- ${url}`).join('\n')}

UPLOADED CONTEXT:
- Files: ${uploadedFiles.length}
- Types: ${uploadedFiles.map(f => f.type).join(', ')}
- Total Size: ${uploadedFiles.reduce((sum, f) => sum + f.size, 0)} bytes

TEMPLATE STRUCTURE:
${(template as any)?.structure ? (template as any).structure.map((s: any) => `- ${s.title}`).join('\n') : 'Standard structure'}

Create a detailed research plan that includes:
1. Specific objectives for this research
2. Additional high-quality sources to research
3. Methodology for data collection and analysis
4. Expected output structure
5. Quality assurance measures

Return the plan in JSON format.`;

    try {
      const response = await this.callAzureOpenAI(prompt);
      const planData = JSON.parse(response);
      
      return {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        template: session.selectedTemplate!,
        templateName: template?.name || 'Unknown',
        objectives: planData.objectives || [],
        sources: {
          specified: requestedWebsites,
          additional: planData.additionalSources || []
        },
        context: {
          uploadedFiles: uploadedFiles.length,
          fileTypes: uploadedFiles.map(f => f.type),
          totalSize: uploadedFiles.reduce((sum, f) => sum + f.size, 0)
        },
        methodology: {
          scraping: planData.scrapingMethod || 'Automated web scraping with content extraction',
          analysis: planData.analysisMethod || 'AI-powered content analysis and insight extraction',
          synthesis: planData.synthesisMethod || 'Data synthesis and report compilation',
          quality: planData.qualityMethod || 'Source verification and reliability scoring'
        },
        expectedOutput: {
          sections: (template as any)?.structure || [],
          length: template?.length || 'Medium',
          audience: template?.audience || 'General',
          format: 'Professional report with citations'
        }
      };
    } catch (error) {
      console.error('Error creating research plan:', error);
      throw new Error('Failed to create research plan');
    }
  }

  /**
   * Execute research using OpenAI to scrape and analyze sources
   */
  async executeResearch(session: ResearchSession, researchPlan: ResearchPlan): Promise<ResearchData> {
    const requestedWebsites = session.requestedWebsites || [];
    const uploadedFiles = session.uploadedFiles || [];
    
    // Process uploaded files for context
    const fileContext = await this.processUploadedFiles(uploadedFiles);
    
    const prompt = `You are an expert research analyst. Conduct comprehensive research based on the following plan:

RESEARCH PLAN:
${JSON.stringify(researchPlan, null, 2)}

SPECIFIED SOURCES TO RESEARCH:
${requestedWebsites.map(url => `- ${url}`).join('\n')}

ADDITIONAL SOURCES TO FIND:
${researchPlan.sources.additional.map(source => `- ${source}`).join('\n')}

UPLOADED CONTEXT:
${fileContext}

INSTRUCTIONS:
1. Research each specified website thoroughly
2. Find and analyze additional high-quality sources
3. Extract key findings, trends, and insights
4. Provide reliable citations for all information
5. Ensure data quality and accuracy
6. Focus on information relevant to the report template

Return comprehensive research data in JSON format including:
- Detailed analysis of each source
- Key findings and insights
- Trends and patterns
- Recommendations
- Citations with reliability scores
- Statistics and data points`;

    try {
      const response = await this.callOpenAI(prompt);
      const researchData = JSON.parse(response);
      
      return {
        id: Date.now().toString(),
        executedAt: new Date().toISOString(),
        sources: {
          scraped: researchData.scrapedSources || [],
          additional: researchData.additionalSources || []
        },
        insights: {
          keyFindings: researchData.keyFindings || [],
          trends: researchData.trends || [],
          recommendations: researchData.recommendations || []
        },
        data: {
          statistics: researchData.statistics || {},
          citations: researchData.citations || []
        }
      };
    } catch (error) {
      console.error('Error executing research:', error);
      throw new Error('Failed to execute research');
    }
  }

  /**
   * Compile final report using Azure APIM
   */
  async compileReport(session: ResearchSession, researchData: ResearchData): Promise<CompiledReport> {
    const template = REPORT_TEMPLATES[session.selectedTemplate!];
    const requirements = this.extractRequirements(session.requirementsConversation || []);
    
    const prompt = `You are an expert report compiler. Create a professional ${template?.name} report using the following data:

REPORT TEMPLATE:
${JSON.stringify(template, null, 2)}

RESEARCH DATA:
${JSON.stringify(researchData, null, 2)}

REQUIREMENTS:
- Topic: ${requirements.topic || 'Not specified'}
- Audience: ${requirements.audience || template?.audience || 'General'}
- Purpose: ${requirements.purpose || 'Research analysis'}
- Specific Focus: ${requirements.focus || 'General analysis'}

INSTRUCTIONS:
1. Structure the report according to the template
2. Use the research data to populate each section
3. Maintain professional tone and formatting
4. Include proper citations and references
5. Ensure logical flow and coherence
6. Add relevant insights and analysis
7. Include methodology and assumptions
8. Provide source list and citations

Return the compiled report in JSON format with:
- Title and metadata
- Structured sections with content
- Appendices (methodology, sources, citations)
- Professional formatting
- All citations properly referenced`;

    try {
      const response = await this.callAzureOpenAI(prompt);
      const compiledData = JSON.parse(response);
      
      return {
        id: Date.now().toString(),
        compiledAt: new Date().toISOString(),
        template: session.selectedTemplate!,
        title: compiledData.title || `${template?.name} - Research Report`,
        sections: compiledData.sections || [],
        metadata: {
          author: 'AI Research Assistant',
          date: new Date().toISOString(),
          version: '1.0',
          coverage: 'Comprehensive',
          model: 'GPT-4',
          evidenceCount: researchData.data.statistics?.totalSources || 0
        },
        appendices: compiledData.appendices || []
      };
    } catch (error) {
      console.error('Error compiling report:', error);
      throw new Error('Failed to compile report');
    }
  }

  /**
   * Extract requirements from conversation history
   */
  private extractRequirements(conversation: any[]): any {
    const requirements: any = {};
    
    // Simple extraction logic - in production, this would be more sophisticated
    const userMessages = conversation.filter(msg => msg.type === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    if (lastUserMessage) {
      const content = lastUserMessage.content.toLowerCase();
      
      // Extract topic
      if (content.includes('research') || content.includes('analyze')) {
        requirements.topic = 'Research analysis';
      }
      
      // Extract audience
      if (content.includes('executive') || content.includes('management')) {
        requirements.audience = 'Executive';
      } else if (content.includes('technical') || content.includes('engineer')) {
        requirements.audience = 'Technical';
      }
      
      // Extract purpose
      if (content.includes('decision') || content.includes('strategy')) {
        requirements.purpose = 'Strategic decision making';
      } else if (content.includes('market') || content.includes('competitive')) {
        requirements.purpose = 'Market analysis';
      }
    }
    
    return requirements;
  }

  /**
   * Process uploaded files for context
   */
  private async processUploadedFiles(uploadedFiles: any[]): Promise<string> {
    if (uploadedFiles.length === 0) {
      return 'No uploaded files provided.';
    }
    
    let context = 'UPLOADED FILES CONTEXT:\n';
    
    for (const file of uploadedFiles) {
      context += `\nFile: ${file.name}\n`;
      context += `Type: ${file.type}\n`;
      context += `Size: ${file.size} bytes\n`;
      
      // In production, this would extract actual content from files
      // For now, just indicate the file was processed
      context += `Content: [File content would be extracted and analyzed here]\n`;
    }
    
    return context;
  }

  /**
   * Call APIM for AI completions - NO direct OpenAI/Azure calls
   */
  private async callAPIM(prompt: string, systemPrompt: string = 'You are an expert research assistant. Provide detailed, accurate, and professional responses.'): Promise<string> {
    const APIM_HOST = process.env.APIM_HOST;
    const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;

    if (!APIM_HOST || !APIM_SUBSCRIPTION_KEY) {
      throw new Error('APIM_HOST and APIM_SUBSCRIPTION_KEY must be set');
    }

    const APIM_OPERATION = process.env.APIM_OPERATION || '/chat/strong';
    const url = `${APIM_HOST}${APIM_OPERATION}`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': APIM_SUBSCRIPTION_KEY
      },
      body: JSON.stringify({
        messages,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`APIM API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // Legacy method names for compatibility - both use APIM now
  private async callAzureOpenAI(prompt: string): Promise<string> {
    return this.callAPIM(prompt, 'You are an expert research assistant. Provide detailed, accurate, and professional responses.');
  }

  private async callOpenAI(prompt: string): Promise<string> {
    return this.callAPIM(prompt, 'You are an expert research analyst. Conduct thorough research and provide comprehensive analysis.');
  }
}
