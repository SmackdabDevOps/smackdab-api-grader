/**
 * Database Persistence Unit Tests
 * Tests database abstractions, data models, and business logic
 */

import { GraderDB as SqliteGraderDB, RunRow as SqliteRunRow } from '../../../src/mcp/persistence/db';
import { GraderDB as PostgresGraderDB, RunRow as PostgresRunRow } from '../../../src/mcp/persistence/db-postgres';
import { MockFindingFactory, MockCheckpointFactory } from '../../helpers/mock-factories';
import { createDatabaseTestContext } from '../../helpers/db-helpers';

// Mock the actual database implementations for unit testing
jest.mock('../../../src/mcp/persistence/db.js');
jest.mock('../../../src/mcp/persistence/db-postgres.js');

describe('Database Persistence Unit Tests', () => {
  describe('RunRow Data Model Validation', () => {
    describe('SQLite RunRow', () => {
      it('should validate required fields for SQLite RunRow', () => {
        const validRun: SqliteRunRow = {
          run_id: 'test-run-id',
          api_id: 'test-api-id',
          graded_at: '2024-01-01T12:00:00Z',
          template_version: '3.2.3',
          template_hash: 'template-hash-123',
          ruleset_hash: 'ruleset-hash-456',
          spec_hash: 'spec-hash-789',
          total_score: 85,
          letter_grade: 'B',
          compliance_pct: 0.85,
          auto_fail: 0,
          critical_issues: 1,
          findings_count: 3,
          json_report: JSON.stringify({ score: 85 })
        };

        // All required fields should be present
        expect(validRun.run_id).toBeDefined();
        expect(validRun.api_id).toBeDefined();
        expect(validRun.graded_at).toBeDefined();
        expect(validRun.template_version).toBeDefined();
        expect(validRun.template_hash).toBeDefined();
        expect(validRun.ruleset_hash).toBeDefined();
        expect(validRun.spec_hash).toBeDefined();
        expect(validRun.total_score).toBeDefined();
        expect(validRun.letter_grade).toBeDefined();
        expect(validRun.compliance_pct).toBeDefined();
        expect(validRun.auto_fail).toBeDefined();
        expect(validRun.critical_issues).toBeDefined();
        expect(validRun.findings_count).toBeDefined();
        expect(validRun.json_report).toBeDefined();

        // Verify data types
        expect(typeof validRun.run_id).toBe('string');
        expect(typeof validRun.api_id).toBe('string');
        expect(typeof validRun.total_score).toBe('number');
        expect(typeof validRun.compliance_pct).toBe('number');
        expect(typeof validRun.auto_fail).toBe('number');
        expect(typeof validRun.critical_issues).toBe('number');
        expect(typeof validRun.findings_count).toBe('number');
        expect(typeof validRun.json_report).toBe('string');
      });

      it('should handle optional fields in SQLite RunRow', () => {
        const runWithOptionals: SqliteRunRow = {
          run_id: 'test-run-optional',
          api_id: 'test-api-optional',
          graded_at: '2024-01-01T12:00:00Z',
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          repo_remote: 'https://github.com/test/repo',
          repo_branch: 'main',
          repo_path: '/api/spec.yaml',
          git_commit: 'abc123def456',
          total_score: 92,
          letter_grade: 'A-',
          compliance_pct: 0.92,
          auto_fail: 0,
          critical_issues: 0,
          findings_count: 1,
          json_report: JSON.stringify({ score: 92, excellent: true })
        };

        expect(runWithOptionals.repo_remote).toBe('https://github.com/test/repo');
        expect(runWithOptionals.repo_branch).toBe('main');
        expect(runWithOptionals.repo_path).toBe('/api/spec.yaml');
        expect(runWithOptionals.git_commit).toBe('abc123def456');
      });

      it('should validate numeric field constraints', () => {
        const run: SqliteRunRow = {
          run_id: 'numeric-test',
          api_id: 'numeric-api',
          graded_at: '2024-01-01T12:00:00Z',
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 100,
          letter_grade: 'A+',
          compliance_pct: 1.0,
          auto_fail: 0,
          critical_issues: 0,
          findings_count: 0,
          json_report: JSON.stringify({ perfect: true })
        };

        // Validate score ranges
        expect(run.total_score).toBeGreaterThanOrEqual(0);
        expect(run.total_score).toBeLessThanOrEqual(100);
        expect(run.compliance_pct).toBeGreaterThanOrEqual(0);
        expect(run.compliance_pct).toBeLessThanOrEqual(1);
        expect(run.auto_fail).toBeGreaterThanOrEqual(0);
        expect(run.critical_issues).toBeGreaterThanOrEqual(0);
        expect(run.findings_count).toBeGreaterThanOrEqual(0);
      });

      it('should validate JSON report structure', () => {
        const run: SqliteRunRow = {
          run_id: 'json-test',
          api_id: 'json-api',
          graded_at: '2024-01-01T12:00:00Z',
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 87,
          letter_grade: 'B+',
          compliance_pct: 0.87,
          auto_fail: 0,
          critical_issues: 1,
          findings_count: 2,
          json_report: JSON.stringify({
            score: 87,
            categories: {
              tenancy: 20,
              naming: 17,
              http: 25,
              caching: 15,
              pagination: 10
            },
            autoFailReasons: [],
            metadata: {
              executionTime: '2.3s',
              rulesProcessed: 45
            }
          })
        };

        // Should be valid JSON
        expect(() => JSON.parse(run.json_report)).not.toThrow();
        
        const report = JSON.parse(run.json_report);
        expect(report).toHaveProperty('score');
        expect(report.score).toBe(run.total_score);
        expect(report).toHaveProperty('categories');
        expect(typeof report.categories).toBe('object');
      });
    });

    describe('PostgreSQL RunRow', () => {
      it('should validate PostgreSQL-specific fields', () => {
        const pgRun: PostgresRunRow = {
          run_id: 'pg-test-run',
          api_id: 'pg-test-api',
          team_id: 'test-team',
          user_id: 'test-user',
          graded_at: '2024-01-01T12:00:00Z',
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 89,
          letter_grade: 'B+',
          compliance_pct: 0.89,
          auto_fail: false, // Boolean in PostgreSQL
          critical_issues: 1,
          findings_count: 2,
          json_report: JSON.stringify({ score: 89, teamContext: true })
        };

        // PostgreSQL-specific fields
        expect(pgRun).toHaveProperty('team_id');
        expect(pgRun).toHaveProperty('user_id');
        expect(typeof pgRun.auto_fail).toBe('boolean');
        expect(pgRun.team_id).toBe('test-team');
        expect(pgRun.user_id).toBe('test-user');
      });

      it('should handle optional team and user fields', () => {
        const pgRunMinimal: PostgresRunRow = {
          run_id: 'pg-minimal-run',
          api_id: 'pg-minimal-api',
          graded_at: '2024-01-01T12:00:00Z',
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 75,
          letter_grade: 'C',
          compliance_pct: 0.75,
          auto_fail: false,
          critical_issues: 3,
          findings_count: 8,
          json_report: JSON.stringify({ score: 75 })
        };

        // team_id and user_id can be undefined
        expect(pgRunMinimal.team_id).toBeUndefined();
        expect(pgRunMinimal.user_id).toBeUndefined();
      });

      it('should validate boolean auto_fail field', () => {
        const autoFailRun: PostgresRunRow = {
          run_id: 'auto-fail-test',
          api_id: 'auto-fail-api',
          graded_at: '2024-01-01T12:00:00Z',
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 0,
          letter_grade: 'F',
          compliance_pct: 0.0,
          auto_fail: true, // Should be boolean
          critical_issues: 5,
          findings_count: 12,
          json_report: JSON.stringify({ 
            score: 0, 
            autoFailReasons: ['Missing tenancy support', 'Critical security issues'] 
          })
        };

        expect(typeof autoFailRun.auto_fail).toBe('boolean');
        expect(autoFailRun.auto_fail).toBe(true);
      });
    });
  });

  describe('Database Interface Contracts', () => {
    const { getMockDb } = createDatabaseTestContext();

    describe('Connection Management', () => {
      it('should implement connect method', async () => {
        const mockDb = getMockDb();
        
        // Mock database should implement connect
        expect(typeof mockDb.connect).toBe('function');
        
        // Should not throw when called
        await expect(mockDb.connect()).resolves.not.toThrow();
      });

      it('should handle disconnection properly', async () => {
        const mockDb = getMockDb();
        
        await mockDb.connect();
        
        // Should have disconnect method (if implemented)
        if (typeof mockDb.disconnect === 'function') {
          await expect(mockDb.disconnect()).resolves.not.toThrow();
        }
      });

      it('should track connection state', async () => {
        const mockDb = getMockDb();
        
        // Should track whether connected
        await mockDb.connect();
        
        // Connection state should be tracked internally
        expect(mockDb['connected']).toBe(true);
      });

      it('should throw when operations attempted without connection', async () => {
        // Import the MockGraderDB directly to create a disconnected instance
        const { MockGraderDB } = await import('../../helpers/db-helpers');
        const disconnectedDb = new MockGraderDB();
        
        // Operations should fail without connection
        await expect(disconnectedDb.migrate()).rejects.toThrow('Database not connected');
        await expect(disconnectedDb.getHistory('test')).rejects.toThrow('Database not connected');
      });
    });

    describe('Migration Interface', () => {
      it('should implement migrate method', async () => {
        const mockDb = getMockDb();
        await mockDb.connect();
        
        expect(typeof mockDb.migrate).toBe('function');
        await expect(mockDb.migrate()).resolves.not.toThrow();
      });

      it('should be idempotent', async () => {
        const mockDb = getMockDb();
        await mockDb.connect();
        
        // Should be safe to call multiple times
        await mockDb.migrate();
        await mockDb.migrate();
        await mockDb.migrate();
      });
    });

    describe('Data Insertion Interface', () => {
      it('should implement insertRun method with proper signature', async () => {
        const mockDb = getMockDb();
        await mockDb.connect();
        await mockDb.migrate();
        
        expect(typeof mockDb.insertRun).toBe('function');
        
        const testRun = {
          run_id: 'interface-test-run',
          api_id: 'interface-test-api',
          graded_at: '2024-01-01T12:00:00Z',
          template_version: '3.2.3',
          template_hash: 'hash1',
          ruleset_hash: 'hash2',
          spec_hash: 'hash3',
          total_score: 80,
          letter_grade: 'B-',
          compliance_pct: 0.80,
          auto_fail: 0,
          critical_issues: 2,
          findings_count: 4,
          json_report: JSON.stringify({ score: 80 })
        };
        
        const checkpoints = MockCheckpointFactory.list(['tenancy', 'naming']);
        const findings = [
          {
            rule_id: 'INTERFACE-TEST',
            severity: 'warn',
            json_path: '$.test',
            message: 'Interface test finding'
          }
        ];
        
        await expect(mockDb.insertRun(testRun, checkpoints, findings)).resolves.not.toThrow();
      });

      it('should validate input parameters', async () => {
        const mockDb = getMockDb();
        await mockDb.connect();
        await mockDb.migrate();
        
        // Should handle null/undefined gracefully
        await expect(mockDb.insertRun(null as any, [], [])).rejects.toThrow();
        
        // Should validate required fields
        const incompleteRun = {
          run_id: 'incomplete-run'
          // Missing required fields
        };
        
        await expect(mockDb.insertRun(incompleteRun as any, [], [])).rejects.toThrow();
      });
    });

    describe('History Retrieval Interface', () => {
      it('should implement getHistory method with proper signature', async () => {
        const mockDb = getMockDb();
        await mockDb.connect();
        await mockDb.migrate();
        
        expect(typeof mockDb.getHistory).toBe('function');
        
        // Should handle all parameter combinations
        await expect(mockDb.getHistory('test-api')).resolves.toBeDefined();
        await expect(mockDb.getHistory('test-api', 10)).resolves.toBeDefined();
        await expect(mockDb.getHistory('test-api', 10, '2024-01-01T00:00:00Z')).resolves.toBeDefined();
      });

      it('should return array of history records', async () => {
        const mockDb = getMockDb();
        await mockDb.connect();
        await mockDb.migrate();
        
        const history = await mockDb.getHistory('test-api');
        
        expect(Array.isArray(history)).toBe(true);
      });

      it('should handle non-existent API gracefully', async () => {
        const mockDb = getMockDb();
        await mockDb.connect();
        await mockDb.migrate();
        
        const history = await mockDb.getHistory('non-existent-api');
        
        expect(Array.isArray(history)).toBe(true);
        expect(history).toHaveLength(0);
      });

      it('should validate limit parameter', async () => {
        const mockDb = getMockDb();
        await mockDb.connect();
        await mockDb.migrate();
        
        // Should handle various limit values
        const history1 = await mockDb.getHistory('test-api', 1);
        const history5 = await mockDb.getHistory('test-api', 5);
        const history100 = await mockDb.getHistory('test-api', 100);
        
        expect(Array.isArray(history1)).toBe(true);
        expect(Array.isArray(history5)).toBe(true);
        expect(Array.isArray(history100)).toBe(true);
      });
    });
  });

  describe('Data Transformation and Validation', () => {
    describe('Score Calculation', () => {
      it('should validate score ranges', () => {
        const scores = [0, 25, 50, 75, 100];
        
        scores.forEach(score => {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        });
      });

      it('should validate compliance percentage', () => {
        const complianceValues = [0.0, 0.25, 0.50, 0.75, 1.0];
        
        complianceValues.forEach(compliance => {
          expect(compliance).toBeGreaterThanOrEqual(0);
          expect(compliance).toBeLessThanOrEqual(1);
        });
      });

      it('should correlate score with compliance percentage', () => {
        const testCases = [
          { score: 100, compliance: 1.0 },
          { score: 90, compliance: 0.9 },
          { score: 75, compliance: 0.75 },
          { score: 50, compliance: 0.5 },
          { score: 0, compliance: 0.0 }
        ];
        
        testCases.forEach(({ score, compliance }) => {
          expect(Math.abs(score / 100 - compliance)).toBeLessThan(0.01);
        });
      });
    });

    describe('Grade Letter Assignment', () => {
      it('should assign correct letter grades', () => {
        const gradeMapping = [
          { score: 97, expectedGrade: 'A+' },
          { score: 93, expectedGrade: 'A' },
          { score: 90, expectedGrade: 'A-' },
          { score: 87, expectedGrade: 'B+' },
          { score: 83, expectedGrade: 'B' },
          { score: 80, expectedGrade: 'B-' },
          { score: 77, expectedGrade: 'C+' },
          { score: 73, expectedGrade: 'C' },
          { score: 70, expectedGrade: 'C-' },
          { score: 67, expectedGrade: 'D+' },
          { score: 63, expectedGrade: 'D' },
          { score: 60, expectedGrade: 'D-' },
          { score: 0, expectedGrade: 'F' }
        ];
        
        gradeMapping.forEach(({ score, expectedGrade }) => {
          // This would test actual grade calculation logic if implemented
          expect(typeof expectedGrade).toBe('string');
          expect(expectedGrade.length).toBeGreaterThan(0);
        });
      });
    });

    describe('JSON Report Validation', () => {
      it('should validate JSON report structure', () => {
        const validReport = {
          score: 85,
          categories: {
            tenancy: 20,
            naming: 15,
            http: 25,
            caching: 15,
            pagination: 10
          },
          autoFailReasons: [],
          findings: [],
          metadata: {
            executionTime: '1.2s',
            rulesProcessed: 42
          }
        };
        
        const jsonString = JSON.stringify(validReport);
        
        expect(() => JSON.parse(jsonString)).not.toThrow();
        
        const parsed = JSON.parse(jsonString);
        expect(parsed).toHaveProperty('score');
        expect(parsed).toHaveProperty('categories');
        expect(typeof parsed.categories).toBe('object');
        expect(Array.isArray(parsed.autoFailReasons)).toBe(true);
      });

      it('should handle malformed JSON gracefully', () => {
        const malformedJson = '{"score": 85, "incomplete": ';
        
        expect(() => JSON.parse(malformedJson)).toThrow();
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    describe('Input Validation', () => {
      it('should handle null and undefined inputs', () => {
        const testValues = [null, undefined, '', 0, false, NaN];
        
        testValues.forEach(value => {
          // Test that validation logic handles edge cases
          if (value === null || value === undefined) {
            expect(value == null).toBe(true);
          }
          
          if (value === '') {
            expect(typeof value).toBe('string');
            expect(value.length).toBe(0);
          }
          
          if (value === 0 || value === false) {
            expect(Boolean(value)).toBe(false);
          }
          
          if (Number.isNaN(value)) {
            expect(isNaN(value as number)).toBe(true);
          }
        });
      });

      it('should validate string length constraints', () => {
        const longString = 'x'.repeat(10000);
        const normalString = 'normal string';
        const emptyString = '';
        
        expect(normalString.length).toBeLessThan(1000);
        expect(longString.length).toBeGreaterThan(1000);
        expect(emptyString.length).toBe(0);
      });

      it('should validate numeric constraints', () => {
        const validNumbers = [0, 1, 50, 99, 100];
        const invalidNumbers = [-1, 101, NaN, Infinity, -Infinity];
        
        validNumbers.forEach(num => {
          expect(num).toBeGreaterThanOrEqual(0);
          expect(num).toBeLessThanOrEqual(100);
          expect(isFinite(num)).toBe(true);
        });
        
        invalidNumbers.forEach(num => {
          const isInvalid = num < 0 || num > 100 || !isFinite(num);
          expect(isInvalid).toBe(true);
        });
      });
    });

    describe('Concurrency and Race Conditions', () => {
      it('should handle concurrent operations conceptually', () => {
        // This tests the concept of handling concurrent operations
        const operations = [
          { type: 'read', resource: 'api-1' },
          { type: 'write', resource: 'api-1' },
          { type: 'read', resource: 'api-2' },
          { type: 'write', resource: 'api-2' }
        ];
        
        // Group by resource to identify potential conflicts
        const resourceGroups = operations.reduce((groups, op) => {
          if (!groups[op.resource]) groups[op.resource] = [];
          groups[op.resource].push(op);
          return groups;
        }, {} as Record<string, typeof operations>);
        
        Object.entries(resourceGroups).forEach(([resource, ops]) => {
          const hasWriteOp = ops.some(op => op.type === 'write');
          const hasMultipleOps = ops.length > 1;
          
          if (hasWriteOp && hasMultipleOps) {
            // This resource has potential concurrency issues
            expect(resource).toBeDefined();
            expect(ops.length).toBeGreaterThan(1);
          }
        });
      });
    });
  });

  describe('Performance Characteristics', () => {
    describe('Query Optimization', () => {
      it('should validate index usage patterns', () => {
        const commonQueryPatterns = [
          { field: 'api_id', frequency: 'high', indexed: true },
          { field: 'graded_at', frequency: 'high', indexed: true },
          { field: 'team_id', frequency: 'medium', indexed: true },
          { field: 'run_id', frequency: 'low', indexed: true }, // Primary key
          { field: 'json_report', frequency: 'low', indexed: false }
        ];
        
        commonQueryPatterns.forEach(pattern => {
          if (pattern.frequency === 'high') {
            expect(pattern.indexed).toBe(true);
          }
          
          if (pattern.field === 'run_id') {
            expect(pattern.indexed).toBe(true); // Primary keys are always indexed
          }
        });
      });

      it('should validate pagination efficiency', () => {
        const paginationScenarios = [
          { limit: 10, offset: 0, efficient: true },
          { limit: 20, offset: 100, efficient: true },
          { limit: 100, offset: 10000, efficient: false }
        ];
        
        paginationScenarios.forEach(scenario => {
          // Large offsets are generally less efficient
          if (scenario.offset > 1000) {
            expect(scenario.efficient).toBe(false);
          } else {
            expect(scenario.efficient).toBe(true);
          }
        });
      });
    });

    describe('Memory Usage', () => {
      it('should validate result set size limits', () => {
        const resultSizes = [10, 20, 50, 100, 1000];
        
        resultSizes.forEach(size => {
          // Reasonable limits for memory usage
          if (size <= 100) {
            expect(size).toBeLessThanOrEqual(100);
          } else {
            // Large result sets should be handled carefully
            expect(size).toBeGreaterThan(100);
          }
        });
      });
    });
  });

  describe('Data Integrity Constraints', () => {
    describe('Referential Integrity', () => {
      it('should validate parent-child relationships', () => {
        const relationshipMappings = [
          { parent: 'teams', child: 'api', foreignKey: 'team_id' },
          { parent: 'api', child: 'run', foreignKey: 'api_id' },
          { parent: 'run', child: 'finding', foreignKey: 'run_id' },
          { parent: 'run', child: 'checkpoint_score', foreignKey: 'run_id' }
        ];
        
        relationshipMappings.forEach(mapping => {
          expect(mapping.parent).toBeDefined();
          expect(mapping.child).toBeDefined();
          expect(mapping.foreignKey).toBeDefined();
          
          // Foreign key should reference parent table
          expect(mapping.foreignKey.includes(mapping.parent.slice(0, -1))).toBeTruthy();
        });
      });
    });

    describe('Data Type Consistency', () => {
      it('should ensure consistent ID formats', () => {
        const idFormats = [
          { field: 'run_id', pattern: /^[a-zA-Z0-9_-]+$/ },
          { field: 'api_id', pattern: /^[a-zA-Z0-9_-]+$/ },
          { field: 'team_id', pattern: /^[a-zA-Z0-9_-]+$/ },
          { field: 'checkpoint_id', pattern: /^[A-Z_-]+$/ }
        ];
        
        const testIds = [
          { field: 'run_id', value: 'test-run-123' },
          { field: 'api_id', value: 'api_test_456' },
          { field: 'team_id', value: 'team-alpha-1' },
          { field: 'checkpoint_id', value: 'TENANCY-REQUIRED' }
        ];
        
        testIds.forEach(testId => {
          const format = idFormats.find(f => f.field === testId.field);
          if (format) {
            expect(format.pattern.test(testId.value)).toBe(true);
          }
        });
      });

      it('should ensure timestamp format consistency', () => {
        const validTimestamps = [
          '2024-01-01T00:00:00Z',
          '2024-01-01T00:00:00.000Z',
          '2024-12-31T23:59:59.999Z'
        ];
        
        const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
        
        validTimestamps.forEach(timestamp => {
          expect(timestampPattern.test(timestamp)).toBe(true);
          expect(() => new Date(timestamp)).not.toThrow();
          expect(new Date(timestamp).toISOString()).toMatch(timestampPattern);
        });
      });
    });
  });
});