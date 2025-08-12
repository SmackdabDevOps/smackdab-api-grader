// Using the existing database connection approach
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

export class Phase2ProfileDB {
  private db: Database | null = null;

  constructor(private dbPath: string) {}

  async connect() {
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
    await this.db.exec('PRAGMA journal_mode = WAL');
    await this.db.exec('PRAGMA foreign_keys = ON');
  }

  async migrate() {
    if (!this.db) throw new Error('DB not connected');
    
    // Create Phase 2 tables for Profile System
    this.db.exec(`
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

    // Insert default templates
    await this.insertDefaultTemplates();
  }

  private async insertDefaultTemplates() {
    if (!this.db) throw new Error('DB not connected');
    
    const templates = [
      {
        name: 'Standard REST API',
        category: 'standard',
        type: 'REST',
        description: 'Standard RESTful API following common conventions',
        default_rules: JSON.stringify([
          {rule_id: 'FUNC-001', weight: 10, category: 'required'},
          {rule_id: 'FUNC-002', weight: 10, category: 'required'},
          {rule_id: 'SEC-001', weight: 15, category: 'required'},
          {rule_id: 'SEC-002', weight: 10, category: 'required'},
          {rule_id: 'SCALE-001', weight: 10, category: 'optional'},
          {rule_id: 'MAINT-001', weight: 10, category: 'optional'}
        ])
      },
      {
        name: 'Standard GraphQL API',
        category: 'standard',
        type: 'GraphQL',
        description: 'GraphQL API with schema-first design',
        default_rules: JSON.stringify([
          {rule_id: 'GRAPHQL-001', weight: 15, category: 'required'},
          {rule_id: 'GRAPHQL-002', weight: 15, category: 'required'},
          {rule_id: 'SEC-001', weight: 10, category: 'required'},
          {rule_id: 'PERF-001', weight: 15, category: 'required'}
        ])
      },
      {
        name: 'Microservice API',
        category: 'standard',
        type: 'Microservice',
        description: 'Microservice with service mesh integration',
        default_rules: JSON.stringify([
          {rule_id: 'MICRO-001', weight: 15, category: 'required'},
          {rule_id: 'MICRO-002', weight: 15, category: 'required'},
          {rule_id: 'RESILIENCE-001', weight: 20, category: 'required'},
          {rule_id: 'TRACE-001', weight: 10, category: 'required'}
        ])
      }
    ];

    for (const template of templates) {
      await this.db.run(`
        INSERT OR IGNORE INTO profile_templates (name, category, type, description, default_rules)
        VALUES (?, ?, ?, ?, ?)
      `, template.name, template.category, template.type, template.description, template.default_rules);
    }
  }

  // Profile CRUD operations
  async createProfile(profile: {
    name: string;
    type: string;
    description?: string;
    detection_patterns?: any;
    priority_config?: any;
    created_by?: string;
  }) {
    if (!this.db) throw new Error('DB not connected');
    
    const result = await this.db.run(`
      INSERT INTO profiles (name, type, description, detection_patterns, priority_config, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      profile.name,
      profile.type,
      profile.description || null,
      JSON.stringify(profile.detection_patterns || {}),
      JSON.stringify(profile.priority_config || {
        security: 30,
        performance: 20,
        documentation: 15,
        consistency: 20,
        best_practices: 15
      }),
      profile.created_by || null,
      profile.created_by || null
    );
    
    return this.getProfile(result.lastID as number);
  }

  async getProfile(idOrRowId: string | number) {
    if (!this.db) throw new Error('DB not connected');
    
    const query = typeof idOrRowId === 'string' 
      ? 'SELECT * FROM profiles WHERE id = ?'
      : 'SELECT * FROM profiles WHERE rowid = ?';
    
    const profile = await this.db.get(query, idOrRowId);
    
    if (profile) {
      profile.detection_patterns = JSON.parse(profile.detection_patterns);
      profile.priority_config = JSON.parse(profile.priority_config);
    }
    
    return profile;
  }

  async listProfiles(filters?: { type?: string; status?: string }) {
    if (!this.db) throw new Error('DB not connected');
    
    let query = 'SELECT * FROM profiles WHERE 1=1';
    const params: any[] = [];
    
    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    
    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const profiles = await this.db.all(query, ...params);
    
    return profiles.map(p => ({
      ...p,
      detection_patterns: JSON.parse(p.detection_patterns),
      priority_config: JSON.parse(p.priority_config)
    }));
  }

  async updateProfile(id: string, updates: any) {
    if (!this.db) throw new Error('DB not connected');
    
    const fields = [];
    const values = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    
    if (updates.detection_patterns !== undefined) {
      fields.push('detection_patterns = ?');
      values.push(JSON.stringify(updates.detection_patterns));
    }
    
    if (updates.priority_config !== undefined) {
      fields.push('priority_config = ?');
      values.push(JSON.stringify(updates.priority_config));
    }
    
    fields.push('updated_at = datetime("now")');
    
    if (updates.updated_by) {
      fields.push('updated_by = ?');
      values.push(updates.updated_by);
    }
    
    values.push(id);
    
    await this.db.run(`
      UPDATE profiles 
      SET ${fields.join(', ')}
      WHERE id = ?
    `, ...values);
    
    return this.getProfile(id);
  }

  async deleteProfile(id: string) {
    if (!this.db) throw new Error('DB not connected');
    
    const result = await this.db.run('DELETE FROM profiles WHERE id = ?', id);
    
    return result.changes > 0;
  }

  // Profile rules management
  async setProfileRules(profileId: string, rules: any[]) {
    if (!this.db) throw new Error('DB not connected');
    
    // Start transaction
    // Start transaction
    await this.db.exec('BEGIN');
    try {
      // Delete existing rules
      await this.db.run('DELETE FROM profile_rules WHERE profile_id = ?', profileId);
      
      // Insert new rules
      for (const rule of rules) {
        await this.db.run(`
          INSERT INTO profile_rules (profile_id, rule_id, weight, category, severity_override, override_message)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          profileId,
          rule.rule_id,
          rule.weight || 1.0,
          rule.category || 'optional',
          rule.severity_override || null,
          rule.override_message || null
        );
      }
      await this.db.exec('COMMIT');
    } catch (e) {
      await this.db.exec('ROLLBACK');
      throw e;
    }
    
    return this.getProfileRules(profileId);
  }

  async getProfileRules(profileId: string) {
    if (!this.db) throw new Error('DB not connected');
    
    return await this.db.all('SELECT * FROM profile_rules WHERE profile_id = ? ORDER BY rule_id', profileId);
  }

  // Session profile management
  async assignProfileToSession(sessionId: string, profileId: string, method: string, confidence?: number) {
    if (!this.db) throw new Error('DB not connected');
    
    await this.db.run(`
      INSERT OR REPLACE INTO grading_session_profiles 
      (session_id, profile_id, selection_method, confidence)
      VALUES (?, ?, ?, ?)
    `, sessionId, profileId, method, confidence || null);
    
    return this.getSessionProfile(sessionId);
  }

  async getSessionProfile(sessionId: string) {
    if (!this.db) throw new Error('DB not connected');
    
    return await this.db.get(`
      SELECT gsp.*, p.name as profile_name, p.type as profile_type
      FROM grading_session_profiles gsp
      JOIN profiles p ON gsp.profile_id = p.id
      WHERE gsp.session_id = ?
    `, sessionId);
  }

  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}