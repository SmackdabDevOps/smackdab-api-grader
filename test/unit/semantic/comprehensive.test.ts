/**
 * Comprehensive Semantic Module Unit Tests
 * 
 * Tests the comprehensive API validation that combines all semantic rules:
 * - OpenAPI version compliance (OAS-VERSION)
 * - Info section validation (INFO-CONTACT, INFO-VERSION)
 * - Multi-tenancy headers (SEC-ORG-HDR, SEC-BRANCH-HDR)
 * - Security schemes (SEC-OAUTH2)
 * - Path structure (PATH-STRUCTURE)
 * - Pagination (PAG-KEYSET, PAG-FORBIDDEN)
 * - Error responses (ERR-PROBLEMJSON)
 * - Async operations (ASYNC-202-LOCATION)
 * - Response envelopes (ENV-RESPONSE)
 * - Forbidden technologies (TECH-FORBIDDEN-*)
 * - Component organization (COMP-SCHEMAS, COMP-PARAMS)
 * - Rate limiting headers (HTTP-RATE-LIMIT)
 * 
 * This module provides the highest-level validation with auto-fail conditions.
 */

import { checkComprehensive } from '../../../src/app/semantic/comprehensive';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('Comprehensive Semantic Module', () => {
  describe('OpenAPI Version Validation', () => {
    it('should require OpenAPI 3.0.3', () => {
      const spec = {
        openapi: '3.0.2',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'OAS-VERSION',
            severity: 'error',
            message: 'OpenAPI version must be 3.0.3',
            jsonPath: '$.openapi',
            category: 'structure'
          })
        ])
      );
      expect(result.autoFailReasons).toContain('OpenAPI version not 3.0.3');
    });

    it('should pass with correct OpenAPI version', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'OAS-VERSION')).toHaveLength(0);
      expect(result.autoFailReasons).not.toContain('OpenAPI version not 3.0.3');
    });
  });

  describe('Info Section Validation', () => {
    it('should validate contact email presence', () => {
      const spec = {
        openapi: '3.0.3',
        info: { 
          title: 'Test API', 
          version: '1.0.0'
          // Missing contact
        },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'INFO-CONTACT',
            severity: 'warn',
            message: 'Missing contact email',
            jsonPath: '$.info.contact.email',
            category: 'info'
          })
        ])
      );
    });

    it('should validate semantic versioning', () => {
      const spec = {
        openapi: '3.0.3',
        info: { 
          title: 'Test API', 
          version: 'v1'  // Invalid version format
        },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'INFO-VERSION',
            severity: 'warn',
            message: 'Version should follow semantic versioning',
            jsonPath: '$.info.version',
            category: 'info'
          })
        ])
      );
    });

    it('should pass with complete info section', () => {
      const spec = {
        openapi: '3.0.3',
        info: { 
          title: 'Test API', 
          version: '1.2.3',
          contact: {
            email: 'api@example.com'
          }
        },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId.startsWith('INFO-'))).toHaveLength(0);
    });
  });

  describe('Multi-tenancy Header Validation', () => {
    it('should require X-Organization-ID on all operations', () => {
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

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SEC-ORG-HDR',
            severity: 'error',
            message: 'Missing X-Organization-ID header',
            category: 'security'
          })
        ])
      );
      expect(result.autoFailReasons).toContain('Missing X-Organization-ID on operations');
    });

    it('should require X-Branch-ID on all operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SEC-BRANCH-HDR',
            severity: 'error',
            message: 'Missing X-Branch-ID header',
            category: 'security'
          })
        ])
      );
      expect(result.autoFailReasons).toContain('Missing X-Branch-ID on operations');
    });

    it('should pass when both tenant headers are present', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'SEC-ORG-HDR')).toHaveLength(0);
      expect(result.findings.filter(f => f.ruleId === 'SEC-BRANCH-HDR')).toHaveLength(0);
      expect(result.autoFailReasons).not.toContain('Missing X-Organization-ID on operations');
      expect(result.autoFailReasons).not.toContain('Missing X-Branch-ID on operations');
    });
  });

  describe('Security Schemes Validation', () => {
    it('should require OAuth2 security scheme', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SEC-OAUTH2',
            severity: 'error',
            message: 'OAuth2 security scheme required',
            jsonPath: '$.components.securitySchemes',
            category: 'security'
          })
        ])
      );
    });

    it('should validate OAuth2 flows', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
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

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SEC-OAUTH2',
            severity: 'error',
            message: 'OAuth2 must have proper flows',
            jsonPath: '$.components.securitySchemes.OAuth2',
            category: 'security'
          })
        ])
      );
    });

    it('should pass with proper OAuth2 configuration', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: {
                authorizationCode: {
                  authorizationUrl: 'https://auth.example.com/oauth/authorize',
                  tokenUrl: 'https://auth.example.com/oauth/token',
                  scopes: {
                    read: 'Read access',
                    write: 'Write access'
                  }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'SEC-OAUTH2')).toHaveLength(0);
    });
  });

  describe('Path Structure Validation', () => {
    it('should require /api/v2/ prefix', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { responses: { '200': { description: 'Success' } } }
          },
          '/api/v1/products': {
            get: { responses: { '200': { description: 'Success' } } }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PATH-STRUCTURE',
            severity: 'error',
            message: 'Path must start with /api/v2/: /users',
            jsonPath: "$.paths['/users']",
            category: 'naming'
          })
        ])
      );
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PATH-STRUCTURE',
            severity: 'error',
            message: 'Path must start with /api/v2/: /api/v1/products',
            jsonPath: "$.paths['/api/v1/products']",
            category: 'naming'
          })
        ])
      );
      expect(result.autoFailReasons).toContain('Invalid path structure');
    });

    it('should pass with correct path structure', () => {
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

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'PATH-STRUCTURE')).toHaveLength(0);
      expect(result.autoFailReasons).not.toContain('Invalid path structure');
    });
  });

  describe('Pagination Validation', () => {
    it('should detect forbidden offset pagination', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'offset',
                  in: 'query',
                  schema: { type: 'integer' }
                }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PAG-FORBIDDEN',
            severity: 'error',
            message: 'Forbidden pagination parameter: offset',
            jsonPath: "$.paths['/api/v2/users'].get.parameters",
            category: 'pagination'
          })
        ])
      );
      expect(result.autoFailReasons).toContain('Forbidden pagination parameter: offset');
    });

    it('should require key-set pagination', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PAG-KEYSET',
            severity: 'error',
            message: 'List endpoints must have after_key, before_key, and limit',
            category: 'pagination'
          })
        ])
      );
      expect(result.autoFailReasons).toContain('Missing key-set pagination');
    });

    it('should pass with proper key-set pagination', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'after_key',
                  in: 'query',
                  schema: { type: 'string' }
                },
                {
                  name: 'before_key',
                  in: 'query',
                  schema: { type: 'string' }
                },
                {
                  name: 'limit',
                  in: 'query',
                  schema: { type: 'integer' }
                }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'PAG-KEYSET')).toHaveLength(0);
      expect(result.autoFailReasons).not.toContain('Missing key-set pagination');
    });
  });

  describe('Error Response Validation', () => {
    it('should require application/problem+json for errors', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            post: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '201': { description: 'Created' },
                '400': {
                  description: 'Bad request',
                  content: {
                    'application/json': {  // Should be application/problem+json
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'ERR-PROBLEMJSON',
            severity: 'error',
            message: 'Error response 400 must use application/problem+json',
            category: 'responses'
          })
        ])
      );
    });

    it('should validate WWW-Authenticate on 401 responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '200': { description: 'Success' },
                '401': {
                  description: 'Unauthorized',
                  content: {
                    'application/problem+json': {
                      schema: { type: 'object' }
                    }
                  }
                  // Missing WWW-Authenticate header
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-401-AUTH',
            severity: 'error',
            message: '401 response must include WWW-Authenticate header',
            category: 'http'
          })
        ])
      );
    });

    it('should validate Retry-After on 429/503 responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '200': { description: 'Success' },
                '429': {
                  description: 'Too Many Requests',
                  content: {
                    'application/problem+json': {
                      schema: { type: 'object' }
                    }
                  }
                  // Missing Retry-After header
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-429-RETRY',
            severity: 'warn',
            message: '429 response should include Retry-After header',
            category: 'http'
          })
        ])
      );
    });
  });

  describe('Async Operations Validation', () => {
    it('should require Location header on 202 responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/bulk-operations': {
            post: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '202': {
                  description: 'Accepted',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                  // Missing Location header
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'ASYNC-202-LOCATION',
            severity: 'error',
            message: '202 response must include Location header',
            category: 'async'
          })
        ])
      );
    });

    it('should pass with proper async operation headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/bulk-operations': {
            post: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '202': {
                  description: 'Accepted',
                  headers: {
                    'Location': {
                      schema: { type: 'string' }
                    },
                    'Retry-After': {
                      schema: { type: 'integer' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'ASYNC-202-LOCATION')).toHaveLength(0);
      expect(result.findings.filter(f => f.ruleId === 'ASYNC-202-RETRY')).toHaveLength(0);
    });
  });

  describe('Response Envelope Validation', () => {
    it('should require ResponseEnvelope for 2xx responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',  // Missing ResponseEnvelope structure
                        items: { type: 'object' }
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

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'ENV-RESPONSE',
            severity: 'error',
            message: '2xx responses must use ResponseEnvelope',
            category: 'envelope'
          })
        ])
      );
    });

    it('should pass with proper ResponseEnvelope structure', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
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
                          data: {
                            type: 'array',
                            items: { type: 'object' }
                          }
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

      expect(result.findings.filter(f => f.ruleId === 'ENV-RESPONSE')).toHaveLength(0);
    });

    it('should allow AsyncJobStatus without envelope', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/jobs/{id}': {
            get: {
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                },
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '200': {
                  description: 'Job status',
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
                id: { type: 'string' },
                status: { type: 'string' }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'ENV-RESPONSE')).toHaveLength(0);
    });
  });

  describe('Forbidden Technology Detection', () => {
    it('should detect forbidden technologies', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        'x-platform-constraints': {
          'message-broker': 'kafka',
          'cache': 'redis',
          'search': 'elasticsearch'
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'TECH-FORBIDDEN-KAFKA',
            severity: 'error',
            message: 'Forbidden technology: kafka. Use Pulsar instead',
            category: 'technology'
          })
        ])
      );
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'TECH-FORBIDDEN-REDIS',
            severity: 'error',
            message: 'Forbidden technology: redis. Use Dragonfly/Valkey instead',
            category: 'technology'
          })
        ])
      );
      expect(result.autoFailReasons).toContain('Forbidden technology: kafka');
      expect(result.autoFailReasons).toContain('Forbidden technology: redis');
    });

    it('should not flag negative technology mentions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { 
          title: 'Test API', 
          version: '1.0.0',
          description: 'This API does not use kafka, redis, or elasticsearch. Instead it uses Pulsar and Dragonfly.'
        },
        paths: {
          '/api/v2/users': {
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        'x-platform-constraints': {
          'no-kafka': true,
          'no-redis': true,
          'alternative-to-elasticsearch': 'postgresql-full-text-search'
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId.startsWith('TECH-FORBIDDEN-'))).toHaveLength(0);
    });
  });

  describe('Component Organization Validation', () => {
    it('should validate reusable schemas', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            },
            Error: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'COMP-SCHEMAS')).toHaveLength(0);
    });

    it('should warn about missing reusable schemas', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'COMP-SCHEMAS',
            severity: 'warn',
            message: 'No reusable schemas defined',
            jsonPath: '$.components.schemas',
            category: 'components'
          })
        ])
      );
    });

    it('should validate reusable parameters', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          parameters: {
            OrganizationHeader: {
              name: 'X-Organization-ID',
              in: 'header',
              required: true,
              schema: { type: 'integer' }
            },
            Limit: {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer' }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'COMP-PARAMS')).toHaveLength(0);
    });

    it('should warn about missing reusable parameters', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'COMP-PARAMS',
            severity: 'warn',
            message: 'No reusable parameters defined',
            jsonPath: '$.components.parameters',
            category: 'components'
          })
        ])
      );
    });
  });

  describe('Rate Limiting Validation', () => {
    it('should validate rate limit headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '200': {
                  description: 'Success',
                  headers: {
                    'X-RateLimit-Limit': {
                      schema: { type: 'integer' }
                    },
                    'X-RateLimit-Remaining': {
                      schema: { type: 'integer' }
                    },
                    'X-RateLimit-Reset': {
                      schema: { type: 'integer' }
                    }
                  },
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
                  }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-RATE-LIMIT')).toHaveLength(0);
    });

    it('should warn about missing rate limit headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                }
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
                  }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-RATE-LIMIT',
            severity: 'warn',
            message: 'Missing rate limit headers (X-RateLimit-Limit/Remaining/Reset)',
            jsonPath: '$.paths',
            category: 'http'
          })
        ])
      );
    });
  });

  describe('Scoring and Integration', () => {
    it('should calculate comprehensive score correctly', () => {
      const spec = {
        openapi: '3.0.3',
        info: { 
          title: 'Perfect API', 
          version: '1.2.3',
          contact: { email: 'api@example.com' }
        },
        paths: {
          '/api/v2/users': {
            get: {
              parameters: [
                {
                  name: 'X-Organization-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'X-Branch-ID',
                  in: 'header',
                  required: true,
                  schema: { type: 'integer' }
                },
                {
                  name: 'after_key',
                  in: 'query',
                  schema: { type: 'string' }
                },
                {
                  name: 'before_key',
                  in: 'query',
                  schema: { type: 'string' }
                },
                {
                  name: 'limit',
                  in: 'query',
                  schema: { type: 'integer' }
                }
              ],
              responses: {
                '200': {
                  description: 'Success',
                  headers: {
                    'X-RateLimit-Limit': { schema: { type: 'integer' } },
                    'X-RateLimit-Remaining': { schema: { type: 'integer' } },
                    'X-RateLimit-Reset': { schema: { type: 'integer' } }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: { type: 'array', items: { type: 'object' } }
                        }
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
            User: { type: 'object', properties: { id: { type: 'string' } } },
            Error: { type: 'object', properties: { message: { type: 'string' } } }
          },
          parameters: {
            OrganizationHeader: {
              name: 'X-Organization-ID',
              in: 'header',
              required: true,
              schema: { type: 'integer' }
            }
          },
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: {
                authorizationCode: {
                  authorizationUrl: 'https://auth.example.com/oauth/authorize',
                  tokenUrl: 'https://auth.example.com/oauth/token',
                  scopes: { read: 'Read access' }
                }
              }
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.score.comprehensive.add).toBeGreaterThan(50);
      expect(result.score.comprehensive.max).toBe(100);
      expect(result.autoFailReasons).toHaveLength(0);
      expect(result.metadata?.apiId).toBeDefined();
    });

    it('should apply auto-fail conditions correctly', () => {
      const spec = {
        openapi: '3.0.2',  // Wrong version
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {  // Wrong path structure
            get: {
              parameters: [
                { name: 'offset', in: 'query', schema: { type: 'integer' } }  // Forbidden pagination
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        'x-platform-constraints': {
          'broker': 'kafka'  // Forbidden technology
        }
      };

      const result = checkComprehensive(spec);

      expect(result.autoFailReasons).toEqual(
        expect.arrayContaining([
          'OpenAPI version not 3.0.3',
          'Missing X-Organization-ID on operations',
          'Missing X-Branch-ID on operations',
          'Invalid path structure',
          'Forbidden pagination parameter: offset',
          'Missing key-set pagination',
          'Forbidden technology: kafka'
        ])
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle specs with no paths', () => {
      const spec = MockOpenApiFactory.validMinimal();
      delete spec.paths;

      const result = checkComprehensive(spec);

      expect(result.findings).toBeDefined();
      expect(result.score.comprehensive.add).toBeGreaterThan(0);
      expect(result.metadata?.apiId).toBeDefined();
    });

    it('should handle null components gracefully', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: null
      };

      const result = checkComprehensive(spec);

      expect(result.score.comprehensive.add).toBeGreaterThan(0);
    });

    it('should handle malformed operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/test': {
            get: null
          },
          '/api/v2/broken': {
            post: {
              responses: null
            }
          }
        }
      };

      const result = checkComprehensive(spec);

      expect(result.score.comprehensive.add).toBeGreaterThan(0);
    });
  });

  describe('Performance with Large Specs', () => {
    it('should handle large specifications efficiently', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Large API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {},
          parameters: {}
        }
      };

      // Add many paths
      for (let i = 0; i < 100; i++) {
        (spec.paths as any)[`/api/v2/resource${i}`] = {
          get: {
            parameters: [
              {
                name: 'X-Organization-ID',
                in: 'header',
                required: true,
                schema: { type: 'integer' }
              },
              {
                name: 'X-Branch-ID',
                in: 'header',
                required: true,
                schema: { type: 'integer' }
              }
            ],
            responses: {
              '200': {
                description: `Resource ${i}`,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        };
      }

      // Add many schemas
      for (let i = 0; i < 50; i++) {
        (spec.components.schemas as any)[`Resource${i}`] = {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' }
          }
        };
      }

      const start = performance.now();
      const result = checkComprehensive(spec);
      const end = performance.now();

      expect(end - start).toBeLessThan(2000); // Should complete in reasonable time
      expect(result.score.comprehensive.add).toBeGreaterThan(0);
      expect(result.score.comprehensive.max).toBe(100);
    });
  });
});