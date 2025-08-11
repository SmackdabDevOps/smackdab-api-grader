/**
 * Metrics Calculator
 * Extracts detailed metrics from OpenAPI specs for tracking
 */

export interface DetailedMetrics {
  // Core counts
  endpointCount: number;
  schemaCount: number;
  parameterCount: number;
  responseCount: number;
  
  // Feature flags
  hasPagination: boolean;
  hasRateLimiting: boolean;
  hasWebhooks: boolean;
  hasAsyncPatterns: boolean;
  hasVersioning: boolean;
  hasCaching: boolean;
  
  // Auth & Security
  authMethods: string[];
  securitySchemeCount: number;
  hasOAuth: boolean;
  hasApiKey: boolean;
  hasJWT: boolean;
  
  // Error handling
  errorFormat: 'none' | 'basic' | 'rfc7807';
  hasStandardizedErrors: boolean;
  errorResponseCount: number;
  
  // Documentation coverage
  endpointDocumentedPct: number;
  schemaDocumentedPct: number;
  parameterDocumentedPct: number;
  exampleCoveragePct: number;
  
  // Response patterns
  hasResponseEnvelope: boolean;
  hasHATEOAS: boolean;
  hasFieldFiltering: boolean;
  
  // API maturity indicators
  hasDeprecations: boolean;
  deprecatedEndpointCount: number;
  hasContactInfo: boolean;
  hasLicense: boolean;
  hasTermsOfService: boolean;
  
  // Complexity metrics
  averagePathDepth: number;
  maxPathDepth: number;
  averageParametersPerEndpoint: number;
  averageResponsesPerEndpoint: number;
  
  // Category scores (from grading)
  categoryScores?: {
    functionality: number;
    security: number;
    design: number;
    errors: number;
    performance: number;
    documentation: number;
  };
}

/**
 * Calculate detailed metrics from an OpenAPI specification
 */
