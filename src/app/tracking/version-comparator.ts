/**
 * Version Comparator
 * Compares different versions of the same API
 */

import { DetailedMetrics, compareMetrics } from './metrics-calculator.js';

export interface VersionComparison {
  apiUuid: string;
  baselineVersion: string;
  candidateVersion: string;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  scoreImprovement: number; // percentage
  
  // Detailed changes
  endpointsAdded: string[];
  endpointsRemoved: string[];
  endpointsModified: string[];
  
  schemasAdded: string[];
  schemasRemoved: string[];
  schemasModified: string[];
  
  // Feature changes
  featuresAdded: string[];
  featuresRemoved: string[];
  
  // Quality metrics
  documentationImprovement: number;
  securityImprovement: number;
  testCoverageImprovement: number;
  
  // Breaking changes
  hasBreakingChanges: boolean;
  breakingChanges: BreakingChange[];
  
  // Summary
  changeImpact: 'major' | 'minor' | 'patch' | 'none';
  recommendation: string;
}

export interface BreakingChange {
  type: 'endpoint_removed' | 'parameter_removed' | 'schema_incompatible' | 'auth_changed';
  path?: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  migrationHint?: string;
}

/**
 * Compare two versions of an API spec
 */
export async function compareApiVersions(
  baselineSpec: any,
  candidateSpec: any,
  baselineMetrics: DetailedMetrics,
  candidateMetrics: DetailedMetrics
): Promise<VersionComparison> {
  const apiUuid = candidateSpec.info?.['x-api-id'] || 'unknown';
  const baselineVersion = baselineSpec.info?.version || '0.0.0';
  const candidateVersion = candidateSpec.info?.version || '0.0.0';
  
  // Calculate score improvements
  const baselineScore = calculateOverallScore(baselineMetrics);
  const candidateScore = calculateOverallScore(candidateMetrics);
  const scoreDelta = candidateScore - baselineScore;
  const scoreImprovement = baselineScore > 0 
    ? ((candidateScore - baselineScore) / baselineScore) * 100 
    : 0;
  
  // Compare endpoints
  const endpointComparison = compareEndpoints(baselineSpec, candidateSpec);
  
  // Compare schemas
  const schemaComparison = compareSchemas(baselineSpec, candidateSpec);
  
  // Compare features
  const featureComparison = compareFeatures(baselineMetrics, candidateMetrics);
  
  // Calculate quality improvements
  const documentationImprovement = 
    (candidateMetrics.endpointDocumentedPct - baselineMetrics.endpointDocumentedPct);
  
  const securityImprovement = calculateSecurityImprovement(baselineMetrics, candidateMetrics);
  
  const testCoverageImprovement = 
    (candidateMetrics.exampleCoveragePct - baselineMetrics.exampleCoveragePct);
  
  // Detect breaking changes
  const breakingChanges = detectBreakingChanges(
    baselineSpec, 
    candidateSpec, 
    endpointComparison, 
    schemaComparison
  );
  
  // Determine change impact
  const changeImpact = determineChangeImpact(
    endpointComparison,
    schemaComparison,
    breakingChanges
  );
  
  // Generate recommendation
  const recommendation = generateVersionRecommendation(
    scoreImprovement,
    breakingChanges,
    changeImpact
  );
  
  return {
    apiUuid,
    baselineVersion,
    candidateVersion,
    baselineScore,
    candidateScore,
    scoreDelta,
    scoreImprovement,
    endpointsAdded: endpointComparison.added,
    endpointsRemoved: endpointComparison.removed,
    endpointsModified: endpointComparison.modified,
    schemasAdded: schemaComparison.added,
    schemasRemoved: schemaComparison.removed,
    schemasModified: schemaComparison.modified,
    featuresAdded: featureComparison.added,
    featuresRemoved: featureComparison.removed,
    documentationImprovement,
    securityImprovement,
    testCoverageImprovement,
    hasBreakingChanges: breakingChanges.length > 0,
    breakingChanges,
    changeImpact,
    recommendation
  };
}

/**
 * Calculate overall score from metrics
 */
