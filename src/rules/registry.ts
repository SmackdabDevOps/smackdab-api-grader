// Rule Registry - Centralized rule definitions for API grading
// Based on coverage-based scoring to prevent double-counting

export interface Target {
  type: 'path' | 'operation' | 'schema' | 'parameter' | 'response' | 'security';
  location: string;  // JSON path
  identifier: string; // Human-readable identifier
  method?: string;    // For operations
  path?: string;      // For operations
}

export interface ValidationResult {
  passed: boolean;
  message?: string;
  fixHint?: string;
  confidence?: number; // 0-1, how confident we are in this result
}

export interface Rule {
  id: string;
  category: 'security' | 'functionality' | 'scalability' | 'maintainability' | 'excellence';
  severity: 'prerequisite' | 'critical' | 'major' | 'minor';
  points: number;  // Points if fully satisfied (0 for prerequisites)
  description: string;
  rationale: string;
  
  // Detection function returns targets that need checking
  detect: (spec: any) => Target[];
  
  // Validation function checks each target
  validate: (target: Target, spec: any) => ValidationResult;
  
  // Dependencies (other rules that must pass first)
  dependsOn?: string[];
  
  // Metadata for future use
  effort?: 'trivial' | 'easy' | 'medium' | 'hard';
  autoFixable?: boolean;
  profile?: 'all' | 'public' | 'internal' | 'prototype';
}

// Helper functions for common patterns
function hasParameter(operation: any, paramName: string, paramIn: string = 'header'): boolean {
  if (!operation.parameters) return false;
  
  // Check direct parameters
  const directParam = operation.parameters.find((p: any) => 
    p.name === paramName && p.in === paramIn
  );
  if (directParam) return true;
  
  // Check referenced parameters
  const refParam = operation.parameters.find((p: any) => {
    if (p.$ref && p.$ref.includes(`/${paramName}`)) return true;
    return false;
  });
  
  return !!refParam;
}

