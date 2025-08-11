/**
 * Pagination Semantic Module Unit Tests
 * 
 * Tests pagination patterns and Smackdab-specific requirements:
 * - Key-set pagination requirement (PAG-KEYSET)
 * - Forbidden offset/page pagination (PAG-OFFSET)
 * - Sort parameter validation (PAG-SORT)
 * - Auto-fail conditions for forbidden pagination
 * 
 * Critical for Smackdab scalability and performance compliance.
 */

import { checkPagination } from '../../../src/app/semantic/pagination';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('Pagination Semantic Module', () => {
  describe('Key-set Pagination Requirements', () => {
    it('should require key-set pagination parameters on list endpoints', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PAG-KEYSET',
            severity: 'error',
            category: 'pagination',
            message: 'Missing key-set pagination parameters (AfterKey/BeforeKey/Limit).',
            jsonPath: "$.paths['/api/v2/users'].get.parameters"
          })
        ])
      );
      expect(result.autoFailReasons).toContain('Offset/page pagination detected or missing key-set params');
    });

    it('should pass when all required key-set parameters are present', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers',
              parameters: [
                { $ref: '#/components/parameters/AfterKey' },
                { $ref: '#/components/parameters/BeforeKey' },
                { $ref: '#/components/parameters/Limit' },
                { $ref: '#/components/parameters/Sort' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          parameters: {
            AfterKey: {
              name: 'after_key',
              in: 'query',
              schema: { type: 'string' },
              description: 'Key for forward pagination'
            },
            BeforeKey: {
              name: 'before_key',
              in: 'query',
              schema: { type: 'string' },
              description: 'Key for backward pagination'
            },
            Limit: {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100 },
              description: 'Maximum number of items to return'
            },
            Sort: {
              name: 'sort',
              in: 'query',
              schema: { type: 'string' },
              description: 'Sort field and direction'
            }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings.filter(f => f.ruleId === 'PAG-KEYSET')).toHaveLength(0);
      expect(result.findings.filter(f => f.ruleId === 'PAG-SORT')).toHaveLength(0);
      expect(result.score.pagination.add).toBe(8);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should detect list endpoints correctly', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': { // List endpoint
            get: {
              parameters: [
                { $ref: '#/components/parameters/AfterKey' },
                { $ref: '#/components/parameters/BeforeKey' },
                { $ref: '#/components/parameters/Limit' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          },
          '/api/v2/users/{id}': { // Resource endpoint - should be ignored
            get: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
              ],
              responses: { '200': { description: 'Success' } }
            }
          },
          '/api/v2/products': { // Another list endpoint
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          parameters: {
            AfterKey: { name: 'after_key', in: 'query', schema: { type: 'string' } },
            BeforeKey: { name: 'before_key', in: 'query', schema: { type: 'string' } },
            Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } }
          }
        }
      };

      const result = checkPagination(spec);

      // Should only check the two list endpoints (/users and /products)
      const keysetFindings = result.findings.filter(f => f.ruleId === 'PAG-KEYSET');
      expect(keysetFindings).toHaveLength(1); // Only /products should fail
      expect(keysetFindings[0].jsonPath).toContain('/products');
    });

    it('should handle mixed collection and resource paths', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/organizations': { // Collection
            get: {
              parameters: [
                { $ref: '#/components/parameters/AfterKey' },
                { $ref: '#/components/parameters/BeforeKey' },
                { $ref: '#/components/parameters/Limit' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          },
          '/api/v2/organizations/{orgId}': { // Resource
            get: {
              responses: { '200': { description: 'Success' } }
            }
          },
          '/api/v2/organizations/{orgId}/users': { // Nested collection
            get: {
              responses: { '200': { description: 'Success' } }
            }
          },
          '/api/v2/organizations/{orgId}/users/{userId}': { // Nested resource
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          parameters: {
            AfterKey: { name: 'after_key', in: 'query', schema: { type: 'string' } },
            BeforeKey: { name: 'before_key', in: 'query', schema: { type: 'string' } },
            Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } }
          }
        }
      };

      const result = checkPagination(spec);

      // Only the nested collection should fail (organizations already has pagination)
      const keysetFindings = result.findings.filter(f => f.ruleId === 'PAG-KEYSET');
      expect(keysetFindings).toHaveLength(1);
      expect(keysetFindings[0].jsonPath).toContain('/organizations/{orgId}/users');
    });
  });

  describe('Forbidden Pagination Detection', () => {
    it('should detect and forbid offset pagination', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers',
              parameters: [
                {
                  name: 'offset',
                  in: 'query',
                  schema: { type: 'integer' },
                  description: 'Number of records to skip'
                },
                {
                  name: 'limit',
                  in: 'query',
                  schema: { type: 'integer' },
                  description: 'Maximum number of records'
                }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PAG-OFFSET',
            severity: 'error',
            category: 'pagination',
            message: 'Offset/page pagination detected; Smackdab requires key-set (after_key/before_key).',
            jsonPath: "$.paths['/api/v2/users'].get.parameters"
          })
        ])
      );
      expect(result.autoFailReasons).toContain('Offset/page pagination detected or missing key-set params');
    });

    it('should detect and forbid page-based pagination', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                {
                  name: 'page',
                  in: 'query',
                  schema: { type: 'integer' },
                  description: 'Page number'
                },
                {
                  name: 'page_size',
                  in: 'query',
                  schema: { type: 'integer' },
                  description: 'Page size'
                }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PAG-OFFSET',
            severity: 'error',
            message: 'Offset/page pagination detected; Smackdab requires key-set (after_key/before_key).',
            jsonPath: "$.paths['/api/v2/products'].get.parameters"
          })
        ])
      );
    });

    it('should detect various forms of forbidden pagination', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/endpoint1': {
            get: {
              parameters: [
                { name: 'pageNumber', in: 'query', schema: { type: 'integer' } }
              ],
              responses: { '200': { description: 'Success' } }
            }
          },
          '/api/v2/endpoint2': {
            get: {
              parameters: [
                { name: 'offset', in: 'query', schema: { type: 'integer' } }
              ],
              responses: { '200': { description: 'Success' } }
            }
          },
          '/api/v2/endpoint3': {
            get: {
              parameters: [
                { name: 'page_size', in: 'query', schema: { type: 'integer' } }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkPagination(spec);

      const offsetFindings = result.findings.filter(f => f.ruleId === 'PAG-OFFSET');
      expect(offsetFindings).toHaveLength(3);
    });
  });

  describe('Sort Parameter Validation', () => {
    it('should warn when Sort parameter is missing', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/AfterKey' },
                { $ref: '#/components/parameters/BeforeKey' },
                { $ref: '#/components/parameters/Limit' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          parameters: {
            AfterKey: { name: 'after_key', in: 'query', schema: { type: 'string' } },
            BeforeKey: { name: 'before_key', in: 'query', schema: { type: 'string' } },
            Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PAG-SORT',
            severity: 'warn',
            category: 'pagination',
            message: 'Missing Sort parameter reference.',
            jsonPath: "$.paths['/api/v2/users'].get.parameters"
          })
        ])
      );
      expect(result.score.pagination.add).toBe(7); // 5 (keyset) + 2 (filters) + 0 (sort)
    });

    it('should pass when Sort parameter is present', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/AfterKey' },
                { $ref: '#/components/parameters/BeforeKey' },
                { $ref: '#/components/parameters/Limit' },
                { $ref: '#/components/parameters/Sort' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          parameters: {
            AfterKey: { name: 'after_key', in: 'query', schema: { type: 'string' } },
            BeforeKey: { name: 'before_key', in: 'query', schema: { type: 'string' } },
            Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } },
            Sort: { name: 'sort', in: 'query', schema: { type: 'string' } }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings.filter(f => f.ruleId === 'PAG-SORT')).toHaveLength(0);
      expect(result.score.pagination.add).toBe(8); // Full score
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle specs with no paths', () => {
      const spec = MockOpenApiFactory.validMinimal();
      delete spec.paths;

      const result = checkPagination(spec);

      expect(result.findings).toHaveLength(0);
      expect(result.score.pagination.add).toBe(8);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should handle paths with no operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {}
        }
      };

      const result = checkPagination(spec);

      expect(result.findings).toHaveLength(0);
      expect(result.score.pagination.add).toBe(8);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should handle non-GET operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            post: {
              parameters: [
                { name: 'offset', in: 'query', schema: { type: 'integer' } }
              ],
              responses: { '201': { description: 'Created' } }
            },
            put: {
              responses: { '200': { description: 'Updated' } }
            }
          }
        }
      };

      const result = checkPagination(spec);

      // Should not check pagination on non-GET operations
      expect(result.findings).toHaveLength(0);
      expect(result.score.pagination.add).toBe(8);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should handle operations without parameters', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PAG-KEYSET',
            message: 'Missing key-set pagination parameters (AfterKey/BeforeKey/Limit).'
          })
        ])
      );
      expect(result.autoFailReasons).toContain('Offset/page pagination detected or missing key-set params');
    });

    it('should handle null parameters arrays', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: null,
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings).toHaveLength(2); // PAG-KEYSET and PAG-SORT
      expect(result.autoFailReasons).toContain('Offset/page pagination detected or missing key-set params');
    });
  });

  describe('Parameter Reference Resolution', () => {
    it('should correctly identify parameter references', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/AfterKey' },
                { $ref: '#/components/parameters/BeforeKey' },
                { $ref: '#/components/parameters/Limit' },
                { $ref: '#/components/parameters/Sort' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          parameters: {
            AfterKey: { name: 'after_key', in: 'query', schema: { type: 'string' } },
            BeforeKey: { name: 'before_key', in: 'query', schema: { type: 'string' } },
            Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } },
            Sort: { name: 'sort', in: 'query', schema: { type: 'string' } }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings.filter(f => f.severity === 'error')).toHaveLength(0);
      expect(result.score.pagination.add).toBe(8);
    });

    it('should handle mixed inline and reference parameters', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/AfterKey' },
                { name: 'before_key', in: 'query', schema: { type: 'string' } },
                { $ref: '#/components/parameters/Limit' },
                { name: 'sort', in: 'query', schema: { type: 'string' } }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          parameters: {
            AfterKey: { name: 'after_key', in: 'query', schema: { type: 'string' } },
            Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } }
          }
        }
      };

      const result = checkPagination(spec);

      // Should fail because BeforeKey reference is missing (inline param doesn't match ref check)
      const keysetFindings = result.findings.filter(f => f.ruleId === 'PAG-KEYSET');
      expect(keysetFindings).toHaveLength(1);
    });

    it('should handle invalid parameter references', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/NonExistent' },
                { $ref: 'invalid-reference' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PAG-KEYSET',
            message: 'Missing key-set pagination parameters (AfterKey/BeforeKey/Limit).'
          })
        ])
      );
    });
  });

  describe('Scoring Logic', () => {
    it('should allocate points correctly for each requirement', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/AfterKey' },
                { $ref: '#/components/parameters/BeforeKey' },
                { $ref: '#/components/parameters/Limit' },
                { $ref: '#/components/parameters/Sort' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          parameters: {
            AfterKey: { name: 'after_key', in: 'query', schema: { type: 'string' } },
            BeforeKey: { name: 'before_key', in: 'query', schema: { type: 'string' } },
            Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } },
            Sort: { name: 'sort', in: 'query', schema: { type: 'string' } }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.score.pagination.add).toBe(8); // 5 (keyset) + 2 (filters) + 1 (sort)
      expect(result.score.pagination.max).toBe(8);
    });

    it('should have partial scoring when some requirements are missing', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/AfterKey' },
                { $ref: '#/components/parameters/BeforeKey' },
                { $ref: '#/components/parameters/Limit' }
                // Missing Sort
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: {
          parameters: {
            AfterKey: { name: 'after_key', in: 'query', schema: { type: 'string' } },
            BeforeKey: { name: 'before_key', in: 'query', schema: { type: 'string' } },
            Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.score.pagination.add).toBe(7); // 5 (keyset) + 2 (filters) + 0 (sort)
    });

    it('should have zero keyset score when parameters are missing', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkPagination(spec);

      expect(result.score.pagination.add).toBe(2); // 0 (keyset) + 2 (filters) + 0 (sort)
      expect(result.autoFailReasons).toContain('Offset/page pagination detected or missing key-set params');
    });
  });

  describe('Performance with Large Specs', () => {
    it('should handle large number of endpoints efficiently', () => {
      const paths: any = {};
      for (let i = 0; i < 100; i++) {
        paths[`/api/v2/collection${i}`] = {
          get: {
            responses: { '200': { description: 'Success' } }
          }
        };
        paths[`/api/v2/collection${i}/{id}`] = {
          get: {
            responses: { '200': { description: 'Success' } }
          }
        };
      }

      const spec = {
        openapi: '3.0.3',
        info: { title: 'Large API', version: '1.0.0' },
        paths
      };

      const start = performance.now();
      const result = checkPagination(spec);
      const end = performance.now();

      expect(end - start).toBeLessThan(1000); // Should complete in less than 1 second
      expect(result.findings.filter(f => f.ruleId === 'PAG-KEYSET')).toHaveLength(100);
      expect(result.autoFailReasons).toContain('Offset/page pagination detected or missing key-set params');
    });
  });
});