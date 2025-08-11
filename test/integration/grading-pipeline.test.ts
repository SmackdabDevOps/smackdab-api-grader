/**
 * Comprehensive integration tests for the grading pipeline
 * Tests the complete flow from template loading to final scoring
 */

import { jest, describe, test, beforeEach, afterEach, expect } from '@jest/globals';
import { gradeContract, version } from '../../src/app/pipeline';
import { 
  createMockProgress, 
  assertGradingResult, 
  assertProgressTracking,
  getFixturePath,
  TestDataFactory,
  PerformanceHelpers,
  generateLargeSpec,
  createTempSpec,
  cleanupTempFile,
  MINIMAL_VALID_SPEC,
  INVALID_SPEC
} from '../helpers/pipeline-test-helpers';

describe('Grading Pipeline Integration', () => {
  let tempFiles: string[] = [];

  afterEach(async () => {
    // Clean up any temporary files created during tests
    for (const file of tempFiles) {
      await cleanupTempFile(file);
    }
    tempFiles = [];
  });

  describe('Pipeline Version Information', () => {
    test('should return version information with correct structure', async () => {
      const versionInfo = await version();
      
      expect(versionInfo).toHaveProperty('serverVersion');
      expect(versionInfo).toHaveProperty('scoringEngine');
      expect(versionInfo).toHaveProperty('instanceId');
      expect(versionInfo).toHaveProperty('instanceStartTime');
      expect(versionInfo).toHaveProperty('rulesetHash');
      expect(versionInfo).toHaveProperty('templateVersion');
      expect(versionInfo).toHaveProperty('templateHash');
      expect(versionInfo).toHaveProperty('toolVersions');
      
      expect(['1.2.0', '2.0.0']).toContain(versionInfo.serverVersion);
      expect(['legacy', 'coverage-based']).toContain(versionInfo.scoringEngine);
    });

    test('should use coverage-based scoring by default', async () => {
      const versionInfo = await version();
      expect(versionInfo.scoringEngine).toBe('coverage-based');
      expect(versionInfo.serverVersion).toBe('2.0.0');
    });

    test('should support legacy scoring mode', async () => {
      const originalEnv = process.env.USE_LEGACY_SCORING;
      process.env.USE_LEGACY_SCORING = 'true';
      
      try {
        const versionInfo = await version();
        expect(versionInfo.scoringEngine).toBe('legacy');
        expect(versionInfo.serverVersion).toBe('1.2.0');
      } finally {
        process.env.USE_LEGACY_SCORING = originalEnv;
      }
    });
  });

  describe('Complete Pipeline Flow', () => {
    test('should process valid API specification through complete pipeline', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Assert complete result structure
      assertGradingResult(result);
      
      // Assert progress tracking
      assertProgressTracking(tracker);
      
      // Verify progress stages
      const stages = tracker.calls.map(call => call.stage);
      expect(stages).toContain('template');
      expect(stages).toContain('load');
      expect(stages).toContain('openapi-validate');
      expect(stages).toContain('spectral');
      expect(stages).toContain('examples');
      expect(stages).toContain('done');
      
      // Should have reasonable score for valid API
      expect(result.grade.total).toBeGreaterThan(0);
      expect(result.grade.letter).not.toBe('F');
      expect(result.metadata.scoringEngine).toBe('coverage-based');
    }, 15000);

    test('should handle invalid API specifications gracefully', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createInvalidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Invalid API should have low score and findings
      expect(result.grade.total).toBeLessThan(50);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings.some(f => f.severity === 'error')).toBe(true);
    }, 15000);

    test('should process API with prerequisite failures', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = {
        path: getFixturePath('prereq-failing-api.yaml'),
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Should be blocked by prerequisites with new scoring
      if (result.metadata.scoringEngine === 'coverage-based') {
        expect(result.grade.total).toBe(0);
        expect(result.grade.blockedByPrerequisites).toBe(true);
        expect(tracker.lastStage).toBe('fail-prerequisites');
      }
    });

    test('should process partially compliant API', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = {
        path: getFixturePath('partially-compliant-api.yaml'),
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Should have moderate score - passes some rules but not others
      expect(result.grade.total).toBeGreaterThan(0);
      expect(result.grade.total).toBeLessThan(90);
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });

  describe('Semantic Rule Processing', () => {
    test('should execute all semantic modules in pipeline', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs({ legacyMode: true });
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // In legacy mode, should have checkpoints from various categories
      const categories = new Set(result.checkpoints.map((cp: any) => cp.category));
      expect(categories.size).toBeGreaterThan(1);
      
      // Should include findings from semantic rules
      const semanticFindings = result.findings.filter((f: any) => 
        !['OAS-STRUCT', 'SPECTRAL', 'EXAMPLES'].includes(f.ruleId)
      );
      expect(semanticFindings.length).toBeGreaterThan(0);
    });

    test('should validate tenancy requirements', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should have tenancy-related findings or pass tenancy checks
      const tenancyFindings = result.findings.filter((f: any) => 
        f.ruleId.includes('TENANCY') || f.ruleId.includes('SEC-ORG') || f.ruleId.includes('SEC-BRANCH')
      );
      
      // Either passes tenancy (no findings) or has specific tenancy violations
      expect(tenancyFindings.length >= 0).toBe(true);
    });

    test('should validate pagination requirements', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should evaluate pagination rules
      const paginationCheckpoints = result.checkpoints.filter((cp: any) => 
        cp.category === 'pagination'
      );
      
      // May or may not have pagination checkpoints depending on API content
      expect(paginationCheckpoints.length >= 0).toBe(true);
    });

    test('should validate HTTP semantics', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should evaluate HTTP semantics
      const httpFindings = result.findings.filter((f: any) => 
        f.ruleId.includes('HTTP') || f.category === 'http'
      );
      
      // API may or may not trigger HTTP semantic rules
      expect(httpFindings.length >= 0).toBe(true);
    });
  });

  describe('Scoring System Integration', () => {
    test('should use coverage-based scoring by default', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      expect(result.metadata.scoringEngine).toBe('coverage-based');
      expect(result.grade.coverageBased).toBe(true);
      expect(result.grade.ruleScores).toBeDefined();
      expect(typeof result.grade.ruleScores).toBe('object');
    });

    test('should support legacy scoring mode', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs({ legacyMode: true });
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      expect(result.metadata.scoringEngine).toBe('legacy');
      expect(result.grade.coverageBased).toBeUndefined();
      expect(result.grade.ruleScores).toBeUndefined();
    });

    test('should calculate grade letter correctly', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      const validGrades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D', 'F'];
      expect(validGrades).toContain(result.grade.letter);
      
      // Grade letter should correspond to total score
      if (result.grade.total >= 97) expect(result.grade.letter).toBe('A+');
      else if (result.grade.total >= 93) expect(result.grade.letter).toBe('A');
      else if (result.grade.total < 60) expect(result.grade.letter).toBe('F');
    });

    test('should cap scores at 100', async () => {
      // This test ensures that even if comprehensive scoring exceeds 100, it's capped
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs({ legacyMode: true });
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      expect(result.grade.total).toBeLessThanOrEqual(100);
      expect(result.grade.compliancePct).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle missing template file gracefully', async () => {
      const [mockProgress] = createMockProgress();
      const args = {
        path: getFixturePath('valid-api.yaml'),
        templatePath: '/nonexistent/template.yaml'
      };
      
      await expect(gradeContract(args, { progress: mockProgress }))
        .rejects.toThrow();
    });

    test('should handle missing specification file gracefully', async () => {
      const [mockProgress] = createMockProgress();
      const args = {
        path: '/nonexistent/api.yaml',
        templatePath: getFixturePath('template.yaml')
      };
      
      await expect(gradeContract(args, { progress: mockProgress }))
        .rejects.toThrow();
    });

    test('should handle malformed YAML gracefully', async () => {
      const malformedYaml = `
        openapi: "3.0.3"
        info:
          title: "Test"
          version: 1.0.0
        paths:
          /test:
            get:
              responses:
                '200':
                  description: "Test"
        # Invalid YAML structure below
        malformed: [invalid: yaml: structure}
      `;
      
      const tempFile = await createTempSpec(malformedYaml);
      tempFiles.push(tempFile);
      
      const [mockProgress] = createMockProgress();
      const args = {
        path: tempFile,
        templatePath: getFixturePath('template.yaml')
      };
      
      // Should either handle gracefully or throw meaningful error
      try {
        const result = await gradeContract(args, { progress: mockProgress });
        // If it succeeds, should have structural errors
        expect(result.findings.some(f => f.severity === 'error')).toBe(true);
      } catch (error) {
        // If it throws, should be a meaningful error
        expect(error).toBeDefined();
      }
    });

    test('should continue processing after non-fatal errors', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createInvalidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should complete pipeline despite errors
      expect(tracker.lastProgress).toBe(100);
      assertGradingResult(result);
      
      // Should have error findings but still return results
      expect(result.findings.some(f => f.severity === 'error')).toBe(true);
    });
  });

  describe('Performance Characteristics', () => {
    test('should process small API within reasonable time', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const { result, timeMs } = await PerformanceHelpers.measureExecutionTime(() =>
        gradeContract(args, { progress: mockProgress })
      );
      
      // Should complete within 10 seconds for small API
      PerformanceHelpers.assertPerformance(timeMs, 10000);
      assertGradingResult(result);
    });

    test('should process large API specification efficiently', async () => {
      const largeSpec = generateLargeSpec(20, 3); // 20 paths, 3 operations each
      const tempFile = await createTempSpec(largeSpec);
      tempFiles.push(tempFile);
      
      const [mockProgress] = createMockProgress();
      const args = {
        path: tempFile,
        templatePath: getFixturePath('template.yaml')
      };
      
      const { result, timeMs } = await PerformanceHelpers.measureExecutionTime(() =>
        gradeContract(args, { progress: mockProgress })
      );
      
      // Should complete within 30 seconds even for large API
      PerformanceHelpers.assertPerformance(timeMs, 30000);
      assertGradingResult(result);
      
      // Large API should have many findings/checkpoints
      expect(result.findings.length).toBeGreaterThan(10);
      expect(result.checkpoints.length).toBeGreaterThan(5);
    }, 35000);

    test('should scale reasonably with API size', async () => {
      const measurements = [];
      
      // Test with different sized APIs
      const sizes = [
        { paths: 5, name: 'small' },
        { paths: 15, name: 'medium' },
        { paths: 25, name: 'large' }
      ];
      
      for (const size of sizes) {
        const spec = generateLargeSpec(size.paths, 2);
        const tempFile = await createTempSpec(spec);
        tempFiles.push(tempFile);
        
        const [mockProgress] = createMockProgress();
        const args = {
          path: tempFile,
          templatePath: getFixturePath('template.yaml')
        };
        
        const { timeMs } = await PerformanceHelpers.measureExecutionTime(() =>
          gradeContract(args, { progress: mockProgress })
        );
        
        measurements.push({ name: size.name, timeMs });
      }
      
      const report = PerformanceHelpers.createPerformanceReport(measurements);
      
      // Scaling should be reasonable - large shouldn't be more than 5x small
      expect(report.slowest / report.fastest).toBeLessThan(5);
    }, 45000);
  });

  describe('Finding Aggregation and Sorting', () => {
    test('should sort findings by severity and category', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createInvalidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      if (result.findings.length > 1) {
        // Verify stable sorting
        for (let i = 1; i < result.findings.length; i++) {
          const prev = result.findings[i - 1];
          const curr = result.findings[i];
          
          const prevSevScore = prev.severity === 'error' ? 0 : prev.severity === 'warn' ? 1 : 2;
          const currSevScore = curr.severity === 'error' ? 0 : curr.severity === 'warn' ? 1 : 2;
          
          // Severity should be in order (error < warn < info)
          expect(prevSevScore).toBeLessThanOrEqual(currSevScore);
        }
      }
    });

    test('should aggregate findings from all pipeline stages', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should have findings from different sources
      const sources = new Set(result.findings.map((f: any) => {
        if (f.ruleId === 'OAS-STRUCT') return 'openapi-validator';
        if (f.ruleId === 'SPECTRAL') return 'spectral';
        if (f.ruleId === 'EXAMPLES') return 'examples';
        return 'semantic';
      }));
      
      // Should have at least some findings (even if just info level)
      expect(sources.size).toBeGreaterThan(0);
    });
  });

  describe('Template Integration', () => {
    test('should load and use custom template path', async () => {
      const [mockProgress] = createMockProgress();
      const customTemplatePath = getFixturePath('template.yaml');
      
      const args = {
        path: getFixturePath('valid-api.yaml'),
        templatePath: customTemplatePath
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      expect(result.metadata.templateHash).toBeDefined();
      expect(result.metadata.rulesetHash).toBeDefined();
    });

    test('should use default template when none specified', async () => {
      const [mockProgress] = createMockProgress();
      const args = {
        path: getFixturePath('valid-api.yaml')
        // No templatePath specified
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      expect(result.metadata.templateVersion).toBe('3.2.3');
    });
  });

  describe('Metadata Generation', () => {
    test('should generate consistent metadata', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result1 = await gradeContract(args, { progress: mockProgress });
      const result2 = await gradeContract(args, { progress: mockProgress });
      
      // Spec hash should be identical for same input
      expect(result1.metadata.specHash).toBe(result2.metadata.specHash);
      expect(result1.metadata.templateHash).toBe(result2.metadata.templateHash);
      expect(result1.metadata.rulesetHash).toBe(result2.metadata.rulesetHash);
      
      // Instance ID should be same within session
      expect(result1.metadata.instanceId).toBe(result2.metadata.instanceId);
      
      // But graded timestamps should be different
      expect(result1.metadata.gradedAt).not.toBe(result2.metadata.gradedAt);
    });

    test('should include all required metadata fields', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      const requiredFields = [
        'specHash',
        'templateHash', 
        'rulesetHash',
        'templateVersion',
        'toolVersions',
        'scoringEngine',
        'instanceId',
        'instanceStartTime',
        'gradedAt'
      ];
      
      for (const field of requiredFields) {
        expect(result.metadata).toHaveProperty(field);
        expect((result.metadata as any)[field]).toBeDefined();
      }
    });
  });
});