function getByPath(obj: any, path: string): any {
  // Simple JSON path resolver
  const parts = path.replace('$', '').split('.')
    .filter(p => p)
    .map(p => p.replace(/\[['"](.+)['"]\]/g, '.$1'));
  
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

// ============================================================================
// PREREQUISITE RULES - Must pass before any scoring
// ============================================================================

export const RULE_OPENAPI_VERSION: Rule = {
  id: 'PREREQ-001',
  category: 'functionality',
  severity: 'prerequisite',
  points: 0,
  description: 'OpenAPI version must be 3.0.3',
  rationale: 'Framework requires exact version for compatibility',
  
  detect: (spec) => [{
    type: 'security',
    location: '$.openapi',
    identifier: 'OpenAPI Version'
  }],
  
  validate: (target, spec) => {
    const version = spec.openapi;
    const passed = version === '3.0.3';
    return {
      passed,
      message: passed ? undefined : `OpenAPI version is ${version}, must be 3.0.3`,
      fixHint: `Change 'openapi: ${version}' to 'openapi: 3.0.3'`
    };
  },
  
  effort: 'trivial',
  autoFixable: true
};

export const RULE_AUTH_DEFINED: Rule = {
  id: 'PREREQ-002',
  category: 'security',
  severity: 'prerequisite',
  points: 0,
  description: 'Authentication must be defined',
  rationale: 'APIs must have some form of authentication',
  
  detect: (spec) => [{
    type: 'security',
    location: '$.components.securitySchemes',
    identifier: 'Security Schemes'
  }],
  
  validate: (target, spec) => {
    const schemes = spec.components?.securitySchemes;
    const hasAuth = schemes && Object.keys(schemes).length > 0;
    return {
      passed: hasAuth,
      message: hasAuth ? undefined : 'No security schemes defined',
      fixHint: 'Add OAuth2 or API key security scheme to components.securitySchemes'
    };
  },
  
  effort: 'easy',
  autoFixable: false
};

export const RULE_MULTI_TENANT_WRITE: Rule = {
  id: 'PREREQ-003',
  category: 'security',
  severity: 'prerequisite',
  points: 0,
  description: 'X-Organization-ID required on all write operations',
  rationale: 'Prevents cross-tenant data contamination',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of ['post', 'put', 'patch', 'delete']) {
        if (pathItem[method as keyof typeof pathItem]) {
          targets.push({
            type: 'operation',
            location: `$.paths['${path}'].${method}`,
            identifier: `${method.toUpperCase()} ${path}`,
            method,
            path
          });
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    if (!operation) return { passed: false, message: 'Operation not found' };
    
    const hasOrgHeader = hasParameter(operation, 'X-Organization-ID', 'header');
    return {
      passed: hasOrgHeader,
      message: hasOrgHeader ? undefined : 'Missing X-Organization-ID header',
      fixHint: `Add parameter: - $ref: '#/components/parameters/OrganizationHeader'`,
      confidence: 1.0
    };
  },
  
  effort: 'trivial',
  autoFixable: true
};

// ============================================================================
// FUNCTIONALITY RULES - 30 points total
// ============================================================================

export const RULE_CRUD_OPERATIONS: Rule = {
  id: 'FUNC-001',
  category: 'functionality',
  severity: 'major',
  points: 10,
  description: 'Complete CRUD operations for resources',
  rationale: 'Resources should support full lifecycle management',
  
  detect: (spec) => {
    const resources = new Map<string, Set<string>>();
    
    // Group operations by resource
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      const match = path.match(/^\/api\/v\d+\/([^/]+)/);
      if (!match) continue;
      
      const resource = match[1];
      if (!resources.has(resource)) {
        resources.set(resource, new Set());
      }
      
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (pathItem[method as keyof typeof pathItem]) {
          resources.get(resource)!.add(method);
        }
      }
    }
    
    // Create targets for each resource
    const targets: Target[] = [];
    for (const [resource, methods] of resources) {
      targets.push({
        type: 'path',
        location: `$.paths['/api/v2/${resource}']`,
        identifier: `Resource: ${resource}`,
        path: `/api/v2/${resource}`
      });
    }
    
    return targets;
  },
  
  validate: (target, spec) => {
    const resource = target.path?.split('/').pop();
    const requiredOps = ['get', 'post'];  // Minimum required
    const paths = Object.keys(spec.paths || {});
    
    const hasOps = requiredOps.filter(op => {
      const pathPattern = new RegExp(`/api/v\\d+/${resource}`);
      return paths.some(p => p.match(pathPattern) && spec.paths[p][op]);
    });
    
    const coverage = hasOps.length / requiredOps.length;
    return {
      passed: coverage === 1,
      message: coverage < 1 ? `Missing operations: ${requiredOps.filter(op => !hasOps.includes(op)).join(', ')}` : undefined,
      fixHint: 'Add missing CRUD operations',
      confidence: 0.9
    };
  },
  
  effort: 'medium'
};

export const RULE_ERROR_RESPONSES: Rule = {
  id: 'FUNC-002',
  category: 'functionality',
  severity: 'major',
  points: 8,
  description: 'Proper error response handling',
  rationale: 'Consistent error responses improve debugging',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of Object.keys(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const operation = pathItem[method as keyof typeof pathItem];
          if (operation?.responses) {
            targets.push({
              type: 'operation',
              location: `$.paths['${path}'].${method}.responses`,
              identifier: `${method.toUpperCase()} ${path}`,
              method,
              path
            });
          }
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const responses = getByPath(spec, target.location);
    if (!responses) return { passed: false, message: 'No responses defined' };
    
    const errorCodes = ['400', '401', '403', '404', '409', '500'];
    const hasErrors = errorCodes.filter(code => responses[code]).length;
    const hasProblemJson = Object.values(responses).some((r: any) => 
      r.content?.['application/problem+json']
    );
    
    const coverage = hasErrors / errorCodes.length;
    return {
      passed: coverage > 0.5 && hasProblemJson,
      message: coverage < 0.5 ? 'Missing common error responses' : 
               !hasProblemJson ? 'Not using application/problem+json' : undefined,
      fixHint: 'Add error responses with problem+json format',
      confidence: 0.85
    };
  },
  
  effort: 'easy'
};

export const RULE_RESPONSE_ENVELOPE: Rule = {
  id: 'FUNC-003',
  category: 'functionality',
  severity: 'major',
  points: 7,
  description: 'ResponseEnvelope for all success responses',
  rationale: 'Consistent response structure across API',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of Object.keys(pathItem)) {
        if (['get', 'post', 'put', 'patch'].includes(method)) {
          const operation = pathItem[method as keyof typeof pathItem];
          if (operation?.responses?.['200'] || operation?.responses?.['201']) {
            targets.push({
              type: 'response',
              location: `$.paths['${path}'].${method}.responses`,
              identifier: `${method.toUpperCase()} ${path}`,
              method,
              path
            });
          }
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const responses = getByPath(spec, target.location);
    const successResponse = responses?.['200'] || responses?.['201'];
    
    if (!successResponse) return { passed: true }; // No success response to check
    
    const schema = successResponse.content?.['application/json']?.schema;
    const hasEnvelope = schema?.$ref?.includes('ResponseEnvelope') || 
                       schema?.allOf?.some((s: any) => s.$ref?.includes('ResponseEnvelope'));
    
    return {
      passed: hasEnvelope,
      message: hasEnvelope ? undefined : 'Success response not using ResponseEnvelope',
      fixHint: 'Wrap response in ResponseEnvelope schema',
      confidence: 0.9
    };
  },
  
  effort: 'easy',
  autoFixable: true
};

export const RULE_STATUS_CODES: Rule = {
  id: 'FUNC-004',
  category: 'functionality',
  severity: 'minor',
  points: 5,
  description: 'Appropriate HTTP status codes',
  rationale: 'Correct status codes improve API usability',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of Object.keys(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          targets.push({
            type: 'operation',
            location: `$.paths['${path}'].${method}`,
            identifier: `${method.toUpperCase()} ${path}`,
            method,
            path
          });
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const responses = operation?.responses || {};
    
    // Check for appropriate status codes based on method
    let expectedCodes: string[] = [];
    switch (target.method) {
      case 'get': expectedCodes = ['200', '404']; break;
      case 'post': expectedCodes = ['201', '400']; break;
      case 'put': expectedCodes = ['200', '404']; break;
      case 'patch': expectedCodes = ['200', '404']; break;
      case 'delete': expectedCodes = ['204', '404']; break;
    }
    
    const hasExpected = expectedCodes.filter(code => responses[code]).length;
    const coverage = hasExpected / expectedCodes.length;
    
    return {
      passed: coverage >= 0.5,
      message: coverage < 0.5 ? `Missing expected status codes: ${expectedCodes.filter(c => !responses[c]).join(', ')}` : undefined,
      fixHint: 'Add appropriate status code responses',
      confidence: 0.8
    };
  },
  
  effort: 'trivial'
};

// ============================================================================
// SECURITY RULES - 25 points total
// ============================================================================

export const RULE_MULTI_TENANT_READ: Rule = {
  id: 'SEC-001',
  category: 'security',
  severity: 'critical',
  points: 7,
  description: 'X-Organization-ID on GET operations',
  rationale: 'Ensures data isolation for read operations',
  dependsOn: ['PREREQ-003'],  // Depends on write operations having it
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      if (pathItem.get) {
        targets.push({
          type: 'operation',
          location: `$.paths['${path}'].get`,
          identifier: `GET ${path}`,
          method: 'get',
          path
        });
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const hasOrgHeader = hasParameter(operation, 'X-Organization-ID', 'header');
    
    return {
      passed: hasOrgHeader,
      message: hasOrgHeader ? undefined : 'Missing X-Organization-ID header',
      fixHint: `Add parameter: - $ref: '#/components/parameters/OrganizationHeader'`,
      confidence: 1.0
    };
  },
  
  effort: 'trivial',
  autoFixable: true
};

export const RULE_BRANCH_HEADERS: Rule = {
  id: 'SEC-002',
  category: 'security',
  severity: 'major',
  points: 5,
  description: 'X-Branch-ID headers for branch isolation',
  rationale: 'Enables branch-level data isolation',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of Object.keys(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          targets.push({
            type: 'operation',
            location: `$.paths['${path}'].${method}`,
            identifier: `${method.toUpperCase()} ${path}`,
            method,
            path
          });
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const hasBranchHeader = hasParameter(operation, 'X-Branch-ID', 'header');
    
    return {
      passed: hasBranchHeader,
      message: hasBranchHeader ? undefined : 'Missing X-Branch-ID header',
      fixHint: `Add parameter: - $ref: '#/components/parameters/BranchHeader'`,
      confidence: 0.95
    };
  },
  
  effort: 'trivial',
  autoFixable: true
};

export const RULE_AUTHORIZATION: Rule = {
  id: 'SEC-003',
  category: 'security',
  severity: 'major',
  points: 5,
  description: 'Proper authorization on operations',
  rationale: 'Prevents unauthorized access',
  dependsOn: ['PREREQ-002'],
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of Object.keys(pathItem)) {
        if (['post', 'put', 'patch', 'delete'].includes(method)) {
          targets.push({
            type: 'operation',
            location: `$.paths['${path}'].${method}`,
            identifier: `${method.toUpperCase()} ${path}`,
            method,
            path
          });
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const hasSecurity = operation?.security && operation.security.length > 0;
    
    return {
      passed: hasSecurity,
      message: hasSecurity ? undefined : 'No security requirements defined',
      fixHint: 'Add security requirements to operation',
      confidence: 0.9
    };
  },
  
  effort: 'easy'
};

export const RULE_INPUT_VALIDATION: Rule = {
  id: 'SEC-004',
  category: 'security',
  severity: 'major',
  points: 8,
  description: 'Input validation schemas',
  rationale: 'Prevents injection attacks and data corruption',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of ['post', 'put', 'patch']) {
        if (pathItem[method as keyof typeof pathItem]) {
          targets.push({
            type: 'operation',
            location: `$.paths['${path}'].${method}`,
            identifier: `${method.toUpperCase()} ${path}`,
            method,
            path
          });
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const requestBody = operation?.requestBody;
    
    if (!requestBody) return { passed: true }; // No body to validate
    
    const hasSchema = requestBody.content?.['application/json']?.schema;
    const hasValidation = hasSchema && (
      hasSchema.required || 
      hasSchema.properties || 
      hasSchema.$ref
    );
    
    return {
      passed: hasValidation,
      message: hasValidation ? undefined : 'Request body lacks validation schema',
      fixHint: 'Add schema with required fields and validation rules',
      confidence: 0.85
    };
  },
  
  effort: 'medium'
};

// ============================================================================
// SCALABILITY RULES - 20 points total
// ============================================================================

export const RULE_PAGINATION: Rule = {
  id: 'SCALE-001',
  category: 'scalability',
  severity: 'critical',
  points: 8,
  description: 'Key-set pagination for list operations',
  rationale: 'Prevents performance issues with large datasets',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      if (pathItem.get && path.match(/(?<!{[^}]*)\/$|s$/)) {  // List endpoints
        targets.push({
          type: 'operation',
          location: `$.paths['${path}'].get`,
          identifier: `GET ${path}`,
          method: 'get',
          path
        });
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const params = operation?.parameters || [];
    
    const hasAfterKey = params.some((p: any) => p.name === 'AfterKey' && p.in === 'query');
    const hasBeforeKey = params.some((p: any) => p.name === 'BeforeKey' && p.in === 'query');
    const hasLimit = params.some((p: any) => p.name === 'Limit' && p.in === 'query');
    
    // Also check for bad pagination patterns
    const hasOffset = params.some((p: any) => 
      ['offset', 'page', 'pageNumber', 'page_size'].includes(p.name) && p.in === 'query'
    );
    
    const hasKeySet = (hasAfterKey || hasBeforeKey) && hasLimit;
    
    return {
      passed: hasKeySet && !hasOffset,
      message: !hasKeySet ? 'Missing key-set pagination parameters' :
               hasOffset ? 'Using forbidden offset/page pagination' : undefined,
      fixHint: 'Add AfterKey/BeforeKey/Limit parameters, remove offset/page',
      confidence: 0.95
    };
  },
  
  effort: 'medium'
};

export const RULE_CACHING_HEADERS: Rule = {
  id: 'SCALE-002',
  category: 'scalability',
  severity: 'minor',
  points: 6,
  description: 'Caching headers on cacheable resources',
  rationale: 'Improves performance and reduces server load',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      if (pathItem.get) {
        targets.push({
          type: 'operation',
          location: `$.paths['${path}'].get`,
          identifier: `GET ${path}`,
          method: 'get',
          path
        });
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const responses = operation?.responses || {};
    const successResponse = responses['200'];
    
    if (!successResponse) return { passed: true };
    
    const headers = successResponse.headers || {};
    const hasETag = 'ETag' in headers;
    const hasCacheControl = 'Cache-Control' in headers;
    
    return {
      passed: hasETag || hasCacheControl,
      message: !hasETag && !hasCacheControl ? 'Missing caching headers' : undefined,
      fixHint: 'Add ETag and Cache-Control headers to response',
      confidence: 0.8
    };
  },
  
  effort: 'easy'
};

export const RULE_ASYNC_PATTERNS: Rule = {
  id: 'SCALE-003',
  category: 'scalability',
  severity: 'minor',
  points: 4,
  description: 'Async patterns for long operations',
  rationale: 'Prevents timeout issues',
  
  detect: (spec) => {
    const targets: Target[] = [];
    // Look for operations that might be long-running
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      if (path.includes('import') || path.includes('export') || path.includes('batch')) {
        for (const method of ['post', 'put']) {
          if (pathItem[method as keyof typeof pathItem]) {
            targets.push({
              type: 'operation',
              location: `$.paths['${path}'].${method}`,
              identifier: `${method.toUpperCase()} ${path}`,
              method,
              path
            });
          }
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const responses = operation?.responses || {};
    
    // Check for 202 Accepted response
    const hasAsync = '202' in responses;
    
    return {
      passed: hasAsync,
      message: hasAsync ? undefined : 'Long operation should return 202 Accepted',
      fixHint: 'Add 202 response with status URL',
      confidence: 0.7
    };
  },
  
  effort: 'medium'
};

export const RULE_RATE_LIMITING: Rule = {
  id: 'SCALE-004',
  category: 'scalability',
  severity: 'minor',
  points: 2,
  description: 'Rate limiting headers',
  rationale: 'Prevents API abuse',
  
  detect: (spec) => {
    const targets: Target[] = [];
    // Check a few key operations
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of ['post', 'put', 'delete']) {
        if (pathItem[method as keyof typeof pathItem]) {
          targets.push({
            type: 'operation',
            location: `$.paths['${path}'].${method}`,
            identifier: `${method.toUpperCase()} ${path}`,
            method,
            path
          });
          break; // Just check one per path
        }
      }
    }
    return targets.slice(0, 5); // Limit to 5 checks
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const responses = operation?.responses || {};
    
    // Check for rate limit headers in any response
    const hasRateLimitHeaders = Object.values(responses).some((response: any) => {
      const headers = response.headers || {};
      return 'X-RateLimit-Limit' in headers || 'X-RateLimit-Remaining' in headers;
    });
    
    return {
      passed: hasRateLimitHeaders,
      message: hasRateLimitHeaders ? undefined : 'Missing rate limit headers',
      fixHint: 'Add X-RateLimit-Limit and X-RateLimit-Remaining headers',
      confidence: 0.6
    };
  },
  
  effort: 'easy'
};

// ============================================================================
// MAINTAINABILITY RULES - 15 points total
// ============================================================================

export const RULE_NAMING_CONSISTENCY: Rule = {
  id: 'MAINT-001',
  category: 'maintainability',
  severity: 'minor',
  points: 5,
  description: 'Consistent naming conventions',
  rationale: 'Improves API discoverability',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const path of Object.keys(spec.paths || {})) {
      targets.push({
        type: 'path',
        location: `$.paths['${path}']`,
        identifier: path,
        path
      });
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const path = target.path!;
    
    // Check for namespace
    const hasNamespace = path.startsWith('/api/v2/');
    
    // Check for consistent resource naming (lowercase, plural)
    const parts = path.split('/').filter(p => p && !p.startsWith('{'));
    const resources = parts.slice(2); // Skip /api/v2
    const hasConsistentNaming = resources.every(r => 
      r === r.toLowerCase() && !r.includes('_')
    );
    
    return {
      passed: hasNamespace && hasConsistentNaming,
      message: !hasNamespace ? 'Path must start with /api/v2/' :
               !hasConsistentNaming ? 'Use lowercase, hyphenated resource names' : undefined,
      fixHint: 'Follow RESTful naming conventions',
      confidence: 0.9
    };
  },
  
  effort: 'easy'
};

export const RULE_DOCUMENTATION: Rule = {
  id: 'MAINT-002',
  category: 'maintainability',
  severity: 'minor',
  points: 5,
  description: 'Operation documentation',
  rationale: 'Helps developers understand API usage',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of Object.keys(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          targets.push({
            type: 'operation',
            location: `$.paths['${path}'].${method}`,
            identifier: `${method.toUpperCase()} ${path}`,
            method,
            path
          });
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    
    const hasSummary = operation?.summary && operation.summary.length > 10;
    const hasDescription = operation?.description && operation.description.length > 20;
    const hasTags = operation?.tags && operation.tags.length > 0;
    
    const score = (hasSummary ? 0.4 : 0) + (hasDescription ? 0.4 : 0) + (hasTags ? 0.2 : 0);
    
    return {
      passed: score >= 0.6,
      message: score < 0.6 ? 'Insufficient documentation' : undefined,
      fixHint: 'Add summary, description, and tags',
      confidence: 0.8
    };
  },
  
  effort: 'easy'
};

export const RULE_VERSIONING: Rule = {
  id: 'MAINT-003',
  category: 'maintainability',
  severity: 'minor',
  points: 3,
  description: 'API versioning strategy',
  rationale: 'Enables backward compatibility',
  
  detect: (spec) => [{
    type: 'security',
    location: '$.info.version',
    identifier: 'API Version'
  }],
  
  validate: (target, spec) => {
    const version = spec.info?.version;
    const hasVersion = version && version.match(/^\d+\.\d+\.\d+$/);
    
    return {
      passed: !!hasVersion,
      message: !hasVersion ? 'Invalid semantic version' : undefined,
      fixHint: 'Use semantic versioning (e.g., 1.0.0)',
      confidence: 0.95
    };
  },
  
  effort: 'trivial',
  autoFixable: true
};

export const RULE_EXAMPLES: Rule = {
  id: 'MAINT-004',
  category: 'maintainability',
  severity: 'minor',
  points: 2,
  description: 'Request/response examples',
  rationale: 'Helps developers understand usage',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of ['post', 'put']) {
        if (pathItem[method as keyof typeof pathItem]) {
          targets.push({
            type: 'operation',
            location: `$.paths['${path}'].${method}`,
            identifier: `${method.toUpperCase()} ${path}`,
            method,
            path
          });
        }
      }
    }
    return targets.slice(0, 5); // Check first 5
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    const requestBody = operation?.requestBody;
    
    const hasExample = requestBody?.content?.['application/json']?.example ||
                      requestBody?.content?.['application/json']?.examples;
    
    return {
      passed: hasExample,
      message: hasExample ? undefined : 'Missing request examples',
      fixHint: 'Add example or examples to request body',
      confidence: 0.7
    };
  },
  
  effort: 'easy'
};

