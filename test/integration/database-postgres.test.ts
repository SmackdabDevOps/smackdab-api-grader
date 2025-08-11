/**
 * PostgreSQL Database Integration Tests
 * Tests real PostgreSQL database operations including team isolation and concurrency
 */

import { Pool, PoolClient } from 'pg';
import { GraderDB, RunRow } from '../../src/mcp/persistence/db-postgres';
import { MockFindingFactory, MockCheckpointFactory, MockDbFactory } from '../helpers/mock-factories';

// Test configuration
const TEST_DATABASE_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'test_user',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'grader_test',
};

describe('PostgreSQL Database Integration', () => {
  let testPool: Pool;
  let graderDB: GraderDB;
  let testDbName: string;

  beforeAll(async () => {
    // Create unique test database name
    testDbName = `grader_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Connect to postgres database to create test database
    const adminPool = new Pool({
      ...TEST_DATABASE_CONFIG,
      database: 'postgres'
    });

    try {
      await adminPool.query(`CREATE DATABASE ${testDbName}`);
    } catch (error) {
      // Database might already exist or we don't have permissions
      console.warn('Could not create test database:', error.message);
    }

    await adminPool.end();

    // Set up test environment
    process.env.DATABASE_URL = `postgresql://${TEST_DATABASE_CONFIG.user}:${TEST_DATABASE_CONFIG.password}@${TEST_DATABASE_CONFIG.host}:${TEST_DATABASE_CONFIG.port}/${testDbName}`;
    
    // Initialize test database connection
    graderDB = new GraderDB();
  });

  afterAll(async () => {
    // Close database connection
    if (graderDB) {
      await graderDB.close();
    }

    // Clean up test database
    if (testDbName && testDbName.includes('test')) {
      try {
        const adminPool = new Pool({
          ...TEST_DATABASE_CONFIG,
          database: 'postgres'
        });
        
        await adminPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
        await adminPool.end();
      } catch (error) {
        console.warn('Could not drop test database:', error.message);
      }
    }
  });

  beforeEach(async () => {
    // Clear all tables
    try {
      const clearQueries = [
        'TRUNCATE TABLE usage_tracking CASCADE',
        'TRUNCATE TABLE finding CASCADE',
        'TRUNCATE TABLE checkpoint_score CASCADE', 
        'TRUNCATE TABLE run CASCADE',
        'TRUNCATE TABLE api CASCADE',
        'TRUNCATE TABLE teams CASCADE'
      ];
      
      for (const query of clearQueries) {
        try {
          await graderDB['pool'].query(query);
        } catch (error) {
          // Table might not exist yet
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Database Connection', () => {
    it('should connect to PostgreSQL successfully', async () => {
      await expect(graderDB.connect()).resolves.not.toThrow();
    });

    it('should handle connection failures gracefully', async () => {
      const badDB = new GraderDB();
      // Override connection string to invalid host
      const originalEnv = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://invalid:invalid@nonexistent:5432/invalid';
      
      const badGraderDB = new GraderDB();
      await expect(badGraderDB.connect()).rejects.toThrow();
      
      // Restore environment
      process.env.DATABASE_URL = originalEnv;
    });

    it('should support connection pooling', async () => {
      await graderDB.connect();
      
      // Make multiple concurrent requests to test pooling
      const promises = Array.from({ length: 5 }, () =>
        graderDB['pool'].query('SELECT NOW() as timestamp')
      );
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].timestamp).toBeDefined();
      });
    });
  });

  describe('Database Migration', () => {
    it('should run migrations successfully', async () => {
      await graderDB.connect();
      await expect(graderDB.migrate()).resolves.not.toThrow();
      
      // Verify tables were created
      const tables = await graderDB['pool'].query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      
      const tableNames = tables.rows.map(row => row.table_name);
      expect(tableNames).toEqual([
        'api',
        'checkpoint_score',
        'finding',
        'run',
        'teams',
        'usage_tracking'
      ]);
    });

    it('should create indexes for performance', async () => {
      await graderDB.connect();
      await graderDB.migrate();
      
      const indexes = await graderDB['pool'].query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
        ORDER BY indexname
      `);
      
      const indexNames = indexes.rows.map(row => row.indexname);
      expect(indexNames).toContain('idx_run_api');
      expect(indexNames).toContain('idx_run_team');
      expect(indexNames).toContain('idx_usage_team');
      expect(indexNames).toContain('idx_api_team');
    });

    it('should create development team in non-production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      await graderDB.connect();
      await graderDB.migrate();
      
      const teams = await graderDB['pool'].query('SELECT * FROM teams WHERE team_id = $1', ['dev-team']);
      expect(teams.rows).toHaveLength(1);
      expect(teams.rows[0].name).toBe('Development Team');
      expect(teams.rows[0].usage_limit).toBe(10000);
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle migration errors with rollback', async () => {
      await graderDB.connect();
      
      // Mock a migration error by creating a conflicting table
      try {
        await graderDB['pool'].query('CREATE TABLE teams (id TEXT)');
        await expect(graderDB.migrate()).rejects.toThrow();
        
        // Verify rollback - the table should still exist but be unchanged
        const result = await graderDB['pool'].query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'teams' 
          ORDER BY column_name
        `);
        expect(result.rows).toEqual([{ column_name: 'id' }]);
      } finally {
        // Clean up
        await graderDB['pool'].query('DROP TABLE IF EXISTS teams CASCADE');
      }
    });
  });

  describe('Team-Based Data Isolation', () => {
    beforeEach(async () => {
      await graderDB.connect();
      await graderDB.migrate();
    });

    it('should isolate data between teams', async () => {
      const team1 = 'team-alpha';
      const team2 = 'team-beta';
      const apiId = 'shared-api-id';

      // Create teams
      await graderDB['pool'].query(
        'INSERT INTO teams (team_id, name) VALUES ($1, $2), ($3, $4)',
        [team1, 'Team Alpha', team2, 'Team Beta']
      );

      // Insert runs for different teams with same API ID
      const run1: RunRow = {
        run_id: 'run_team1',
        api_id: apiId,
        team_id: team1,
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'ruleset1',
        spec_hash: 'spec1',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: false,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 85 })
      };

      const run2: RunRow = {
        ...run1,
        run_id: 'run_team2',
        team_id: team2,
        total_score: 75
      };

      await graderDB.insertRun(run1, [], []);
      await graderDB.insertRun(run2, [], []);

      // Verify team isolation
      const team1History = await graderDB.getHistory(apiId, 20, undefined, team1);
      const team2History = await graderDB.getHistory(apiId, 20, undefined, team2);

      expect(team1History).toHaveLength(1);
      expect(team2History).toHaveLength(1);
      expect(team1History[0].run_id).toBe('run_team1');
      expect(team2History[0].run_id).toBe('run_team2');
    });

    it('should track usage per team independently', async () => {
      const team1 = 'team-usage-1';
      const team2 = 'team-usage-2';

      // Create teams
      await graderDB['pool'].query(
        'INSERT INTO teams (team_id, name, current_usage) VALUES ($1, $2, 0), ($3, $4, 0)',
        [team1, 'Usage Team 1', team2, 'Usage Team 2']
      );

      // Track usage for each team
      await graderDB.trackUsage(team1, 'grade_contract', { apiId: 'api1' });
      await graderDB.trackUsage(team1, 'grade_contract', { apiId: 'api2' });
      await graderDB.trackUsage(team2, 'grade_contract', { apiId: 'api3' });

      // Verify usage tracking
      const team1Usage = await graderDB.getTeamUsage(team1);
      const team2Usage = await graderDB.getTeamUsage(team2);

      expect(team1Usage).toHaveLength(1);
      expect(team1Usage[0].count).toBe('2');
      expect(team1Usage[0].tool_name).toBe('grade_contract');

      expect(team2Usage).toHaveLength(1);
      expect(team2Usage[0].count).toBe('1');

      // Verify team usage counters
      const teams = await graderDB['pool'].query(
        'SELECT team_id, current_usage FROM teams WHERE team_id IN ($1, $2)',
        [team1, team2]
      );
      
      const team1Data = teams.rows.find(t => t.team_id === team1);
      const team2Data = teams.rows.find(t => t.team_id === team2);
      
      expect(team1Data.current_usage).toBe(2);
      expect(team2Data.current_usage).toBe(1);
    });

    it('should prevent cross-team data access', async () => {
      const team1 = 'secure-team-1';
      const team2 = 'secure-team-2';

      // Create teams
      await graderDB['pool'].query(
        'INSERT INTO teams (team_id, name) VALUES ($1, $2), ($3, $4)',
        [team1, 'Secure Team 1', team2, 'Secure Team 2']
      );

      // Insert run for team1
      const run: RunRow = {
        run_id: 'secure_run',
        api_id: 'secure_api',
        team_id: team1,
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'ruleset1',
        spec_hash: 'spec1',
        total_score: 95,
        letter_grade: 'A',
        compliance_pct: 0.95,
        auto_fail: false,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 95 })
      };

      await graderDB.insertRun(run, [], []);

      // Try to access from team2
      const team2Results = await graderDB.getHistory('secure_api', 20, undefined, team2);
      expect(team2Results).toHaveLength(0);

      // Verify team1 can access
      const team1Results = await graderDB.getHistory('secure_api', 20, undefined, team1);
      expect(team1Results).toHaveLength(1);
    });
  });

  describe('Run Insertion with Transactions', () => {
    beforeEach(async () => {
      await graderDB.connect();
      await graderDB.migrate();
    });

    it('should insert complete run data successfully', async () => {
      const run: RunRow = {
        run_id: 'test_run_complete',
        api_id: 'test_api',
        team_id: 'dev-team',
        user_id: 'test_user',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'template_hash_123',
        ruleset_hash: 'ruleset_hash_456',
        spec_hash: 'spec_hash_789',
        repo_remote: 'https://github.com/test/repo',
        repo_branch: 'main',
        repo_path: '/api/spec.yaml',
        git_commit: 'abc123def',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: false,
        critical_issues: 1,
        findings_count: 3,
        json_report: JSON.stringify({
          score: 85,
          categories: { tenancy: 20, naming: 15, http: 25 }
        })
      };

      const checkpoints = MockCheckpointFactory.list(['tenancy', 'naming', 'http']);
      const findings = [
        {
          rule_id: 'NAMING-CONVENTION',
          severity: 'warn',
          category: 'naming',
          json_path: '$.paths["/users"].get.operationId',
          line: 25,
          message: 'operationId should be camelCase'
        },
        {
          rule_id: 'HTTP-STATUS-CODES',
          severity: 'info',
          json_path: '$.paths["/users"].post.responses',
          line: 35,
          message: 'Consider adding 422 response for validation errors'
        },
        {
          rule_id: 'TENANCY-MISSING',
          severity: 'error',
          category: 'tenancy',
          json_path: '$.info',
          line: 2,
          message: 'API does not implement tenancy patterns'
        }
      ];

      await graderDB.insertRun(run, checkpoints, findings);

      // Verify run was inserted
      const runs = await graderDB['pool'].query('SELECT * FROM run WHERE run_id = $1', [run.run_id]);
      expect(runs.rows).toHaveLength(1);
      
      const insertedRun = runs.rows[0];
      expect(insertedRun.api_id).toBe(run.api_id);
      expect(insertedRun.team_id).toBe(run.team_id);
      expect(insertedRun.total_score).toBe(run.total_score);
      expect(insertedRun.auto_fail).toBe(run.auto_fail);

      // Verify checkpoints were inserted
      const checkpointResults = await graderDB['pool'].query(
        'SELECT * FROM checkpoint_score WHERE run_id = $1 ORDER BY checkpoint_id',
        [run.run_id]
      );
      expect(checkpointResults.rows).toHaveLength(3);
      expect(checkpointResults.rows[0].category).toBe('tenancy');

      // Verify findings were inserted
      const findingResults = await graderDB['pool'].query(
        'SELECT * FROM finding WHERE run_id = $1 ORDER BY severity, rule_id',
        [run.run_id]
      );
      expect(findingResults.rows).toHaveLength(3);
      expect(findingResults.rows[0].severity).toBe('error');
      expect(findingResults.rows[0].rule_id).toBe('TENANCY-MISSING');
    });

    it('should rollback transaction on error', async () => {
      const run: RunRow = {
        run_id: 'test_rollback_run',
        api_id: 'test_api',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'ruleset1',
        spec_hash: 'spec1',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: false,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 85 })
      };

      // Create invalid checkpoint data that will cause constraint violation
      const invalidCheckpoints = [{
        checkpoint_id: null, // This should cause an error
        category: 'test',
        max_points: 10,
        scored_points: 5
      }];

      await expect(graderDB.insertRun(run, invalidCheckpoints, [])).rejects.toThrow();

      // Verify nothing was inserted due to rollback
      const runs = await graderDB['pool'].query('SELECT * FROM run WHERE run_id = $1', [run.run_id]);
      expect(runs.rows).toHaveLength(0);

      const apis = await graderDB['pool'].query('SELECT * FROM api WHERE api_id = $1', [run.api_id]);
      expect(apis.rows).toHaveLength(0);
    });

    it('should handle concurrent insertions without conflicts', async () => {
      const baseRun: Partial<RunRow> = {
        api_id: 'concurrent_api',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'ruleset1',
        spec_hash: 'spec1',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: false,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 85 })
      };

      // Create multiple concurrent insertions
      const insertPromises = Array.from({ length: 5 }, (_, i) => {
        const run: RunRow = {
          ...baseRun,
          run_id: `concurrent_run_${i + 1}`
        } as RunRow;

        return graderDB.insertRun(run, [], []);
      });

      await expect(Promise.all(insertPromises)).resolves.not.toThrow();

      // Verify all runs were inserted
      const runs = await graderDB['pool'].query(
        'SELECT * FROM run WHERE api_id = $1 ORDER BY run_id',
        ['concurrent_api']
      );
      expect(runs.rows).toHaveLength(5);

      // Verify API was created only once
      const apis = await graderDB['pool'].query('SELECT * FROM api WHERE api_id = $1', ['concurrent_api']);
      expect(apis.rows).toHaveLength(1);
    });
  });

  describe('History Retrieval with Filtering', () => {
    beforeEach(async () => {
      await graderDB.connect();
      await graderDB.migrate();
      
      // Seed test data
      await seedHistoryData();
    });

    async function seedHistoryData() {
      const team1 = 'history-team-1';
      const team2 = 'history-team-2';
      
      // Create teams
      await graderDB['pool'].query(
        'INSERT INTO teams (team_id, name) VALUES ($1, $2), ($3, $4)',
        [team1, 'History Team 1', team2, 'History Team 2']
      );

      const baseRun = {
        api_id: 'history_api',
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'ruleset1',
        spec_hash: 'spec1',
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: false,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 85 })
      };

      // Insert runs across different dates and teams
      const runs = [
        { ...baseRun, run_id: 'run_1', team_id: team1, total_score: 90, graded_at: '2024-01-01T10:00:00Z' },
        { ...baseRun, run_id: 'run_2', team_id: team1, total_score: 85, graded_at: '2024-01-02T10:00:00Z' },
        { ...baseRun, run_id: 'run_3', team_id: team2, total_score: 80, graded_at: '2024-01-03T10:00:00Z' },
        { ...baseRun, run_id: 'run_4', team_id: team1, total_score: 95, graded_at: '2024-01-04T10:00:00Z' },
        { ...baseRun, run_id: 'run_5', team_id: team1, total_score: 88, graded_at: '2024-01-05T10:00:00Z' }
      ];

      for (const run of runs) {
        await graderDB.insertRun(run as RunRow, [], []);
      }
    }

    it('should retrieve history ordered by date descending', async () => {
      const history = await graderDB.getHistory('history_api', 10);
      
      expect(history.length).toBeGreaterThan(0);
      
      // Verify ordering (most recent first)
      for (let i = 1; i < history.length; i++) {
        expect(new Date(history[i - 1].graded_at) >= new Date(history[i].graded_at)).toBe(true);
      }
    });

    it('should limit results correctly', async () => {
      const history = await graderDB.getHistory('history_api', 2);
      expect(history).toHaveLength(2);
    });

    it('should filter by team correctly', async () => {
      const team1History = await graderDB.getHistory('history_api', 10, undefined, 'history-team-1');
      const team2History = await graderDB.getHistory('history_api', 10, undefined, 'history-team-2');
      
      expect(team1History).toHaveLength(4);
      expect(team2History).toHaveLength(1);
      
      // Verify team isolation
      team1History.forEach(row => expect(['run_1', 'run_2', 'run_4', 'run_5']).toContain(row.run_id));
      team2History.forEach(row => expect(row.run_id).toBe('run_3'));
    });

    it('should filter by date correctly', async () => {
      const sinceDate = '2024-01-03T00:00:00Z';
      const history = await graderDB.getHistory('history_api', 10, sinceDate);
      
      expect(history).toHaveLength(3); // runs 3, 4, 5
      history.forEach(row => {
        expect(new Date(row.graded_at) >= new Date(sinceDate)).toBe(true);
      });
    });

    it('should combine team and date filters', async () => {
      const history = await graderDB.getHistory(
        'history_api', 
        10, 
        '2024-01-02T00:00:00Z', 
        'history-team-1'
      );
      
      expect(history).toHaveLength(3); // runs 2, 4, 5 from team 1
      history.forEach(row => {
        expect(['run_2', 'run_4', 'run_5']).toContain(row.run_id);
      });
    });

    it('should return empty array for non-existent api', async () => {
      const history = await graderDB.getHistory('non_existent_api');
      expect(history).toHaveLength(0);
    });
  });

  describe('Performance and Scalability', () => {
    beforeEach(async () => {
      await graderDB.connect();
      await graderDB.migrate();
    });

    it('should handle large result sets efficiently', async () => {
      const apiId = 'performance_test_api';
      const runCount = 100;

      // Insert many runs
      const insertPromises = Array.from({ length: runCount }, (_, i) => {
        const run: RunRow = {
          run_id: `perf_run_${i.toString().padStart(3, '0')}`,
          api_id: apiId,
          graded_at: new Date(2024, 0, 1, 10, i).toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'ruleset1',
          spec_hash: 'spec1',
          total_score: 85 + (i % 20),
          letter_grade: 'B',
          compliance_pct: 0.85,
          auto_fail: false,
          critical_issues: 0,
          findings_count: 0,
          json_report: JSON.stringify({ score: 85 + (i % 20) })
        };
        return graderDB.insertRun(run, [], []);
      });

      const startTime = Date.now();
      await Promise.all(insertPromises);
      const insertTime = Date.now() - startTime;

      expect(insertTime).toBeLessThan(30000); // Should complete within 30 seconds

      // Test retrieval performance
      const retrievalStart = Date.now();
      const history = await graderDB.getHistory(apiId, 50);
      const retrievalTime = Date.now() - retrievalStart;

      expect(history).toHaveLength(50);
      expect(retrievalTime).toBeLessThan(1000); // Should retrieve within 1 second
    });

    it('should maintain performance under concurrent load', async () => {
      const apiId = 'concurrent_performance_api';
      const concurrentOperations = 20;

      const operations = Array.from({ length: concurrentOperations }, (_, i) => {
        return async () => {
          // Mix of insertions and retrievals
          if (i % 2 === 0) {
            const run: RunRow = {
              run_id: `concurrent_perf_run_${i}`,
              api_id: apiId,
              graded_at: new Date().toISOString(),
              template_version: '3.2.3',
              template_hash: 'hash1',
              ruleset_hash: 'ruleset1',
              spec_hash: 'spec1',
              total_score: 85,
              letter_grade: 'B',
              compliance_pct: 0.85,
              auto_fail: false,
              critical_issues: 0,
              findings_count: 0,
              json_report: JSON.stringify({ score: 85 })
            };
            await graderDB.insertRun(run, [], []);
          } else {
            await graderDB.getHistory(apiId, 10);
          }
        };
      });

      const startTime = Date.now();
      await Promise.all(operations.map(op => op()));
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Connection Pool Management', () => {
    it('should handle connection pool exhaustion gracefully', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      // Create more connections than pool max (20)
      const connectionPromises = Array.from({ length: 25 }, () => 
        graderDB['pool'].query('SELECT pg_sleep(0.1)')
      );

      await expect(Promise.all(connectionPromises)).resolves.not.toThrow();
    });

    it('should recover from connection errors', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      // Force connection pool to be exhausted and recover
      const longQueries = Array.from({ length: 5 }, () => 
        graderDB['pool'].query('SELECT pg_sleep(0.5)')
      );

      // Start long queries without waiting
      const longQueryPromises = Promise.all(longQueries);

      // Immediate query should still work (or wait for connection)
      const quickQuery = graderDB['pool'].query('SELECT 1 as test');
      
      const [longResults, quickResult] = await Promise.all([longQueryPromises, quickQuery]);
      
      expect(longResults).toHaveLength(5);
      expect(quickResult.rows[0].test).toBe(1);
    });
  });

  describe('Data Integrity and Constraints', () => {
    beforeEach(async () => {
      await graderDB.connect();
      await graderDB.migrate();
    });

    it('should enforce foreign key constraints', async () => {
      const run: RunRow = {
        run_id: 'constraint_test_run',
        api_id: 'constraint_test_api',
        team_id: 'non_existent_team', // This should cause FK violation
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'ruleset1',
        spec_hash: 'spec1',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: false,
        critical_issues: 0,
        findings_count: 0,
        json_report: JSON.stringify({ score: 85 })
      };

      await expect(graderDB.insertRun(run, [], [])).rejects.toThrow();
    });

    it('should maintain referential integrity on cascading deletes', async () => {
      // Create team and run with findings/checkpoints
      await graderDB['pool'].query(
        'INSERT INTO teams (team_id, name) VALUES ($1, $2)',
        ['cascade_test_team', 'Cascade Test Team']
      );

      const run: RunRow = {
        run_id: 'cascade_test_run',
        api_id: 'cascade_test_api',
        team_id: 'cascade_test_team',
        graded_at: new Date().toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'ruleset1',
        spec_hash: 'spec1',
        total_score: 85,
        letter_grade: 'B',
        compliance_pct: 0.85,
        auto_fail: false,
        critical_issues: 0,
        findings_count: 1,
        json_report: JSON.stringify({ score: 85 })
      };

      const checkpoints = [MockCheckpointFactory.create()];
      const findings = [{
        rule_id: 'TEST_RULE',
        severity: 'info',
        json_path: '$.test',
        message: 'Test finding'
      }];

      await graderDB.insertRun(run, checkpoints, findings);

      // Verify data was inserted
      const findingsCount = await graderDB['pool'].query(
        'SELECT COUNT(*) FROM finding WHERE run_id = $1',
        ['cascade_test_run']
      );
      expect(parseInt(findingsCount.rows[0].count)).toBe(1);

      // Delete the run
      await graderDB['pool'].query('DELETE FROM run WHERE run_id = $1', ['cascade_test_run']);

      // Verify cascade delete worked
      const findingsAfterDelete = await graderDB['pool'].query(
        'SELECT COUNT(*) FROM finding WHERE run_id = $1',
        ['cascade_test_run']
      );
      expect(parseInt(findingsAfterDelete.rows[0].count)).toBe(0);

      const checkpointsAfterDelete = await graderDB['pool'].query(
        'SELECT COUNT(*) FROM checkpoint_score WHERE run_id = $1',
        ['cascade_test_run']
      );
      expect(parseInt(checkpointsAfterDelete.rows[0].count)).toBe(0);
    });
  });
});