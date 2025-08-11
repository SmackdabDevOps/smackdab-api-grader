/**
 * Fixes Engine Tests
 */

import { generateFixes } from '../../../src/app/fixes/fixesEngine';

describe('Fixes Engine', () => {
  describe('generateFixes', () => {
    test('should generate fixes for path violations', () => {
      const findings = [
        {
          ruleId: 'PATH-001',
          message: 'Path should start with /api/v2',
          severity: 'error' as const,
          jsonPath: '$.paths./users',
          line: 10
        }
      ];
      
      const rawYaml = `
openapi: 3.0.3
paths:
  /users:
    get:
      summary: Get users
`;

      const fixes = generateFixes(findings, rawYaml);
      
      expect(Array.isArray(fixes)).toBe(true);
      expect(fixes.length).toBeGreaterThan(0);
      expect(fixes[0]).toHaveProperty('description');
      expect(fixes[0]).toHaveProperty('patch');
    });

    test('should handle empty findings', () => {
      const fixes = generateFixes([], 'openapi: 3.0.3');
      
      expect(Array.isArray(fixes)).toBe(true);
      expect(fixes.length).toBe(0);
    });

    test('should generate fixes for missing operationId', () => {
      const findings = [
        {
          ruleId: 'OPERATION-ID',
          message: 'Missing operationId',
          severity: 'error' as const,
          jsonPath: '$.paths./users.get',
          line: 5
        }
      ];
      
      const rawYaml = `
paths:
  /users:
    get:
      summary: Get users
      responses:
        200:
          description: Success
`;

      const fixes = generateFixes(findings, rawYaml);
      
      expect(fixes.length).toBeGreaterThan(0);
      expect(fixes[0].description).toContain('operationId');
    });

    test('should handle security scheme violations', () => {
      const findings = [
        {
          ruleId: 'SECURITY-001',
          message: 'Missing security scheme',
          severity: 'error' as const,
          jsonPath: '$.components.securitySchemes',
          line: 0
        }
      ];
      
      const rawYaml = `
openapi: 3.0.3
info:
  title: Test
  version: 1.0.0
paths: {}
`;

      const fixes = generateFixes(findings, rawYaml);
      
      expect(fixes.length).toBeGreaterThan(0);
      expect(fixes[0].description).toContain('security');
    });

    test('should handle response format violations', () => {
      const findings = [
        {
          ruleId: 'RESPONSE-FORMAT',
          message: 'Response should use string status codes',
          severity: 'warn' as const,
          jsonPath: '$.paths./users.get.responses.200',
          line: 8
        }
      ];
      
      const rawYaml = `
paths:
  /users:
    get:
      responses:
        200:
          description: Success
`;

      const fixes = generateFixes(findings, rawYaml);
      
      expect(fixes.length).toBeGreaterThan(0);
    });
  });
});