export async function calculateMetrics(spec: any, gradingResult?: any): Promise<DetailedMetrics> {
  const metrics: DetailedMetrics = {
    // Initialize all metrics
    endpointCount: 0,
    schemaCount: 0,
    parameterCount: 0,
    responseCount: 0,
    hasPagination: false,
    hasRateLimiting: false,
    hasWebhooks: false,
    hasAsyncPatterns: false,
    hasVersioning: false,
    hasCaching: false,
    authMethods: [],
    securitySchemeCount: 0,
    hasOAuth: false,
    hasApiKey: false,
    hasJWT: false,
    errorFormat: 'none',
    hasStandardizedErrors: false,
    errorResponseCount: 0,
    endpointDocumentedPct: 0,
    schemaDocumentedPct: 0,
    parameterDocumentedPct: 0,
    exampleCoveragePct: 0,
    hasResponseEnvelope: false,
    hasHATEOAS: false,
    hasFieldFiltering: false,
    hasDeprecations: false,
    deprecatedEndpointCount: 0,
    hasContactInfo: false,
    hasLicense: false,
    hasTermsOfService: false,
    averagePathDepth: 0,
    maxPathDepth: 0,
    averageParametersPerEndpoint: 0,
    averageResponsesPerEndpoint: 0,
  };
  
  // Count endpoints and operations
  if (spec.paths) {
    const pathDepths: number[] = [];
    let totalParameters = 0;
    let totalResponses = 0;
    let documentedEndpoints = 0;
    
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      const depth = path.split('/').filter(Boolean).length;
      pathDepths.push(depth);
      
      const operations = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
      
      for (const op of operations) {
        if (op in (pathItem as any)) {
          metrics.endpointCount++;
          const operation = (pathItem as any)[op];
          
          // Check for documentation
          if (operation.summary || operation.description) {
            documentedEndpoints++;
          }
          
          // Check for deprecation
          if (operation.deprecated) {
            metrics.hasDeprecations = true;
            metrics.deprecatedEndpointCount++;
          }
          
          // Count parameters
          if (operation.parameters) {
            totalParameters += operation.parameters.length;
            metrics.parameterCount += operation.parameters.length;
          }
          
          // Count responses
          if (operation.responses) {
            const responseCount = Object.keys(operation.responses).length;
            totalResponses += responseCount;
            metrics.responseCount += responseCount;
            
            // Check for error responses
            for (const statusCode of Object.keys(operation.responses)) {
              if (parseInt(statusCode) >= 400) {
                metrics.errorResponseCount++;
              }
            }
          }
          
          // Check for pagination
          if (operation.parameters?.some((p: any) => 
            ['page', 'limit', 'offset', 'cursor'].includes(p.name?.toLowerCase())
          )) {
            metrics.hasPagination = true;
          }
          
          // Check for rate limiting headers
          if (operation.responses?.['200']?.headers?.['X-RateLimit-Limit']) {
            metrics.hasRateLimiting = true;
          }
        }
      }
    }
    
    // Calculate path metrics
    if (pathDepths.length > 0) {
      metrics.averagePathDepth = pathDepths.reduce((a, b) => a + b, 0) / pathDepths.length;
      metrics.maxPathDepth = Math.max(...pathDepths);
    }
    
    // Calculate averages
    if (metrics.endpointCount > 0) {
      metrics.averageParametersPerEndpoint = totalParameters / metrics.endpointCount;
      metrics.averageResponsesPerEndpoint = totalResponses / metrics.endpointCount;
      metrics.endpointDocumentedPct = (documentedEndpoints / metrics.endpointCount) * 100;
    }
  }
  
  // Check for webhooks
  if (spec.webhooks && Object.keys(spec.webhooks).length > 0) {
    metrics.hasWebhooks = true;
  }
  
  // Check for async patterns (callbacks)
  if (spec.paths) {
    for (const pathItem of Object.values(spec.paths)) {
      for (const operation of Object.values(pathItem as any)) {
        if ((operation as any).callbacks) {
          metrics.hasAsyncPatterns = true;
          break;
        }
      }
    }
  }
  
  // Count schemas
  if (spec.components?.schemas) {
    metrics.schemaCount = Object.keys(spec.components.schemas).length;
    
    let documentedSchemas = 0;
    let schemasWithExamples = 0;
    
    for (const schema of Object.values(spec.components.schemas)) {
      if ((schema as any).description) {
        documentedSchemas++;
      }
      if ((schema as any).example || (schema as any).examples) {
        schemasWithExamples++;
      }
    }
    
    if (metrics.schemaCount > 0) {
      metrics.schemaDocumentedPct = (documentedSchemas / metrics.schemaCount) * 100;
      metrics.exampleCoveragePct = (schemasWithExamples / metrics.schemaCount) * 100;
    }
  }
  
  // Analyze security schemes
  if (spec.components?.securitySchemes) {
    const schemes = spec.components.securitySchemes;
    metrics.securitySchemeCount = Object.keys(schemes).length;
    
    for (const [name, scheme] of Object.entries(schemes)) {
      const schemeType = (scheme as any).type;
      
      if (!metrics.authMethods.includes(schemeType)) {
        metrics.authMethods.push(schemeType);
      }
      
      if (schemeType === 'oauth2') {
        metrics.hasOAuth = true;
      } else if (schemeType === 'apiKey') {
        metrics.hasApiKey = true;
      } else if (schemeType === 'http' && (scheme as any).scheme === 'bearer') {
        metrics.hasJWT = true;
      }
    }
  }
  
  // Check for error format
  if (spec.components?.schemas?.['ProblemDetails'] || 
      spec.components?.schemas?.['RFC7807Error']) {
    metrics.errorFormat = 'rfc7807';
    metrics.hasStandardizedErrors = true;
  } else if (spec.components?.schemas?.['Error'] || 
             spec.components?.schemas?.['ErrorResponse']) {
    metrics.errorFormat = 'basic';
    metrics.hasStandardizedErrors = true;
  }
  
  // Check for versioning
  if (spec.info?.version || spec.paths?.['/v1'] || spec.paths?.['/v2']) {
    metrics.hasVersioning = true;
  }
  
  // Check for caching headers in responses
  for (const path of Object.values(spec.paths || {})) {
    for (const operation of Object.values(path as any)) {
      if ((operation as any).responses?.['200']?.headers?.['Cache-Control'] ||
          (operation as any).responses?.['200']?.headers?.['ETag']) {
        metrics.hasCaching = true;
        break;
      }
    }
  }
  
  // Check for HATEOAS (links in responses)
  for (const path of Object.values(spec.paths || {})) {
    for (const operation of Object.values(path as any)) {
      if ((operation as any).responses?.['200']?.links) {
        metrics.hasHATEOAS = true;
        break;
      }
    }
  }
  
  // Check for field filtering (common parameter patterns)
  for (const path of Object.values(spec.paths || {})) {
    for (const operation of Object.values(path as any)) {
      if ((operation as any).parameters?.some((p: any) => 
        ['fields', 'include', 'exclude', 'select'].includes(p.name?.toLowerCase())
      )) {
        metrics.hasFieldFiltering = true;
        break;
      }
    }
  }
  
  // Check info section completeness
  if (spec.info) {
    metrics.hasContactInfo = !!spec.info.contact;
    metrics.hasLicense = !!spec.info.license;
    metrics.hasTermsOfService = !!spec.info.termsOfService;
  }
  
  // Extract category scores from grading result if provided
  if (gradingResult?.grade?.perCategory) {
    metrics.categoryScores = {
      functionality: gradingResult.grade.perCategory.functionality?.percentage || 0,
      security: gradingResult.grade.perCategory.security?.percentage || 0,
      design: gradingResult.grade.perCategory.design?.percentage || 0,
      errors: gradingResult.grade.perCategory.errors?.percentage || 0,
      performance: gradingResult.grade.perCategory.performance?.percentage || 0,
      documentation: gradingResult.grade.perCategory.documentation?.percentage || 0,
    };
  }
  
  return metrics;
}

