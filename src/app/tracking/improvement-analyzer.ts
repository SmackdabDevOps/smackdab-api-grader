/**
 * Improvement Analyzer
 * Analyzes API evolution and tracks improvements over time
 */

import { DetailedMetrics, compareMetrics } from './metrics-calculator.js';

export interface ImprovementTrend {
  metric: string;
  category: string;
  baseline: number;
  current: number;
  best: number;
  worst: number;
  trend: 'improving' | 'declining' | 'stable' | 'volatile';
  improvementPct: number;
  volatility: number; // 0-1, how much the metric fluctuates
}

export interface ImprovementReport {
  apiUuid: string;
  currentVersion: string;
  baselineVersion: string;
  overallImprovement: number;
  trends: ImprovementTrend[];
  topImprovements: Array<{ metric: string; improvement: number }>;
  areasNeedingAttention: Array<{ metric: string; decline: number }>;
  recommendations: string[];
  maturityLevel: 'initial' | 'developing' | 'mature' | 'optimized';
}

/**
 * Calculate improvement trends from historical metrics
 */
export async function calculateImprovements(
  apiUuid: string,
  currentMetrics: DetailedMetrics,
  historicalMetrics: DetailedMetrics[]
): Promise<ImprovementReport> {
  // Get baseline (first recorded metrics)
  const baseline = historicalMetrics[0] || currentMetrics;
  
  // Calculate trends for each metric
  const trends: ImprovementTrend[] = [];
  
  // Analyze score trends
  const scoreMetrics = [
    { name: 'functionality', category: 'scores' },
    { name: 'security', category: 'scores' },
    { name: 'design', category: 'scores' },
    { name: 'documentation', category: 'scores' },
  ];
  
  for (const { name, category } of scoreMetrics) {
    const baselineValue = baseline.categoryScores?.[name as keyof typeof baseline.categoryScores] || 0;
    const currentValue = currentMetrics.categoryScores?.[name as keyof typeof currentMetrics.categoryScores] || 0;
    
    const allValues = historicalMetrics
      .map(m => m.categoryScores?.[name as keyof typeof m.categoryScores] || 0)
      .concat([currentValue]);
    
    const best = Math.max(...allValues);
    const worst = Math.min(...allValues);
    const volatility = calculateVolatility(allValues);
    const trend = determineTrend(allValues);
    
    trends.push({
      metric: name,
      category,
      baseline: baselineValue,
      current: currentValue,
      best,
      worst,
      trend,
      improvementPct: baselineValue > 0 
        ? ((currentValue - baselineValue) / baselineValue) * 100 
        : 0,
      volatility
    });
  }
  
  // Analyze coverage trends
  const coverageMetrics = [
    { name: 'endpointDocumentedPct', category: 'coverage' },
    { name: 'schemaDocumentedPct', category: 'coverage' },
    { name: 'exampleCoveragePct', category: 'coverage' },
  ];
  
  for (const { name, category } of coverageMetrics) {
    const baselineValue = (baseline as any)[name] || 0;
    const currentValue = (currentMetrics as any)[name] || 0;
    
    const allValues = historicalMetrics
      .map(m => (m as any)[name] || 0)
      .concat([currentValue]);
    
    trends.push({
      metric: name,
      category,
      baseline: baselineValue,
      current: currentValue,
      best: Math.max(...allValues),
      worst: Math.min(...allValues),
      trend: determineTrend(allValues),
      improvementPct: baselineValue > 0 
        ? ((currentValue - baselineValue) / baselineValue) * 100 
        : 0,
      volatility: calculateVolatility(allValues)
    });
  }
  
  // Analyze feature adoption
  const featureMetrics = [
    'hasPagination',
    'hasRateLimiting',
    'hasWebhooks',
    'hasStandardizedErrors',
    'hasVersioning',
    'hasCaching'
  ];
  
  let featuresAdopted = 0;
  let featuresLost = 0;
  
  for (const feature of featureMetrics) {
    const baselineHas = (baseline as any)[feature] || false;
    const currentHas = (currentMetrics as any)[feature] || false;
    
    if (!baselineHas && currentHas) {
      featuresAdopted++;
    } else if (baselineHas && !currentHas) {
      featuresLost++;
    }
    
    trends.push({
      metric: feature,
      category: 'features',
      baseline: baselineHas ? 1 : 0,
      current: currentHas ? 1 : 0,
      best: currentHas ? 1 : 0,
      worst: 0,
      trend: !baselineHas && currentHas ? 'improving' : 
             baselineHas && !currentHas ? 'declining' : 'stable',
      improvementPct: !baselineHas && currentHas ? 100 : 
                      baselineHas && !currentHas ? -100 : 0,
      volatility: 0
    });
  }
  
  // Calculate overall improvement
  const overallImprovement = calculateOverallImprovement(trends);
  
  // Identify top improvements and areas needing attention
  const topImprovements = trends
    .filter(t => t.improvementPct > 0)
    .sort((a, b) => b.improvementPct - a.improvementPct)
    .slice(0, 5)
    .map(t => ({ metric: t.metric, improvement: t.improvementPct }));
  
  const areasNeedingAttention = trends
    .filter(t => t.improvementPct < 0)
    .sort((a, b) => a.improvementPct - b.improvementPct)
    .slice(0, 5)
    .map(t => ({ metric: t.metric, decline: Math.abs(t.improvementPct) }));
  
  // Generate recommendations
  const recommendations = generateRecommendations(trends, currentMetrics);
  
  // Determine maturity level
  const maturityLevel = determineMaturityLevel(currentMetrics, trends);
  
  return {
    apiUuid,
    currentVersion: '0.0.0', // Will be filled by caller
    baselineVersion: '0.0.0', // Will be filled by caller
    overallImprovement,
    trends,
    topImprovements,
    areasNeedingAttention,
    recommendations,
    maturityLevel
  };
}