function calculateOverallScore(metrics: DetailedMetrics): number {
  let score = 0;
  
  // Category scores (if available)
  if (metrics.categoryScores) {
    const categories = Object.values(metrics.categoryScores);
    score = categories.reduce((sum, val) => sum + val, 0) / categories.length;
  } else {
    // Fallback: calculate from individual metrics
    score += metrics.endpointDocumentedPct * 0.2;
    score += metrics.schemaDocumentedPct * 0.2;
    score += metrics.exampleCoveragePct * 0.1;
    
    // Feature points
    if (metrics.hasPagination) score += 5;
    if (metrics.hasRateLimiting) score += 5;
    if (metrics.hasStandardizedErrors) score += 10;
    if (metrics.hasVersioning) score += 5;
    if (metrics.hasCaching) score += 5;
    if (metrics.authMethods.length > 0) score += 10;
    if (metrics.hasOAuth) score += 10;
  }
  
  return Math.min(100, score);
}

/**
 * Compare endpoints between versions
 */
function compareEndpoints(
  baselineSpec: any, 
  candidateSpec: any
): {
  added: string[];
  removed: string[];
  modified: string[];
} {
  const baselinePaths = extractEndpoints(baselineSpec);
  const candidatePaths = extractEndpoints(candidateSpec);
  
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  
  // Find added and modified endpoints
  for (const endpoint of candidatePaths) {
    if (!baselinePaths.includes(endpoint)) {
      added.push(endpoint);
    } else {
      // Check if the endpoint was modified
      const [path, method] = endpoint.split(' ');
      const baselineOp = baselineSpec.paths?.[path]?.[method.toLowerCase()];
      const candidateOp = candidateSpec.paths?.[path]?.[method.toLowerCase()];
      
      if (JSON.stringify(baselineOp) !== JSON.stringify(candidateOp)) {
        modified.push(endpoint);
      }
    }
  }
  
  // Find removed endpoints
  for (const endpoint of baselinePaths) {
    if (!candidatePaths.includes(endpoint)) {
      removed.push(endpoint);
    }
  }
  
  return { added, removed, modified };
}

/**
 * Extract all endpoints from a spec
 */
function extractEndpoints(spec: any): string[] {
  const endpoints: string[] = [];
  
  if (!spec.paths) return endpoints;
  
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    
    for (const method of methods) {
      if (method in (pathItem as any)) {
        endpoints.push(`${path} ${method.toUpperCase()}`);
      }
    }
  }
  
  return endpoints.sort();
}

/**
 * Compare schemas between versions
 */
function compareSchemas(
  baselineSpec: any, 
  candidateSpec: any
): {
  added: string[];
  removed: string[];
  modified: string[];
} {
  const baselineSchemas = Object.keys(baselineSpec.components?.schemas || {});
  const candidateSchemas = Object.keys(candidateSpec.components?.schemas || {});
  
  const added = candidateSchemas.filter(s => !baselineSchemas.includes(s));
  const removed = baselineSchemas.filter(s => !candidateSchemas.includes(s));
  
  const modified: string[] = [];
  
  // Check for modified schemas
  for (const schemaName of baselineSchemas) {
    if (candidateSchemas.includes(schemaName)) {
      const baselineSchema = baselineSpec.components.schemas[schemaName];
      const candidateSchema = candidateSpec.components.schemas[schemaName];
      
      if (JSON.stringify(baselineSchema) !== JSON.stringify(candidateSchema)) {
        modified.push(schemaName);
      }
    }
  }
  
  return { added, removed, modified };
}

/**
 * Compare features between versions
 */
function compareFeatures(
  baselineMetrics: DetailedMetrics,
  candidateMetrics: DetailedMetrics
): {
  added: string[];
  removed: string[];
} {
  const features = [
    'hasPagination',
    'hasRateLimiting',
    'hasWebhooks',
    'hasAsyncPatterns',
    'hasVersioning',
    'hasCaching',
    'hasStandardizedErrors',
    'hasHATEOAS',
    'hasFieldFiltering'
  ];
  
  const added: string[] = [];
  const removed: string[] = [];
  
  for (const feature of features) {
    const baselineHas = (baselineMetrics as any)[feature];
    const candidateHas = (candidateMetrics as any)[feature];
    
    if (!baselineHas && candidateHas) {
      added.push(feature.replace('has', ''));
    } else if (baselineHas && !candidateHas) {
      removed.push(feature.replace('has', ''));
    }
  }
  
  return { added, removed };
}

