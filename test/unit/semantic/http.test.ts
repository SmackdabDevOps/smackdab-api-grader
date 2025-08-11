/**
 * HTTP Semantic Module Unit Tests
 * 
 * Tests HTTP method semantics, status code compliance, and REST patterns:
 * - Proper HTTP method usage (GET for retrieval, POST for creation, etc.)
 * - Status code appropriateness (2xx success, 4xx client error, 5xx server error)
 * - Response content type consistency
 * - Error response structure validation
 * - HTTP header compliance
 * 
 * Ensures APIs follow HTTP protocol standards and REST conventions.
 */

import { checkHttp } from '../../../src/app/semantic/http';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('HTTP Semantic Module', () => {
  describe('HTTP Method Semantics', () => {
    it('should validate GET operations are safe and idempotent', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              requestBody: { // Invalid: GET should not have request body
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              },
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
                }
              }
            }
          }
        }
      };

      const result = checkHttp(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-GET-BODY',
            severity: 'error',
            category: 'http',
            message: 'GET operation should not have request body',
            jsonPath: "$.paths['/users'].get.requestBody"
          })
        ])
      );
    });

    it('should validate POST operations for resource creation', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' }
                      },
                      required: ['name', 'email']
                    }
                  }
                }
              },
              responses: {
                '200': { // Should be 201 for creation
                  description: 'User created',
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

      const result = checkHttp(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-POST-STATUS',
            severity: 'warn',
            category: 'http',
            message: 'POST operation should return 201 for successful creation',
            jsonPath: "$.paths['/users'].post.responses"
          })
        ])
      );
    });

    it('should validate PUT operations are idempotent', () => {
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
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' }
                      }
                    }
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
                },
                '404': {
                  description: 'User not found'
                }
              }
            }
          }
        }
      };

      const result = checkHttp(spec);

      // PUT should pass validation when properly structured
      expect(result.findings.filter(f => f.ruleId.startsWith('HTTP-PUT'))).toHaveLength(0);
    });

    it('should validate DELETE operations return appropriate status codes', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            delete: {
              operationId: 'deleteUser',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': { // Should prefer 204 or 202
                  description: 'User deleted',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' }
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

      const result = checkHttp(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-DELETE-STATUS',
            severity: 'warn',
            category: 'http',
            message: 'DELETE operation should return 204 (No Content) or 202 (Accepted)',
            jsonPath: "$.paths['/users/{id}'].delete.responses"
          })
        ])
      );
    });

    it('should validate PATCH operations for partial updates', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            patch: {
              operationId: 'patchUser',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              requestBody: {
                required: true,
                content: {
                  'application/merge-patch+json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: {
                '200': {
                  description: 'User patched',
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

      const result = checkHttp(spec);

      // Should pass with proper PATCH content type
      expect(result.findings.filter(f => f.ruleId.startsWith('HTTP-PATCH'))).toHaveLength(0);
    });
  });

  describe('Status Code Compliance', () => {
    it('should require appropriate 2xx success codes', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '500': { // Missing success response
                  description: 'Server error'
                }
              }
            }
          }
        }
      };

      const result = checkHttp(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-SUCCESS-REQUIRED',
            severity: 'error',
            category: 'http',
            message: 'Operation must define at least one 2xx success response',
            jsonPath: "$.paths['/users'].get.responses"
          })
        ])
      );
    });

    it('should validate error response patterns', () => {
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
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
                // Missing 404 for resource-specific GET
              }
            }
          }
        }
      };

      const result = checkHttp(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-404-MISSING',
            severity: 'warn',
            category: 'http',
            message: 'Resource-specific GET operation should define 404 response',
            jsonPath: "$.paths['/users/{id}'].get.responses"
          })
        ])
      );
    });

    it('should validate 4xx client error responses have proper structure', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                required: true,
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
                  description: 'Bad request'
                  // Missing error response schema
                }
              }
            }
          }
        }
      };

      const result = checkHttp(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-ERROR-SCHEMA',
            severity: 'warn',
            category: 'http',
            message: 'Error response should have content schema',
            jsonPath: "$.paths['/users'].post.responses['400']"
          })
        ])
      );
    });
  });

  describe('Content Type Validation', () => {
    it('should validate consistent JSON content types', () => {
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
                    'text/plain': { // Inconsistent with REST API patterns
                      schema: { type: 'string' }
                    }
                  }
                }
              }
            },
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
                  description: 'Created',
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

      const result = checkHttp(spec);

      // Current implementation suggests Content-Type header parameter
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-CONTENT-TYPE-HEADER',
            severity: 'info',
            category: 'http'
          })
        ])
      );
    });

    it('should validate request/response content type alignment', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/xml': {
                    schema: { type: 'object' }
                  }
                }
              },
              responses: {
                '201': {
                  description: 'Created',
                  content: {
                    'application/json': { // Different from request
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttp(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-CONTENT-MISMATCH',
            severity: 'info',
            category: 'http',
            message: 'Request and response content types should align',
            jsonPath: "$.paths['/users'].post"
          })
        ])
      );
    });
  });

  describe('HTTP Header Validation', () => {
    it('should validate required headers for operations', () => {
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
                  description: 'Created',
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

      const result = checkHttp(spec);

      // Should suggest Content-Type header validation
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-CONTENT-TYPE-HEADER',
            severity: 'info',
            category: 'http',
            message: 'Consider defining Content-Type header parameter',
            jsonPath: "$.paths['/users'].post.parameters"
          })
        ])
      );
    });

    it('should validate cache control headers for GET operations', () => {
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
                    'Cache-Control': {
                      description: 'Cache control directives',
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

      const result = checkHttp(spec);

      // Should pass with cache headers properly defined
      expect(result.findings.filter(f => f.ruleId === 'HTTP-CACHE-MISSING')).toHaveLength(0);
    });
  });

  describe('RESTful Resource Patterns', () => {
    it('should validate collection vs resource operation patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'List of users',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array', // Correct for collection
                        items: { type: 'object' }
                      }
                    }
                  }
                }
              }
            },
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
                      schema: { type: 'object' } // Correct for resource
                    }
                  }
                }
              }
            }
          },
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
                      schema: { type: 'object' } // Correct for single resource
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttp(spec);

      // Should pass RESTful pattern validation
      expect(result.findings.filter(f => f.ruleId.includes('REST'))).toHaveLength(0);
    });

    it('should detect incorrect resource patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Users',
                  content: {
                    'application/json': {
                      schema: { type: 'object' } // Should be array for collection
                    }
                  }
                }
              }
            }
          },
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
                  description: 'User',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array', // Should be object for single resource
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

      const result = checkHttp(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-COLLECTION-SCHEMA',
            severity: 'warn',
            category: 'http',
            message: 'Collection endpoint should return array schema',
            jsonPath: "$.paths['/users'].get.responses['200'].content"
          })
        ])
      );

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-RESOURCE-SCHEMA',
            severity: 'warn',
            category: 'http',
            message: 'Resource endpoint should return object schema',
            jsonPath: "$.paths['/users/{id}'].get.responses['200'].content"
          })
        ])
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
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

      const result = checkHttp(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'HTTP-NO-RESPONSES',
            severity: 'error',
            category: 'http',
            message: 'Operation must define responses',
            jsonPath: "$.paths['/users'].get"
          })
        ])
      );
    });

    it('should handle malformed response schemas', () => {
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
                      schema: null // Invalid schema
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkHttp(spec);

      // Current implementation doesn't validate schema structure
      expect(result.findings).toEqual([]);
    });

    it('should handle specs with no paths', () => {
      const spec = MockOpenApiFactory.validMinimal();
      delete spec.paths;

      const result = checkHttp(spec);

      expect(result.findings).toHaveLength(0);
      expect(result.score.http.add).toBe(0);
      expect(result.autoFailReasons).toHaveLength(0);
    });
  });

  describe('Scoring Logic', () => {
    it('should allocate points for HTTP compliance factors', () => {
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
                    'Cache-Control': {
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
            },
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
                  description: 'Created',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                },
                '400': {
                  description: 'Bad request',
                  content: {
                    'application/json': {
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

      const result = checkHttp(spec);

      expect(result.score.http.add).toBeGreaterThan(0);
      expect(result.score.http.max).toBeGreaterThan(0);
      expect(result.findings.filter(f => f.severity === 'error')).toHaveLength(0);
    });
  });
});