/**
 * Database Integration Tests - RED PHASE
 * These tests will initially FAIL as they test database integration functionality
 * Following TDD: Write failing tests to define expected database behavior
 */

import { createDatabaseTestContext, dbAssertions } from '../helpers/db-helpers';
import { MockGradingResultFactory, MockDbFactory } from '../helpers/mock-factories';
import * as pipeline from '../../src/app/pipeline';

describe('Database Integration Tests', () => {
  const { getHelper, getMockDb } = createDatabaseTestContext();

  describe('Grade and Record Integration', () => {
    test('should store complete grading result in database', async () => {
      // RED PHASE: Test complete database storage workflow
      const mockDb = getMockDb();
      const mockResult = MockGradingResultFactory.passingResult();

      // Mock the gradeContract function
      jest.spyOn(pipeline, 'gradeContract').mockResolvedValue(mockResult);

      const progressMock = jest.fn();

      const result = await pipeline.gradeAndRecord(
        { path: '/test/fixtures/valid-api.yaml' },
        { progress: progressMock }
      );

      // Should return run and API identifiers
      expect(result.runId).toMatch(/^run_[a-f0-9]{12}$/);
      expect(result.apiId).toMatch(/^urn:smackdab:api:[a-f0-9]{12}$/);

      // Should store run in database
      const storedRun = dbAssertions.expectRunStored(mockDb, result.runId, {
        api_id: result.apiId,
        total_score: mockResult.grade.total,
        letter_grade: mockResult.grade.letter,
        compliance_pct: mockResult.grade.compliancePct,
        auto_fail: mockResult.grade.autoFailTriggered ? 1 : 0,
        critical_issues: mockResult.grade.criticalIssues,
        findings_count: mockResult.findings.length
      });

      // Should store checkpoints
      const storedCheckpoints = dbAssertions.expectCheckpointsStored(
        mockDb, 
        result.runId, 
        mockResult.checkpoints.length
      );

      // Should store findings
      const storedFindings = dbAssertions.expectFindingsStored(
        mockDb, 
        result.runId, 
        mockResult.findings.length
      );

      // Verify JSON report is stored
      expect(storedRun.json_report).toBeDefined();
      const jsonReport = JSON.parse(storedRun.json_report);
      expect(jsonReport.grade).toEqual(mockResult.grade);
      expect(jsonReport.findings).toEqual(mockResult.findings);
    });

    test('should handle database transaction failures gracefully', async () => {
      // RED PHASE: Test database error handling
      const mockDb = getMockDb();
      
      // Mock insertRun to fail
      jest.spyOn(mockDb, 'insertRun').mockRejectedValue(new Error('Database constraint violation'));

      const progressMock = jest.fn();

      // Should propagate database errors
      await expect(
        pipeline.gradeAndRecord(
          { path: '/test/fixtures/valid-api.yaml' },
          { progress: progressMock }
        )
      ).rejects.toThrow('Database constraint violation');
    });

    test('should handle duplicate run IDs by retrying', async () => {
      // RED PHASE: Test duplicate handling
      const mockDb = getMockDb();
      
      // Seed database with existing run ID pattern
      await getHelper().seed({ apiId: 'test-api', runCount: 1 });
      
      const progressMock = jest.fn();

      const result = await pipeline.gradeAndRecord(
        { path: '/test/fixtures/valid-api.yaml' },
        { progress: progressMock }
      );

      // Should generate unique run ID despite existing data
      expect(result.runId).toMatch(/^run_[a-f0-9]{12}$/);
      
      // Should successfully store the run
      dbAssertions.expectRunStored(mockDb, result.runId);
    });
  });

  describe('API History Integration', () => {
    test('should retrieve paginated API grading history', async () => {
      // RED PHASE: Test history retrieval
      const mockDb = getMockDb();
      const apiId = 'test-api-history';
      
      // Seed database with history data
      await getHelper().seed({ 
        apiId, 
        runCount: 5, 
        withCheckpoints: true, 
        withFindings: true 
      });

      // Test history retrieval through MCP tool
      const history = await mockDb.getHistory(apiId, 3);

      // Should return requested number of results
      expect(history).toHaveLength(3);

      // Should be ordered by date descending (most recent first)
      expect(history[0].graded_at >= history[1].graded_at).toBe(true);
      expect(history[1].graded_at >= history[2].graded_at).toBe(true);

      // Should contain required fields
      history.forEach(run => {
        expect(run).toHaveProperty('run_id');
        expect(run).toHaveProperty('api_id', apiId);
        expect(run).toHaveProperty('graded_at');
        expect(run).toHaveProperty('total_score');
        expect(run).toHaveProperty('letter_grade');
      });
    });

    test('should filter history by date range', async () => {
      // RED PHASE: Test date filtering
      const mockDb = getMockDb();
      const apiId = 'test-api-filtered';
      
      // Seed with data across different dates
      const runs = [
        MockDbFactory.historyRow({
          api_id: apiId,
          run_id: 'run_old',
          graded_at: '2024-01-01T00:00:00.000Z'
        }),
        MockDbFactory.historyRow({
          api_id: apiId,
          run_id: 'run_recent',
          graded_at: '2024-01-15T00:00:00.000Z'
        })
      ];
      
      mockDb.seedData({ runs });

      // Filter to only recent results
      const recentHistory = await mockDb.getHistory(apiId, 10, '2024-01-10T00:00:00.000Z');

      expect(recentHistory).toHaveLength(1);
      expect(recentHistory[0].run_id).toBe('run_recent');
    });

    test('should handle empty history gracefully', async () => {
      // RED PHASE: Test empty result handling
      const mockDb = getMockDb();
      const nonExistentApiId = 'non-existent-api';

      const history = await mockDb.getHistory(nonExistentApiId);

      expect(history).toHaveLength(0);
      expect(Array.isArray(history)).toBe(true);
    });

    test('should enforce limit parameter correctly', async () => {
      // RED PHASE: Test pagination limits
      const mockDb = getMockDb();
      const apiId = 'test-api-limit';
      
      // Seed with more data than limit
      await getHelper().seed({ apiId, runCount: 10 });

      // Test various limits
      const limit3 = await mockDb.getHistory(apiId, 3);
      expect(limit3).toHaveLength(3);

      const limit1 = await mockDb.getHistory(apiId, 1);
      expect(limit1).toHaveLength(1);

      const limit0 = await mockDb.getHistory(apiId, 0);
      expect(limit0).toHaveLength(0);
    });
  });

  describe('Database Connection Management', () => {
    test('should handle database connection failures', async () => {
      // RED PHASE: Test connection error handling
      const mockDb = getMockDb();
      
      // Simulate connection failure
      jest.spyOn(mockDb, 'connect').mockRejectedValue(new Error('Connection refused'));

      // Database operations should fail appropriately
      await expect(mockDb.connect()).rejects.toThrow('Connection refused');
    });

    test('should handle database disconnection during operations', async () => {
      // RED PHASE: Test mid-operation disconnection
      const mockDb = getMockDb();
      
      // Disconnect the database
      await mockDb.disconnect();

      // Operations should fail with appropriate error
      await expect(mockDb.getHistory('test-api')).rejects.toThrow('Database not connected');
    });

    test('should require migration before operations', async () => {
      // RED PHASE: Test migration requirement
      const mockDb = getMockDb();
      
      // Reset to un-migrated state (this would be implementation-specific)
      await mockDb.disconnect();
      await mockDb.connect();
      // Skip migration intentionally

      // This test would verify that operations require migration
      // Implementation depends on actual migration tracking
    });
  });

  describe('Database Query Performance', () => {
    test('should handle large result sets efficiently', async () => {
      // RED PHASE: Test performance with large data
      const mockDb = getMockDb();
      const apiId = 'performance-test-api';
      
      // Seed with large dataset
      await getHelper().seed({ apiId, runCount: 100 });

      const startTime = Date.now();
      const history = await mockDb.getHistory(apiId, 20);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
      expect(history).toHaveLength(20);
    });

    test('should handle concurrent database operations', async () => {
      // RED PHASE: Test concurrent access
      const mockDb = getMockDb();
      const apiId = 'concurrent-test-api';

      // Perform multiple concurrent operations
      const operations = Array.from({ length: 5 }, (_, i) => 
        pipeline.gradeAndRecord(
          { path: `/test/fixtures/api-${i}.yaml` },
          { progress: jest.fn() }
        )
      );

      // All operations should complete successfully
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.runId).toMatch(/^run_[a-f0-9]{12}$/);
        dbAssertions.expectRunStored(mockDb, result.runId);
      });
    });
  });

  describe('Data Integrity', () => {
    test('should maintain referential integrity between runs, checkpoints, and findings', async () => {
      // RED PHASE: Test data relationships
      const mockDb = getMockDb();
      
      const progressMock = jest.fn();
      const result = await pipeline.gradeAndRecord(
        { path: '/test/fixtures/valid-api.yaml' },
        { progress: progressMock }
      );

      // Verify relationships
      const storedCheckpoints = await mockDb.getCheckpoints(result.runId);
      const storedFindings = await mockDb.getFindings(result.runId);

      // All checkpoints should reference the correct run
      storedCheckpoints.forEach(checkpoint => {
        expect(checkpoint.run_id).toBe(result.runId);
      });

      // All findings should reference the correct run
      storedFindings.forEach(finding => {
        expect(finding.run_id).toBe(result.runId);
      });
    });

    test('should handle data validation errors appropriately', async () => {
      // RED PHASE: Test data validation
      const mockDb = getMockDb();
      
      // Attempt to store invalid data
      const invalidRunData = {
        run_id: null, // Invalid: missing required field
        api_id: 'test-api',
        graded_at: 'invalid-date', // Invalid: bad date format
        total_score: 'not-a-number' // Invalid: should be number
      };

      await expect(
        mockDb.insertRun(invalidRunData, [], [])
      ).rejects.toThrow(); // Should throw validation error
    });
  });
});

// These tests will ALL FAIL initially - that's the RED phase of TDD
// They define the expected behavior for database integration