/**
 * Calculate security improvement
 */
function calculateSecurityImprovement(
  baselineMetrics: DetailedMetrics,
  candidateMetrics: DetailedMetrics
): number {
  let baselineScore = 0;
  let candidateScore = 0;
  
  // Auth methods
  baselineScore += baselineMetrics.authMethods.length * 10;
  candidateScore += candidateMetrics.authMethods.length * 10;
  
  // Specific auth types
  if (baselineMetrics.hasOAuth) baselineScore += 20;
  if (candidateMetrics.hasOAuth) candidateScore += 20;
  
  if (baselineMetrics.hasApiKey) baselineScore += 10;
  if (candidateMetrics.hasApiKey) candidateScore += 10;
  
  if (baselineMetrics.hasJWT) baselineScore += 15;
  if (candidateMetrics.hasJWT) candidateScore += 15;
  
  return candidateScore - baselineScore;
}

/**
 * Detect breaking changes between versions
 */
function detectBreakingChanges(
  baselineSpec: any,
  candidateSpec: any,
  endpointComparison: any,
  schemaComparison: any
): BreakingChange[] {
  const breakingChanges: BreakingChange[] = [];
  
  // Removed endpoints are breaking changes
  for (const endpoint of endpointComparison.removed) {
    breakingChanges.push({
      type: 'endpoint_removed',
      path: endpoint,
      description: `Endpoint ${endpoint} was removed`,
      severity: 'high',
      migrationHint: 'Clients using this endpoint will need to be updated'
    });
  }
  
  // Check for removed required parameters
  for (const endpoint of endpointComparison.modified) {
    const [path, method] = endpoint.split(' ');
    const baselineOp = baselineSpec.paths?.[path]?.[method.toLowerCase()];
    const candidateOp = candidateSpec.paths?.[path]?.[method.toLowerCase()];
    
    const baselineParams = baselineOp?.parameters || [];
    const candidateParams = candidateOp?.parameters || [];
    
    const baselineRequired = baselineParams
      .filter((p: any) => p.required)
      .map((p: any) => p.name);
    
    const candidateRequired = candidateParams
      .filter((p: any) => p.required)
      .map((p: any) => p.name);
    
    for (const param of baselineRequired) {
      if (!candidateRequired.includes(param)) {
        breakingChanges.push({
          type: 'parameter_removed',
          path: endpoint,
          description: `Required parameter '${param}' removed from ${endpoint}`,
          severity: 'high',
          migrationHint: `Remove '${param}' from client requests`
        });
      }
    }
  }
  
  // Check for incompatible schema changes
  for (const schemaName of schemaComparison.modified) {
    const baselineSchema = baselineSpec.components?.schemas?.[schemaName];
    const candidateSchema = candidateSpec.components?.schemas?.[schemaName];
    
    if (baselineSchema?.required && candidateSchema?.required) {
      const baselineRequired = new Set(baselineSchema.required);
      const candidateRequired = new Set(candidateSchema.required);
      
      // New required fields are breaking changes for request schemas
      for (const field of candidateRequired) {
        if (!baselineRequired.has(field)) {
          breakingChanges.push({
            type: 'schema_incompatible',
            description: `Schema '${schemaName}' has new required field '${field}'`,
            severity: 'medium',
            migrationHint: `Add '${field}' to requests using ${schemaName}`
          });
        }
      }
    }
  }
  
  // Check for auth changes
  const baselineAuth = baselineSpec.components?.securitySchemes;
  const candidateAuth = candidateSpec.components?.securitySchemes;
  
  if (baselineAuth && candidateAuth) {
    const baselineSchemes = Object.keys(baselineAuth);
    const candidateSchemes = Object.keys(candidateAuth);
    
    for (const scheme of baselineSchemes) {
      if (!candidateSchemes.includes(scheme)) {
        breakingChanges.push({
          type: 'auth_changed',
          description: `Authentication scheme '${scheme}' was removed`,
          severity: 'high',
          migrationHint: 'Update authentication implementation'
        });
      }
    }
  }
  
  return breakingChanges;
}

