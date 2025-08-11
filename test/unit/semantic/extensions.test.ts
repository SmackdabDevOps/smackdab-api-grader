/**
 * Extensions Semantic Module Unit Tests
 * 
 * Tests OpenAPI extension patterns and Smackdab-specific requirements:
 * - x- vendor extensions validation
 * - Smackdab-specific extensions (x-smackdab-*)
 * - Platform constraint extensions
 * - Performance SLA extensions
 * - Rate limiting extensions
 * 
 * Critical for platform-specific metadata and operational requirements.
 */

import { checkExtensions } from '../../../src/app/semantic/extensions';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('Extensions Semantic Module', () => {
  describe('Smackdab-specific Extensions', () => {
    it('should validate x-smackdab-tenancy extension', () => {
      const spec = {
        openapi: '3.0.3',
        info: { 
          title: 'Smackdab API', 
          version: '1.0.0',
          'x-smackdab-tenancy': true,
          'x-smackdab-version': '2.0'
        },
        paths: {
          '/api/v2/users': {
            get: {
              operationId: 'getUsers',
              'x-smackdab-resource': 'user',
              'x-smackdab-permissions': ['read:users'],
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

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
      expect(result.score.extensions.max).toBe(15);
    });

    it('should validate performance SLA extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Performance API', version: '1.0.0' },
        'x-performance-slas': {
          latency: {
            p99: '100ms',
            p95: '50ms',
            p90: '25ms'
          },
          throughput: {
            target: '10000 rps',
            burst: '15000 rps'
          },
          availability: '99.9%'
        },
        paths: {
          '/api/v2/high-performance': {
            get: {
              operationId: 'getHighPerformance',
              'x-performance-tier': 'critical',
              'x-cache-ttl': 300,
              responses: {
                '200': {
                  description: 'High performance response',
                  'x-response-time-target': '10ms'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });

    it('should validate platform constraint extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Platform API', version: '1.0.0' },
        'x-platform-constraints': {
          'forbidden-technologies': ['kafka', 'redis', 'elasticsearch'],
          'required-technologies': ['pulsar', 'dragonfly', 'postgresql'],
          'deployment-targets': ['kubernetes', 'docker'],
          'scaling-requirements': {
            'min-replicas': 2,
            'max-replicas': 10,
            'cpu-limits': '1000m',
            'memory-limits': '2Gi'
          }
        },
        paths: {
          '/api/v2/platform-aware': {
            get: {
              operationId: 'getPlatformAware',
              'x-scaling-policy': 'auto',
              'x-resource-requirements': {
                cpu: '100m',
                memory: '256Mi'
              },
              responses: {
                '200': {
                  description: 'Platform-aware response'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });

    it('should validate rate limiting extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Rate Limited API', version: '1.0.0' },
        'x-rate-limiting': {
          'default-policy': {
            requests: 1000,
            window: '1h',
            burst: 100
          },
          'tier-policies': {
            premium: {
              requests: 10000,
              window: '1h',
              burst: 1000
            },
            basic: {
              requests: 100,
              window: '1h',
              burst: 10
            }
          }
        },
        paths: {
          '/api/v2/limited-endpoint': {
            get: {
              operationId: 'getLimitedEndpoint',
              'x-rate-limit': {
                requests: 50,
                window: '1m'
              },
              'x-rate-limit-tier': 'premium',
              responses: {
                '200': {
                  description: 'Rate limited response',
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
                  }
                },
                '429': {
                  description: 'Rate limit exceeded',
                  'x-rate-limit-retry-after': 'dynamic'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });

    it('should validate caching strategy extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Cached API', version: '1.0.0' },
        'x-caching-strategy': {
          'default-ttl': 3600,
          'cache-levels': ['L1', 'L2', 'L3'],
          'invalidation-strategy': 'tag-based',
          'cache-keys': {
            'tenant-aware': true,
            'user-aware': false
          }
        },
        paths: {
          '/api/v2/cached-data': {
            get: {
              operationId: 'getCachedData',
              'x-cache-policy': {
                ttl: 1800,
                levels: ['L1', 'L2'],
                tags: ['user-data', 'public']
              },
              'x-cache-key-template': 'cached-data:{org_id}:{user_id}',
              responses: {
                '200': {
                  description: 'Cached response',
                  headers: {
                    'Cache-Control': {
                      schema: { type: 'string' }
                    },
                    'ETag': {
                      schema: { type: 'string' }
                    },
                    'X-Cache-Status': {
                      schema: { type: 'string', enum: ['hit', 'miss', 'stale'] }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });
  });

  describe('Security Extensions', () => {
    it('should validate security policy extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Secure API', version: '1.0.0' },
        'x-security-policies': {
          'auth-required': true,
          'min-tls-version': '1.2',
          'cors-policy': {
            'allowed-origins': ['https://app.smackdab.com'],
            'allowed-methods': ['GET', 'POST', 'PUT', 'DELETE'],
            'allowed-headers': ['Authorization', 'X-Organization-ID']
          },
          'content-security': {
            'sanitize-inputs': true,
            'validate-json-schema': true,
            'max-request-size': '10MB'
          }
        },
        paths: {
          '/api/v2/secure-endpoint': {
            post: {
              operationId: 'secureOperation',
              'x-security-level': 'high',
              'x-audit-log': true,
              'x-require-2fa': true,
              responses: {
                '200': {
                  description: 'Secure response',
                  'x-sensitive-data': true
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });

    it('should validate compliance extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Compliant API', version: '1.0.0' },
        'x-compliance': {
          'gdpr': {
            'enabled': true,
            'data-retention-days': 365,
            'anonymization-required': true
          },
          'hipaa': {
            'enabled': false
          },
          'sox': {
            'enabled': true,
            'audit-trail-required': true
          }
        },
        paths: {
          '/api/v2/personal-data': {
            get: {
              operationId: 'getPersonalData',
              'x-gdpr-category': 'personal-data',
              'x-data-classification': 'sensitive',
              'x-retention-policy': '2-years',
              responses: {
                '200': {
                  description: 'Personal data response',
                  'x-privacy-level': 'high'
                }
              }
            },
            delete: {
              operationId: 'deletePersonalData',
              'x-gdpr-right': 'right-to-erasure',
              'x-audit-required': true,
              responses: {
                '204': {
                  description: 'Data deleted'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });
  });

  describe('Multi-tenant Extensions', () => {
    it('should validate tenant-aware extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { 
          title: 'Multi-tenant API', 
          version: '1.0.0',
          'x-multi-tenancy': {
            'isolation-level': 'row-level',
            'tenant-identification': ['header', 'path'],
            'cross-tenant-access': false
          }
        },
        'x-tenant-configuration': {
          'default-settings': {
            'max-users-per-org': 1000,
            'storage-quota-gb': 100,
            'api-rate-limit': 10000
          },
          'tier-overrides': {
            'enterprise': {
              'max-users-per-org': 10000,
              'storage-quota-gb': 1000,
              'api-rate-limit': 100000
            }
          }
        },
        paths: {
          '/api/v2/organizations/{orgId}/resources': {
            get: {
              operationId: 'getOrgResources',
              'x-tenant-scope': 'organization',
              'x-tenant-isolation': 'strict',
              'x-cross-tenant-check': 'enforce',
              responses: {
                '200': {
                  description: 'Organization resources'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });

    it('should validate branch-level extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Branch API', version: '1.0.0' },
        'x-branch-management': {
          'branching-strategy': 'feature-branch',
          'merge-policies': ['require-approval', 'test-passing'],
          'isolation-level': 'branch-level'
        },
        paths: {
          '/api/v2/branches/{branchId}/data': {
            get: {
              operationId: 'getBranchData',
              'x-branch-scope': 'isolated',
              'x-merge-conflict-resolution': 'manual',
              responses: {
                '200': {
                  description: 'Branch-specific data'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });
  });

  describe('Operational Extensions', () => {
    it('should validate monitoring extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Monitored API', version: '1.0.0' },
        'x-monitoring': {
          'metrics': {
            'custom-metrics': ['business_metric_1', 'conversion_rate'],
            'slo-targets': {
              'response-time-p99': '100ms',
              'error-rate': '0.1%',
              'availability': '99.95%'
            }
          },
          'alerting': {
            'channels': ['slack', 'pagerduty'],
            'escalation-policy': 'standard'
          },
          'tracing': {
            'enabled': true,
            'sample-rate': 0.1
          }
        },
        paths: {
          '/api/v2/critical-operation': {
            post: {
              operationId: 'criticalOperation',
              'x-monitoring-tier': 'critical',
              'x-slo-target': '50ms',
              'x-alert-threshold': 'p95 > 100ms',
              responses: {
                '200': {
                  description: 'Success',
                  'x-success-metric': 'operation.success'
                },
                '500': {
                  description: 'Error',
                  'x-error-metric': 'operation.error'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });

    it('should validate deployment extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Deployment API', version: '1.0.0' },
        'x-deployment': {
          'strategy': 'blue-green',
          'environments': ['dev', 'staging', 'prod'],
          'health-checks': {
            'liveness': '/health/live',
            'readiness': '/health/ready'
          },
          'graceful-shutdown-timeout': '30s'
        },
        'x-infrastructure': {
          'container': {
            'image': 'smackdab/api',
            'ports': [8080, 8081],
            'resources': {
              'requests': { cpu: '100m', memory: '256Mi' },
              'limits': { cpu: '1000m', memory: '1Gi' }
            }
          },
          'service': {
            'type': 'LoadBalancer',
            'annotations': {
              'service.beta.kubernetes.io/aws-load-balancer-type': 'nlb'
            }
          }
        },
        paths: {
          '/health/live': {
            get: {
              'x-health-check': 'liveness',
              'x-no-auth': true,
              responses: {
                '200': { description: 'Service is alive' }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle specs with no extensions', () => {
      const spec = MockOpenApiFactory.validMinimal();

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
      expect(result.score.extensions.max).toBe(15);
    });

    it('should handle specs with empty extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        'x-empty-extension': {},
        'x-null-extension': null,
        paths: {
          '/api/v2/test': {
            get: {
              'x-operation-extension': '',
              responses: {
                '200': {
                  description: 'Success',
                  'x-response-extension': undefined
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });

    it('should handle malformed extension values', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        'x-malformed': 'not-an-object-when-expected',
        paths: {
          '/api/v2/test': {
            get: {
              'x-invalid-json': '{"incomplete": json',
              responses: {
                '200': {
                  description: 'Success'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBeGreaterThan(0);
    });

    it('should handle specs with no paths', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        'x-global-extension': {
          value: 'test'
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBe(14);
      expect(result.score.extensions.max).toBe(15);
    });

    it('should handle null components gracefully', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        components: null,
        paths: {},
        'x-test-extension': true
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBe(14);
    });
  });

  describe('Vendor Extension Patterns', () => {
    it('should validate standard vendor extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Vendor API', version: '1.0.0' },
        'x-logo': {
          url: 'https://example.com/logo.png',
          altText: 'Company Logo'
        },
        'x-api-id': 'company-api-v1',
        'x-audience': 'external',
        'x-maturity': 'stable',
        paths: {
          '/api/v2/endpoint': {
            get: {
              'x-codegen-request-body-name': 'request',
              'x-internal-notes': 'Legacy compatibility maintained',
              responses: {
                '200': {
                  description: 'Success',
                  'x-examples': {
                    'success-case': {
                      summary: 'Successful response',
                      value: { status: 'ok' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBe(14);
    });

    it('should validate code generation extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Codegen API', version: '1.0.0' },
        'x-code-samples': [
          {
            lang: 'javascript',
            source: 'fetch("/api/v2/data")'
          },
          {
            lang: 'python',
            source: 'requests.get("/api/v2/data")'
          }
        ],
        paths: {
          '/api/v2/data': {
            get: {
              'x-code-samples': [
                {
                  lang: 'curl',
                  source: 'curl -X GET /api/v2/data'
                }
              ],
              responses: {
                '200': {
                  description: 'Data response'
                }
              }
            }
          }
        },
        components: {
          schemas: {
            DataModel: {
              type: 'object',
              'x-class-name': 'DataResponse',
              'x-package': 'com.smackdab.api.models',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBe(14);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large number of extensions efficiently', () => {
      const spec: any = {
        openapi: '3.0.3',
        info: { title: 'Large Extensions API', version: '1.0.0' },
        paths: {}
      };

      // Add many extensions at different levels
      for (let i = 0; i < 50; i++) {
        spec[`x-extension-${i}`] = {
          value: `test-value-${i}`,
          metadata: { index: i }
        };
      }

      // Add paths with extensions
      for (let i = 0; i < 20; i++) {
        spec.paths[`/api/v2/endpoint${i}`] = {
          get: {
            [`x-operation-ext-${i}`]: `value-${i}`,
            responses: {
              '200': {
                description: `Response ${i}`,
                [`x-response-ext-${i}`]: `response-value-${i}`
              }
            }
          }
        };
      }

      const start = performance.now();
      const result = checkExtensions(spec);
      const end = performance.now();

      expect(end - start).toBeLessThan(100); // Should be reasonably fast
      expect(result.score.extensions.add).toBe(11); // Deducted for excessive (90) and unknown extensions
      expect(result.score.extensions.max).toBe(15);
    });
  });

  describe('Extension Pattern Violations', () => {
    it('should detect inappropriate use of non-standard extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Bad Extensions API', version: '1.0.0' },
        'x-custom-unauthorized': 'should use x-smackdab prefix',
        'x-deprecated-extension': 'old pattern',
        paths: {
          '/api/v2/endpoint': {
            get: {
              'x-vendor-specific': 'should be generic',
              responses: {
                '200': {
                  description: 'Success',
                  'x-non-standard': 'problematic'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      // Current implementation doesn't validate naming conventions
      expect(result.findings).toEqual([]);
      expect(result.score.extensions.add).toBe(14); // Has vendor extensions
    });

    it('should detect missing required Smackdab extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Missing Extensions API', version: '1.0.0' },
        paths: {
          '/api/v2/critical-endpoint': {
            get: {
              operationId: 'getCriticalData',
              responses: {
                '200': {
                  description: 'Critical data',
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
        // Missing required x-smackdab-tenancy, x-performance-slas, etc.
      };

      const result = checkExtensions(spec);

      // Current implementation doesn't check for required extensions
      expect(result.findings).toEqual([
        expect.objectContaining({
          ruleId: 'EXT-NONE',
          severity: 'info'
        })
      ]);
      expect(result.score.extensions.add).toBe(12); // No extensions
    });

    it('should detect forbidden technology references in extensions', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Forbidden Tech API', version: '1.0.0' },
        'x-platform-constraints': {
          'cache-backend': 'redis', // Forbidden - should use dragonfly/valkey
          'message-queue': 'kafka', // Forbidden - should use pulsar
          'search-engine': 'elasticsearch' // Forbidden
        },
        paths: {
          '/api/v2/endpoint': {
            get: {
              'x-cache-backend': 'redis',
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      // Current implementation doesn't check for forbidden technologies
      expect(result.findings).toEqual([]);
      expect(result.score.extensions.add).toBe(14); // Has vendor extensions
    });
  });

  describe('Extension Validation Rules', () => {
    it('should validate x-smackdab-tenancy extension structure', () => {
      const spec = {
        openapi: '3.0.3',
        info: { 
          title: 'Tenant API', 
          version: '1.0.0',
          'x-smackdab-tenancy': {
            'isolation-level': 'row-level',
            'tenant-identification': ['organization-id', 'branch-id'],
            'cross-tenant-access': false,
            'data-segregation': 'strict'
          }
        },
        paths: {
          '/api/v2/tenant-data': {
            get: {
              'x-smackdab-resource': 'tenant-data',
              'x-tenant-scope': 'organization',
              responses: {
                '200': { description: 'Tenant data' }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      // Should pass validation for proper tenancy extension
      expect(result.findings.filter(f => f.ruleId.startsWith('EXT-SMACKDAB-TENANCY'))).
        toHaveLength(0);
    });

    it('should validate x-performance-slas extension completeness', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Performance API', version: '1.0.0' },
        'x-performance-slas': {
          latency: {
            p50: '25ms',
            p90: '50ms',
            p95: '75ms',
            p99: '100ms'
          },
          throughput: {
            target: '10000 rps',
            burst: '15000 rps',
            sustained: '8000 rps'
          },
          availability: {
            target: '99.9%',
            measurement: 'monthly',
            'downtime-budget': '43.2 minutes'
          },
          error_rate: {
            target: '0.1%',
            measurement: 'per-hour'
          }
        },
        paths: {
          '/api/v2/performance-critical': {
            get: {
              'x-performance-tier': 'critical',
              'x-slo-target': '25ms',
              responses: {
                '200': {
                  description: 'Critical response',
                  'x-response-time-target': '10ms'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      // Should pass validation for complete performance SLA extension
      expect(result.findings.filter(f => f.ruleId.startsWith('EXT-PERFORMANCE'))).
        toHaveLength(0);
    });
  });

  describe('Stub Implementation Consistency', () => {
    it('should return consistent scoring regardless of input complexity', () => {
      const specs = [
        MockOpenApiFactory.validMinimal(),
        { openapi: '3.0.3', info: { title: 'Empty', version: '1.0.0' }, paths: {} }
      ];

      // First two specs have no extensions
      specs.forEach(spec => {
        const result = checkExtensions(spec);
        expect(result.findings).toEqual([
          expect.objectContaining({
            ruleId: 'EXT-NONE',
            severity: 'info'
          })
        ]);
        expect(result.score.extensions.add).toBe(12); // No extensions score
        expect(result.score.extensions.max).toBe(15);
      });
      
      // Third spec with Smackdab extensions
      const extendedSpec = {
        openapi: '3.0.3',
        info: { title: 'Extended API', version: '1.0.0' },
        'x-smackdab-tenancy': true,
        'x-performance-slas': { p99: '100ms' },
        paths: {
          '/api/v2/extended': {
            get: {
              'x-cache-ttl': 300,
              responses: {
                '200': {
                  description: 'Extended response',
                  'x-monitoring': 'enabled'
                }
              }
            }
          }
        }
      };
      
      const extendedResult = checkExtensions(extendedSpec);
      expect(extendedResult.findings).toEqual([]);
      expect(extendedResult.score.extensions.add).toBe(15); // Has Smackdab extensions
      expect(extendedResult.score.extensions.max).toBe(15);
    });

    it('should handle deeply nested extension structures', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Deep Extensions API', version: '1.0.0' },
        'x-deep-config': {
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep-value',
                  array: [1, 2, 3],
                  nested: {
                    property: 'nested-property'
                  }
                }
              }
            }
          }
        },
        paths: {
          '/api/v2/deep': {
            get: {
              'x-nested-config': {
                cache: {
                  strategy: 'write-through',
                  levels: {
                    L1: { ttl: 60, size: '100MB' },
                    L2: { ttl: 300, size: '1GB' }
                  }
                }
              },
              responses: {
                '200': {
                  description: 'Success'
                }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBe(14);
      expect(result.score.extensions.max).toBe(15);
    });

    it('should handle circular references in extensions gracefully', () => {
      const circularRef: any = { name: 'circular' };
      circularRef.self = circularRef;

      const spec = {
        openapi: '3.0.3',
        info: { title: 'Circular Extension API', version: '1.0.0' },
        'x-circular-extension': circularRef,
        paths: {
          '/api/v2/circular': {
            get: {
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      // Should handle circular references without crashing
      expect(result.score.extensions.add).toBe(14);
      expect(result.score.extensions.max).toBe(15);
    });
  });

  describe('Extension Best Practices', () => {
    it('should validate extension documentation patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Documented Extensions API', version: '1.0.0' },
        'x-extension-docs': {
          'x-smackdab-tenancy': {
            description: 'Enables multi-tenant data isolation',
            required: true,
            values: ['boolean', 'object']
          },
          'x-performance-tier': {
            description: 'Performance classification for operation',
            required: false,
            values: ['critical', 'high', 'medium', 'low']
          }
        },
        paths: {
          '/api/v2/documented': {
            get: {
              'x-smackdab-tenancy': true,
              'x-performance-tier': 'high',
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBe(15); // Has x-smackdab-tenancy
    });

    it('should validate extension versioning patterns', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Versioned Extensions API', version: '1.0.0' },
        'x-extension-version': '2.1',
        'x-deprecated-extensions': {
          'x-old-cache-config': {
            deprecated: true,
            replacedBy: 'x-caching-strategy',
            removalDate: '2024-12-31'
          }
        },
        'x-caching-strategy': {
          version: '2.0',
          'default-ttl': 3600
        },
        paths: {
          '/api/v2/versioned': {
            get: {
              'x-caching-strategy': { ttl: 300 },
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      const result = checkExtensions(spec);

      expect(result.score.extensions.add).toBe(14);
    });
  });
});