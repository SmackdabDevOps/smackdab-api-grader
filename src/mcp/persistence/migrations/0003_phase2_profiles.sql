-- ============================================================================
-- Phase 2: Context-Aware Grading System - Profile Tables
-- ============================================================================
-- Migration: 0003_phase2_profiles
-- Purpose: Add profile system for context-aware grading
-- ============================================================================

-- Profile Types Enum
CREATE TYPE profile_type AS ENUM (
  'REST',
  'GraphQL',
  'gRPC',
  'Microservice',
  'SaaS',
  'Custom'
);

-- Profile Status Enum
CREATE TYPE profile_status AS ENUM (
  'active',
  'inactive',
  'deprecated'
);

-- Rule Category Enum
CREATE TYPE rule_category AS ENUM (
  'required',
  'optional',
  'disabled'
);

-- Rule Severity Enum
CREATE TYPE rule_severity AS ENUM (
  'error',
  'warning',
  'info'
);

-- ============================================================================
-- PROFILES TABLE: Core profile definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY DEFAULT ('prof_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 8)),
  name TEXT NOT NULL UNIQUE,
  type profile_type NOT NULL,
  description TEXT,
  status profile_status DEFAULT 'active',
  version TEXT DEFAULT '1.0.0',
  
  -- Detection patterns for auto-detection
  detection_patterns JSONB DEFAULT '{}',
  
  -- Priority configuration
  priority_config JSONB DEFAULT '{
    "security": 30,
    "performance": 20,
    "documentation": 15,
    "consistency": 20,
    "best_practices": 15
  }',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_by TEXT,
  
  -- Constraints
  CONSTRAINT profiles_name_length CHECK (length(name) BETWEEN 3 AND 100),
  CONSTRAINT profiles_version_format CHECK (version ~ '^\d+\.\d+\.\d+$')
);

