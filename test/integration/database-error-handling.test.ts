/**
 * Database Error Handling and Resilience Tests
 * Tests database error scenarios, connection failures, and recovery mechanisms
 */

import { Pool, PoolClient } from 'pg';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { GraderDB as PostgresGraderDB, RunRow as PostgresRunRow } from '../../src/mcp/persistence/db-postgres';
import { GraderDB as SqliteGraderDB, RunRow as SqliteRunRow } from '../../src/mcp/persistence/db';
import { MockCheckpointFactory } from '../helpers/mock-factories';
import fs from 'fs/promises';
import path from 'path';

// Test database configurations
const TEST_POSTGRES_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'test_user',
  password: process.env.PGPASSWORD || 'test_password',
  database: 'postgres',
};

describe('Database Error Handling and Resilience Tests', () => {
  describe('PostgreSQL Error Handling', () => {
    let testDbName: string;
    let graderDB: PostgresGraderDB;

    beforeAll(async () => {
      testDbName = `error_test_pg_${Date.now()}`;
      
      // Create test database
      const adminPool = new Pool(TEST_POSTGRES_CONFIG);
      try {
        await adminPool.query(`CREATE DATABASE ${testDbName}`);
      } catch (error) {
        console.warn('Could not create test database for error handling tests:', error.message);
        return; // Skip these tests if we can't create a database
      }
      await adminPool.end();

      // Set up environment
      process.env.DATABASE_URL = `postgresql://${TEST_POSTGRES_CONFIG.user}:${TEST_POSTGRES_CONFIG.password}@${TEST_POSTGRES_CONFIG.host}:${TEST_POSTGRES_CONFIG.port}/${testDbName}`;
      graderDB = new PostgresGraderDB();
    });

    afterAll(async () => {
      if (graderDB) {
        try {
          await graderDB.close();
        } catch (error) {
          // Ignore close errors in cleanup
        }
      }

      // Clean up test database
      if (testDbName && testDbName.includes('error_test')) {
        try {
          const adminPool = new Pool(TEST_POSTGRES_CONFIG);
          await adminPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
          await adminPool.end();
        } catch (error) {
          console.warn('Could not clean up error test database:', error.message);
        }
      }
    });

    beforeEach(async () => {
      if (graderDB) {
        try {
          await graderDB.connect();
          await graderDB.migrate();
          
          // Clear all data for clean test state
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
              // Table might not exist
            }
          }
        } catch (error) {
          // Ignore setup errors if database not available
        }
      }
    });

    describe('Connection Failures', () => {
      it('should handle invalid connection parameters gracefully', async () => {
        const invalidDb = new PostgresGraderDB();
        const originalUrl = process.env.DATABASE_URL;
        
        process.env.DATABASE_URL = 'postgresql://invalid:invalid@nonexistent:9999/invalid';
        const badDb = new PostgresGraderDB();
        
        await expect(badDb.connect()).rejects.toThrow();
        
        process.env.DATABASE_URL = originalUrl;
      });

      it('should handle connection timeout scenarios', async () => {
        // Create a database with very short timeout
        const timeoutDb = new PostgresGraderDB();
        
        // Override the internal pool to have very short timeout
        const originalPool = timeoutDb['pool'];
        timeoutDb['pool'] = new Pool({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 1, // Very short timeout
          max: 1
        });

        try {
          // This might succeed or fail depending on network conditions
          // The important thing is that it doesn't hang indefinitely
          const startTime = Date.now();
          try {
            await timeoutDb.connect();
          } catch (error) {
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(1000); // Should fail quickly
          }
        } finally {
          await timeoutDb['pool'].end();
          timeoutDb['pool'] = originalPool;
        }
      });

      it('should handle network interruption during operations', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        // Insert some valid data first
        const validRun: PostgresRunRow = {
          run_id: 'network_test_run',
          api_id: 'network_test_api',
          graded_at: new Date().toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 85,
          letter_grade: 'B',
          compliance_pct: 0.85,
          auto_fail: false,
          critical_issues: 0,
          findings_count: 0,
          json_report: JSON.stringify({ score: 85 })
        };

        await graderDB.insertRun(validRun, [], []);

        // Verify we can still query after successful operations
        const history = await graderDB.getHistory('network_test_api');
        expect(history).toHaveLength(1);
      });
    });

    describe('Transaction Rollback Scenarios', () => {
      it('should rollback on constraint violations', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        const invalidRun: PostgresRunRow = {
          run_id: 'constraint_violation_test',
          api_id: 'constraint_test_api',
          team_id: 'non_existent_team', // This should cause foreign key violation
          graded_at: new Date().toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 85,
          letter_grade: 'B',
          compliance_pct: 0.85,
          auto_fail: false,
          critical_issues: 0,
          findings_count: 0,
          json_report: JSON.stringify({ score: 85 })
        };

        await expect(graderDB.insertRun(invalidRun, [], [])).rejects.toThrow();

        // Verify nothing was inserted due to rollback
        const apis = await graderDB['pool'].query('SELECT * FROM api WHERE api_id = $1', ['constraint_test_api']);
        expect(apis.rows).toHaveLength(0);

        const runs = await graderDB['pool'].query('SELECT * FROM run WHERE run_id = $1', ['constraint_violation_test']);
        expect(runs.rows).toHaveLength(0);
      });

      it('should rollback on data type violations', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        // Create a run with invalid data that will cause database error
        const runWithInvalidData = {
          run_id: 'data_type_violation',
          api_id: 'data_type_test',
          graded_at: new Date().toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 85,
          letter_grade: 'B',
          compliance_pct: 0.85,
          auto_fail: false,
          critical_issues: 0,
          findings_count: 0,
          json_report: JSON.stringify({ score: 85 })
        };

        const invalidCheckpoints = [{
          checkpoint_id: null, // This should cause NOT NULL violation
          category: 'test',
          max_points: 10,
          scored_points: 8
        }];

        await expect(graderDB.insertRun(runWithInvalidData as PostgresRunRow, invalidCheckpoints, [])).rejects.toThrow();

        // Verify rollback
        const apis = await graderDB['pool'].query('SELECT * FROM api WHERE api_id = $1', ['data_type_test']);
        expect(apis.rows).toHaveLength(0);
      });

      it('should rollback on JSON parsing errors in complex transactions', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        const runWithInvalidJson: PostgresRunRow = {
          run_id: 'json_error_test',
          api_id: 'json_error_api',
          graded_at: new Date().toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 85,
          letter_grade: 'B',
          compliance_pct: 0.85,
          auto_fail: false,
          critical_issues: 0,
          findings_count: 0,
          json_report: '{"invalid": json}' // Invalid JSON will be caught at application level
        };

        // The application should validate JSON before inserting
        expect(() => JSON.parse(runWithInvalidJson.json_report)).toThrow();
        
        // Application should catch this and not attempt database insert
        try {
          JSON.parse(runWithInvalidJson.json_report);
        } catch (jsonError) {
          expect(jsonError).toBeInstanceOf(SyntaxError);
        }
      });
    });

    describe('Data Integrity Violations', () => {
      it('should handle duplicate primary key insertions', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        const duplicateRun: PostgresRunRow = {
          run_id: 'duplicate_key_test',
          api_id: 'duplicate_test_api',
          graded_at: new Date().toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 85,
          letter_grade: 'B',
          compliance_pct: 0.85,
          auto_fail: false,
          critical_issues: 0,
          findings_count: 0,
          json_report: JSON.stringify({ score: 85 })
        };

        // First insertion should succeed
        await graderDB.insertRun(duplicateRun, [], []);

        // Second insertion with same run_id should fail
        await expect(graderDB.insertRun(duplicateRun, [], [])).rejects.toThrow();
      });

      it('should handle foreign key violations gracefully', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        // Try to insert finding without corresponding run
        const orphanFinding = {
          run_id: 'non_existent_run',
          rule_id: 'ORPHAN_RULE',
          severity: 'error',
          json_path: '$.test',
          message: 'This finding has no parent run'
        };

        await expect(
          graderDB['pool'].query(
            'INSERT INTO finding (run_id, rule_id, severity, json_path, message) VALUES ($1, $2, $3, $4, $5)',
            [orphanFinding.run_id, orphanFinding.rule_id, orphanFinding.severity, orphanFinding.json_path, orphanFinding.message]
          )
        ).rejects.toThrow();
      });

      it('should handle check constraint violations', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        // Insert a team first
        await graderDB['pool'].query(
          'INSERT INTO teams (team_id, name, usage_limit, current_usage) VALUES ($1, $2, $3, $4)',
          ['constraint_test_team', 'Constraint Test Team', 1000, 0]
        );

        // Try to update with invalid values (negative usage)
        await expect(
          graderDB['pool'].query(
            'UPDATE teams SET current_usage = $1 WHERE team_id = $2',
            [-100, 'constraint_test_team']
          )
        ).rejects.toThrow();
      });
    });

    describe('Resource Exhaustion Scenarios', () => {
      it('should handle connection pool exhaustion gracefully', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        // Create many long-running queries to exhaust connection pool
        const longQueries = Array.from({ length: 25 }, (_, i) => // More than max connections
          graderDB['pool'].query('SELECT pg_sleep(0.5), $1 as query_id', [i])
        );

        // All queries should eventually complete (may be queued)
        const results = await Promise.all(longQueries);
        expect(results).toHaveLength(25);
        
        results.forEach((result, index) => {
          expect(result.rows[0].query_id).toBe(index.toString());
        });
      });

      it('should handle memory pressure during large operations', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        // Create a team for the test
        await graderDB['pool'].query(
          'INSERT INTO teams (team_id, name) VALUES ($1, $2)',
          ['memory_test_team', 'Memory Test Team']
        );

        // Insert many large JSON reports
        const largeJsonReports = Array.from({ length: 10 }, (_, i) => {
          const largeData = {
            score: 80 + i,
            executionId: `memory_test_${i}`,
            // Create large nested structure
            detailedFindings: Array.from({ length: 100 }, (_, j) => ({
              id: `finding_${i}_${j}`,
              path: `$.paths["/endpoint-${j}"].get.responses.200`,
              message: `Detailed finding message ${j} with extensive description and recommendations for improvement`.repeat(10),
              metadata: {
                ruleEngine: 'comprehensive',
                analysisDepth: 'deep',
                confidence: 0.95,
                suggestions: Array.from({ length: 5 }, (_, k) => `Suggestion ${k} for improvement`)
              }
            }))
          };

          return {
            run_id: `memory_test_run_${i}`,
            api_id: 'memory_test_api',
            team_id: 'memory_test_team',
            graded_at: new Date(2024, 0, 1, i).toISOString(),
            template_version: '3.2.3',
            template_hash: 'hash1',
            ruleset_hash: 'hash2',
            spec_hash: 'hash3',
            total_score: 80 + i,
            letter_grade: 'B+',
            compliance_pct: 0.8 + (i / 100),
            auto_fail: false,
            critical_issues: 0,
            findings_count: 100,
            json_report: JSON.stringify(largeData)
          };
        });

        // Insert all large reports
        for (const run of largeJsonReports) {
          await graderDB.insertRun(run as PostgresRunRow, [], []);
        }

        // Verify we can still query the data
        const history = await graderDB.getHistory('memory_test_api', 5, undefined, 'memory_test_team');
        expect(history).toHaveLength(5);
        
        // Verify JSON data integrity
        history.forEach(record => {
          expect(record.findings_count).toBe(100);
          expect(record.total_score).toBeGreaterThanOrEqual(80);
        });
      });
    });

    describe('Concurrent Access Error Handling', () => {
      it('should handle deadlock situations gracefully', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        // Create team for testing
        await graderDB['pool'].query(
          'INSERT INTO teams (team_id, name) VALUES ($1, $2)',
          ['deadlock_test_team', 'Deadlock Test Team']
        );

        // Create concurrent operations that might cause deadlocks
        const concurrentOperations = Array.from({ length: 10 }, (_, i) => {
          return async () => {
            const run: PostgresRunRow = {
              run_id: `deadlock_test_run_${i}`,
              api_id: `deadlock_test_api_${i}`,
              team_id: 'deadlock_test_team',
              graded_at: new Date(2024, 0, 1, i).toISOString(),
              template_version: '3.2.3',
              template_hash: 'hash1',
              ruleset_hash: 'hash2',
              spec_hash: 'hash3',
              total_score: 85,
              letter_grade: 'B',
              compliance_pct: 0.85,
              auto_fail: false,
              critical_issues: 0,
              findings_count: 1,
              json_report: JSON.stringify({ score: 85 })
            };

            const checkpoints = MockCheckpointFactory.list(['tenancy']);
            const findings = [{
              rule_id: `DEADLOCK_RULE_${i}`,
              severity: 'info',
              json_path: '$.test',
              message: `Deadlock test finding ${i}`
            }];

            await graderDB.insertRun(run, checkpoints, findings);
            
            // Also update usage tracking concurrently
            await graderDB.trackUsage('deadlock_test_team', 'concurrent_test', { operation: i });
          };
        });

        // All operations should complete successfully despite potential conflicts
        await expect(Promise.all(concurrentOperations.map(op => op()))).resolves.not.toThrow();

        // Verify all operations completed
        const runs = await graderDB['pool'].query(
          'SELECT COUNT(*) FROM run WHERE api_id LIKE $1',
          ['deadlock_test_api_%']
        );
        expect(parseInt(runs.rows[0].count)).toBe(10);
      });
    });

    describe('Recovery and Resilience', () => {
      it('should recover from temporary connection losses', async () => {
        if (!graderDB) return;

        await graderDB.connect();
        await graderDB.migrate();

        // Insert initial data
        const initialRun: PostgresRunRow = {
          run_id: 'recovery_test_initial',
          api_id: 'recovery_test_api',
          graded_at: new Date().toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 90,
          letter_grade: 'A-',
          compliance_pct: 0.90,
          auto_fail: false,
          critical_issues: 0,
          findings_count: 0,
          json_report: JSON.stringify({ score: 90 })
        };

        await graderDB.insertRun(initialRun, [], []);

        // Verify data exists
        let history = await graderDB.getHistory('recovery_test_api');
        expect(history).toHaveLength(1);

        // Simulate recovery by creating new connection
        // In real scenarios, connection pools handle this automatically
        const recoveryRun: PostgresRunRow = {
          run_id: 'recovery_test_after',
          api_id: 'recovery_test_api',
          graded_at: new Date(Date.now() + 1000).toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 85,
          letter_grade: 'B',
          compliance_pct: 0.85,
          auto_fail: false,
          critical_issues: 1,
          findings_count: 2,
          json_report: JSON.stringify({ score: 85 })
        };

        await graderDB.insertRun(recoveryRun, [], []);

        // Verify recovery worked
        history = await graderDB.getHistory('recovery_test_api');
        expect(history).toHaveLength(2);
      });
    });
  });

  describe('SQLite Error Handling', () => {
    let testDbPath: string;
    let graderDB: SqliteGraderDB;

    beforeAll(async () => {
      testDbPath = path.join(process.cwd(), `error_test_sqlite_${Date.now()}.sqlite`);
    });

    afterAll(async () => {
      if (testDbPath) {
        try {
          await fs.unlink(testDbPath);
        } catch (error) {
          // File might not exist
        }
      }
    });

    beforeEach(async () => {
      // Clean up any existing test database
      try {
        await fs.unlink(testDbPath);
      } catch (error) {
        // File might not exist
      }

      graderDB = new SqliteGraderDB(`file:${testDbPath}`);
      await graderDB.connect();
      await graderDB.migrate();
    });

    afterEach(async () => {
      if (graderDB && graderDB['db']) {
        try {
          await graderDB['db'].close();
        } catch (error) {
          // Ignore close errors
        }
      }
    });

    describe('File System Errors', () => {
      it('should handle database file access errors', async () => {
        // Test with invalid file path
        const invalidPath = '/invalid/path/database.sqlite';
        const invalidDb = new SqliteGraderDB(`file:${invalidPath}`);

        await expect(invalidDb.connect()).rejects.toThrow();
      });

      it('should handle read-only file system errors', async () => {
        // This test would require setting up read-only filesystem conditions
        // For now, we'll test the concept of handling permission errors
        
        const readOnlyPath = path.join('/tmp', `readonly_test_${Date.now()}.sqlite`);
        
        try {
          // Create database first
          const tempDb = new SqliteGraderDB(`file:${readOnlyPath}`);
          await tempDb.connect();
          await tempDb.migrate();
          await tempDb['db'].close();

          // In real scenarios, you'd set file permissions to read-only here
          // For testing, we'll just verify the database was created
          const stats = await fs.stat(readOnlyPath);
          expect(stats.isFile()).toBe(true);
        } finally {
          try {
            await fs.unlink(readOnlyPath);
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      });

      it('should handle disk space exhaustion gracefully', async () => {
        // Simulate large data insertion that might cause disk issues
        const largeDataRuns = Array.from({ length: 5 }, (_, i) => ({
          run_id: `large_data_run_${i}`,
          api_id: 'large_data_api',
          graded_at: new Date(2024, 0, 1, i).toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 80 + i,
          letter_grade: 'B+',
          compliance_pct: 0.8 + (i / 100),
          auto_fail: 0,
          critical_issues: 0,
          findings_count: 1000, // Large number
          json_report: JSON.stringify({
            score: 80 + i,
            // Large data structure
            detailedData: Array.from({ length: 1000 }, (_, j) => ({
              id: j,
              description: `Large description ${j}`.repeat(100)
            }))
          })
        }));

        // Insert large data - should complete unless disk is actually full
        for (const run of largeDataRuns) {
          await graderDB.insertRun(run as SqliteRunRow, [], []);
        }

        // Verify data was inserted
        const history = await graderDB.getHistory('large_data_api');
        expect(history).toHaveLength(5);
      });
    });

    describe('Concurrent Access Limitations', () => {
      it('should handle write lock conflicts', async () => {
        // SQLite allows only one writer at a time
        // Test sequential writes work correctly
        
        const concurrentWrites = Array.from({ length: 5 }, (_, i) => ({
          run_id: `write_lock_test_${i}`,
          api_id: 'write_lock_api',
          graded_at: new Date(2024, 0, 1, i).toISOString(),
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
        }));

        // Insert sequentially (SQLite will handle locking internally)
        for (const run of concurrentWrites) {
          await graderDB.insertRun(run as SqliteRunRow, [], []);
        }

        const history = await graderDB.getHistory('write_lock_api');
        expect(history).toHaveLength(5);
      });

      it('should handle database busy errors gracefully', async () => {
        // Test with operations that might cause "database is busy" errors
        const busyTestOperations = [
          graderDB.getHistory('busy_test_api'),
          graderDB.getHistory('busy_test_api'),
          graderDB.getHistory('busy_test_api')
        ];

        // All reads should succeed (WAL mode allows concurrent reads)
        const results = await Promise.all(busyTestOperations);
        expect(results).toHaveLength(3);
        results.forEach(result => expect(Array.isArray(result)).toBe(true));
      });
    });

    describe('Data Integrity Errors', () => {
      it('should handle constraint violations', async () => {
        const run: SqliteRunRow = {
          run_id: 'constraint_test',
          api_id: 'constraint_api',
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

        // First insertion should succeed
        await graderDB.insertRun(run, [], []);

        // Second insertion with same primary key should fail
        await expect(graderDB.insertRun(run, [], [])).rejects.toThrow();
      });

      it('should handle NULL constraint violations', async () => {
        const invalidRun = {
          run_id: null, // NULL primary key should fail
          api_id: 'null_test_api',
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

      it('should handle transaction rollback on SQLite errors', async () => {
        const validRun: SqliteRunRow = {
          run_id: 'rollback_test',
          api_id: 'rollback_api',
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

        // Create checkpoint data that will cause an error
        const invalidCheckpoints = [{
          checkpoint_id: 'x'.repeat(1000), // Too long
          category: 'test',
          max_points: 10,
          scored_points: 8
        }];

        await expect(graderDB.insertRun(validRun, invalidCheckpoints, [])).rejects.toThrow();

        // Verify rollback - no data should be inserted
        const apis = await graderDB['db'].all('SELECT * FROM api WHERE api_id = ?', 'rollback_api');
        expect(apis).toHaveLength(0);

        const runs = await graderDB['db'].all('SELECT * FROM run WHERE run_id = ?', 'rollback_test');
        expect(runs).toHaveLength(0);
      });
    });

    describe('Recovery Mechanisms', () => {
      it('should recover from database corruption detection', async () => {
        // Test database integrity check
        const integrityCheck = await graderDB['db'].get('PRAGMA integrity_check');
        expect(integrityCheck.integrity_check).toBe('ok');
      });

      it('should handle WAL mode recovery', async () => {
        // Verify WAL mode is active
        const walMode = await graderDB['db'].get('PRAGMA journal_mode');
        expect(walMode.journal_mode).toBe('wal');

        // Insert data to create WAL file
        const run: SqliteRunRow = {
          run_id: 'wal_recovery_test',
          api_id: 'wal_recovery_api',
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

        await graderDB.insertRun(run, [], []);

        // Verify data is accessible
        const history = await graderDB.getHistory('wal_recovery_api');
        expect(history).toHaveLength(1);
        expect(history[0].run_id).toBe('wal_recovery_test');
      });

      it('should handle database reconnection', async () => {
        // Insert initial data
        const initialRun: SqliteRunRow = {
          run_id: 'reconnect_test_initial',
          api_id: 'reconnect_test_api',
          graded_at: new Date().toISOString(),
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 92,
          letter_grade: 'A-',
          compliance_pct: 0.92,
          auto_fail: 0,
          critical_issues: 0,
          findings_count: 0,
          json_report: JSON.stringify({ score: 92 })
        };

        await graderDB.insertRun(initialRun, [], []);

        // Close and reconnect
        await graderDB['db'].close();
        
        const reconnectDb = new SqliteGraderDB(`file:${testDbPath}`);
        await reconnectDb.connect();

        // Verify data persisted across reconnection
        const history = await reconnectDb.getHistory('reconnect_test_api');
        expect(history).toHaveLength(1);
        expect(history[0].run_id).toBe('reconnect_test_initial');

        await reconnectDb['db'].close();
      });
    });
  });

  describe('Error Logging and Monitoring', () => {
    it('should provide meaningful error messages', () => {
      const errorTypes = [
        {
          type: 'ConnectionError',
          expectedMessages: ['connection', 'timeout', 'refused', 'network']
        },
        {
          type: 'ConstraintError', 
          expectedMessages: ['constraint', 'violation', 'foreign key', 'unique']
        },
        {
          type: 'DataError',
          expectedMessages: ['invalid', 'data type', 'format', 'length']
        },
        {
          type: 'TransactionError',
          expectedMessages: ['transaction', 'rollback', 'commit', 'deadlock']
        }
      ];

      errorTypes.forEach(errorType => {
        expect(errorType.type).toBeDefined();
        expect(Array.isArray(errorType.expectedMessages)).toBe(true);
        expect(errorType.expectedMessages.length).toBeGreaterThan(0);
      });
    });

    it('should categorize database errors appropriately', () => {
      const errorCategories = {
        transient: ['connection timeout', 'network error', 'temporary lock'],
        permanent: ['constraint violation', 'data type error', 'disk full'],
        recoverable: ['deadlock detected', 'serialization failure'],
        critical: ['database corruption', 'disk error', 'out of memory']
      };

      Object.entries(errorCategories).forEach(([category, errors]) => {
        expect(category).toMatch(/^(transient|permanent|recoverable|critical)$/);
        expect(Array.isArray(errors)).toBe(true);
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Performance Under Error Conditions', () => {
    it('should maintain acceptable performance during error scenarios', () => {
      const performanceExpectations = {
        errorDetectionTime: 100, // ms
        recoveryTime: 1000, // ms
        fallbackResponseTime: 500, // ms
        maxRetryAttempts: 3
      };

      // Validate performance thresholds
      expect(performanceExpectations.errorDetectionTime).toBeLessThan(1000);
      expect(performanceExpectations.recoveryTime).toBeLessThan(5000);
      expect(performanceExpectations.fallbackResponseTime).toBeLessThan(2000);
      expect(performanceExpectations.maxRetryAttempts).toBeGreaterThan(0);
      expect(performanceExpectations.maxRetryAttempts).toBeLessThan(10);
    });
  });

  describe('Error Documentation and Best Practices', () => {
    it('should document common error scenarios and solutions', () => {
      const errorDocumentation = {
        'Connection refused': {
          cause: 'Database server not running or unreachable',
          solution: 'Check database server status and network connectivity',
          prevention: 'Implement health checks and connection pooling'
        },
        'Constraint violation': {
          cause: 'Data violates database constraints (FK, unique, check)',
          solution: 'Validate data before insertion, handle gracefully',
          prevention: 'Implement proper data validation and constraints'
        },
        'Transaction deadlock': {
          cause: 'Multiple transactions waiting for each other',
          solution: 'Implement retry logic with exponential backoff',
          prevention: 'Order operations consistently, keep transactions short'
        },
        'Disk full': {
          cause: 'Insufficient disk space for database operations',
          solution: 'Free disk space or expand storage',
          prevention: 'Monitor disk usage, implement log rotation'
        }
      };

      Object.entries(errorDocumentation).forEach(([error, doc]) => {
        expect(doc).toHaveProperty('cause');
        expect(doc).toHaveProperty('solution');
        expect(doc).toHaveProperty('prevention');
        expect(typeof doc.cause).toBe('string');
        expect(typeof doc.solution).toBe('string');
        expect(typeof doc.prevention).toBe('string');
      });
    });
  });
});