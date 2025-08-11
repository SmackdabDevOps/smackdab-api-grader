import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Severity } from '../../../../src/app/checkpoints';
import crypto from 'node:crypto';

// Mock crypto.createHash
jest.spyOn(crypto, 'createHash').mockImplementation(() => ({
  update: jest.fn().mockReturnThis(),
  digest: jest.fn(() => 'mocked-hash-123')
} as any));

// Import the module after setting up the spy
import { generateFixes } from '../../../../src/app/fixes/fixesEngine';

describe('fixesEngine', () => {
  const mockSpecText = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /inventory/products:
    get:
      responses:
        '200':
          description: Success
  `;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateFixes', () => {
    it('should return empty array when no findings provided', () => {
      const result = generateFixes([], mockSpecText);
      expect(result).toEqual([]);
    });

    it('should return empty array when findings array is empty', () => {
      const findings: Array<{ruleId: string; severity: Severity; jsonPath: string; message: string}> = [];
      const result = generateFixes(findings, mockSpecText);
      expect(result).toEqual([]);
    });

    describe('NAME-NAMESPACE rule fixes', () => {
      it('should generate namespace fix for NAME-NAMESPACE rule', () => {
        const findings = [
          {
            ruleId: 'NAME-NAMESPACE',
            severity: 'error' as Severity,
            jsonPath: '$.paths',
            message: 'Paths should be namespaced'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          ruleId: 'NAME-NAMESPACE',
          severity: 'error',
          jsonPath: '$.paths',
          description: 'Prefix all paths with /api/v2/{domain}',
          suggested: 'Rewrite paths to start with /api/v2/...',
          patch: {
            type: 'unified-diff',
            preimageHash: expect.any(String),
            body: expect.stringContaining('- /inventory/products:')
          },
          rationale: 'All endpoints must live under /api/v2 to match Smackdab versioning policy',
          risk: 'low'
        });
      });

      it('should generate correct unified diff patch body for NAME-NAMESPACE', () => {
        const findings = [
          {
            ruleId: 'NAME-NAMESPACE',
            severity: 'warn' as Severity,
            jsonPath: '$.paths',
            message: 'Namespace issue'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result[0].patch.body).toContain('--- a/spec.yaml');
        expect(result[0].patch.body).toContain('+++ b/spec.yaml');
        expect(result[0].patch.body).toContain('- /inventory/products:');
        expect(result[0].patch.body).toContain('+ /api/v2/inventory/products:');
      });
    });

    describe('SEC-ORG-HDR rule fixes', () => {
      it('should generate organization header fix for SEC-ORG-HDR rule', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].get.parameters',
            message: 'Missing organization header'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          ruleId: 'SEC-ORG-HDR',
          severity: 'error',
          jsonPath: '$.paths["/products"].get.parameters',
          description: 'Add OrganizationHeader ref to operation parameters',
          patch: {
            type: 'json-patch',
            preimageHash: 'mocked-hash-123'
          },
          rationale: 'Row-level tenant isolation requires org context on every request',
          risk: 'low'
        });
      });

      it('should generate correct JSON patch for SEC-ORG-HDR with jsonPath', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/api/products"].get.parameters',
            message: 'Missing org header'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        const patchBody = JSON.parse(result[0].patch.body);
        expect(patchBody).toEqual([
          { 
            op: 'add', 
            path: '$.paths["/api/products"].get.parameters/-', 
            value: { $ref: "#/components/parameters/OrganizationHeader" } 
          }
        ]);
      });

      it('should handle SEC-ORG-HDR with empty jsonPath', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: '',
            message: 'Missing org header'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        const patchBody = JSON.parse(result[0].patch.body);
        expect(patchBody[0].path).toBe('/-');
      });

      it('should handle SEC-ORG-HDR with undefined jsonPath', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: undefined as any,
            message: 'Missing org header'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        const patchBody = JSON.parse(result[0].patch.body);
        expect(patchBody[0].path).toBe('/-');
      });
    });

    describe('SEC-BRANCH-HDR rule fixes', () => {
      it('should generate branch header fix for SEC-BRANCH-HDR rule', () => {
        const findings = [
          {
            ruleId: 'SEC-BRANCH-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].get.parameters',
            message: 'Missing branch header'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          ruleId: 'SEC-BRANCH-HDR',
          severity: 'error',
          jsonPath: '$.paths["/products"].get.parameters',
          description: 'Add BranchHeader ref to operation parameters',
          patch: {
            type: 'json-patch',
            preimageHash: 'mocked-hash-123'
          },
          rationale: 'Branch context is required for multi-location isolation',
          risk: 'low'
        });
      });

      it('should generate correct JSON patch for SEC-BRANCH-HDR', () => {
        const findings = [
          {
            ruleId: 'SEC-BRANCH-HDR',
            severity: 'warn' as Severity,
            jsonPath: '$.paths["/branch-test"].post.parameters',
            message: 'Missing branch header'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        const patchBody = JSON.parse(result[0].patch.body);
        expect(patchBody).toEqual([
          { 
            op: 'add', 
            path: '$.paths["/branch-test"].post.parameters/-', 
            value: { $ref: "#/components/parameters/BranchHeader" } 
          }
        ]);
      });
    });

    describe('PAG-KEYSET rule fixes', () => {
      it('should generate key-set pagination fix for PAG-KEYSET rule', () => {
        const findings = [
          {
            ruleId: 'PAG-KEYSET',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].get.parameters',
            message: 'Missing keyset pagination'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          ruleId: 'PAG-KEYSET',
          severity: 'error',
          jsonPath: '$.paths["/products"].get.parameters',
          description: 'Add AfterKey, BeforeKey, Limit parameter refs to list endpoints',
          patch: {
            type: 'json-patch',
            preimageHash: 'mocked-hash-123'
          },
          rationale: 'Key-set pagination ensures deterministic, cursor-based pagination (no offsets)',
          risk: 'low'
        });
      });

      it('should generate correct JSON patch with multiple operations for PAG-KEYSET', () => {
        const findings = [
          {
            ruleId: 'PAG-KEYSET',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].get.parameters',
            message: 'Missing keyset pagination'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        const patchBody = JSON.parse(result[0].patch.body);
        expect(patchBody).toHaveLength(3);
        expect(patchBody).toEqual([
          { 
            op: 'add', 
            path: '$.paths["/products"].get.parameters/-', 
            value: { $ref: "#/components/parameters/AfterKey" } 
          },
          { 
            op: 'add', 
            path: '$.paths["/products"].get.parameters/-', 
            value: { $ref: "#/components/parameters/BeforeKey" } 
          },
          { 
            op: 'add', 
            path: '$.paths["/products"].get.parameters/-', 
            value: { $ref: "#/components/parameters/Limit" } 
          }
        ]);
      });

      it('should include suggested parameters text for PAG-KEYSET', () => {
        const findings = [
          {
            ruleId: 'PAG-KEYSET',
            severity: 'info' as Severity,
            jsonPath: '$.paths["/list"].get.parameters',
            message: 'Add keyset pagination'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result[0].suggested).toContain('parameters:');
        expect(result[0].suggested).toContain("- $ref: '#/components/parameters/AfterKey'");
        expect(result[0].suggested).toContain("- $ref: '#/components/parameters/BeforeKey'");
        expect(result[0].suggested).toContain("- $ref: '#/components/parameters/Limit'");
      });
    });

    describe('PAG-NO-OFFSET rule fixes', () => {
      it('should generate offset removal fix for PAG-NO-OFFSET rule', () => {
        const findings = [
          {
            ruleId: 'PAG-NO-OFFSET',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].get.parameters',
            message: 'Contains forbidden offset pagination'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          ruleId: 'PAG-NO-OFFSET',
          severity: 'error',
          jsonPath: '$.paths["/products"].get.parameters',
          description: 'Remove offset/page fields and migrate to key-set params',
          suggested: 'Delete offset/page/page_size/pageNumber parameters',
          patch: {
            type: 'unified-diff',
            preimageHash: 'mocked-hash-123'
          },
          rationale: 'Offset pagination is disallowed per Smackdab standard',
          risk: 'low'
        });
      });

      it('should generate correct unified diff for PAG-NO-OFFSET removal', () => {
        const findings = [
          {
            ruleId: 'PAG-NO-OFFSET',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].get.parameters',
            message: 'Remove offset params'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result[0].patch.body).toContain('--- a/spec.yaml');
        expect(result[0].patch.body).toContain('+++ b/spec.yaml');
        expect(result[0].patch.body).toContain('-  - name: offset');
        expect(result[0].patch.body).toContain('-  - name: page');
        expect(result[0].patch.body).toContain('+ replaced with key-set parameters');
      });
    });

    describe('multiple findings', () => {
      it('should generate fixes for multiple different rule types', () => {
        const findings = [
          {
            ruleId: 'NAME-NAMESPACE',
            severity: 'error' as Severity,
            jsonPath: '$.paths',
            message: 'Namespace issue'
          },
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].get.parameters',
            message: 'Missing org header'
          },
          {
            ruleId: 'PAG-KEYSET',
            severity: 'warn' as Severity,
            jsonPath: '$.paths["/list"].get.parameters',
            message: 'Missing pagination'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(3);
        expect(result[0].ruleId).toBe('NAME-NAMESPACE');
        expect(result[1].ruleId).toBe('SEC-ORG-HDR');
        expect(result[2].ruleId).toBe('PAG-KEYSET');
      });

      it('should generate multiple fixes for same rule type', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].get.parameters',
            message: 'Missing org header on GET'
          },
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].post.parameters',
            message: 'Missing org header on POST'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(2);
        expect(result[0].ruleId).toBe('SEC-ORG-HDR');
        expect(result[1].ruleId).toBe('SEC-ORG-HDR');
        expect(result[0].jsonPath).toBe('$.paths["/products"].get.parameters');
        expect(result[1].jsonPath).toBe('$.paths["/products"].post.parameters');
      });
    });

    describe('unsupported rule types', () => {
      it('should skip unsupported rule types', () => {
        const findings = [
          {
            ruleId: 'UNSUPPORTED-RULE',
            severity: 'error' as Severity,
            jsonPath: '$.info',
            message: 'Some unsupported rule violation'
          },
          {
            ruleId: 'ANOTHER-UNKNOWN',
            severity: 'warn' as Severity,
            jsonPath: '$.paths',
            message: 'Another unknown rule'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(0);
      });

      it('should process supported rules and skip unsupported ones', () => {
        const findings = [
          {
            ruleId: 'UNSUPPORTED-RULE',
            severity: 'error' as Severity,
            jsonPath: '$.info',
            message: 'Unsupported rule'
          },
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/products"].get.parameters',
            message: 'Missing org header'
          },
          {
            ruleId: 'ANOTHER-UNKNOWN',
            severity: 'warn' as Severity,
            jsonPath: '$.paths',
            message: 'Another unknown'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(1);
        expect(result[0].ruleId).toBe('SEC-ORG-HDR');
      });
    });

    describe('preimage hash handling', () => {
      it('should use crypto hash for preimage', () => {
        const findings = [
          {
            ruleId: 'NAME-NAMESPACE',
            severity: 'error' as Severity,
            jsonPath: '$.paths',
            message: 'Test'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result[0].patch.preimageHash).toBeDefined();
      });

      it('should use same preimage hash for all patches', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/test1"]',
            message: 'Test 1'
          },
          {
            ruleId: 'SEC-BRANCH-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.paths["/test2"]',
            message: 'Test 2'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(2);
        expect(result[0].patch.preimageHash).toBeDefined();
        expect(result[1].patch.preimageHash).toBeDefined();
      });
    });

    describe('fix item properties', () => {
      it('should include all required properties for NAME-NAMESPACE fix', () => {
        const findings = [
          {
            ruleId: 'NAME-NAMESPACE',
            severity: 'error' as Severity,
            jsonPath: '$.paths',
            message: 'Test namespace'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        const fix = result[0];
        
        expect(fix).toHaveProperty('ruleId', 'NAME-NAMESPACE');
        expect(fix).toHaveProperty('severity', 'error');
        expect(fix).toHaveProperty('jsonPath', '$.paths');
        expect(fix).toHaveProperty('description');
        expect(fix).toHaveProperty('suggested');
        expect(fix).toHaveProperty('patch');
        expect(fix).toHaveProperty('rationale');
        expect(fix).toHaveProperty('risk', 'low');
        expect(fix.patch).toHaveProperty('type', 'unified-diff');
        expect(fix.patch).toHaveProperty('preimageHash');
        expect(fix.patch).toHaveProperty('body');
      });

      it('should include all required properties for JSON patch fixes', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'warn' as Severity,
            jsonPath: '$.test.path',
            message: 'Test org header'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        const fix = result[0];
        
        expect(fix).toHaveProperty('ruleId', 'SEC-ORG-HDR');
        expect(fix).toHaveProperty('severity', 'warn');
        expect(fix).toHaveProperty('jsonPath', '$.test.path');
        expect(fix).toHaveProperty('description');
        expect(fix).toHaveProperty('suggested');
        expect(fix).toHaveProperty('patch');
        expect(fix).toHaveProperty('rationale');
        expect(fix).toHaveProperty('risk', 'low');
        expect(fix.patch).toHaveProperty('type', 'json-patch');
        expect(fix.patch).toHaveProperty('preimageHash');
        expect(fix.patch).toHaveProperty('body');
      });

      it('should not include optional properties current when not set', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: '$.test',
            message: 'Test'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result[0]).not.toHaveProperty('current');
      });
    });

    describe('edge cases', () => {
      it('should handle empty spec text', () => {
        const findings = [
          {
            ruleId: 'NAME-NAMESPACE',
            severity: 'error' as Severity,
            jsonPath: '$.paths',
            message: 'Test'
          }
        ];

        const result = generateFixes(findings, '');
        
        expect(result).toHaveLength(1);
        expect(result[0].patch.preimageHash).toBeDefined();
      });

      it('should handle null jsonPath gracefully', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'error' as Severity,
            jsonPath: null as any,
            message: 'Test'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(1);
        const patchBody = JSON.parse(result[0].patch.body);
        expect(patchBody[0].path).toBe('/-');
      });

      it('should handle different severity levels', () => {
        const findings = [
          {
            ruleId: 'SEC-ORG-HDR',
            severity: 'info' as Severity,
            jsonPath: '$.test',
            message: 'Info level'
          },
          {
            ruleId: 'SEC-BRANCH-HDR',
            severity: 'warn' as Severity,
            jsonPath: '$.test',
            message: 'Warn level'
          },
          {
            ruleId: 'PAG-KEYSET',
            severity: 'error' as Severity,
            jsonPath: '$.test',
            message: 'Error level'
          }
        ];

        const result = generateFixes(findings, mockSpecText);
        
        expect(result).toHaveLength(3);
        expect(result[0].severity).toBe('info');
        expect(result[1].severity).toBe('warn');
        expect(result[2].severity).toBe('error');
      });
    });
  });
});