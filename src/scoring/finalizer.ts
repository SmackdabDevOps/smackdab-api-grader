// Final Score Calculation and Grade Assignment
// Normalizes scores, applies weights, and generates final grade

import { DependencyAwareScore } from './dependencies.js';
import { Finding } from './prerequisites.js';

export interface CategoryBreakdown {
  category: string;
  weight: number;
  maxPoints: number;
  earnedPoints: number;
  percentage: number;
  weightedScore: number;
}

export interface GradeResult {
  score: number;           // Final score 0-100
  grade: string;          // Letter grade
  passed: boolean;        // Whether API meets minimum standards
  breakdown: CategoryBreakdown[];
  findings: Finding[];
  totalFindings: number;
  criticalFindings: number;
  majorFindings: number;
  minorFindings: number;
  excellence: boolean;    // Whether API achieves excellence (90+)
}

// Default category weights (must sum to 1.0)
export const DEFAULT_WEIGHTS = {
  functionality: 0.30,   // 30% of total score
  security: 0.25,        // 25% of total score
  scalability: 0.20,     // 20% of total score
  maintainability: 0.15, // 15% of total score
  excellence: 0.10       // 10% of total score
};

// Grade thresholds
const GRADE_THRESHOLDS = [
  { min: 97, grade: 'A+' },
  { min: 93, grade: 'A' },
  { min: 90, grade: 'A-' },
  { min: 87, grade: 'B+' },
  { min: 83, grade: 'B' },
  { min: 80, grade: 'B-' },
  { min: 77, grade: 'C+' },
  { min: 73, grade: 'C' },
  { min: 70, grade: 'C-' },
  { min: 67, grade: 'D+' },
  { min: 63, grade: 'D' },
  { min: 60, grade: 'D-' },
  { min: 0, grade: 'F' }
];

/**
 * Calculate the final grade from rule scores
 */
export function calculateFinalGrade(
  ruleScores: Map<string, DependencyAwareScore>,
  weights: typeof DEFAULT_WEIGHTS = DEFAULT_WEIGHTS,
  passingScore: number = 70
): GradeResult {
  // Initialize category totals
  const categories: Map<string, CategoryBreakdown> = new Map();
  
  for (const [category, weight] of Object.entries(weights)) {
    categories.set(category, {
      category,
      weight,
      maxPoints: 0,
      earnedPoints: 0,
      percentage: 0,
      weightedScore: 0
    });
  }
  
  // Collect all findings
  const allFindings: Finding[] = [];
  
  // Sum scores by category
  for (const score of ruleScores.values()) {
    const cat = categories.get(score.category);
    if (!cat) {
      console.warn(`Unknown category: ${score.category}`);
      continue;
    }
    
    // Add to category totals
    cat.maxPoints += score.maxScore;
    cat.earnedPoints += score.score;
    
    // Collect findings
    allFindings.push(...score.findings);
  }
  
  // Calculate percentages and weighted scores
  let totalWeightedScore = 0;
  const breakdown: CategoryBreakdown[] = [];
  
  for (const cat of categories.values()) {
    // Calculate percentage within category
    cat.percentage = cat.maxPoints > 0 ? cat.earnedPoints / cat.maxPoints : 0;
    
    // Calculate weighted contribution to final score
    cat.weightedScore = cat.percentage * cat.weight * 100;
    totalWeightedScore += cat.weightedScore;
    
    breakdown.push(cat);
  }
  
  // Ensure score is within bounds
  const finalScore = Math.min(100, Math.max(0, Math.round(totalWeightedScore)));
  
  // Determine letter grade
  const letterGrade = getLetterGrade(finalScore);
  
  // Count findings by severity
  let criticalFindings = 0;
  let majorFindings = 0;
  let minorFindings = 0;
  
  for (const finding of allFindings) {
    switch (finding.severity) {
      case 'critical':
        criticalFindings++;
        break;
      case 'major':
        majorFindings++;
        break;
      case 'minor':
      case 'info':
        minorFindings++;
        break;
    }
  }
  
  return {
    score: finalScore,
    grade: letterGrade,
    passed: finalScore >= passingScore,
    breakdown,
    findings: sortFindings(allFindings),
    totalFindings: allFindings.length,
    criticalFindings,
    majorFindings,
    minorFindings,
    excellence: finalScore >= 90
  };
}

/**
 * Get letter grade from numeric score
 */
export function getLetterGrade(score: number): string {
  for (const threshold of GRADE_THRESHOLDS) {
    if (score >= threshold.min) {
      return threshold.grade;
    }
  }
  return 'F';
}

/**
 * Sort findings for consistent output
 */
