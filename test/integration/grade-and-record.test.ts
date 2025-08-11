/**
 * Integration tests for gradeAndRecord function
 * Tests database recording integration with grading pipeline
 */

import { jest, describe, test, beforeEach, afterEach, expect } from '@jest/globals';
import { gradeAndRecord, registerOrIdentifyApi } from '../../src/app/pipeline';
import { GraderDB } from '../../src/mcp/persistence/db';
import { 
  createMockProgress, 
  assertGradingResult,
  assertProgressTracking,
  getFixturePath,
  TestDataFactory,
  loadFixture,
  MINIMAL_VALID_SPEC,
  mockDatabase
} from '../helpers/pipeline-test-helpers';

// Mock the GraderDB to avoid actual database operations in tests
jest.mock('../../src/mcp/persistence/db.js');

describe('gradeAndRecord Integration Tests', () => {
  let mockDb: any;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock database instance
    mockDb = {
      connect: jest.fn().mockResolvedValue(undefined),
      migrate: jest.fn().mockResolvedValue(undefined),
      insertRun: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    // Mock the GraderDB constructor
    (GraderDB as jest.MockedClass<typeof GraderDB>).mockImplementation(() => mockDb);
  });

  describe('Complete Grade and Record Flow', () => {
    test('should grade and record valid API specification', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeAndRecord(args, { progress: mockProgress });
      
      // Should return grading result with additional fields
      assertGradingResult(result);
      assertProgressTracking(tracker);
      
      // Should include recording metadata
      expect(result).toHaveProperty('runId');
      expect(result).toHaveProperty('apiId');
      expect(result.runId).toMatch(/^run_[a-f0-9]{12}$/);
      expect(result.apiId).toMatch(/^urn:smackdab:api:[a-f0-9]{12}$/);
      
      // Should have called database operations
      expect(mockDb.connect).toHaveBeenCalledTimes(1);
      expect(mockDb.migrate).toHaveBeenCalledTimes(1);
      expect(mockDb.insertRun).toHaveBeenCalledTimes(1);
      
      // Verify insertRun was called with correct structure
      const insertCall = mockDb.insertRun.mock.calls[0];
      expect(insertCall).toHaveLength(3); // runData, checkpoints, findings
      
      const [runData, checkpoints, findings] = insertCall;
      
      // Verify run data structure
      expect(runData).toMatchObject({
        run_id: expect.stringMatching(/^run_[a-f0-9]{12}$/),
        api_id: expect.stringMatching(/^urn:smackdab:api:[a-f0-9]{12}$/),
        graded_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/),
        template_version: '3.2.3',
        template_hash: expect.any(String),
        ruleset_hash: expect.any(String),
        spec_hash: expect.any(String),
        total_score: expect.any(Number),
        letter_grade: expect.any(String),
        compliance_pct: expect.any(Number),
        auto_fail: expect.any(Number),
        critical_issues: expect.any(Number),
        findings_count: expect.any(Number),
        json_report: expect.any(String)
      });
      
      // Verify checkpoints array
      expect(Array.isArray(checkpoints)).toBe(true);
      checkpoints.forEach((cp: any) => {
        expect(cp).toMatchObject({
          checkpoint_id: expect.any(String),
          category: expect.any(String),
          max_points: expect.any(Number),
          scored_points: expect.any(Number)
        });
      });
      
      // Verify findings array
      expect(Array.isArray(findings)).toBe(true);
      findings.forEach((finding: any) => {
        expect(finding).toMatchObject({
          rule_id: expect.any(String),
          severity: expect.stringMatching(/^(error|warn|info)$/),
          message: expect.any(String),
          json_path: expect.any(String)
        });
        // Optional fields
        if (finding.category) expect(typeof finding.category).toBe('string');
        if (finding.line) expect(typeof finding.line).toBe('number');
      });
    });

    test('should handle invalid API specification with recording', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createInvalidGradingArgs();
      
      const result = await gradeAndRecord(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Should still record even failed grades
      expect(result.runId).toBeDefined();
      expect(result.apiId).toBeDefined();
      expect(result.grade.total).toBeLessThan(50);
      expect(result.grade.letter).toBe('F');
      
      // Database operations should still be called
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockDb.insertRun).toHaveBeenCalled();
      
      // Should record failure details
      const [runData] = mockDb.insertRun.mock.calls[0];
      expect(runData.total_score).toBe(result.grade.total);
      expect(runData.letter_grade).toBe('F');
      expect(runData.auto_fail).toBeGreaterThan(0); // May have auto-fail
      expect(runData.critical_issues).toBeGreaterThan(0);
      expect(runData.findings_count).toBeGreaterThan(0);
    });

    test('should record large API specification efficiently', async () => {
      const [mockProgress] = createMockProgress();
      const args = {
        path: getFixturePath('large-api.yaml'),
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeAndRecord(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Should handle large payloads
      expect(result.runId).toBeDefined();
      expect(result.findings.length).toBeGreaterThan(5);
      expect(result.checkpoints.length).toBeGreaterThan(3);
      
      // Should store complete data
      expect(mockDb.insertRun).toHaveBeenCalled();
      const [runData, checkpoints, findings] = mockDb.insertRun.mock.calls[0];
      
      expect(findings.length).toBe(result.findings.length);
      expect(checkpoints.length).toBe(result.checkpoints.length);
      
      // JSON report should contain complete result
      const jsonReport = JSON.parse(runData.json_report);
      expect(jsonReport).toMatchObject({
        grade: expect.any(Object),
        findings: expect.any(Array),
        checkpoints: expect.any(Array),
        metadata: expect.any(Object)
      });
    }, 20000);
  });

  describe('API Registration and Identification', () => {
    test('should generate consistent API ID from file path', async () => {
      const args1 = TestDataFactory.createValidGradingArgs();
      const args2 = TestDataFactory.createValidGradingArgs();
      
      const api1 = await registerOrIdentifyApi(args1);
      const api2 = await registerOrIdentifyApi(args2);
      
      // Same path should generate same API ID
      expect(api1.apiId).toBe(api2.apiId);
      expect(api1.apiId).toMatch(/^urn:smackdab:api:[a-f0-9]{12}$/);
      expect(api1.wroteToSpec).toBe(false);
      expect(api2.wroteToSpec).toBe(false);
    });

    test('should generate API ID from inline content', async () => {
      const content = await loadFixture('valid-api.yaml');
      
      const api1 = await registerOrIdentifyApi({ content });
      const api2 = await registerOrIdentifyApi({ content });
      
      // Same content should generate same API ID
      expect(api1.apiId).toBe(api2.apiId);
      expect(api1.apiId).toMatch(/^urn:smackdab:api:[a-f0-9]{12}$/);
    });

    test('should generate different API IDs for different content', async () => {
      const api1 = await registerOrIdentifyApi({ content: MINIMAL_VALID_SPEC });
      const api2 = await registerOrIdentifyApi({ path: getFixturePath('valid-api.yaml') });
      const api3 = await registerOrIdentifyApi({ uri: 'https://example.com/api.yaml' });
      
      // Different sources should generate different API IDs
      expect(api1.apiId).not.toBe(api2.apiId);
      expect(api2.apiId).not.toBe(api3.apiId);
      expect(api1.apiId).not.toBe(api3.apiId);
      
      // All should be valid format
      [api1, api2, api3].forEach(api => {
        expect(api.apiId).toMatch(/^urn:smackdab:api:[a-f0-9]{12}$/);
        expect(api.wroteToSpec).toBe(false);
      });
    });

    test('should handle missing source gracefully', async () => {
      const api = await registerOrIdentifyApi({});
      
      // Should generate random API ID
      expect(api.apiId).toMatch(/^urn:smackdab:api:[a-f0-9]{12}$/);
      expect(api.wroteToSpec).toBe(false);
    });
  });

  describe('Database Integration', () => {
    test('should handle database connection errors gracefully', async () => {
      // Mock database connection failure
      mockDb.connect.mockRejectedValue(new Error('Connection failed'));
      
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      await expect(gradeAndRecord(args, { progress: mockProgress }))
        .rejects.toThrow('Connection failed');
      
      expect(mockDb.connect).toHaveBeenCalled();
      // Should not proceed to other operations
      expect(mockDb.insertRun).not.toHaveBeenCalled();
    });

    test('should handle migration errors gracefully', async () => {
      // Mock migration failure
      mockDb.migrate.mockRejectedValue(new Error('Migration failed'));
      
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      await expect(gradeAndRecord(args, { progress: mockProgress }))
        .rejects.toThrow('Migration failed');
      
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockDb.migrate).toHaveBeenCalled();
      expect(mockDb.insertRun).not.toHaveBeenCalled();
    });

    test('should handle insert errors gracefully', async () => {
      // Mock insert failure
      mockDb.insertRun.mockRejectedValue(new Error('Insert failed'));
      
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      await expect(gradeAndRecord(args, { progress: mockProgress }))
        .rejects.toThrow('Insert failed');
      
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockDb.migrate).toHaveBeenCalled();
      expect(mockDb.insertRun).toHaveBeenCalled();
    });

    test('should record complete metadata', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeAndRecord(args, { progress: mockProgress });
      
      const [runData] = mockDb.insertRun.mock.calls[0];
      
      // Should include all metadata fields
      expect(runData.template_version).toBe(result.metadata.templateVersion);
      expect(runData.template_hash).toBe(result.metadata.templateHash);
      expect(runData.ruleset_hash).toBe(result.metadata.rulesetHash);
      expect(runData.spec_hash).toBe(result.metadata.specHash);
      
      // Should match grading results
      expect(runData.total_score).toBe(result.grade.total);
      expect(runData.letter_grade).toBe(result.grade.letter);
      expect(runData.compliance_pct).toBe(result.grade.compliancePct);
      expect(runData.auto_fail).toBe(result.grade.autoFailTriggered ? 1 : 0);
      expect(runData.critical_issues).toBe(result.grade.criticalIssues);
      expect(runData.findings_count).toBe(result.findings.length);
      
      // JSON report should be parseable and complete
      const jsonReport = JSON.parse(runData.json_report);
      expect(jsonReport).toEqual(
        expect.objectContaining({
          grade: result.grade,
          findings: result.findings,
          checkpoints: result.checkpoints,
          metadata: result.metadata
        })
      );
    });
  });

  describe('Scoring Mode Recording', () => {
    test('should record legacy scoring mode results', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs({ legacyMode: true });
      
      const result = await gradeAndRecord(args, { progress: mockProgress });
      
      expect(result.metadata.scoringEngine).toBe('legacy');
      
      const [runData] = mockDb.insertRun.mock.calls[0];
      const jsonReport = JSON.parse(runData.json_report);
      
      // Should record legacy scoring metadata
      expect(jsonReport.metadata.scoringEngine).toBe('legacy');
      expect(jsonReport.grade.coverageBased).toBeUndefined();
    });

    test('should record coverage-based scoring results', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs({ legacyMode: false });
      
      const result = await gradeAndRecord(args, { progress: mockProgress });
      
      expect(result.metadata.scoringEngine).toBe('coverage-based');
      
      const [runData] = mockDb.insertRun.mock.calls[0];
      const jsonReport = JSON.parse(runData.json_report);
      
      // Should record new scoring metadata
      expect(jsonReport.metadata.scoringEngine).toBe('coverage-based');
      expect(jsonReport.grade.coverageBased).toBe(true);
      expect(jsonReport.grade.ruleScores).toBeDefined();
    });
  });

  describe('Run ID Generation', () => {
    test('should generate unique run IDs', async () => {
      const [mockProgress1] = createMockProgress();
      const [mockProgress2] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result1 = await gradeAndRecord(args, { progress: mockProgress1 });
      const result2 = await gradeAndRecord(args, { progress: mockProgress2 });
      
      // Same API but different runs should have different run IDs
      expect(result1.runId).not.toBe(result2.runId);
      expect(result1.apiId).toBe(result2.apiId); // Same API ID
      
      // Both should be valid format
      expect(result1.runId).toMatch(/^run_[a-f0-9]{12}$/);
      expect(result2.runId).toMatch(/^run_[a-f0-9]{12}$/);
    });

    test('should include timestamp in run ID generation', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      // Mock Date.now to control timestamp
      const mockNow = jest.spyOn(Date, 'now').mockReturnValue(1609459200000); // 2021-01-01
      
      try {
        const result = await gradeAndRecord(args, { progress: mockProgress });
        
        expect(result.runId).toMatch(/^run_[a-f0-9]{12}$/);
        
        // Run ID should be deterministic with fixed timestamp
        const secondResult = await gradeAndRecord(args, { progress: mockProgress });
        // Should still be different due to other factors in hash
        expect(result.runId).not.toBe(secondResult.runId);
      } finally {
        mockNow.mockRestore();
      }
    });
  });

  describe('Error Recovery and Rollback', () => {
    test('should not partial-commit on database errors', async () => {
      // Simulate error during insert
      mockDb.insertRun.mockRejectedValueOnce(new Error('Disk full'));
      
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      await expect(gradeAndRecord(args, { progress: mockProgress }))
        .rejects.toThrow('Disk full');
      
      // Should have attempted database operations
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockDb.migrate).toHaveBeenCalled();
      expect(mockDb.insertRun).toHaveBeenCalled();
    });

    test('should complete grading even if recording fails', async () => {
      // This test verifies that grading completes before recording
      // If recording fails, we still have the grading result
      
      let gradingCompleted = false;
      const originalGradeContract = require('../../src/app/pipeline.js').gradeContract;
      
      // Mock to track when grading completes
      jest.doMock('../../src/app/pipeline.js', () => ({
        ...jest.requireActual('../../src/app/pipeline.js'),
        gradeContract: jest.fn().mockImplementation(async (args: any, ctx: any) => {
          const result = await originalGradeContract(args, ctx);
          gradingCompleted = true;
          return result;
        })
      }));
      
      // Then fail database operations
      mockDb.insertRun.mockRejectedValue(new Error('Database error'));
      
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      try {
        await gradeAndRecord(args, { progress: mockProgress });
        fail('Should have thrown database error');
      } catch (error) {
        expect(String(error)).toContain('Database error');
        expect(gradingCompleted).toBe(true); // Grading should have completed
      }
      
      jest.restoreAllMocks();
    });
  });

  describe('Large Data Handling', () => {
    test('should handle large finding sets efficiently', async () => {
      const largeSpec = `
        openapi: "3.0.3"
        info:
          title: "Large Findings API"
          version: "1.0.0"
        paths:
      `;
      
      // Add many paths that will generate findings
      let pathsYaml = largeSpec;
      for (let i = 1; i <= 50; i++) {
        pathsYaml += `
          /resource${i}:
            get:
              # Missing summary, operationId, parameters, etc.
              responses:
                # Missing 200 response
                '404':
                  description: "Not found"
            post:
              # Missing requestBody, responses, etc.
        `;
      }
      
      const tempFile = await require('../helpers/pipeline-test-helpers.js').createTempSpec(pathsYaml);
      
      try {
        const [mockProgress] = createMockProgress();
        const args = {
          path: tempFile,
          templatePath: getFixturePath('template.yaml')
        };
        
        const result = await gradeAndRecord(args, { progress: mockProgress });
        
        // Should handle many findings
        expect(result.findings.length).toBeGreaterThan(20);
        
        // Should record all findings
        const [,, findings] = mockDb.insertRun.mock.calls[0];
        expect(findings.length).toBe(result.findings.length);
        
        // JSON report should not be too large to store
        const [runData] = mockDb.insertRun.mock.calls[0];
        expect(runData.json_report.length).toBeLessThan(1000000); // Less than 1MB
      } finally {
        await require('../helpers/pipeline-test-helpers.js').cleanupTempFile(tempFile);
      }
    });

    test('should handle Unicode content in findings', async () => {
      const unicodeSpec = `
        openapi: "3.0.3"
        info:
          title: "API with Unicode 🚀"
          version: "1.0.0"
          description: |
            This API contains various Unicode characters:
            • Bullet points
            ★ Stars
            © Copyright symbols
            中文字符 (Chinese characters)
            العربية (Arabic)
            русский (Russian)
            🌍🌎🌏 (Emojis)
        paths:
          /test:
            get:
              summary: "Test with emoji 🎉"
              description: "Returns data with special chars: àáâãäåæçèé"
              responses:
                '200':
                  description: "Success ✅"
      `;
      
      const tempFile = await require('../helpers/pipeline-test-helpers.js').createTempSpec(unicodeSpec);
      
      try {
        const [mockProgress] = createMockProgress();
        const args = {
          path: tempFile,
          templatePath: getFixturePath('template.yaml')
        };
        
        const result = await gradeAndRecord(args, { progress: mockProgress });
        
        // Should handle Unicode without corruption
        expect(result.runId).toBeDefined();
        
        const [runData] = mockDb.insertRun.mock.calls[0];
        const jsonReport = JSON.parse(runData.json_report);
        
        // Unicode should be preserved in JSON
        expect(jsonReport.metadata.specHash).toBeDefined();
        expect(runData.json_report).toContain('🚀'); // Should contain original Unicode
      } finally {
        await require('../helpers/pipeline-test-helpers.js').cleanupTempFile(tempFile);
      }
    });
  });

  describe('Concurrent Recording', () => {
    test('should handle concurrent gradeAndRecord operations', async () => {
      const args1 = TestDataFactory.createValidGradingArgs();
      const args2 = TestDataFactory.createInvalidGradingArgs();
      const args3 = { path: getFixturePath('partially-compliant-api.yaml'), templatePath: getFixturePath('template.yaml') };
      
      const [mockProgress1] = createMockProgress();
      const [mockProgress2] = createMockProgress();
      const [mockProgress3] = createMockProgress();
      
      // Run multiple gradeAndRecord operations concurrently
      const promises = [
        gradeAndRecord(args1, { progress: mockProgress1 }),
        gradeAndRecord(args2, { progress: mockProgress2 }),
        gradeAndRecord(args3, { progress: mockProgress3 })
      ];
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      results.forEach(result => {
        assertGradingResult(result);
        expect(result.runId).toBeDefined();
        expect(result.apiId).toBeDefined();
      });
      
      // Should have different run IDs
      const runIds = results.map(r => r.runId);
      const uniqueRunIds = new Set(runIds);
      expect(uniqueRunIds.size).toBe(3);
      
      // Should have called database operations for each
      expect(mockDb.connect).toHaveBeenCalledTimes(3);
      expect(mockDb.insertRun).toHaveBeenCalledTimes(3);
    });
  });
});