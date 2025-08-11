/**
 * Core pipeline integration tests
 * Basic functionality tests for the grading pipeline
 */

import { jest, describe, test, expect } from '@jest/globals';
import { gradeContract, version } from '../../src/app/pipeline';

describe('Pipeline Core Integration', () => {
  const mockProgress = jest.fn();

  beforeEach(() => {
    mockProgress.mockClear();
  });

  describe('Version Information', () => {
    test('should return version information', async () => {
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
  });

  describe('Pipeline Execution', () => {
    test('should process minimal valid specification', async () => {
      const minimalSpec = `
openapi: "3.0.3"
info:
  title: "Test API"
  version: "1.0.0"
paths:
  /test:
    get:
      responses:
        '200':
          description: "Success"
      `;
      
      // Write to temporary file for testing
      const fs = require('node:fs/promises');
      const tempPath = '/tmp/test-spec.yaml';
      await fs.writeFile(tempPath, minimalSpec, 'utf8');
      
      try {
        const args = {
          path: tempPath,
          templatePath: '.claude/templates/MASTER_API_TEMPLATE_v3.yaml'
        };
        
        const result = await gradeContract(args, { progress: mockProgress });
        
        // Verify basic result structure
        expect(result).toHaveProperty('grade');
        expect(result).toHaveProperty('findings');
        expect(result).toHaveProperty('checkpoints');
        expect(result).toHaveProperty('metadata');
        
        // Verify grade structure
        expect(result.grade).toHaveProperty('total');
        expect(result.grade).toHaveProperty('letter');
        expect(result.grade).toHaveProperty('compliancePct');
        expect(result.grade.total).toBeGreaterThanOrEqual(0);
        expect(result.grade.total).toBeLessThanOrEqual(100);
        
        // Verify metadata
        expect(result.metadata).toHaveProperty('scoringEngine');
        expect(result.metadata).toHaveProperty('specHash');
        
        // Verify progress was called
        expect(mockProgress).toHaveBeenCalled();
        
        // Clean up
        await fs.unlink(tempPath);
      } catch (error) {
        // Clean up on error
        try {
          await fs.unlink(tempPath);
        } catch {}
        throw error;
      }
    });

    test('should handle invalid specification gracefully', async () => {
      const invalidSpec = `
openapi: "3.0.0"  # Wrong version
info:
  title: "Bad API"
  # Missing version
paths:
  /test:
    get:
      # Missing responses
      `;
      
      const fs = require('node:fs/promises');
      const tempPath = '/tmp/invalid-spec.yaml';
      await fs.writeFile(tempPath, invalidSpec, 'utf8');
      
      try {
        const args = {
          path: tempPath,
          templatePath: '.claude/templates/MASTER_API_TEMPLATE_v3.yaml'
        };
        
        const result = await gradeContract(args, { progress: mockProgress });
        
        // Should return result even for invalid spec
        expect(result).toHaveProperty('grade');
        expect(result).toHaveProperty('findings');
        
        // Should have low score and errors
        expect(result.grade.total).toBeLessThan(50);
        expect(result.findings.length).toBeGreaterThan(0);
        expect(result.findings.some((f: any) => f.severity === 'error')).toBe(true);
        
        // Clean up
        await fs.unlink(tempPath);
      } catch (error) {
        // Clean up on error
        try {
          await fs.unlink(tempPath);
        } catch {}
        throw error;
      }
    });
  });
});