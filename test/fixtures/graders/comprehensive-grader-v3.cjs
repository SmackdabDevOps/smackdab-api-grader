#!/usr/bin/env node

/**
 * Smackdab API Contract Grader v3.0 - Production Ready
 * Based on MASTER_API_TEMPLATE_v3.yaml standards
 * 
 * This version implements ALL validation checks with:
 * - Complete parameter inheritance resolution
 * - $ref resolution for headers and responses
 * - Operation-level error response validation
 * - Path structure enforcement
 * - API ID extraction for tracking
 * - Severity levels and JSON paths for agent ergonomics
 */

const fs = require('fs');
const yaml = require('js-yaml');
const crypto = require('crypto');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Resolve a $ref to its actual value in the spec
 */
function resolveRef(spec, ref) {
  if (!ref || !ref.startsWith('#/')) return null;
  
  const path = ref.substring(2).split('/');
  let current = spec;
  
  for (const segment of path) {
    if (!current || typeof current !== 'object') return null;
    current = current[segment];
  }
  
  return current;
}

/**
 * Extract stable API ID from spec
 */
function getApiId(spec) {
  // Prefer explicit x-api-id
  if (spec['x-api-id']) {
    return spec['x-api-id'];
  }
  
  // Fall back to hash of title@version
  const title = spec.info?.title || 'unknown';
  const version = spec.info?.version || '0.0.0';
  return crypto.createHash('sha256').update(`${title}@${version}`).digest('hex').substring(0, 12);
}

/**
 * Resolve effective parameters for an operation (handles inheritance)
 * Path-level parameters are inherited by operations unless overridden
 */
function resolveEffectiveParams(pathItem, operation) {
  const pathParams = pathItem.parameters || [];
  const opParams = operation?.parameters || [];
  
  // Build a map of operation params by name for override detection
  const opParamMap = new Map();
  opParams.forEach(p => {
    if (p.$ref) {
      // Extract parameter name from $ref
      const refName = p.$ref.split('/').pop();
      opParamMap.set(refName, p);
    } else if (p.name) {
      opParamMap.set(p.name, p);
    }
  });
  
  // Start with path-level params, then add/override with op params
  const effectiveParams = [];
  
  pathParams.forEach(p => {
    if (p.$ref) {
      const refName = p.$ref.split('/').pop();
      if (!opParamMap.has(refName)) {
        effectiveParams.push(p);
      }
    } else if (p.name && !opParamMap.has(p.name)) {
      effectiveParams.push(p);
    }
  });
  
  // Add all operation params
  effectiveParams.push(...opParams);
  
  return effectiveParams;
}

/**
 * Check if operation has a specific parameter (by $ref or name)
 */
function hasParameter(pathItem, operation, paramNameOrRef) {
  const params = resolveEffectiveParams(pathItem, operation);
  return params.some(p => {
    if (p.$ref) {
      return p.$ref === paramNameOrRef || p.$ref.endsWith('/' + paramNameOrRef);
    }
    return p.name === paramNameOrRef;
  });
}

/**
 * Check if response has problem+json content type
 */
function hasProblemJson(response, spec) {
  if (!response) return false;
  
  // If it's a $ref, resolve it first
  if (response.$ref) {
    response = resolveRef(spec, response.$ref);
    if (!response) return false;
  }
  
  return response.content?.['application/problem+json'] !== undefined;
}

/**
 * Check if response has specific header (handles $ref)
 */
function hasResponseHeader(response, headerName, spec) {
  if (!response) return false;
  
  // If it's a $ref, resolve it first
  if (response.$ref) {
    response = resolveRef(spec, response.$ref);
    if (!response) return false;
  }
  
  if (!response.headers) return false;
  
  // Check for direct header or $ref
  const header = response.headers[headerName];
  if (!header) return false;
  
  // If header is a $ref, that's fine - it exists
  if (header.$ref) return true;
  
  // Otherwise check if it has content
  return header.schema !== undefined || header.description !== undefined;
}

/**
 * Extract all placeholders from the spec
 */
function findAllPlaceholders(spec) {
  const jsonStr = JSON.stringify(spec);
  const placeholderPattern = /\{([^}]+)\}/g;
  const matches = new Set();
  let match;
  while ((match = placeholderPattern.exec(jsonStr)) !== null) {
    // Common template placeholders to check
    const placeholder = match[1];
    // Expand the whitelist to include more path params
    if (['domain', 'Domain', 'Resource', 'resource', 'Resources', 'resources', 
         'id', 'job_id', 'key', 'organization_id', 'branch_id', 'product_id',
         'user_id', 'order_id', 'item_id'].includes(placeholder)) {
      continue; // These are allowed path parameters
    }
    // Flag anything else that looks like a template placeholder
    if (placeholder.includes('API') || placeholder.includes('Name') || 
        placeholder.includes('Function') || placeholder.includes('TODO')) {
      matches.add(`{${placeholder}}`);
    }
  }
  return Array.from(matches);
}

/**
 * Check for forbidden technology mentions anywhere in the spec
 */
function findForbiddenTech(spec) {
  const jsonStr = JSON.stringify(spec).toLowerCase();
  const forbidden = [];
  
  if (jsonStr.includes('kafka')) forbidden.push('Kafka');
  if (jsonStr.includes('rabbitmq')) forbidden.push('RabbitMQ');
  if (jsonStr.includes('elasticsearch') || jsonStr.includes('elastic search')) forbidden.push('Elasticsearch');
  if (jsonStr.includes('redis') && !jsonStr.includes('redis-compatible')) {
    // Allow mentions of Redis-compatible but not direct Redis
    if (!jsonStr.includes('dragonfly') && !jsonStr.includes('valkey')) {
      forbidden.push('Redis (use Dragonfly/Valkey instead)');
    }
  }
  if (jsonStr.includes('saga pattern') || jsonStr.includes('saga-pattern')) forbidden.push('Saga Pattern');
  if (jsonStr.includes('materialized view')) forbidden.push('Materialized Views');
  if (jsonStr.includes('foreign key') && jsonStr.includes('distributed')) {
    forbidden.push('Foreign Keys across distributed tables');
  }
  
  return forbidden;
}

// ============================================================================
// CHECKPOINT DEFINITIONS WITH DETAILED VALIDATION LOGIC
// ============================================================================

