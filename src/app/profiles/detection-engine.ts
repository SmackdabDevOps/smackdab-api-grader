/**
 * Profile Detection Engine
 * Analyzes OpenAPI specifications to determine the appropriate grading profile
 * This is the core of making the grader context-aware instead of rigid
 */

export interface DetectionSignal {
  type: string;
  weight: number;
  found: boolean;
  evidence: string[];
}

export interface ProfileScore {
  profile: string;
  score: number;
  signals: DetectionSignal[];
}

export interface DetectionResult {
  detectedProfile: string;
  confidence: number;
  reasoning: {
    matchedPatterns: string[];
    missingIndicators: string[];
    signalStrength: Record<string, number>;
  };
  alternatives: ProfileScore[];
}

export class ProfileDetectionEngine {
  /**
   * Analyze an OpenAPI spec to detect the API type/profile
   */
  detect(spec: any): DetectionResult {
    const profileScores: ProfileScore[] = [
      this.checkEnterpriseMultiTenant(spec),
      this.checkSimpleREST(spec),
      this.checkGraphQL(spec),
      this.checkMicroservice(spec),
      this.checkgRPC(spec),
    ];

    // Sort by score descending
    profileScores.sort((a, b) => b.score - a.score);

    const topProfile = profileScores[0];
    const confidence = this.calculateConfidence(topProfile, profileScores);

    return {
      detectedProfile: topProfile.profile,
      confidence,
      reasoning: this.buildReasoning(topProfile),
      alternatives: profileScores.slice(1, 3), // Top 3 alternatives
    };
  }

