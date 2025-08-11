/**
 * HTTP Semantics Module Unit Tests
 * 
 * Tests the HTTP semantics validation that ensures proper HTTP protocol compliance:
 * - ETag headers for cacheable responses (HTTP-ETAG)
 * - 304 Not Modified for conditional GET operations (HTTP-304)
 * - application/problem+json for error responses (ERR-PROBLEMJSON)
 * - Rate limiting headers on success responses (HTTP-RATE-LIMIT)
 * - Location header for 202 Accepted async operations (HTTP-202-LOCATION)
 * 
 * This module focuses on HTTP protocol semantics and compliance with web standards.
 */

import { checkHttpSemantics } from '../../../src/app/semantic/http_semantics';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('HTTP Semantics Module', () => {
  describe('ETag Header Validation', () => {
    it('should require ETag headers for cacheable GET responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { type: 'object' }
                      }
                    }
                  }
                  // Missing ETag header
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-ETAG',
            severity: 'warn',
            message: 'Missing ETag header on cacheable response',
            jsonPath: "$.paths['/users'].get.responses['200'].headers",
            category: 'http'
          })
        ])
      );
    });

    it('should require ETag headers for cacheable HEAD responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            head: {
              operationId: 'headUser',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': {
                  description: 'User exists',
                  headers: {
                    'Content-Length': {
                      schema: { type: 'integer' }
                    }
                    // Missing ETag header
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-ETAG',
            severity: 'warn',
            message: 'Missing ETag header on cacheable response',
            jsonPath: "$.paths['/users/{id}'].head.responses['200'].headers",
            category: 'http'
          })
        ])
      );
    });

    it('should pass when ETag header is present on cacheable responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  headers: {
                    'ETag': {
                      description: 'Entity tag for caching',
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
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
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-ETAG')).toHaveLength(0);
    });

    it('should not require ETag for non-cacheable methods', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              },
              responses: {
                '201': {
                  description: 'User created',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                  // No ETag required for POST
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-ETAG')).toHaveLength(0);
    });
  });

  describe('Conditional GET Validation', () => {
    it('should require 304 Not Modified response for GET operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': {
                  description: 'User details',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
                // Missing 304 response
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-304',
            severity: 'warn',
            message: 'Missing 304 Not Modified for conditional GET',
            jsonPath: "$.paths['/users/{id}'].get.responses",
            category: 'http'
          })
        ])
      );
    });

    it('should pass when 304 response is defined for GET operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                },
                {
                  name: 'If-None-Match',
                  in: 'header',
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': {
                  description: 'User details',
                  headers: {
                    'ETag': {
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                },
                '304': {
                  description: 'Not Modified'
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-304')).toHaveLength(0);
    });

    it('should not require 304 for non-GET methods', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            put: {
              operationId: 'updateUser',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              },
              responses: {
                '200': {
                  description: 'User updated',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
                // No 304 required for PUT
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-304')).toHaveLength(0);
    });
  });

  describe('Problem+JSON Error Response Validation', () => {
    it('should require application/problem+json for 4xx error responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              },
              responses: {
                '201': {
                  description: 'User created',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                },
                '400': {
                  description: 'Bad request',
                  content: {
                    'application/json': { // Should be application/problem+json
                      schema: {
                        type: 'object',
                        properties: {
                          error: { type: 'string' }
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

      const result = checkHttpSemantics(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'ERR-PROBLEMJSON',
            severity: 'error',
            message: 'Errors must use application/problem+json',
            jsonPath: "$.paths['/users'].post.responses['400'].content",
            category: 'responses'
          })
        ])
      );
    });

    it('should require application/problem+json for 5xx error responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { type: 'object' }
                      }
                    }
                  }
                },
                '500': {
                  description: 'Internal server error',
                  content: {
                    'text/plain': { // Should be application/problem+json
                      schema: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'ERR-PROBLEMJSON',
            severity: 'error',
            message: 'Errors must use application/problem+json',
            jsonPath: "$.paths['/users'].get.responses['500'].content",
            category: 'responses'
          })
        ])
      );
    });

    it('should pass when error responses use application/problem+json', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              },
              responses: {
                '201': {
                  description: 'User created',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                },
                '400': {
                  description: 'Bad request',
                  content: {
                    'application/problem+json': {
                      schema: {
                        type: 'object',
                        properties: {
                          type: { type: 'string' },
                          title: { type: 'string' },
                          status: { type: 'integer' },
                          detail: { type: 'string' }
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

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'ERR-PROBLEMJSON')).toHaveLength(0);
    });

    it('should handle $ref responses correctly', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { type: 'array' }
                    }
                  }
                },
                '400': {
                  $ref: '#/components/responses/BadRequest'
                }
              }
            }
          }
        },
        components: {
          responses: {
            BadRequest: {
              description: 'Bad request',
              content: {
                'application/problem+json': {
                  schema: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      title: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'ERR-PROBLEMJSON')).toHaveLength(0);
    });
  });

  describe('Rate Limiting Headers Validation', () => {
    it('should validate rate limit headers on 2xx responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { type: 'object' }
                      }
                    }
                  }
                  // Missing rate limit headers
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-RATE-LIMIT',
            severity: 'warn',
            message: 'Missing X-RateLimit-Limit header on 200 response',
            jsonPath: "$.paths['/users'].get.responses['200'].headers",
            category: 'http'
          })
        ])
      );

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-RATE-LIMIT',
            severity: 'warn',
            message: 'Missing X-RateLimit-Remaining header on 200 response',
            jsonPath: "$.paths['/users'].get.responses['200'].headers",
            category: 'http'
          })
        ])
      );

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-RATE-LIMIT',
            severity: 'warn',
            message: 'Missing X-RateLimit-Reset header on 200 response',
            jsonPath: "$.paths['/users'].get.responses['200'].headers",
            category: 'http'
          })
        ])
      );
    });

    it('should validate rate limit headers on 429 responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
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
                      schema: { type: 'array' }
                    }
                  }
                },
                '429': {
                  description: 'Too Many Requests',
                  content: {
                    'application/problem+json': {
                      schema: { type: 'object' }
                    }
                  }
                  // Missing rate limit headers on 429
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-RATE-LIMIT',
            severity: 'warn',
            message: 'Missing X-RateLimit-Reset header on 429 response',
            jsonPath: "$.paths['/users'].get.responses['429'].headers",
            category: 'http'
          })
        ])
      );
    });

    it('should pass when all rate limit headers are present', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  headers: {
                    'X-RateLimit-Limit': {
                      description: 'Request limit per time window',
                      schema: { type: 'integer' }
                    },
                    'X-RateLimit-Remaining': {
                      description: 'Remaining requests in current window',
                      schema: { type: 'integer' }
                    },
                    'X-RateLimit-Reset': {
                      description: 'Time when rate limit resets',
                      schema: { type: 'integer' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { type: 'object' }
                      }
                    }
                  }
                },
                '429': {
                  description: 'Too Many Requests',
                  headers: {
                    'X-RateLimit-Limit': { schema: { type: 'integer' } },
                    'X-RateLimit-Remaining': { schema: { type: 'integer' } },
                    'X-RateLimit-Reset': { schema: { type: 'integer' } }
                  },
                  content: {
                    'application/problem+json': {
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-RATE-LIMIT')).toHaveLength(0);
    });

    it('should handle $ref responses for rate limiting validation', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  $ref: '#/components/responses/SuccessWithRateLimit'
                }
              }
            }
          }
        },
        components: {
          responses: {
            SuccessWithRateLimit: {
              description: 'Success with rate limiting',
              headers: {
                'X-RateLimit-Limit': { schema: { type: 'integer' } },
                'X-RateLimit-Remaining': { schema: { type: 'integer' } },
                'X-RateLimit-Reset': { schema: { type: 'integer' } }
              },
              content: {
                'application/json': {
                  schema: { type: 'array' }
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-RATE-LIMIT')).toHaveLength(0);
    });
  });

  describe('Async Operation Location Header Validation', () => {
    it('should require Location header for 202 Accepted responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/bulk-operations': {
            post: {
              operationId: 'createBulkOperation',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        operations: {
                          type: 'array',
                          items: { type: 'object' }
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '202': {
                  description: 'Bulk operation accepted',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          operationId: { type: 'string' }
                        }
                      }
                    }
                  }
                  // Missing Location header
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-202-LOCATION',
            severity: 'error',
            message: '202 Accepted must include Location header pointing to job status',
            jsonPath: "$.paths['/bulk-operations'].post.responses['202'].headers",
            category: 'http'
          })
        ])
      );
    });

    it('should pass when Location header is present on 202 responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/bulk-operations': {
            post: {
              operationId: 'createBulkOperation',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              },
              responses: {
                '202': {
                  description: 'Bulk operation accepted',
                  headers: {
                    'Location': {
                      description: 'URL to check operation status',
                      schema: { type: 'string', format: 'uri' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          operationId: { type: 'string' },
                          status: { type: 'string' }
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

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-202-LOCATION')).toHaveLength(0);
    });

    it('should handle $ref responses for 202 Location validation', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/async-operations': {
            post: {
              operationId: 'startAsyncOperation',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              },
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
              description: 'Async operation accepted',
              headers: {
                'Location': {
                  description: 'Status endpoint URL',
                  schema: { type: 'string', format: 'uri' }
                }
              },
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      jobId: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-202-LOCATION')).toHaveLength(0);
    });

    it('should not require Location header for non-202 responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              },
              responses: {
                '201': {
                  description: 'User created',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                  // No Location header required for 201
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-202-LOCATION')).toHaveLength(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle specs with no paths', () => {
      const spec = MockOpenApiFactory.validMinimal();
      delete spec.paths;

      const result = checkHttpSemantics(spec);

      expect(result.findings).toHaveLength(0);
    });

    it('should handle operations with no responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers'
              // Missing responses
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      // Should handle gracefully - may generate findings for missing responses
      expect(result.findings).toBeDefined();
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('should handle malformed response structures', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': null, // Malformed response
                '400': {
                  description: 'Bad request',
                  content: null // Malformed content
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      // Should not crash and should handle gracefully
      expect(result.findings).toBeDefined();
    });

    it('should handle broken $ref resolutions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { type: 'array' }
                    }
                  }
                },
                '400': {
                  $ref: '#/components/responses/NonExistent' // Broken reference
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      // Should handle broken references gracefully
      expect(result.findings).toBeDefined();
    });

    it('should handle nested method objects', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            parameters: [
              {
                name: 'version',
                in: 'header',
                schema: { type: 'string' }
              }
            ],
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  headers: {
                    'ETag': { schema: { type: 'string' } }
                  },
                  content: {
                    'application/json': {
                      schema: { type: 'array' }
                    }
                  }
                },
                '304': {
                  description: 'Not Modified'
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result.findings.filter(f => f.ruleId === 'HTTP-ETAG')).toHaveLength(0);
      expect(result.findings.filter(f => f.ruleId === 'HTTP-304')).toHaveLength(0);
    });
  });

  describe('Integration and Return Value Validation', () => {
    it('should return findings array and no score by default', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      expect(result).toHaveProperty('findings');
      expect(Array.isArray(result.findings)).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0); // Should have some findings
    });

    it('should generate findings with proper structure', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttpSemantics(spec);

      if (result.findings.length > 0) {
        const finding = result.findings[0];
        expect(finding).toHaveProperty('ruleId');
        expect(finding).toHaveProperty('severity');
        expect(finding).toHaveProperty('message');
        expect(finding).toHaveProperty('jsonPath');
        expect(finding).toHaveProperty('category');

        expect(['error', 'warn', 'info']).toContain(finding.severity);
        expect(typeof finding.ruleId).toBe('string');
        expect(typeof finding.message).toBe('string');
        expect(typeof finding.jsonPath).toBe('string');
      }
    });
  });
});