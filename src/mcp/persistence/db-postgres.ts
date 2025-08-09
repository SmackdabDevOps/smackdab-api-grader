import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export interface RunRow {
  run_id: string;
  api_id: string;
  team_id?: string;
  user_id?: string;
  graded_at: string;
  template_version: string;
  template_hash: string;
  ruleset_hash: string;
  spec_hash: string;
  repo_remote?: string;
  repo_branch?: string;
  repo_path?: string;
  git_commit?: string;
  total_score: number;
  letter_grade: string;
  compliance_pct: number;
  auto_fail: boolean;
  critical_issues: number;
  findings_count: number;
  json_report: string;
}

export class GraderDB {
  private pool: Pool;

  constructor() {
    // Use DATABASE_URL from Railway or fallback to components
    const connectionString = process.env.DATABASE_URL || 
      `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
    
    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async connect(): Promise<void> {
    // Test connection
    const client = await this.pool.connect();
    client.release();
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create tables with team support
      await client.query(`
        CREATE TABLE IF NOT EXISTS teams (
          team_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          api_key_hash TEXT,
          usage_limit INTEGER DEFAULT 1000,
          current_usage INTEGER DEFAULT 0
        );
        
        CREATE TABLE IF NOT EXISTS api (
          api_id TEXT PRIMARY KEY,
          team_id TEXT,
          first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          name TEXT,
          domain TEXT,
          notes TEXT,
          FOREIGN KEY(team_id) REFERENCES teams(team_id)
        );
        
        CREATE TABLE IF NOT EXISTS run (
          run_id TEXT PRIMARY KEY,
          api_id TEXT NOT NULL,
          team_id TEXT,
          user_id TEXT,
          graded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          template_version TEXT NOT NULL,
          template_hash TEXT NOT NULL,
          ruleset_hash TEXT NOT NULL,
          spec_hash TEXT NOT NULL,
          repo_remote TEXT,
          repo_branch TEXT,
          repo_path TEXT,
          git_commit TEXT,
          total_score REAL NOT NULL,
          letter_grade TEXT NOT NULL,
          compliance_pct REAL NOT NULL,
          auto_fail BOOLEAN NOT NULL,
          critical_issues INTEGER NOT NULL,
          findings_count INTEGER NOT NULL,
          json_report TEXT NOT NULL,
          FOREIGN KEY(api_id) REFERENCES api(api_id),
          FOREIGN KEY(team_id) REFERENCES teams(team_id)
        );
        
        CREATE TABLE IF NOT EXISTS finding (
          run_id TEXT NOT NULL,
          rule_id TEXT NOT NULL,
          severity TEXT NOT NULL,
          category TEXT,
          json_path TEXT,
          line INTEGER,
          message TEXT,
          PRIMARY KEY (run_id, rule_id, json_path, line),
          FOREIGN KEY(run_id) REFERENCES run(run_id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS checkpoint_score (
          run_id TEXT NOT NULL,
          checkpoint_id TEXT NOT NULL,
          category TEXT NOT NULL,
          max_points INTEGER NOT NULL,
          scored_points INTEGER NOT NULL,
          PRIMARY KEY (run_id, checkpoint_id),
          FOREIGN KEY(run_id) REFERENCES run(run_id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS usage_tracking (
          id SERIAL PRIMARY KEY,
          team_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB,
          FOREIGN KEY(team_id) REFERENCES teams(team_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_run_api ON run(api_id, graded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_run_team ON run(team_id, graded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_usage_team ON usage_tracking(team_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_api_team ON api(team_id);
      `);
      
      // Create default team for development
      if (process.env.NODE_ENV !== 'production') {
        await client.query(`
          INSERT INTO teams (team_id, name, usage_limit)
          VALUES ('dev-team', 'Development Team', 10000)
          ON CONFLICT (team_id) DO NOTHING
        `);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureApi(apiId: string, teamId?: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO api(api_id, team_id, first_seen_at, last_seen_at) 
       VALUES($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(api_id) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP`,
      [apiId, teamId]
    );
  }

  async insertRun(
    run: RunRow,
    checkpointScores: Array<{checkpoint_id: string; category: string; max_points: number; scored_points: number}>,
    findings: Array<{rule_id: string; severity: string; category?: string; json_path: string; line?: number; message: string}>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      await this.ensureApi(run.api_id, run.team_id);
      
      await client.query(
        `INSERT INTO run(run_id, api_id, team_id, user_id, graded_at, template_version, 
          template_hash, ruleset_hash, spec_hash, repo_remote, repo_branch, repo_path, 
          git_commit, total_score, letter_grade, compliance_pct, auto_fail, critical_issues, 
          findings_count, json_report)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          run.run_id, run.api_id, run.team_id, run.user_id, run.graded_at,
          run.template_version, run.template_hash, run.ruleset_hash, run.spec_hash,
          run.repo_remote, run.repo_branch, run.repo_path, run.git_commit,
          run.total_score, run.letter_grade, run.compliance_pct, run.auto_fail,
          run.critical_issues, run.findings_count, run.json_report
        ]
      );
      
      for (const cs of checkpointScores) {
        await client.query(
          `INSERT INTO checkpoint_score(run_id, checkpoint_id, category, max_points, scored_points) 
           VALUES($1, $2, $3, $4, $5)`,
          [run.run_id, cs.checkpoint_id, cs.category, cs.max_points, cs.scored_points]
        );
      }
      
      for (const f of findings) {
        await client.query(
          `INSERT INTO finding(run_id, rule_id, severity, category, json_path, line, message) 
           VALUES($1, $2, $3, $4, $5, $6, $7)`,
          [run.run_id, f.rule_id, f.severity, f.category || null, f.json_path, f.line || null, f.message]
        );
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getHistory(apiId: string, limit = 20, since?: string, teamId?: string): Promise<any[]> {
    let query = `
      SELECT run_id, graded_at, total_score, letter_grade, auto_fail, 
             critical_issues, findings_count, template_hash, ruleset_hash
      FROM run 
      WHERE api_id = $1
    `;
    const params: any[] = [apiId];
    let paramIndex = 2;

    if (teamId) {
      query += ` AND team_id = $${paramIndex}`;
      params.push(teamId);
      paramIndex++;
    }

    if (since) {
      query += ` AND graded_at >= $${paramIndex}`;
      params.push(since);
      paramIndex++;
    }

    query += ` ORDER BY graded_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async trackUsage(teamId: string, toolName: string, metadata?: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO usage_tracking(team_id, tool_name, metadata) VALUES($1, $2, $3)`,
      [teamId, toolName, metadata || {}]
    );
    
    // Update team usage counter
    await this.pool.query(
      `UPDATE teams SET current_usage = current_usage + 1 WHERE team_id = $1`,
      [teamId]
    );
  }

  async getTeamUsage(teamId: string, startDate?: Date, endDate?: Date): Promise<any> {
    const query = `
      SELECT tool_name, COUNT(*) as count, 
             DATE_TRUNC('day', timestamp) as day
      FROM usage_tracking
      WHERE team_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
      GROUP BY tool_name, day
      ORDER BY day DESC, count DESC
    `;
    
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate || new Date();
    
    const result = await this.pool.query(query, [teamId, start, end]);
    return result.rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}