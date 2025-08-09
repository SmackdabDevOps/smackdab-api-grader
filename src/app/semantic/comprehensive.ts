import crypto from 'node:crypto';

export interface Finding { 
  ruleId: string; 
  severity: 'error'|'warn'|'info'; 
  message: string; 
  jsonPath: string; 
  category?: string; 
  line?: number; 
}

// Helper to resolve $ref pointers
function resolveRef(spec: any, ref: string): any {
  if (!ref || !ref.startsWith('#/')) return null;
  const path = ref.substring(2).split('/');
  let current = spec;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return null;
    current = current[segment];
  }
  return current;
}

// Get effective parameters (merge path-level and operation-level)
function resolveEffectiveParams(spec: any, pathItem: any, operation: any): any[] {
  const pathParams = pathItem?.parameters || [];
  const opParams = operation?.parameters || [];
  
  // Build a map of params by name+in
  const paramMap = new Map();
  
  // First add path-level params
  for (const param of pathParams) {
    if ((param as any).$ref) {
      const resolved = resolveRef(spec, (param as any).$ref);
      if (resolved) {
        const key = `${resolved.in}:${resolved.name}`;
        paramMap.set(key, resolved);
      }
    } else {
      const key = `${param.in}:${param.name}`;
      paramMap.set(key, param);
    }
  }
  
  // Then overlay operation-level params (they override path-level)
  for (const param of opParams) {
    if ((param as any).$ref) {
      const resolved = resolveRef(spec, (param as any).$ref);
      if (resolved) {
        const key = `${resolved.in}:${resolved.name}`;
        paramMap.set(key, resolved);
      }
    } else {
      const key = `${param.in}:${param.name}`;
      paramMap.set(key, param);
    }
  }
  
  return Array.from(paramMap.values());
}

// Extract API ID
function getApiId(spec: any): string {
  if (spec['x-api-id']) return spec['x-api-id'];
  const title = spec.info?.title || 'unknown';
  const version = spec.info?.version || '0.0.0';
  return crypto.createHash('sha256').update(`${title}@${version}`).digest('hex').substring(0, 12);
}

// Get all operations
function opEntries(paths: any) {
  const out: Array<{ pathKey: string; method: string; op: any; pathItem: any }> = [];
  if (!paths) return out;
  for (const pathKey of Object.keys(paths)) {
    const pathItem = paths[pathKey] || {};
    for (const method of ['get','post','patch','delete','put','options','head']) {
      if (pathItem[method]) {
        out.push({ pathKey, method, op: pathItem[method], pathItem });
      }
    }
  }
  return out;
}