// ============================================================================
// EXCELLENCE RULES - 10 points total (bonus points)
// ============================================================================

export const RULE_COMPREHENSIVE_EXAMPLES: Rule = {
  id: 'EXCEL-001',
  category: 'excellence',
  severity: 'minor',
  points: 3,
  description: 'Comprehensive examples for all operations',
  rationale: 'Excellent developer experience',
  
  detect: (spec) => {
    const targets: Target[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of Object.keys(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          targets.push({
            type: 'operation',
            location: `$.paths['${path}'].${method}`,
            identifier: `${method.toUpperCase()} ${path}`,
            method,
            path
          });
        }
      }
    }
    return targets;
  },
  
  validate: (target, spec) => {
    const operation = getByPath(spec, target.location);
    
    // Check for examples in request and responses
    const requestExample = operation?.requestBody?.content?.['application/json']?.example;
    const responseExample = operation?.responses?.['200']?.content?.['application/json']?.example ||
                          operation?.responses?.['201']?.content?.['application/json']?.example;
    
    return {
      passed: !!(requestExample || responseExample),
      message: 'No examples provided',
      fixHint: 'Add comprehensive examples',
      confidence: 0.6
    };
  },
  
  effort: 'easy'
};

export const RULE_PERFORMANCE_HINTS: Rule = {
  id: 'EXCEL-002',
  category: 'excellence',
  severity: 'minor',
  points: 3,
  description: 'Performance hints and SLAs',
  rationale: 'Sets clear performance expectations',
  
  detect: (spec) => [{
    type: 'security',
    location: '$.info',
    identifier: 'API Info'
  }],
  
  validate: (target, spec) => {
    const description = spec.info?.description || '';
    const hasPerfInfo = description.includes('performance') || 
                       description.includes('SLA') ||
                       description.includes('response time');
    
    return {
      passed: hasPerfInfo,
      message: 'No performance information provided',
      fixHint: 'Document SLAs and performance expectations',
      confidence: 0.5
    };
  },
  
  effort: 'easy'
};

