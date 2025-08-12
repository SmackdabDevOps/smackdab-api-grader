/**
 * REST API Pattern Library
 * Comprehensive patterns for identifying RESTful APIs
 */

export interface Pattern {
  id: string;
  name: string;
  description: string;
  weight: number;
  detector: (spec: any) => boolean;
  evidence: (spec: any) => string[];
}

export class RESTPatterns {
  static readonly patterns: Pattern[] = [
    {
      id: 'rest.resource_hierarchy',
      name: 'Resource Hierarchy',
      description: 'Hierarchical resource paths like /users/{id}/posts',
      weight: 0.9,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.some(p => /\/\w+\/{\w+}\/\w+/.test(p));
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.filter(p => /\/\w+\/{\w+}\/\w+/.test(p)).slice(0, 3);
      }
    },
    
    {
      id: 'rest.collection_item',
      name: 'Collection/Item Pattern',
      description: 'Paired paths like /users and /users/{id}',
      weight: 0.95,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.some(p1 => 
          paths.some(p2 => p2 === `${p1}/{id}` || p2 === `${p1}/{${p1.slice(1, -1)}Id}`)
        );
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const pairs: string[] = [];
        paths.forEach(p1 => {
          paths.forEach(p2 => {
            if (p2.startsWith(p1 + '/{')) {
              pairs.push(`${p1} → ${p2}`);
            }
          });
        });
        return pairs.slice(0, 3);
      }
    },
    
    {
      id: 'rest.http_verbs',
      name: 'HTTP Verb Semantics',
      description: 'Proper use of GET/POST/PUT/PATCH/DELETE',
      weight: 0.85,
      detector: (spec) => {
        let correctUsage = 0;
        let totalOps = 0;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          // GET should not have request body
          if (path.get && !path.get.requestBody) correctUsage++;
          if (path.get) totalOps++;
          
          // POST should have request body
          if (path.post && path.post.requestBody) correctUsage++;
          if (path.post) totalOps++;
          
          // PUT should have request body
          if (path.put && path.put.requestBody) correctUsage++;
          if (path.put) totalOps++;
          
          // DELETE should not have request body
          if (path.delete && !path.delete.requestBody) correctUsage++;
          if (path.delete) totalOps++;
        });
        
        return totalOps > 0 && (correctUsage / totalOps) > 0.8;
      },
      evidence: (spec) => {
        const verbs = new Set<string>();
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.keys(path).forEach(verb => {
            if (['get', 'post', 'put', 'patch', 'delete'].includes(verb)) {
              verbs.add(verb.toUpperCase());
            }
          });
        });
        return [`Uses verbs: ${Array.from(verbs).join(', ')}`];
      }
    },
    
    {
      id: 'rest.status_codes',
      name: 'RESTful Status Codes',
      description: 'Appropriate HTTP status codes for operations',
      weight: 0.7,
      detector: (spec) => {
        let appropriate = 0;
        let total = 0;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          // POST should return 201 for creation
          if (path.post?.responses?.['201']) appropriate++;
          if (path.post) total++;
          
          // DELETE should return 204 for no content
          if (path.delete?.responses?.['204']) appropriate++;
          if (path.delete) total++;
          
          // GET should return 200
          if (path.get?.responses?.['200']) appropriate++;
          if (path.get) total++;
        });
        
        return total > 0 && (appropriate / total) > 0.6;
      },
      evidence: (spec) => {
        const codes = new Set<string>();
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.responses) {
              Object.keys(op.responses).forEach(code => codes.add(code));
            }
          });
        });
        return [`Status codes: ${Array.from(codes).sort().join(', ')}`];
      }
    },
    
    {
      id: 'rest.query_params',
      name: 'Query Parameters',
      description: 'Use of query parameters for filtering/pagination',
      weight: 0.6,
      detector: (spec) => {
        const queryParams = ['page', 'limit', 'sort', 'filter', 'search', 'q'];
        let found = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.parameters) {
              op.parameters.forEach((param: any) => {
                if (param.in === 'query' && queryParams.some(q => 
                  param.name.toLowerCase().includes(q)
                )) {
                  found = true;
                }
              });
            }
          });
        });
        
        return found;
      },
      evidence: (spec) => {
        const params = new Set<string>();
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.parameters) {
              op.parameters.forEach((param: any) => {
                if (param.in === 'query') {
                  params.add(param.name);
                }
              });
            }
          });
        });
        return params.size > 0 ? [`Query params: ${Array.from(params).slice(0, 5).join(', ')}`] : [];
      }
    },
    
    {
      id: 'rest.hateoas',
      name: 'HATEOAS Links',
      description: 'Hypermedia links in responses',
      weight: 0.5,
      detector: (spec) => {
        let hasLinks = false;
        
        if (spec.components?.schemas) {
          Object.values(spec.components.schemas).forEach((schema: any) => {
            if (schema.properties?._links || 
                schema.properties?.links ||
                schema.properties?.href) {
              hasLinks = true;
            }
          });
        }
        
        return hasLinks;
      },
      evidence: (spec) => {
        const schemas: string[] = [];
        if (spec.components?.schemas) {
          Object.entries(spec.components.schemas).forEach(([name, schema]: [string, any]) => {
            if (schema.properties?._links || schema.properties?.links) {
              schemas.push(`${name} has HATEOAS links`);
            }
          });
        }
        return schemas.slice(0, 3);
      }
    },
    
    {
      id: 'rest.content_negotiation',
      name: 'Content Negotiation',
      description: 'Support for multiple content types',
      weight: 0.6,
      detector: (spec) => {
        let multipleTypes = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.requestBody?.content && Object.keys(op.requestBody.content).length > 1) {
              multipleTypes = true;
            }
            if (op.responses) {
              Object.values(op.responses).forEach((resp: any) => {
                if (resp.content && Object.keys(resp.content).length > 1) {
                  multipleTypes = true;
                }
              });
            }
          });
        });
        
        return multipleTypes;
      },
      evidence: (spec) => {
        const types = new Set<string>();
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.requestBody?.content) {
              Object.keys(op.requestBody.content).forEach(t => types.add(t));
            }
            if (op.responses) {
              Object.values(op.responses).forEach((resp: any) => {
                if (resp.content) {
                  Object.keys(resp.content).forEach(t => types.add(t));
                }
              });
            }
          });
        });
        return types.size > 1 ? [`Content types: ${Array.from(types).join(', ')}`] : [];
      }
    },
    
    {
      id: 'rest.versioning',
      name: 'API Versioning',
      description: 'Version in path or header',
      weight: 0.7,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const hasPathVersion = paths.some(p => /\/v\d+\//.test(p));
        
        let hasHeaderVersion = false;
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.parameters) {
              op.parameters.forEach((param: any) => {
                if (param.in === 'header' && 
                    /version|api-version/i.test(param.name)) {
                  hasHeaderVersion = true;
                }
              });
            }
          });
        });
        
        return hasPathVersion || hasHeaderVersion;
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        const paths = Object.keys(spec.paths || {});
        const versionPaths = paths.filter(p => /\/v\d+\//.test(p));
        if (versionPaths.length > 0) {
          evidence.push(`Path versioning: ${versionPaths[0]}`);
        }
        return evidence;
      }
    },
    
    {
      id: 'rest.idempotency',
      name: 'Idempotent Operations',
      description: 'PUT and DELETE are idempotent',
      weight: 0.6,
      detector: (spec) => {
        let hasIdempotent = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          if (path.put || path.delete) {
            hasIdempotent = true;
          }
        });
        
        return hasIdempotent;
      },
      evidence: (spec) => {
        const ops: string[] = [];
        Object.entries(spec.paths || {}).forEach(([path, pathObj]: [string, any]) => {
          if (pathObj.put) ops.push(`PUT ${path}`);
          if (pathObj.delete) ops.push(`DELETE ${path}`);
        });
        return ops.slice(0, 3);
      }
    },
    
    {
      id: 'rest.resource_representation',
      name: 'Resource Representations',
      description: 'Consistent resource schemas',
      weight: 0.7,
      detector: (spec) => {
        if (!spec.components?.schemas) return false;
        
        const resourceSchemas = Object.keys(spec.components.schemas).filter(name =>
          !name.toLowerCase().includes('error') &&
          !name.toLowerCase().includes('request') &&
          !name.toLowerCase().includes('response')
        );
        
        return resourceSchemas.length > 0;
      },
      evidence: (spec) => {
        if (!spec.components?.schemas) return [];
        
        const resources = Object.keys(spec.components.schemas)
          .filter(name => !name.toLowerCase().includes('error'))
          .slice(0, 5);
        
        return resources.length > 0 ? [`Resources: ${resources.join(', ')}`] : [];
      }
    }
  ];

  /**
   * Calculate REST confidence score
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
   * Check if API follows REST best practices
   */
  static checkBestPractices(spec: any): { 
    follows: string[]; 
    violations: string[]; 
  } {
    const follows: string[] = [];
    const violations: string[] = [];
    
    // Check collection/item pattern
    const paths = Object.keys(spec.paths || {});
    const hasCollectionItem = paths.some(p1 => 
      paths.some(p2 => p2.startsWith(p1 + '/{'))
    );
    if (hasCollectionItem) {
      follows.push('Uses collection/item resource pattern');
    } else if (paths.length > 3) {
      violations.push('Missing collection/item resource pattern');
    }
    
    // Check HTTP verb usage
    Object.entries(spec.paths || {}).forEach(([path, pathObj]: [string, any]) => {
      // GET should not modify state
      if (pathObj.get?.operationId?.toLowerCase().includes('create') ||
          pathObj.get?.operationId?.toLowerCase().includes('update') ||
          pathObj.get?.operationId?.toLowerCase().includes('delete')) {
        violations.push(`GET ${path} appears to modify state`);
      }
      
      // POST to collection should create
      if (path.match(/^\/\w+$/) && pathObj.post && !pathObj.post.responses?.['201']) {
        violations.push(`POST ${path} should return 201 for resource creation`);
      }
    });
    
    // Check for API versioning
    const hasVersioning = paths.some(p => /\/v\d+\//.test(p)) || 
                         spec.info?.version;
    if (hasVersioning) {
      follows.push('Implements API versioning');
    } else {
      violations.push('No API versioning detected');
    }
    
    // Check for error responses
    let hasErrorResponses = false;
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.responses?.['400'] || op.responses?.['404'] || op.responses?.['500']) {
          hasErrorResponses = true;
        }
      });
    });
    if (hasErrorResponses) {
      follows.push('Includes error response definitions');
    } else {
      violations.push('Missing error response definitions');
    }
    
    return { follows, violations };
  }
}