function sortFindings(findings: Finding[]): Finding[] {
  return findings.sort((a, b) => {
    // Sort by severity first
    const severityOrder = { critical: 0, major: 1, minor: 2, info: 3 };
    const sevDiff = (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
    if (sevDiff !== 0) return sevDiff;
    
    // Then by category
    if (a.category && b.category && a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    
    // Then by rule ID
    if (a.ruleId !== b.ruleId) {
      return a.ruleId.localeCompare(b.ruleId);
    }
    
    // Finally by location
    return a.location.localeCompare(b.location);
  });
}

/**
 * Apply profile-specific adjustments
 */
export function applyProfile(
  result: GradeResult,
  profile: 'standard' | 'public' | 'internal' | 'prototype'
): GradeResult {
  // Profile-specific adjustments
  switch (profile) {
    case 'public':
      // Public APIs need higher standards
      if (result.score < 80) {
        result.passed = false;
      }
      break;
      
    case 'internal':
      // Internal APIs can have slightly lower standards
      if (result.score >= 65) {
        result.passed = true;
      }
      break;
      
    case 'prototype':
      // Prototypes just need to be functional
      if (result.score >= 50) {
        result.passed = true;
      }
      break;
      
    case 'standard':
    default:
      // Standard thresholds apply
      break;
  }
  
  return result;
}

/**
 * Generate a summary message for the grade
 */
export function generateGradeSummary(result: GradeResult): string {
  const lines: string[] = [];
  
  // Overall grade
  const emoji = result.excellence ? '🌟' :
                result.passed ? '✅' :
                result.score >= 60 ? '⚠️' : '❌';
  
  lines.push(`${emoji} API Grade: ${result.score}/100 (${result.grade})`);
  lines.push('');
  
  // Status message
  if (result.excellence) {
    lines.push('🎉 Excellent API! This is a reference implementation.');
  } else if (result.passed) {
    lines.push('✅ API meets standards and is production-ready.');
  } else if (result.score >= 60) {
    lines.push('⚠️ API needs improvements before production deployment.');
  } else {
    lines.push('❌ API has critical issues that must be addressed.');
  }
  
  // Category breakdown
  lines.push('');
  lines.push('Category Breakdown:');
  
  for (const cat of result.breakdown) {
    const pct = (cat.percentage * 100).toFixed(1);
    const catEmoji = cat.percentage >= 0.9 ? '✅' :
                     cat.percentage >= 0.7 ? '🟡' : '🔴';
    
    lines.push(`  ${catEmoji} ${cat.category}: ${pct}% (${cat.earnedPoints.toFixed(1)}/${cat.maxPoints} points)`);
  }
  
  // Finding summary
  if (result.totalFindings > 0) {
    lines.push('');
    lines.push('Issues Found:');
    
    if (result.criticalFindings > 0) {
      lines.push(`  🔴 Critical: ${result.criticalFindings}`);
    }
    if (result.majorFindings > 0) {
      lines.push(`  🟠 Major: ${result.majorFindings}`);
    }
    if (result.minorFindings > 0) {
      lines.push(`  🟡 Minor: ${result.minorFindings}`);
    }
  }
  
  // Recommendations
  lines.push('');
  if (result.excellence) {
    lines.push('💡 Consider adding advanced features like webhooks or GraphQL.');
  } else if (result.passed) {
    lines.push('💡 Focus on the remaining issues to achieve excellence.');
  } else {
    lines.push('💡 Start by fixing critical and major issues first.');
  }
  
  return lines.join('\n');
}

/**
 * Compare two grade results
 */
export function compareGrades(
  baseline: GradeResult,
  current: GradeResult
): {
  scoreDelta: number;
  gradeDelta: string;
  improved: boolean;
  fixedFindings: number;
  newFindings: number;
  message: string;
} {
  const scoreDelta = current.score - baseline.score;
  const gradeDelta = `${baseline.grade} → ${current.grade}`;
  const improved = scoreDelta > 0;
  
  // Calculate finding changes
  const baselineIds = new Set(baseline.findings.map(f => `${f.ruleId}:${f.location}`));
  const currentIds = new Set(current.findings.map(f => `${f.ruleId}:${f.location}`));
  
  let fixedFindings = 0;
  let newFindings = 0;
  
  for (const id of baselineIds) {
    if (!currentIds.has(id)) {
      fixedFindings++;
    }
  }
  
  for (const id of currentIds) {
    if (!baselineIds.has(id)) {
      newFindings++;
    }
  }
  
  // Generate message
  let message = '';
  if (improved) {
    message = `📈 Improved by ${scoreDelta} points! `;
    if (fixedFindings > 0) {
      message += `Fixed ${fixedFindings} issue(s). `;
    }
  } else if (scoreDelta < 0) {
    message = `📉 Decreased by ${Math.abs(scoreDelta)} points. `;
    if (newFindings > 0) {
      message += `${newFindings} new issue(s) found. `;
    }
  } else {
    message = '➡️ No change in score. ';
  }
  
  return {
    scoreDelta,
    gradeDelta,
    improved,
    fixedFindings,
    newFindings,
    message
  };
}

/**
 * Check if a score would trigger an auto-fail in the old system
 * This is for backward compatibility checks
 */
export function wouldLegacyAutoFail(result: GradeResult): boolean {
  // Check for issues that would trigger auto-fail in old system
  for (const finding of result.findings) {
    // These were auto-fail conditions in the old system
    if (finding.ruleId === 'PREREQ-001' ||  // Wrong OpenAPI version
        finding.ruleId === 'PREREQ-002' ||  // No auth
        finding.ruleId === 'PREREQ-003' ||  // Missing X-Organization-ID on writes
        finding.ruleId === 'NAME-NAMESPACE' ||  // Path namespace
        finding.ruleId === 'PAG-NO-OFFSET') {  // Forbidden pagination
      return true;
    }
  }
  
  return false;
}