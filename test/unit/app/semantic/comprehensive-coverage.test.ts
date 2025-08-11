import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { checkComprehensive } from '../../../../src/app/semantic/comprehensive';

describe('comprehensive.ts - Additional Branch Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Edge cases and additional branch coverage', () => {
    it('should handle spec with no openapi version field', () => {
      const spec = {
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'OAS-VERSION',
          severity: 'error'
        })
      );
      expect(result.autoFailReasons).toContain('OpenAPI version not 3.0.3');
    });

    it('should handle spec with wrong openapi version', () => {
      const spec = {
        openapi: '3.1.0', // Wrong version
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'OAS-VERSION',
          severity: 'error'
        })
      );
    });

    it('should handle spec with no info section', () => {
      const spec = {
        openapi: '3.0.3',
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'INFO-CONTACT',
          severity: 'warn'
        })
      );
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'INFO-VERSION',
          severity: 'warn'
        })
      );
    });

    it('should handle spec with empty info section', () => {
      const spec = {
        openapi: '3.0.3',
        info: {},
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'INFO-CONTACT'
        })
      );
    });

    it('should handle info section with contact but no email', () => {
      const spec = {
        openapi: '3.0.3',
        info: {
          title: 'Test API',
          version: '1.0.0',
          contact: {
            name: 'Support Team'
          }
        },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'INFO-CONTACT',
          severity: 'warn'
        })
      );
    });

    it('should handle version that doesnt match semantic versioning pattern', () => {
      const spec = {
        openapi: '3.0.3',
        info: {
          title: 'Test API',
          version: 'v1-beta' // Non-semantic version
        },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'INFO-VERSION',
          severity: 'warn'
        })
      );
    });

    it('should handle paths that dont start with /api/v2/', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/v1/products': {
            get: { responses: { '200': { description: 'OK' } } }
          },
          '/legacy/users': {
            post: { responses: { '201': { description: 'Created' } } }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'PATH-STRUCTURE',
          severity: 'error',
          message: 'Path must start with /api/v2/: /v1/products'
        })
      );
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'PATH-STRUCTURE',
          severity: 'error',
          message: 'Path must start with /api/v2/: /legacy/users'
        })
      );
    });

    it('should handle operations with $ref parameters at path level', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            parameters: [
              { $ref: '#/components/parameters/OrganizationHeader' },
              { $ref: '#/components/parameters/BranchHeader' }
            ],
            get: {
              responses: { '200': { description: 'OK' } }
            }
          }
        },
        components: {
          parameters: {
            OrganizationHeader: {
              name: 'X-Organization-ID',
              in: 'header'
            },
            BranchHeader: {
              name: 'X-Branch-ID',
              in: 'header'
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should NOT have SEC-ORG-HDR or SEC-BRANCH-HDR errors since they're present via $ref
      const orgErrors = result.findings.filter(f => f.ruleId === 'SEC-ORG-HDR');
      const branchErrors = result.findings.filter(f => f.ruleId === 'SEC-BRANCH-HDR');
      
      expect(orgErrors).toHaveLength(0);
      expect(branchErrors).toHaveLength(0);
    });

    it('should handle operations with mix of $ref and direct parameters', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            parameters: [
              { $ref: '#/components/parameters/OrganizationHeader' }
            ],
            get: {
              parameters: [
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: { '200': { description: 'OK' } }
            }
          }
        },
        components: {
          parameters: {
            OrganizationHeader: {
              name: 'X-Organization-ID',
              in: 'header'
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should not have errors since both headers are present
      const orgErrors = result.findings.filter(f => f.ruleId === 'SEC-ORG-HDR');
      const branchErrors = result.findings.filter(f => f.ruleId === 'SEC-BRANCH-HDR');
      
      expect(orgErrors).toHaveLength(0);
      expect(branchErrors).toHaveLength(0);
    });

    it('should detect forbidden pagination parameters', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' },
                { name: 'offset', in: 'query' }, // Forbidden
                { name: 'page', in: 'query' }, // Forbidden
                { name: 'cursor', in: 'query' } // Forbidden
              ],
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'PAG-FORBIDDEN',
          severity: 'error',
          message: 'Forbidden pagination parameter: offset'
        })
      );
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'PAG-FORBIDDEN',
          severity: 'error',
          message: 'Forbidden pagination parameter: page'
        })
      );
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'PAG-FORBIDDEN',
          severity: 'error',
          message: 'Forbidden pagination parameter: cursor'
        })
      );
    });

    it('should handle error responses with $ref', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '200': { description: 'OK' },
                '400': { $ref: '#/components/responses/BadRequest' },
                '401': { $ref: '#/components/responses/Unauthorized' }
              }
            }
          }
        },
        components: {
          responses: {
            BadRequest: {
              description: 'Bad Request',
              content: {
                'application/problem+json': {
                  schema: { type: 'object' }
                }
              }
            },
            Unauthorized: {
              description: 'Unauthorized',
              content: {
                'application/problem+json': {
                  schema: { type: 'object' }
                }
              },
              headers: {
                'WWW-Authenticate': {
                  schema: { type: 'string' }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should not have ERR-PROBLEMJSON errors since responses have problem+json
      const problemJsonErrors = result.findings.filter(f => f.ruleId === 'ERR-PROBLEMJSON');
      expect(problemJsonErrors).toHaveLength(0);

      // Should not have HTTP-401-AUTH error since WWW-Authenticate header is present
      const authErrors = result.findings.filter(f => f.ruleId === 'HTTP-401-AUTH');
      expect(authErrors).toHaveLength(0);
    });

    it('should handle 401 responses with $ref headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '401': {
                  description: 'Unauthorized',
                  content: {
                    'application/problem+json': {
                      schema: { type: 'object' }
                    }
                  },
                  headers: {
                    'WWW-Authenticate': { $ref: '#/components/headers/WWWAuthenticate' }
                  }
                }
              }
            }
          }
        },
        components: {
          headers: {
            WWWAuthenticate: {
              schema: { type: 'string' }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should not have HTTP-401-AUTH error since WWW-Authenticate header is present via $ref
      const authErrors = result.findings.filter(f => f.ruleId === 'HTTP-401-AUTH');
      expect(authErrors).toHaveLength(0);
    });

    it('should handle 429 and 503 responses with Retry-After headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '200': { description: 'OK' },
                '429': {
                  description: 'Too Many Requests',
                  content: {
                    'application/problem+json': {
                      schema: { type: 'object' }
                    }
                  },
                  headers: {
                    'Retry-After': { schema: { type: 'integer' } }
                  }
                },
                '503': {
                  description: 'Service Unavailable',
                  content: {
                    'application/problem+json': {
                      schema: { type: 'object' }
                    }
                  },
                  headers: {
                    'Retry-After': { $ref: '#/components/headers/RetryAfter' }
                  }
                }
              }
            }
          }
        },
        components: {
          headers: {
            RetryAfter: {
              schema: { type: 'integer' }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should not have HTTP-429-RETRY or HTTP-503-RETRY warnings since Retry-After headers are present
      const retryErrors = result.findings.filter(f => f.ruleId.includes('RETRY'));
      expect(retryErrors).toHaveLength(0);
    });

    it('should handle 202 responses without required headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/async-operation': {
            post: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '202': {
                  description: 'Accepted',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                  // Missing Location and Retry-After headers
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'ASYNC-202-LOCATION',
          severity: 'error',
          message: '202 response must include Location header'
        })
      );
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'ASYNC-202-RETRY',
          severity: 'warn',
          message: '202 response should include Retry-After header'
        })
      );
    });

    it('should handle 202 responses with $ref for headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/async-operation': {
            post: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '202': {
                  $ref: '#/components/responses/AsyncAccepted'
                }
              }
            }
          }
        },
        components: {
          responses: {
            AsyncAccepted: {
              description: 'Accepted',
              headers: {
                'Location': { schema: { type: 'string' } },
                'Retry-After': { schema: { type: 'integer' } }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should not have ASYNC-202-* errors since headers are present via $ref
      const asyncErrors = result.findings.filter(f => f.ruleId.startsWith('ASYNC-202'));
      expect(asyncErrors).toHaveLength(0);
    });

    it('should handle response envelope checking for non-async endpoints', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          data: { type: 'array' } // Missing success field
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'ENV-RESPONSE',
          severity: 'error',
          message: '2xx responses must use ResponseEnvelope'
        })
      );
    });

    it('should skip envelope check for job endpoints', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/jobs/status': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '200': {
                  description: 'Job Status',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' },
                          progress: { type: 'number' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should not have ENV-RESPONSE error for job endpoints
      const envelopeErrors = result.findings.filter(f => f.ruleId === 'ENV-RESPONSE');
      expect(envelopeErrors).toHaveLength(0);
    });

    it('should handle AsyncJobStatus schema references', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/regular-endpoint': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        $ref: '#/components/schemas/AsyncJobStatus'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        components: {
          schemas: {
            AsyncJobStatus: {
              type: 'object',
              properties: {
                jobId: { type: 'string' },
                status: { type: 'string' }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should not have ENV-RESPONSE error for AsyncJobStatus responses
      const envelopeErrors = result.findings.filter(f => f.ruleId === 'ENV-RESPONSE');
      expect(envelopeErrors).toHaveLength(0);
    });

    it('should handle missing security schemes components', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: { '200': { description: 'OK' } }
            }
          }
        }
        // Missing components section entirely
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'SEC-OAUTH2',
          severity: 'error',
          message: 'OAuth2 security scheme required'
        })
      );
    });

    it('should handle OAuth2 security scheme without flows', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            OAuth2: {
              type: 'oauth2'
              // Missing flows
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'SEC-OAUTH2',
          severity: 'error',
          message: 'OAuth2 must have proper flows'
        })
      );
    });

    it('should handle list endpoints missing keyset pagination', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': { // List endpoint (GET without path params)
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
                // Missing after_key, before_key, limit
              ],
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'PAG-KEYSET',
          severity: 'error',
          message: 'List endpoints must have after_key, before_key, and limit'
        })
      );
    });

    it('should skip keyset pagination check for non-list endpoints', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products/{id}': { // Not a list endpoint (has path param)
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' },
                { name: 'id', in: 'path', required: true }
              ],
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should not have PAG-KEYSET error for single resource endpoints
      const pagesetErrors = result.findings.filter(f => f.ruleId === 'PAG-KEYSET');
      expect(pagesetErrors).toHaveLength(0);
    });

    it('should detect forbidden technology in technical content', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        servers: [
          { url: 'https://api.kafka.example.com' } // Forbidden tech in server URL
        ],
        'x-platform-constraints': {
          'messaging': 'kafka-broker:9092', // Forbidden tech in extension
          'cache': 'redis-server:6379' // Forbidden tech
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'TECH-FORBIDDEN-KAFKA',
          severity: 'error',
          message: 'Forbidden technology: kafka. Use Pulsar instead'
        })
      );
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'TECH-FORBIDDEN-REDIS',
          severity: 'error',
          message: 'Forbidden technology: redis. Use Dragonfly/Valkey instead'
        })
      );
    });

    it('should handle forbidden tech with negative patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        'x-platform-constraints': {
          'messaging': 'no-kafka, use-pulsar-instead',
          'note': 'we-do-not-use-redis-anymore'
        }
      };

      const result = checkComprehensive(spec);

      // Should not detect forbidden tech when used in negative context
      const forbiddenErrors = result.findings.filter(f => f.ruleId.startsWith('TECH-FORBIDDEN'));
      expect(forbiddenErrors).toHaveLength(0);
    });

    it('should handle missing components sections', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
        // No components section
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'COMP-SCHEMAS',
          severity: 'warn',
          message: 'No reusable schemas defined'
        })
      );
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'COMP-PARAMS',
          severity: 'warn',
          message: 'No reusable parameters defined'
        })
      );
    });

    it('should handle empty components sections', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {},
          parameters: {}
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'COMP-SCHEMAS',
          severity: 'warn'
        })
      );
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          ruleId: 'COMP-PARAMS',
          severity: 'warn'
        })
      );
    });

    it('should check for rate limiting headers in success responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: { type: 'array' }
                        }
                      }
                    }
                  },
                  headers: {
                    'X-RateLimit-Limit': { schema: { type: 'integer' } },
                    'X-RateLimit-Remaining': { schema: { type: 'integer' } },
                    'X-RateLimit-Reset': { schema: { type: 'integer' } }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      // Should not have HTTP-RATE-LIMIT warning since all headers are present
      const rateLimitErrors = result.findings.filter(f => f.ruleId === 'HTTP-RATE-LIMIT');
      expect(rateLimitErrors).toHaveLength(0);
    });

    it('should award bonus points for comprehensive error responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { 
          title: 'Test', 
          version: '1.0.0',
          contact: { email: 'test@example.com' }
        },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' },
                { name: 'after_key', in: 'query' },
                { name: 'before_key', in: 'query' },
                { name: 'limit', in: 'query' }
              ],
              responses: { 
                '200': { 
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: { type: 'array' }
                        }
                      }
                    }
                  },
                  headers: {
                    'X-RateLimit-Limit': { schema: { type: 'integer' } },
                    'X-RateLimit-Remaining': { schema: { type: 'integer' } },
                    'X-RateLimit-Reset': { schema: { type: 'integer' } }
                  }
                }
              }
            }
          }
        },
        components: {
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: {
                clientCredentials: {
                  tokenUrl: 'https://auth.example.com/oauth/token'
                }
              }
            }
          },
          schemas: {
            Product: { type: 'object' }
          },
          parameters: {
            OrganizationHeader: { name: 'X-Organization-ID', in: 'header' }
          },
          responses: {
            BadRequest: { description: 'Bad Request' },
            Unauthorized: { description: 'Unauthorized' },
            Forbidden: { description: 'Forbidden' },
            NotFound: { description: 'Not Found' },
            Conflict: { description: 'Conflict' },
            UnprocessableEntity: { description: 'Unprocessable Entity' },
            TooManyRequests: { description: 'Too Many Requests' },
            InternalServerError: { description: 'Internal Server Error' },
            BadGateway: { description: 'Bad Gateway' },
            ServiceUnavailable: { description: 'Service Unavailable' },
            GatewayTimeout: { description: 'Gateway Timeout' }
          },
          headers: {
            'X-Request-ID': { schema: { type: 'string' } },
            'X-Rate-Limit': { schema: { type: 'integer' } },
            'X-API-Version': { schema: { type: 'string' } },
            'Cache-Control': { schema: { type: 'string' } },
            'ETag': { schema: { type: 'string' } }
          }
        },
        'x-rate-limiting': 'enabled',
        'x-caching-strategy': 'redis',
        'x-performance-slas': '99.9%'
      };

      const result = checkComprehensive(spec);

      // Should have high score due to bonus points
      expect(result.score.comprehensive.add).toBeGreaterThan(85);
    });

    it('should handle API ID generation with missing title', () => {
      const spec = {
        openapi: '3.0.3',
        info: {
          version: '1.0.0'
          // Missing title
        },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.metadata.apiId).toBe('mocked-hash-value'); // From mocked crypto
    });

    it('should handle API ID generation with missing version', () => {
      const spec = {
        openapi: '3.0.3',
        info: {
          title: 'Test API'
          // Missing version
        },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.metadata.apiId).toBe('mocked-hash-value'); // From mocked crypto
    });

    it('should handle x-api-id override', () => {
      const spec = {
        openapi: '3.0.3',
        'x-api-id': 'custom-api-id',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.metadata.apiId).toBe('custom-api-id');
    });

    it('should handle null/undefined spec fields gracefully', () => {
      const spec = {
        openapi: '3.0.3',
        info: null,
        paths: null,
        components: undefined
      };

      const result = checkComprehensive(spec);

      // Should not crash and should report appropriate findings
      expect(result.findings).toBeDefined();
      expect(result.score).toBeDefined();
      expect(result.autoFailReasons).toBeDefined();
    });

    it('should handle response with schema reference to ProblemDetail', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' }
              ],
              responses: {
                '400': {
                  description: 'Bad Request',
                  content: {
                    'application/json': {
                      schema: {
                        $ref: '#/components/schemas/ProblemDetail'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        components: {
          schemas: {
            ProblemDetail: {
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

      const result = checkComprehensive(spec);

      // Should not have ERR-PROBLEMJSON error since schema reference contains ProblemDetail
      const problemJsonErrors = result.findings.filter(f => f.ruleId === 'ERR-PROBLEMJSON');
      expect(problemJsonErrors).toHaveLength(0);
    });

    it('should cap final score at maxScore', () => {
      // Create a spec that would score very high to test capping
      const perfectSpec = {
        openapi: '3.0.3',
        'x-api-id': 'perfect-api',
        info: {
          title: 'Perfect API',
          version: '1.0.0',
          contact: { email: 'perfect@example.com' }
        },
        paths: {
          '/api/v2/products': {
            get: {
              parameters: [
                { name: 'X-Organization-ID', in: 'header' },
                { name: 'X-Branch-ID', in: 'header' },
                { name: 'after_key', in: 'query' },
                { name: 'before_key', in: 'query' },
                { name: 'limit', in: 'query' }
              ],
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: { type: 'array' }
                        }
                      }
                    }
                  },
                  headers: {
                    'X-RateLimit-Limit': { schema: { type: 'integer' } },
                    'X-RateLimit-Remaining': { schema: { type: 'integer' } },
                    'X-RateLimit-Reset': { schema: { type: 'integer' } }
                  }
                }
              }
            }
          }
        },
        components: {
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: { clientCredentials: { tokenUrl: 'https://auth.example.com/token' } }
            }
          },
          schemas: Array.from({length: 20}, (_, i) => [`Schema${i}`, {type: 'object'}]).reduce((acc, [k, v]) => ({...acc, [k as string]: v}), {}),
          parameters: Array.from({length: 20}, (_, i) => [`Param${i}`, {name: `param${i}`, in: 'query'}]).reduce((acc, [k, v]) => ({...acc, [k as string]: v}), {}),
          responses: Array.from({length: 15}, (_, i) => [`Response${i}`, {description: `Response ${i}`}]).reduce((acc, [k, v]) => ({...acc, [k as string]: v}), {}),
          headers: Array.from({length: 10}, (_, i) => [`Header${i}`, {schema: {type: 'string'}}]).reduce((acc, [k, v]) => ({...acc, [k as string]: v}), {})
        },
        'x-rate-limiting': true,
        'x-caching-strategy': 'distributed',
        'x-performance-slas': '99.99%',
        'x-platform-constraints': 'none'
      };

      const result = checkComprehensive(perfectSpec);

      // Final score should be capped at 100
      expect(result.score.comprehensive.add).toBeLessThanOrEqual(100);
      expect(result.score.comprehensive.max).toBe(100);
    });
  });
});