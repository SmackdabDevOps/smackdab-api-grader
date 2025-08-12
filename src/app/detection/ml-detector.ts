/**
 * ML-Based API Detection Pipeline
 * Uses feature extraction and pattern scoring for high-accuracy API type detection
 */

export interface Feature {
  name: string;
  value: number;
  confidence: number;
  evidence: string[];
}

export interface FeatureVector {
  features: Map<string, Feature>;
  normalizedVector: number[];
  metadata: {
    totalEndpoints: number;
    totalOperations: number;
    schemaComplexity: number;
    securitySchemes: string[];
  };
}

export interface MLDetectionResult {
  primaryType: string;
  confidence: number;
  scores: Map<string, number>;
  features: FeatureVector;
  reasoning: {
    strongIndicators: string[];
    weakIndicators: string[];
    conflictingSignals: string[];
  };
  hybridAnalysis?: {
    isHybrid: boolean;
    components: Array<{ type: string; weight: number }>;
  };
}

export class MLDetector {
  // Feature weights learned from "training data" (expert-labeled APIs)
  private readonly FEATURE_WEIGHTS = {
    // REST features
    'rest.resource_paths': 0.8,
    'rest.crud_operations': 0.9,
    'rest.path_parameters': 0.7,
    'rest.query_parameters': 0.6,
    'rest.standard_statuses': 0.7,
    'rest.hypermedia': 0.5,
    
    // GraphQL features
    'graphql.single_endpoint': 0.95,
    'graphql.post_only': 0.9,
    'graphql.query_mutation_terms': 0.85,
    'graphql.introspection': 0.8,
    'graphql.schema_language': 0.9,
    'graphql.nested_types': 0.7,
    
    // gRPC features
    'grpc.service_methods': 0.9,
    'grpc.streaming_patterns': 0.85,
    'grpc.protobuf_refs': 0.9,
    'grpc.custom_verbs': 0.8,
    'grpc.field_masks': 0.7,
    
    // Microservice features
    'micro.health_endpoints': 0.85,
    'micro.service_mesh_headers': 0.9,
    'micro.distributed_tracing': 0.85,
    'micro.circuit_breaker': 0.7,
    'micro.event_sourcing': 0.6,
    'micro.bounded_context': 0.8,
    
    // Enterprise SaaS features
    'saas.multi_tenant': 0.95,
    'saas.subscription_endpoints': 0.8,
    'saas.admin_apis': 0.85,
    'saas.audit_logging': 0.7,
    'saas.rbac_scopes': 0.9,
    'saas.api_versioning': 0.6,
    
    // WebSocket/Streaming features
    'stream.websocket_upgrade': 0.9,
    'stream.sse_endpoints': 0.85,
    'stream.long_polling': 0.6,
    'stream.event_types': 0.7,
    
    // Generic features
    'generic.documentation_quality': 0.3,
    'generic.error_handling': 0.4,
    'generic.pagination': 0.5,
    'generic.rate_limiting': 0.4
  };

  /**
   * Detect API type using ML-based feature extraction
   */
  detect(spec: any): MLDetectionResult {
    // Step 1: Extract feature vector
    const features = this.extractFeatures(spec);
    
    // Step 2: Score each API type
    const scores = this.scoreApiTypes(features);
    
    // Step 3: Determine primary type and confidence
    const { primaryType, confidence } = this.selectPrimaryType(scores);
    
    // Step 4: Analyze for hybrid patterns
    const hybridAnalysis = this.analyzeHybridPatterns(scores);
    
    // Step 5: Generate reasoning
    const reasoning = this.generateReasoning(features, primaryType);
    
    return {
      primaryType,
      confidence,
      scores,
      features,
      reasoning,
      hybridAnalysis
    };
  }

  /**
   * Extract comprehensive feature vector from OpenAPI spec
   */
  private extractFeatures(spec: any): FeatureVector {
    const features = new Map<string, Feature>();
    const metadata = this.extractMetadata(spec);
    
    // REST features
    this.extractRestFeatures(spec, features);
    
    // GraphQL features
    this.extractGraphQLFeatures(spec, features);
    
    // gRPC features
    this.extractGRPCFeatures(spec, features);
    
    // Microservice features
    this.extractMicroserviceFeatures(spec, features);
    
    // SaaS features
    this.extractSaaSFeatures(spec, features);
    
    // Streaming features
    this.extractStreamingFeatures(spec, features);
    
    // Generic features
    this.extractGenericFeatures(spec, features);
    
    // Normalize to vector
    const normalizedVector = this.normalizeFeatures(features);
    
    return {
      features,
      normalizedVector,
      metadata
    };
  }