const CHECKPOINTS = [
  // ========== OPENAPI STRUCTURE (5 points) ==========
  {
    id: 'OAS-VERSION',
    category: 'openapi',
    description: 'OpenAPI version must be 3.0.3',
    weight: 1,
    autoFail: true,
    check: (spec) => {
      return spec.openapi === '3.0.3' ? 
        { passed: true } : 
        { passed: false, message: `OpenAPI version is ${spec.openapi}, must be 3.0.3` };
    }
  },
  {
    id: 'OAS-OPERATIONIDS',
    category: 'openapi',
    description: 'All operationIds globally unique',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const operationIds = new Set();
      const duplicates = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].forEach(method => {
            if (pathItem[method] && pathItem[method].operationId) {
              const opId = pathItem[method].operationId;
              if (operationIds.has(opId)) {
                duplicates.push(opId);
              }
              operationIds.add(opId);
            }
          });
        });
      }
      
      return duplicates.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Duplicate operationIds found: ${duplicates.join(', ')}` };
    }
  },
  {
    id: 'OAS-NO-PLACEHOLDERS',
    category: 'openapi',
    description: 'No unresolved template placeholders',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const placeholders = findAllPlaceholders(spec);
      
      // Also check info.title for placeholders
      if (spec.info?.title?.includes('{')) {
        const titlePlaceholders = spec.info.title.match(/\{[^}]+\}/g) || [];
        placeholders.push(...titlePlaceholders);
      }
      
      return placeholders.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Found unresolved placeholders: ${placeholders.join(', ')}` };
    }
  },
  {
    id: 'OAS-INFO-COMPLETE',
    category: 'openapi',
    description: 'Info section complete with all required fields',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (!spec.info) return { passed: false, message: 'Missing info section' };
      
      const required = ['title', 'version', 'description', 'contact', 'license'];
      const missing = required.filter(field => !spec.info[field]);
      
      if (missing.length > 0) {
        return { passed: false, message: `Missing info fields: ${missing.join(', ')}` };
      }
      
      // Check contact details
      if (!spec.info.contact.email || !spec.info.contact.name) {
        return { passed: false, message: 'Contact must have name and email' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'OAS-X-WEBHOOKS',
    category: 'openapi',
    description: 'Uses x-webhooks not webhooks for 3.0.3',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (spec.webhooks) {
        return { passed: false, message: 'Must use x-webhooks instead of webhooks for OpenAPI 3.0.3' };
      }
      return { passed: true };
    }
  },

  // ========== SERVERS (2 points) ==========
  {
    id: 'SERVERS-REQUIRED',
    category: 'servers',
    description: 'Required servers (prod, staging, dev)',
    weight: 2,
    autoFail: false,
    check: (spec) => {
      if (!spec.servers || spec.servers.length < 3) {
        return { passed: false, message: 'Must define 3 servers: production, staging, development' };
      }
      
      const urls = spec.servers.map(s => s.url);
      const hasProduction = urls.some(url => url.includes('api.smackdab.com') && !url.includes('staging'));
      const hasStaging = urls.some(url => url.includes('staging'));
      const hasDevelopment = urls.some(url => url.includes('localhost'));
      
      if (!hasProduction || !hasStaging || !hasDevelopment) {
        return { passed: false, message: 'Must include production, staging, and localhost servers' };
      }
      
      // Check for trailing slashes and descriptions
      const warnings = [];
      spec.servers.forEach((server, i) => {
        if (!server.description) {
          warnings.push(`Server ${i+1} missing description`);
        }
        if (server.url.endsWith('/')) {
          warnings.push(`Server ${i+1} has trailing slash`);
        }
      });
      
      if (warnings.length > 0) {
        return { passed: true, message: warnings.join('; ') };
      }
      
      return { passed: true };
    }
  },

  // ========== TAGS (1 point) ==========
  {
    id: 'TAGS-LOGICAL-GROUPS',
    category: 'tags',
    description: 'Required tag groups defined',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (!spec.tags || spec.tags.length === 0) {
        return { passed: false, message: 'Tags must be defined' };
      }
      
      const tagNames = spec.tags.map(t => t.name.toLowerCase());
      const warnings = [];
      
      // Check for expected tag patterns (not all are required but warn if missing)
      if (!tagNames.some(t => t.includes('bulk'))) {
        warnings.push('Consider adding "Bulk Operations" tag');
      }
      if (!tagNames.some(t => t.includes('admin'))) {
        warnings.push('Consider adding "Admin" tag');
      }
      if (!tagNames.some(t => t.includes('job'))) {
        warnings.push('Consider adding "Jobs" tag for async operations');
      }
      
      return warnings.length > 0 ? 
        { passed: true, message: warnings.join('; ') } : 
        { passed: true };
    }
  },

  // ========== SECURITY (7 points) ==========
  {
    id: 'SEC-TOP-LEVEL-DEFAULT',
    category: 'security',
    description: 'Top-level security with OAuth2 and Bearer defaults',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (!spec.security || spec.security.length === 0) {
        return { passed: false, message: 'Top-level security must be defined' };
      }
      
      const hasOAuth2 = spec.security.some(s => s.OAuth2 !== undefined);
      const hasBearer = spec.security.some(s => s.BearerAuth !== undefined);
      
      if (!hasOAuth2 || !hasBearer) {
        return { passed: false, message: 'Top-level security must include OAuth2: [] and BearerAuth: []' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'SEC-OAUTH2-SCOPES',
    category: 'security',
    description: 'Concrete OAuth2 scopes (no placeholders)',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (!spec.components?.securitySchemes?.OAuth2) {
        return { passed: false, message: 'OAuth2 security scheme not defined' };
      }
      
      const oauth = spec.components.securitySchemes.OAuth2;
      if (!oauth.flows?.authorizationCode?.scopes) {
        return { passed: false, message: 'OAuth2 authorization code flow with scopes not defined' };
      }
      
      const scopes = Object.keys(oauth.flows.authorizationCode.scopes);
      
      // Check for placeholder scopes
      const hasPlaceholder = scopes.some(s => s.includes('{domain}') || s.includes('{Domain}'));
      if (hasPlaceholder) {
        return { passed: false, message: 'OAuth2 scopes contain unresolved {domain} placeholders' };
      }
      
      // Check for required scope patterns
      const hasReadWrite = scopes.some(s => s.startsWith('read:')) && 
                           scopes.some(s => s.startsWith('write:'));
      
      return hasReadWrite ? 
        { passed: true } : 
        { passed: false, message: 'OAuth2 must have concrete read: and write: scopes' };
    }
  },
  {
    id: 'SEC-PER-OP-SECURITY',
    category: 'security',
    description: 'GET has read scope, POST/PATCH/DELETE have write scope',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      const warnings = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          // Check GET operations
          if (pathItem.get) {
            if (!pathItem.get.security) {
              // Inherits top-level security, that's OK
              warnings.push(`GET ${path} inherits top-level security (consider explicit scopes)`);
            } else if (pathItem.get.security.some(sec => sec.OAuth2)) {
              const hasReadScope = pathItem.get.security.some(sec => 
                sec.OAuth2 && sec.OAuth2.some(scope => scope.startsWith('read:'))
              );
              if (!hasReadScope) {
                errors.push(`GET ${path} missing read: scope`);
              }
            }
          }
          
          // Check write operations
          ['post', 'patch', 'put', 'delete'].forEach(method => {
            if (pathItem[method]) {
              if (!pathItem[method].security) {
                // Mutations should have explicit security
                warnings.push(`${method.toUpperCase()} ${path} should have explicit security scopes`);
              } else if (pathItem[method].security.some(sec => sec.OAuth2)) {
                const hasWriteScope = pathItem[method].security.some(sec => 
                  sec.OAuth2 && sec.OAuth2.some(scope => 
                    scope.startsWith('write:') || scope.startsWith('delete:') || scope.startsWith('admin:'))
                );
                if (!hasWriteScope) {
                  errors.push(`${method.toUpperCase()} ${path} missing write:/delete:/admin: scope`);
                }
              }
            }
          });
        });
      }
      
      if (errors.length > 0) {
        return { passed: false, message: errors.slice(0, 5).join('; ') };
      }
      
      return warnings.length > 0 ? 
        { passed: true, message: warnings.slice(0, 3).join('; ') } : 
        { passed: true };
    }
  },
  {
    id: 'SEC-BEARER-JWT',
    category: 'security',
    description: 'Bearer JWT auth method supported',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const bearer = spec.components?.securitySchemes?.BearerAuth;
      if (!bearer) {
        return { passed: false, message: 'BearerAuth security scheme not defined' };
      }
      
      if (bearer.type !== 'http' || bearer.scheme !== 'bearer') {
        return { passed: false, message: 'BearerAuth must be type:http, scheme:bearer' };
      }
      
      if (bearer.bearerFormat !== 'JWT') {
        return { passed: false, message: 'BearerAuth must specify bearerFormat: JWT' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'SEC-APIKEY-RESTRICT',
    category: 'security',
    description: 'ApiKey used ONLY for webhooks/service-to-service',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (!spec.components?.securitySchemes?.ApiKeyAuth) {
        return { passed: true }; // OK if not defined
      }
      
      // Check that ApiKeyAuth is not used in regular operations
      const errors = [];
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
            if (pathItem[method]?.security) {
              const usesApiKey = pathItem[method].security.some(sec => sec.ApiKeyAuth);
              if (usesApiKey && !path.includes('webhook')) {
                errors.push(`${method.toUpperCase()} ${path} should not use ApiKeyAuth`);
              }
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: 'ApiKeyAuth should only be used for webhooks' };
    }
  },
  {
    id: 'SEC-WWW-AUTH',
    category: 'security',
    description: 'WWW-Authenticate on 401 responses',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const unauthorized = spec.components?.responses?.Unauthorized;
      if (!unauthorized) {
        return { passed: false, message: 'Unauthorized response not defined in components' };
      }
      
      if (!unauthorized.headers?.['WWW-Authenticate']) {
        return { passed: false, message: '401 response missing WWW-Authenticate header' };
      }
      
      // Check that 401 responses in operations use proper auth header
      const errors = [];
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
            if (pathItem[method]?.responses?.['401']) {
              const response = pathItem[method].responses['401'];
              // Check if it has WWW-Authenticate either directly or via $ref
              if (!response.$ref && !hasResponseHeader(response, 'WWW-Authenticate', spec)) {
                errors.push(`${method.toUpperCase()} ${path}`);
              }
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `401 responses missing WWW-Authenticate: ${errors.slice(0, 3).join(', ')}` };
    }
  },

  // ========== MULTI-TENANCY (6 points) ==========
  {
    id: 'MT-ORG-HDR',
    category: 'tenancy',
    description: 'X-Organization-ID on ALL operations',
    weight: 1,
    autoFail: true,
    check: (spec) => {
      const errors = [];
      
      // Check if OrganizationHeader parameter is defined
      if (!spec.components?.parameters?.OrganizationHeader) {
        return { passed: false, message: 'OrganizationHeader parameter not defined in components' };
      }
      
      // Check all operations have the header
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
            if (pathItem[method]) {
              if (!hasParameter(pathItem, pathItem[method], 'OrganizationHeader') &&
                  !hasParameter(pathItem, pathItem[method], 'X-Organization-ID')) {
                errors.push(`${method.toUpperCase()} ${path}`);
              }
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Missing X-Organization-ID on: ${errors.slice(0, 5).join(', ')}` };
    }
  },
  {
    id: 'MT-BRANCH-ALL-OPS',
    category: 'tenancy',
    description: 'X-Branch-ID on ALL operations',
    weight: 1,
    autoFail: true,
    check: (spec) => {
      const errors = [];
      
      // Check if BranchHeader parameter is defined
      if (!spec.components?.parameters?.BranchHeader) {
        return { passed: false, message: 'BranchHeader parameter not defined in components' };
      }
      
      // Check all operations have the header
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
            if (pathItem[method]) {
              if (!hasParameter(pathItem, pathItem[method], 'BranchHeader') &&
                  !hasParameter(pathItem, pathItem[method], 'X-Branch-ID')) {
                errors.push(`${method.toUpperCase()} ${path}`);
              }
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Missing X-Branch-ID on: ${errors.slice(0, 5).join(', ')}` };
    }
  },
  {
    id: 'MT-BIGINT-UUID',
    category: 'tenancy',
    description: 'BIGINT/UUID dual format support',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const orgHeader = spec.components?.parameters?.OrganizationHeader;
      const branchHeader = spec.components?.parameters?.BranchHeader;
      
      if (!orgHeader) return { passed: false, message: 'OrganizationHeader not defined' };
      
      // Check for oneOf with both integer and UUID formats
      const checkDualFormat = (header, name) => {
        const hasOneOf = header.schema?.oneOf;
        if (!hasOneOf || hasOneOf.length < 2) {
          return `${name} must support both BIGINT and UUID with oneOf`;
        }
        
        const hasInt = hasOneOf.some(s => s.type === 'integer' || (s.type === 'string' && s.pattern));
        const hasUuid = hasOneOf.some(s => s.format === 'uuid');
        
        if (!hasInt || !hasUuid) {
          return `${name} must support both BIGINT and UUID formats`;
        }
        return null;
      };
      
      const orgError = checkDualFormat(orgHeader, 'OrganizationHeader');
      if (orgError) return { passed: false, message: orgError };
      
      if (branchHeader) {
        const branchError = checkDualFormat(branchHeader, 'BranchHeader');
        if (branchError) return { passed: false, message: branchError };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'MT-REQUEST-ID',
    category: 'tenancy',
    description: 'X-Request-ID in parameters and response headers',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const hasParam = spec.components?.parameters?.RequestId;
      const hasHeader = spec.components?.headers?.XRequestId;
      
      if (!hasParam) {
        return { passed: false, message: 'RequestId parameter not defined' };
      }
      if (!hasHeader) {
        return { passed: false, message: 'XRequestId response header not defined' };
      }
      
      // Check usage in responses (with $ref resolution)
      const errors = [];
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
            if (pathItem[method]?.responses) {
              ['200', '201', '202', '204', '303'].forEach(status => {
                if (pathItem[method].responses[status]) {
                  if (!hasResponseHeader(pathItem[method].responses[status], 'X-Request-ID', spec)) {
                    errors.push(`${method.toUpperCase()} ${path} ${status}`);
                  }
                }
              });
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `X-Request-ID missing on responses: ${errors.slice(0, 3).join('; ')}` };
    }
  },
  {
    id: 'MT-W3C-TRACE',
    category: 'tenancy',
    description: 'W3C trace headers supported',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const hasTraceParent = spec.components?.parameters?.TraceParent;
      const hasTraceState = spec.components?.parameters?.TraceState;
      const hasBaggage = spec.components?.parameters?.Baggage;
      
      const missing = [];
      if (!hasTraceParent) missing.push('TraceParent');
      if (!hasTraceState) missing.push('TraceState');
      if (!hasBaggage) missing.push('Baggage');
      
      return missing.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `W3C trace parameters missing: ${missing.join(', ')}` };
    }
  },
  {
    id: 'MT-CONSISTENCY',
    category: 'tenancy',
    description: 'X-Consistency parameter defined and used on GET operations',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const hasConsistency = spec.components?.parameters?.Consistency;
      if (!hasConsistency) {
        return { passed: false, message: 'Consistency parameter not defined' };
      }
      
      // Check it has the right enum values
      const enumValues = hasConsistency.schema?.enum;
      if (!enumValues || !enumValues.includes('eventual') || !enumValues.includes('strong')) {
        return { passed: false, message: 'Consistency must have enum: [best_effort, eventual, strong]' };
      }
      
      // Check usage on GET operations
      const errors = [];
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          if (pathItem.get) {
            if (!hasParameter(pathItem, pathItem.get, 'Consistency') &&
                !hasParameter(pathItem, pathItem.get, 'X-Consistency')) {
              errors.push(`GET ${path}`);
            }
          }
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `GET operations missing X-Consistency: ${errors.slice(0, 5).join(', ')}` };
    }
  },

  // ========== HTTP SEMANTICS (8 points) ==========
  {
    id: 'HTTP-ERRORS-PROBLEMJSON',
    category: 'http',
    description: 'All 4xx/5xx responses use problem+json',
    weight: 1,
    autoFail: true,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
            if (pathItem[method]?.responses) {
              Object.entries(pathItem[method].responses).forEach(([status, response]) => {
                const statusCode = parseInt(status);
                if (statusCode >= 400 && statusCode < 600) {
                  if (!hasProblemJson(response, spec)) {
                    errors.push(`${method.toUpperCase()} ${path} ${status}`);
                  }
                }
              });
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Error responses not using problem+json: ${errors.slice(0, 5).join(', ')}` };
    }
  },
  {
    id: 'HTTP-STATUS-CODES',
    category: 'http',
    description: 'All required status codes present',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const requiredResponses = [
        'BadRequest', 'Unauthorized', 'Forbidden', 'NotFound', 
        'Conflict', 'UnprocessableEntity', 'TooManyRequests',
        'InternalServerError', 'ServiceUnavailable', 'PreconditionFailed',
        'PreconditionRequired', 'UnsupportedMediaType'
      ];
      
      const missing = requiredResponses.filter(r => !spec.components?.responses?.[r]);
      
      return missing.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Missing response definitions: ${missing.join(', ')}` };
    }
  },
  {
    id: 'HTTP-428-PRECONDITION',
    category: 'http',
    description: '428 on PATCH/DELETE when If-Match required',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['patch', 'delete'].forEach(method => {
            if (pathItem[method]) {
              // Check for 428 response
              if (!pathItem[method].responses?.['428']) {
                errors.push(`${method.toUpperCase()} ${path} missing 428 response`);
              }
              
              // Check for If-Match parameter
              if (!hasParameter(pathItem, pathItem[method], 'IfMatch') &&
                  !hasParameter(pathItem, pathItem[method], 'If-Match')) {
                errors.push(`${method.toUpperCase()} ${path} missing If-Match parameter`);
              }
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: errors.slice(0, 5).join('; ') };
    }
  },
  {
    id: 'HTTP-412-PRECONDITION',
    category: 'http',
    description: '412 Precondition Failed support',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      // Check component definition
      if (!spec.components?.responses?.PreconditionFailed) {
        return { passed: false, message: 'PreconditionFailed (412) response not defined in components' };
      }
      
      // Must use problem+json
      if (!spec.components.responses.PreconditionFailed.content?.['application/problem+json']) {
        return { passed: false, message: '412 response must use application/problem+json' };
      }
      
      // Check usage on PATCH/DELETE
      const errors = [];
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['patch', 'delete'].forEach(method => {
            if (pathItem[method]?.responses && !pathItem[method].responses['412']) {
              errors.push(`${method.toUpperCase()} ${path}`);
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Operations missing 412 response: ${errors.slice(0, 3).join(', ')}` };
    }
  },
  {
    id: 'HTTP-415-MEDIATYPE',
    category: 'http',
    description: '415 on POST/PATCH for content-type validation',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['post', 'patch'].forEach(method => {
            if (pathItem[method]?.responses) {
              if (!pathItem[method].responses['415']) {
                errors.push(`${method.toUpperCase()} ${path}`);
              }
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Operations missing 415 response: ${errors.slice(0, 5).join(', ')}` };
    }
  },
  {
    id: 'HTTP-503-SERVICE',
    category: 'http',
    description: '503 on GET for service unavailability',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          if (pathItem.get?.responses && !pathItem.get.responses['503']) {
            errors.push(`GET ${path}`);
          }
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `GET operations missing 503 response: ${errors.slice(0, 5).join(', ')}` };
    }
  },
  {
    id: 'HTTP-409-VS-422',
    category: 'http',
    description: '409 vs 422 properly distinguished',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const conflict = spec.components?.responses?.Conflict;
      const unprocessable = spec.components?.responses?.UnprocessableEntity;
      
      if (!conflict || !unprocessable) {
        return { passed: false, message: 'Both 409 Conflict and 422 Unprocessable Entity must be defined' };
      }
      
      // Check descriptions are different and meaningful
      if (conflict.description === unprocessable.description) {
        return { passed: false, message: '409 and 422 must have distinct descriptions' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'HTTP-DELETE-204',
    category: 'http',
    description: 'DELETE returns 204 with rate-limit headers',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          if (pathItem.delete?.responses?.['204']) {
            const response = pathItem.delete.responses['204'];
            if (!hasResponseHeader(response, 'X-RateLimit-Limit', spec) || 
                !hasResponseHeader(response, 'X-RateLimit-Remaining', spec) ||
                !hasResponseHeader(response, 'X-RateLimit-Reset', spec)) {
              errors.push(path);
            }
          }
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `DELETE 204 missing rate-limit headers: ${errors.join(', ')}` };
    }
  },

  // ========== RATE LIMITING (2 points) ==========
  {
    id: 'RATE-LIMIT-HEADERS',
    category: 'ratelimit',
    description: 'Rate-limit header trio defined',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      // Check headers are defined
      const requiredHeaders = ['XRateLimitLimit', 'XRateLimitRemaining', 'XRateLimitReset'];
      const missing = requiredHeaders.filter(h => !spec.components?.headers?.[h]);
      
      if (missing.length > 0) {
        return { passed: false, message: `Missing rate limit headers: ${missing.join(', ')}` };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'RATE-LIMIT-TRIO-ENFORCED',
    category: 'ratelimit',
    description: 'Rate-limit trio on 200,201,202,204,206 responses',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['get', 'post', 'patch', 'put', 'delete'].forEach(method => {
            if (pathItem[method]?.responses) {
              ['200', '201', '202', '204', '206'].forEach(status => {
                if (pathItem[method].responses[status]) {
                  const response = pathItem[method].responses[status];
                  if (!hasResponseHeader(response, 'X-RateLimit-Limit', spec) || 
                      !hasResponseHeader(response, 'X-RateLimit-Remaining', spec) ||
                      !hasResponseHeader(response, 'X-RateLimit-Reset', spec)) {
                    errors.push(`${method.toUpperCase()} ${path} ${status}`);
                  }
                }
              });
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Rate limit trio missing on: ${errors.slice(0, 5).join(', ')}` };
    }
  },

  // ========== CACHING (5 points) ==========
  {
    id: 'CACHE-ETAG',
    category: 'caching',
    description: 'ETag on GET 200 responses',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          if (pathItem.get?.responses?.['200']) {
            if (!hasResponseHeader(pathItem.get.responses['200'], 'ETag', spec)) {
              errors.push(path);
            }
          }
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `GET endpoints missing ETag: ${errors.join(', ')}` };
    }
  },
  {
    id: 'CACHE-ETAG-CACHEABLE',
    category: 'caching',
    description: 'ETag on cacheable responses (201, PATCH 200)',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const warnings = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          // Check POST 201
          if (pathItem.post?.responses?.['201']) {
            if (!hasResponseHeader(pathItem.post.responses['201'], 'ETag', spec)) {
              warnings.push(`POST ${path} 201`);
            }
          }
          
          // Check PATCH 200
          if (pathItem.patch?.responses?.['200']) {
            if (!hasResponseHeader(pathItem.patch.responses['200'], 'ETag', spec)) {
              warnings.push(`PATCH ${path} 200`);
            }
          }
        });
      }
      
      return warnings.length === 0 ? 
        { passed: true } : 
        { passed: true, message: `Consider ETag on cacheable responses: ${warnings.slice(0, 3).join(', ')}` };
    }
  },
  {
    id: 'CACHE-IF-MATCH',
    category: 'caching',
    description: 'If-Match/If-None-Match parameters defined',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const hasIfMatch = spec.components?.parameters?.IfMatch;
      const hasIfNoneMatch = spec.components?.parameters?.IfNoneMatch;
      
      return hasIfMatch && hasIfNoneMatch ? 
        { passed: true } : 
        { passed: false, message: 'IfMatch and IfNoneMatch parameters must be defined' };
    }
  },
  {
    id: 'CACHE-304',
    category: 'caching',
    description: '304 Not Modified support on GET',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          if (pathItem.get?.responses && !pathItem.get.responses['304']) {
            errors.push(path);
          }
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `GET endpoints missing 304 response: ${errors.join(', ')}` };
    }
  },
  {
    id: 'CACHE-VARY-HEADERS',
    category: 'caching',
    description: 'Vary and Cache-Control headers on GET 200 with proper contents',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (!spec.components?.headers?.Vary) {
        return { passed: false, message: 'Vary header not defined in components' };
      }
      
      if (!spec.components?.headers?.CacheControl) {
        return { passed: false, message: 'CacheControl header not defined in components' };
      }
      
      // Check Vary header has correct contents
      const varyHeader = spec.components.headers.Vary;
      const expectedVaryHeaders = ['Accept', 'Accept-Language', 'Accept-Encoding', 'Authorization', 'X-Organization-ID', 'X-Branch-ID'];
      const varyDefault = varyHeader.schema?.default || varyHeader.example || '';
      const missingVary = expectedVaryHeaders.filter(h => !varyDefault.includes(h));
      
      if (missingVary.length > 0) {
        return { passed: false, message: `Vary header missing: ${missingVary.join(', ')}` };
      }
      
      // Check usage on GET 200
      const errors = [];
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          if (pathItem.get?.responses?.['200']) {
            const response = pathItem.get.responses['200'];
            if (!hasResponseHeader(response, 'Vary', spec)) errors.push(`GET ${path} missing Vary`);
            if (!hasResponseHeader(response, 'Cache-Control', spec)) errors.push(`GET ${path} missing Cache-Control`);
          }
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: errors.slice(0, 5).join('; ') };
    }
  },

  // ========== RESPONSE ENVELOPE (5 points) ==========
  {
    id: 'ENV-RESPONSE-WRAPPER',
    category: 'envelope',
    description: 'ResponseEnvelope with success, data, meta, _links',
    weight: 1,
    autoFail: true,
    check: (spec) => {
      const envelope = spec.components?.schemas?.ResponseEnvelope;
      if (!envelope) {
        return { passed: false, message: 'ResponseEnvelope schema not defined' };
      }
      
      const required = envelope.required || [];
      const props = envelope.properties || {};
      
      const hasAllFields = ['success', 'data', '_links'].every(f => required.includes(f)) &&
                           ['success', 'data', 'meta', '_links'].every(f => props[f]);
      
      return hasAllFields ? 
        { passed: true } : 
        { passed: false, message: 'ResponseEnvelope must have success, data, meta, _links' };
    }
  },
  {
    id: 'ENV-META-REF',
    category: 'envelope',
    description: 'ResponseMeta uses $ref not inline',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const meta = spec.components?.schemas?.ResponseMeta;
      if (!meta) {
        return { passed: false, message: 'ResponseMeta schema not defined' };
      }
      
      const envelope = spec.components?.schemas?.ResponseEnvelope;
      if (envelope?.properties?.meta?.$ref !== '#/components/schemas/ResponseMeta') {
        return { passed: false, message: 'ResponseEnvelope.meta must use $ref to ResponseMeta' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'ENV-HATEOAS',
    category: 'envelope',
    description: 'HATEOAS links with href and method enum',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const links = spec.components?.schemas?.HATEOASLinks;
      if (!links) {
        return { passed: false, message: 'HATEOASLinks schema not defined' };
      }
      
      // Check structure
      const linkSchema = links.additionalProperties;
      if (!linkSchema?.properties?.href || !linkSchema?.properties?.method) {
        return { passed: false, message: 'HATEOAS links must have href and method properties' };
      }
      
      // Check method enum
      const methodEnum = linkSchema.properties.method.enum;
      const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      if (!methodEnum || !methodEnum.every(m => validMethods.includes(m))) {
        return { passed: false, message: 'HATEOAS method must have enum: [GET, POST, PUT, PATCH, DELETE]' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'ENV-RFC7807',
    category: 'envelope',
    description: 'RFC 7807 ProblemDetail for ALL errors',
    weight: 1,
    autoFail: true,
    check: (spec) => {
      const problem = spec.components?.schemas?.ProblemDetail;
      if (!problem) {
        return { passed: false, message: 'ProblemDetail schema not defined' };
      }
      
      const required = problem.required || [];
      const requiredFields = ['type', 'title', 'status', 'detail', 'instance'];
      const hasAll = requiredFields.every(f => required.includes(f));
      
      if (!hasAll) {
        return { passed: false, message: `ProblemDetail missing required fields: ${requiredFields.filter(f => !required.includes(f)).join(', ')}` };
      }
      
      // Check error responses use problem+json
      const errorResponses = ['BadRequest', 'Unauthorized', 'Forbidden', 'NotFound', 'Conflict', 'UnprocessableEntity'];
      const errors = [];
      
      errorResponses.forEach(resp => {
        const response = spec.components?.responses?.[resp];
        if (response?.content && !response.content['application/problem+json']) {
          errors.push(resp);
        }
      });
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Error responses not using problem+json: ${errors.join(', ')}` };
    }
  },
  {
    id: 'ENV-ALL-2XX',
    category: 'envelope',
    description: 'Envelope on all 2xx responses with bodies',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['get', 'post', 'patch', 'put'].forEach(method => {
            if (pathItem[method]?.responses) {
              ['200', '201', '202'].forEach(status => {
                const response = pathItem[method].responses[status];
                if (response?.content?.['application/json']?.schema) {
                  const schema = response.content['application/json'].schema;
                  if (schema.$ref !== '#/components/schemas/ResponseEnvelope' && 
                      schema.$ref !== '#/components/schemas/AsyncJobStatus' &&
                      !schema.allOf?.some(s => s.$ref === '#/components/schemas/ResponseEnvelope')) {
                    errors.push(`${method.toUpperCase()} ${path} ${status}`);
                  }
                }
              });
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `2xx responses not using envelope: ${errors.slice(0, 5).join(', ')}` };
    }
  },

  // ========== PAGINATION (7 points) ==========
  {
    id: 'PAG-KEYSET',
    category: 'pagination',
    description: 'Key-set pagination (after_key/before_key)',
    weight: 1,
    autoFail: true,
    check: (spec) => {
      // Check for forbidden pagination parameters in components
      const forbiddenParams = ['offset', 'page', 'cursor'];
      const foundForbidden = [];
      
      if (spec.components?.parameters) {
        Object.entries(spec.components.parameters).forEach(([name, param]) => {
          const paramName = param.name?.toLowerCase() || name.toLowerCase();
          if (forbiddenParams.some(f => paramName.includes(f))) {
            foundForbidden.push(name);
          }
        });
      }
      
      if (foundForbidden.length > 0) {
        return { passed: false, message: `Found forbidden pagination params in components: ${foundForbidden.join(', ')}` };
      }
      
      // Check for forbidden params at operation level
      const opLevelForbidden = [];
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          if (pathItem.get && !path.endsWith('}')) {
            const params = resolveEffectiveParams(pathItem, pathItem.get);
            params.forEach(param => {
              const paramName = (param.name || '').toLowerCase();
              if (forbiddenParams.some(f => paramName.includes(f))) {
                opLevelForbidden.push(`GET ${path}: ${param.name}`);
              }
            });
          }
        });
      }
      
      if (opLevelForbidden.length > 0) {
        return { passed: false, message: `Found forbidden pagination params at operation level: ${opLevelForbidden.slice(0, 3).join(', ')}` };
      }
      
      // Check for required key-set parameters
      const hasAfterKey = spec.components?.parameters?.AfterKey;
      const hasBeforeKey = spec.components?.parameters?.BeforeKey;
      
      return hasAfterKey && hasBeforeKey ? 
        { passed: true } : 
        { passed: false, message: 'Must define AfterKey and BeforeKey parameters for key-set pagination' };
    }
  },
  {
    id: 'PAG-OP-LEVEL-PARAMS',
    category: 'pagination',
    description: 'GET list ops have full pagination params',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      const requiredParams = ['AfterKey', 'BeforeKey', 'Limit', 'Sort', 'Filters', 'Fields', 'Include'];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          // Check GET operations on collection paths (not individual resources)
          if (pathItem.get && !path.endsWith('}')) {
            const missing = requiredParams.filter(p => 
              !hasParameter(pathItem, pathItem.get, p)
            );
            if (missing.length > 0) {
              errors.push(`GET ${path} missing: ${missing.join(', ')}`);
            }
          }
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: errors.slice(0, 3).join('; ') };
    }
  },
  {
    id: 'PAG-TIEBREAKER',
    category: 'pagination',
    description: 'Tie-breaker rules documented',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const afterKey = spec.components?.parameters?.AfterKey;
      if (!afterKey?.description) {
        return { passed: false, message: 'AfterKey parameter missing description' };
      }
      
      const hasTieBreaker = afterKey.description.toLowerCase().includes('tie-breaker') ||
                            afterKey.description.toLowerCase().includes('tie breaker') ||
                            afterKey.description.toLowerCase().includes('secondary sort') ||
                            afterKey.description.toLowerCase().includes('unique_id');
      
      return hasTieBreaker ? 
        { passed: true } : 
        { passed: false, message: 'Pagination must document tie-breaker rules' };
    }
  },
  {
    id: 'PAG-FILTER-DEEPOBJECT',
    category: 'pagination',
    description: 'Filter parameter deepObject style',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const filters = spec.components?.parameters?.Filters;
      if (!filters) {
        return { passed: false, message: 'Filters parameter not defined' };
      }
      
      return filters.style === 'deepObject' && filters.explode !== false ? 
        { passed: true } : 
        { passed: false, message: 'Filter parameter must use deepObject style with explode:true' };
    }
  },
  {
    id: 'PAG-FIELDS',
    category: 'pagination',
    description: 'Fields parameter for sparse fieldsets',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const fields = spec.components?.parameters?.Fields;
      if (!fields) {
        return { passed: false, message: 'Fields parameter not defined' };
      }
      
      // Check pattern and style
      if (!fields.schema?.pattern) {
        return { passed: false, message: 'Fields parameter must have regex pattern' };
      }
      
      if (fields.style !== 'form' || fields.explode !== false) {
        return { passed: false, message: 'Fields must use style:form, explode:false (CSV)' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'PAG-INCLUDE',
    category: 'pagination',
    description: 'Include/expand for related resources',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const include = spec.components?.parameters?.Include;
      if (!include) {
        return { passed: false, message: 'Include parameter not defined' };
      }
      
      // Check pattern and style
      if (!include.schema?.pattern) {
        return { passed: false, message: 'Include parameter must have regex pattern' };
      }
      
      if (include.style !== 'form' || include.explode !== false) {
        return { passed: false, message: 'Include must use style:form, explode:false (CSV)' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'PAG-LIMIT-BOUNDS',
    category: 'pagination',
    description: 'Limit parameter has max and default',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const limit = spec.components?.parameters?.Limit;
      if (!limit) {
        return { passed: false, message: 'Limit parameter not defined' };
      }
      
      const schema = limit.schema;
      const warnings = [];
      
      if (!schema?.default) {
        warnings.push('Limit should have a default value');
      }
      if (!schema?.maximum || schema.maximum > 500) {
        warnings.push('Limit should have maximum <= 500');
      }
      
      return warnings.length === 0 ? 
        { passed: true } : 
        { passed: true, message: warnings.join('; ') };
    }
  },

  // ========== ASYNC OPERATIONS (6 points) ==========
  {
    id: 'ASYNC-202-COMPLETE',
    category: 'async',
    description: '202 with Location, Retry-After, and rate-limit trio',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          if (pathItem.post?.responses?.['202']) {
            const response = pathItem.post.responses['202'];
            if (!hasResponseHeader(response, 'Location', spec)) {
              errors.push(`POST ${path} 202 missing Location`);
            }
            if (!hasResponseHeader(response, 'Retry-After', spec)) {
              errors.push(`POST ${path} 202 missing Retry-After`);
            }
            if (!hasResponseHeader(response, 'X-RateLimit-Limit', spec) || 
                !hasResponseHeader(response, 'X-RateLimit-Remaining', spec) ||
                !hasResponseHeader(response, 'X-RateLimit-Reset', spec)) {
              errors.push(`POST ${path} 202 missing rate-limit trio`);
            }
          }
        });
      }
      
      // Check at least one operation supports 202
      const has202 = Object.values(spec.paths || {}).some(pathItem => 
        pathItem.post?.responses?.['202']
      );
      
      if (!has202) {
        return { passed: false, message: 'No operations support 202 Accepted for async processing' };
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: errors.slice(0, 5).join('; ') };
    }
  },
  {
    id: 'ASYNC-JOB-ENDPOINT',
    category: 'async',
    description: 'Job status endpoint /api/v2/{domain}/jobs/{job_id}',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const jobPath = Object.keys(spec.paths || {}).find(path => 
        path.includes('/jobs/') && path.includes('{job_id}')
      );
      
      if (!jobPath) {
        return { passed: false, message: 'Job status endpoint not found (/api/v2/{domain}/jobs/{job_id})' };
      }
      
      // Check it has proper responses
      const jobGet = spec.paths[jobPath]?.get;
      if (!jobGet) {
        return { passed: false, message: 'Job status endpoint missing GET operation' };
      }
      
      if (!jobGet.responses?.['200'] || !jobGet.responses?.['303']) {
        return { passed: false, message: 'Job status endpoint must support 200 and 303 responses' };
      }
      
      // Check 200 returns AsyncJobStatus
      const response200 = jobGet.responses['200'];
      if (response200?.content?.['application/json']?.schema?.$ref !== '#/components/schemas/AsyncJobStatus') {
        return { passed: false, message: 'Job GET 200 must return AsyncJobStatus schema' };
      }
      
      // Check 303 has Location header
      if (!hasResponseHeader(jobGet.responses['303'], 'Location', spec)) {
        return { passed: false, message: 'Job GET 303 must have Location header' };
      }
      
      // Check X-Request-ID on both responses
      const errors = [];
      if (!hasResponseHeader(jobGet.responses['200'], 'X-Request-ID', spec)) {
        errors.push('200 missing X-Request-ID');
      }
      if (!hasResponseHeader(jobGet.responses['303'], 'X-Request-ID', spec)) {
        errors.push('303 missing X-Request-ID');
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Job endpoint issues: ${errors.join(', ')}` };
    }
  },
  {
    id: 'ASYNC-JOB-SCHEMA',
    category: 'async',
    description: 'AsyncJobStatus schema with proper states',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const jobStatus = spec.components?.schemas?.AsyncJobStatus;
      if (!jobStatus) {
        return { passed: false, message: 'AsyncJobStatus schema not defined' };
      }
      
      const statusEnum = jobStatus.properties?.status?.enum;
      const requiredStates = ['queued', 'running', 'succeeded', 'failed'];
      const hasAllStates = requiredStates.every(s => statusEnum?.includes(s));
      
      if (!hasAllStates) {
        return { passed: false, message: 'AsyncJobStatus must have queued, running, succeeded, failed states' };
      }
      
      // Check required fields
      const required = jobStatus.required || [];
      const requiredFields = ['job_id', 'status', 'created_at', 'updated_at'];
      const missingFields = requiredFields.filter(f => !required.includes(f));
      
      if (missingFields.length > 0) {
        return { passed: false, message: `AsyncJobStatus missing required fields: ${missingFields.join(', ')}` };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'ASYNC-IDEMPOTENCY',
    category: 'async',
    description: 'X-Idempotency-Key on POST/PATCH',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const idempotencyKey = spec.components?.parameters?.IdempotencyKey;
      if (!idempotencyKey) {
        return { passed: false, message: 'IdempotencyKey parameter not defined' };
      }
      
      // Check usage on POST/PATCH operations
      const errors = [];
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          ['post', 'patch'].forEach(method => {
            if (pathItem[method]) {
              if (!hasParameter(pathItem, pathItem[method], 'IdempotencyKey') &&
                  !hasParameter(pathItem, pathItem[method], 'X-Idempotency-Key')) {
                errors.push(`${method.toUpperCase()} ${path}`);
              }
            }
          });
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Operations missing X-Idempotency-Key: ${errors.slice(0, 5).join(', ')}` };
    }
  },
  {
    id: 'ASYNC-IDEMPOTENCY-DOCS',
    category: 'async',
    description: 'Idempotency scope, TTL, replay documented',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const idempotencyKey = spec.components?.parameters?.IdempotencyKey;
      if (!idempotencyKey?.description) {
        return { passed: false, message: 'IdempotencyKey missing description' };
      }
      
      const desc = idempotencyKey.description.toLowerCase();
      const hasScope = desc.includes('scope') || desc.includes('method + path');
      const hasTTL = desc.includes('ttl') || desc.includes('24 hour');
      const hasReplay = desc.includes('replay') || desc.includes('same key');
      
      return hasScope && hasTTL && hasReplay ? 
        { passed: true } : 
        { passed: false, message: 'Idempotency description must document scope, TTL, and replay behavior' };
    }
  },
  {
    id: 'ASYNC-VERSION-NEGOTIATION',
    category: 'async',
    description: 'Accept-Version parameter defined and used',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const acceptVersion = spec.components?.parameters?.AcceptVersion;
      if (!acceptVersion) {
        return { passed: false, message: 'AcceptVersion parameter not defined' };
      }
      
      // Check pattern (handle both string contains and regex pattern)
      const pattern = acceptVersion.schema?.pattern;
      if (!pattern || (!pattern.includes('v') && !pattern.includes('\\d'))) {
        return { passed: false, message: 'AcceptVersion must have version pattern (e.g., v2, v2.1)' };
      }
      
      // Check usage on operations (or verify path versioning)
      const hasPathVersioning = Object.keys(spec.paths || {}).every(path => 
        path.includes('/v1/') || path.includes('/v2/') || path.includes('/v3/')
      );
      
      if (!hasPathVersioning) {
        // If not using path versioning, check for header usage
        const warnings = [];
        if (spec.paths) {
          Object.entries(spec.paths).forEach(([path, pathItem]) => {
            ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
              if (pathItem[method] && !hasParameter(pathItem, pathItem[method], 'AcceptVersion')) {
                warnings.push(`${method.toUpperCase()} ${path}`);
              }
            });
          });
        }
        
        if (warnings.length > 5) {
          return { passed: false, message: 'Operations missing Accept-Version header (no path versioning detected)' };
        }
      }
      
      return { passed: true };
    }
  },

  // ========== CONTENT NEGOTIATION (2 points) ==========
  {
    id: 'CONTENT-PATCH',
    category: 'content',
    description: 'PATCH supports application/json and merge-patch+json',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const errors = [];
      
      if (spec.paths) {
        Object.entries(spec.paths).forEach(([path, pathItem]) => {
          if (pathItem.patch?.requestBody?.content) {
            const content = pathItem.patch.requestBody.content;
            if (!content['application/json'] || !content['application/merge-patch+json']) {
              errors.push(path);
            }
            
            // Check descriptions mention semantics
            const jsonDesc = content['application/json']?.description || '';
            const mergeDesc = content['application/merge-patch+json']?.description || '';
            
            if (!mergeDesc.toLowerCase().includes('rfc 7396') && 
                !mergeDesc.toLowerCase().includes('merge patch')) {
              errors.push(`${path} merge-patch missing RFC 7396 description`);
            }
          }
        });
      }
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `PATCH issues: ${errors.slice(0, 5).join(', ')}` };
    }
  },
  {
    id: 'CONTENT-ACCEPT-LANG',
    category: 'content',
    description: 'Accept-Language header support',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const acceptLang = spec.components?.parameters?.AcceptLanguage;
      if (!acceptLang) {
        return { passed: false, message: 'AcceptLanguage parameter not defined' };
      }
      
      // Check pattern for RFC 5646
      if (!acceptLang.schema?.pattern) {
        return { passed: false, message: 'AcceptLanguage must have RFC 5646 pattern' };
      }
      
      return { passed: true };
    }
  },

  // ========== WEBHOOKS (3 points) ==========
  {
    id: 'WH-X-WEBHOOKS',
    category: 'webhooks',
    description: 'Uses x-webhooks not webhooks (3.0.3)',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (spec.webhooks) {
        return { passed: false, message: 'Must use x-webhooks instead of webhooks for OpenAPI 3.0.3' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'WH-HMAC',
    category: 'webhooks',
    description: 'HMAC-SHA256 webhook verification',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (!spec['x-webhooks']) {
        return { passed: true }; // OK if no webhooks
      }
      
      // Check webhook security documentation
      const webhookMeta = spec.components?.schemas?.WebhookMeta;
      if (!webhookMeta) {
        return { passed: false, message: 'WebhookMeta schema not defined for webhook security' };
      }
      
      const algorithm = webhookMeta.properties?.algorithm?.enum;
      return algorithm?.includes('HMAC-SHA256') ? 
        { passed: true } : 
        { passed: false, message: 'Webhooks must use HMAC-SHA256 for verification' };
    }
  },
  {
    id: 'WH-SECURITY',
    category: 'webhooks',
    description: 'Webhook ApiKeyAuth, timestamp, signature',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      if (!spec['x-webhooks']) {
        return { passed: true }; // OK if no webhooks
      }
      
      const webhookMeta = spec.components?.schemas?.WebhookMeta;
      if (!webhookMeta) {
        return { passed: false, message: 'WebhookMeta schema required for webhook security' };
      }
      
      const hasSignature = webhookMeta.properties?.signature_header;
      const hasTimestamp = webhookMeta.properties?.timestamp_header;
      const hasReplayWindow = webhookMeta.properties?.replay_window_seconds;
      
      const missing = [];
      if (!hasSignature) missing.push('signature_header');
      if (!hasTimestamp) missing.push('timestamp_header');
      if (!hasReplayWindow) missing.push('replay_window_seconds');
      
      return missing.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `WebhookMeta missing: ${missing.join(', ')}` };
    }
  },

  // ========== DOCUMENTATION (5 points) ==========
  {
    id: 'DOC-BUSINESS-RULES',
    category: 'docs',
    description: 'Business rules in RULE-XXX-001 format',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const description = spec.info?.description || '';
      const hasRules = /RULE-[A-Z]{3}-\d{3}/.test(description);
      
      return hasRules ? 
        { passed: true } : 
        { passed: false, message: 'API description must document business rules in RULE-XXX-001 format' };
    }
  },
  {
    id: 'DOC-PERF-SLA',
    category: 'docs',
    description: 'Performance SLAs documented',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const description = spec.info?.description || '';
      const hasPerf = (description.includes('ms') && description.includes('p95')) ||
                      description.includes('performance');
      
      // Also check x-performance-slas extension
      const hasPerfExtension = spec['x-performance-slas'];
      
      return hasPerf || hasPerfExtension ? 
        { passed: true } : 
        { passed: false, message: 'Performance SLAs must be documented' };
    }
  },
  {
    id: 'DOC-TECH-STACK',
    category: 'docs',
    description: 'Smackdab tech stack correct',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const description = spec.info?.description || '';
      const desc = description.toLowerCase();
      
      const hasCitus = desc.includes('citus') || desc.includes('postgresql');
      const hasDragonfly = desc.includes('dragonfly') || desc.includes('valkey');
      const hasPulsar = desc.includes('pulsar');
      
      if (!hasCitus || !hasDragonfly || !hasPulsar) {
        return { passed: false, message: 'Must document Smackdab tech stack: Citus, Dragonfly/Valkey, Pulsar' };
      }
      
      return { passed: true };
    }
  },
  {
    id: 'DOC-FORBIDDEN-TECH',
    category: 'docs',
    description: 'No forbidden technology mentioned',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const forbidden = findForbiddenTech(spec);
      
      return forbidden.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Forbidden technology detected: ${forbidden.join(', ')}` };
    }
  },
  {
    id: 'DOC-API-VERSION',
    category: 'docs',
    description: 'API versioning /api/v2/{domain}/{resources}',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const paths = Object.keys(spec.paths || {});
      const errors = [];
      
      paths.forEach(path => {
        // Skip webhook paths
        if (path.includes('webhook')) return;
        
        // Check path starts with /api/v{n}/{domain}/
        if (!path.match(/^\/api\/v\d+\/[a-z]+\//)) {
          errors.push(path);
        }
        
        // Check collection paths are plural
        const segments = path.split('/');
        const resourceSegment = segments[4]; // After /api/v2/{domain}/
        if (resourceSegment && !resourceSegment.includes('{') && !path.endsWith('}')) {
          // This is likely a collection endpoint
          if (!resourceSegment.endsWith('s') && !resourceSegment.endsWith('es')) {
            errors.push(`${path} (collection should be plural)`);
          }
        }
      });
      
      return errors.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Invalid path structure: ${errors.slice(0, 3).join(', ')}` };
    }
  },

  // ========== EXTENSIONS (3 points) ==========
  {
    id: 'EXT-REQUIRED-PRESENT',
    category: 'extensions',
    description: 'Required x-extensions present',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const required = [
        'x-rate-limiting',
        'x-caching-strategy',
        'x-performance-slas',
        'x-platform-constraints'
      ];
      
      const missing = required.filter(ext => !spec[ext]);
      
      return missing.length === 0 ? 
        { passed: true } : 
        { passed: false, message: `Missing required extensions: ${missing.join(', ')}` };
    }
  },
  {
    id: 'EXT-CONTENT-NEGOTIATION',
    category: 'extensions',
    description: 'Content negotiation and CORS extensions',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      const warnings = [];
      
      if (!spec['x-content-negotiation']) {
        warnings.push('x-content-negotiation not defined');
      } else {
        if (!spec['x-content-negotiation'].supported_media_types) {
          warnings.push('x-content-negotiation missing supported_media_types');
        }
        if (!spec['x-content-negotiation'].compression) {
          warnings.push('x-content-negotiation missing compression config');
        }
      }
      
      if (!spec['x-cors-policy']) {
        warnings.push('x-cors-policy not defined');
      }
      
      return warnings.length === 0 ? 
        { passed: true } : 
        { passed: true, message: warnings.join('; ') };
    }
  },
  {
    id: 'EXT-DEPRECATION',
    category: 'extensions',
    description: 'Deprecation headers and strategy',
    weight: 1,
    autoFail: false,
    check: (spec) => {
      // Check for deprecation headers in components
      const hasDeprecation = spec.components?.headers?.Deprecation;
      const hasSunset = spec.components?.headers?.Sunset;
      const hasLink = spec.components?.headers?.Link;
      
      if (!hasDeprecation || !hasSunset || !hasLink) {
        return { passed: true, message: 'Consider defining Deprecation, Sunset, and Link headers for API lifecycle' };
      }
      
      return { passed: true };
    }
  }
];

