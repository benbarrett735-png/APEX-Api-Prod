-- Research Flow Database Schema
-- This migration creates the complete database structure for the new research flow

-- Research sessions table
CREATE TABLE IF NOT EXISTS research_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Session state
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, completed, failed, cancelled
    current_step VARCHAR(50) NOT NULL DEFAULT 'requirements', -- requirements, sources, upload, research, compilation, complete
    
    -- Template selection
    selected_template VARCHAR(100), -- ReportType enum
    template_selected_at TIMESTAMP WITH TIME ZONE,
    
    -- Requirements gathering
    requirements_conversation JSONB, -- Chat messages for requirements
    requirements_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Source gathering
    requested_websites TEXT[], -- Array of websites user wants researched
    sources_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- File uploads
    uploaded_files JSONB, -- Array of file metadata
    uploads_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Research planning
    research_plan JSONB, -- Comprehensive research plan from Azure APIM
    research_plan_created_at TIMESTAMP WITH TIME ZONE,
    
    -- Research execution
    research_data JSONB, -- Data from OpenAI scraping
    research_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Report compilation
    compiled_report JSONB, -- Final compiled report data
    report_compiled_at TIMESTAMP WITH TIME ZONE,
    
    -- Final report
    final_report_id UUID,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Research reports table (updated)
CREATE TABLE IF NOT EXISTS research_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
    
    -- Report details
    report_type VARCHAR(100) NOT NULL, -- ReportType enum
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Report content
    content JSONB NOT NULL, -- Structured report content
    metadata JSONB, -- Report metadata (author, date, etc.)
    
    -- File integration
    file_id UUID, -- Link to files system (FK constraint removed - files table doesn't exist)
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, published, archived
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE
);

-- Research sources table
CREATE TABLE IF NOT EXISTS research_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
    
    -- Source details
    url TEXT NOT NULL,
    title VARCHAR(500),
    description TEXT,
    domain VARCHAR(255),
    
    -- Source type
    source_type VARCHAR(50) NOT NULL, -- website, document, internal, external
    
    -- Research data
    scraped_content TEXT,
    extracted_data JSONB,
    relevance_score DECIMAL(3,2), -- 0.00 to 1.00
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, scraped, failed, skipped
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    scraped_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Research chunks table (for citation system)
CREATE TABLE IF NOT EXISTS research_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
    
    -- Chunk details
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    word_count INTEGER,
    
    -- Embeddings for similarity search
    embedding VECTOR(1536), -- OpenAI embedding dimension
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Research citations table
CREATE TABLE IF NOT EXISTS research_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    report_id UUID NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
    chunk_id UUID NOT NULL REFERENCES research_chunks(id) ON DELETE CASCADE,
    
    -- Citation details
    citation_text TEXT NOT NULL,
    citation_type VARCHAR(50) NOT NULL, -- inline, footnote, reference
    
    -- Position in report
    section VARCHAR(100),
    paragraph_index INTEGER,
    
    -- Reliability
    reliability_score DECIMAL(3,2), -- 0.00 to 1.00
    date_accessed DATE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_research_sessions_org_user ON research_sessions(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_research_sessions_status ON research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_research_sessions_current_step ON research_sessions(current_step);

CREATE INDEX IF NOT EXISTS idx_research_reports_org_user ON research_reports(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_research_reports_session ON research_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_research_reports_type ON research_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_research_reports_status ON research_reports(status);

CREATE INDEX IF NOT EXISTS idx_research_sources_session ON research_sources(session_id);
CREATE INDEX IF NOT EXISTS idx_research_sources_type ON research_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_research_sources_status ON research_sources(status);

CREATE INDEX IF NOT EXISTS idx_research_chunks_source ON research_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_research_chunks_session ON research_chunks(session_id);

CREATE INDEX IF NOT EXISTS idx_research_citations_report ON research_citations(report_id);
CREATE INDEX IF NOT EXISTS idx_research_citations_chunk ON research_citations(chunk_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_research_sessions_updated_at BEFORE UPDATE ON research_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_research_reports_updated_at BEFORE UPDATE ON research_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_research_sources_updated_at BEFORE UPDATE ON research_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add soft delete support
ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE research_reports ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE research_sources ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE research_chunks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE research_citations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for soft delete
CREATE INDEX IF NOT EXISTS idx_research_sessions_deleted_at ON research_sessions(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_research_reports_deleted_at ON research_reports(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_research_sources_deleted_at ON research_sources(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_research_chunks_deleted_at ON research_chunks(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_research_citations_deleted_at ON research_citations(deleted_at) WHERE deleted_at IS NULL;

-- Add foreign key constraint for final_report_id (must be added after both tables exist)
ALTER TABLE research_sessions ADD CONSTRAINT fk_research_sessions_final_report
  FOREIGN KEY (final_report_id) REFERENCES research_reports(id) ON DELETE SET NULL;
