/**
 * gRPC API Pattern Library
 * Comprehensive patterns for identifying gRPC/REST transcoded APIs
 */

import { Pattern } from './rest-patterns';

export class GRPCPatterns {
  static readonly patterns: Pattern[] = [
    {
      id: 'grpc.custom_methods',
      name: 'Custom Method Patterns',
      description: 'Uses :verb suffix pattern like /resource:action',
      weight: 1.0,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.some(p => /:\w+$/.test(p));
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.filter(p => /:\w+$/.test(p)).slice(0, 5);
      }
    },
    
    {
      id: 'grpc.google_api_style',
      name: 'Google API Style',
      description: 'Follows Google API design patterns',
      weight: 0.9,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const standardMethods = [':get', ':list', ':create', ':update', ':delete', ':custom'];
        
        return paths.some(p => 
          standardMethods.some(method => p.endsWith(method))
        );
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const standardMethods = [':get', ':list', ':create', ':update', ':delete'];
        const matches = paths.filter(p => 
          standardMethods.some(method => p.endsWith(method))
        );
        
        return matches.slice(0, 3);
      }
    },
    
    {
      id: 'grpc.service_naming',
      name: 'Service-Based Naming',
      description: 'Service.Method naming convention',
      weight: 0.85,
      detector: (spec) => {
        const hasServiceNaming = Object.values(spec.paths || {}).some((path: any) => {
          return Object.values(path).some((op: any) => 
            op.operationId && op.operationId.includes('.')
          );
        });
        
        return hasServiceNaming;
      },
      evidence: (spec) => {
        const operations: string[] = [];
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.operationId && op.operationId.includes('.')) {
              operations.push(op.operationId);
            }
          });
        });
        
        return operations.slice(0, 3);
      }
    },
    
    {
      id: 'grpc.protobuf_refs',
      name: 'Protocol Buffer References',
      description: 'References to protobuf or gRPC',
      weight: 0.9,
      detector: (spec) => {
        const specString = JSON.stringify(spec).toLowerCase();
        return specString.includes('protobuf') || 
               specString.includes('grpc') ||
               specString.includes('proto3') ||
               specString.includes('.proto');
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        const specString = JSON.stringify(spec).toLowerCase();
        
        if (specString.includes('protobuf')) evidence.push('Protobuf references found');
        if (specString.includes('grpc')) evidence.push('gRPC references found');
        if (specString.includes('.proto')) evidence.push('.proto file references');
        
        return evidence;
      }
    },
    
    {
      id: 'grpc.field_mask',
      name: 'Field Mask Support',
      description: 'Uses field masks for partial responses',
      weight: 0.7,
      detector: (spec) => {
        let hasFieldMask = false;
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.parameters) {
              op.parameters.forEach((param: any) => {
                if (param.name === 'field_mask' || param.name === 'fieldMask') {
                  hasFieldMask = true;
                }
              });
            }
          });
        });
        
        return hasFieldMask;
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.parameters) {
              op.parameters.forEach((param: any) => {
                if (param.name === 'field_mask' || param.name === 'fieldMask') {
                  evidence.push('Field mask parameter for partial responses');
                }
              });
            }
          });
        });
        
        return evidence;
      }
    },
    
    {
      id: 'grpc.streaming',
      name: 'Streaming Patterns',
      description: 'Server-streaming or bidirectional streaming',
      weight: 0.8,
      detector: (spec) => {
        const specString = JSON.stringify(spec).toLowerCase();
        return specString.includes('stream') || 
               specString.includes('server-sent') ||
               specString.includes('bidirectional');
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        const specString = JSON.stringify(spec).toLowerCase();
        
        if (specString.includes('stream')) {
          const streamCount = (specString.match(/stream/g) || []).length;
          evidence.push(`${streamCount} streaming references`);
        }
        
        return evidence;
      }
    },
    
    {
      id: 'grpc.resource_name',
      name: 'Resource Name Pattern',
      description: 'Uses full resource names like projects/*/locations/*',
      weight: 0.75,
      detector: (spec) => {
        const paths = Object.keys(spec.paths || {});
        return paths.some(p => 
          /\/(projects|organizations|folders|locations)\/\{[^}]+\}/.test(p)
        );
      },
      evidence: (spec) => {
        const paths = Object.keys(spec.paths || {});
        const resourcePaths = paths.filter(p => 
          /\/(projects|organizations|folders|locations)\/\{[^}]+\}/.test(p)
        );
        
        return resourcePaths.slice(0, 3);
      }
    },
    
    {
      id: 'grpc.long_running',
      name: 'Long-Running Operations',
      description: 'Operations that return operation IDs',
      weight: 0.6,
      detector: (spec) => {
        const hasOperations = Object.keys(spec.paths || {}).some(p => 
          p.includes('/operations')
        );
        
        if (hasOperations) return true;
        
        // Check for operation responses
        let hasOperationResponse = false;
        Object.values(spec.paths || {}).forEach((path: any) => {
          Object.values(path).forEach((op: any) => {
            if (op.responses?.['200']?.content?.['application/json']?.schema) {
              const schema = op.responses['200'].content['application/json'].schema;
              if (schema.properties?.name && schema.properties?.done) {
                hasOperationResponse = true;
              }
            }
          });
        });
        
        return hasOperationResponse;
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        
        const operationPaths = Object.keys(spec.paths || {}).filter(p => 
          p.includes('/operations')
        );
        
        if (operationPaths.length > 0) {
          evidence.push(`Operation paths: ${operationPaths[0]}`);
        }
        
        return evidence;
      }
    },
    
    {
      id: 'grpc.error_model',
      name: 'gRPC Error Model',
      description: 'Uses gRPC status codes and error details',
      weight: 0.65,
      detector: (spec) => {
        const specString = JSON.stringify(spec);
        const grpcCodes = ['CANCELLED', 'UNKNOWN', 'INVALID_ARGUMENT', 
                          'DEADLINE_EXCEEDED', 'NOT_FOUND', 'ALREADY_EXISTS',
                          'PERMISSION_DENIED', 'UNAUTHENTICATED', 'RESOURCE_EXHAUSTED',
                          'FAILED_PRECONDITION', 'ABORTED', 'OUT_OF_RANGE',
                          'UNIMPLEMENTED', 'INTERNAL', 'UNAVAILABLE', 'DATA_LOSS'];
        
        return grpcCodes.some(code => specString.includes(code));
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        const specString = JSON.stringify(spec);
        const grpcCodes = ['INVALID_ARGUMENT', 'NOT_FOUND', 'PERMISSION_DENIED'];
        
        const found = grpcCodes.filter(code => specString.includes(code));
        if (found.length > 0) {
          evidence.push(`gRPC status codes: ${found.join(', ')}`);
        }
        
        return evidence;
      }
    },
    
    {
      id: 'grpc.transcoding',
      name: 'HTTP Transcoding',
      description: 'gRPC-JSON transcoding annotations',
      weight: 0.7,
      detector: (spec) => {
        const specString = JSON.stringify(spec);
        return specString.includes('google.api.http') ||
               specString.includes('additional_bindings') ||
               specString.includes('response_body') ||
               specString.includes('body: "*"');
      },
      evidence: (spec) => {
        const evidence: string[] = [];
        const specString = JSON.stringify(spec);
        
        if (specString.includes('google.api.http')) {
          evidence.push('google.api.http annotations');
        }
        if (specString.includes('additional_bindings')) {
          evidence.push('Additional HTTP bindings');
        }
        
        return evidence;
      }
    }
  ];

  /**
   * Calculate gRPC confidence score
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
   * Check gRPC-specific best practices
   */
  static checkBestPractices(spec: any): {
    follows: string[];
    violations: string[];
    recommendations: string[];
  } {
    const follows: string[] = [];
    const violations: string[] = [];
    const recommendations: string[] = [];
    
    // Check for custom methods
    const paths = Object.keys(spec.paths || {});
    const hasCustomMethods = paths.some(p => /:\w+$/.test(p));
    if (hasCustomMethods) {
      follows.push('Uses gRPC custom method pattern');
    }
    
    // Check for service grouping
    const services = new Set<string>();
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.operationId && op.operationId.includes('.')) {
          const service = op.operationId.split('.')[0];
          services.add(service);
        }
      });
    });
    
    if (services.size > 0) {
      follows.push(`Organized into ${services.size} service(s)`);
    }
    
    // Check for field masks
    let hasFieldMask = false;
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.parameters) {
          op.parameters.forEach((param: any) => {
            if (param.name === 'field_mask' || param.name === 'fieldMask') {
              hasFieldMask = true;
            }
          });
        }
      });
    });
    
    if (hasFieldMask) {
      follows.push('Supports field masks for partial responses');
    } else {
      recommendations.push('Consider adding field mask support for efficiency');
    }
    
    // Check for pagination
    let hasPagination = false;
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.parameters) {
          op.parameters.forEach((param: any) => {
            if (param.name === 'page_size' || param.name === 'page_token') {
              hasPagination = true;
            }
          });
        }
      });
    });
    
    if (hasPagination) {
      follows.push('Implements standard pagination');
    } else if (paths.some(p => p.includes(':list'))) {
      violations.push('List operations should support pagination');
    }
    
    // Check for proper error handling
    const specString = JSON.stringify(spec);
    if (!specString.includes('INVALID_ARGUMENT') && 
        !specString.includes('NOT_FOUND')) {
      recommendations.push('Use standard gRPC status codes for errors');
    }
    
    return { follows, violations, recommendations };
  }
}