export const RULE_ADVANCED_PATTERNS: Rule = {
  id: 'EXCEL-003',
  category: 'excellence',
  severity: 'minor',
  points: 2,
  description: 'Advanced API patterns',
  rationale: 'Modern API best practices',
  
  detect: (spec) => [{
    type: 'security',
    location: '$',
    identifier: 'API Specification'
  }],
  
  validate: (target, spec) => {
    // Check for advanced patterns
    const hasWebhooks = !!spec.webhooks;
    const hasCallbacks = Object.values(spec.paths || {}).some((p: any) => 
      Object.values(p).some((op: any) => op.callbacks)
    );
    const hasLinks = Object.values(spec.paths || {}).some((p: any) =>
      Object.values(p).some((op: any) => 
        op.responses && Object.values(op.responses).some((r: any) => r.links)
      )
    );
    
    return {
      passed: hasWebhooks || hasCallbacks || hasLinks,
      message: 'No advanced patterns used',
      fixHint: 'Consider webhooks, callbacks, or links',
      confidence: 0.4
    };
  },
  
  effort: 'hard'
};

export const RULE_BACKWARD_COMPATIBILITY: Rule = {
  id: 'EXCEL-004',
  category: 'excellence',
  severity: 'minor',
  points: 2,
  description: 'Backward compatibility strategy',
  rationale: 'Smooth version transitions',
  
  detect: (spec) => [{
    type: 'security',
    location: '$.info',
    identifier: 'API Info'
  }],
  
  validate: (target, spec) => {
    const description = spec.info?.description || '';
    const hasDeprecation = Object.values(spec.paths || {}).some((p: any) =>
      Object.values(p).some((op: any) => op.deprecated === true)
    );
    
    return {
      passed: hasDeprecation || description.includes('deprecat'),
      message: 'No deprecation strategy documented',
      fixHint: 'Document deprecation and migration paths',
      confidence: 0.5
    };
  },
  
  effort: 'medium'
};

