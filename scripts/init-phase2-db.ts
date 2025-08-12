#!/usr/bin/env node
/**
 * Initialize Phase 2 Database Tables
 * Creates profile tables with proper ID generation
 */

import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

async function initPhase2Database() {
  const db = await open({
    filename: './data/grader.sqlite',
    driver: sqlite3.Database
  });

  console.log('Initializing Phase 2 database tables...');

  // Create tables with proper schema
  await db.exec(`
    -- ============================================================================
    -- PROFILES TABLE: Core profile definitions
    -- ============================================================================
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY DEFAULT ('prof_' || strftime('%s', 'now') || '_' || lower(hex(randomblob(4)))),
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('REST', 'GraphQL', 'gRPC', 'Microservice', 'SaaS', 'Custom')),
      description TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
      version TEXT DEFAULT '1.0.0',
      detection_patterns TEXT DEFAULT '{}', -- JSON
      priority_config TEXT DEFAULT '{"security": 30, "performance": 20, "documentation": 15, "consistency": 20, "best_practices": 15}', -- JSON
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      created_by TEXT,
      updated_by TEXT
    );

    -- ============================================================================
    -- PROFILE_RULES TABLE: Rules configured for each profile
    -- ============================================================================
    CREATE TABLE IF NOT EXISTS profile_rules (
      id TEXT PRIMARY KEY DEFAULT ('rule_' || strftime('%s', 'now') || '_' || lower(hex(randomblob(4)))),
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      weight REAL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 100),
      category TEXT DEFAULT 'optional' CHECK (category IN ('required', 'optional', 'disabled')),
      severity_override TEXT CHECK (severity_override IN ('error', 'warning', 'info')),
      override_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(profile_id, rule_id)
    );

    -- ============================================================================
    -- PROFILE_TEMPLATES TABLE: Pre-built profile templates
    -- ============================================================================
    CREATE TABLE IF NOT EXISTS profile_templates (
      id TEXT PRIMARY KEY DEFAULT ('tmpl_' || strftime('%s', 'now') || '_' || lower(hex(randomblob(4)))),
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK (category IN ('standard', 'industry', 'regulatory', 'custom')),
      type TEXT NOT NULL CHECK (type IN ('REST', 'GraphQL', 'gRPC', 'Microservice', 'SaaS', 'Custom')),
      description TEXT,
      industry TEXT,
      compliance TEXT DEFAULT '[]', -- JSON array
      best_practices TEXT DEFAULT '[]', -- JSON array
      default_rules TEXT NOT NULL DEFAULT '[]', -- JSON array
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ============================================================================
    -- GRADING_SESSION_PROFILES TABLE: Profile assignments to grading sessions
    -- ============================================================================
    CREATE TABLE IF NOT EXISTS grading_session_profiles (
      id TEXT PRIMARY KEY DEFAULT ('gsp_' || strftime('%s', 'now') || '_' || lower(hex(randomblob(4)))),
      session_id TEXT NOT NULL UNIQUE,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      selection_method TEXT CHECK (selection_method IN ('auto_detected', 'manual_override', 'default')),
      confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
      override_reason TEXT,
      comparison_mode INTEGER DEFAULT 0, -- SQLite doesn't have boolean
      applied_at TEXT DEFAULT (datetime('now')),
      applied_by TEXT
    );

    -- ============================================================================
    -- PROFILE_METRICS TABLE: Performance metrics for profiles
    -- ============================================================================
    CREATE TABLE IF NOT EXISTS profile_metrics (
      id TEXT PRIMARY KEY DEFAULT ('metr_' || strftime('%s', 'now') || '_' || lower(hex(randomblob(4)))),
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      usage_count INTEGER DEFAULT 0,
      unique_users INTEGER DEFAULT 0,
      detection_accuracy REAL,
      user_satisfaction REAL,
      misdetection_count INTEGER DEFAULT 0,
      override_count INTEGER DEFAULT 0,
      avg_grading_time_ms INTEGER,
      p95_grading_time_ms INTEGER,
      p99_grading_time_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(profile_id, period_start, period_end)
    );

    -- ============================================================================
    -- PROFILE_AUDIT_LOG TABLE: Track all profile changes
    -- ============================================================================
    CREATE TABLE IF NOT EXISTS profile_audit_log (
      id TEXT PRIMARY KEY DEFAULT ('audit_' || strftime('%s', 'now') || '_' || lower(hex(randomblob(4)))),
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'deleted', 'activated', 'deactivated')),
      changes TEXT, -- JSON
      user_id TEXT,
      user_agent TEXT,
      ip_address TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    -- ============================================================================
    -- INDEXES for performance
    -- ============================================================================
    CREATE INDEX IF NOT EXISTS idx_profiles_type ON profiles(type);
    CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
    CREATE INDEX IF NOT EXISTS idx_profile_rules_profile_id ON profile_rules(profile_id);
    CREATE INDEX IF NOT EXISTS idx_profile_rules_rule_id ON profile_rules(rule_id);
    CREATE INDEX IF NOT EXISTS idx_templates_category ON profile_templates(category);
    CREATE INDEX IF NOT EXISTS idx_session_profiles_session_id ON grading_session_profiles(session_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_profile_id ON profile_metrics(profile_id);
    CREATE INDEX IF NOT EXISTS idx_audit_profile_id ON profile_audit_log(profile_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON profile_audit_log(timestamp DESC);
  `);

  console.log('✅ Phase 2 tables created successfully');

  await db.close();
}

initPhase2Database().catch(err => {
  console.error('❌ Error initializing database:', err);
  process.exit(1);
});