/**
 * Compare two sets of metrics to identify improvements
 */
export function compareMetrics(
  baseline: DetailedMetrics, 
  current: DetailedMetrics
): {
  improvements: Array<{ metric: string; from: any; to: any; change: number }>;
  regressions: Array<{ metric: string; from: any; to: any; change: number }>;
  unchanged: Array<{ metric: string; value: any }>;
} {
  const improvements: Array<{ metric: string; from: any; to: any; change: number }> = [];
  const regressions: Array<{ metric: string; from: any; to: any; change: number }> = [];
  const unchanged: Array<{ metric: string; value: any }> = [];
  
  // Compare numeric metrics
  const numericMetrics = [
    'endpointCount', 'schemaCount', 'endpointDocumentedPct', 
    'schemaDocumentedPct', 'exampleCoveragePct'
  ];
  
  for (const metric of numericMetrics) {
    const baseValue = (baseline as any)[metric];
    const currValue = (current as any)[metric];
    
    if (currValue > baseValue) {
      improvements.push({
        metric,
        from: baseValue,
        to: currValue,
        change: ((currValue - baseValue) / baseValue) * 100
      });
    } else if (currValue < baseValue) {
      regressions.push({
        metric,
        from: baseValue,
        to: currValue,
        change: ((baseValue - currValue) / baseValue) * -100
      });
    } else {
      unchanged.push({ metric, value: currValue });
    }
  }
  
  // Compare boolean features
  const booleanMetrics = [
    'hasPagination', 'hasRateLimiting', 'hasWebhooks', 
    'hasAsyncPatterns', 'hasStandardizedErrors'
  ];
  
  for (const metric of booleanMetrics) {
    const baseValue = (baseline as any)[metric];
    const currValue = (current as any)[metric];
    
    if (!baseValue && currValue) {
      improvements.push({
        metric,
        from: false,
        to: true,
        change: 100
      });
    } else if (baseValue && !currValue) {
      regressions.push({
        metric,
        from: true,
        to: false,
        change: -100
      });
    }
  }
  
  return { improvements, regressions, unchanged };
}