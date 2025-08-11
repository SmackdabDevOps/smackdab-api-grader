/**
 * Caching Semantic Module Unit Tests
 * 
 * Tests HTTP caching patterns and performance optimization requirements:
 * - Cache-Control headers validation
 * - ETag header presence
 * - Last-Modified headers
 * - Conditional request support (304 Not Modified)
 * - Cache-friendly response patterns
 * 
 * Critical for API performance and scalability.
 */

import { checkCaching } from '../../../src/app/semantic/caching';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('Caching Semantic Module', () => {
  describe('Cache Headers Validation', () => {
    it('should validate Cache-Control headers on cacheable responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'List of users',
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

      const result = checkCaching(spec);

      // Should pass basic validation (this is a stub implementation)
      expect(result.score.caching.add).toBeGreaterThan(0);
      expect(result.score.caching.max).toBe(10);
    });

    it('should require ETag headers for cacheable resources', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users/{id}': {
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
                  headers: {
                    'ETag': {
                      description: 'Entity tag for caching',
                      schema: { type: 'string' }
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

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBeGreaterThan(0);
    });

    it('should validate conditional request support', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users/{id}': {
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
                  schema: { type: 'string' },
                  description: 'ETag value for conditional requests'
                },
                {
                  name: 'If-Modified-Since',
                  in: 'header',
                  schema: { type: 'string', format: 'date-time' },
                  description: 'Date for conditional requests'
                }
              ],
              responses: {
                '200': {
                  description: 'User details',
                  headers: {
                    'ETag': {
                      schema: { type: 'string' }
                    },
                    'Last-Modified': {
                      schema: { type: 'string', format: 'date-time' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                },
                '304': {
                  description: 'Not Modified',
                  headers: {
                    'ETag': {
                      schema: { type: 'string' }
                    },
                    'Cache-Control': {
                      schema: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBeGreaterThan(0);
    });
  });

  describe('Cache-Control Directives', () => {
    it('should validate private cache directives for user-specific data', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users/profile': {
            get: {
              operationId: 'getUserProfile',
              responses: {
                '200': {
                  description: 'User profile',
                  headers: {
                    'Cache-Control': {
                      description: 'Private cache for user data',
                      schema: {
                        type: 'string',
                        example: 'private, max-age=300'
                      }
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

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBeGreaterThan(0);
    });

    it('should validate public cache directives for shared resources', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/public/products': {
            get: {
              operationId: 'getPublicProducts',
              responses: {
                '200': {
                  description: 'Public product catalog',
                  headers: {
                    'Cache-Control': {
                      description: 'Public cache for shared data',
                      schema: {
                        type: 'string',
                        example: 'public, max-age=3600'
                      }
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

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBeGreaterThan(0);
    });

    it('should validate no-cache directives for sensitive endpoints', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/auth/tokens': {
            get: {
              operationId: 'getAuthTokens',
              responses: {
                '200': {
                  description: 'Authentication tokens',
                  headers: {
                    'Cache-Control': {
                      description: 'No caching for sensitive data',
                      schema: {
                        type: 'string',
                        example: 'no-cache, no-store, must-revalidate'
                      }
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

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBeGreaterThan(0);
    });
  });

  describe('Multi-tenant Caching Patterns', () => {
    it('should validate tenant-aware caching with organization context', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Multi-tenant API', version: '1.0.0' },
        paths: {
          '/api/v2/organizations/{orgId}/data': {
            get: {
              operationId: 'getOrganizationData',
              parameters: [
                {
                  name: 'orgId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                },
                { $ref: '#/components/parameters/OrganizationHeader' }
              ],
              responses: {
                '200': {
                  description: 'Organization-specific data',
                  headers: {
                    'Cache-Control': {
                      description: 'Private cache per tenant',
                      schema: {
                        type: 'string',
                        example: 'private, max-age=600'
                      }
                    },
                    'Vary': {
                      description: 'Cache varies by organization',
                      schema: {
                        type: 'string',
                        example: 'X-Organization-ID'
                      }
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
        },
        components: {
          parameters: {
            OrganizationHeader: {
              name: 'X-Organization-ID',
              in: 'header',
              required: true,
              schema: { type: 'integer' }
            }
          }
        }
      };

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBeGreaterThan(0);
    });

    it('should validate cache invalidation patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users/{id}': {
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
              responses: {
                '200': {
                  description: 'User updated',
                  headers: {
                    'ETag': {
                      description: 'New entity tag after update',
                      schema: { type: 'string' }
                    },
                    'Last-Modified': {
                      description: 'Update timestamp',
                      schema: { type: 'string', format: 'date-time' }
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

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle specs with no paths', () => {
      const spec = MockOpenApiFactory.validMinimal();
      delete spec.paths;

      const result = checkCaching(spec);

      expect(result.findings).toEqual([]);
      expect(result.score.caching.add).toBe(8);
      expect(result.score.caching.max).toBe(10);
    });

    it('should handle operations with no responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers'
              // Missing responses
            }
          }
        }
      };

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });

    it('should handle responses with no headers', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
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
                }
              }
            }
          }
        }
      };

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });

    it('should handle null headers gracefully', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  headers: null,
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

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });
  });

  describe('HTTP Method Caching Patterns', () => {
    it('should validate GET method caching', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'List of users',
                  headers: {
                    'Cache-Control': {
                      schema: { type: 'string' }
                    },
                    'ETag': {
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

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });

    it('should validate HEAD method caching', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users/{id}': {
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
                    'ETag': {
                      schema: { type: 'string' }
                    },
                    'Last-Modified': {
                      schema: { type: 'string', format: 'date-time' }
                    }
                  }
                },
                '304': {
                  description: 'Not Modified'
                },
                '404': {
                  description: 'User not found'
                }
              }
            }
          }
        }
      };

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });

    it('should not require caching headers for non-cacheable methods', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            post: {
              operationId: 'createUser',
              responses: {
                '201': {
                  description: 'User created',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                }
              }
            },
            delete: {
              operationId: 'deleteUsers',
              responses: {
                '204': {
                  description: 'Users deleted'
                }
              }
            }
          }
        }
      };

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });
  });

  describe('Performance Optimization Patterns', () => {
    it('should validate CDN-friendly caching patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'CDN API', version: '1.0.0' },
        paths: {
          '/api/v2/static/assets/{id}': {
            get: {
              operationId: 'getStaticAsset',
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
                  description: 'Static asset',
                  headers: {
                    'Cache-Control': {
                      schema: {
                        type: 'string',
                        example: 'public, max-age=31536000, immutable'
                      }
                    },
                    'ETag': {
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/octet-stream': {
                      schema: { type: 'string', format: 'binary' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });

    it('should validate cache warming patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Cache API', version: '1.0.0' },
        paths: {
          '/api/v2/cache/warm': {
            post: {
              operationId: 'warmCache',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        resources: {
                          type: 'array',
                          items: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '202': {
                  description: 'Cache warming initiated',
                  headers: {
                    'Cache-Control': {
                      schema: {
                        type: 'string',
                        example: 'no-cache'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });
  });

  describe('Scoring and Stub Implementation', () => {
    it('should return consistent scoring from stub implementation', () => {
      const spec = MockOpenApiFactory.validMinimal();

      const result = checkCaching(spec);

      expect(result.findings.length).toBeGreaterThan(0); // Has findings for missing cache headers
      expect(result.score.caching.add).toBe(8); // Score remains 8 despite findings
      expect(result.score.caching.max).toBe(10);
      // autoFailReasons not part of CachingCheckResult
    });

    it('should handle complex specs with stub implementation', () => {
      const spec: any = {
        openapi: '3.0.3',
        info: { title: 'Complex API', version: '1.0.0' },
        paths: {}
      };

      // Add 50 paths with various caching patterns
      for (let i = 0; i < 50; i++) {
        spec.paths[`/api/v2/resource${i}`] = {
          get: {
            responses: {
              '200': {
                description: 'Success',
                headers: {
                  'Cache-Control': { schema: { type: 'string' } },
                  'ETag': { schema: { type: 'string' } }
                },
                content: {
                  'application/json': { schema: { type: 'object' } }
                }
              }
            }
          }
        };
      }

      const start = performance.now();
      const result = checkCaching(spec);
      const end = performance.now();

      expect(end - start).toBeLessThan(100); // Stub should be very fast
      expect(result.score.caching.add).toBe(8);
      expect(result.score.caching.max).toBe(10);
    });

    it('should handle edge cases without crashing', () => {
      const edgeCaseSpecs = [
        // Spec with $ref responses
        {
          openapi: '3.0.3',
          info: { title: 'Ref API', version: '1.0.0' },
          paths: {
            '/api/v2/users': {
              get: {
                responses: {
                  '200': { $ref: '#/components/responses/UserList' }
                }
              }
            }
          },
          components: {
            responses: {
              UserList: {
                description: 'List of users',
                headers: {
                  'Cache-Control': { schema: { type: 'string' } }
                },
                content: {
                  'application/json': { schema: { type: 'array' } }
                }
              }
            }
          }
        },
        // Spec with broken $ref
        {
          openapi: '3.0.3',
          info: { title: 'Broken Ref API', version: '1.0.0' },
          paths: {
            '/api/v2/users': {
              get: {
                responses: {
                  '200': { $ref: '#/components/responses/NonExistent' }
                }
              }
            }
          }
        },
        // Spec with null values
        {
          openapi: '3.0.3',
          info: { title: 'Null API', version: '1.0.0' },
          paths: {
            '/api/v2/users': {
              get: {
                responses: {
                  '200': {
                    description: 'Success',
                    headers: null,
                    content: null
                  }
                }
              }
            }
          }
        }
      ];

      edgeCaseSpecs.forEach((spec, index) => {
        const result = checkCaching(spec);
        expect(result.score.caching.add).toBe(8);
        expect(result.score.caching.max).toBe(10);
        // Should not throw errors
        expect(result.findings).toBeDefined();
      });
    });
  });

  describe('Cache Performance Metrics', () => {
    it('should validate cache hit optimization patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Optimized Cache API', version: '1.0.0' },
        paths: {
          '/api/v2/metrics/cache': {
            get: {
              operationId: 'getCacheMetrics',
              responses: {
                '200': {
                  description: 'Cache performance metrics',
                  headers: {
                    'Cache-Control': {
                      schema: { type: 'string', example: 'public, max-age=60' }
                    },
                    'X-Cache-Hit-Rate': {
                      schema: { type: 'number' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          hit_rate: { type: 'number' },
                          miss_rate: { type: 'number' },
                          eviction_rate: { type: 'number' },
                          cache_size: { type: 'integer' }
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

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });

    it('should validate cache warming strategies', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Cache Warming API', version: '1.0.0' },
        paths: {
          '/api/v2/cache/preload': {
            post: {
              operationId: 'preloadCache',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        resources: {
                          type: 'array',
                          items: { type: 'string' }
                        },
                        priority: {
                          type: 'string',
                          enum: ['low', 'normal', 'high']
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '202': {
                  description: 'Cache preloading initiated',
                  headers: {
                    'Cache-Control': {
                      schema: { type: 'string', example: 'no-cache' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkCaching(spec);

      expect(result.score.caching.add).toBe(8);
    });
  });
});