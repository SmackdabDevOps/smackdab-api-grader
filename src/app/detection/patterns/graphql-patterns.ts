/**
 * GraphQL API Pattern Library
 * Comprehensive patterns for identifying GraphQL APIs
 */

import { Pattern } from './rest-patterns';

export class GraphQLPatterns {
  static readonly patterns: Pattern[] = [
    {
      id: 'graphql.single_endpoint',
      name: 'Single GraphQL Endpoint',
      description: 'Single /graphql or /gql endpoint',
      weight: 1.0,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.length === 1 && 
               paths.some(p => /graphql|gql/i.test(p));
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.filter(p => /graphql|gql/i.test(p));
      }
    },
    
    {
      id: 'graphql.post_only',
      name: 'POST-Only Operations',
      description: 'GraphQL endpoint only accepts POST',
      weight: 0.95,
      detector: (spec) => {
        const graphqlPath = Object.keys(spec.paths || {})
          .find(p => /graphql|gql/i.test(p));
        
        if (!graphqlPath || !spec.paths[graphqlPath]) return false;
        
        const methods = Object.keys(spec.paths[graphqlPath])
          .filter(m => m !== 'parameters');
        
        return methods.length === 1 && methods[0] === 'post';
      },
      evidence: (spec) => {
        const graphqlPath = Object.keys(spec.paths || {})
          .find(p => /graphql|gql/i.test(p));
        
        if (!graphqlPath) return [];
        
        const methods = Object.keys(spec.paths[graphqlPath] || {});
        return [`${graphqlPath}: ${methods.join(', ')}`];
      }
    },
    
    {
      id: 'graphql.query_body',
      name: 'Query in Request Body',
      description: 'Request body contains query and variables',
      weight: 0.9,
      detector: (spec) => {
        let hasQueryBody = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          if (path.post?.requestBody?.content?.['application/json']?.schema) {
            const schema = path.post.requestBody.content['application/json'].schema;
            if (schema.properties?.query || 
                schema.properties?.operationName ||
                schema.properties?.variables) {
              hasQueryBody = true;
            }
          }
        });
        
