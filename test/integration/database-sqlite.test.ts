/**
 * SQLite Database Integration Tests
 * Tests SQLite database operations including transactions and performance
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { GraderDB, RunRow } from '../../src/mcp/persistence/db';
import { MockFindingFactory, MockCheckpointFactory, MockDbFactory } from '../helpers/mock-factories';
import fs from 'fs/promises';
import path from 'path';

describe('SQLite Database Integration', () => {
  let graderDB: GraderDB;
  let testDbPath: string;

  beforeAll(async () => {
    // Create unique test database path
    testDbPath = path.join(process.cwd(), `test_grader_${Date.now()}_${Math.random().toString(36).substring(7)}.sqlite`);
  });

  afterAll(async () => {
    // Clean up test database file
    if (testDbPath) {
      try {
        await fs.unlink(testDbPath);
      } catch (error) {
        // File might not exist
      }
    }
  });

  beforeEach(async () => {
    // Create fresh database instance for each test
    graderDB = new GraderDB(`file:${testDbPath}`);
    await graderDB.connect();
    await graderDB.migrate();
  });

  afterEach(async () => {
    // Clean up database connection
    if (graderDB && graderDB['db']) {
      await graderDB['db'].close();
    }
  });

  describe('Database Connection', () => {
    it('should create and connect to SQLite database', async () => {
      const tempDb = new GraderDB(':memory:');
      await expect(tempDb.connect()).resolves.not.toThrow();
      
      expect(tempDb['db']).toBeDefined();
      expect(tempDb['db']).toBeInstanceOf(Database);
      
      await tempDb['db'].close();
    });

    it('should handle file database connections', async () => {
      const fileDbPath = path.join(process.cwd(), 'test_file_db.sqlite');
      const fileDb = new GraderDB(`file:${fileDbPath}`);
      
      await fileDb.connect();
      expect(fileDb['db']).toBeDefined();
      
      // Verify file was created
      await expect(fs.access(fileDbPath)).resolves.not.toThrow();
      
      await fileDb['db'].close();
      await fs.unlink(fileDbPath);
    });

    it('should configure WAL mode for performance', async () => {
      await graderDB.connect();
      
      const result = await graderDB['db'].get('PRAGMA journal_mode');
      expect(result['journal_mode']).toBe('wal');
    });

    it('should throw error when operations attempted without connection', async () => {
      const disconnectedDb = new GraderDB(':memory:');
      
      await expect(disconnectedDb.migrate()).rejects.toThrow('DB not connected');
      await expect(disconnectedDb.ensureApi('test')).rejects.toThrow('DB not connected');
      await expect(disconnectedDb.getHistory('test')).rejects.toThrow('DB not connected');
    });
  });

  describe('Database Migration', () => {
    it('should create all required tables', async () => {
      // Check that tables exist
      const tables = await graderDB['db'].all(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('api');
      expect(tableNames).toContain('run');
      expect(tableNames).toContain('finding');
      expect(tableNames).toContain('checkpoint_score');
    });

    it('should create indexes for performance', async () => {
      const indexes = await graderDB['db'].all(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      
      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_run_api');
    });

    it('should be idempotent (can run multiple times)', async () => {
      // Run migration again
      await expect(graderDB.migrate()).resolves.not.toThrow();
      
      // Verify tables still exist and are not duplicated
      const tables = await graderDB['db'].all(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames.filter(name => name === 'api')).toHaveLength(1);
      expect(tableNames.filter(name => name === 'run')).toHaveLength(1);
    });

    it('should define proper table schemas', async () => {
      // Check run table structure
      const runSchema = await graderDB['db'].all("PRAGMA table_info(run)");
      
      const columnNames = runSchema.map(col => col.name);
      expect(columnNames).toContain('run_id');
      expect(columnNames).toContain('api_id');
      expect(columnNames).toContain('graded_at');
      expect(columnNames).toContain('total_score');
      expect(columnNames).toContain('letter_grade');
      expect(columnNames).toContain('json_report');
      
      // Check primary key
      const primaryKey = runSchema.find(col => col.pk === 1);
      expect(primaryKey.name).toBe('run_id');
    });
  });

  describe('API Management', () => {
    it('should create API record on first use', async () => {
      const apiId = 'test-api-first-use';
      
      await graderDB.ensureApi(apiId);
      
      const api = await graderDB['db'].get('SELECT * FROM api WHERE api_id = ?', apiId);
      expect(api).toBeDefined();
      expect(api.api_id).toBe(apiId);
      expect(api.first_seen_at).toBeDefined();
      expect(api.last_seen_at).toBeDefined();
    });

    it('should update last_seen_at on subsequent calls', async () => {
      const apiId = 'test-api-update';
      
      await graderDB.ensureApi(apiId);
      const first = await graderDB['db'].get('SELECT * FROM api WHERE api_id = ?', apiId);
      
      // Wait a moment to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await graderDB.ensureApi(apiId);
      const second = await graderDB['db'].get('SELECT * FROM api WHERE api_id = ?', apiId);
      
      expect(second.first_seen_at).toBe(first.first_seen_at);
      expect(second.last_seen_at).toBeGreaterThanOrEqual(first.last_seen_at);
    });
  });

  describe('Run Insertion with Transactions', () => {
    it('should insert complete run with all related data', async () => {
      const run: RunRow = {
        run_id: 'complete_run_test',
        api_id: 'complete_api_test',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'template_hash_123',
        ruleset_hash: 'ruleset_hash_456',
        spec_hash: 'spec_hash_789',
        repo_remote: 'https://github.com/test/repo',
        repo_branch: 'main',
        repo_path: '/api/spec.yaml',
        git_commit: 'abc123def456',
        total_score: 87,
        letter_grade: 'B+',
        compliance_pct: 0.87,
        auto_fail: 0,
        critical_issues: 1,
        findings_count: 4,
        json_report: JSON.stringify({
          score: 87,
          categories: { tenancy: 20, naming: 17, http: 25, caching: 15, pagination: 10 },
          autoFailReasons: []
        })
      };

      const checkpointScores = [
        { checkpoint_id: 'TENANCY-REQUIRED', category: 'tenancy', max_points: 20, scored_points: 20 },
        { checkpoint_id: 'NAMING-OPERATIONS', category: 'naming', max_points: 20, scored_points: 17 },
        { checkpoint_id: 'HTTP-METHODS', category: 'http', max_points: 25, scored_points: 25 },
        { checkpoint_id: 'CACHING-HEADERS', category: 'caching', max_points: 15, scored_points: 15 }
      ];

      const findings = [
        {
          rule_id: 'NAMING-CONVENTION',
          severity: 'warn',
          category: 'naming',
          json_path: '$.paths["/users"].get.operationId',
          line: 45,
          message: 'operationId should follow camelCase convention'
        },
        {
          rule_id: 'HTTP-STATUS-COMPLETE',
          severity: 'info',
          category: 'http',
          json_path: '$.paths["/users"].post.responses',
          line: 67,
          message: 'Consider adding 409 response for conflict scenarios'
        },
        {
          rule_id: 'TENANCY-MISSING',
          severity: 'error',
          category: 'tenancy',
          json_path: '$.paths["/admin"]',
          line: 12,
          message: 'Admin endpoints should include organization context'
        },
        {
          rule_id: 'DOCUMENTATION-MISSING',
          severity: 'info',
          json_path: '$.info.description',
          line: 3,
          message: 'API description should be more detailed'
        }
      ];

      await graderDB.insertRun(run, checkpointScores, findings);

      // Verify run was inserted correctly
      const insertedRun = await graderDB['db'].get('SELECT * FROM run WHERE run_id = ?', run.run_id);
      expect(insertedRun).toBeDefined();
      expect(insertedRun.api_id).toBe(run.api_id);
      expect(insertedRun.total_score).toBe(run.total_score);
      expect(insertedRun.letter_grade).toBe(run.letter_grade);
      expect(insertedRun.auto_fail).toBe(run.auto_fail);
      expect(insertedRun.critical_issues).toBe(run.critical_issues);
      expect(insertedRun.findings_count).toBe(run.findings_count);

      // Verify checkpoints were inserted
      const insertedCheckpoints = await graderDB['db'].all(
        'SELECT * FROM checkpoint_score WHERE run_id = ? ORDER BY checkpoint_id',
        run.run_id
      );
      expect(insertedCheckpoints).toHaveLength(4);
      expect(insertedCheckpoints[0].checkpoint_id).toBe('CACHING-HEADERS');
      expect(insertedCheckpoints[0].scored_points).toBe(15);

      // Verify findings were inserted
      const insertedFindings = await graderDB['db'].all(
        'SELECT * FROM finding WHERE run_id = ? ORDER BY severity DESC, rule_id',
        run.run_id
      );
      expect(insertedFindings).toHaveLength(4);
      expect(insertedFindings[0].severity).toBe('warn');
      expect(insertedFindings[0].rule_id).toBe('NAMING-CONVENTION');
      expect(insertedFindings[1].severity).toBe('info');

      // Verify API record was created
      const api = await graderDB['db'].get('SELECT * FROM api WHERE api_id = ?', run.api_id);
      expect(api).toBeDefined();
      expect(api.api_id).toBe(run.api_id);
    });

    it('should handle null/optional values correctly', async () => {
      const run: RunRow = {
        run_id: 'minimal_run_test',
        api_id: 'minimal_api_test',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'hash2',
        spec_hash: 'hash3',
        // Optional fields as undefined
        repo_remote: undefined,
        repo_branch: undefined,
        repo_path: undefined,
        git_commit: undefined,
        total_score: 90,
        letter_grade: 'A-',
        compliance_pct: 0.90,
        auto_fail: 0,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 90 })
      };

      const findings = [{
        rule_id: 'TEST-RULE',
        severity: 'info',
        json_path: '$.test',
        line: undefined, // Optional
        message: 'Test message',
        category: undefined // Optional
      }];

      await graderDB.insertRun(run, [], findings);

      const insertedRun = await graderDB['db'].get('SELECT * FROM run WHERE run_id = ?', run.run_id);
      expect(insertedRun.repo_remote).toBeNull();
      expect(insertedRun.repo_branch).toBeNull();
      expect(insertedRun.repo_path).toBeNull();
      expect(insertedRun.git_commit).toBeNull();

      const insertedFinding = await graderDB['db'].get('SELECT * FROM finding WHERE run_id = ?', run.run_id);
      expect(insertedFinding.line).toBeNull();
      expect(insertedFinding.category).toBeNull();
    });

    it('should rollback transaction on error', async () => {
      const run: RunRow = {
        run_id: 'rollback_test',
        api_id: 'rollback_api_test',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'hash2',
        spec_hash: 'hash3',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: 0,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 85 })
      };

      // Create invalid checkpoint that will cause error
      const invalidCheckpoints = [{
        checkpoint_id: 'x'.repeat(300), // Too long for database
        category: 'test',
        max_points: 10,
        scored_points: 5
      }];

      await expect(graderDB.insertRun(run, invalidCheckpoints, [])).rejects.toThrow();

      // Verify nothing was inserted due to rollback
      const insertedRun = await graderDB['db'].get('SELECT * FROM run WHERE run_id = ?', run.run_id);
      expect(insertedRun).toBeUndefined();

      const insertedApi = await graderDB['db'].get('SELECT * FROM api WHERE api_id = ?', run.api_id);
      expect(insertedApi).toBeUndefined();
    });

    it('should handle concurrent insertions safely', async () => {
      const apiId = 'concurrent_sqlite_test';
      const baseRun = {
        api_id: apiId,
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'hash2',
        spec_hash: 'hash3',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: 0,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 85 })
      };

      // Note: SQLite has limited concurrency compared to PostgreSQL
      // We'll test with smaller numbers to avoid lock timeouts
      const concurrentRuns = Array.from({ length: 3 }, (_, i) => ({
        ...baseRun,
        run_id: `concurrent_sqlite_run_${i}`,
        total_score: 85 + i
      }));

      const insertPromises = concurrentRuns.map(run => 
        graderDB.insertRun(run as RunRow, [], [])
      );

      await expect(Promise.all(insertPromises)).resolves.not.toThrow();

      // Verify all runs were inserted
      const runs = await graderDB['db'].all('SELECT * FROM run WHERE api_id = ? ORDER BY run_id', apiId);
      expect(runs).toHaveLength(3);

      // Verify API was created only once
      const apis = await graderDB['db'].all('SELECT * FROM api WHERE api_id = ?', apiId);
      expect(apis).toHaveLength(1);
    });
  });

  describe('History Retrieval', () => {
    beforeEach(async () => {
      await seedTestHistory();
    });

    async function seedTestHistory() {
      const apiId = 'history_test_api';
      const runs = [
        {
          run_id: 'history_run_1',
          api_id: apiId,
          graded_at: '2024-01-01T10:00:00Z',
          total_score: 95,
          letter_grade: 'A',
          auto_fail: 0,
          critical_issues: 0,
          findings_count: 0
        },
        {
          run_id: 'history_run_2',
          api_id: apiId,
          graded_at: '2024-01-02T10:00:00Z',
          total_score: 87,
          letter_grade: 'B+',
          auto_fail: 0,
          critical_issues: 1,
          findings_count: 2
        },
        {
          run_id: 'history_run_3',
          api_id: apiId,
          graded_at: '2024-01-03T10:00:00Z',
          total_score: 78,
          letter_grade: 'C+',
          auto_fail: 0,
          critical_issues: 2,
          findings_count: 5
        },
        {
          run_id: 'history_run_4',
          api_id: apiId,
          graded_at: '2024-01-04T10:00:00Z',
          total_score: 92,
          letter_grade: 'A-',
          auto_fail: 0,
          critical_issues: 0,
          findings_count: 1
        }
      ];

      for (const run of runs) {
        const fullRun: RunRow = {
          ...run,
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          compliance_pct: run.total_score / 100,
          json_report: JSON.stringify({ score: run.total_score })
        };
        await graderDB.insertRun(fullRun, [], []);
      }
    }

    it('should retrieve history ordered by most recent first', async () => {
      const history = await graderDB.getHistory('history_test_api', 10);
      
      expect(history).toHaveLength(4);
      expect(history[0].run_id).toBe('history_run_4'); // Most recent
      expect(history[1].run_id).toBe('history_run_3');
      expect(history[2].run_id).toBe('history_run_2');
      expect(history[3].run_id).toBe('history_run_1'); // Oldest
    });

    it('should respect limit parameter', async () => {
      const history = await graderDB.getHistory('history_test_api', 2);
      
      expect(history).toHaveLength(2);
      expect(history[0].run_id).toBe('history_run_4');
      expect(history[1].run_id).toBe('history_run_3');
    });

    it('should filter by since parameter', async () => {
      const sinceDate = '2024-01-03T00:00:00Z';
      const history = await graderDB.getHistory('history_test_api', 10, sinceDate);
      
      expect(history).toHaveLength(2);
      expect(history[0].run_id).toBe('history_run_4');
      expect(history[1].run_id).toBe('history_run_3');
    });

    it('should return empty array for non-existent API', async () => {
      const history = await graderDB.getHistory('non_existent_api');
      expect(history).toHaveLength(0);
    });

    it('should return expected fields in history response', async () => {
      const history = await graderDB.getHistory('history_test_api', 1);
      
      expect(history).toHaveLength(1);
      const record = history[0];
      
      expect(record).toHaveProperty('run_id');
      expect(record).toHaveProperty('graded_at');
      expect(record).toHaveProperty('total_score');
      expect(record).toHaveProperty('letter_grade');
      expect(record).toHaveProperty('auto_fail');
      expect(record).toHaveProperty('critical_issues');
      expect(record).toHaveProperty('findings_count');
      expect(record).toHaveProperty('template_hash');
      expect(record).toHaveProperty('ruleset_hash');
      
      // Should not include full JSON report in history
      expect(record).not.toHaveProperty('json_report');
    });

    it('should handle date filtering edge cases', async () => {
      // Future date - should return empty
      const futureHistory = await graderDB.getHistory('history_test_api', 10, '2025-01-01T00:00:00Z');
      expect(futureHistory).toHaveLength(0);
      
      // Exact match date
      const exactHistory = await graderDB.getHistory('history_test_api', 10, '2024-01-04T10:00:00Z');
      expect(exactHistory).toHaveLength(1);
      expect(exactHistory[0].run_id).toBe('history_run_4');
      
      // Very old date - should return all
      const allHistory = await graderDB.getHistory('history_test_api', 10, '2020-01-01T00:00:00Z');
      expect(allHistory).toHaveLength(4);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large datasets efficiently', async () => {
      const apiId = 'performance_test_api';
      const runCount = 50; // Moderate size for SQLite testing
      
      // Insert many runs
      const startInsert = Date.now();
      for (let i = 0; i < runCount; i++) {
        const run: RunRow = {
          run_id: `perf_run_${i.toString().padStart(3, '0')}`,
          api_id: apiId,
          graded_at: new Date(2024, 0, 1, 10, i).toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 85 + (i % 15),
          letter_grade: 'B',
          compliance_pct: 0.85,
          auto_fail: 0,
          critical_issues: 0,
          findings_count: 0,
          json_report: JSON.stringify({ score: 85 + (i % 15) })
        };
        await graderDB.insertRun(run, [], []);
      }
      const insertTime = Date.now() - startInsert;
      
      expect(insertTime).toBeLessThan(10000); // Should complete within 10 seconds
      
      // Test retrieval performance
      const startRetrieval = Date.now();
      const history = await graderDB.getHistory(apiId, 25);
      const retrievalTime = Date.now() - startRetrieval;
      
      expect(history).toHaveLength(25);
      expect(retrievalTime).toBeLessThan(500); // Should retrieve within 500ms
      
      // Verify correct ordering
      expect(history[0].total_score).toBeGreaterThanOrEqual(history[1].total_score);
    });

    it('should maintain performance with complex queries', async () => {
      const apiId = 'complex_query_test';
      
      // Insert runs with findings and checkpoints
      for (let i = 0; i < 20; i++) {
        const run: RunRow = {
          run_id: `complex_run_${i}`,
          api_id: apiId,
          graded_at: new Date(2024, 0, 1, 10, i).toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 80 + i,
          letter_grade: i > 15 ? 'A' : 'B',
          compliance_pct: (80 + i) / 100,
          auto_fail: 0,
          critical_issues: i % 3,
          findings_count: i % 5,
          json_report: JSON.stringify({ score: 80 + i })
        };

        const checkpoints = i % 2 === 0 ? MockCheckpointFactory.list(['tenancy', 'naming']) : [];
        const findings = i % 3 === 0 ? [{
          rule_id: `RULE_${i}`,
          severity: 'info',
          json_path: '$.test',
          message: `Test finding ${i}`
        }] : [];

        await graderDB.insertRun(run, checkpoints, findings);
      }
      
      const startTime = Date.now();
      const history = await graderDB.getHistory(apiId, 10);
      const queryTime = Date.now() - startTime;
      
      expect(history).toHaveLength(10);
      expect(queryTime).toBeLessThan(200); // Should be fast even with related data
    });
  });

  describe('Data Integrity and Constraints', () => {
    it('should enforce NOT NULL constraints', async () => {
      const invalidRun = {
        run_id: null, // Should cause error
        api_id: 'test_api',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'hash2',
        spec_hash: 'hash3',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: 0,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 85 })
      };

      await expect(graderDB.insertRun(invalidRun as any, [], [])).rejects.toThrow();
    });

    it('should enforce primary key uniqueness', async () => {
      const run: RunRow = {
        run_id: 'duplicate_test',
        api_id: 'test_api',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'hash2',
        spec_hash: 'hash3',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: 0,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 85 })
      };

      // Insert first run
      await graderDB.insertRun(run, [], []);
      
      // Try to insert duplicate
      await expect(graderDB.insertRun(run, [], [])).rejects.toThrow();
    });

    it('should handle foreign key relationships correctly', async () => {
      // SQLite implementation doesn't use foreign keys in the current schema
      // but we can test data integrity through application logic
      
      const run: RunRow = {
        run_id: 'fk_test_run',
        api_id: 'fk_test_api',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'hash2',
        spec_hash: 'hash3',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: 0,
        critical_issues: 0,
        findings_count: 1,
        json_report: JSON.stringify({ score: 85 })
      };

      const findings = [{
        rule_id: 'FK_TEST_RULE',
        severity: 'info',
        json_path: '$.test',
        message: 'Test finding for FK test'
      }];

      await graderDB.insertRun(run, [], findings);
      
      // Verify referential integrity through queries
      const findingsInDb = await graderDB['db'].all(
        'SELECT * FROM finding WHERE run_id = ?',
        run.run_id
      );
      expect(findingsInDb).toHaveLength(1);
      expect(findingsInDb[0].run_id).toBe(run.run_id);
    });
  });

  describe('Database File Management', () => {
    it('should work with in-memory databases', async () => {
      const memoryDb = new GraderDB(':memory:');
      await memoryDb.connect();
      await memoryDb.migrate();
      
      const run: RunRow = {
        run_id: 'memory_test',
        api_id: 'memory_api',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'hash2',
        spec_hash: 'hash3',
        total_score: 90,
        letter_grade: 'A-',
        compliance_pct: 0.90,
        auto_fail: 0,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 90 })
      };

      await memoryDb.insertRun(run, [], []);
      
      const history = await memoryDb.getHistory('memory_api');
      expect(history).toHaveLength(1);
      expect(history[0].run_id).toBe('memory_test');
      
      await memoryDb['db'].close();
    });

    it('should persist data across connections', async () => {
      const persistentPath = path.join(process.cwd(), 'test_persistent.sqlite');
      
      // First connection - insert data
      const db1 = new GraderDB(`file:${persistentPath}`);
      await db1.connect();
      await db1.migrate();
      
      const run: RunRow = {
        run_id: 'persist_test',
        api_id: 'persist_api',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'hash2',
        spec_hash: 'hash3',
        total_score: 88,
        letter_grade: 'B+',
        compliance_pct: 0.88,
        auto_fail: 0,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 88 })
      };

      await db1.insertRun(run, [], []);
      await db1['db'].close();
      
      // Second connection - verify data persists
      const db2 = new GraderDB(`file:${persistentPath}`);
      await db2.connect();
      
      const history = await db2.getHistory('persist_api');
      expect(history).toHaveLength(1);
      expect(history[0].run_id).toBe('persist_test');
      
      await db2['db'].close();
      await fs.unlink(persistentPath);
    });
  });
});