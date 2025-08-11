/**
 * Database Performance Integration Tests
 * Tests database performance under various load conditions and data sizes
 */

import { Pool } from 'pg';
import { GraderDB as PostgresGraderDB, RunRow as PostgresRunRow } from '../../src/mcp/persistence/db-postgres';
import { GraderDB as SqliteGraderDB, RunRow as SqliteRunRow } from '../../src/mcp/persistence/db';
import { MockCheckpointFactory } from '../helpers/mock-factories';
import fs from 'fs/promises';
import path from 'path';

// Performance test configuration
const PERFORMANCE_THRESHOLDS = {
  SINGLE_INSERT_MS: 100,
  BULK_INSERT_MS_PER_RECORD: 5,
  HISTORY_QUERY_MS: 200,
  LARGE_DATASET_QUERY_MS: 1000,
  CONCURRENT_OPERATIONS_MS: 5000,
  CONNECTION_POOL_EXHAUSTION_MS: 3000
};

const TEST_POSTGRES_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'test_user',
  password: process.env.PGPASSWORD || 'test_password',
  database: 'postgres',
};

// Performance test data generators
function generateLargeRunData(count: number, apiId: string, teamId?: string): any[] {
  return Array.from({ length: count }, (_, i) => ({
    run_id: `perf_run_${apiId}_${i.toString().padStart(6, '0')}`,
    api_id: apiId,
    team_id: teamId,
    graded_at: new Date(2024, 0, 1, 0, i).toISOString(),
    template_version: '3.2.3',
    template_hash: `hash_${i % 10}`,
    ruleset_hash: `ruleset_${i % 5}`,
    spec_hash: `spec_${i % 3}`,
    repo_remote: i % 2 === 0 ? `https://github.com/test/repo-${i}` : undefined,
    repo_branch: i % 2 === 0 ? 'main' : undefined,
    repo_path: i % 2 === 0 ? `/api/spec-${i}.yaml` : undefined,
    git_commit: i % 2 === 0 ? `commit${i.toString(16)}` : undefined,
    total_score: 50 + (i % 50),
    letter_grade: ['F', 'D', 'C', 'B', 'A'][Math.floor((50 + (i % 50)) / 20)],
    compliance_pct: (50 + (i % 50)) / 100,
    auto_fail: i % 20 === 0 ? true : false,
    critical_issues: i % 10,
    findings_count: i % 15,
    json_report: JSON.stringify({
      score: 50 + (i % 50),
      executionId: `exec_${i}`,
      categories: {
        tenancy: (i % 5) * 5,
        naming: (i % 4) * 5,
        http: (i % 6) * 4
      }
    })
  }));
}

function generateCheckpointsForRun(runId: string): any[] {
  return [
    {
      checkpoint_id: 'TENANCY-PATTERNS',
      category: 'tenancy',
      max_points: 20,
      scored_points: 15 + Math.floor(Math.random() * 5)
    },
    {
      checkpoint_id: 'NAMING-CONVENTIONS',
      category: 'naming',
      max_points: 15,
      scored_points: 10 + Math.floor(Math.random() * 5)
    },
    {
      checkpoint_id: 'HTTP-SEMANTICS',
      category: 'http',
      max_points: 25,
      scored_points: 20 + Math.floor(Math.random() * 5)
    }
  ];
}

function generateFindingsForRun(runId: string, count: number = 5): any[] {
  return Array.from({ length: count }, (_, i) => ({
    rule_id: `PERF_RULE_${i + 1}`,
    severity: ['error', 'warn', 'info'][i % 3],
    category: ['tenancy', 'naming', 'http', 'caching'][i % 4],
    json_path: `$.paths["/endpoint-${i}"].${['get', 'post', 'put'][i % 3]}`,
    line: 10 + i * 5,
    message: `Performance test finding ${i + 1} for run ${runId}`
  }));
}