/**
 * Calculate volatility of a metric over time (0-1)
 */
function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  // Normalize to 0-1 range (coefficient of variation)
  return mean > 0 ? Math.min(stdDev / mean, 1) : 0;
}

/**
 * Determine trend direction from historical values
 */
function determineTrend(values: number[]): 'improving' | 'declining' | 'stable' | 'volatile' {
  if (values.length < 2) return 'stable';
  
  const volatility = calculateVolatility(values);
  
  // High volatility indicates unstable metric
  if (volatility > 0.3) return 'volatile';
  
  // Calculate linear trend
  const n = values.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  
  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  
  // Determine trend based on slope
  const meanValue = sumY / n;
  const normalizedSlope = meanValue > 0 ? slope / meanValue : slope;
  
  if (Math.abs(normalizedSlope) < 0.01) return 'stable';
  if (normalizedSlope > 0) return 'improving';
  return 'declining';
}

/**
 * Calculate overall improvement score
 */
function calculateOverallImprovement(trends: ImprovementTrend[]): number {
  // Weight different categories differently
  const weights = {
    scores: 0.4,
    coverage: 0.3,
    features: 0.3
  };
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const trend of trends) {
    const weight = weights[trend.category as keyof typeof weights] || 0.1;
    
    // For boolean features, use 0 or 1
    const improvement = trend.category === 'features' 
      ? (trend.current - trend.baseline) * 100
      : trend.improvementPct;
    
    weightedSum += improvement * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Generate actionable recommendations based on trends
 */
function generateRecommendations(
  trends: ImprovementTrend[], 
  currentMetrics: DetailedMetrics
): string[] {
  const recommendations: string[] = [];
  
  // Check for declining metrics
  const decliningMetrics = trends.filter(t => t.trend === 'declining');
  if (decliningMetrics.length > 0) {
    recommendations.push(
      `⚠️ Address declining metrics: ${decliningMetrics.map(m => m.metric).join(', ')}`
    );
  }
  
  // Check for volatile metrics
  const volatileMetrics = trends.filter(t => t.volatility > 0.5);
  if (volatileMetrics.length > 0) {
    recommendations.push(
      `📊 Stabilize volatile metrics: ${volatileMetrics.map(m => m.metric).join(', ')}`
    );
  }
  
  // Feature recommendations
  if (!currentMetrics.hasPagination) {
    recommendations.push('📄 Implement pagination for list endpoints');
  }
  
  if (!currentMetrics.hasRateLimiting) {
    recommendations.push('🚦 Add rate limiting headers');
  }
  
  if (!currentMetrics.hasStandardizedErrors) {
    recommendations.push('❌ Standardize error responses (consider RFC 7807)');
  }
  
  if (currentMetrics.endpointDocumentedPct < 80) {
    recommendations.push('📝 Improve endpoint documentation (currently at ' + 
      Math.round(currentMetrics.endpointDocumentedPct) + '%)');
  }
  
  if (currentMetrics.exampleCoveragePct < 50) {
    recommendations.push('💡 Add more examples to schemas (currently at ' + 
      Math.round(currentMetrics.exampleCoveragePct) + '%)');
  }
  
  if (!currentMetrics.hasWebhooks && currentMetrics.endpointCount > 20) {
    recommendations.push('🔔 Consider adding webhooks for event-driven updates');
  }
  
  if (!currentMetrics.hasVersioning) {
    recommendations.push('🏷️ Implement API versioning strategy');
  }
  
  // Security recommendations
  if (currentMetrics.authMethods.length === 0) {
    recommendations.push('🔐 Add authentication mechanisms');
  } else if (!currentMetrics.hasOAuth && currentMetrics.endpointCount > 10) {
    recommendations.push('🔑 Consider OAuth2 for better security');
  }
  
  return recommendations.slice(0, 5); // Return top 5 recommendations
}

/**
 * Determine API maturity level
 */
function determineMaturityLevel(
  metrics: DetailedMetrics,
  trends: ImprovementTrend[]
): 'initial' | 'developing' | 'mature' | 'optimized' {
  // Calculate maturity score (0-100)
  let score = 0;
  
  // Documentation (25 points)
  score += Math.min(25, (metrics.endpointDocumentedPct / 100) * 15);
  score += Math.min(10, (metrics.exampleCoveragePct / 100) * 10);
  
  // Features (25 points)
  const features = [
    metrics.hasPagination,
    metrics.hasRateLimiting,
    metrics.hasStandardizedErrors,
    metrics.hasVersioning,
    metrics.hasCaching
  ];
  score += features.filter(Boolean).length * 5;
  
  // Security (25 points)
  if (metrics.authMethods.length > 0) score += 15;
  if (metrics.hasOAuth) score += 10;
  
  // Trends (25 points)
  const improvingCount = trends.filter(t => t.trend === 'improving').length;
  const stableCount = trends.filter(t => t.trend === 'stable').length;
  score += Math.min(25, (improvingCount + stableCount) * 2);
  
  // Determine level based on score
  if (score >= 85) return 'optimized';
  if (score >= 65) return 'mature';
  if (score >= 35) return 'developing';
  return 'initial';
}

/**
 * Generate improvement summary text
 */
export function generateImprovementSummary(report: ImprovementReport): string {
  const lines: string[] = [
    `API Improvement Report for ${report.apiUuid}`,
    `Version: ${report.baselineVersion} → ${report.currentVersion}`,
    `Overall Improvement: ${report.overallImprovement > 0 ? '+' : ''}${report.overallImprovement.toFixed(1)}%`,
    `Maturity Level: ${report.maturityLevel}`,
    '',
  ];
  
  if (report.topImprovements.length > 0) {
    lines.push('✅ Top Improvements:');
    for (const imp of report.topImprovements) {
      lines.push(`  • ${imp.metric}: +${imp.improvement.toFixed(1)}%`);
    }
    lines.push('');
  }
  
  if (report.areasNeedingAttention.length > 0) {
    lines.push('⚠️ Areas Needing Attention:');
    for (const area of report.areasNeedingAttention) {
      lines.push(`  • ${area.metric}: -${area.decline.toFixed(1)}%`);
    }
    lines.push('');
  }
  
  if (report.recommendations.length > 0) {
    lines.push('💡 Recommendations:');
    for (const rec of report.recommendations) {
      lines.push(`  ${rec}`);
    }
  }
  
  return lines.join('\n');
}