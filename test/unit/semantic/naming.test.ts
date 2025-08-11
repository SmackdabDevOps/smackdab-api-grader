/**
 * Naming Semantic Module Unit Tests
 * 
 * Tests API path naming conventions and Smackdab-specific requirements:
 * - /api/v2/ namespace requirement (NAME-NAMESPACE)
 * - Consistent domain-based path structure
 * - RESTful resource naming patterns
 * - Auto-fail conditions for missing namespace
 * 
 * Critical for Smackdab API structure compliance.
 */

import { checkNaming } from '../../../src/app/semantic/naming';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('Naming Semantic Module', () => {
  describe('Path Namespace Requirements', () => {
    it('should require all paths to start with /api/v2/', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            }
          },
          '/products': {
            post: {
              operationId: 'createProduct',
              responses: { '201': { description: 'Created' } }
            }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings).toHaveLength(2);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'NAME-NAMESPACE',
            severity: 'error',
            category: 'naming',
            message: 'All paths must start with /api/v2/<domain>',
            jsonPath: "$.paths['/users']"
          })
        ])
      );
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'NAME-NAMESPACE',
            severity: 'error',
            category: 'naming',
            message: 'All paths must start with /api/v2/<domain>',
            jsonPath: "$.paths['/products']"
          })
        ])
      );
    });

    it('should pass when all paths have correct /api/v2/ namespace', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            }
          },
          '/api/v2/products': {
            post: {
              operationId: 'createProduct',
              responses: { '201': { description: 'Created' } }
            }
          },
          '/api/v2/orders/{id}': {
            get: {
              operationId: 'getOrder',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings.filter(f => f.ruleId === 'NAME-NAMESPACE')).toHaveLength(0);
      expect(result.score.naming.add).toBe(10);
      expect(result.score.naming.max).toBe(10);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should detect mixed compliance scenarios', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            }
          },
          '/legacy/products': {
            get: {
              operationId: 'getLegacyProducts',
              responses: { '200': { description: 'Success' } }
            }
          },
          '/api/v1/orders': {
            get: {
              operationId: 'getV1Orders',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings).toHaveLength(2);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'NAME-NAMESPACE',
            jsonPath: "$.paths['/legacy/products']"
          })
        ])
      );
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'NAME-NAMESPACE',
            jsonPath: "$.paths['/api/v1/orders']"
          })
        ])
      );
      expect(result.score.naming.add).toBe(6);
      expect(result.autoFailReasons).toContain('Missing /api/v2 namespace on one or more paths');
    });

    it('should validate domain-based path structure', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'CRM API', version: '1.0.0' },
        paths: {
          '/api/v2/crm/contacts': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/v2/crm/deals': {
            post: { responses: { '201': { description: 'Created' } } }
          },
          '/api/v2/inventory/products': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/v2/billing/invoices': {
            get: { responses: { '200': { description: 'Success' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings.filter(f => f.ruleId === 'NAME-NAMESPACE')).toHaveLength(0);
      expect(result.score.naming.add).toBe(10);
      expect(result.autoFailReasons).toHaveLength(0);
    });
  });

  describe('RESTful Path Patterns', () => {
    it('should accept standard RESTful patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: { responses: { '200': { description: 'List users' } } },
            post: { responses: { '201': { description: 'Create user' } } }
          },
          '/api/v2/users/{id}': {
            get: { responses: { '200': { description: 'Get user' } } },
            put: { responses: { '200': { description: 'Update user' } } },
            delete: { responses: { '204': { description: 'Delete user' } } }
          },
          '/api/v2/users/{id}/profile': {
            get: { responses: { '200': { description: 'Get user profile' } } }
          },
          '/api/v2/organizations/{orgId}/users/{userId}': {
            get: { responses: { '200': { description: 'Get user in organization' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings.filter(f => f.ruleId === 'NAME-NAMESPACE')).toHaveLength(0);
      expect(result.score.naming.add).toBe(10);
    });

    it('should handle nested resource paths correctly', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Multi-tenant API', version: '1.0.0' },
        paths: {
          '/api/v2/organizations/{orgId}/projects': {
            get: { responses: { '200': { description: 'List projects' } } }
          },
          '/api/v2/organizations/{orgId}/projects/{projectId}/tasks': {
            get: { responses: { '200': { description: 'List tasks' } } }
          },
          '/api/v2/organizations/{orgId}/branches/{branchId}/data': {
            get: { responses: { '200': { description: 'Get branch data' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings.filter(f => f.ruleId === 'NAME-NAMESPACE')).toHaveLength(0);
      expect(result.score.naming.add).toBe(10);
      expect(result.autoFailReasons).toHaveLength(0);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle specs with no paths', () => {
      const spec = MockOpenApiFactory.validMinimal();
      delete spec.paths;

      const result = checkNaming(spec);

      expect(result.findings).toHaveLength(0);
      expect(result.score.naming.add).toBe(10);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should handle specs with empty paths object', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };

      const result = checkNaming(spec);

      expect(result.findings).toHaveLength(0);
      expect(result.score.naming.add).toBe(10);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should handle null paths gracefully', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: null
      };

      const result = checkNaming(spec);

      expect(result.findings).toHaveLength(0);
      expect(result.score.naming.add).toBe(10);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should handle paths with special characters', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users/{user-id}': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/v2/search?query={query}': {
            get: { responses: { '200': { description: 'Search results' } } }
          },
          '/api/v2/files/{file.name}': {
            get: { responses: { '200': { description: 'Get file' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings.filter(f => f.ruleId === 'NAME-NAMESPACE')).toHaveLength(0);
      expect(result.score.naming.add).toBe(10);
    });
  });

  describe('Version Compliance', () => {
    it('should reject paths with wrong API version', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v1/users': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/v3/products': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/beta/orders': {
            get: { responses: { '200': { description: 'Success' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings).toHaveLength(3);
      expect(result.findings.every(f => f.ruleId === 'NAME-NAMESPACE')).toBe(true);
      expect(result.autoFailReasons).toContain('Missing /api/v2 namespace on one or more paths');
    });

    it('should reject paths without api prefix', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/v2/users': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/public/health': {
            get: { responses: { '200': { description: 'Health check' } } }
          },
          '/admin/stats': {
            get: { responses: { '200': { description: 'Admin stats' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings).toHaveLength(3);
      expect(result.findings.every(f => f.ruleId === 'NAME-NAMESPACE')).toBe(true);
      expect(result.score.naming.add).toBe(6);
    });

    it('should require exact /api/v2/ format', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/API/V2/users': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/v2.0/products': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/v2.1/orders': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/apis/v2/customers': {
            get: { responses: { '200': { description: 'Success' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings).toHaveLength(4);
      expect(result.findings.every(f => f.ruleId === 'NAME-NAMESPACE')).toBe(true);
      expect(result.autoFailReasons).toContain('Missing /api/v2 namespace on one or more paths');
    });
  });

  describe('Scoring Logic', () => {
    it('should give full score for complete compliance', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/v2/products': {
            get: { responses: { '200': { description: 'Success' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.score.naming.add).toBe(10);
      expect(result.score.naming.max).toBe(10);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should give partial score for partial compliance', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/legacy/products': {
            get: { responses: { '200': { description: 'Success' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.score.naming.add).toBe(6);
      expect(result.score.naming.max).toBe(10);
      expect(result.autoFailReasons).toContain('Missing /api/v2 namespace on one or more paths');
    });

    it('should handle maximum score constraints', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/domain1/resource1': { get: { responses: { '200': { description: 'Success' } } } },
          '/api/v2/domain2/resource2': { get: { responses: { '200': { description: 'Success' } } } },
          '/api/v2/domain3/resource3': { get: { responses: { '200': { description: 'Success' } } } }
        }
      };

      const result = checkNaming(spec);

      expect(result.score.naming.add).toBe(10);
      expect(result.score.naming.max).toBe(10);
    });
  });

  describe('Auto-fail Conditions', () => {
    it('should trigger auto-fail when any path lacks namespace', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/good': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/bad': {
            get: { responses: { '200': { description: 'Success' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.autoFailReasons).toEqual(['Missing /api/v2 namespace on one or more paths']);
    });

    it('should not trigger auto-fail when all paths comply', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/v2/products': {
            get: { responses: { '200': { description: 'Success' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should handle empty paths without auto-fail', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };

      const result = checkNaming(spec);

      expect(result.autoFailReasons).toHaveLength(0);
    });
  });

  describe('Performance with Large Specs', () => {
    it('should handle large number of paths efficiently', () => {
      const paths: any = {};
      for (let i = 0; i < 1000; i++) {
        if (i % 2 === 0) {
          paths[`/api/v2/resource${i}`] = {
            get: { responses: { '200': { description: 'Success' } } }
          };
        } else {
          paths[`/bad/resource${i}`] = {
            get: { responses: { '200': { description: 'Success' } } }
          };
        }
      }

      const spec = {
        openapi: '3.0.3',
        info: { title: 'Large API', version: '1.0.0' },
        paths
      };

      const start = performance.now();
      const result = checkNaming(spec);
      const end = performance.now();

      expect(end - start).toBeLessThan(1000); // Should complete in less than 1 second
      expect(result.findings).toHaveLength(500); // Half should fail
      expect(result.score.naming.add).toBe(6);
      expect(result.autoFailReasons).toContain('Missing /api/v2 namespace on one or more paths');
    });

    it('should handle very long path names', () => {
      const longPath = '/api/v2/' + 'a'.repeat(1000);
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          [longPath]: {
            get: { responses: { '200': { description: 'Success' } } }
          }
        }
      };

      const result = checkNaming(spec);

      expect(result.findings.filter(f => f.ruleId === 'NAME-NAMESPACE')).toHaveLength(0);
      expect(result.score.naming.add).toBe(10);
    });
  });
});