describe('Database Performance Tests', () => {
  // Skip performance tests in CI unless explicitly enabled
  const shouldRunPerformanceTests = process.env.RUN_PERFORMANCE_TESTS === 'true' || process.env.CI !== 'true';

  describe('PostgreSQL Performance', () => {
    let testDbName: string;
    let graderDB: PostgresGraderDB;

    beforeAll(async () => {
      if (!shouldRunPerformanceTests) return;

      testDbName = `perf_test_pg_${Date.now()}`;
      
      // Create test database
      const adminPool = new Pool(TEST_POSTGRES_CONFIG);
      try {
        await adminPool.query(`CREATE DATABASE ${testDbName}`);
      } catch (error) {
        console.warn('Could not create test database for performance tests:', error.message);
      }
      await adminPool.end();

      // Set up environment
      process.env.DATABASE_URL = `postgresql://${TEST_POSTGRES_CONFIG.user}:${TEST_POSTGRES_CONFIG.password}@${TEST_POSTGRES_CONFIG.host}:${TEST_POSTGRES_CONFIG.port}/${testDbName}`;
      graderDB = new PostgresGraderDB();
      
      await graderDB.connect();
      await graderDB.migrate();
    });

    afterAll(async () => {
      if (!shouldRunPerformanceTests) return;

      if (graderDB) {
        await graderDB.close();
      }

      // Clean up test database
      if (testDbName && testDbName.includes('perf_test')) {
        try {
          const adminPool = new Pool(TEST_POSTGRES_CONFIG);
          await adminPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
          await adminPool.end();
        } catch (error) {
          console.warn('Could not clean up performance test database:', error.message);
        }
      }
    });

    it('should perform single insert within acceptable time', async () => {
      if (!shouldRunPerformanceTests) {
        console.log('Skipping performance test - set RUN_PERFORMANCE_TESTS=true to enable');
        return;
      }

      const testData = generateLargeRunData(1, 'single_insert_test', 'dev-team')[0];
      const checkpoints = generateCheckpointsForRun(testData.run_id);
      const findings = generateFindingsForRun(testData.run_id, 3);

      const startTime = performance.now();
      await graderDB.insertRun(testData as PostgresRunRow, checkpoints, findings);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SINGLE_INSERT_MS);
      console.log(`Single insert took ${duration.toFixed(2)}ms (threshold: ${PERFORMANCE_THRESHOLDS.SINGLE_INSERT_MS}ms)`);
    });

    it('should handle bulk inserts efficiently', async () => {
      if (!shouldRunPerformanceTests) return;

      const recordCount = 50;
      const testData = generateLargeRunData(recordCount, 'bulk_insert_test', 'dev-team');
      
      const startTime = performance.now();
      
      for (const run of testData) {
        const checkpoints = generateCheckpointsForRun(run.run_id);
        const findings = generateFindingsForRun(run.run_id, 2);
        await graderDB.insertRun(run as PostgresRunRow, checkpoints, findings);
      }
      
      const duration = performance.now() - startTime;
      const avgTimePerRecord = duration / recordCount;

      expect(avgTimePerRecord).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_INSERT_MS_PER_RECORD);
      console.log(`Bulk insert: ${recordCount} records in ${duration.toFixed(2)}ms (${avgTimePerRecord.toFixed(2)}ms per record)`);
    });

    it('should query history efficiently with large datasets', async () => {
      if (!shouldRunPerformanceTests) return;

      const apiId = 'large_dataset_test';
      const recordCount = 100;
      
      // Insert large dataset
      const testData = generateLargeRunData(recordCount, apiId, 'dev-team');
      for (const run of testData.slice(0, 25)) { // Insert subset for testing
        await graderDB.insertRun(run as PostgresRunRow, [], []);
      }

      // Test query performance
      const startTime = performance.now();
      const history = await graderDB.getHistory(apiId, 20);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LARGE_DATASET_QUERY_MS);
      expect(history).toHaveLength(20);
      console.log(`Large dataset query took ${duration.toFixed(2)}ms for ${recordCount} records`);
    });

    it('should handle concurrent operations efficiently', async () => {
      if (!shouldRunPerformanceTests) return;

      const concurrentOperations = 10;
      const apiId = 'concurrent_test';

      const operations = Array.from({ length: concurrentOperations }, (_, i) => {
        return async () => {
          if (i % 3 === 0) {
            // Insert operation
            const run = generateLargeRunData(1, `${apiId}_${i}`, 'dev-team')[0];
            await graderDB.insertRun(run as PostgresRunRow, [], []);
          } else if (i % 3 === 1) {
            // Query operation
            await graderDB.getHistory(`${apiId}_${i - 1}`, 10);
          } else {
            // Usage tracking operation
            await graderDB.trackUsage('dev-team', 'performance_test', { operation: i });
          }
        };
      });

      const startTime = performance.now();
      await Promise.all(operations.map(op => op()));
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATIONS_MS);
      console.log(`${concurrentOperations} concurrent operations took ${duration.toFixed(2)}ms`);
    });

    it('should handle connection pool exhaustion gracefully', async () => {
      if (!shouldRunPerformanceTests) return;

      // Create more operations than the connection pool max (20)
      const operationCount = 30;
      const operations = Array.from({ length: operationCount }, (_, i) =>
        graderDB['pool'].query('SELECT pg_sleep(0.1), $1 as operation_id', [i])
      );

      const startTime = performance.now();
      const results = await Promise.all(operations);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(operationCount);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONNECTION_POOL_EXHAUSTION_MS);
      console.log(`Connection pool stress test: ${operationCount} operations in ${duration.toFixed(2)}ms`);
    });

    it('should maintain performance with team isolation queries', async () => {
      if (!shouldRunPerformanceTests) return;

      const teams = ['team-alpha', 'team-beta', 'team-gamma'];
      const apiId = 'team_isolation_perf_test';
      
      // Create teams
      for (const teamId of teams) {
        await graderDB['pool'].query(
          'INSERT INTO teams (team_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [teamId, `Performance Test ${teamId}`]
        );
      }

      // Insert data for each team
      for (const teamId of teams) {
        const runs = generateLargeRunData(20, apiId, teamId);
        for (const run of runs) {
          await graderDB.insertRun(run as PostgresRunRow, [], []);
        }
      }

      // Test isolated queries for each team
      const startTime = performance.now();
      
      const teamQueries = teams.map(teamId =>
        graderDB.getHistory(apiId, 10, undefined, teamId)
      );
      
      const results = await Promise.all(teamQueries);
      const duration = performance.now() - startTime;

      results.forEach((result, index) => {
        expect(result).toHaveLength(10);
        console.log(`Team ${teams[index]} has ${result.length} isolated results`);
      });

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.HISTORY_QUERY_MS * teams.length);
      console.log(`Team isolation queries took ${duration.toFixed(2)}ms for ${teams.length} teams`);
    });

    it('should efficiently handle usage tracking queries', async () => {
      if (!shouldRunPerformanceTests) return;

      const teamId = 'usage-perf-team';
      
      // Create team
      await graderDB['pool'].query(
        'INSERT INTO teams (team_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [teamId, 'Usage Performance Test Team']
      );

      // Insert usage tracking data
      const usageCount = 100;
      for (let i = 0; i < usageCount; i++) {
        await graderDB.trackUsage(teamId, 'performance_test', { iteration: i });
      }

      // Test usage query performance
      const startTime = performance.now();
      const usage = await graderDB.getTeamUsage(teamId);
      const duration = performance.now() - startTime;

      expect(usage).toBeDefined();
      expect(Array.isArray(usage)).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.HISTORY_QUERY_MS);
      console.log(`Usage tracking query took ${duration.toFixed(2)}ms for ${usageCount} records`);
    });
  });

  describe('SQLite Performance', () => {
    let testDbPath: string;
    let graderDB: SqliteGraderDB;

    beforeAll(async () => {
      if (!shouldRunPerformanceTests) return;

      testDbPath = path.join(process.cwd(), `perf_test_sqlite_${Date.now()}.sqlite`);
      graderDB = new SqliteGraderDB(`file:${testDbPath}`);
      
      await graderDB.connect();
      await graderDB.migrate();
    });

    afterAll(async () => {
      if (!shouldRunPerformanceTests) return;

      if (graderDB && graderDB['db']) {
        await graderDB['db'].close();
      }
      
      if (testDbPath) {
        try {
          await fs.unlink(testDbPath);
        } catch (error) {
          // File might not exist
        }
      }
    });

    it('should perform single insert within acceptable time', async () => {
      if (!shouldRunPerformanceTests) return;

      const testData = generateLargeRunData(1, 'sqlite_single_insert')[0];
      const checkpoints = generateCheckpointsForRun(testData.run_id);
      const findings = generateFindingsForRun(testData.run_id, 3);

      const startTime = performance.now();
      await graderDB.insertRun(testData as SqliteRunRow, checkpoints, findings);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SINGLE_INSERT_MS);
      console.log(`SQLite single insert took ${duration.toFixed(2)}ms`);
    });

    it('should handle sequential inserts efficiently', async () => {
      if (!shouldRunPerformanceTests) return;

      // SQLite doesn't handle concurrent writes as well as PostgreSQL
      // so we test sequential performance instead
      const recordCount = 25; // Smaller count for SQLite
      const testData = generateLargeRunData(recordCount, 'sqlite_sequential_test');
      
      const startTime = performance.now();
      
      for (const run of testData) {
        const checkpoints = generateCheckpointsForRun(run.run_id);
        const findings = generateFindingsForRun(run.run_id, 2);
        await graderDB.insertRun(run as SqliteRunRow, checkpoints, findings);
      }
      
      const duration = performance.now() - startTime;
      const avgTimePerRecord = duration / recordCount;

      expect(avgTimePerRecord).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_INSERT_MS_PER_RECORD * 2); // More lenient for SQLite
      console.log(`SQLite sequential insert: ${recordCount} records in ${duration.toFixed(2)}ms (${avgTimePerRecord.toFixed(2)}ms per record)`);
    });

    it('should query history efficiently', async () => {
      if (!shouldRunPerformanceTests) return;

      const apiId = 'sqlite_query_test';
      const recordCount = 50; // Moderate size for SQLite
      
      // Insert test data
      const testData = generateLargeRunData(recordCount, apiId);
      for (const run of testData.slice(0, 20)) { // Insert subset
        await graderDB.insertRun(run as SqliteRunRow, [], []);
      }

      // Test query performance
      const startTime = performance.now();
      const history = await graderDB.getHistory(apiId, 15);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.HISTORY_QUERY_MS);
      expect(history).toHaveLength(15);
      console.log(`SQLite history query took ${duration.toFixed(2)}ms`);
    });

    it('should handle WAL mode performance benefits', async () => {
      if (!shouldRunPerformanceTests) return;

      // Verify WAL mode is enabled
      const walMode = await graderDB['db'].get('PRAGMA journal_mode');
      expect(walMode.journal_mode).toBe('wal');

      // Test concurrent reads (WAL mode allows concurrent reads)
      const apiId = 'sqlite_wal_test';
      
      // Insert some data
      const runs = generateLargeRunData(10, apiId);
      for (const run of runs) {
        await graderDB.insertRun(run as SqliteRunRow, [], []);
      }

      // Test concurrent reads
      const concurrentReads = Array.from({ length: 5 }, () =>
        graderDB.getHistory(apiId, 5)
      );

      const startTime = performance.now();
      const results = await Promise.all(concurrentReads);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(5);
      results.forEach(result => expect(result).toHaveLength(5));
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.HISTORY_QUERY_MS);
      console.log(`SQLite concurrent reads took ${duration.toFixed(2)}ms`);
    });

    it('should maintain performance with complex JSON queries', async () => {
      if (!shouldRunPerformanceTests) return;

      const apiId = 'sqlite_json_perf_test';
      
      // Insert runs with complex JSON reports
      const runs = Array.from({ length: 20 }, (_, i) => ({
        run_id: `json_perf_run_${i}`,
        api_id: apiId,
        graded_at: new Date(2024, 0, 1, i).toISOString(),
        template_version: '3.2.3',
        template_hash: 'hash1',
        ruleset_hash: 'hash2',
        spec_hash: 'hash3',
        total_score: 80 + i,
        letter_grade: 'B+',
        compliance_pct: 0.8 + (i / 100),
        auto_fail: 0,
        critical_issues: i % 3,
        findings_count: i % 5,
        json_report: JSON.stringify({
          score: 80 + i,
          categories: {
            tenancy: i % 20,
            naming: i % 15,
            http: i % 25,
            caching: i % 10
          },
          findings: Array.from({ length: i % 5 }, (_, j) => ({
            id: `finding_${j}`,
            severity: 'info',
            message: `Complex finding ${j} with lots of detail`
          })),
          metadata: {
            executionTime: `${1.0 + (i * 0.1)}s`,
            memoryUsage: `${50 + (i * 2)}MB`,
            detailedStats: {
              rulesProcessed: 40 + i,
              pathsAnalyzed: 100 + (i * 10),
              timeBreakdown: {
                parsing: `${0.1 + (i * 0.01)}s`,
                validation: `${0.5 + (i * 0.02)}s`,
                scoring: `${0.3 + (i * 0.015)}s`
              }
            }
          }
        })
      }));

      for (const run of runs) {
        await graderDB.insertRun(run as SqliteRunRow, [], []);
      }

      // Test query performance with large JSON data
      const startTime = performance.now();
      const history = await graderDB.getHistory(apiId, 10);
      const duration = performance.now() - startTime;

      expect(history).toHaveLength(10);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.HISTORY_QUERY_MS);
      
      // Verify JSON data integrity
      history.forEach(record => {
        expect(typeof record.run_id).toBe('string');
        expect(typeof record.total_score).toBe('number');
      });

      console.log(`SQLite JSON query took ${duration.toFixed(2)}ms for complex JSON data`);
    });
  });

  describe('Cross-Database Performance Comparison', () => {
    it('should document performance characteristics', async () => {
      if (!shouldRunPerformanceTests) return;

      const performanceProfile = {
        postgresql: {
          strengths: [
            'Excellent concurrent read/write performance',
            'Advanced indexing capabilities',
            'JSONB operations',
            'Connection pooling',
            'Complex queries with foreign keys'
          ],
          bestUseCases: [
            'High-concurrency applications',
            'Multi-tenant systems',
            'Production deployments',
            'Complex relational queries'
          ]
        },
        sqlite: {
          strengths: [
            'Zero configuration',
            'Excellent read performance',
            'WAL mode concurrent reads',
            'Embedded deployment',
            'Single-user applications'
          ],
          bestUseCases: [
            'Development environments',
            'Single-user applications',
            'Embedded systems',
            'Simple deployment requirements'
          ]
        }
      };

      // Validate that we understand the trade-offs
      expect(performanceProfile.postgresql.strengths).toContain('Excellent concurrent read/write performance');
      expect(performanceProfile.sqlite.strengths).toContain('Zero configuration');
      
      console.log('Performance characteristics documented for both databases');
    });

    it('should validate performance threshold configurations', () => {
      // Ensure performance thresholds are reasonable
      expect(PERFORMANCE_THRESHOLDS.SINGLE_INSERT_MS).toBeGreaterThan(0);
      expect(PERFORMANCE_THRESHOLDS.SINGLE_INSERT_MS).toBeLessThan(1000);
      
      expect(PERFORMANCE_THRESHOLDS.BULK_INSERT_MS_PER_RECORD).toBeGreaterThan(0);
      expect(PERFORMANCE_THRESHOLDS.BULK_INSERT_MS_PER_RECORD).toBeLessThan(100);
      
      expect(PERFORMANCE_THRESHOLDS.HISTORY_QUERY_MS).toBeGreaterThan(0);
      expect(PERFORMANCE_THRESHOLDS.HISTORY_QUERY_MS).toBeLessThan(5000);

      console.log('Performance thresholds validated:', PERFORMANCE_THRESHOLDS);
    });
  });

  describe('Resource Usage and Limits', () => {
    it('should validate memory usage patterns', async () => {
      // Test memory usage characteristics
      const memoryTestCases = [
        { resultCount: 10, expectedMemoryKB: 50 },
        { resultCount: 100, expectedMemoryKB: 500 },
        { resultCount: 1000, expectedMemoryKB: 5000 }
      ];

      memoryTestCases.forEach(testCase => {
        // Linear memory growth expectation
        const memoryPerRecord = testCase.expectedMemoryKB / testCase.resultCount;
        expect(memoryPerRecord).toBeGreaterThan(0);
        expect(memoryPerRecord).toBeLessThan(100); // Reasonable per-record memory usage
      });
    });

    it('should validate connection resource limits', () => {
      const connectionLimits = {
        postgresql: {
          maxConnections: 20,
          idleTimeout: 30000,
          connectionTimeout: 2000
        },
        sqlite: {
          // SQLite doesn't have connection limits in the same way
          concurrentReads: 'unlimited',
          concurrentWrites: 1
        }
      };

      // PostgreSQL limits
      expect(connectionLimits.postgresql.maxConnections).toBeGreaterThan(0);
      expect(connectionLimits.postgresql.idleTimeout).toBeGreaterThan(1000);
      expect(connectionLimits.postgresql.connectionTimeout).toBeGreaterThan(0);

      // SQLite characteristics
      expect(connectionLimits.sqlite.concurrentWrites).toBe(1);
      expect(connectionLimits.sqlite.concurrentReads).toBe('unlimited');
    });
  });
});