// ============================================================================
// GRADING LOGIC
// ============================================================================

function gradeAPI(spec) {
  let totalScore = 0;
  const findings = [];
  const autoFailReasons = [];
  const autoFailIds = [];
  const categoryScores = {};
  
  // Initialize category scores
  CHECKPOINTS.forEach(checkpoint => {
    if (!categoryScores[checkpoint.category]) {
      categoryScores[checkpoint.category] = {
        total: 0,
        earned: 0,
        checkpoints: []
      };
    }
    categoryScores[checkpoint.category].total += checkpoint.weight;
  });
  
  // Run all checkpoint validations
  CHECKPOINTS.forEach(checkpoint => {
    try {
      const result = checkpoint.check(spec);
      
      if (result.passed) {
        totalScore += checkpoint.weight;
        categoryScores[checkpoint.category].earned += checkpoint.weight;
        findings.push({
          checkpoint: checkpoint.id,
          category: checkpoint.category,
          passed: true,
          weight: checkpoint.weight,
          autoFail: checkpoint.autoFail,
          severity: result.message ? 'info' : 'info',
          message: result.message,
          jsonPath: `$.${checkpoint.category}`
        });
      } else {
        findings.push({
          checkpoint: checkpoint.id,
          category: checkpoint.category,
          passed: false,
          weight: checkpoint.weight,
          autoFail: checkpoint.autoFail,
          severity: checkpoint.autoFail ? 'error' : 'warn',
          message: result.message,
          jsonPath: `$.${checkpoint.category}`
        });
        
        if (checkpoint.autoFail) {
          autoFailReasons.push(`${checkpoint.description}: ${result.message}`);
          autoFailIds.push(checkpoint.id);
        }
      }
    } catch (error) {
      // Handle any validation errors gracefully
      findings.push({
        checkpoint: checkpoint.id,
        category: checkpoint.category,
        passed: false,
        weight: checkpoint.weight,
        autoFail: checkpoint.autoFail,
        severity: 'error',
        message: `Validation error: ${error.message}`,
        jsonPath: `$.${checkpoint.category}`
      });
    }
  });
  
  // Apply auto-fail logic
  if (autoFailReasons.length > 0) {
    totalScore = Math.min(totalScore, 59);
  }
  
  return {
    apiId: getApiId(spec),
    score: totalScore,
    letterGrade: getLetterGrade(totalScore),
    findings,
    autoFailReasons,
    autoFailIds,
    totalPossible: CHECKPOINTS.reduce((sum, c) => sum + c.weight, 0),
    categoryScores
  };
}

