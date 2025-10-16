/**
 * Research Templates - Simple and Focused
 * Each mode has specific scrape prompts and output formatting
 */

export interface ResearchTemplate {
  mode: string;
  name: string;
  description: string;
  scrapePrompt: string;
  outputFormat: string;
  example: string;
}

export const RESEARCH_TEMPLATES: Record<string, ResearchTemplate> = {
  competitive: {
    mode: 'competitive',
    name: 'Competitive Analysis',
    description: 'Analyze competitors, create SWOT analysis, feature comparisons',
    scrapePrompt: `You are a competitive intelligence analyst. Research the specified company/website and gather information for a comprehensive competitive analysis.

Focus on:
- Company overview and positioning
- Strengths and competitive advantages
- Weaknesses and vulnerabilities  
- Market opportunities
- Threats and competitive pressures
- Key features and capabilities
- Pricing and business model
- Market share and customer base
- Recent news, partnerships, funding

Return detailed findings that can be used to create a SWOT analysis and competitive positioning report.`,
    outputFormat: `Create a professional competitive analysis report with:

**COMPANY OVERVIEW**
- Company name and description
- Market position and target audience
- Key value propositions

**SWOT ANALYSIS**
Present in a 2x2 grid format:

| STRENGTHS | WEAKNESSES |
|-----------|------------|
| • Strength 1    | • Weakness 1     |
| • Strength 2    | • Weakness 2     |
| • Strength 3    | • Weakness 3     |

| OPPORTUNITIES | THREATS |
|---------------|---------|
| • Opportunity 1 | • Threat 1 |
| • Opportunity 2 | • Threat 2 |
| • Opportunity 3 | • Threat 3 |

**COMPETITIVE POSITIONING**
- Market position vs competitors
- Unique selling propositions
- Differentiation factors

**KEY INSIGHTS**
- Strategic recommendations
- Market opportunities
- Risk factors`,
    example: 'Create a SWOT analysis of HubSpot for the CRM market'
  },

  market: {
    mode: 'market',
    name: 'Market Analysis',
    description: 'Market size, trends, segmentation, growth opportunities',
    scrapePrompt: `You are a market research analyst. Research the specified market/industry and gather comprehensive market intelligence.

Focus on:
- Market size and growth trends
- Market segments and customer demographics
- Key drivers and growth factors
- Competitive landscape overview
- Market barriers and challenges
- Pricing trends and models
- Distribution channels
- Regulatory environment
- Future outlook and predictions

Return detailed market data and insights for strategic planning.`,
    outputFormat: `Create a professional market analysis report with:

**EXECUTIVE SUMMARY**
- Market size and growth rate
- Key trends and opportunities
- Strategic recommendations

**MARKET OVERVIEW**
- Market definition and scope
- Historical growth and projections
- Market maturity stage

**MARKET SEGMENTATION**
| Segment | Size | Growth | Characteristics |
|---------|------|--------|-----------------|
| Segment 1 | $X B | X% | Description |
| Segment 2 | $X B | X% | Description |
| Segment 3 | $X B | X% | Description |

**KEY TRENDS & DRIVERS**
- Trend 1: Description and impact
- Trend 2: Description and impact
- Trend 3: Description and impact

**COMPETITIVE LANDSCAPE**
- Market leaders and their share
- Emerging players
- Competitive dynamics

**OPPORTUNITIES & CHALLENGES**
**Opportunities:**
- Opportunity 1
- Opportunity 2
- Opportunity 3

**Challenges:**
- Challenge 1
- Challenge 2
- Challenge 3

**RECOMMENDATIONS**
- Strategic recommendations
- Market entry considerations
- Investment priorities`,
    example: 'Analyze the AI-powered CRM market size and growth opportunities'
  },

  technical: {
    mode: 'technical',
    name: 'Technical Analysis',
    description: 'Technology stack, architecture, performance, security analysis',
    scrapePrompt: `You are a technical analyst. Research the specified technology, product, or platform and conduct a comprehensive technical evaluation.

Focus on:
- Technology stack and architecture
- Performance metrics and benchmarks
- Security features and vulnerabilities
- Scalability and reliability
- Integration capabilities
- Development tools and APIs
- Compliance and standards
- Technical documentation quality
- Community and support

Return detailed technical insights for evaluation and comparison.`,
    outputFormat: `Create a professional technical analysis report with:

**TECHNICAL OVERVIEW**
- Technology stack and architecture
- Core technologies and frameworks
- System requirements

**PERFORMANCE ANALYSIS**
| Metric | Value | Benchmark | Assessment |
|--------|-------|-----------|------------|
| Speed | X ms | Industry avg | Excellent/Good/Fair/Poor |
| Scalability | X users | Industry avg | Excellent/Good/Fair/Poor |
| Reliability | X% uptime | Industry avg | Excellent/Good/Fair/Poor |

**SECURITY EVALUATION**
**Security Features:**
- Feature 1: Description
- Feature 2: Description
- Feature 3: Description

**Security Concerns:**
- Concern 1: Description and risk level
- Concern 2: Description and risk level
- Concern 3: Description and risk level

**INTEGRATION CAPABILITIES**
- API availability and quality
- Third-party integrations
- Data import/export options

**TECHNICAL ASSESSMENT**
**Strengths:**
- Technical strength 1
- Technical strength 2
- Technical strength 3

**Weaknesses:**
- Technical weakness 1
- Technical weakness 2
- Technical weakness 3

**RECOMMENDATIONS**
- Technical recommendations
- Implementation considerations
- Risk mitigation strategies`,
    example: 'Analyze the technical architecture and performance of Salesforce CRM'
  },

  regulatory: {
    mode: 'regulatory',
    name: 'Regulatory Analysis',
    description: 'Compliance requirements, regulations, legal obligations',
    scrapePrompt: `You are a regulatory compliance analyst. Research the specified industry, jurisdiction, or regulatory topic and provide comprehensive compliance analysis.

Focus on:
- Applicable regulations and laws
- Compliance requirements and obligations
- Regulatory bodies and oversight
- Compliance deadlines and timelines
- Penalties and enforcement
- Industry standards and best practices
- Recent regulatory changes
- Cross-border implications
- Compliance costs and resources

Return detailed regulatory information for compliance planning.`,
    outputFormat: `Create a professional regulatory analysis report with:

**REGULATORY OVERVIEW**
- Primary regulatory framework
- Applicable jurisdictions
- Regulatory bodies involved

**COMPLIANCE REQUIREMENTS**
| Requirement | Description | Deadline | Impact |
|-------------|-------------|----------|--------|
| Requirement 1 | Description | Date | High/Medium/Low |
| Requirement 2 | Description | Date | High/Medium/Low |
| Requirement 3 | Description | Date | High/Medium/Low |

**REGULATORY LANDSCAPE**
**Key Regulations:**
- Regulation 1: Overview and requirements
- Regulation 2: Overview and requirements
- Regulation 3: Overview and requirements

**Recent Changes:**
- Change 1: Description and impact
- Change 2: Description and impact
- Change 3: Description and impact

**COMPLIANCE ASSESSMENT**
**Current Status:**
- Compliant areas
- Areas needing attention
- Compliance gaps

**RISK ANALYSIS**
**High Risk:**
- Risk 1: Description and mitigation
- Risk 2: Description and mitigation

**Medium Risk:**
- Risk 1: Description and mitigation
- Risk 2: Description and mitigation

**COMPLIANCE ROADMAP**
- Immediate actions required
- Medium-term compliance goals
- Long-term regulatory strategy

**RECOMMENDATIONS**
- Compliance priorities
- Resource requirements
- Implementation timeline`,
    example: 'Analyze GDPR compliance requirements for SaaS companies in the EU'
  },

  vendor: {
    mode: 'vendor',
    name: 'Vendor Evaluation',
    description: 'Vendor assessment, RFP criteria, capability matrix',
    scrapePrompt: `You are a vendor evaluation specialist. Research the specified vendor, product, or service and conduct a comprehensive vendor assessment.

Focus on:
- Company background and credentials
- Product/service capabilities
- Pricing and licensing models
- Customer references and case studies
- Implementation and support services
- Integration capabilities
- Security and compliance
- Financial stability and viability
- Market reputation and reviews
- Competitive positioning

Return detailed vendor information for procurement decisions.`,
    outputFormat: `Create a professional vendor evaluation report with:

**VENDOR OVERVIEW**
- Company information and background
- Market position and reputation
- Key differentiators

**CAPABILITY ASSESSMENT**
| Capability | Rating (1-5) | Notes |
|------------|--------------|-------|
| Core Features | X/5 | Description |
| Integration | X/5 | Description |
| Support | X/5 | Description |
| Security | X/5 | Description |
| Scalability | X/5 | Description |

**PRICING ANALYSIS**
- Pricing model and structure
- Cost comparison with alternatives
- Total cost of ownership
- Value for money assessment

**STRENGTHS & WEAKNESSES**
**Strengths:**
- Strength 1: Description
- Strength 2: Description
- Strength 3: Description

**Weaknesses:**
- Weakness 1: Description
- Weakness 2: Description
- Weakness 3: Description

**RISK ASSESSMENT**
**Low Risk:**
- Risk factor 1
- Risk factor 2

**Medium Risk:**
- Risk factor 1
- Risk factor 2

**High Risk:**
- Risk factor 1
- Risk factor 2

**RECOMMENDATION**
- Overall assessment
- Recommendation (Strong Buy/Buy/Hold/Avoid)
- Implementation considerations
- Alternative options`,
    example: 'Evaluate Microsoft Dynamics 365 as a CRM solution for enterprise'
  },

  financial: {
    mode: 'financial',
    name: 'Financial Analysis',
    description: 'Financial performance, business model, valuation analysis',
    scrapePrompt: `You are a financial analyst. Research the specified company, investment, or financial topic and provide comprehensive financial analysis.

Focus on:
- Financial performance and metrics
- Revenue model and streams
- Cost structure and profitability
- Growth trends and projections
- Market valuation and multiples
- Financial ratios and benchmarks
- Cash flow and liquidity
- Debt and capital structure
- Investment thesis and risks
- Industry financial benchmarks

Return detailed financial insights for investment or business decisions.`,
    outputFormat: `Create a professional financial analysis report with:

**FINANCIAL OVERVIEW**
- Company financial summary
- Key financial metrics
- Performance highlights

**FINANCIAL PERFORMANCE**
| Metric | Current | Previous | Growth |
|--------|---------|----------|--------|
| Revenue | $X M | $X M | X% |
| EBITDA | $X M | $X M | X% |
| Net Income | $X M | $X M | X% |
| Cash Flow | $X M | $X M | X% |

**REVENUE ANALYSIS**
- Revenue streams and breakdown
- Revenue growth trends
- Revenue diversification

**PROFITABILITY ANALYSIS**
- Gross margin trends
- Operating margin analysis
- Net margin performance
- Cost structure analysis

**FINANCIAL RATIOS**
| Ratio | Value | Industry Avg | Assessment |
|-------|-------|--------------|------------|
| P/E Ratio | X.X | X.X | Above/Below Avg |
| ROE | X% | X% | Above/Below Avg |
| Debt/Equity | X.X | X.X | Above/Below Avg |

**INVESTMENT METRICS**
- Valuation analysis
- Growth prospects
- Risk factors
- Investment recommendation

**FINANCIAL OUTLOOK**
- Short-term projections
- Long-term growth potential
- Key assumptions and risks

**RECOMMENDATION**
- Investment thesis
- Risk/return profile
- Target valuation
- Investment recommendation`,
    example: 'Analyze the financial performance and valuation of HubSpot Inc.'
  },

  policy: {
    mode: 'policy',
    name: 'Policy Analysis',
    description: 'Policy impact, stakeholder analysis, regulatory changes',
    scrapePrompt: `You are a policy analyst. Research the specified policy, regulation, or legislative topic and provide comprehensive policy impact analysis.

Focus on:
- Policy objectives and scope
- Key stakeholders and interests
- Implementation timeline and phases
- Expected impacts and outcomes
- Compliance requirements
- Industry reactions and responses
- International comparisons
- Potential challenges and risks
- Monitoring and evaluation frameworks
- Future policy developments

Return detailed policy insights for strategic planning and compliance.`,
    outputFormat: `Create a professional policy analysis report with:

**POLICY OVERVIEW**
- Policy name and description
- Policy objectives and goals
- Scope and applicability

**STAKEHOLDER ANALYSIS**
| Stakeholder | Position | Influence | Key Concerns |
|-------------|----------|-----------|--------------|
| Stakeholder 1 | Support/Oppose | High/Medium/Low | Concern 1 |
| Stakeholder 2 | Support/Oppose | High/Medium/Low | Concern 2 |
| Stakeholder 3 | Support/Oppose | High/Medium/Low | Concern 3 |

**IMPACT ANALYSIS**
**Positive Impacts:**
- Impact 1: Description and beneficiaries
- Impact 2: Description and beneficiaries
- Impact 3: Description and beneficiaries

**Negative Impacts:**
- Impact 1: Description and affected parties
- Impact 2: Description and affected parties
- Impact 3: Description and affected parties

**IMPLEMENTATION TIMELINE**
- Phase 1: Description and timeline
- Phase 2: Description and timeline
- Phase 3: Description and timeline

**COMPLIANCE REQUIREMENTS**
- Immediate requirements
- Ongoing obligations
- Reporting requirements

**RISK ASSESSMENT**
**Low Risk:**
- Risk factor 1
- Risk factor 2

**Medium Risk:**
- Risk factor 1
- Risk factor 2

**High Risk:**
- Risk factor 1
- Risk factor 2

**RECOMMENDATIONS**
- Strategic response
- Compliance priorities
- Risk mitigation strategies
- Monitoring requirements`,
    example: 'Analyze the impact of the EU AI Act on AI-powered software companies'
  },

  ops: {
    mode: 'ops',
    name: 'Operations Analysis',
    description: 'Operational efficiency, processes, best practices, KPIs',
    scrapePrompt: `You are an operations analyst. Research the specified company, process, or operational topic and provide comprehensive operational analysis.

Focus on:
- Operational model and structure
- Key processes and workflows
- Performance metrics and KPIs
- Efficiency and productivity measures
- Quality management systems
- Technology and automation
- Supply chain and logistics
- Human resources and workforce
- Operational challenges and bottlenecks
- Best practices and benchmarks

Return detailed operational insights for process improvement and optimization.`,
    outputFormat: `Create a professional operations analysis report with:

**OPERATIONAL OVERVIEW**
- Company operational model
- Key business processes
- Operational structure

**PERFORMANCE METRICS**
| Metric | Current | Target | Industry Avg | Status |
|--------|---------|--------|--------------|--------|
| Efficiency | X% | X% | X% | Above/Below |
| Quality | X% | X% | X% | Above/Below |
| Cost | $X | $X | $X | Above/Below |

**PROCESS ANALYSIS**
**Core Processes:**
- Process 1: Description and performance
- Process 2: Description and performance
- Process 3: Description and performance

**Process Improvements:**
- Improvement opportunity 1
- Improvement opportunity 2
- Improvement opportunity 3

**OPERATIONAL EFFICIENCY**
**Strengths:**
- Efficiency strength 1
- Efficiency strength 2
- Efficiency strength 3

**Weaknesses:**
- Efficiency weakness 1
- Efficiency weakness 2
- Efficiency weakness 3

**TECHNOLOGY & AUTOMATION**
- Current technology stack
- Automation opportunities
- Digital transformation potential

**OPERATIONAL CHALLENGES**
- Challenge 1: Description and impact
- Challenge 2: Description and impact
- Challenge 3: Description and impact

**BEST PRACTICES**
- Industry best practices
- Benchmarking results
- Improvement recommendations

**RECOMMENDATIONS**
- Operational priorities
- Process improvements
- Technology investments
- Performance targets`,
    example: 'Analyze the operational efficiency and processes of Amazon\'s fulfillment centers'
  }
};

export function getResearchTemplate(mode: string): ResearchTemplate {
  return RESEARCH_TEMPLATES[mode] || RESEARCH_TEMPLATES.competitive;
}

export function getAllResearchModes(): string[] {
  return Object.keys(RESEARCH_TEMPLATES);
}