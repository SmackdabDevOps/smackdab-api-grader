import { describe, it, expect } from '@jest/globals';
import { calculateMetrics, compareMetrics } from '../src/app/tracking/metrics-calculator.js';

describe('Metrics Calculator', () => {
  describe('calculateMetrics', () => {
    it('should count endpoints correctly', async () => {
      const spec = {
        paths: {
          '/users': {
            get: { responses: { '200': { description: 'OK' } } },
            post: { responses: { '201': { description: 'Created' } } }
          },
          '/users/{id}': {
            get: { responses: { '200': { description: 'OK' } } },
            put: { responses: { '200': { description: 'OK' } } },
            delete: { responses: { '204': { description: 'No Content' } } }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.endpointCount).toBe(5);
    });

    it('should count schemas correctly', async () => {
      const spec = {
        components: {
          schemas: {
            User: { type: 'object' },
            Product: { type: 'object' },
            Order: { type: 'object' }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.schemaCount).toBe(3);
    });

    it('should detect pagination', async () => {
      const spec = {
        paths: {
          '/users': {
            get: {
              parameters: [
                { name: 'page', in: 'query' },
                { name: 'limit', in: 'query' }
              ],
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.hasPagination).toBe(true);
    });

    it('should detect rate limiting', async () => {
      const spec = {
        paths: {
          '/api/data': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  headers: {
                    'X-RateLimit-Limit': { schema: { type: 'integer' } }
                  }
                }
              }
            }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.hasRateLimiting).toBe(true);
    });

    it('should detect webhooks', async () => {
      const spec = {
        webhooks: {
          userCreated: {
            post: {
              requestBody: { content: { 'application/json': {} } }
            }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.hasWebhooks).toBe(true);
    });

    it('should detect async patterns via callbacks', async () => {
      const spec = {
        paths: {
          '/subscribe': {
            post: {
              callbacks: {
                onData: {
                  '{$request.body#/callbackUrl}': {
                    post: { requestBody: {} }
                  }
                }
              },
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.hasAsyncPatterns).toBe(true);
    });

    it('should identify security schemes', async () => {
      const spec = {
        components: {
          securitySchemes: {
            OAuth2: { type: 'oauth2', flows: {} },
            ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
            BearerAuth: { type: 'http', scheme: 'bearer' }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.securitySchemeCount).toBe(3);
      expect(metrics.authMethods).toContain('oauth2');
      expect(metrics.authMethods).toContain('apiKey');
      expect(metrics.authMethods).toContain('http');
      expect(metrics.hasOAuth).toBe(true);
      expect(metrics.hasApiKey).toBe(true);
      expect(metrics.hasJWT).toBe(true);
    });

    it('should detect RFC7807 error format', async () => {
      const spec = {
        components: {
          schemas: {
            ProblemDetails: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'integer' }
              }
            }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.errorFormat).toBe('rfc7807');
      expect(metrics.hasStandardizedErrors).toBe(true);
    });

    it('should calculate documentation coverage', async () => {
      const spec = {
        paths: {
          '/users': {
            get: {
              summary: 'Get users',
              description: 'Retrieve all users',
              responses: { '200': { description: 'OK' } }
            },
            post: {
              // No documentation
              responses: { '201': { description: 'Created' } }
            }
          }
        },
        components: {
          schemas: {
            User: {
              description: 'User model',
              example: { id: 1, name: 'John' }
            },
            Product: {
              // No documentation or example
            }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.endpointDocumentedPct).toBe(50); // 1 of 2 endpoints
      expect(metrics.schemaDocumentedPct).toBe(50); // 1 of 2 schemas
      expect(metrics.exampleCoveragePct).toBe(50); // 1 of 2 schemas has example
    });

    it('should calculate path depth metrics', async () => {
      const spec = {
        paths: {
          '/users': { get: { responses: {} } },
          '/users/{id}': { get: { responses: {} } },
          '/users/{id}/posts/{postId}/comments': { get: { responses: {} } }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.maxPathDepth).toBe(5); // users/id/posts/postId/comments
      expect(metrics.averagePathDepth).toBeCloseTo(2.67, 1);
    });

    it('should detect HATEOAS via links', async () => {
      const spec = {
        paths: {
          '/users/{id}': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  links: {
                    GetUserPosts: {
                      operationId: 'getUserPosts',
                      parameters: { userId: '$response.body#/id' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.hasHATEOAS).toBe(true);
    });

    it('should detect field filtering parameters', async () => {
      const spec = {
        paths: {
          '/users': {
            get: {
              parameters: [
                { name: 'fields', in: 'query', description: 'Fields to include' }
              ],
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.hasFieldFiltering).toBe(true);
    });

    it('should check info section completeness', async () => {
      const spec = {
        info: {
          title: 'API',
          version: '1.0.0',
          contact: { email: 'api@example.com' },
          license: { name: 'MIT' },
          termsOfService: 'https://example.com/terms'
        }
      };

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.hasContactInfo).toBe(true);
      expect(metrics.hasLicense).toBe(true);
      expect(metrics.hasTermsOfService).toBe(true);
    });

    it('should handle empty spec gracefully', async () => {
      const spec = {};

      const metrics = await calculateMetrics(spec);
      
      expect(metrics.endpointCount).toBe(0);
      expect(metrics.schemaCount).toBe(0);
      expect(metrics.hasPagination).toBe(false);
      expect(metrics.authMethods).toEqual([]);
    });
  });

  describe('compareMetrics', () => {
    it('should identify improvements', () => {
      const baseline = {
        endpointCount: 10,
        schemaCount: 5,
        endpointDocumentedPct: 50,
        hasPagination: false
      } as any;

      const current = {
        endpointCount: 15,
        schemaCount: 8,
        endpointDocumentedPct: 75,
        hasPagination: true
      } as any;

      const result = compareMetrics(baseline, current);
      
      expect(result.improvements).toHaveLength(4);
      expect(result.improvements[0].metric).toBe('endpointCount');
      expect(result.improvements[0].from).toBe(10);
      expect(result.improvements[0].to).toBe(15);
      expect(result.improvements[0].change).toBe(50); // 50% increase
    });

    it('should identify regressions', () => {
      const baseline = {
        endpointDocumentedPct: 80,
        schemaDocumentedPct: 90,
        hasRateLimiting: true
      } as any;

      const current = {
        endpointDocumentedPct: 60,
        schemaDocumentedPct: 70,
        hasRateLimiting: false
      } as any;

      const result = compareMetrics(baseline, current);
      
      expect(result.regressions).toHaveLength(3);
      expect(result.regressions[0].metric).toBe('endpointDocumentedPct');
      expect(result.regressions[0].from).toBe(80);
      expect(result.regressions[0].to).toBe(60);
      expect(result.regressions[0].change).toBe(-25); // 25% decrease
    });

    it('should identify unchanged metrics', () => {
      const baseline = {
        endpointCount: 10,
        schemaCount: 5,
        endpointDocumentedPct: 75,
        schemaDocumentedPct: 80,
        exampleCoveragePct: 60
      } as any;

      const current = {
        endpointCount: 10,
        schemaCount: 5,
        endpointDocumentedPct: 75,
        schemaDocumentedPct: 80,
        exampleCoveragePct: 60
      } as any;

      const result = compareMetrics(baseline, current);
      
      expect(result.unchanged).toHaveLength(5);
      expect(result.unchanged.find(u => u.metric === 'endpointCount')).toBeDefined();
      expect(result.unchanged.find(u => u.metric === 'endpointCount')?.value).toBe(10);
    });
  });
});