// ============================================================================
// RULE REGISTRY
// ============================================================================

export const RULE_REGISTRY: { [key: string]: Rule } = {
  // Prerequisites
  'PREREQ-001': RULE_OPENAPI_VERSION,
  'PREREQ-002': RULE_AUTH_DEFINED,
  'PREREQ-003': RULE_MULTI_TENANT_WRITE,
  
  // Functionality
  'FUNC-001': RULE_CRUD_OPERATIONS,
  'FUNC-002': RULE_ERROR_RESPONSES,
  'FUNC-003': RULE_RESPONSE_ENVELOPE,
  'FUNC-004': RULE_STATUS_CODES,
  
  // Security
  'SEC-001': RULE_MULTI_TENANT_READ,
  'SEC-002': RULE_BRANCH_HEADERS,
  'SEC-003': RULE_AUTHORIZATION,
  'SEC-004': RULE_INPUT_VALIDATION,
  
  // Scalability
  'SCALE-001': RULE_PAGINATION,
  'SCALE-002': RULE_CACHING_HEADERS,
  'SCALE-003': RULE_ASYNC_PATTERNS,
  'SCALE-004': RULE_RATE_LIMITING,
  
  // Maintainability
  'MAINT-001': RULE_NAMING_CONSISTENCY,
  'MAINT-002': RULE_DOCUMENTATION,
  'MAINT-003': RULE_VERSIONING,
  'MAINT-004': RULE_EXAMPLES,
  
  // Excellence
  'EXCEL-001': RULE_COMPREHENSIVE_EXAMPLES,
  'EXCEL-002': RULE_PERFORMANCE_HINTS,
  'EXCEL-003': RULE_ADVANCED_PATTERNS,
  'EXCEL-004': RULE_BACKWARD_COMPATIBILITY,
};

// Export helper to get rules by category
export function getRulesByCategory(category: string): Rule[] {
  return Object.values(RULE_REGISTRY).filter(r => r.category === category);
}

// Export helper to get rules by severity
export function getRulesBySeverity(severity: string): Rule[] {
  return Object.values(RULE_REGISTRY).filter(r => r.severity === severity);
}