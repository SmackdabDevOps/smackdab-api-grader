import { RuleScore } from './coverage';
import { Rule } from '../types';
import { GradeResult, CategoryBreakdown } from './finalizer';

/**
 * Coverage-based scoring system implementation
 * Provides alternative scoring mechanism based on test coverage metrics
 */

export interface CoverageMetrics {
  totalTargets: number;
  passedTargets: number;
  failedTargets: number;
  coveragePercentage: number;
  categoryBreakdown: Map<string, { passed: number; total: number }>;
}

export interface CoverageBasedReport {
  overallCoverage: number;
  categoryScores: CategoryBreakdown[];
  recommendations: string[];
  grade: string;
  excellence: boolean;
}

export interface ImprovementSuggestion {
  ruleId: string;
  impact: number;
  effort: 'low' | 'medium' | 'high';
  description: string;
}

/**
 * Score API specification using coverage-based metrics
 */
export function scoreWithCoverage(spec: any): Map<string, RuleScore> {
  const scores = new Map<string, RuleScore>();
  
  // Basic implementation - would need actual rule evaluation
  scores.set('BASIC-001', {
    ruleId: 'BASIC-001',
    coverage: 1.0,
    score: 10,
    maxScore: 10,
    targetsChecked: 5,
    targetsPassed: 5,
    findings: []
  });
  
  return scores;
}

/**
 * Calculate weighted grade based on coverage scores
 */
export function calculateWeightedGrade(
  scores: Map<string, RuleScore>,
  weights?: Map<string, number>
): GradeResult {
  let totalScore = 0;
  let totalMaxScore = 0;
  const breakdown: CategoryBreakdown[] = [];
  
  scores.forEach((score, ruleId) => {
    const weight = weights?.get(ruleId) || 1.0;
    totalScore += score.score * weight;
    totalMaxScore += score.maxScore * weight;
  });
  
  const percentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
  const grade = getLetterGrade(percentage);
  
  return {
    score: percentage,
    grade,
    passed: percentage >= 60,
    breakdown,
    findings: [],
    totalFindings: 0,
    criticalFindings: 0,
    majorFindings: 0,
    minorFindings: 0,
    excellence: percentage >= 90
  };
}

/**
 * Apply excellence bonuses for exceptional API quality
 */
export function applyExcellenceBonuses(
  grade: GradeResult,
  spec: any
): GradeResult {
  let bonusPoints = 0;
  
  // Check for excellence criteria
  if (spec.info?.version && /^\d+\.\d+\.\d+$/.test(spec.info.version)) {
    bonusPoints += 2; // Semantic versioning bonus
  }
  
  if (spec.components?.securitySchemes?.OAuth2) {
    bonusPoints += 3; // OAuth2 implementation bonus
  }
  
  // Apply bonuses (cap at 100)
  const newScore = Math.min(100, grade.score + bonusPoints);
  
  return {
    ...grade,
    score: newScore,
    grade: getLetterGrade(newScore),
    excellence: newScore >= 90
  };
}

/**
 * Get detailed coverage metrics for the API
 */
export function getCoverageMetrics(scores: Map<string, RuleScore>): CoverageMetrics {
  let totalTargets = 0;
  let passedTargets = 0;
  const categoryBreakdown = new Map<string, { passed: number; total: number }>();
  
  scores.forEach((score) => {
    totalTargets += score.targetsChecked;
    passedTargets += score.targetsPassed;
    
    // Group by category (simplified)
    const category = 'general';
    const existing = categoryBreakdown.get(category) || { passed: 0, total: 0 };
    categoryBreakdown.set(category, {
      passed: existing.passed + score.targetsPassed,
      total: existing.total + score.targetsChecked
    });
  });
  
  return {
    totalTargets,
    passedTargets,
    failedTargets: totalTargets - passedTargets,
    coveragePercentage: totalTargets > 0 ? (passedTargets / totalTargets) * 100 : 0,
    categoryBreakdown
  };
}

/**
 * Generate comprehensive coverage-based report
 */
export function generateCoverageBasedReport(
  spec: any,
  scores: Map<string, RuleScore>
): CoverageBasedReport {
  const metrics = getCoverageMetrics(scores);
  const grade = calculateWeightedGrade(scores);
  
  const categoryScores: CategoryBreakdown[] = [];
  metrics.categoryBreakdown.forEach((stats, category) => {
    const percentage = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
    categoryScores.push({
      category,
      weight: 1.0,
      maxPoints: stats.total,
      earnedPoints: stats.passed,
      percentage,
      weightedScore: percentage
    });
  });
  
  const recommendations: string[] = [];
  if (metrics.coveragePercentage < 80) {
    recommendations.push('Increase test coverage to at least 80%');
  }
  
  return {
    overallCoverage: metrics.coveragePercentage,
    categoryScores,
    recommendations,
    grade: grade.grade,
    excellence: grade.excellence
  };
}

/**
 * Compare coverage scoring between two API versions
 */
export function compareCoverageScoring(
  currentScores: Map<string, RuleScore>,
  previousScores: Map<string, RuleScore>
): {
  improved: string[];
  degraded: string[];
  unchanged: string[];
  coverageDelta: number;
} {
  const improved: string[] = [];
  const degraded: string[] = [];
  const unchanged: string[] = [];
  
  const currentMetrics = getCoverageMetrics(currentScores);
  const previousMetrics = getCoverageMetrics(previousScores);
  
  currentScores.forEach((score, ruleId) => {
    const prevScore = previousScores.get(ruleId);
    if (!prevScore) return;
    
    if (score.coverage > prevScore.coverage) {
      improved.push(ruleId);
    } else if (score.coverage < prevScore.coverage) {
      degraded.push(ruleId);
    } else {
      unchanged.push(ruleId);
    }
  });
  
  return {
    improved,
    degraded,
    unchanged,
    coverageDelta: currentMetrics.coveragePercentage - previousMetrics.coveragePercentage
  };
}

/**
 * Identify optimal improvements based on effort vs impact
 */
export function identifyOptimalImprovements(
  scores: Map<string, RuleScore>,
  maxSuggestions: number = 5
): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];
  
  scores.forEach((score, ruleId) => {
    if (score.coverage < 1.0) {
      const impact = (1.0 - score.coverage) * score.maxScore;
      suggestions.push({
        ruleId,
        impact,
        effort: impact > 5 ? 'high' : impact > 2 ? 'medium' : 'low',
        description: `Improve ${ruleId} coverage from ${(score.coverage * 100).toFixed(1)}% to 100%`
      });
    }
  });
  
  // Sort by impact (descending) and return top suggestions
  return suggestions
    .sort((a, b) => b.impact - a.impact)
    .slice(0, maxSuggestions);
}

/**
 * Helper function to get letter grade from percentage
 */
function getLetterGrade(percentage: number): string {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}