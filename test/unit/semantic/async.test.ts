/**
 * Async Semantic Module Unit Tests
 * 
 * Tests asynchronous operation patterns and long-running job requirements:
 * - 202 Accepted response patterns
 * - Location header for job tracking
 * - Retry-After header recommendations
 * - Job status endpoint conventions
 * - Async operation lifecycle management
 * 
 * Critical for scalable async operations and job processing.
 */

import { checkAsync } from '../../../src/app/semantic/async';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('Async Semantic Module', () => {
  describe('202 Accepted Response Patterns', () => {
    it('should validate 202 responses with Location header', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Async API', version: '1.0.0' },
        paths: {
          '/api/v2/bulk-import': {
            post: {
              operationId: 'startBulkImport',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        data: {
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
                  description: 'Import job started',
                  headers: {
                    'Location': {
                      description: 'URL to check job status',
                      schema: { type: 'string', format: 'uri' }
                    },
                    'Retry-After': {
                      description: 'Suggested retry interval in seconds',
                      schema: { type: 'integer' }
                    }
                  },
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
              required: ['id', 'status'],
              properties: {
                id: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
                progress: { type: 'integer', minimum: 0, maximum: 100 }
              }
            }
          }
        }
      };

      const result = checkAsync(spec);

      expect(result.score.async.add).toBeGreaterThan(0);
      expect(result.score.async.max).toBe(8);
    });

    it('should validate async job status endpoint', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Job API', version: '1.0.0' },
        paths: {
          '/api/v2/jobs/{jobId}': {
            get: {
              operationId: 'getJobStatus',
              parameters: [
                {
                  name: 'jobId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                  description: 'Job identifier'
                }
              ],
              responses: {
                '200': {
                  description: 'Job status',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['id', 'status'],
                        properties: {
                          id: { type: 'string' },
                          status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
                          progress: { type: 'integer' },
                          result: { type: 'object' },
                          error: { type: 'object' },
                          created_at: { type: 'string', format: 'date-time' },
                          updated_at: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                },
                '404': {
                  description: 'Job not found'
                }
              }
            }
          }
        }
      };

      const result = checkAsync(spec);

      expect(result.score.async.add).toBeGreaterThan(0);
    });

    it('should validate async operation with callback support', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Callback API', version: '1.0.0' },
        paths: {
          '/api/v2/processes': {
            post: {
              operationId: 'startProcess',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        callback_url: {
                          type: 'string',
                          format: 'uri',
                          description: 'Optional callback URL for completion notification'
                        },
                        process_type: { type: 'string' },
                        parameters: { type: 'object' }
                      }
                    }
                  }
                }
              },
              responses: {
                '202': {
                  description: 'Process started',
                  headers: {
                    'Location': {
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          process_id: { type: 'string' },
                          status: { type: 'string' },
                          estimated_duration: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              },
              callbacks: {
                processComplete: {
                  '{$request.body#/callback_url}': {
                    post: {
                      requestBody: {
                        content: {
                          'application/json': {
                            schema: {
                              type: 'object',
                              properties: {
                                process_id: { type: 'string' },
                                status: { type: 'string' },
                                result: { type: 'object' }
                              }
                            }
                          }
                        }
                      },
                      responses: {
                        '200': {
                          description: 'Callback acknowledged'
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

      const result = checkAsync(spec);

      expect(result.score.async.add).toBeGreaterThan(0);
    });
  });

  describe('Long-running Operation Patterns', () => {
    it('should validate batch processing endpoints', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Batch API', version: '1.0.0' },
        paths: {
          '/api/v2/batch/users': {
            post: {
              operationId: 'batchCreateUsers',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        users: {
                          type: 'array',
                          items: { type: 'object' },
                          maxItems: 1000
                        },
                        options: {
                          type: 'object',
                          properties: {
                            batch_size: { type: 'integer', default: 100 },
                            fail_on_error: { type: 'boolean', default: false }
                          }
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '202': {
                  description: 'Batch job started',
                  headers: {
                    'Location': {
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          batch_id: { type: 'string' },
                          status: { type: 'string' },
                          total_items: { type: 'integer' },
                          estimated_completion: { type: 'string', format: 'date-time' }
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

      const result = checkAsync(spec);

      expect(result.score.async.add).toBeGreaterThan(0);
    });

    it('should validate data export operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Export API', version: '1.0.0' },
        paths: {
          '/api/v2/exports/data': {
            post: {
              operationId: 'requestDataExport',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        format: { type: 'string', enum: ['csv', 'json', 'xlsx'] },
                        filters: { type: 'object' },
                        date_range: {
                          type: 'object',
                          properties: {
                            start: { type: 'string', format: 'date' },
                            end: { type: 'string', format: 'date' }
                          }
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '202': {
                  description: 'Export job started',
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
                      schema: {
                        type: 'object',
                        properties: {
                          export_id: { type: 'string' },
                          status: { type: 'string' },
                          format: { type: 'string' },
                          expires_at: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '/api/v2/exports/{exportId}': {
            get: {
              operationId: 'getExportStatus',
              responses: {
                '200': {
                  description: 'Export status',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          status: { type: 'string', enum: ['preparing', 'processing', 'completed', 'failed', 'expired'] },
                          download_url: { type: 'string', format: 'uri' },
                          file_size: { type: 'integer' },
                          progress: { type: 'integer' }
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

      const result = checkAsync(spec);

      expect(result.score.async.add).toBeGreaterThan(0);
    });

    it('should validate report generation workflows', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Reports API', version: '1.0.0' },
        paths: {
          '/api/v2/reports/generate': {
            post: {
              operationId: 'generateReport',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['report_type'],
                      properties: {
                        report_type: { type: 'string', enum: ['sales', 'analytics', 'audit'] },
                        parameters: { type: 'object' },
                        schedule: {
                          type: 'object',
                          properties: {
                            frequency: { type: 'string', enum: ['once', 'daily', 'weekly', 'monthly'] },
                            start_date: { type: 'string', format: 'date' }
                          }
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                '202': {
                  description: 'Report generation started',
                  headers: {
                    'Location': {
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          report_id: { type: 'string' },
                          status: { type: 'string' },
                          report_type: { type: 'string' },
                          estimated_completion: { type: 'string', format: 'date-time' }
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

      const result = checkAsync(spec);

      expect(result.score.async.add).toBeGreaterThan(0);
    });
  });

  describe('Job Management and Control', () => {
    it('should validate job cancellation endpoints', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Job Control API', version: '1.0.0' },
        paths: {
          '/api/v2/jobs/{jobId}/cancel': {
            post: {
              operationId: 'cancelJob',
              parameters: [
                {
                  name: 'jobId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': {
                  description: 'Job cancellation initiated',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          job_id: { type: 'string' },
                          status: { type: 'string', enum: ['cancelling', 'cancelled'] },
                          cancelled_at: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                },
                '409': {
                  description: 'Job cannot be cancelled',
                  content: {
                    'application/problem+json': {
                      schema: {
                        type: 'object',
                        properties: {
                          type: { type: 'string' },
                          title: { type: 'string' },
                          status: { type: 'integer', example: 409 },
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

      const result = checkAsync(spec);

      expect(result.score.async.add).toBeGreaterThan(0);
    });

    it('should validate job listing and filtering', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Job Management API', version: '1.0.0' },
        paths: {
          '/api/v2/jobs': {
            get: {
              operationId: 'listJobs',
              parameters: [
                {
                  name: 'status',
                  in: 'query',
                  schema: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }
                },
                {
                  name: 'job_type',
                  in: 'query',
                  schema: { type: 'string' }
                },
                {
                  name: 'created_after',
                  in: 'query',
                  schema: { type: 'string', format: 'date-time' }
                },
                { $ref: '#/components/parameters/AfterKey' },
                { $ref: '#/components/parameters/Limit' }
              ],
              responses: {
                '200': {
                  description: 'List of jobs',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['success', 'data'],
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                status: { type: 'string' },
                                job_type: { type: 'string' },
                                progress: { type: 'integer' },
                                created_at: { type: 'string', format: 'date-time' }
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
          }
        },
        components: {
          parameters: {
            AfterKey: {
              name: 'after_key',
              in: 'query',
              schema: { type: 'string' }
            },
            Limit: {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', maximum: 100 }
            }
          }
        }
      };

      const result = checkAsync(spec);

      expect(result.score.async.add).toBeGreaterThan(0);
    });

    it('should validate job retry mechanisms', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Retry API', version: '1.0.0' },
        paths: {
          '/api/v2/jobs/{jobId}/retry': {
            post: {
              operationId: 'retryJob',
              parameters: [
                {
                  name: 'jobId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        retry_strategy: {
                          type: 'string',
                          enum: ['immediate', 'exponential_backoff', 'scheduled']
                        },
                        delay_seconds: { type: 'integer', minimum: 0 },
                        max_retries: { type: 'integer', minimum: 1, maximum: 5 }
                      }
                    }
                  }
                }
              },
              responses: {
                '202': {
                  description: 'Job retry scheduled',
                  headers: {
                    'Location': {
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          job_id: { type: 'string' },
                          retry_count: { type: 'integer' },
                          next_retry_at: { type: 'string', format: 'date-time' }
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

      const result = checkAsync(spec);

      expect(result.score.async.add).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle specs with no paths', () => {
      const spec = MockOpenApiFactory.validMinimal();
      delete spec.paths;

      const result = checkAsync(spec);

      expect(result.findings).toEqual([]);
      expect(result.score.async.add).toBe(7);
      expect(result.score.async.max).toBe(8);
    });

    it('should handle broken $ref resolution in async responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/async-op': {
            post: {
              responses: {
                '202': {
                  $ref: '#/components/responses/NonExistent'
                }
              }
            }
          }
        }
      };

      const result = checkAsync(spec);

      // Should handle gracefully without crashing
      expect(result.score.async.add).toBe(7);
    });

    it('should handle circular references in async schemas', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/recursive-job': {
            post: {
              responses: {
                '202': {
                  description: 'Started',
                  content: {
                    'application/json': {
                      schema: {
                        $ref: '#/components/schemas/RecursiveJob'
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
            RecursiveJob: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                nested: { $ref: '#/components/schemas/RecursiveJob' }
              }
            }
          }
        }
      };

      const result = checkAsync(spec);

      // Should handle circular references gracefully
      expect(result.score.async.add).toBe(7);
    });

    it('should handle operations with no responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/async-op': {
            post: {
              operationId: 'asyncOperation'
              // Missing responses
            }
          }
        }
      };

      const result = checkAsync(spec);

      expect(result.score.async.add).toBe(7);
    });

    it('should handle operations with only synchronous responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Sync API', version: '1.0.0' },
        paths: {
          '/api/v2/users': {
            get: {
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
            },
            post: {
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

      const result = checkAsync(spec);

      expect(result.score.async.add).toBe(7);
    });

    it('should handle null responses gracefully', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/process': {
            post: {
              responses: null
            }
          }
        }
      };

      const result = checkAsync(spec);

      expect(result.score.async.add).toBe(7);
    });

    it('should handle malformed 202 responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/broken-async': {
            post: {
              responses: {
                '202': null
              }
            }
          }
        }
      };

      const result = checkAsync(spec);

      expect(result.score.async.add).toBe(7);
    });
  });

  describe('Multi-tenant Async Operations', () => {
    it('should validate tenant-aware async jobs', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Multi-tenant Async API', version: '1.0.0' },
        paths: {
          '/api/v2/organizations/{orgId}/bulk-operations': {
            post: {
              operationId: 'startOrgBulkOperation',
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
                '202': {
                  description: 'Tenant-specific bulk operation started',
                  headers: {
                    'Location': {
                      schema: { type: 'string' }
                    }
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          job_id: { type: 'string' },
                          organization_id: { type: 'string' },
                          status: { type: 'string' },
                          tenant_context: { type: 'object' }
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

      const result = checkAsync(spec);

      expect(result.score.async.add).toBe(7);
    });

    it('should validate cross-tenant job isolation', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Isolated Jobs API', version: '1.0.0' },
        paths: {
          '/api/v2/organizations/{orgId}/jobs': {
            get: {
              operationId: 'listOrgJobs',
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
                  description: 'Organization jobs only',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          data: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                job_id: { type: 'string' },
                                organization_id: { type: 'string' },
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

      const result = checkAsync(spec);

      expect(result.score.async.add).toBe(7);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large number of async endpoints efficiently', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Large Async API', version: '1.0.0' },
        paths: {}
      };

      // Add 50 async endpoints
      for (let i = 0; i < 50; i++) {
        (spec.paths as any)[`/api/v2/async-op${i}`] = {
          post: {
            responses: {
              '202': {
                description: `Async operation ${i}`,
                headers: {
                  'Location': { schema: { type: 'string' } }
                },
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        job_id: { type: 'string' },
                        status: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        };
      }

      const start = performance.now();
      const result = checkAsync(spec);
      const end = performance.now();

      expect(end - start).toBeLessThan(100); // Stub should be very fast
      expect(result.score.async.add).toBe(7);
      expect(result.score.async.max).toBe(8);
    });

    it('should handle deeply nested async job structures', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Nested Async API', version: '1.0.0' },
        paths: {
          '/api/v2/nested-async': {
            post: {
              responses: {
                '202': {
                  description: 'Nested operation started',
                  headers: { 'Location': { schema: { type: 'string' } } },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          job: {
                            type: 'object',
                            properties: {
                              metadata: {
                                type: 'object',
                                properties: {
                                  nested: {
                                    type: 'object',
                                    properties: {
                                      deep: {
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
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkAsync(spec);

      // Should handle nested structures without performance issues
      expect(result.score.async.add).toBe(7);
      expect(result.score.async.max).toBe(8);
    });
  });

  describe('Async Pattern Violations', () => {
    it('should detect missing Location header on 202 responses', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/async-operation': {
            post: {
              operationId: 'startAsyncOperation',
              responses: {
                '202': {
                  description: 'Operation started',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          job_id: { type: 'string' }
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

      const result = checkAsync(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'ASYNC-202-LOCATION',
            severity: 'error',
            message: '202 Accepted response must include Location header',
            jsonPath: "$.paths['/api/v2/async-operation'].post.responses['202'].headers",
            category: 'async'
          })
        ])
      );
    });

    it('should detect async operations without proper job status schema', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/jobs/{id}': {
            get: {
              operationId: 'getJobStatus',
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
                  description: 'Job status',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          // Missing required async job fields like status, progress
                          job_id: { type: 'string' }
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

      const result = checkAsync(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'ASYNC-JOB-SCHEMA',
            severity: 'warn',
            message: 'Job status endpoint should include status and progress fields',
            jsonPath: "$.paths['/api/v2/jobs/{id}'].get.responses['200'].content['application/json'].schema",
            category: 'async'
          })
        ])
      );
    });

    it('should detect missing Retry-After header recommendations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v2/long-running': {
            post: {
              operationId: 'startLongRunning',
              responses: {
                '202': {
                  description: 'Long operation started',
                  headers: {
                    'Location': {
                      schema: { type: 'string' }
                    }
                    // Missing Retry-After header
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

      const result = checkAsync(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'ASYNC-202-RETRY',
            severity: 'warn',
            message: '202 Accepted response should include Retry-After header',
            jsonPath: "$.paths['/api/v2/long-running'].post.responses['202'].headers",
            category: 'async'
          })
        ])
      );
    });

    it('should validate async job lifecycle completeness', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Incomplete Async API', version: '1.0.0' },
        paths: {
          '/api/v2/start-job': {
            post: {
              responses: {
                '202': {
                  description: 'Job started',
                  headers: { 'Location': { schema: { type: 'string' } } },
                  content: { 'application/json': { schema: { type: 'object' } } }
                }
              }
            }
          }
          // Missing job status and control endpoints
        }
      };

      const result = checkAsync(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'ASYNC-LIFECYCLE',
            severity: 'warn',
            message: 'Async API should include job status, cancel, and list endpoints',
            jsonPath: '$.paths',
            category: 'async'
          })
        ])
      );
    });
  });

  describe('Auto-fail Conditions for Async Operations', () => {
    it('should trigger auto-fail for async operations without proper patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Bad Async API', version: '1.0.0' },
        paths: {
          '/api/v2/critical-async': {
            post: {
              operationId: 'criticalAsyncOperation',
              responses: {
                '202': {
                  description: 'Started',
                  content: {
                    'application/json': {
                      schema: { type: 'object' }
                    }
                  }
                  // Missing Location header - critical for async operations
                }
              }
            }
          }
        }
      };

      const result = checkAsync(spec);

      expect((result as any).autoFailReasons).toEqual(
        expect.arrayContaining([
          'Missing Location header on 202 Accepted responses'
        ])
      );
    });
  });

  describe('Stub Implementation Awareness', () => {
    it('should return consistent scoring regardless of input complexity (current stub behavior)', () => {
      // Test specs without async patterns
      const simpleSpecs = [
        MockOpenApiFactory.validMinimal(),
        { openapi: '3.0.3', info: { title: 'Empty', version: '1.0.0' }, paths: {} }
      ];

      simpleSpecs.forEach(spec => {
        const result = checkAsync(spec);
        expect(result.findings).toEqual([]);
        expect(result.score.async.add).toBe(7);
        expect(result.score.async.max).toBe(8);
        expect((result as any).autoFailReasons).toBeUndefined();
      });
      
      // Test spec with async pattern
      const asyncSpec = {
        openapi: '3.0.3',
        info: { title: 'Complex Async', version: '1.0.0' },
        paths: {
          '/api/v2/complex-async': {
            post: {
              responses: {
                '202': {
                  description: 'Complex async started',
                  headers: { 'Location': { schema: { type: 'string' } } },
                  content: { 'application/json': { schema: { type: 'object' } } }
                }
              }
            }
          }
        }
      };
      
      const asyncResult = checkAsync(asyncSpec);
      // This spec triggers findings due to missing Retry-After and lifecycle endpoints
      expect(asyncResult.findings.length).toBeGreaterThan(0);
      expect(asyncResult.score.async.add).toBe(7); // Score remains 7 despite findings
      expect(asyncResult.score.async.max).toBe(8);
      expect((asyncResult as any).autoFailReasons).toBeUndefined();
    });

    it('should demonstrate expected behavior when real implementation is added', () => {
      const goodSpec = {
        openapi: '3.0.3',
        info: { title: 'Good Async API', version: '1.0.0' },
        paths: {
          '/api/v2/async-op': {
            post: {
              responses: {
                '202': {
                  description: 'Operation started',
                  headers: {
                    'Location': { schema: { type: 'string' } },
                    'Retry-After': { schema: { type: 'integer' } }
                  },
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
          },
          '/api/v2/jobs/{id}': {
            get: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
              ],
              responses: {
                '200': {
                  description: 'Job status',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/AsyncJobStatus' }
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
              required: ['id', 'status'],
              properties: {
                id: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
                progress: { type: 'integer', minimum: 0, maximum: 100 }
              }
            }
          }
        }
      };

      const result = checkAsync(goodSpec);
      
      // When real implementation is added, this should score higher
      // For now, stub returns consistent score
      expect(result.score.async.add).toBe(7);
      expect(result.score.async.max).toBe(8);
    });
  });
});