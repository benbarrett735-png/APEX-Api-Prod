import { z } from 'zod';

// Research Modes
export const ResearchMode = z.enum([
  'market',
  'competitive',
  'technical',
  'regulatory',
  'vendor',
  'policy',
  'financial',
  'ops',
  'custom',
]);

export type ResearchMode = z.infer<typeof ResearchMode>;

// Source Scope Parameters
export const SourceScopeSchema = z.object({
  mode: ResearchMode,
  queries: z.array(z.string()).min(1),
  mustAnswer: z.array(z.string()).optional().default([]),
  forbiddenDomains: z.array(z.string()).optional().default([]),
  allowedDomains: z.array(z.string()).optional().default([]),
  languages: z.array(z.string()).optional().default(['en']),
  regions: z.array(z.string()).optional().default([]),
  recencyWindow: z.number().optional().default(365), // days
  depth: z.enum(['shallow', 'deep']).optional().default('deep'),
  maxDocs: z.number().min(1).max(500).optional().default(50),
});

export type SourceScope = z.infer<typeof SourceScopeSchema>;

// Claim
export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  caveats: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export type Claim = z.infer<typeof ClaimSchema>;

// Citation
export const CitationSchema = z.object({
  sourceId: z.string(),
  chunkId: z.string(),
  offsets: z.tuple([z.number(), z.number()]).optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  publishedAt: z.string().optional(),
});

export type Citation = z.infer<typeof CitationSchema>;

// Claim Evidence (linking claims to sources)
export const ClaimEvidenceSchema = z.object({
  claim: ClaimSchema,
  citations: z.array(CitationSchema),
});

export type ClaimEvidence = z.infer<typeof ClaimEvidenceSchema>;

// Comparison Matrix
export const ComparisonMatrixSchema = z.object({
  criteria: z.array(
    z.object({
      name: z.string(),
      weight: z.number().min(0).max(1),
    })
  ),
  options: z.array(
    z.object({
      name: z.string(),
      notes: z.string().optional(),
    })
  ),
  matrix: z.record(z.string(), z.record(z.string(), z.string())),
});

export type ComparisonMatrix = z.infer<typeof ComparisonMatrixSchema>;

// Synthesis Output
export const SynthesisOutputSchema = z.object({
  mode: ResearchMode,
  executiveSummary: z.string(),
  keyFindings: z.array(ClaimEvidenceSchema),
  contradictions: z.array(ClaimEvidenceSchema).optional(),
  comparisons: ComparisonMatrixSchema.optional(),
  followups: z.array(z.string()).optional(),
});

export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;

// Source candidate (before ingestion)
export const SourceCandidateSchema = z.object({
  url: z.string().url(),
  domain: z.string(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  publishedAt: z.string().optional(),
  language: z.string().optional(),
  estimatedReliability: z.number().min(1).max(5).optional(),
});

export type SourceCandidate = z.infer<typeof SourceCandidateSchema>;

// Ingestion result
export const IngestionResultSchema = z.object({
  sourceId: z.string(),
  url: z.string(),
  success: z.boolean(),
  chunksCreated: z.number(),
  error: z.string().optional(),
});

export type IngestionResult = z.infer<typeof IngestionResultSchema>;

// Passage (retrieval result)
export const PassageSchema = z.object({
  sourceId: z.string(),
  chunkId: z.string(),
  score: z.number(),
  snippet: z.string(),
  url: z.string(),
  title: z.string().optional(),
  publishedAt: z.string().optional(),
  reliability: z.number().optional(),
});

export type Passage = z.infer<typeof PassageSchema>;

// Export formats
export const ExportFormat = z.enum(['docx', 'pptx', 'csv', 'evidence-zip']);
export type ExportFormat = z.infer<typeof ExportFormat>;

// Research Run Status
export const ResearchRunStatus = z.enum([
  'queued',
  'discovering',
  'ingesting',
  'synthesizing',
  'complete',
  'error',
]);

export type ResearchRunStatus = z.infer<typeof ResearchRunStatus>;

// API Request/Response Schemas

export const StartRunRequestSchema = z.object({
  scope: SourceScopeSchema,
});

export const StartRunResponseSchema = z.object({
  runId: z.string(),
  status: ResearchRunStatus,
});

export const GetStatusResponseSchema = z.object({
  runId: z.string(),
  status: ResearchRunStatus,
  progress: z.number().min(0).max(100),
  coverage: z.object({
    totalSources: z.number(),
    sourcesByType: z.record(z.string(), z.number()),
    dateRange: z
      .object({
        earliest: z.string().optional(),
        latest: z.string().optional(),
      })
      .optional(),
    languages: z.record(z.string(), z.number()).optional(),
    regions: z.record(z.string(), z.number()).optional(),
  }),
  error: z.string().optional(),
});

export const AskRequestSchema = z.object({
  runId: z.string(),
  question: z.string(),
  topK: z.number().optional().default(10),
});

export const AskResponseSchema = z.object({
  answer: z.string(),
  evidence: z.array(ClaimEvidenceSchema),
  passages: z.array(PassageSchema),
});

export const ExportRequestSchema = z.object({
  reportId: z.string(),
  formats: z.array(ExportFormat),
});

export const ExportResponseSchema = z.object({
  files: z.record(ExportFormat, z.string()), // format -> download path
});

