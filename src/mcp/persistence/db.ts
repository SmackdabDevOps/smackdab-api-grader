import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

export interface RunRow {
  run_id: string;
  api_id: string;
  graded_at: string;
  template_version: string;
  template_hash: string;
  ruleset_hash: string;
  spec_hash: string;
  repo_remote?: string; repo_branch?: string; repo_path?: string; git_commit?: string;
  total_score: number;
  letter_grade: string;
  compliance_pct: number;
  auto_fail: number;
  critical_issues: number;
  findings_count: number;
  json_report: string;
}

export class GraderDB {
  private db?: Database<sqlite3.Database, sqlite3.Statement>;
  constructor(private url: string = 'file:grader.sqlite') {}

  async connect() {
    this.db = await open({ filename: this.url, driver: sqlite3.Database });
    await this.db.exec(`PRAGMA journal_mode=WAL;`);
  }

  async migrate() {
    if (!this.db) throw new Error('DB not connected');
    await this.db.exec(`
    CREATE TABLE IF NOT EXISTS api (
      api_id TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      name TEXT,
      domain TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS run (
      run_id TEXT PRIMARY KEY,
      api_id TEXT NOT NULL,
      graded_at TEXT NOT NULL,
      template_version TEXT NOT NULL,
      template_hash TEXT NOT NULL,
      ruleset_hash TEXT NOT NULL,
      spec_hash TEXT NOT NULL,
      repo_remote TEXT, repo_branch TEXT, repo_path TEXT, git_commit TEXT,
      total_score REAL NOT NULL,
      letter_grade TEXT NOT NULL,
      compliance_pct REAL NOT NULL,
      auto_fail INTEGER NOT NULL,
      critical_issues INTEGER NOT NULL,
      findings_count INTEGER NOT NULL,
      json_report TEXT NOT NULL,
      FOREIGN KEY(api_id) REFERENCES api(api_id)
    );
    CREATE TABLE IF NOT EXISTS finding (
      run_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      category TEXT,
      json_path TEXT,
      line INTEGER,
      message TEXT,
      PRIMARY KEY (run_id, rule_id, json_path, line)
    );
    CREATE TABLE IF NOT EXISTS checkpoint_score (
      run_id TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL,
      category TEXT NOT NULL,
      max_points INTEGER NOT NULL,
      scored_points INTEGER NOT NULL,
      PRIMARY KEY (run_id, checkpoint_id)
    );
    CREATE INDEX IF NOT EXISTS idx_run_api ON run(api_id, graded_at DESC);
    `);
  }

  async ensureApi(apiId: string) {
    if (!this.db) throw new Error('DB not connected');
    const now = new Date().toISOString();
    await this.db.run(`INSERT INTO api(api_id, first_seen_at, last_seen_at) VALUES(?,?,?)
      ON CONFLICT(api_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`, apiId, now, now);
  }

  async insertRun(run: RunRow, checkpointScores: Array<{checkpoint_id:string; category:string; max_points:number; scored_points:number}>, findings: Array<{rule_id:string; severity:string; category?:string; json_path:string; line?:number; message:string;}>) {
    if (!this.db) throw new Error('DB not connected');
    await this.ensureApi(run.api_id);
    const tx = await this.db.exec('BEGIN');
    try {
      await this.db.run(`INSERT INTO run(run_id, api_id, graded_at, template_version, template_hash, ruleset_hash, spec_hash, repo_remote, repo_branch, repo_path, git_commit, total_score, letter_grade, compliance_pct, auto_fail, critical_issues, findings_count, json_report)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        run.run_id, run.api_id, run.graded_at, run.template_version, run.template_hash, run.ruleset_hash, run.spec_hash,
        run.repo_remote, run.repo_branch, run.repo_path, run.git_commit, run.total_score, run.letter_grade, run.compliance_pct,
        run.auto_fail, run.critical_issues, run.findings_count, run.json_report
      );
      for (const cs of checkpointScores) {
        await this.db.run(`INSERT INTO checkpoint_score(run_id, checkpoint_id, category, max_points, scored_points) VALUES(?,?,?,?,?)`,
          run.run_id, cs.checkpoint_id, cs.category, cs.max_points, cs.scored_points);
      }
      for (const f of findings) {
        await this.db.run(`INSERT INTO finding(run_id, rule_id, severity, category, json_path, line, message) VALUES(?,?,?,?,?,?,?)`,
          run.run_id, f.rule_id, f.severity, f.category||null, f.json_path, f.line||null, f.message);
      }
      await this.db.exec('COMMIT');
    } catch (e) {
      await this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async getHistory(apiId: string, limit = 20, since?: string) {
    if (!this.db) throw new Error('DB not connected');
    const where = since ? `AND graded_at >= ?` : ``;
    const params = since ? [apiId, since, limit] : [apiId, limit];
    const q = `SELECT run_id, graded_at, total_score, letter_grade, auto_fail, critical_issues, findings_count, template_hash, ruleset_hash
               FROM run WHERE api_id = ? ${where} ORDER BY graded_at DESC LIMIT ?`;
    return this.db.all(q, ...params);
  }

  // Add missing getApiHistory method that's being called in the REST API
  async getApiHistory(apiUuid: string): Promise<any[]> {
    if (!this.db) throw new Error('DB not connected');
    
    // First try to connect if not connected
    if (!this.db) {
      await this.connect();
    }
    
    const history = await this.db.all(
      `SELECT 
        run_id,
        graded_at as timestamp,
        total_score as totalScore,
        letter_grade as finalGrade,
        spec_hash as specHash,
        template_version as apiVersion
       FROM run 
       WHERE api_id = ? 
       ORDER BY graded_at DESC 
       LIMIT 100`,
      apiUuid
    );
    
    return history || [];
  }

  // Add method to check for existing grade by spec hash
  async getExistingGrade(specHash: string): Promise<any | null> {
    if (!this.db) {
      await this.connect();
    }
    
    const existingRun = await this.db.get(
      `SELECT json_report, graded_at, total_score, letter_grade 
       FROM run 
       WHERE spec_hash = ? 
       ORDER BY graded_at DESC 
       LIMIT 1`,
      specHash
    );
    
    return existingRun;
  }

  // Add close method
  async close() {
    if (this.db) {
      await this.db.close();
      this.db = undefined;
    }
  }
}
