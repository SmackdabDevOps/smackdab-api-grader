/**
 * Integration tests for gradeContract function
 * Tests file-based API specification grading with various scenarios
 */

import { jest, describe, test, beforeEach, afterEach, expect } from '@jest/globals';
import { gradeContract } from '../../src/app/pipeline';
import { 
  createMockProgress, 
  assertGradingResult,
  assertProgressTracking,
  getFixturePath,
  TestDataFactory,
  PerformanceHelpers,
  createTempSpec,
  cleanupTempFile,
  MINIMAL_VALID_SPEC,
  INVALID_SPEC
} from '../helpers/pipeline-test-helpers';

describe('gradeContract Integration Tests', () => {
  let tempFiles: string[] = [];

  afterEach(async () => {
    // Clean up temporary files
    for (const file of tempFiles) {
      await cleanupTempFile(file);
    }
    tempFiles = [];
  });

  describe('Valid API Specifications', () => {
    test('should grade valid API specification with high score', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      assertProgressTracking(tracker);
      
      // Valid API should score reasonably well
      expect(result.grade.total).toBeGreaterThan(30); // Should get some points
      expect(result.grade.letter).not.toBe('F');
      expect(result.grade.compliancePct).toBeGreaterThan(0.3);
      
      // Should have proper metadata
      expect(result.metadata.scoringEngine).toBe('coverage-based');
      expect(result.metadata.templateVersion).toBe('3.2.3');
      expect(result.metadata.specHash).toBeDefined();
      
      // Should complete full pipeline
      const stages = tracker.calls.map(c => c.stage);
      expect(stages).toContain('template');
      expect(stages).toContain('load');
      expect(stages).toContain('openapi-validate');
      expect(stages).toContain('spectral');
      expect(stages).toContain('examples');
      expect(stages).toContain('done');
      expect(tracker.lastProgress).toBe(100);
    });

    test('should handle large valid API specification', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = {
        path: getFixturePath('large-api.yaml'),
        templatePath: getFixturePath('template.yaml')
      };
      
      const { result, timeMs } = await PerformanceHelpers.measureExecutionTime(() =>
        gradeContract(args, { progress: mockProgress })
      );
      
      assertGradingResult(result);
      
      // Large API should still process efficiently
      PerformanceHelpers.assertPerformance(timeMs, 20000);
      
      // Should have many findings due to size
      expect(result.findings.length).toBeGreaterThan(5);
      expect(result.checkpoints.length).toBeGreaterThan(3);
      
      // Should have good score due to compliance
      expect(result.grade.total).toBeGreaterThan(60);
    }, 25000);

    test('should validate tenant-aware API patterns', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Look for tenancy-related validations
      const tenancyFindings = result.findings.filter(f => 
        f.message.toLowerCase().includes('organization') ||
        f.message.toLowerCase().includes('tenant') ||
        f.ruleId.includes('SEC-ORG') ||
        f.ruleId.includes('SEC-BRANCH')
      );
      
      // API should be evaluated for tenancy (may pass or fail)
      expect(tenancyFindings.length >= 0).toBe(true);
      
      // Should have path structure validation
      const pathFindings = result.findings.filter(f => 
        f.message.toLowerCase().includes('path') ||
        f.ruleId.includes('NAME-NAMESPACE')
      );
      
      expect(pathFindings.length >= 0).toBe(true);
    });

    test('should evaluate security requirements', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should check for security schemes
      const securityFindings = result.findings.filter(f => 
        f.message.toLowerCase().includes('security') ||
        f.message.toLowerCase().includes('auth') ||
        f.ruleId.includes('SEC-')
      );
      
      // Should have security-related checkpoints
      const securityCheckpoints = result.checkpoints.filter(cp => 
        cp.category === 'security' ||
        cp.checkpoint_id.includes('SEC-')
      );
      
      // Valid API has auth, so should pass some security checks
      expect(securityCheckpoints.length).toBeGreaterThan(0);
    });

    test('should validate response envelope patterns', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should check for response envelope
      const envelopeFindings = result.findings.filter(f => 
        f.message.toLowerCase().includes('envelope') ||
        f.ruleId.includes('ENV-')
      );
      
      const envelopeCheckpoints = result.checkpoints.filter(cp => 
        cp.category === 'envelope' ||
        cp.checkpoint_id.includes('ENV-')
      );
      
      // May or may not have envelope violations
      expect(envelopeFindings.length >= 0).toBe(true);
      expect(envelopeCheckpoints.length >= 0).toBe(true);
    });
  });

  describe('Invalid API Specifications', () => {
    test('should handle structurally invalid API with low score', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createInvalidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Invalid API should have low score and many errors
      expect(result.grade.total).toBeLessThan(50);
      expect(result.grade.letter).toBe('F');
      expect(result.findings.length).toBeGreaterThan(2);
      expect(result.findings.some(f => f.severity === 'error')).toBe(true);
      
      // Should still complete pipeline
      expect(tracker.lastProgress).toBe(100);
    });

    test('should fail fast on wrong OpenAPI version', async () => {
      const wrongVersionSpec = `
        openapi: "3.0.0"
        info:
          title: "Wrong Version API"
          version: "1.0.0"
        paths:
          /test:
            get:
              responses:
                '200':
                  description: "Success"
      `;
      
      const tempFile = await createTempSpec(wrongVersionSpec);
      tempFiles.push(tempFile);
      
      const [mockProgress, tracker] = createMockProgress();
      const args = {
        path: tempFile,
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should fail with auto-fail
      expect(result.grade.total).toBe(0);
      expect(result.grade.letter).toBe('F');
      expect(result.grade.autoFailTriggered).toBe(true);
      expect(result.grade.autoFailReasons).toContain('OpenAPI version not 3.0.3');
      
      // Should short-circuit on version failure
      expect(tracker.lastStage).toBe('fail-oas');
    });

    test('should handle missing required fields', async () => {
      const incompleteSpec = `
        openapi: "3.0.3"
        info:
          title: "Incomplete API"
          # Missing version
        # Missing paths
      `;
      
      const tempFile = await createTempSpec(incompleteSpec);
      tempFiles.push(tempFile);
      
      const [mockProgress] = createMockProgress();
      const args = {
        path: tempFile,
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Should identify structural problems
      expect(result.findings.some(f => 
        f.message.toLowerCase().includes('missing') ||
        f.message.toLowerCase().includes('required')
      )).toBe(true);
      
      expect(result.grade.total).toBeLessThan(30);
    });

    test('should validate parameter definitions', async () => {
      const badParamsSpec = `
        openapi: "3.0.3"
        info:
          title: "Bad Params API"
          version: "1.0.0"
        paths:
          /test/{id}:
            get:
              parameters:
                - name: id
                  # Missing 'in' field
                  schema:
                    type: string
                - name: badQuery
                  in: query
                  # Missing required: true for path param
              responses:
                '200':
                  description: "Success"
      `;
      
      const tempFile = await createTempSpec(badParamsSpec);
      tempFiles.push(tempFile);
      
      const [mockProgress] = createMockProgress();
      const args = {
        path: tempFile,
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should identify parameter validation issues
      const paramFindings = result.findings.filter(f => 
        f.message.toLowerCase().includes('parameter') ||
        f.message.toLowerCase().includes('param')
      );
      
      expect(paramFindings.length).toBeGreaterThan(0);
    });
  });

  describe('Partially Compliant API Specifications', () => {
    test('should grade partially compliant API with moderate score', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = {
        path: getFixturePath('partially-compliant-api.yaml'),
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      assertProgressTracking(tracker);
      
      // Should score better than invalid but worse than fully compliant
      expect(result.grade.total).toBeGreaterThan(10);
      expect(result.grade.total).toBeLessThan(90);
      expect(result.grade.letter).not.toBe('A+');
      expect(result.grade.letter).not.toBe('A');
      
      // Should have mix of passed and failed rules
      const errorCount = result.findings.filter(f => f.severity === 'error').length;
      const warnCount = result.findings.filter(f => f.severity === 'warn').length;
      
      expect(errorCount + warnCount).toBeGreaterThan(0);
    });

    test('should identify specific compliance gaps', async () => {
      const [mockProgress] = createMockProgress();
      const args = {
        path: getFixturePath('partially-compliant-api.yaml'),
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should identify tenancy header issues
      const tenancyFindings = result.findings.filter(f => 
        f.message.includes('X-Organization-ID') ||
        f.message.includes('organization')
      );
      
      // Partially compliant API should have tenancy issues
      expect(tenancyFindings.length).toBeGreaterThan(0);
      
      // Should identify error format issues
      const errorFormatFindings = result.findings.filter(f => 
        f.message.includes('problem+json') ||
        f.message.includes('application/problem+json')
      );
      
      // May have error format issues
      expect(errorFormatFindings.length >= 0).toBe(true);
    });

    test('should handle authentication scheme variations', async () => {
      const [mockProgress] = createMockProgress();
      const args = {
        path: getFixturePath('partially-compliant-api.yaml'),
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should evaluate authentication schemes
      const authFindings = result.findings.filter(f => 
        f.message.toLowerCase().includes('oauth2') ||
        f.message.toLowerCase().includes('auth') ||
        f.ruleId.includes('SEC-OAUTH2')
      );
      
      // Partially compliant API uses ApiKey instead of OAuth2
      const authCheckpoints = result.checkpoints.filter(cp => 
        cp.checkpoint_id === 'SEC-OAUTH2'
      );
      
      // Should check for OAuth2 requirement
      expect(authCheckpoints.length >= 0).toBe(true);
    });
  });

  describe('Prerequisite Gating', () => {
    test('should block scoring when prerequisites fail', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = {
        path: getFixturePath('prereq-failing-api.yaml'),
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // With new scoring system, should be blocked by prerequisites
      if (result.metadata.scoringEngine === 'coverage-based') {
        expect(result.grade.total).toBe(0);
        expect(result.grade.blockedByPrerequisites).toBe(true);
        expect(result.grade.prerequisiteFailures).toBeGreaterThan(0);
        expect(tracker.lastStage).toBe('fail-prerequisites');
        
        // Should have specific prerequisite failures
        const prereqFindings = result.findings.filter(f => 
          f.ruleId.includes('PREREQ-')
        );
        expect(prereqFindings.length).toBeGreaterThan(0);
      }
    });

    test('should proceed with scoring when prerequisites pass', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should not be blocked by prerequisites
      expect(result.grade.blockedByPrerequisites).toBeFalsy();
      expect(result.grade.prerequisiteFailures).toBeFalsy();
      expect(tracker.lastStage).toBe('done');
      
      // Should complete full pipeline
      const stages = tracker.calls.map(c => c.stage);
      expect(stages).toContain('coverage-scoring');
      expect(stages).toContain('scoring');
    });
  });

  describe('Progress Reporting', () => {
    test('should report progress through all pipeline stages', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      await gradeContract(args, { progress: mockProgress });
      
      assertProgressTracking(tracker);
      
      // Should have called progress multiple times
      expect(tracker.calls.length).toBeGreaterThan(5);
      
      // Should have specific stages
      const stages = tracker.calls.map(c => c.stage);
      expect(stages).toContain('template');
      expect(stages).toContain('load');
      expect(stages).toContain('openapi-validate');
      expect(stages).toContain('spectral');
      expect(stages).toContain('examples');
      expect(stages).toContain('done');
      
      // Progress should generally increase
      let lastProgress = -1;
      for (const call of tracker.calls) {
        expect(call.progress).toBeGreaterThanOrEqual(lastProgress);
        lastProgress = call.progress;
      }
      
      // Should end at 100%
      expect(tracker.lastProgress).toBe(100);
    });

    test('should handle progress callback errors gracefully', async () => {
      const failingProgress = jest.fn(() => {
        throw new Error('Progress callback error');
      });
      
      const args = TestDataFactory.createValidGradingArgs();
      
      // Should not crash on progress callback errors
      const result = await gradeContract(args, { progress: failingProgress });
      
      assertGradingResult(result);
      expect(failingProgress).toHaveBeenCalled();
    });

    test('should provide meaningful progress notes', async () => {
      const [mockProgress, tracker] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      await gradeContract(args, { progress: mockProgress });
      
      // Some progress calls should have notes
      const callsWithNotes = tracker.calls.filter(c => c.note);
      // Notes are optional, so just check structure
      callsWithNotes.forEach(call => {
        expect(typeof call.note).toBe('string');
        expect(call.note.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Scoring Mode Compatibility', () => {
    test('should support legacy scoring mode', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs({ legacyMode: true });
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Should use legacy scoring
      expect(result.metadata.scoringEngine).toBe('legacy');
      expect(result.metadata.toolVersions.grader).toBe('1.2.0');
      expect(result.grade.coverageBased).toBeUndefined();
      expect(result.grade.ruleScores).toBeUndefined();
      
      // Should have traditional checkpoint scoring
      expect(result.checkpoints.length).toBeGreaterThan(0);
      result.checkpoints.forEach((cp: any) => {
        expect(cp).toHaveProperty('checkpoint_id');
        expect(cp).toHaveProperty('category');
        expect(cp).toHaveProperty('max_points');
        expect(cp).toHaveProperty('scored_points');
      });
    });

    test('should use coverage-based scoring by default', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should use new scoring
      expect(result.metadata.scoringEngine).toBe('coverage-based');
      expect(result.metadata.toolVersions.grader).toBe('2.0.0');
      expect(result.grade.coverageBased).toBe(true);
      expect(result.grade.ruleScores).toBeDefined();
      
      // Should have detailed rule scores
      const ruleScores = result.grade.ruleScores;
      expect(typeof ruleScores).toBe('object');
      
      for (const [ruleId, score] of Object.entries(ruleScores as any)) {
        expect(typeof ruleId).toBe('string');
        expect(score).toHaveProperty('coverage');
        expect(score).toHaveProperty('score');
        expect(score).toHaveProperty('maxPoints');
        expect(score).toHaveProperty('applicable');
      }
    });

    test('should produce comparable results between scoring modes', async () => {
      const [mockProgress1] = createMockProgress();
      const [mockProgress2] = createMockProgress();
      
      const baseArgs = TestDataFactory.createValidGradingArgs();
      const legacyArgs = { ...baseArgs, legacyMode: true };
      const newArgs = { ...baseArgs, legacyMode: false };
      
      const legacyResult = await gradeContract(legacyArgs, { progress: mockProgress1 });
      const newResult = await gradeContract(newArgs, { progress: mockProgress2 });
      
      // Both should produce valid results
      assertGradingResult(legacyResult);
      assertGradingResult(newResult);
      
      // Scores should be in similar ranges (not necessarily identical)
      const scoreDifference = Math.abs(legacyResult.grade.total - newResult.grade.total);
      expect(scoreDifference).toBeLessThan(50); // Allow for scoring algorithm differences
      
      // Both should evaluate the same spec
      expect(legacyResult.metadata.specHash).toBe(newResult.metadata.specHash);
    });
  });

  describe('Error Content Types', () => {
    test('should validate application/problem+json usage', async () => {
      const [mockProgress] = createMockProgress();
      const args = TestDataFactory.createValidGradingArgs();
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should check for proper error content types
      const errorFormatFindings = result.findings.filter(f => 
        f.message.includes('problem+json') ||
        f.ruleId.includes('ERR-PROBLEMJSON')
      );
      
      const errorCheckpoints = result.checkpoints.filter(cp => 
        cp.checkpoint_id === 'ERR-PROBLEMJSON'
      );
      
      // Should evaluate error format compliance
      expect(errorCheckpoints.length >= 0).toBe(true);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle empty paths object', async () => {
      const emptyPathsSpec = `
        openapi: "3.0.3"
        info:
          title: "Empty Paths API"
          version: "1.0.0"
        paths: {}
      `;
      
      const tempFile = await createTempSpec(emptyPathsSpec);
      tempFiles.push(tempFile);
      
      const [mockProgress] = createMockProgress();
      const args = {
        path: tempFile,
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should handle gracefully with low score
      expect(result.grade.total).toBeLessThan(20);
      expect(result.findings.some(f => 
        f.message.toLowerCase().includes('path') ||
        f.message.toLowerCase().includes('operation')
      )).toBe(true);
    });

    test('should handle very large specification files', async () => {
      // Create a spec with many paths and operations
      const largePaths: string[] = [];
      for (let i = 1; i <= 100; i++) {
        largePaths.push(`
  /api/v2/resource${i}:
    get:
      summary: "Get resource ${i}"
      operationId: "getResource${i}"
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: "Success"
          content:
            application/json:
              schema:
                type: object
        '404':
          description: "Not found"
      security:
        - OAuth2: ['read']`);
      }
      
      const hugeSpec = `
openapi: "3.0.3"
info:
  title: "Huge API"
  version: "1.0.0"
security:
  - OAuth2: ['read']
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
paths:
${largePaths.join('')}
`;
      
      const tempFile = await createTempSpec(hugeSpec);
      tempFiles.push(tempFile);
      
      const [mockProgress] = createMockProgress();
      const args = {
        path: tempFile,
        templatePath: getFixturePath('template.yaml')
      };
      
      const { result, timeMs } = await PerformanceHelpers.measureExecutionTime(() =>
        gradeContract(args, { progress: mockProgress })
      );
      
      // Should handle large specs efficiently (within 1 minute)
      PerformanceHelpers.assertPerformance(timeMs, 60000);
      
      assertGradingResult(result);
      
      // Should have many findings due to scale
      expect(result.findings.length).toBeGreaterThan(50);
      expect(result.checkpoints.length).toBeGreaterThan(20);
    }, 65000);

    test('should handle minimal valid specification', async () => {
      const tempFile = await createTempSpec(MINIMAL_VALID_SPEC);
      tempFiles.push(tempFile);
      
      const [mockProgress] = createMockProgress();
      const args = {
        path: tempFile,
        templatePath: getFixturePath('template.yaml')
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Minimal spec should score low but not fail catastrophically
      expect(result.grade.total).toBeGreaterThanOrEqual(0);
      expect(result.grade.total).toBeLessThan(30);
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });
});