function getLetterGrade(score) {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node comprehensive-grader-v3.cjs <openapi-spec.yaml>');
    console.log('\nSmackdab API Contract Grader v3.0 - Production Ready');
    console.log('Complete enforcement of MASTER_API_TEMPLATE_v3.yaml standards');
    console.log(`\nTotal checkpoints: ${CHECKPOINTS.length}`);
    console.log(`Total possible score: ${CHECKPOINTS.reduce((sum, c) => sum + c.weight, 0)}`);
    process.exit(1);
  }
  
  const filePath = args[0];
  
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  
  console.log(`${colors.blue}📊 Grading: ${filePath}${colors.reset}`);
  console.log('='.repeat(60));
  
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const spec = yaml.load(fileContents);
    
    const result = gradeAPI(spec);
    
    // Display results
    console.log(`\n${colors.bright}🎯 Score: ${result.score}/${result.totalPossible} (${result.letterGrade})${colors.reset}`);
    console.log(`   API ID: ${result.apiId}`);
    
    if (result.autoFailReasons.length > 0) {
      console.log(`\n${colors.red}❌ AUTO-FAIL TRIGGERED (${result.autoFailIds.length} violations):${colors.reset}`);
      result.autoFailReasons.forEach(reason => {
        console.log(`  - ${reason}`);
      });
    }
    
    // Group findings by category
    const categories = {};
    CHECKPOINTS.forEach(checkpoint => {
      if (!categories[checkpoint.category]) {
        categories[checkpoint.category] = {
          total: 0,
          passed: 0,
          findings: []
        };
      }
      categories[checkpoint.category].total += checkpoint.weight;
      
      const finding = result.findings.find(f => f.checkpoint === checkpoint.id);
      if (finding) {
        if (finding.passed) {
          categories[checkpoint.category].passed += checkpoint.weight;
        }
        categories[checkpoint.category].findings.push({
          ...finding,
          description: checkpoint.description,
          weight: checkpoint.weight
        });
      }
    });
    
    console.log(`\n${colors.cyan}📋 Checkpoint Results:${colors.reset}\n`);
    
    Object.entries(categories).forEach(([category, data]) => {
      const categoryName = category.toUpperCase();
      const percentage = data.total > 0 ? Math.round((data.passed / data.total) * 100) : 0;
      console.log(`${colors.bright}${categoryName} (${data.passed}/${data.total} - ${percentage}%):${colors.reset}`);
      
      data.findings.forEach(finding => {
        const icon = finding.passed ? `${colors.green}✅` : `${colors.red}❌`;
        const autoFailMarker = finding.autoFail ? ' [AUTO-FAIL]' : '';
        console.log(`  ${icon} ${finding.description}${autoFailMarker}${colors.reset}`);
        if (finding.message) {
          const messageColor = finding.passed ? colors.green : colors.yellow;
          console.log(`     ${messageColor}└─ ${finding.message}${colors.reset}`);
        }
      });
      console.log();
    });
    
    // Summary statistics
    console.log(`${colors.cyan}📊 Summary:${colors.reset}`);
    console.log(`  Total Checkpoints: ${CHECKPOINTS.length}`);
    console.log(`  Passed: ${result.findings.filter(f => f.passed).length}`);
    console.log(`  Failed: ${result.findings.filter(f => !f.passed).length}`);
    console.log(`  Auto-Fail Violations: ${result.autoFailIds.length}`);
    
    // Save detailed report
    const reportPath = filePath.replace('.yaml', '-v3-report.json').replace('.yml', '-v3-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    console.log(`\n${colors.green}📄 Detailed report saved to: ${reportPath}${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the grader
main();