        return hasQueryBody;
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          if (path.post?.requestBody?.content?.['application/json']?.schema) {
            const schema = path.post.requestBody.content['application/json'].schema;
            const props = Object.keys(schema.properties || {});
            if (props.includes('query')) {
              evidence.push(`Request body has: ${props.join(', ')}`);
            }
          }
        });
        
        return evidence;
      }
    },
    
    {
      id: 'graphql.response_structure',
      name: 'GraphQL Response Structure',
      description: 'Response has data and errors fields',
      weight: 0.85,
      detector: (spec) => {
        let hasGraphQLResponse = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.responses?.['200']?.content?.['application/json']?.schema) {
              const schema = op.responses['200'].content['application/json'].schema;
              if (schema.properties?.data && schema.properties?.errors) {
                hasGraphQLResponse = true;
              }
            }
          });
        });
        
        return hasGraphQLResponse;
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.responses?.['200']?.content?.['application/json']?.schema) {
              const schema = op.responses['200'].content['application/json'].schema;
              if (schema.properties?.data && schema.properties?.errors) {
                evidence.push('Response has data/errors structure');
              }
            }
          });
        });
        
        return evidence;
      }
    },
    
    {
      id: 'graphql.terminology',
      name: 'GraphQL Terminology',
      description: 'Uses GraphQL-specific terms',
      weight: 0.7,
      detector: (spec) => {
        const terms = ['query', 'mutation', 'subscription', 'schema', 'resolver', 'type', 'field'];
        const specString = JSON.stringify(spec).toLowerCase();
        
        let matchCount = 0;
        terms.forEach(term => {
          if (specString.includes(term)) matchCount++;
        });
        
        return matchCount >= 3;
      },
      evidence: (spec) => {
        const terms = ['query', 'mutation', 'subscription', 'schema', 'resolver'];
        const specString = JSON.stringify(spec).toLowerCase();
        const found = terms.filter(term => specString.includes(term));
        
        return found.length > 0 ? [`GraphQL terms: ${found.join(', ')}`] : [];
      }
    },
    
    {
      id: 'graphql.introspection',
      name: 'Introspection Support',
      description: 'Mentions introspection or __schema',
      weight: 0.8,
      detector: (spec) => {
        const specString = JSON.stringify(spec).toLowerCase();
        return specString.includes('introspection') || 
               specString.includes('__schema') ||
               specString.includes('__type');
      },
      evidence: (spec) => {
        const specString = JSON.stringify(spec).toLowerCase();
        const evidence: string[] = [];
        
        if (specString.includes('introspection')) {
          evidence.push('Introspection mentioned');
        }
        if (specString.includes('__schema')) {
          evidence.push('__schema query support');
        }
        
        return evidence;
      }
    },
    
    {
      id: 'graphql.no_rest_verbs',
      name: 'No REST Verbs',
      description: 'Lacks typical REST verb diversity',
      weight: 0.6,
      detector: (spec) => {
        const methods = new Set<string>();
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.keys(path).forEach(method => {
            if (method !== 'parameters') {
              methods.add(method);
            }
          });
        });
        
        // GraphQL typically only uses POST
        return methods.size <= 2;
      },
      evidence: (spec) => {
        const methods = new Set<string>();
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.keys(path).forEach(method => {
            if (method !== 'parameters') {
              methods.add(method);
            }
          });
        });
        
        return [`HTTP methods used: ${Array.from(methods).join(', ')}`];
      }
    },
    
    {
      id: 'graphql.type_system',
      name: 'Type System References',
      description: 'References to GraphQL type system',
      weight: 0.75,
      detector: (spec) => {
        const typeTerms = ['scalar', 'object type', 'interface', 'union', 'enum', 'input type'];
        const specString = JSON.stringify(spec).toLowerCase();
        
        return typeTerms.some(term => specString.includes(term));
      },
      evidence: (spec) => {
        const typeTerms = ['scalar', 'object type', 'interface', 'union', 'enum'];
        const specString = JSON.stringify(spec).toLowerCase();
        const found = typeTerms.filter(term => specString.includes(term));
        
        return found.length > 0 ? [`Type system: ${found.join(', ')}`] : [];
      }
    },
    
    {
      id: 'graphql.operation_name',
      name: 'Operation Name Support',
      description: 'Supports operationName for batching',
      weight: 0.6,
      detector: (spec) => {
        let hasOperationName = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          if (path.post?.requestBody?.content?.['application/json']?.schema) {
            const schema = path.post.requestBody.content['application/json'].schema;
            if (schema.properties?.operationName) {
              hasOperationName = true;
            }
          }
        });
        
        return hasOperationName;
      },
      evidence: (spec) => {
        let hasOperationName = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          if (path.post?.requestBody?.content?.['application/json']?.schema) {
            const schema = path.post.requestBody.content['application/json'].schema;
            if (schema.properties?.operationName) {
              hasOperationName = true;
            }
          }
        });
        
        return hasOperationName ? ['Supports operationName for query batching'] : [];
      }
    },
    
    {
      id: 'graphql.extensions',
      name: 'Extensions Field',
      description: 'Response includes extensions field',
      weight: 0.5,
      detector: (spec) => {
        let hasExtensions = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.responses?.['200']?.content?.['application/json']?.schema) {
              const schema = op.responses['200'].content['application/json'].schema;
              if (schema.properties?.extensions) {
                hasExtensions = true;
              }
            }
          });
        });
        
        return hasExtensions;
      },
      evidence: (spec) => {
        let hasExtensions = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.responses?.['200']?.content?.['application/json']?.schema) {
              const schema = op.responses['200'].content['application/json'].schema;
              if (schema.properties?.extensions) {
                hasExtensions = true;
              }
            }
          });
        });
        
        return hasExtensions ? ['Response includes extensions field'] : [];
      }
    }
  ];

  /**
   * Calculate GraphQL confidence score
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
   * Check GraphQL-specific concerns
   */
  static checkSpecificConcerns(spec: any): {
    concerns: string[];
    recommendations: string[];
  } {
    const concerns: string[] = [];
    const recommendations: string[] = [];
    
    // Check for introspection in production
    const specString = JSON.stringify(spec).toLowerCase();
    if (specString.includes('introspection') && !specString.includes('disable')) {
      concerns.push('Introspection appears to be enabled');
      recommendations.push('Disable introspection in production');
    }
    
    // Check for depth limiting
    if (!specString.includes('depth') && !specString.includes('complexity')) {
      concerns.push('No query depth/complexity limiting mentioned');
      recommendations.push('Implement query depth and complexity limits');
    }
    
    // Check for rate limiting
    if (!specString.includes('rate') && !specString.includes('throttle')) {
      concerns.push('No rate limiting mentioned');
      recommendations.push('Implement rate limiting to prevent abuse');
    }
    
    // Check for error handling
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.responses?.['200']?.content?.['application/json']?.schema) {
          const schema = op.responses['200'].content['application/json'].schema;
          if (!schema.properties?.errors) {
            concerns.push('Response schema missing errors field');
            recommendations.push('Include errors field in GraphQL response');
          }
        }
      });
    });
    
    // Check for batching controls
    if (specString.includes('operationname') || specString.includes('batching')) {
      recommendations.push('Ensure batch query limits are in place');
    }
    
    return { concerns, recommendations };
  }
}