export function checkComprehensive(spec: any) {
  const findings: Finding[] = [];
  let score = 0;
  const maxScore = 100;
  const autoFailReasons: string[] = [];

  // Track API ID
  const apiId = getApiId(spec);

  // 1. OpenAPI Version Check (Critical) - 10 points
  if (spec.openapi !== '3.0.3') {
    findings.push({
      ruleId: 'OAS-VERSION',
      severity: 'error',
      message: 'OpenAPI version must be 3.0.3',
      jsonPath: '$.openapi',
      category: 'structure'
    });
    autoFailReasons.push('OpenAPI version not 3.0.3');
  } else {
    score += 10;  // Increased from 5
  }

  // 2. Info Section Checks - 5 points total
  if (spec.info?.contact?.email) score += 3;  // Increased from 1
  else findings.push({
    ruleId: 'INFO-CONTACT',
    severity: 'warn',
    message: 'Missing contact email',
    jsonPath: '$.info.contact.email',
    category: 'info'
  });

  if (spec.info?.version?.match(/^\d+\.\d+\.\d+/)) score += 2;  // Increased from 1
  else findings.push({
    ruleId: 'INFO-VERSION',
    severity: 'warn',
    message: 'Version should follow semantic versioning',
    jsonPath: '$.info.version',
    category: 'info'
  });

  // 3. Multi-tenancy Headers (Critical)
  let hasAllOrgHeaders = true;
  let hasAllBranchHeaders = true;
  
  for (const { pathKey, method, op, pathItem } of opEntries(spec.paths)) {
    const effectiveParams = resolveEffectiveParams(spec, pathItem, op);
    
    // Check for X-Organization-ID
    const hasOrgHeader = effectiveParams.some(p => 
      p.in === 'header' && p.name === 'X-Organization-ID'
    );
    if (!hasOrgHeader) {
      hasAllOrgHeaders = false;
      findings.push({
        ruleId: 'SEC-ORG-HDR',
        severity: 'error',
        message: 'Missing X-Organization-ID header',
        jsonPath: `$.paths['${pathKey}'].${method}.parameters`,
        category: 'security'
      });
    }
    
    // Check for X-Branch-ID
    const hasBranchHeader = effectiveParams.some(p => 
      p.in === 'header' && p.name === 'X-Branch-ID'
    );
    if (!hasBranchHeader) {
      hasAllBranchHeaders = false;
      findings.push({
        ruleId: 'SEC-BRANCH-HDR',
        severity: 'error',
        message: 'Missing X-Branch-ID header',
        jsonPath: `$.paths['${pathKey}'].${method}.parameters`,
        category: 'security'
      });
    }

    // Check for forbidden pagination params at operation level
    const forbiddenPagination = ['offset', 'page', 'page_size', 'pageNumber', 'cursor', 'pageToken'];
    for (const forbidden of forbiddenPagination) {
      if (effectiveParams.some(p => p.in === 'query' && p.name === forbidden)) {
        findings.push({
          ruleId: 'PAG-FORBIDDEN',
          severity: 'error',
          message: `Forbidden pagination parameter: ${forbidden}`,
          jsonPath: `$.paths['${pathKey}'].${method}.parameters`,
          category: 'pagination'
        });
        autoFailReasons.push(`Forbidden pagination parameter: ${forbidden}`);
      }
    }

    // Check error responses for problem+json
    const responses = op.responses || {};
    for (const [statusCode, response] of Object.entries(responses)) {
      const status = parseInt(statusCode);
      if (status >= 400 && status < 600) {
        let content: any = response;
        
        // Resolve $ref if present
        if (response && typeof response === 'object' && (response as any).$ref) {
          content = resolveRef(spec, (response as any).$ref);
        }
        
        const hasProblemJson = content?.content?.['application/problem+json'] || 
                              content?.content?.['application/json']?.schema?.$ref?.includes('ProblemDetail');
        
        if (!hasProblemJson) {
          findings.push({
            ruleId: 'ERR-PROBLEMJSON',
            severity: 'error',
            message: `Error response ${status} must use application/problem+json`,
            jsonPath: `$.paths['${pathKey}'].${method}.responses['${statusCode}']`,
            category: 'responses'
          });
        }

        // Check for WWW-Authenticate on 401
        if (status === 401) {
          const headers = content?.headers || {};
          let hasWwwAuth = false;
          
          for (const [headerName, headerDef] of Object.entries(headers)) {
            if (headerName === 'WWW-Authenticate') {
              hasWwwAuth = true;
            } else if (headerDef && typeof headerDef === 'object' && (headerDef as any).$ref) {
              const resolved = resolveRef(spec, (headerDef as any).$ref);
              if (resolved && headerName === 'WWW-Authenticate') {
                hasWwwAuth = true;
              }
            }
          }
          
          if (!hasWwwAuth) {
            findings.push({
              ruleId: 'HTTP-401-AUTH',
              severity: 'error',
              message: '401 response must include WWW-Authenticate header',
              jsonPath: `$.paths['${pathKey}'].${method}.responses['401'].headers`,
              category: 'http'
            });
          }
        }

        // Check for Retry-After on 429/503
        if (status === 429 || status === 503) {
          const headers = content?.headers || {};
          let hasRetryAfter = false;
          
          for (const [headerName, headerDef] of Object.entries(headers)) {
            if (headerName === 'Retry-After') {
              hasRetryAfter = true;
            } else if (headerDef && typeof headerDef === 'object' && (headerDef as any).$ref) {
              const resolved = resolveRef(spec, (headerDef as any).$ref);
              if (resolved && headerName === 'Retry-After') {
                hasRetryAfter = true;
              }
            }
          }
          
          if (!hasRetryAfter) {
            findings.push({
              ruleId: `HTTP-${status}-RETRY`,
              severity: 'warn',
              message: `${status} response should include Retry-After header`,
              jsonPath: `$.paths['${pathKey}'].${method}.responses['${status}'].headers`,
              category: 'http'
            });
          }
        }
      }

      // Check 202 responses for job semantics
      if (statusCode === '202') {
        let content: any = response;
        if (response && typeof response === 'object' && (response as any).$ref) {
          content = resolveRef(spec, (response as any).$ref);
        }
        
        const headers = content?.headers || {};
        let hasLocation = false;
        let hasRetryAfter = false;
        
        for (const [headerName, headerDef] of Object.entries(headers)) {
          if (headerName === 'Location') hasLocation = true;
          if (headerName === 'Retry-After') hasRetryAfter = true;
          
          if (headerDef && typeof headerDef === 'object' && (headerDef as any).$ref) {
            const resolved = resolveRef(spec, (headerDef as any).$ref);
            if (resolved) {
              if (headerName === 'Location') hasLocation = true;
              if (headerName === 'Retry-After') hasRetryAfter = true;
            }
          }
        }
        
        if (!hasLocation) {
          findings.push({
            ruleId: 'ASYNC-202-LOCATION',
            severity: 'error',
            message: '202 response must include Location header',
            jsonPath: `$.paths['${pathKey}'].${method}.responses['202'].headers`,
            category: 'async'
          });
        }
        
        if (!hasRetryAfter) {
          findings.push({
            ruleId: 'ASYNC-202-RETRY',
            severity: 'warn',
            message: '202 response should include Retry-After header',
            jsonPath: `$.paths['${pathKey}'].${method}.responses['202'].headers`,
            category: 'async'
          });
        }
      }

      // Check 2xx responses for ResponseEnvelope
      // EXCEPTION: 202 Accepted and job status endpoints can return AsyncJobStatus directly
      if (status >= 200 && status < 300) {
        let content: any = response;
        if (response && typeof response === 'object' && (response as any).$ref) {
          content = resolveRef(spec, (response as any).$ref);
        }
        
        const jsonContent = content?.content?.['application/json'];
        const schema = jsonContent?.schema;
        
        if (schema) {
          let schemaToCheck = schema;
          let schemaRef = (schema as any).$ref;
          if (schemaRef) {
            schemaToCheck = resolveRef(spec, schemaRef);
          }
          
          // Check if this is an async job response (which doesn't need ResponseEnvelope)
          const isAsyncJobStatus = schemaRef && (
            schemaRef.includes('AsyncJobStatus') || 
            schemaRef.includes('JobStatus')
          );
          
          // Also check if this is a job endpoint
          const isJobEndpoint = pathKey.includes('/jobs/') || pathKey.includes('/job/');
          
          // 202 Accepted responses are for async operations and return AsyncJobStatus directly
          const isAcceptedResponse = statusCode === '202';
          
          // Only require ResponseEnvelope for non-async responses
          if (!isAsyncJobStatus && !isJobEndpoint && !isAcceptedResponse) {
            const hasEnvelope = schemaToCheck?.properties?.success !== undefined &&
                              schemaToCheck?.properties?.data !== undefined;
            
            if (!hasEnvelope) {
              findings.push({
                ruleId: 'ENV-RESPONSE',
                severity: 'error',
                message: '2xx responses must use ResponseEnvelope',
                jsonPath: `$.paths['${pathKey}'].${method}.responses['${statusCode}']`,
                category: 'envelope'
              });
            }
          }
        }
      }
    }
  }

  if (!hasAllOrgHeaders) {
    autoFailReasons.push('Missing X-Organization-ID on operations');
  } else {
    score += 15;  // Increased from 5 - critical for multi-tenancy
  }

  if (!hasAllBranchHeaders) {
    autoFailReasons.push('Missing X-Branch-ID on operations');
  } else {
    score += 10;  // Increased from 3 - important for multi-tenancy
  }

  // 4. Security Schemes
  const securitySchemes = spec.components?.securitySchemes || {};
  
  if (securitySchemes.OAuth2) {
    const oauth = securitySchemes.OAuth2;
    if (oauth.type === 'oauth2' && oauth.flows) score += 10;  // Increased from 2 - security is critical
    else findings.push({
      ruleId: 'SEC-OAUTH2',
      severity: 'error',
      message: 'OAuth2 must have proper flows',
      jsonPath: '$.components.securitySchemes.OAuth2',
      category: 'security'
    });
  } else {
    findings.push({
      ruleId: 'SEC-OAUTH2',
      severity: 'error',
      message: 'OAuth2 security scheme required',
      jsonPath: '$.components.securitySchemes',
      category: 'security'
    });
  }

  // 5. Path Structure
  let pathsValid = true;
  for (const path of Object.keys(spec.paths || {})) {
    if (!path.startsWith('/api/v2/')) {
      pathsValid = false;
      findings.push({
        ruleId: 'PATH-STRUCTURE',
        severity: 'error',
        message: `Path must start with /api/v2/: ${path}`,
        jsonPath: `$.paths['${path}']`,
        category: 'naming'
      });
    }
  }
  
  if (!pathsValid) {
    autoFailReasons.push('Invalid path structure');
  } else {
    score += 10;  // Increased from 4 - path structure is fundamental
  }

  // 6. Pagination Checks
  let hasKeysetPagination = true;
  const listEndpoints = [];
  
  for (const { pathKey, method, op, pathItem } of opEntries(spec.paths)) {
    if (method === 'get' && !pathKey.match(/\{[^}]+\}$/)) {
      listEndpoints.push({ pathKey, method, op, pathItem });
    }
  }

  for (const { pathKey, method, op, pathItem } of listEndpoints) {
    const effectiveParams = resolveEffectiveParams(spec, pathItem, op);
    
    const hasAfterKey = effectiveParams.some(p => p.name === 'after_key' && p.in === 'query');
    const hasBeforeKey = effectiveParams.some(p => p.name === 'before_key' && p.in === 'query');
    const hasLimit = effectiveParams.some(p => p.name === 'limit' && p.in === 'query');
    
    if (!hasAfterKey || !hasBeforeKey || !hasLimit) {
      hasKeysetPagination = false;
      findings.push({
        ruleId: 'PAG-KEYSET',
        severity: 'error',
        message: 'List endpoints must have after_key, before_key, and limit',
        jsonPath: `$.paths['${pathKey}'].${method}.parameters`,
        category: 'pagination'
      });
    }
  }

  if (!hasKeysetPagination) {
    autoFailReasons.push('Missing key-set pagination');
  } else {
    score += 15;  // Increased from 5 - critical for scalability
  }

  // 7. Forbidden Technology Check
  const forbiddenTech = {
    'kafka': 'Use Pulsar instead',
    'rabbitmq': 'Use Pulsar instead',
    'redis': 'Use Dragonfly/Valkey instead',
    'elasticsearch': 'Use alternatives'
  };

  // Only check in actual technical content, not descriptions or comments
  // Look for usage patterns that indicate actual implementation
  const technicalContent = {
    servers: spec.servers,
    paths: spec.paths,
    components: spec.components,
    'x-platform-constraints': spec['x-platform-constraints']
  };
  
  const fullText = JSON.stringify(technicalContent).toLowerCase();
  
  for (const [tech, replacement] of Object.entries(forbiddenTech)) {
    // More sophisticated check - avoid false positives from documentation
    // Look for actual technology references, not documentation mentions
    const patterns = [
      `"${tech}"`,           // Quoted technology name
      `'${tech}'`,           // Single quoted
      `${tech}_`,            // With underscore (e.g., redis_host)
      `${tech}-`,            // With dash (e.g., kafka-broker)
      `${tech}\\.`,          // With dot (e.g., redis.host)
      `\\/${tech}\\b`,       // In paths (e.g., /kafka)
      `${tech}:`,            // As protocol/prefix (e.g., kafka:)
    ];
    
    // Also exclude negative patterns
    const negativePatterns = [
      `no[_-]?${tech}`,      // no_kafka, no-kafka, nokafka
      `not[_-]?${tech}`,     // not_redis, not-redis
      `without[_-]?${tech}`, // without_elasticsearch
      `instead[_-]of[_-]${tech}`, // instead of kafka
    ];
    
    let found = false;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(fullText)) {
        // Check if it's not a negative pattern
        let isNegative = false;
        for (const negPattern of negativePatterns) {
          const negRegex = new RegExp(negPattern, 'i');
          if (negRegex.test(fullText)) {
            isNegative = true;
            break;
          }
        }
        
        if (!isNegative) {
          found = true;
          break;
        }
      }
    }
    
    if (found) {
      findings.push({
        ruleId: `TECH-FORBIDDEN-${tech.toUpperCase()}`,
        severity: 'error',
        message: `Forbidden technology: ${tech}. ${replacement}`,
        jsonPath: '$',
        category: 'technology'
      });
      autoFailReasons.push(`Forbidden technology: ${tech}`);
    }
  }

  // 8. Component Organization - 10 points total
  if (spec.components?.schemas && Object.keys(spec.components.schemas).length > 0) {
    score += 5;  // Increased from 2
  } else {
    findings.push({
      ruleId: 'COMP-SCHEMAS',
      severity: 'warn',
      message: 'No reusable schemas defined',
      jsonPath: '$.components.schemas',
      category: 'components'
    });
  }

  if (spec.components?.parameters && Object.keys(spec.components.parameters).length > 0) {
    score += 5;  // Increased from 2
  } else {
    findings.push({
      ruleId: 'COMP-PARAMS',
      severity: 'warn',
      message: 'No reusable parameters defined',
      jsonPath: '$.components.parameters',
      category: 'components'
    });
  }

  // 9. Rate Limiting Headers
  let hasRateLimiting = false;
  for (const { pathKey, method, op } of opEntries(spec.paths)) {
    const responses = op.responses || {};
    for (const [statusCode, response] of Object.entries(responses)) {
      const status = parseInt(statusCode);
      if (status >= 200 && status < 300) {
        let content: any = response;
        if (response && typeof response === 'object' && (response as any).$ref) {
          content = resolveRef(spec, (response as any).$ref);
        }
        
        const headers = content?.headers || {};
        const headerNames = Object.keys(headers);
        
        if (headerNames.includes('X-RateLimit-Limit') && 
            headerNames.includes('X-RateLimit-Remaining') && 
            headerNames.includes('X-RateLimit-Reset')) {
          hasRateLimiting = true;
          break;
        }
      }
    }
    if (hasRateLimiting) break;
  }

  if (hasRateLimiting) score += 5;  // Increased from 2
  else findings.push({
    ruleId: 'HTTP-RATE-LIMIT',
    severity: 'warn',
    message: 'Missing rate limit headers (X-RateLimit-Limit/Remaining/Reset)',
    jsonPath: '$.paths',
    category: 'http'
  });

  // Bonus points for excellence
  // The Master Template includes many best practices that should be rewarded
  
  // Check for comprehensive error responses
  const hasAllErrorResponses = spec.components?.responses && 
    Object.keys(spec.components.responses).length >= 10;
  if (hasAllErrorResponses) score += 5;  // Bonus for comprehensive error handling
  
  // Check for proper headers definitions
  const hasHeaderComponents = spec.components?.headers && 
    Object.keys(spec.components.headers).length >= 5;
  if (hasHeaderComponents) score += 3;  // Bonus for reusable headers
  
  // Check for extension documentation (x- fields)
  const hasExtensions = spec['x-rate-limiting'] || spec['x-caching-strategy'] || 
                       spec['x-performance-slas'] || spec['x-platform-constraints'];
  if (hasExtensions) score += 2;  // Bonus for platform-specific documentation
  
  // Calculate final score
  const finalScore = Math.min(score, maxScore);
  const hasAutoFail = autoFailReasons.length > 0;

  return {
    findings,
    score: { comprehensive: { add: finalScore, max: maxScore } },
    autoFailReasons,
    metadata: { apiId }
  };
} 