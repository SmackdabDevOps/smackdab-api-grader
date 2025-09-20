// Coverage-Based Scoring System
// Scores rules based on coverage percentage, not violation count
// This prevents double-counting and size bias

import { RULE_REGISTRY, Rule, Target, ValidationResult } from '../rules/registry.js';
import { Finding } from './prerequisites.js';

export interface RuleScore {
  ruleId: string;
  ruleName: string;
  category: string;
  severity: string;
  applicable: boolean;
  coverage: number;      // 0.0 to 1.0
  score: number;         // Points earned
  maxScore: number;      // Maximum possible points
  targetsChecked: number;
  targetsPassed: number;
  findings: Finding[];
}

export interface CategoryScore {
  category: string;
  earned: number;
  maximum: number;
  percentage: number;
  ruleCount: number;
  rulesApplicable: number;
  rulesPassed: number;
}

/**
 * Score a single rule based on coverage
 * The key innovation: score = coverage * max_points
 */
export function scoreRule(rule: Rule, spec: any): RuleScore {
  // Detect targets for this rule
  const targets = rule.detect(spec);
  
  // No targets = rule not applicable = full points (doesn't penalize APIs for not having certain features)
  if (targets.length === 0) {
    return {
      ruleId: rule.id,
      ruleName: rule.description,
      category: rule.category,
      severity: rule.severity,
      applicable: false,
      coverage: 1.0,
      score: rule.points,  // Full points for non-applicable rules
      maxScore: rule.points,
      targetsChecked: 0,
      targetsPassed: 0,
      findings: []
    };
  }
  
  // Check each target
  const results: Array<{ target: Target; result: ValidationResult }> = [];
  for (const target of targets) {
    const result = rule.validate(target, spec);
    results.push({ target, result });
  }
  
  // Calculate basic coverage
  const passed = results.filter(r => r.result.passed).length;
  const total = results.length;
  const simpleCoverage = total > 0 ? passed / total : 0;
  
  // Calculate weighted coverage if targets have different importance
  const weights = calculateTargetWeights(targets, spec, rule);
  const weightedPassed = results.reduce((sum, r, i) => 
    sum + (r.result.passed ? weights[i] : 0), 0
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedCoverage = totalWeight > 0 ? weightedPassed / totalWeight : 0;
  
  // Use weighted coverage if weights are meaningful, otherwise use simple
  const coverage = weights.every(w => w === 1.0) ? simpleCoverage : weightedCoverage;
  
  // Score is coverage * max points
  const score = coverage * rule.points;
  
  // Generate findings for failures
  const findings: Finding[] = results
    .filter(r => !r.result.passed)
    .map(r => ({
      ruleId: rule.id,
      severity: mapSeverity(rule.severity),
      message: `${r.target.identifier}: ${r.result.message}`,
      location: r.target.location,
      fixHint: r.result.fixHint,
      category: rule.category
    }));
  
  return {
    ruleId: rule.id,
    ruleName: rule.description,
    category: rule.category,
    severity: rule.severity,
    applicable: true,
    coverage,
    score,
    maxScore: rule.points,
    targetsChecked: total,
    targetsPassed: passed,
    findings
  };
}

/**
 * Calculate weights for targets based on their importance
 * For Phase 1, we use equal weights. Phase 2 will add intelligence.
 */
function calculateTargetWeights(targets: Target[], spec: any, rule: Rule): number[] {
  // Phase 1: All targets weighted equally
  const equalWeight = targets.map(() => 1.0);
  
  // Phase 2 enhancements (commented out for now):
  /*
  // Weight by operation importance
  if (rule.category === 'security' || rule.category === 'functionality') {
    return targets.map(target => {
      // Critical operations get higher weight
      if (target.method === 'delete' || target.method === 'post') return 1.5;
      if (target.method === 'put' || target.method === 'patch') return 1.2;
      if (target.method === 'get') return 1.0;
      return 0.8;
    });
  }
  
  // Weight by path criticality
  if (rule.category === 'scalability') {
    return targets.map(target => {
      // List operations more important for pagination
      if (target.path?.match(/s$/)) return 1.5;
      // Single resource operations less important
      if (target.path?.match(/\{[^}]+\}$/)) return 0.8;
      return 1.0;
    });
  }
  */
  
  return equalWeight;
}

/**
 * Score all applicable rules
 */
export function scoreAllRules(spec: any, ruleIds?: string[]): Map<string, RuleScore> {
  const scores = new Map<string, RuleScore>();
  
  // Get rules to score (all or specified subset)
  const rulesToScore = ruleIds 
    ? ruleIds.map(id => RULE_REGISTRY[id]).filter(r => r)
    : Object.values(RULE_REGISTRY);
  
  // Score each rule
  for (const rule of rulesToScore) {
    // Skip prerequisites - they're handled separately
    if (rule.severity === 'prerequisite') {
      continue;
    }
    
    const score = scoreRule(rule, spec);
    scores.set(rule.id, score);
  }
  
  return scores;
}

/**
 * Calculate scores by category
 */
export function calculateCategoryScores(ruleScores: Map<string, RuleScore>): Map<string, CategoryScore> {
  const categories = new Map<string, CategoryScore>();
  
  // Initialize categories
  const categoryNames = ['functionality', 'security', 'scalability', 'maintainability', 'excellence'];
  for (const category of categoryNames) {
    categories.set(category, {
      category,
      earned: 0,
      maximum: 0,
      percentage: 0,
      ruleCount: 0,
      rulesApplicable: 0,
      rulesPassed: 0
    });
  }
  
  // Aggregate scores by category
  for (const score of ruleScores.values()) {
    const cat = categories.get(score.category);
    if (!cat) continue;
    
    cat.ruleCount++;
    cat.maximum += score.maxScore;
    cat.earned += score.score;
    
    if (score.applicable) {
      cat.rulesApplicable++;
      if (score.coverage === 1.0) {
        cat.rulesPassed++;
      }
    }
  }
  
  // Calculate percentages
  for (const cat of categories.values()) {
    cat.percentage = cat.maximum > 0 ? cat.earned / cat.maximum : 0;
  }
  
  return categories;
}

/**
 * Map rule severity to finding severity
 */
function mapSeverity(ruleSeverity: string): 'critical' | 'major' | 'minor' | 'info' {
  switch (ruleSeverity) {
    case 'prerequisite':
    case 'critical':
      return 'critical';
    case 'major':
      return 'major';
    case 'minor':
      return 'minor';
    default:
      return 'info';
  }
}

/**
 * Get improvement opportunities sorted by impact
 */
export function getImprovementOpportunities(ruleScores: Map<string, RuleScore>): Array<{
  ruleId: string;
  ruleName: string;
  category: string;
  currentCoverage: number;
  potentialPoints: number;
  fixCount: number;
  effort?: string;
}> {
  const opportunities = [];
  
  for (const score of ruleScores.values()) {
    // Skip rules with perfect coverage
    if (score.coverage === 1.0) continue;
    
    // Skip non-applicable rules
    if (!score.applicable) continue;
    
    const rule = RULE_REGISTRY[score.ruleId];
    const potentialPoints = score.maxScore - score.score;
    
    opportunities.push({
      ruleId: score.ruleId,
      ruleName: score.ruleName,
      category: score.category,
      currentCoverage: score.coverage,
      potentialPoints,
      fixCount: score.targetsChecked - score.targetsPassed,
      effort: rule?.effort
    });
  }
  
  // Sort by potential points (highest first)
  opportunities.sort((a, b) => b.potentialPoints - a.potentialPoints);
  
  return opportunities;
}

/**
 * Calculate coverage statistics
 */
export function calculateCoverageStats(ruleScores: Map<string, RuleScore>): {
  totalRules: number;
  applicableRules: number;
  perfectRules: number;
  averageCoverage: number;
  worstCoverage: { ruleId: string; coverage: number };
  bestPartialCoverage: { ruleId: string; coverage: number };
} {
  let totalRules = 0;
  let applicableRules = 0;
  let perfectRules = 0;
  let coverageSum = 0;
  let worstCoverage = { ruleId: '', coverage: 1.0 };
  let bestPartialCoverage = { ruleId: '', coverage: 0.0 };
  
  for (const score of ruleScores.values()) {
    totalRules++;
    
    if (score.applicable) {
      applicableRules++;
      coverageSum += score.coverage;
      
      if (score.coverage === 1.0) {
        perfectRules++;
      } else {
        // Track worst coverage
        if (score.coverage < worstCoverage.coverage) {
          worstCoverage = { ruleId: score.ruleId, coverage: score.coverage };
        }
        
        // Track best partial coverage (not perfect but good)
        if (score.coverage > bestPartialCoverage.coverage && score.coverage < 1.0) {
          bestPartialCoverage = { ruleId: score.ruleId, coverage: score.coverage };
        }
      }
    }
  }
  
  return {
    totalRules,
    applicableRules,
    perfectRules,
    averageCoverage: applicableRules > 0 ? coverageSum / applicableRules : 0,
    worstCoverage,
    bestPartialCoverage
  };
}

/**
 * Generate a coverage report for debugging
 */
export function generateCoverageReport(ruleScores: Map<string, RuleScore>): string {
  const lines: string[] = [
    '=== Coverage-Based Scoring Report ===',
    ''
  ];
  
  // Group by category
  const byCategory = new Map<string, RuleScore[]>();
  for (const score of ruleScores.values()) {
    if (!byCategory.has(score.category)) {
      byCategory.set(score.category, []);
    }
    byCategory.get(score.category)!.push(score);
  }
  
  // Report each category
  for (const [category, scores] of byCategory) {
    const categoryTotal = scores.reduce((sum, s) => sum + s.score, 0);
    const categoryMax = scores.reduce((sum, s) => sum + s.maxScore, 0);
    const categoryPct = categoryMax > 0 ? (categoryTotal / categoryMax * 100).toFixed(1) : '0.0';
    
    lines.push(`📊 ${category.toUpperCase()} (${categoryTotal.toFixed(1)}/${categoryMax} = ${categoryPct}%)`);
    
    for (const score of scores) {
      const pct = (score.coverage * 100).toFixed(1);
      const status = score.coverage === 1.0 ? '✅' : 
                    score.coverage === 0.0 ? '❌' : '⚠️';
      
      if (score.applicable) {
        lines.push(`  ${status} ${score.ruleName}`);
        lines.push(`     Coverage: ${score.targetsPassed}/${score.targetsChecked} = ${pct}%`);
        lines.push(`     Points: ${score.score.toFixed(1)}/${score.maxScore}`);
      } else {
        lines.push(`  ➖ ${score.ruleName} (N/A - no targets)`);
      }
    }
    
    lines.push('');
  }
  
  // Summary stats
  const stats = calculateCoverageStats(ruleScores);
  lines.push('=== Summary ===');
  lines.push(`Total Rules: ${stats.totalRules}`);
  lines.push(`Applicable: ${stats.applicableRules}`);
  lines.push(`Perfect Coverage: ${stats.perfectRules}`);
  lines.push(`Average Coverage: ${(stats.averageCoverage * 100).toFixed(1)}%`);
  
  if (stats.worstCoverage.ruleId) {
    lines.push(`Worst Coverage: ${stats.worstCoverage.ruleId} (${(stats.worstCoverage.coverage * 100).toFixed(1)}%)`);
  }
  
  return lines.join('\n');
}