  /**
   * Check for Enterprise Multi-Tenant SaaS patterns (like Smackdab)
   */
  private checkEnterpriseMultiTenant(spec: any): ProfileScore {
    const signals: DetectionSignal[] = [];

    // Check for multi-tenant headers
    const hasOrgHeader = this.hasHeaderPattern(spec, /X-Organization-ID|X-Tenant-ID|X-Company-ID/i);
    signals.push({
      type: 'multi-tenant-headers',
      weight: 30,
      found: hasOrgHeader,
      evidence: hasOrgHeader ? ['Found organization/tenant headers'] : [],
    });

    // Check for admin endpoints
    const hasAdminEndpoints = this.hasPathPattern(spec, /\/admin\//);
    signals.push({
      type: 'admin-endpoints',
      weight: 20,
      found: hasAdminEndpoints,
      evidence: hasAdminEndpoints ? ['Found /admin/ endpoints'] : [],
    });

    // Check for RBAC patterns
    const hasRBACScopes = this.hasSecurityScopes(spec, /admin:|write:|delete:/);
    signals.push({
      type: 'rbac-scopes',
      weight: 20,
      found: hasRBACScopes,
      evidence: hasRBACScopes ? ['Found role-based OAuth scopes'] : [],
    });

    // Check for billing/subscription endpoints
    const hasBillingEndpoints = this.hasPathPattern(spec, /billing|subscription|invoice|payment/i);
    signals.push({
      type: 'billing-endpoints',
      weight: 15,
      found: hasBillingEndpoints,
      evidence: hasBillingEndpoints ? ['Found billing/subscription endpoints'] : [],
    });

    // Check for audit logging endpoints
    const hasAuditEndpoints = this.hasPathPattern(spec, /audit|history|changelog/i);
    signals.push({
      type: 'audit-endpoints',
      weight: 15,
      found: hasAuditEndpoints,
      evidence: hasAuditEndpoints ? ['Found audit/history endpoints'] : [],
    });

    const score = this.calculateScore(signals);
    return { profile: 'SaaS', score, signals };
  }

  /**
   * Check for Simple REST API patterns (no multi-tenancy)
   */
  private checkSimpleREST(spec: any): ProfileScore {
    const signals: DetectionSignal[] = [];

    // RESTful path patterns
    const hasRESTfulPaths = this.hasPathPattern(spec, /^\/api\/v?\d*\//);
    signals.push({
      type: 'restful-paths',
      weight: 25,
      found: hasRESTfulPaths,
      evidence: hasRESTfulPaths ? ['Found RESTful versioned paths'] : [],
    });

    // Standard REST verbs
    const hasStandardVerbs = this.hasStandardRESTVerbs(spec);
    signals.push({
      type: 'rest-verbs',
      weight: 30,
      found: hasStandardVerbs,
      evidence: hasStandardVerbs ? ['Uses GET, POST, PUT, DELETE'] : [],
    });

    // No multi-tenant headers
    const noMultiTenant = !this.hasHeaderPattern(spec, /X-Organization-ID|X-Tenant-ID/i);
    signals.push({
      type: 'no-multi-tenant',
      weight: 25,
      found: noMultiTenant,
      evidence: noMultiTenant ? ['No multi-tenant headers required'] : [],
    });

    // Resource-based paths
    const hasResourcePaths = this.hasPathPattern(spec, /\/\w+\/{\w+}/);
    signals.push({
      type: 'resource-paths',
      weight: 20,
      found: hasResourcePaths,
      evidence: hasResourcePaths ? ['Found resource-based paths with IDs'] : [],
    });

    const score = this.calculateScore(signals);
    return { profile: 'REST', score, signals };
  }

  /**
   * Check for GraphQL API patterns
   */
  private checkGraphQL(spec: any): ProfileScore {
    const signals: DetectionSignal[] = [];

    // GraphQL endpoint
    const hasGraphQLPath = this.hasPathPattern(spec, /\/graphql|\/gql/i);
    signals.push({
      type: 'graphql-endpoint',
      weight: 40,
      found: hasGraphQLPath,
      evidence: hasGraphQLPath ? ['Found /graphql endpoint'] : [],
    });

    // Single endpoint with POST only
    const singlePostEndpoint = this.hasSinglePostEndpoint(spec);
    signals.push({
      type: 'single-post-endpoint',
      weight: 30,
      found: singlePostEndpoint,
      evidence: singlePostEndpoint ? ['Single POST endpoint pattern'] : [],
    });

    // Query/Mutation in descriptions
    const hasGraphQLTerms = this.hasDescriptionPattern(spec, /query|mutation|subscription|resolver/i);
    signals.push({
      type: 'graphql-terms',
      weight: 20,
      found: hasGraphQLTerms,
      evidence: hasGraphQLTerms ? ['Found GraphQL terminology'] : [],
    });

    // Schema references
    const hasSchemaRefs = this.hasDescriptionPattern(spec, /schema|type|field|argument/i);
    signals.push({
      type: 'schema-references',
      weight: 10,
      found: hasSchemaRefs,
      evidence: hasSchemaRefs ? ['Found schema/type references'] : [],
    });

    const score = this.calculateScore(signals);
    return { profile: 'GraphQL', score, signals };
  }

  /**
   * Check for Microservice patterns
   */
  private checkMicroservice(spec: any): ProfileScore {
    const signals: DetectionSignal[] = [];

    // Service mesh headers
    const hasTracingHeaders = this.hasHeaderPattern(spec, /X-B3-|X-Request-ID|X-Correlation-ID/i);
    signals.push({
      type: 'tracing-headers',
      weight: 25,
      found: hasTracingHeaders,
      evidence: hasTracingHeaders ? ['Found distributed tracing headers'] : [],
    });

    // Health endpoints
    const hasHealthEndpoints = this.hasPathPattern(spec, /health|ready|alive|metrics/i);
    signals.push({
      type: 'health-endpoints',
      weight: 25,
      found: hasHealthEndpoints,
      evidence: hasHealthEndpoints ? ['Found health/readiness endpoints'] : [],
    });

    // Service-specific paths
    const hasServicePaths = this.hasPathPattern(spec, /^\/[a-z-]+\//);
    signals.push({
      type: 'service-paths',
      weight: 20,
      found: hasServicePaths,
      evidence: hasServicePaths ? ['Found service-specific path prefix'] : [],
    });

    // Circuit breaker patterns
    const hasResiliencePatterns = this.hasDescriptionPattern(spec, /retry|circuit breaker|fallback|timeout/i);
    signals.push({
      type: 'resilience-patterns',
      weight: 15,
      found: hasResiliencePatterns,
      evidence: hasResiliencePatterns ? ['Found resilience patterns'] : [],
    });

    // Event/messaging patterns
    const hasEventPatterns = this.hasPathPattern(spec, /events|messages|publish|subscribe/i);
    signals.push({
      type: 'event-patterns',
      weight: 15,
      found: hasEventPatterns,
      evidence: hasEventPatterns ? ['Found event/messaging patterns'] : [],
    });

    const score = this.calculateScore(signals);
    return { profile: 'Microservice', score, signals };
  }

  /**
   * Check for gRPC/REST hybrid patterns
   */
  private checkgRPC(spec: any): ProfileScore {
    const signals: DetectionSignal[] = [];

    // Google API style paths
    const hasGoogleStyle = this.hasPathPattern(spec, /:\w+$/);
    signals.push({
      type: 'google-api-style',
      weight: 35,
      found: hasGoogleStyle,
      evidence: hasGoogleStyle ? ['Found Google API style :verb paths'] : [],
    });

    // Custom methods
    const hasCustomMethods = this.hasPathPattern(spec, /:(get|list|create|update|delete|custom)/i);
    signals.push({
      type: 'custom-methods',
      weight: 30,
      found: hasCustomMethods,
      evidence: hasCustomMethods ? ['Found custom method patterns'] : [],
    });

    // Protocol buffer references
    const hasProtobufRefs = this.hasDescriptionPattern(spec, /proto|protobuf|grpc/i);
    signals.push({
      type: 'protobuf-references',
      weight: 20,
      found: hasProtobufRefs,
      evidence: hasProtobufRefs ? ['Found protobuf/gRPC references'] : [],
    });

    // Streaming indicators
    const hasStreaming = this.hasDescriptionPattern(spec, /stream|server-sent|bidirectional/i);
    signals.push({
      type: 'streaming-patterns',
      weight: 15,
      found: hasStreaming,
      evidence: hasStreaming ? ['Found streaming patterns'] : [],
    });

    const score = this.calculateScore(signals);
    return { profile: 'gRPC', score, signals };
  }

  // Helper methods

  private hasHeaderPattern(spec: any, pattern: RegExp): boolean {
    if (!spec.paths) return false;

    for (const path of Object.values(spec.paths)) {
      for (const operation of Object.values(path as any)) {
        if (typeof operation === 'object' && operation.parameters) {
          for (const param of operation.parameters) {
            if (param.in === 'header' && pattern.test(param.name)) {
              return true;
            }
          }
        }
      }
    }

    // Also check components.parameters
    if (spec.components?.parameters) {
      for (const param of Object.values(spec.components.parameters)) {
        if ((param as any).in === 'header' && pattern.test((param as any).name)) {
          return true;
        }
      }
    }

    return false;
  }

  private hasPathPattern(spec: any, pattern: RegExp): boolean {
    if (!spec.paths) return false;
    return Object.keys(spec.paths).some(path => pattern.test(path));
  }

  private hasSecurityScopes(spec: any, pattern: RegExp): boolean {
    if (!spec.components?.securitySchemes) return false;

    for (const scheme of Object.values(spec.components.securitySchemes)) {
      if ((scheme as any).flows) {
        for (const flow of Object.values((scheme as any).flows)) {
          if ((flow as any).scopes) {
            for (const scope of Object.keys((flow as any).scopes)) {
              if (pattern.test(scope)) return true;
            }
          }
        }
      }
    }

    return false;
  }

  private hasStandardRESTVerbs(spec: any): boolean {
    if (!spec.paths) return false;

    const verbs = new Set<string>();
    for (const path of Object.values(spec.paths)) {
      for (const method of Object.keys(path as any)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
          verbs.add(method.toLowerCase());
        }
      }
    }

    return verbs.size >= 3; // At least 3 standard REST verbs
  }

  private hasSinglePostEndpoint(spec: any): boolean {
    if (!spec.paths) return false;

    const paths = Object.keys(spec.paths);
    if (paths.length !== 1) return false;

    const path = spec.paths[paths[0]];
    const methods = Object.keys(path).filter(m => m !== 'parameters');
    
    return methods.length === 1 && methods[0].toLowerCase() === 'post';
  }

  private hasDescriptionPattern(spec: any, pattern: RegExp): boolean {
    const checkObject = (obj: any): boolean => {
      if (!obj || typeof obj !== 'object') return false;

      for (const [key, value] of Object.entries(obj)) {
        if (key === 'description' && typeof value === 'string' && pattern.test(value)) {
          return true;
        }
        if (typeof value === 'object' && checkObject(value)) {
          return true;
        }
      }
      return false;
    };

    return checkObject(spec);
  }

  private calculateScore(signals: DetectionSignal[]): number {
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const earnedWeight = signals.reduce((sum, s) => s.found ? sum + s.weight : sum, 0);
    return totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
  }

  private calculateConfidence(topProfile: ProfileScore, allProfiles: ProfileScore[]): number {
    // Confidence based on score difference with next best
    if (allProfiles.length < 2) return topProfile.score / 100;

    const secondBest = allProfiles[1];
    const scoreDiff = topProfile.score - secondBest.score;
    
    // Higher confidence if big gap between top and second
    let confidence = topProfile.score / 100;
    if (scoreDiff > 30) confidence = Math.min(0.95, confidence * 1.2);
    else if (scoreDiff < 10) confidence = Math.max(0.5, confidence * 0.8);

    return Math.round(confidence * 100) / 100;
  }

  private buildReasoning(profile: ProfileScore): any {
    const matchedPatterns = profile.signals
      .filter(s => s.found)
      .flatMap(s => s.evidence);

    const missingIndicators = profile.signals
      .filter(s => !s.found && s.weight > 20)
      .map(s => `Missing: ${s.type}`);

    const signalStrength: Record<string, number> = {};
    for (const signal of profile.signals) {
      signalStrength[signal.type] = signal.found ? signal.weight : 0;
    }

    return {
      matchedPatterns,
      missingIndicators,
      signalStrength,
    };
  }
}