/**
 * Determine the impact level of changes
 */
function determineChangeImpact(
  endpointComparison: any,
  schemaComparison: any,
  breakingChanges: BreakingChange[]
): 'major' | 'minor' | 'patch' | 'none' {
  // Major: breaking changes
  if (breakingChanges.length > 0) {
    return 'major';
  }
  
  // Minor: new features/endpoints
  if (endpointComparison.added.length > 0 || schemaComparison.added.length > 0) {
    return 'minor';
  }
  
  // Patch: modifications without new features
  if (endpointComparison.modified.length > 0 || schemaComparison.modified.length > 0) {
    return 'patch';
  }
  
  return 'none';
}

/**
 * Generate recommendation based on comparison
 */
function generateVersionRecommendation(
  scoreImprovement: number,
  breakingChanges: BreakingChange[],
  changeImpact: string
): string {
  const recommendations: string[] = [];
  
  if (breakingChanges.length > 0) {
    recommendations.push(
      `⚠️ This version introduces ${breakingChanges.length} breaking change(s). ` +
      `Consider a major version bump and provide migration guide.`
    );
  }
  
  if (scoreImprovement > 10) {
    recommendations.push(
      `✅ Excellent improvement (+${scoreImprovement.toFixed(1)}%). ` +
      `This version significantly enhances API quality.`
    );
  } else if (scoreImprovement > 0) {
    recommendations.push(
      `👍 Good progress (+${scoreImprovement.toFixed(1)}%). ` +
      `Continue iterating on quality improvements.`
    );
  } else if (scoreImprovement < -5) {
    recommendations.push(
      `⚠️ Quality regression detected (${scoreImprovement.toFixed(1)}%). ` +
      `Review changes to ensure they don't compromise API quality.`
    );
  }
  
  if (changeImpact === 'major') {
    recommendations.push('📦 Recommend major version bump (X.0.0)');
  } else if (changeImpact === 'minor') {
    recommendations.push('📦 Recommend minor version bump (x.Y.0)');
  } else if (changeImpact === 'patch') {
    recommendations.push('📦 Recommend patch version bump (x.y.Z)');
  }
  
  return recommendations.join(' ');
}

/**
 * Generate version comparison summary
 */
export function generateComparisonSummary(comparison: VersionComparison): string {
  const lines: string[] = [
    `Version Comparison: ${comparison.baselineVersion} → ${comparison.candidateVersion}`,
    `Score: ${comparison.baselineScore.toFixed(1)} → ${comparison.candidateScore.toFixed(1)} (${comparison.scoreDelta > 0 ? '+' : ''}${comparison.scoreDelta.toFixed(1)})`,
    `Change Impact: ${comparison.changeImpact}`,
    '',
  ];
  
  if (comparison.endpointsAdded.length > 0) {
    lines.push(`✅ ${comparison.endpointsAdded.length} endpoint(s) added`);
  }
  
  if (comparison.endpointsRemoved.length > 0) {
    lines.push(`❌ ${comparison.endpointsRemoved.length} endpoint(s) removed`);
  }
  
  if (comparison.endpointsModified.length > 0) {
    lines.push(`🔄 ${comparison.endpointsModified.length} endpoint(s) modified`);
  }
  
  if (comparison.featuresAdded.length > 0) {
    lines.push(`✨ New features: ${comparison.featuresAdded.join(', ')}`);
  }
  
  if (comparison.hasBreakingChanges) {
    lines.push('');
    lines.push(`⚠️ Breaking Changes (${comparison.breakingChanges.length}):`);
    for (const change of comparison.breakingChanges.slice(0, 3)) {
      lines.push(`  • ${change.description}`);
    }
  }
  
  lines.push('');
  lines.push(comparison.recommendation);
  
  return lines.join('\n');
}