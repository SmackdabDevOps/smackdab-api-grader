/**
 * Tenancy Semantic Module Unit Tests
 * 
 * Tests multi-tenant security patterns and Smackdab-specific requirements:
 * - X-Organization-ID header validation (SEC-ORG-HDR)
 * - X-Branch-ID header validation (SEC-BRANCH-HDR) 
 * - OAuth2 security scheme presence (SEC-OAUTH2)
 * - API key and Bearer authentication validation
 * - Auto-fail conditions for missing tenant context
 * 
 * Critical for Smackdab multi-tenant architecture compliance.
 */

import { checkTenancy } from '../../../src/app/semantic/tenancy.js';
import { MockOpenApiFactory } from '../../helpers/mock-factories.js';

describe('Tenancy Semantic Module', () => {
  describe('Multi-Tenant Header Requirements', () => {
    it('should require X-Organization-ID header on all operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkTenancy(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SEC-ORG-HDR',
            severity: 'error',
            category: 'security',
            message: 'Missing X-Organization-ID (OrganizationHeader) on operation',
            jsonPath: "$.paths['/users'].get.parameters"
          })
        ])
      );
      
      expect(result.autoFailReasons).toContain('Missing X-Organization-ID on one or more operations');
    });

    it('should require X-Branch-ID header on all operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/projects': {
            post: {
              operationId: 'createProject',
              parameters: [
                { $ref: '#/components/parameters/OrganizationHeader' }
              ],
              responses: { '201': { description: 'Created' } }
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

      const result = checkTenancy(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SEC-BRANCH-HDR',
            severity: 'error',
            category: 'security',
            message: 'Missing X-Branch-ID (BranchHeader) on operation',
            jsonPath: "$.paths['/projects'].post.parameters"
          })
        ])
      );
    });

    it('should pass when both tenant headers are present', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              parameters: [
                { $ref: '#/components/parameters/OrganizationHeader' },
                { $ref: '#/components/parameters/BranchHeader' }
              ],
              responses: { '200': { description: 'Success' } }
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
            },
            BranchHeader: {
              name: 'X-Branch-ID', 
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

      const result = checkTenancy(spec);

      expect(result.findings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'SEC-ORG-HDR' })
        ])
      );
      expect(result.findings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'SEC-BRANCH-HDR' })
        ])
      );
      expect(result.autoFailReasons).toHaveLength(0);
      expect(result.score.tenancy.add).toBeGreaterThanOrEqual(11); // 4+3+4
    });

    it('should handle path-level parameters correctly', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            parameters: [
              { $ref: '#/components/parameters/OrganizationHeader' },
              { $ref: '#/components/parameters/BranchHeader' }
            ],
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            },
            post: {
              operationId: 'createUser',
              responses: { '201': { description: 'Created' } }
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
            },
            BranchHeader: {
              name: 'X-Branch-ID',
              in: 'header',
              required: true, 
              schema: { type: 'integer' }
            }
          },
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: {
                clientCredentials: {
                  tokenUrl: 'https://auth.example.com/oauth/token',
                  scopes: {}
                }
              }
            }
          }
        }
      };

      const result = checkTenancy(spec);

      // Both operations should inherit path-level parameters
      expect(result.findings.filter(f => f.ruleId === 'SEC-ORG-HDR')).toHaveLength(0);
      expect(result.findings.filter(f => f.ruleId === 'SEC-BRANCH-HDR')).toHaveLength(0);
      expect(result.autoFailReasons).toHaveLength(0);
    });

    it('should handle operation-level parameters overriding path-level', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            parameters: [
              { $ref: '#/components/parameters/OrganizationHeader' }
            ],
            get: {
              operationId: 'getUsers',
              parameters: [
                { $ref: '#/components/parameters/BranchHeader' }
              ],
              responses: { '200': { description: 'Success' } }
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
            },
            BranchHeader: {
              name: 'X-Branch-ID',
              in: 'header',
              required: true,
              schema: { type: 'integer' }
            }
          },
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: {
                implicit: {
                  authorizationUrl: 'https://auth.example.com/oauth/authorize',
                  scopes: { read: 'Read access' }
                }
              }
            }
          }
        }
      };

      const result = checkTenancy(spec);

      // Should have both headers available (path + operation level)
      expect(result.findings.filter(f => f.ruleId === 'SEC-ORG-HDR')).toHaveLength(0);
      expect(result.findings.filter(f => f.ruleId === 'SEC-BRANCH-HDR')).toHaveLength(0);
    });
  });

  describe('Security Schemes Validation', () => {
    it('should require OAuth2 security scheme', () => {
      const spec = MockOpenApiFactory.validMinimal();

      const result = checkTenancy(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SEC-OAUTH2',
            severity: 'error',
            category: 'security',
            message: 'OAuth2 security scheme missing (OAuth2)',
            jsonPath: '$.components.securitySchemes'
          })
        ])
      );
    });

    it('should validate API key authentication is in header', () => {
      const spec = {
        ...MockOpenApiFactory.validMinimal(),
        components: {
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: {
                clientCredentials: {
                  tokenUrl: 'https://auth.example.com/oauth/token',
                  scopes: {}
                }
              }
            },
            ApiKeyAuth: {
              type: 'apiKey',
              in: 'query', // Wrong location
              name: 'api_key'
            }
          }
        }
      };

      const result = checkTenancy(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SEC-APIKEY',
            severity: 'warn',
            category: 'security',
            message: 'ApiKeyAuth must be in header',
            jsonPath: '$.components.securitySchemes.ApiKeyAuth'
          })
        ])
      );
    });

    it('should validate Bearer authentication type', () => {
      const spec = {
        ...MockOpenApiFactory.validMinimal(),
        components: {
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
            },
            BearerAuth: {
              type: 'oauth2', // Should be 'http'
              scheme: 'bearer'
            }
          }
        }
      };

      const result = checkTenancy(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'SEC-BEARER',
            severity: 'warn',
            category: 'security', 
            message: 'BearerAuth must be type http',
            jsonPath: '$.components.securitySchemes.BearerAuth'
          })
        ])
      );
    });

    it('should pass with correct security scheme configurations', () => {
      const spec = {
        ...MockOpenApiFactory.validMinimal(),
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
            },
            ApiKeyAuth: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key'
            },
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        }
      };

      const result = checkTenancy(spec);

      expect(result.findings.filter((f: any) => f.ruleId.startsWith('SEC-'))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'SEC-ORG-HDR' }),
          expect.objectContaining({ ruleId: 'SEC-BRANCH-HDR' })
        ])
      );
      // Should not find OAuth2, ApiKey, or Bearer errors
      expect(result.findings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'SEC-OAUTH2' })
        ])
      );
      expect(result.findings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'SEC-APIKEY' })
        ])
      );
      expect(result.findings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'SEC-BEARER' })
        ])
      );
    });
  });

  describe('Scoring Logic', () => {
    it('should allocate points correctly for each satisfied requirement', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/OrganizationHeader' },
                { $ref: '#/components/parameters/BranchHeader' }
              ],
              responses: { '200': { description: 'Success' } }
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
            },
            BranchHeader: {
              name: 'X-Branch-ID',
              in: 'header',
              required: true,
              schema: { type: 'integer' }
            }
          },
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: {
                clientCredentials: {
                  tokenUrl: 'https://auth.example.com/oauth/token',
                  scopes: {}
                }
              }
            },
            ApiKeyAuth: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key'
            },
            BearerAuth: {
              type: 'http',
              scheme: 'bearer'
            }
          }
        }
      };

      const result = checkTenancy(spec);

      expect(result.score.tenancy.add).toBe(15); // 4+3+4+2+2
      expect(result.score.tenancy.max).toBe(15);
    });

    it('should have partial scoring when some requirements are missing', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/OrganizationHeader' }
                // Missing BranchHeader
              ],
              responses: { '200': { description: 'Success' } }
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
          },
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: {
                clientCredentials: {
                  tokenUrl: 'https://auth.example.com/oauth/token',
                  scopes: {}
                }
              }
            }
            // Missing ApiKeyAuth and BearerAuth
          }
        }
      };

      const result = checkTenancy(spec);

      expect(result.score.tenancy.add).toBe(12); // 4 (org) + 0 (branch) + 4 (oauth2) + 2 (apikey ok by default) + 2 (bearer ok by default)
      expect(result.score.tenancy.max).toBe(15);
    });

    it('should have zero score when critical requirements are missing', () => {
      const spec = MockOpenApiFactory.validMinimal();

      const result = checkTenancy(spec);

      expect(result.score.tenancy.add).toBe(4); // 2 (apikey ok by default) + 2 (bearer ok by default), org/branch/oauth2 missing
      expect(result.score.tenancy.max).toBe(15);
    });
  });

  describe('Auto-fail Conditions', () => {
    it('should trigger auto-fail when Organization header is missing', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkTenancy(spec);

      expect(result.autoFailReasons).toEqual([
        'Missing X-Organization-ID on one or more operations'
      ]);
    });

    it('should not trigger auto-fail when Organization header is present everywhere', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/OrganizationHeader' }
              ],
              responses: { '200': { description: 'Success' } }
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

      const result = checkTenancy(spec);

      expect(result.autoFailReasons).toHaveLength(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle specs with no paths', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' }
      };

      const result = checkTenancy(spec);

      expect(result.findings).toHaveLength(1); // Only OAuth2 missing
      expect(result.findings[0].ruleId).toBe('SEC-OAUTH2');
      expect(result.autoFailReasons).toHaveLength(0); // No operations to check
    });

    it('should handle paths with no operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {}
        }
      };

      const result = checkTenancy(spec);

      expect(result.findings).toHaveLength(1); // Only OAuth2 missing
      expect(result.autoFailReasons).toHaveLength(0); // No operations to check
    });

    it('should handle malformed parameter references', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/NonExistent' },
                { $ref: 'invalid-ref' }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      const result = checkTenancy(spec);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'SEC-ORG-HDR' }),
          expect.objectContaining({ ruleId: 'SEC-BRANCH-HDR' })
        ])
      );
      expect(result.autoFailReasons).toEqual([
        'Missing X-Organization-ID on one or more operations'
      ]);
    });

    it('should handle null/undefined components', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        },
        components: null
      };

      const result = checkTenancy(spec);

      expect(result.findings).toHaveLength(3); // ORG-HDR, BRANCH-HDR, OAUTH2
      expect(result.autoFailReasons).toEqual([
        'Missing X-Organization-ID on one or more operations'
      ]);
    });
  });

  describe('Multi-tenant Isolation Tests', () => {
    it('should enforce tenant headers on all CRUD operations', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Multi-tenant API', version: '1.0.0' },
        paths: {
          '/users': {
            get: { responses: { '200': { description: 'Success' } } },
            post: { responses: { '201': { description: 'Created' } } }
          },
          '/users/{id}': {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            get: { responses: { '200': { description: 'Success' } } },
            put: { responses: { '200': { description: 'Updated' } } },
            delete: { responses: { '204': { description: 'Deleted' } } }
          }
        }
      };

      const result = checkTenancy(spec);

      // Should find violations for all 5 operations
      const orgViolations = result.findings.filter((f: any) => f.ruleId === 'SEC-ORG-HDR');
      const branchViolations = result.findings.filter((f: any) => f.ruleId === 'SEC-BRANCH-HDR');
      
      expect(orgViolations).toHaveLength(5);
      expect(branchViolations).toHaveLength(5);
      expect(result.autoFailReasons).toContain('Missing X-Organization-ID on one or more operations');
    });

    it('should verify tenant isolation across different resource types', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Multi-tenant API', version: '1.0.0' },
        paths: {
          '/organizations/{orgId}/users': {
            parameters: [
              { $ref: '#/components/parameters/OrganizationHeader' },
              { $ref: '#/components/parameters/BranchHeader' }
            ],
            get: { responses: { '200': { description: 'Users' } } }
          },
          '/organizations/{orgId}/projects': {
            parameters: [
              { $ref: '#/components/parameters/OrganizationHeader' },
              { $ref: '#/components/parameters/BranchHeader' }
            ],
            get: { responses: { '200': { description: 'Projects' } } }
          }
        },
        components: {
          parameters: {
            OrganizationHeader: {
              name: 'X-Organization-ID',
              in: 'header',
              required: true,
              schema: { type: 'integer' },
              description: 'Organization identifier for multi-tenancy'
            },
            BranchHeader: {
              name: 'X-Branch-ID', 
              in: 'header',
              required: true,
              schema: { type: 'integer' },
              description: 'Branch identifier for multi-tenancy'
            }
          },
          securitySchemes: {
            OAuth2: {
              type: 'oauth2',
              flows: {
                authorizationCode: {
                  authorizationUrl: 'https://auth.example.com/oauth/authorize',
                  tokenUrl: 'https://auth.example.com/oauth/token',
                  scopes: {
                    read: 'Read access to tenant data',
                    write: 'Write access to tenant data'
                  }
                }
              }
            }
          }
        }
      };

      const result = checkTenancy(spec);

      // Should pass all tenant checks
      expect(result.findings.filter((f: any) => f.ruleId === 'SEC-ORG-HDR')).toHaveLength(0);
      expect(result.findings.filter((f: any) => f.ruleId === 'SEC-BRANCH-HDR')).toHaveLength(0);
      expect(result.findings.filter((f: any) => f.ruleId === 'SEC-OAUTH2')).toHaveLength(0);
      expect(result.autoFailReasons).toHaveLength(0);
      expect(result.score.tenancy.add).toBe(15); // Full score
    });
  });
});