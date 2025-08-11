-- Migration: Add API tracking tables with x-api-id support
-- Version: 0002
-- Description: Comprehensive API tracking system with unique IDs

-- Main API registry table
CREATE TABLE IF NOT EXISTS api (
  api_uuid TEXT PRIMARY KEY,        -- The x-api-id from spec
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  current_version TEXT,              -- Latest version from info.version
  api_title TEXT,                    -- From info.title
  organization TEXT,                 -- Extracted from api_uuid prefix
  domain TEXT,                       -- Business domain
  api_type TEXT,                     -- REST/GraphQL/gRPC (detected)
  parent_uuid TEXT,                  -- For tracking forks/lineage
  repository_url TEXT,               -- Git remote if available
  owner_email TEXT,                  -- From info.contact.email
  FOREIGN KEY(parent_uuid) REFERENCES api(api_uuid)
);

-- Track all versions of an API
CREATE TABLE IF NOT EXISTS api_versions (
  version_id TEXT PRIMARY KEY,      -- Composite: api_uuid + version
  api_uuid TEXT NOT NULL,
  version_number TEXT NOT NULL,      -- From info.version
  spec_hash TEXT NOT NULL,           -- SHA256 of spec content
  first_graded_at TIMESTAMP,
  last_graded_at TIMESTAMP,
  best_score REAL,
  worst_score REAL,
  average_score REAL,
  grade_count INTEGER DEFAULT 0,
  FOREIGN KEY(api_uuid) REFERENCES api(api_uuid)
);

-- Detailed grading metrics for tracking improvements
CREATE TABLE IF NOT EXISTS grading_metrics (
  run_id TEXT PRIMARY KEY,
  api_uuid TEXT NOT NULL,
  version_id TEXT NOT NULL,
  -- Category scores (0-100)
  functionality_score REAL,
  security_score REAL,
  design_score REAL,
  errors_score REAL,
  performance_score REAL,
  documentation_score REAL,
  -- Specific metrics for tracking
  endpoint_count INTEGER,
  schema_count INTEGER,
  has_pagination BOOLEAN DEFAULT FALSE,
  has_rate_limiting BOOLEAN DEFAULT FALSE,
  has_webhooks BOOLEAN DEFAULT FALSE,
  has_async_patterns BOOLEAN DEFAULT FALSE,
  auth_methods TEXT,              -- JSON array
  error_format TEXT,              -- none/basic/rfc7807
  response_envelope BOOLEAN DEFAULT FALSE,
  -- Coverage percentages
  endpoint_documented_pct REAL,
  schema_documented_pct REAL,
  example_coverage_pct REAL,
  test_coverage_pct REAL,
  FOREIGN KEY(run_id) REFERENCES run(run_id),
  FOREIGN KEY(api_uuid) REFERENCES api(api_uuid),
  FOREIGN KEY(version_id) REFERENCES api_versions(version_id)
);

-- Track improvements over time
CREATE TABLE IF NOT EXISTS improvement_tracking (
  tracking_id TEXT PRIMARY KEY,
  api_uuid TEXT NOT NULL,
  metric_category TEXT NOT NULL,   -- functionality/security/etc
  metric_name TEXT NOT NULL,       -- specific metric
  baseline_value REAL,             -- First recorded value
  baseline_date TIMESTAMP,
  current_value REAL,              -- Latest value
  current_date TIMESTAMP,
  best_value REAL,                 -- Best ever achieved
  best_date TIMESTAMP,
  improvement_pct REAL,            -- % change from baseline
  trend TEXT,                      -- improving/declining/stable
  FOREIGN KEY(api_uuid) REFERENCES api(api_uuid)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_organization ON api(organization);
CREATE INDEX IF NOT EXISTS idx_api_domain ON api(domain);
CREATE INDEX IF NOT EXISTS idx_api_type ON api(api_type);
CREATE INDEX IF NOT EXISTS idx_api_versions_uuid ON api_versions(api_uuid);
CREATE INDEX IF NOT EXISTS idx_grading_metrics_uuid ON grading_metrics(api_uuid);
CREATE INDEX IF NOT EXISTS idx_grading_metrics_version ON grading_metrics(version_id);
CREATE INDEX IF NOT EXISTS idx_improvement_uuid ON improvement_tracking(api_uuid);
CREATE INDEX IF NOT EXISTS idx_improvement_category ON improvement_tracking(metric_category);