  /**
   * Extract REST-specific features
   */
  private extractRestFeatures(spec: any, features: Map<string, Feature>) {
    const paths = Object.keys(spec.paths || {});
    
    // Resource-based paths (/users, /users/{id})
    const resourcePaths = paths.filter(p => 
      /^\/\w+(\/{[\w]+})?$/.test(p) || /^\/api\/v\d+\/\w+/.test(p)
    );
    features.set('rest.resource_paths', {
      name: 'REST Resource Paths',
      value: resourcePaths.length / Math.max(paths.length, 1),
      confidence: 0.9,
      evidence: resourcePaths.slice(0, 3)
    });
    
    // CRUD operations
    const methods = new Set<string>();
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.keys(path).forEach(method => {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          methods.add(method);
        }
      });
    });
    features.set('rest.crud_operations', {
      name: 'CRUD Operations',
      value: methods.size / 5, // Out of 5 standard methods
      confidence: 0.95,
      evidence: Array.from(methods)
    });
    
    // Path parameters
    const pathParams = paths.filter(p => p.includes('{') && p.includes('}'));
    features.set('rest.path_parameters', {
      name: 'Path Parameters',
      value: pathParams.length / Math.max(paths.length, 1),
      confidence: 0.8,
      evidence: pathParams.slice(0, 3)
    });
    
    // Standard HTTP status codes
    let standardStatuses = 0;
    let totalResponses = 0;
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.responses) {
          Object.keys(op.responses).forEach(status => {
            totalResponses++;
            if (['200', '201', '204', '400', '401', '403', '404', '500'].includes(status)) {
              standardStatuses++;
            }
          });
        }
      });
    });
    features.set('rest.standard_statuses', {
      name: 'Standard HTTP Statuses',
      value: totalResponses > 0 ? standardStatuses / totalResponses : 0,
      confidence: 0.7,
      evidence: [`${standardStatuses}/${totalResponses} standard statuses`]
    });
  }

  /**
   * Extract GraphQL-specific features
   */
  private extractGraphQLFeatures(spec: any, features: Map<string, Feature>) {
    const paths = Object.keys(spec.paths || {});
    
    // Single /graphql endpoint
    const graphqlEndpoint = paths.find(p => 
      p.toLowerCase().includes('graphql') || p.toLowerCase().includes('gql')
    );
    features.set('graphql.single_endpoint', {
      name: 'GraphQL Endpoint',
      value: graphqlEndpoint ? 1 : 0,
      confidence: 0.95,
      evidence: graphqlEndpoint ? [graphqlEndpoint] : []
    });
    
    // POST-only operations
    if (graphqlEndpoint && spec.paths[graphqlEndpoint]) {
      const methods = Object.keys(spec.paths[graphqlEndpoint]);
      const postOnly = methods.length === 1 && methods[0] === 'post';
      features.set('graphql.post_only', {
        name: 'POST-only Endpoint',
        value: postOnly ? 1 : 0,
        confidence: 0.9,
        evidence: postOnly ? ['Single POST method'] : []
      });
    }
    
    // GraphQL terminology in descriptions
    const graphqlTerms = ['query', 'mutation', 'subscription', 'resolver', 'schema', 'introspection'];
    let termCount = 0;
    const searchText = JSON.stringify(spec).toLowerCase();
    graphqlTerms.forEach(term => {
      if (searchText.includes(term)) termCount++;
    });
    features.set('graphql.query_mutation_terms', {
      name: 'GraphQL Terminology',
      value: termCount / graphqlTerms.length,
      confidence: 0.7,
      evidence: [`Found ${termCount}/${graphqlTerms.length} GraphQL terms`]
    });
  }

  /**
   * Extract gRPC-specific features
   */
  private extractGRPCFeatures(spec: any, features: Map<string, Feature>) {
    const paths = Object.keys(spec.paths || {});
    
    // Custom verb patterns (:verb)
    const customVerbs = paths.filter(p => /:\w+$/.test(p));
    features.set('grpc.custom_verbs', {
      name: 'gRPC Custom Verbs',
      value: customVerbs.length / Math.max(paths.length, 1),
      confidence: 0.85,
      evidence: customVerbs.slice(0, 3)
    });
    
    // Protobuf references
    const protobufRefs = JSON.stringify(spec).match(/proto|protobuf|grpc/gi) || [];
    features.set('grpc.protobuf_refs', {
      name: 'Protobuf References',
      value: Math.min(protobufRefs.length / 10, 1), // Normalize to 0-1
      confidence: 0.8,
      evidence: [`${protobufRefs.length} protobuf/gRPC references`]
    });
    
    // Streaming patterns
    const streamingTerms = ['stream', 'server-sent', 'bidirectional'];
    const streamingCount = streamingTerms.filter(term => 
      JSON.stringify(spec).toLowerCase().includes(term)
    ).length;
    features.set('grpc.streaming_patterns', {
      name: 'Streaming Patterns',
      value: streamingCount / streamingTerms.length,
      confidence: 0.7,
      evidence: [`${streamingCount} streaming indicators`]
    });
  }

  /**
   * Extract Microservice-specific features
   */
  private extractMicroserviceFeatures(spec: any, features: Map<string, Feature>) {
    const paths = Object.keys(spec.paths || {});
    
    // Health check endpoints
    const healthEndpoints = paths.filter(p => 
      /health|ready|alive|liveness|readiness|status|ping/.test(p.toLowerCase())
    );
    features.set('micro.health_endpoints', {
      name: 'Health Check Endpoints',
      value: healthEndpoints.length > 0 ? 1 : 0,
      confidence: 0.9,
      evidence: healthEndpoints
    });
    
    // Service mesh headers
    const meshHeaders = [
      'X-Request-ID', 'X-B3-TraceId', 'X-B3-SpanId', 
      'X-Correlation-ID', 'X-Forwarded-For', 'X-Cloud-Trace'
    ];
    let meshHeaderCount = 0;
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.parameters) {
          op.parameters.forEach((param: any) => {
            if (param.in === 'header' && meshHeaders.some(h => 
              param.name.toLowerCase() === h.toLowerCase()
            )) {
              meshHeaderCount++;
            }
          });
        }
      });
    });
    features.set('micro.service_mesh_headers', {
      name: 'Service Mesh Headers',
      value: Math.min(meshHeaderCount / 3, 1), // Normalize
      confidence: 0.85,
      evidence: [`${meshHeaderCount} mesh headers found`]
    });
    
    // Bounded context (service-specific paths)
    const servicePrefixes = new Set<string>();
    paths.forEach(p => {
      const match = p.match(/^\/([a-z-]+)\//);
      if (match) servicePrefixes.add(match[1]);
    });
    features.set('micro.bounded_context', {
      name: 'Bounded Context',
      value: servicePrefixes.size === 1 ? 1 : servicePrefixes.size > 1 ? 0.5 : 0,
      confidence: 0.7,
      evidence: Array.from(servicePrefixes)
    });
  }

  /**
   * Extract SaaS-specific features
   */
  private extractSaaSFeatures(spec: any, features: Map<string, Feature>) {
    // Multi-tenant headers
    const tenantHeaders = ['X-Organization-ID', 'X-Tenant-ID', 'X-Company-ID', 'X-Account-ID'];
    let tenantHeaderFound = false;
    
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.parameters) {
          op.parameters.forEach((param: any) => {
            if (param.in === 'header' && tenantHeaders.some(h => 
              param.name.toLowerCase() === h.toLowerCase()
            )) {
              tenantHeaderFound = true;
            }
          });
        }
      });
    });
    
    // Check components.parameters too
    if (spec.components?.parameters) {
      Object.values(spec.components.parameters).forEach((param: any) => {
        if (param.in === 'header' && tenantHeaders.some(h => 
          param.name.toLowerCase() === h.toLowerCase()
        )) {
          tenantHeaderFound = true;
        }
      });
    }
    
    features.set('saas.multi_tenant', {
      name: 'Multi-tenant Headers',
      value: tenantHeaderFound ? 1 : 0,
      confidence: 0.95,
      evidence: tenantHeaderFound ? ['Multi-tenant headers required'] : []
    });
    
    // Admin endpoints
    const adminPaths = Object.keys(spec.paths || {}).filter(p => 
      /admin|management|system|organization/.test(p.toLowerCase())
    );
    features.set('saas.admin_apis', {
      name: 'Admin APIs',
      value: adminPaths.length > 0 ? 1 : 0,
      confidence: 0.8,
      evidence: adminPaths.slice(0, 3)
    });
    
    // RBAC scopes in security
    let rbacScopes = false;
    if (spec.components?.securitySchemes) {
      Object.values(spec.components.securitySchemes).forEach((scheme: any) => {
        if (scheme.flows) {
          Object.values(scheme.flows).forEach((flow: any) => {
            if (flow.scopes) {
              const scopeKeys = Object.keys(flow.scopes);
              if (scopeKeys.some(s => /admin:|write:|delete:|read:/.test(s))) {
                rbacScopes = true;
              }
            }
          });
        }
      });
    }
    features.set('saas.rbac_scopes', {
      name: 'RBAC Scopes',
      value: rbacScopes ? 1 : 0,
      confidence: 0.85,
      evidence: rbacScopes ? ['Role-based OAuth scopes'] : []
    });
    
    // Subscription/billing endpoints
    const billingPaths = Object.keys(spec.paths || {}).filter(p => 
      /billing|subscription|invoice|payment|plan|tier/.test(p.toLowerCase())
    );
    features.set('saas.subscription_endpoints', {
      name: 'Subscription Endpoints',
      value: billingPaths.length > 0 ? 1 : 0,
      confidence: 0.75,
      evidence: billingPaths.slice(0, 3)
    });
  }

  /**
   * Extract Streaming/WebSocket features
   */
  private extractStreamingFeatures(spec: any, features: Map<string, Feature>) {
    const paths = Object.keys(spec.paths || {});
    
    // WebSocket upgrade paths
    const wsPaths = paths.filter(p => /ws|websocket|socket/.test(p.toLowerCase()));
    features.set('stream.websocket_upgrade', {
      name: 'WebSocket Paths',
      value: wsPaths.length > 0 ? 1 : 0,
      confidence: 0.9,
      evidence: wsPaths
    });
    
    // SSE endpoints
    const ssePaths = paths.filter(p => /events|stream|sse/.test(p.toLowerCase()));
    features.set('stream.sse_endpoints', {
      name: 'SSE Endpoints',
      value: ssePaths.length > 0 ? 1 : 0,
      confidence: 0.8,
      evidence: ssePaths
    });
  }

  /**
   * Extract generic quality features
   */
  private extractGenericFeatures(spec: any, features: Map<string, Feature>) {
    // Documentation quality
    let docCount = 0;
    let totalOperations = 0;
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        totalOperations++;
        if (op.description || op.summary) docCount++;
      });
    });
    features.set('generic.documentation_quality', {
      name: 'Documentation Quality',
      value: totalOperations > 0 ? docCount / totalOperations : 0,
      confidence: 0.6,
      evidence: [`${docCount}/${totalOperations} documented operations`]
    });
    
    // Error handling
    let errorHandling = 0;
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.responses) {
          const errorCodes = Object.keys(op.responses).filter(code => 
            parseInt(code) >= 400
          );
          if (errorCodes.length > 0) errorHandling++;
        }
      });
    });
    features.set('generic.error_handling', {
      name: 'Error Handling',
      value: totalOperations > 0 ? errorHandling / totalOperations : 0,
      confidence: 0.7,
      evidence: [`${errorHandling}/${totalOperations} ops with error responses`]
    });
    
    // Pagination patterns
    const paginationParams = ['page', 'limit', 'offset', 'cursor', 'per_page', 'page_size'];
    let paginationFound = false;
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (op.parameters) {
          op.parameters.forEach((param: any) => {
            if (paginationParams.includes(param.name.toLowerCase())) {
              paginationFound = true;
            }
          });
        }
      });
    });
    features.set('generic.pagination', {
      name: 'Pagination Support',
      value: paginationFound ? 1 : 0,
      confidence: 0.6,
      evidence: paginationFound ? ['Pagination parameters found'] : []
    });
  }

  /**
   * Extract metadata about the API
   */
  private extractMetadata(spec: any): any {
    const paths = Object.keys(spec.paths || {});
    let totalOperations = 0;
    let schemaCount = 0;
    let securitySchemes: string[] = [];
    
    Object.values(spec.paths || {}).forEach((path: any) => {
      totalOperations += Object.keys(path).filter(k => k !== 'parameters').length;
    });
    
    if (spec.components?.schemas) {
      schemaCount = Object.keys(spec.components.schemas).length;
    }
    
    if (spec.components?.securitySchemes) {
      securitySchemes = Object.keys(spec.components.securitySchemes);
    }
    
    return {
      totalEndpoints: paths.length,
      totalOperations,
      schemaComplexity: schemaCount,
      securitySchemes
    };
  }

  /**
   * Normalize features to a vector
   */
  private normalizeFeatures(features: Map<string, Feature>): number[] {
    const vector: number[] = [];
    
    // Use predefined feature order for consistent vectors
    Object.keys(this.FEATURE_WEIGHTS).forEach(featureKey => {
      const feature = features.get(featureKey);
      if (feature) {
        vector.push(feature.value * feature.confidence);
      } else {
        vector.push(0);
      }
    });
    
    return vector;
  }

  /**
   * Score each API type based on features
   */
  private scoreApiTypes(features: FeatureVector): Map<string, number> {
    const scores = new Map<string, number>();
    
    // Calculate REST score
    let restScore = 0;
    let restWeight = 0;
    features.features.forEach((feature, key) => {
      if (key.startsWith('rest.')) {
        const weight = this.FEATURE_WEIGHTS[key] || 0.5;
        restScore += feature.value * feature.confidence * weight;
        restWeight += weight;
      }
    });
    scores.set('REST', restWeight > 0 ? (restScore / restWeight) * 100 : 0);
    
    // Calculate GraphQL score
    let graphqlScore = 0;
    let graphqlWeight = 0;
    features.features.forEach((feature, key) => {
      if (key.startsWith('graphql.')) {
        const weight = this.FEATURE_WEIGHTS[key] || 0.5;
        graphqlScore += feature.value * feature.confidence * weight;
        graphqlWeight += weight;
      }
    });
    scores.set('GraphQL', graphqlWeight > 0 ? (graphqlScore / graphqlWeight) * 100 : 0);
    
    // Calculate gRPC score
    let grpcScore = 0;
    let grpcWeight = 0;
    features.features.forEach((feature, key) => {
      if (key.startsWith('grpc.')) {
        const weight = this.FEATURE_WEIGHTS[key] || 0.5;
        grpcScore += feature.value * feature.confidence * weight;
        grpcWeight += weight;
      }
    });
    scores.set('gRPC', grpcWeight > 0 ? (grpcScore / grpcWeight) * 100 : 0);
    
    // Calculate Microservice score
    let microScore = 0;
    let microWeight = 0;
    features.features.forEach((feature, key) => {
      if (key.startsWith('micro.')) {
        const weight = this.FEATURE_WEIGHTS[key] || 0.5;
        microScore += feature.value * feature.confidence * weight;
        microWeight += weight;
      }
    });
    scores.set('Microservice', microWeight > 0 ? (microScore / microWeight) * 100 : 0);
    
    // Calculate SaaS score
    let saasScore = 0;
    let saasWeight = 0;
    features.features.forEach((feature, key) => {
      if (key.startsWith('saas.')) {
        const weight = this.FEATURE_WEIGHTS[key] || 0.5;
        saasScore += feature.value * feature.confidence * weight;
        saasWeight += weight;
      }
    });
    scores.set('SaaS', saasWeight > 0 ? (saasScore / saasWeight) * 100 : 0);
    
    return scores;
  }

  /**
   * Select primary API type and calculate confidence
   */
  private selectPrimaryType(scores: Map<string, number>): { primaryType: string; confidence: number } {
    let maxScore = 0;
    let primaryType = 'REST'; // Default fallback
    let secondMaxScore = 0;
    
    scores.forEach((score, type) => {
      if (score > maxScore) {
        secondMaxScore = maxScore;
        maxScore = score;
        primaryType = type;
      } else if (score > secondMaxScore) {
        secondMaxScore = score;
      }
    });
    
    // Calculate confidence based on score separation
    let confidence = maxScore / 100;
    
    // Boost confidence if there's clear separation
    const separation = maxScore - secondMaxScore;
    if (separation > 30) {
      confidence = Math.min(0.95, confidence * 1.1);
    } else if (separation < 10) {
      confidence = Math.max(0.5, confidence * 0.8);
    }
    
    // Minimum threshold
    if (maxScore < 20) {
      confidence = Math.min(0.4, confidence);
    }
    
    return {
      primaryType,
      confidence: Math.round(confidence * 100) / 100
    };
  }

  /**
   * Analyze for hybrid API patterns
   */
  private analyzeHybridPatterns(scores: Map<string, number>): any {
    const significantTypes: Array<{ type: string; weight: number }> = [];
    let totalWeight = 0;
    
    scores.forEach((score, type) => {
      if (score > 30) { // Threshold for significance
        significantTypes.push({ type, weight: score });
        totalWeight += score;
      }
    });
    
    // Normalize weights
    if (totalWeight > 0) {
      significantTypes.forEach(t => {
        t.weight = Math.round((t.weight / totalWeight) * 100) / 100;
      });
    }
    
    const isHybrid = significantTypes.length > 1 && 
                     significantTypes[0].weight < 0.7; // No dominant type
    
    return {
      isHybrid,
      components: significantTypes.sort((a, b) => b.weight - a.weight)
    };
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoning(features: FeatureVector, primaryType: string): any {
    const strongIndicators: string[] = [];
    const weakIndicators: string[] = [];
    const conflictingSignals: string[] = [];
    
    // Find strong indicators for primary type
    features.features.forEach((feature, key) => {
      const typePrefix = this.getTypePrefix(primaryType);
      if (key.startsWith(typePrefix)) {
        if (feature.value > 0.8 && feature.confidence > 0.8) {
          strongIndicators.push(...feature.evidence);
        } else if (feature.value > 0.5) {
          weakIndicators.push(...feature.evidence);
        }
      } else {
        // Check for conflicting strong signals from other types
        if (feature.value > 0.8 && feature.confidence > 0.8) {
          const conflictType = this.getTypeFromPrefix(key.split('.')[0]);
          if (conflictType && conflictType !== primaryType) {
            conflictingSignals.push(`${conflictType}: ${feature.evidence[0]}`);
          }
        }
      }
    });
    
    return {
      strongIndicators: strongIndicators.slice(0, 5),
      weakIndicators: weakIndicators.slice(0, 3),
      conflictingSignals: conflictingSignals.slice(0, 3)
    };
  }

  /**
   * Get feature prefix for API type
   */
  private getTypePrefix(type: string): string {
    const prefixMap: Record<string, string> = {
      'REST': 'rest',
      'GraphQL': 'graphql',
      'gRPC': 'grpc',
      'Microservice': 'micro',
      'SaaS': 'saas'
    };
    return prefixMap[type] || 'generic';
  }

  /**
   * Get API type from feature prefix
   */
  private getTypeFromPrefix(prefix: string): string | null {
    const typeMap: Record<string, string> = {
      'rest': 'REST',
      'graphql': 'GraphQL',
      'grpc': 'gRPC',
      'micro': 'Microservice',
      'saas': 'SaaS'
    };
    return typeMap[prefix] || null;
  }

  /**
   * Validate detection result
   */
  validateDetection(result: MLDetectionResult): boolean {
    // Ensure minimum confidence for auto-selection
    if (result.confidence < 0.5) {
      return false;
    }
    
    // Check for reasonable feature evidence
    const hasEvidence = result.reasoning.strongIndicators.length > 0 ||
                        result.reasoning.weakIndicators.length > 1;
    
    return hasEvidence;
  }

  /**
   * Get detection explanation for user
   */
  explainDetection(result: MLDetectionResult): string {
    const lines: string[] = [
      `Detected API Type: ${result.primaryType}`,
      `Confidence: ${Math.round(result.confidence * 100)}%`,
      ''
    ];
    
    if (result.reasoning.strongIndicators.length > 0) {
      lines.push('Strong Indicators:');
      result.reasoning.strongIndicators.forEach(ind => {
        lines.push(`  • ${ind}`);
      });
      lines.push('');
    }
    
    if (result.reasoning.weakIndicators.length > 0) {
      lines.push('Supporting Evidence:');
      result.reasoning.weakIndicators.forEach(ind => {
        lines.push(`  • ${ind}`);
      });
      lines.push('');
    }
    
    if (result.hybridAnalysis?.isHybrid) {
      lines.push('Hybrid API Detected:');
      result.hybridAnalysis.components.forEach(comp => {
        lines.push(`  • ${comp.type}: ${Math.round(comp.weight * 100)}%`);
      });
      lines.push('');
    }
    
    if (result.reasoning.conflictingSignals.length > 0) {
      lines.push('Note: Some patterns from other API types were detected:');
      result.reasoning.conflictingSignals.forEach(sig => {
        lines.push(`  • ${sig}`);
      });
    }
    
    return lines.join('\n');
  }
}