-- ============================================================================
-- PROFILE_RULES TABLE: Rules configured for each profile
-- ============================================================================
CREATE TABLE IF NOT EXISTS profile_rules (
  id TEXT PRIMARY KEY DEFAULT ('rule_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 8)),
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  weight DECIMAL(5,2) DEFAULT 1.0,
  category rule_category DEFAULT 'optional',
  severity_override rule_severity,
  override_message TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT profile_rules_weight_range CHECK (weight >= 0 AND weight <= 100),
  CONSTRAINT profile_rules_unique UNIQUE(profile_id, rule_id)
);

-- ============================================================================
-- PROFILE_TEMPLATES TABLE: Pre-built profile templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS profile_templates (
  id TEXT PRIMARY KEY DEFAULT ('tmpl_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 8)),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('standard', 'industry', 'regulatory', 'custom')),
  type profile_type NOT NULL,
  description TEXT,
  industry TEXT,
  compliance JSONB DEFAULT '[]',
  best_practices JSONB DEFAULT '[]',
  default_rules JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PROFILE_VERSIONS TABLE: Version history for profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS profile_versions (
  id TEXT PRIMARY KEY DEFAULT ('ver_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 8)),
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  change_type TEXT CHECK (change_type IN ('major', 'minor', 'patch')),
  changes JSONB DEFAULT '[]',
  migration_required BOOLEAN DEFAULT false,
  migration_status TEXT DEFAULT 'not_started' CHECK (migration_status IN ('not_started', 'in_progress', 'completed', 'failed')),
  snapshot JSONB NOT NULL, -- Full profile state at this version
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  
  -- Constraints
  CONSTRAINT profile_versions_unique UNIQUE(profile_id, version),
  CONSTRAINT profile_versions_format CHECK (version ~ '^\d+\.\d+\.\d+$')
);

-- ============================================================================
-- GRADING_SESSION_PROFILES TABLE: Profile assignments to grading sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS grading_session_profiles (
  id TEXT PRIMARY KEY DEFAULT ('gsp_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 8)),
  session_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  selection_method TEXT CHECK (selection_method IN ('auto_detected', 'manual_override', 'default')),
  confidence DECIMAL(3,2),
  override_reason TEXT,
  comparison_mode BOOLEAN DEFAULT false,
  
  -- Metadata
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  applied_by TEXT,
  
  -- Constraints
  CONSTRAINT session_profiles_unique UNIQUE(session_id),
  CONSTRAINT confidence_range CHECK (confidence >= 0 AND confidence <= 1)
);

-- ============================================================================
-- PROFILE_METRICS TABLE: Performance metrics for profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS profile_metrics (
  id TEXT PRIMARY KEY DEFAULT ('metr_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 8)),
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Usage metrics
  usage_count INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  
  -- Accuracy metrics
  detection_accuracy DECIMAL(5,4),
  user_satisfaction DECIMAL(3,2),
  misdetection_count INTEGER DEFAULT 0,
  override_count INTEGER DEFAULT 0,
  
  -- Performance metrics
  avg_grading_time_ms INTEGER,
  p95_grading_time_ms INTEGER,
  p99_grading_time_ms INTEGER,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT period_valid CHECK (period_end > period_start),
  CONSTRAINT metrics_unique UNIQUE(profile_id, period_start, period_end)
);

-- ============================================================================
-- PROFILE_AUDIT_LOG TABLE: Track all profile changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS profile_audit_log (
  id TEXT PRIMARY KEY DEFAULT ('audit_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 8)),
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'deleted', 'activated', 'deactivated')),
  changes JSONB,
  user_id TEXT,
  user_agent TEXT,
  ip_address INET,
  
  -- Metadata
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for efficient querying
  INDEX idx_audit_profile_id ON profile_audit_log(profile_id),
  INDEX idx_audit_timestamp ON profile_audit_log(timestamp DESC)
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================
CREATE INDEX idx_profiles_type ON profiles(type);
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_created_at ON profiles(created_at DESC);

CREATE INDEX idx_profile_rules_profile_id ON profile_rules(profile_id);
CREATE INDEX idx_profile_rules_rule_id ON profile_rules(rule_id);

CREATE INDEX idx_templates_category ON profile_templates(category);
CREATE INDEX idx_templates_type ON profile_templates(type);

CREATE INDEX idx_versions_profile_id ON profile_versions(profile_id);
CREATE INDEX idx_versions_created_at ON profile_versions(created_at DESC);

CREATE INDEX idx_session_profiles_session_id ON grading_session_profiles(session_id);
CREATE INDEX idx_session_profiles_applied_at ON grading_session_profiles(applied_at DESC);

CREATE INDEX idx_metrics_profile_id ON profile_metrics(profile_id);
CREATE INDEX idx_metrics_period ON profile_metrics(period_start, period_end);

-- ============================================================================
-- TRIGGERS for automatic updates
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profile_rules_updated_at BEFORE UPDATE ON profile_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profile_templates_updated_at BEFORE UPDATE ON profile_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DEFAULT DATA: Insert standard profile templates
-- ============================================================================

-- REST API Template
INSERT INTO profile_templates (name, category, type, description, default_rules) VALUES
('Standard REST API', 'standard', 'REST', 'Standard RESTful API following common conventions', 
'[
  {"rule_id": "FUNC-001", "weight": 10, "category": "required"},
  {"rule_id": "FUNC-002", "weight": 10, "category": "required"},
  {"rule_id": "SEC-001", "weight": 15, "category": "required"},
  {"rule_id": "SEC-002", "weight": 10, "category": "required"},
  {"rule_id": "SCALE-001", "weight": 10, "category": "optional"},
  {"rule_id": "MAINT-001", "weight": 10, "category": "optional"}
]');

-- GraphQL API Template
INSERT INTO profile_templates (name, category, type, description, default_rules) VALUES
('Standard GraphQL API', 'standard', 'GraphQL', 'GraphQL API with schema-first design', 
'[
  {"rule_id": "GRAPHQL-001", "weight": 15, "category": "required"},
  {"rule_id": "GRAPHQL-002", "weight": 15, "category": "required"},
  {"rule_id": "SEC-001", "weight": 10, "category": "required"},
  {"rule_id": "PERF-001", "weight": 15, "category": "required"}
]');

-- Microservice Template
INSERT INTO profile_templates (name, category, type, description, default_rules) VALUES
('Microservice API', 'standard', 'Microservice', 'Microservice with service mesh integration', 
'[
  {"rule_id": "MICRO-001", "weight": 15, "category": "required"},
  {"rule_id": "MICRO-002", "weight": 15, "category": "required"},
  {"rule_id": "RESILIENCE-001", "weight": 20, "category": "required"},
  {"rule_id": "TRACE-001", "weight": 10, "category": "required"}
]');

-- ============================================================================
-- COMMENTS for documentation
-- ============================================================================
COMMENT ON TABLE profiles IS 'Core profile definitions for context-aware API grading';
COMMENT ON TABLE profile_rules IS 'Rule configurations specific to each profile';
COMMENT ON TABLE profile_templates IS 'Pre-built templates for quick profile creation';
COMMENT ON TABLE profile_versions IS 'Version history and migration tracking for profiles';
COMMENT ON TABLE grading_session_profiles IS 'Profile assignments to grading sessions';
COMMENT ON TABLE profile_metrics IS 'Performance and accuracy metrics for profiles';
COMMENT ON TABLE profile_audit_log IS 'Audit trail of all profile modifications';