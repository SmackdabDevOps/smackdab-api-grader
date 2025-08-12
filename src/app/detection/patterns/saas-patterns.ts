/**
 * Enterprise SaaS API Pattern Library
 * Comprehensive patterns for identifying multi-tenant SaaS APIs
 */

import { Pattern } from './rest-patterns';

export class SaaSPatterns {
  static readonly patterns: Pattern[] = [
    {
      id: 'saas.multi_tenant_headers',
      name: 'Multi-Tenant Headers',
      description: 'Requires organization/tenant identification headers',
      weight: 1.0,
      detector: (spec) => {
        const tenantHeaders = [
          'X-Organization-ID', 'X-Tenant-ID', 'X-Company-ID', 
          'X-Account-ID', 'X-Workspace-ID', 'X-Team-ID'
        ];
        
        let found = false;
        
        // Check in path parameters
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.parameters) {
              op.parameters.forEach((param: any) => {
                if (param.in === 'header' && tenantHeaders.some(h => 
                  param.name.toLowerCase() === h.toLowerCase()
                )) {
                  found = true;
                }
              });
            }
          });
        });
        
        // Check in components
        if (spec.components?.parameters) {
          Object.values(spec.components.parameters).forEach((param: any) => {
            if (param.in === 'header' && tenantHeaders.some(h => 
              param.name.toLowerCase() === h.toLowerCase()
            )) {
              found = true;
            }
          });
        }
        
        return found;
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        const tenantHeaders = [
          'X-Organization-ID', 'X-Tenant-ID', 'X-Company-ID', 
          'X-Account-ID', 'X-Workspace-ID', 'X-Team-ID'
        ];
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.parameters) {
              op.parameters.forEach((param: any) => {
                if (param.in === 'header' && tenantHeaders.some(h => 
                  param.name.toLowerCase() === h.toLowerCase()
                )) {
                  evidence.push(`Required: ${param.name}`);
                }
              });
            }
          });
        });
        
        return evidence.slice(0, 3);
      }
    },
    
    {
      id: 'saas.admin_endpoints',
      name: 'Administrative Endpoints',
      description: 'System/admin endpoints for tenant management',
      weight: 0.85,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.some(p => 
          /\/(admin|system|management|organizations|tenants|accounts)/.test(p.toLowerCase())
        );
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const adminPaths = paths.filter(p => 
          /\/(admin|system|management|organizations)/.test(p.toLowerCase())
        );
        
        return adminPaths.slice(0, 3);
      }
    },
    
    {
      id: 'saas.rbac_scopes',
      name: 'Role-Based Access Control',
      description: 'OAuth scopes for role-based permissions',
      weight: 0.9,
      detector: (spec) => {
        if (!spec.components?.securitySchemes) return false;
        
        let hasRBACScopes = false;
        
        Object.values(spec.components.securitySchemes).forEach((scheme: any) => {
          if (scheme.flows) {
            Object.values(scheme.flows).forEach((flow: any) => {
              if (flow.scopes) {
                const scopeKeys = Object.keys(flow.scopes);
                const rbacPatterns = ['admin:', 'write:', 'read:', 'delete:', 
                                     'manage:', 'view:', 'edit:', 'owner:'];
                
                if (scopeKeys.some(scope => 
                  rbacPatterns.some(pattern => scope.includes(pattern))
                )) {
                  hasRBACScopes = true;
                }
              }
            });
          }
        });
        
        return hasRBACScopes;
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        
        if (!spec.components?.securitySchemes) return evidence;
        
        Object.values(spec.components.securitySchemes).forEach((scheme: any) => {
          if (scheme.flows) {
            Object.values(scheme.flows).forEach((flow: any) => {
              if (flow.scopes) {
                const scopeKeys = Object.keys(flow.scopes);
                const rbacScopes = scopeKeys.filter(scope => 
                  /admin:|write:|read:|delete:/.test(scope)
                );
                
                if (rbacScopes.length > 0) {
                  evidence.push(`RBAC scopes: ${rbacScopes.slice(0, 3).join(', ')}`);
                }
              }
            });
          }
        });
        
        return evidence;
      }
    },
    
    {
      id: 'saas.subscription_billing',
      name: 'Subscription & Billing',
      description: 'Endpoints for subscription and billing management',
      weight: 0.8,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const billingKeywords = ['billing', 'subscription', 'invoice', 'payment', 
                                'plan', 'tier', 'usage', 'credit', 'quota'];
        
        return paths.some(p => 
          billingKeywords.some(keyword => p.toLowerCase().includes(keyword))
        );
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const billingKeywords = ['billing', 'subscription', 'invoice', 'payment', 'plan'];
        
        const billingPaths = paths.filter(p => 
          billingKeywords.some(keyword => p.toLowerCase().includes(keyword))
        );
        
        return billingPaths.slice(0, 3);
      }
    },
    
    {
      id: 'saas.audit_logging',
      name: 'Audit Logging',
      description: 'Audit trail and activity logging endpoints',
      weight: 0.75,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.some(p => 
          /\/(audit|logs|activity|history|events|changelog)/.test(p.toLowerCase())
        );
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const auditPaths = paths.filter(p => 
          /\/(audit|logs|activity|history)/.test(p.toLowerCase())
        );
        
        return auditPaths.length > 0 ? 
          [`Audit endpoints: ${auditPaths.slice(0, 2).join(', ')}`] : [];
      }
    },
    
    {
      id: 'saas.user_management',
      name: 'User & Team Management',
      description: 'User invitation and team management',
      weight: 0.7,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const userMgmtKeywords = ['users', 'members', 'teams', 'invitations', 
                                  'roles', 'permissions', 'groups'];
        
        let matchCount = 0;
        paths.forEach(p => {
          if (userMgmtKeywords.some(keyword => p.toLowerCase().includes(keyword))) {
            matchCount++;
          }
        });
        
        return matchCount >= 2;
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const userMgmtKeywords = ['users', 'members', 'teams', 'invitations'];
        
        const mgmtPaths = paths.filter(p => 
          userMgmtKeywords.some(keyword => p.toLowerCase().includes(keyword))
        );
        
        return mgmtPaths.length > 0 ? 
          [`User management: ${mgmtPaths.slice(0, 3).join(', ')}`] : [];
      }
    },
    
    {
      id: 'saas.api_keys',
      name: 'API Key Management',
      description: 'API key generation and management',
      weight: 0.65,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.some(p => 
          /api[_-]?keys?|tokens?|credentials/.test(p.toLowerCase())
        );
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const keyPaths = paths.filter(p => 
          /api[_-]?keys?|tokens?/.test(p.toLowerCase())
        );
        
        return keyPaths.length > 0 ? 
          [`API key management: ${keyPaths[0]}`] : [];
      }
    },
    
    {
      id: 'saas.webhooks',
      name: 'Webhook Configuration',
      description: 'Webhook setup and management',
      weight: 0.6,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.some(p => 
          /webhook|hook|callback|notification/.test(p.toLowerCase())
        );
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const webhookPaths = paths.filter(p => 
          /webhook|hook/.test(p.toLowerCase())
        );
        
        return webhookPaths.length > 0 ? 
          [`Webhook endpoints: ${webhookPaths[0]}`] : [];
      }
    },
    
    {
      id: 'saas.rate_limiting',
      name: 'Rate Limiting Headers',
      description: 'Rate limit headers in responses',
      weight: 0.7,
      detector: (spec) => {
        let hasRateLimiting = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.responses) {
              Object.values(op.responses).forEach((response: any) => {
                if (response.headers) {
                  const headerNames = Object.keys(response.headers);
                  if (headerNames.some(h => 
                    /rate|limit|quota|remaining/i.test(h)
                  )) {
                    hasRateLimiting = true;
                  }
                }
              });
            }
          });
        });
        
        return hasRateLimiting;
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.responses) {
              Object.values(op.responses).forEach((response: any) => {
                if (response.headers) {
                  const rateLimitHeaders = Object.keys(response.headers).filter(h => 
                    /rate|limit/i.test(h)
                  );
                  
                  if (rateLimitHeaders.length > 0) {
                    evidence.push(`Rate limit headers: ${rateLimitHeaders.join(', ')}`);
                  }
                }
              });
            }
          });
        });
        
        return evidence.slice(0, 1);
      }
    },
    
    {
      id: 'saas.sso_integration',
      name: 'SSO Integration',
      description: 'Single Sign-On support',
      weight: 0.65,
      detector: (spec) => {
        const specString = JSON.stringify(spec).toLowerCase();
        return specString.includes('saml') || 
               specString.includes('oauth') ||
               specString.includes('openid') ||
               specString.includes('sso');
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        const specString = JSON.stringify(spec).toLowerCase();
        
        if (specString.includes('saml')) evidence.push('SAML support');
        if (specString.includes('oauth')) evidence.push('OAuth support');
        if (specString.includes('openid')) evidence.push('OpenID Connect');
        if (specString.includes('sso')) evidence.push('SSO mentioned');
        
        return evidence.slice(0, 2);
      }
    },
    
    {
      id: 'saas.data_isolation',
      name: 'Data Isolation Patterns',
      description: 'Tenant data isolation indicators',
      weight: 0.8,
      detector: (spec) => {
        // Check if all data endpoints require tenant context
        let totalDataEndpoints = 0;
        let tenantScopedEndpoints = 0;
        
        Object.entries(spec.paths || {}).forEach(([path, pathObj]: [string, any]) => {
          // Skip admin/system endpoints
          if (/\/(admin|system|health)/.test(path)) return;
          
          Object.values(pathObj).forEach((op: any) => {
            if (typeof op === 'object' && op.parameters) {
              totalDataEndpoints++;
              
              // Check for tenant headers
              const hasTenantContext = op.parameters.some((param: any) => 
                param.in === 'header' && 
                /organization|tenant|company|account/i.test(param.name)
              );
              
              if (hasTenantContext) tenantScopedEndpoints++;
            }
          });
        });
        
        return totalDataEndpoints > 0 && 
               (tenantScopedEndpoints / totalDataEndpoints) > 0.7;
      },
      evidence: (spec) => {
        let totalDataEndpoints = 0;
        let tenantScopedEndpoints = 0;
        
        Object.entries(spec.paths || {}).forEach(([path, pathObj]: [string, any]) => {
          if (/\/(admin|system|health)/.test(path)) return;
          
          Object.values(pathObj).forEach((op: any) => {
            if (typeof op === 'object' && op.parameters) {
              totalDataEndpoints++;
              
              const hasTenantContext = op.parameters.some((param: any) => 
                param.in === 'header' && 
                /organization|tenant|company|account/i.test(param.name)
              );
              
              if (hasTenantContext) tenantScopedEndpoints++;
            }
          });
        });
        
        return [`${tenantScopedEndpoints}/${totalDataEndpoints} endpoints require tenant context`];
      }
    }
  ];

  /**
   * Calculate SaaS confidence score
   */
  static calculateScore(spec: any): number {
    let totalScore = 0;
    let totalWeight = 0;
    
    this.patterns.forEach(pattern => {
      if (pattern.detector(spec)) {
        totalScore += pattern.weight;
      }
      totalWeight += pattern.weight;
    });
    
    return totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
  }

  /**
   * Get detailed evidence
   */
  static getEvidence(spec: any): string[] {
    const evidence: string[] = [];
    
    this.patterns.forEach(pattern => {
      if (pattern.detector(spec)) {
        const patternEvidence = pattern.evidence(spec);
        if (patternEvidence.length > 0) {
          evidence.push(`${pattern.name}: ${patternEvidence.join(', ')}`);
        }
      }
    });
    
    return evidence;
  }

  /**
   * Check SaaS-specific requirements
   */
  static checkRequirements(spec: any): {
    met: string[];
    missing: string[];
    recommendations: string[];
  } {
    const met: string[] = [];
    const missing: string[] = [];
    const recommendations: string[] = [];
    
    // Check multi-tenancy
    const hasMultiTenant = this.patterns.find(p => 
      p.id === 'saas.multi_tenant_headers'
    )?.detector(spec);
    
    if (hasMultiTenant) {
      met.push('Multi-tenant isolation headers');
    } else {
      missing.push('Multi-tenant headers (X-Organization-ID)');
      recommendations.push('Add organization/tenant identification headers');
    }
    
    // Check RBAC
    const hasRBAC = this.patterns.find(p => 
      p.id === 'saas.rbac_scopes'
    )?.detector(spec);
    
    if (hasRBAC) {
      met.push('Role-based access control');
    } else {
      missing.push('RBAC OAuth scopes');
      recommendations.push('Implement role-based permission scopes');
    }
    
    // Check audit logging
    const hasAudit = this.patterns.find(p => 
      p.id === 'saas.audit_logging'
    )?.detector(spec);
    
    if (hasAudit) {
      met.push('Audit logging endpoints');
    } else {
      recommendations.push('Add audit trail/activity logging');
    }
    
    // Check rate limiting
    const hasRateLimiting = this.patterns.find(p => 
      p.id === 'saas.rate_limiting'
    )?.detector(spec);
    
    if (hasRateLimiting) {
      met.push('Rate limiting headers');
    } else {
      missing.push('Rate limit headers');
      recommendations.push('Add X-RateLimit headers to responses');
    }
    
    // Check data isolation
    const hasDataIsolation = this.patterns.find(p => 
      p.id === 'saas.data_isolation'
    )?.detector(spec);
    
    if (hasDataIsolation) {
      met.push('Tenant data isolation');
    } else {
      missing.push('Consistent tenant data isolation');
      recommendations.push('Ensure all data endpoints require tenant context');
    }
    
    // Check user management
    const hasUserMgmt = this.patterns.find(p => 
      p.id === 'saas.user_management'
    )?.detector(spec);
    
    if (!hasUserMgmt) {
      recommendations.push('Add user/team management endpoints');
    }
    
    return { met, missing, recommendations };
  }
}