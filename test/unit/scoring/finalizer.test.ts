import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  calculateFinalGrade,
  getLetterGrade,
  applyProfile,
  generateGradeSummary,
  compareGrades,
  wouldLegacyAutoFail,
  DEFAULT_WEIGHTS,
  CategoryBreakdown,
  GradeResult
} from '../../../src/scoring/finalizer';
import { DependencyAwareScore } from '../../../src/scoring/dependencies';

describe('Final Grade Calculation and Assignment', () => {
  // Mock rule scores for testing
  const createMockScore = (
    ruleId: string,
    category: string,
    score: number,
    maxScore: number,
    coverage: number = score / maxScore,
    findings: any[] = []
  ): DependencyAwareScore => ({
    ruleId,
    ruleName: `Rule ${ruleId}`,
    category,
    severity: 'major',
    applicable: true,
    coverage,
    score,
    maxScore,
    targetsChecked: 5,
    targetsPassed: Math.round(coverage * 5),
    findings,
    skipped: false
  });

  const perfectScores = new Map<string, DependencyAwareScore>([
    ['FUNC-001', createMockScore('FUNC-001', 'functionality', 30, 30, 1.0)],
    ['SEC-001', createMockScore('SEC-001', 'security', 25, 25, 1.0)],
    ['SCALE-001', createMockScore('SCALE-001', 'scalability', 20, 20, 1.0)],
    ['MAINT-001', createMockScore('MAINT-001', 'maintainability', 15, 15, 1.0)],
    ['EXCEL-001', createMockScore('EXCEL-001', 'excellence', 10, 10, 1.0)]
  ]);

  const mixedScores = new Map<string, DependencyAwareScore>([
    ['FUNC-001', createMockScore('FUNC-001', 'functionality', 20, 30, 0.67)],
    ['FUNC-002', createMockScore('FUNC-002', 'functionality', 15, 20, 0.75)],
    ['SEC-001', createMockScore('SEC-001', 'security', 20, 25, 0.80)],
    ['SEC-002', createMockScore('SEC-002', 'security', 10, 15, 0.67)],
    ['SCALE-001', createMockScore('SCALE-001', 'scalability', 15, 20, 0.75)],
    ['MAINT-001', createMockScore('MAINT-001', 'maintainability', 10, 15, 0.67)],
    ['EXCEL-001', createMockScore('EXCEL-001', 'excellence', 5, 10, 0.50)]
  ]);

  const failingScores = new Map<string, DependencyAwareScore>([
    ['FUNC-001', createMockScore('FUNC-001', 'functionality', 5, 30, 0.17, [
      { ruleId: 'FUNC-001', severity: 'critical', message: 'Missing operations', location: '$.paths' }
    ])],
    ['SEC-001', createMockScore('SEC-001', 'security', 0, 25, 0.0, [
      { ruleId: 'SEC-001', severity: 'critical', message: 'No security', location: '$.components' }
    ])],
    ['SCALE-001', createMockScore('SCALE-001', 'scalability', 3, 20, 0.15)],
    ['MAINT-001', createMockScore('MAINT-001', 'maintainability', 2, 15, 0.13)],
    ['EXCEL-001', createMockScore('EXCEL-001', 'excellence', 0, 10, 0.0)]
  ]);

  describe('calculateFinalGrade', () => {
    test('should calculate perfect grade correctly', () => {
      const result = calculateFinalGrade(perfectScores);

      expect(result.score).toBe(100);
      expect(result.grade).toBe('A+');
      expect(result.passed).toBe(true);
      expect(result.excellence).toBe(true);
      expect(result.totalFindings).toBe(0);
    });

    test('should calculate mixed grade correctly', () => {
      const result = calculateFinalGrade(mixedScores);

      // Calculate expected weighted score
      // functionality: (35/50) * 30% = 21%
      // security: (30/40) * 25% = 18.75%  
      // scalability: (15/20) * 20% = 15%
      // maintainability: (10/15) * 15% = 10%
      // excellence: (5/10) * 10% = 5%
      // Total: ~69.75%
      
      expect(result.score).toBeCloseTo(70, 0); // Rounded
      expect(result.grade).toBe('C-');
      expect(result.passed).toBe(true);
      expect(result.excellence).toBe(false);
    });

    test('should calculate failing grade correctly', () => {
      const result = calculateFinalGrade(failingScores);

      expect(result.score).toBeLessThan(50);
      expect(result.grade).toBe('F');
      expect(result.passed).toBe(false);
      expect(result.excellence).toBe(false);
      expect(result.criticalFindings).toBeGreaterThan(0);
    });

    test('should handle custom weights', () => {
      const customWeights = {
        functionality: 0.50, // Higher weight
        security: 0.30,
        scalability: 0.10,
        maintainability: 0.05,
        excellence: 0.05
      };

      const result = calculateFinalGrade(mixedScores, customWeights);

      // With higher functionality weight, score should be different
      expect(result.score).not.toBe(calculateFinalGrade(mixedScores).score);
      expect(result.breakdown[0].weight).toBe(0.50);
    });

    test('should handle custom passing score', () => {
      const result = calculateFinalGrade(mixedScores, DEFAULT_WEIGHTS, 80);

      expect(result.passed).toBe(result.score >= 80);
    });

    test('should create correct category breakdown', () => {
      const result = calculateFinalGrade(mixedScores);

      expect(result.breakdown).toHaveLength(5);
      
      const funcBreakdown = result.breakdown.find(b => b.category === 'functionality');
      expect(funcBreakdown).toBeDefined();
      expect(funcBreakdown!.maxPoints).toBe(50); // 30 + 20
      expect(funcBreakdown!.earnedPoints).toBe(35); // 20 + 15
      expect(funcBreakdown!.percentage).toBeCloseTo(0.70, 2);
      expect(funcBreakdown!.weight).toBe(0.30);
    });

    test('should sort and categorize findings correctly', () => {
      const scoresWithFindings = new Map<string, DependencyAwareScore>([
        ['FUNC-001', createMockScore('FUNC-001', 'functionality', 10, 20, 0.5, [
          { ruleId: 'FUNC-001', severity: 'major', message: 'Major issue', location: '$.paths', category: 'functionality' }
        ])],
        ['SEC-001', createMockScore('SEC-001', 'security', 5, 15, 0.33, [
          { ruleId: 'SEC-001', severity: 'critical', message: 'Critical security issue', location: '$.security', category: 'security' },
          { ruleId: 'SEC-001', severity: 'minor', message: 'Minor security note', location: '$.info', category: 'security' }
        ])]
      ]);

      const result = calculateFinalGrade(scoresWithFindings);

      expect(result.totalFindings).toBe(3);
      expect(result.criticalFindings).toBe(1);
      expect(result.majorFindings).toBe(1);
      expect(result.minorFindings).toBe(1);

      // Should be sorted by severity (critical first)
      expect(result.findings[0].severity).toBe('critical');
      expect(result.findings[1].severity).toBe('major');
      expect(result.findings[2].severity).toBe('minor');
    });

    test('should handle empty rule scores', () => {
      const result = calculateFinalGrade(new Map());

      expect(result.score).toBe(0);
      expect(result.grade).toBe('F');
      expect(result.passed).toBe(false);
      expect(result.breakdown).toHaveLength(5); // Should still have all categories
      
      // All categories should have zero points
      for (const category of result.breakdown) {
        expect(category.maxPoints).toBe(0);
        expect(category.earnedPoints).toBe(0);
        expect(category.percentage).toBe(0);
      }
    });

    test('should handle unknown categories gracefully', () => {
      const scoresWithUnknownCategory = new Map<string, DependencyAwareScore>([
        ['UNKNOWN-001', createMockScore('UNKNOWN-001', 'unknown', 10, 15, 0.67)]
      ]);

      // Should log warning but not crash
      const originalWarn = console.warn;
      const warnSpy = jest.fn();
      console.warn = warnSpy;

      const result = calculateFinalGrade(scoresWithUnknownCategory);

      expect(warnSpy).toHaveBeenCalledWith('Unknown category: unknown');
      expect(result.score).toBe(0); // Should be 0 since unknown category ignored

      console.warn = originalWarn;
    });

    test('should ensure score bounds (0-100)', () => {
      // Create scores that could theoretically exceed 100%
      const extremeScores = new Map<string, DependencyAwareScore>([
        ['FUNC-001', createMockScore('FUNC-001', 'functionality', 200, 100, 2.0)] // Impossible but test bounds
      ]);

      const result = calculateFinalGrade(extremeScores);

      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getLetterGrade', () => {
    test('should assign correct letter grades', () => {
      expect(getLetterGrade(98)).toBe('A+');
      expect(getLetterGrade(95)).toBe('A');
      expect(getLetterGrade(91)).toBe('A-');
      expect(getLetterGrade(88)).toBe('B+');
      expect(getLetterGrade(84)).toBe('B');
      expect(getLetterGrade(81)).toBe('B-');
      expect(getLetterGrade(78)).toBe('C+');
      expect(getLetterGrade(74)).toBe('C');
      expect(getLetterGrade(71)).toBe('C-');
      expect(getLetterGrade(68)).toBe('D+');
      expect(getLetterGrade(64)).toBe('D');
      expect(getLetterGrade(61)).toBe('D-');
      expect(getLetterGrade(59)).toBe('F');
      expect(getLetterGrade(0)).toBe('F');
    });

    test('should handle edge cases', () => {
      expect(getLetterGrade(97)).toBe('A+');  // Exactly at threshold
      expect(getLetterGrade(96.9)).toBe('A'); // Just below threshold
      expect(getLetterGrade(-5)).toBe('F');   // Negative score
      expect(getLetterGrade(150)).toBe('A+'); // Over 100
    });
  });

  describe('applyProfile', () => {
    const mockGradeResult: GradeResult = {
      score: 75,
      grade: 'C+',
      passed: true,
      breakdown: [],
      findings: [],
      totalFindings: 0,
      criticalFindings: 0,
      majorFindings: 0,
      minorFindings: 0,
      excellence: false
    };

    test('should apply public profile standards', () => {
      const result = applyProfile({ ...mockGradeResult }, 'public');

      // Public APIs need 80+ to pass
      expect(result.passed).toBe(false);
    });

    test('should apply internal profile standards', () => {
      const lowScoreResult = { ...mockGradeResult, score: 67, passed: false };
      const result = applyProfile(lowScoreResult, 'internal');

      // Internal APIs can pass at 65+
      expect(result.passed).toBe(true);
    });

    test('should apply prototype profile standards', () => {
      const lowScoreResult = { ...mockGradeResult, score: 52, passed: false };
      const result = applyProfile(lowScoreResult, 'prototype');

      // Prototypes can pass at 50+
      expect(result.passed).toBe(true);
    });

    test('should keep standard profile unchanged', () => {
      const result = applyProfile({ ...mockGradeResult }, 'standard');

      expect(result.passed).toBe(mockGradeResult.passed);
      expect(result.score).toBe(mockGradeResult.score);
    });

    test('should not lower passing threshold for public', () => {
      const highScoreResult = { ...mockGradeResult, score: 85, passed: true };
      const result = applyProfile(highScoreResult, 'public');

      // Should still pass if above threshold
      expect(result.passed).toBe(true);
    });
  });

  describe('generateGradeSummary', () => {
    test('should generate excellent grade summary', () => {
      const excellentResult: GradeResult = {
        score: 95,
        grade: 'A',
        passed: true,
        excellence: true,
        breakdown: [
          { category: 'functionality', weight: 0.3, maxPoints: 30, earnedPoints: 28, percentage: 0.93, weightedScore: 28 },
          { category: 'security', weight: 0.25, maxPoints: 25, earnedPoints: 24, percentage: 0.96, weightedScore: 24 }
        ],
        findings: [],
        totalFindings: 0,
        criticalFindings: 0,
        majorFindings: 0,
        minorFindings: 0
      };

      const summary = generateGradeSummary(excellentResult);

      expect(summary).toContain('🌟');
      expect(summary).toContain('95/100');
      expect(summary).toContain('(A)');
      expect(summary).toContain('Excellent API');
      expect(summary).toContain('reference implementation');
      expect(summary).toContain('✅ functionality: 93.0%');
      expect(summary).toContain('webhooks or GraphQL');
    });

    test('should generate passing grade summary', () => {
      const passingResult: GradeResult = {
        score: 80,
        grade: 'B-',
        passed: true,
        excellence: false,
        breakdown: [
          { category: 'functionality', weight: 0.3, maxPoints: 30, earnedPoints: 24, percentage: 0.80, weightedScore: 24 }
        ],
        findings: [],
        totalFindings: 0,
        criticalFindings: 0,
        majorFindings: 0,
        minorFindings: 0
      };

      const summary = generateGradeSummary(passingResult);

      expect(summary).toContain('✅');
      expect(summary).toContain('80/100');
      expect(summary).toContain('production-ready');
      expect(summary).toContain('remaining issues to achieve excellence');
    });

    test('should generate failing grade summary', () => {
      const failingResult: GradeResult = {
        score: 45,
        grade: 'F',
        passed: false,
        excellence: false,
        breakdown: [
          { category: 'functionality', weight: 0.3, maxPoints: 30, earnedPoints: 10, percentage: 0.33, weightedScore: 10 }
        ],
        findings: [
          { ruleId: 'TEST', severity: 'critical', message: 'Critical issue', location: '$.test' }
        ],
        totalFindings: 3,
        criticalFindings: 1,
        majorFindings: 1,
        minorFindings: 1
      };

      const summary = generateGradeSummary(failingResult);

      expect(summary).toContain('❌');
      expect(summary).toContain('45/100');
      expect(summary).toContain('critical issues');
      expect(summary).toContain('🔴 Critical: 1');
      expect(summary).toContain('🟠 Major: 1');
      expect(summary).toContain('🟡 Minor: 1');
      expect(summary).toContain('fixing critical and major issues first');
    });

    test('should generate warning grade summary', () => {
      const warningResult: GradeResult = {
        score: 65,
        grade: 'D+',
        passed: false,
        excellence: false,
        breakdown: [],
        findings: [],
        totalFindings: 0,
        criticalFindings: 0,
        majorFindings: 0,
        minorFindings: 0
      };

      const summary = generateGradeSummary(warningResult);

      expect(summary).toContain('⚠️');
      expect(summary).toContain('65/100');
      expect(summary).toContain('needs improvements before production');
    });

    test('should handle category breakdown correctly', () => {
      const result: GradeResult = {
        score: 85,
        grade: 'B',
        passed: true,
        excellence: false,
        breakdown: [
          { category: 'functionality', weight: 0.3, maxPoints: 30, earnedPoints: 27, percentage: 0.90, weightedScore: 27 },
          { category: 'security', weight: 0.25, maxPoints: 25, earnedPoints: 18, percentage: 0.72, weightedScore: 18 },
          { category: 'scalability', weight: 0.2, maxPoints: 20, earnedPoints: 12, percentage: 0.60, weightedScore: 12 }
        ],
        findings: [],
        totalFindings: 0,
        criticalFindings: 0,
        majorFindings: 0,
        minorFindings: 0
      };

      const summary = generateGradeSummary(result);

      expect(summary).toContain('✅ functionality: 90.0%');
      expect(summary).toContain('🟡 security: 72.0%');
      expect(summary).toContain('🔴 scalability: 60.0%');
    });
  });

  describe('compareGrades', () => {
    const baselineGrade: GradeResult = {
      score: 70,
      grade: 'C-',
      passed: true,
      excellence: false,
      breakdown: [],
      findings: [
        { ruleId: 'OLD-1', severity: 'major', message: 'Old issue 1', location: '$.old1' },
        { ruleId: 'OLD-2', severity: 'minor', message: 'Old issue 2', location: '$.old2' },
        { ruleId: 'FIXED', severity: 'major', message: 'This will be fixed', location: '$.fixed' }
      ],
      totalFindings: 3,
      criticalFindings: 0,
      majorFindings: 2,
      minorFindings: 1
    };

    test('should detect improvements', () => {
      const improvedGrade: GradeResult = {
        ...baselineGrade,
        score: 85,
        grade: 'B',
        findings: [
          { ruleId: 'OLD-1', severity: 'major', message: 'Old issue 1', location: '$.old1' },
          { ruleId: 'NEW', severity: 'minor', message: 'New minor issue', location: '$.new' }
        ],
        totalFindings: 2,
        majorFindings: 1,
        minorFindings: 1
      };

      const comparison = compareGrades(baselineGrade, improvedGrade);

      expect(comparison.improved).toBe(true);
      expect(comparison.scoreDelta).toBe(15);
      expect(comparison.gradeDelta).toBe('C- → B');
      expect(comparison.fixedFindings).toBe(2); // OLD-2 and FIXED were removed
      expect(comparison.newFindings).toBe(1);   // NEW was added
      expect(comparison.message).toContain('📈');
      expect(comparison.message).toContain('Improved by 15 points');
      expect(comparison.message).toContain('Fixed 2 issue(s)');
    });

    test('should detect regressions', () => {
      const regressedGrade: GradeResult = {
        ...baselineGrade,
        score: 60,
        grade: 'D-',
        passed: false,
        findings: [
          ...baselineGrade.findings,
          { ruleId: 'NEW-CRITICAL', severity: 'critical', message: 'New critical issue', location: '$.critical' }
        ],
        totalFindings: 4,
        criticalFindings: 1,
        majorFindings: 2,
        minorFindings: 1
      };

      const comparison = compareGrades(baselineGrade, regressedGrade);

      expect(comparison.improved).toBe(false);
      expect(comparison.scoreDelta).toBe(-10);
      expect(comparison.gradeDelta).toBe('C- → D-');
      expect(comparison.fixedFindings).toBe(0);
      expect(comparison.newFindings).toBe(1);
      expect(comparison.message).toContain('📉');
      expect(comparison.message).toContain('Decreased by 10 points');
      expect(comparison.message).toContain('1 new issue(s) found');
    });

    test('should handle no change', () => {
      const unchangedGrade: GradeResult = {
        ...baselineGrade,
        findings: [
          { ruleId: 'OLD-1', severity: 'major', message: 'Old issue 1', location: '$.old1' },
          { ruleId: 'OLD-2', severity: 'minor', message: 'Old issue 2', location: '$.old2' },
          { ruleId: 'FIXED', severity: 'major', message: 'This will be fixed', location: '$.fixed' }
        ]
      };

      const comparison = compareGrades(baselineGrade, unchangedGrade);

      expect(comparison.improved).toBe(false);
      expect(comparison.scoreDelta).toBe(0);
      expect(comparison.gradeDelta).toBe('C- → C-');
      expect(comparison.fixedFindings).toBe(0);
      expect(comparison.newFindings).toBe(0);
      expect(comparison.message).toContain('➡️');
      expect(comparison.message).toContain('No change in score');
    });

    test('should handle finding location changes', () => {
      const changedLocationGrade: GradeResult = {
        ...baselineGrade,
        findings: [
          { ruleId: 'OLD-1', severity: 'major', message: 'Old issue 1', location: '$.old1-moved' }, // Different location
          { ruleId: 'OLD-2', severity: 'minor', message: 'Old issue 2', location: '$.old2' },
          { ruleId: 'FIXED', severity: 'major', message: 'This will be fixed', location: '$.fixed' }
        ]
      };

      const comparison = compareGrades(baselineGrade, changedLocationGrade);

      // Should detect as both fixed and new (same rule, different location)
      expect(comparison.fixedFindings).toBe(1);
      expect(comparison.newFindings).toBe(1);
    });
  });

  describe('wouldLegacyAutoFail', () => {
    test('should detect legacy auto-fail conditions', () => {
      const autoFailResult: GradeResult = {
        score: 85, // High score but has auto-fail issue
        grade: 'B',
        passed: true,
        excellence: false,
        breakdown: [],
        findings: [
          { ruleId: 'PREREQ-001', severity: 'critical', message: 'Wrong OpenAPI version', location: '$.openapi' }
        ],
        totalFindings: 1,
        criticalFindings: 1,
        majorFindings: 0,
        minorFindings: 0
      };

      expect(wouldLegacyAutoFail(autoFailResult)).toBe(true);
    });

    test('should detect all auto-fail rules', () => {
      const autoFailRules = [
        'PREREQ-001', // Wrong OpenAPI version
        'PREREQ-002', // No auth
        'PREREQ-003', // Missing X-Organization-ID on writes
        'NAME-NAMESPACE', // Path namespace
        'PAG-NO-OFFSET'   // Forbidden pagination
      ];

      for (const ruleId of autoFailRules) {
        const result: GradeResult = {
          score: 90,
          grade: 'A-',
          passed: true,
          excellence: true,
          breakdown: [],
          findings: [
            { ruleId, severity: 'critical', message: 'Auto-fail issue', location: '$.test' }
          ],
          totalFindings: 1,
          criticalFindings: 1,
          majorFindings: 0,
          minorFindings: 0
        };

        expect(wouldLegacyAutoFail(result)).toBe(true);
      }
    });

    test('should not trigger auto-fail for normal issues', () => {
      const normalResult: GradeResult = {
        score: 60,
        grade: 'D-',
        passed: false,
        excellence: false,
        breakdown: [],
        findings: [
          { ruleId: 'FUNC-001', severity: 'critical', message: 'Normal critical issue', location: '$.paths' },
          { ruleId: 'SEC-001', severity: 'major', message: 'Security issue', location: '$.security' }
        ],
        totalFindings: 2,
        criticalFindings: 1,
        majorFindings: 1,
        minorFindings: 0
      };

      expect(wouldLegacyAutoFail(normalResult)).toBe(false);
    });

    test('should handle empty findings', () => {
      const emptyResult: GradeResult = {
        score: 100,
        grade: 'A+',
        passed: true,
        excellence: true,
        breakdown: [],
        findings: [],
        totalFindings: 0,
        criticalFindings: 0,
        majorFindings: 0,
        minorFindings: 0
      };

      expect(wouldLegacyAutoFail(emptyResult)).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle weights that do not sum to 1.0', () => {
      const badWeights = {
        functionality: 0.40,
        security: 0.30,
        scalability: 0.20,
        maintainability: 0.10,
        excellence: 0.10
        // Sum is 1.1, not 1.0
      };

      const result = calculateFinalGrade(mixedScores, badWeights);

      // Should still work, but might produce scores > 100
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeLessThanOrEqual(100); // Should be bounded
    });

    test('should handle missing category in breakdown', () => {
      const scoresWithMissingCategory = new Map<string, DependencyAwareScore>([
        ['FUNC-001', createMockScore('FUNC-001', 'functionality', 20, 30, 0.67)]
        // Missing other categories
      ]);

      const result = calculateFinalGrade(scoresWithMissingCategory);

      expect(result.breakdown).toHaveLength(5);
      
      // Categories without scores should have zero values
      const secBreakdown = result.breakdown.find(b => b.category === 'security');
      expect(secBreakdown!.maxPoints).toBe(0);
      expect(secBreakdown!.earnedPoints).toBe(0);
      expect(secBreakdown!.percentage).toBe(0);
    });

    test('should handle very large numbers', () => {
      const largeScores = new Map<string, DependencyAwareScore>([
        ['FUNC-001', createMockScore('FUNC-001', 'functionality', 1000000, 2000000, 0.5)]
      ]);

      const result = calculateFinalGrade(largeScores);

      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.score)).toBe(true);
    });

    test('should handle division by zero in percentages', () => {
      const zeroMaxScores = new Map<string, DependencyAwareScore>([
        ['FUNC-001', createMockScore('FUNC-001', 'functionality', 0, 0, 0)]
      ]);

      const result = calculateFinalGrade(zeroMaxScores);

      expect(result.score).toBe(0);
      expect(Number.isNaN(result.score)).toBe(false);
      
      const funcBreakdown = result.breakdown.find(b => b.category === 'functionality');
      expect(funcBreakdown!.percentage).toBe(0);
      expect(Number.isNaN(funcBreakdown!.percentage)).toBe(false);
    });

    test('should handle empty or null findings', () => {
      const scoresWithNullFindings = new Map<string, DependencyAwareScore>([
        ['FUNC-001', {
          ...createMockScore('FUNC-001', 'functionality', 20, 30, 0.67),
          findings: null as any // Invalid but test resilience
        }]
      ]);

      expect(() => {
        calculateFinalGrade(scoresWithNullFindings);
      }).not.toThrow();
    });

    test('should handle extremely long category names', () => {
      const longCategoryName = 'a'.repeat(1000);
      const scoresWithLongCategory = new Map<string, DependencyAwareScore>([
        ['TEST', createMockScore('TEST', longCategoryName, 10, 20, 0.5)]
      ]);

      const result = calculateFinalGrade(scoresWithLongCategory);
      
      // Should handle gracefully (will warn about unknown category)
      expect(typeof result.score).toBe('number');
    });
  });

  describe('Grade Consistency', () => {
    test('should produce consistent results for same input', () => {
      const result1 = calculateFinalGrade(mixedScores);
      const result2 = calculateFinalGrade(mixedScores);

      expect(result1.score).toBe(result2.score);
      expect(result1.grade).toBe(result2.grade);
      expect(result1.passed).toBe(result2.passed);
    });

    test('should have letter grades align with numeric scores', () => {
      for (let score = 0; score <= 100; score++) {
        const letterGrade = getLetterGrade(score);
        
        // Verify that letter grade is reasonable for score
        if (score >= 97) expect(letterGrade).toBe('A+');
        else if (score >= 60) expect(letterGrade).not.toBe('F');
        else expect(letterGrade).toBe('F');
      }
    });

    test('should have excellence flag align with numeric score', () => {
      const excellentScores = new Map([...perfectScores]);
      const result = calculateFinalGrade(excellentScores);

      expect(result.excellence).toBe(result.score >= 90);
    });

    test('should have passed flag respect profile adjustments', () => {
      const marginalResult: GradeResult = {
        score: 75,
        grade: 'C+',
        passed: true,
        excellence: false,
        breakdown: [],
        findings: [],
        totalFindings: 0,
        criticalFindings: 0,
        majorFindings: 0,
        minorFindings: 0
      };

      expect(applyProfile({ ...marginalResult }, 'public').passed).toBe(false);
      expect(applyProfile({ ...marginalResult }, 'internal').passed).toBe(true);
      expect(applyProfile({ ...marginalResult }, 'prototype').passed).toBe(true);
    });
  });

  describe('Boundary Value Analysis', () => {
    test('should handle exactly threshold scores', () => {
      // Test scores exactly at grade boundaries
      const boundaryScores = [
        { score: 97, expectedGrade: 'A+' },
        { score: 93, expectedGrade: 'A' },
        { score: 90, expectedGrade: 'A-' },
        { score: 87, expectedGrade: 'B+' },
        { score: 83, expectedGrade: 'B' },
        { score: 80, expectedGrade: 'B-' },
        { score: 77, expectedGrade: 'C+' },
        { score: 73, expectedGrade: 'C' },
        { score: 70, expectedGrade: 'C-' },
        { score: 67, expectedGrade: 'D+' },
        { score: 63, expectedGrade: 'D' },
        { score: 60, expectedGrade: 'D-' }
      ];

      for (const { score, expectedGrade } of boundaryScores) {
        expect(getLetterGrade(score)).toBe(expectedGrade);
        
        // Test just below threshold
        expect(getLetterGrade(score - 0.1)).not.toBe(expectedGrade);
        
        // Test just above (where applicable)
        if (score < 97) {
          expect(getLetterGrade(score + 0.1)).toBe(expectedGrade);
        }
      }
    });

    test('should handle floating point precision issues', () => {
      // Test scores that might cause floating point issues
      const floatingPointScores = [
        89.9999999, // Should round to 90
        79.9999999, // Should round to 80
        69.9999999, // Should round to 70
        59.9999999, // Should round to 60
      ];

      for (const score of floatingPointScores) {
        const result = getLetterGrade(score);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });

    test('should handle edge case percentage calculations', () => {
      // Test when earned points exactly equal max points
      const exactScores = new Map<string, DependencyAwareScore>([
        ['EXACT', createMockScore('EXACT', 'functionality', 100, 100, 1.0)]
      ]);

      const result = calculateFinalGrade(exactScores);
      
      const funcBreakdown = result.breakdown.find(b => b.category === 'functionality');
      expect(funcBreakdown!.percentage).toBe(1.0);
      expect(funcBreakdown!.weightedScore).toBeCloseTo(30, 2); // 100% * 30% weight
    });

    test('should handle minimum positive scores', () => {
      // Test very small but positive scores
      const minScores = new Map<string, DependencyAwareScore>([
        ['MIN', createMockScore('MIN', 'functionality', 0.1, 100, 0.001)]
      ]);

      const result = calculateFinalGrade(minScores);
      
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(1);
      expect(result.grade).toBe('F');
      expect(result.passed).toBe(false);
    });

    test('should handle maximum theoretical scores', () => {
      // Test with maximum possible values
      const maxScores = new Map<string, DependencyAwareScore>([
        ['MAX-FUNC', createMockScore('MAX-FUNC', 'functionality', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1.0)],
        ['MAX-SEC', createMockScore('MAX-SEC', 'security', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1.0)]
      ]);

      const result = calculateFinalGrade(maxScores);
      
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(result.score)).toBe(true);
      expect(result.grade).toBe('A+');
    });

    test('should handle zero weight scenarios', () => {
      const zeroWeights = {
        functionality: 0.0,
        security: 0.0,
        scalability: 0.0,
        maintainability: 0.0,
        excellence: 1.0 // All weight on excellence
      };

      const result = calculateFinalGrade(mixedScores, zeroWeights);
      
      // Score should only come from excellence category
      expect(result.score).toBeCloseTo(50, 0); // 50% excellence performance * 100% weight
    });
  });

  describe('Performance and Stress Tests', () => {
    test('should handle large numbers of rule scores efficiently', () => {
      // Create 1000 rule scores
      const largeScoreSet = new Map<string, DependencyAwareScore>();
      
      for (let i = 0; i < 1000; i++) {
        const categories = ['functionality', 'security', 'scalability', 'maintainability', 'excellence'];
        const category = categories[i % categories.length];
        const score = Math.random() * 10;
        const maxScore = 10;
        
        largeScoreSet.set(`RULE-${i}`, createMockScore(`RULE-${i}`, category, score, maxScore, score / maxScore));
      }

      const start = Date.now();
      const result = calculateFinalGrade(largeScoreSet);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should complete quickly
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.totalFindings).toBe(0); // No findings in this test
    });

    test('should handle large numbers of findings efficiently', () => {
      // Create scores with many findings
      const findingsArray = [];
      for (let i = 0; i < 500; i++) {
        findingsArray.push({
          ruleId: `RULE-${i}`,
          severity: ['critical', 'major', 'minor', 'info'][i % 4] as any,
          message: `Finding ${i}`,
          location: `$.location${i}`
        });
      }

      const scoresWithManyFindings = new Map<string, DependencyAwareScore>([
        ['MANY-FINDINGS', {
          ...createMockScore('MANY-FINDINGS', 'functionality', 10, 20, 0.5),
          findings: findingsArray
        }]
      ]);

      const start = Date.now();
      const result = calculateFinalGrade(scoresWithManyFindings);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200); // Should handle large findings list
      expect(result.totalFindings).toBe(500);
      expect(result.criticalFindings).toBeGreaterThan(0);
      expect(result.findings).toHaveLength(500); // All findings preserved
    });

    test('should maintain consistent performance across multiple runs', () => {
      const iterations = 100;
      const durations = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        calculateFinalGrade(mixedScores);
        const duration = Date.now() - start;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / iterations;
      const maxDuration = Math.max(...durations);
      
      expect(avgDuration).toBeLessThan(10); // Average should be very fast
      expect(maxDuration).toBeLessThan(50); // Even worst case should be reasonable
    });
  });

  describe('Real-World Scenarios', () => {
    test('should handle typical e-commerce API scores', () => {
      const ecommerceScores = new Map<string, DependencyAwareScore>([
        // Strong functionality (good CRUD operations)
        ['FUNC-PRODUCTS', createMockScore('FUNC-PRODUCTS', 'functionality', 25, 30, 0.83)],
        ['FUNC-ORDERS', createMockScore('FUNC-ORDERS', 'functionality', 20, 25, 0.80)],
        
        // Good security (authentication, HTTPS)
        ['SEC-AUTH', createMockScore('SEC-AUTH', 'security', 18, 20, 0.90)],
        ['SEC-HEADERS', createMockScore('SEC-HEADERS', 'security', 12, 15, 0.80)],
        
        // Decent scalability (pagination, caching)
        ['SCALE-PAGE', createMockScore('SCALE-PAGE', 'scalability', 14, 18, 0.78)],
        ['SCALE-CACHE', createMockScore('SCALE-CACHE', 'scalability', 8, 12, 0.67)],
        
        // Basic maintainability
        ['MAINT-DOCS', createMockScore('MAINT-DOCS', 'maintainability', 10, 15, 0.67)],
        
        // Some excellence features
        ['EXCEL-WEBHOOK', createMockScore('EXCEL-WEBHOOK', 'excellence', 6, 10, 0.60)]
      ]);

      const result = calculateFinalGrade(ecommerceScores);

      expect(result.score).toBeGreaterThan(70);
      expect(result.score).toBeLessThan(90);
      expect(result.grade).toMatch(/[ABC][+-]?/);
      expect(result.passed).toBe(true);
      expect(result.excellence).toBe(false);
    });

    test('should handle microservice API scores', () => {
      const microserviceScores = new Map<string, DependencyAwareScore>([
        // Focused functionality (single responsibility)
        ['FUNC-CORE', createMockScore('FUNC-CORE', 'functionality', 28, 30, 0.93)],
        
        // Strong security (service-to-service)
        ['SEC-JWT', createMockScore('SEC-JWT', 'security', 22, 25, 0.88)],
        ['SEC-MTLS', createMockScore('SEC-MTLS', 'security', 8, 10, 0.80)],
        
        // Excellent scalability (designed for scale)
        ['SCALE-ASYNC', createMockScore('SCALE-ASYNC', 'scalability', 18, 20, 0.90)],
        ['SCALE-CIRCUIT', createMockScore('SCALE-CIRCUIT', 'scalability', 9, 10, 0.90)],
        
        // Good maintainability (monitoring, health checks)
        ['MAINT-HEALTH', createMockScore('MAINT-HEALTH', 'maintainability', 12, 15, 0.80)],
        
        // Some advanced features
        ['EXCEL-METRICS', createMockScore('EXCEL-METRICS', 'excellence', 7, 10, 0.70)]
      ]);

      const result = calculateFinalGrade(microserviceScores);

      expect(result.score).toBeGreaterThan(85);
      expect(result.grade).toMatch(/A[+-]?|B\+/);
      expect(result.passed).toBe(true);
      
      // Should be close to excellence
      if (result.score >= 90) {
        expect(result.excellence).toBe(true);
      }
    });

    test('should handle legacy API migration scores', () => {
      const legacyMigrationScores = new Map<string, DependencyAwareScore>([
        // Basic functionality (minimal CRUD)
        ['FUNC-BASIC', createMockScore('FUNC-BASIC', 'functionality', 15, 30, 0.50)],
        
        // Poor security (legacy patterns)
        ['SEC-BASIC', createMockScore('SEC-BASIC', 'security', 8, 25, 0.32, [
          { ruleId: 'SEC-BASIC', severity: 'major', message: 'Basic auth only', location: '$.security' }
        ])],
        
        // Minimal scalability
        ['SCALE-NONE', createMockScore('SCALE-NONE', 'scalability', 3, 20, 0.15, [
          { ruleId: 'SCALE-NONE', severity: 'major', message: 'No pagination', location: '$.paths' }
        ])],
        
        // Poor maintainability
        ['MAINT-POOR', createMockScore('MAINT-POOR', 'maintainability', 4, 15, 0.27)],
        
        // No excellence features
        ['EXCEL-NONE', createMockScore('EXCEL-NONE', 'excellence', 0, 10, 0.0)]
      ]);

      const result = calculateFinalGrade(legacyMigrationScores);

      expect(result.score).toBeLessThan(60);
      expect(result.grade).toBe('F');
      expect(result.passed).toBe(false);
      expect(result.excellence).toBe(false);
      expect(result.majorFindings).toBeGreaterThan(0);
    });

    test('should handle startup MVP API scores', () => {
      const mvpScores = new Map<string, DependencyAwareScore>([
        // Good core functionality (focus on features)
        ['FUNC-CORE', createMockScore('FUNC-CORE', 'functionality', 22, 30, 0.73)],
        
        // Basic security (good enough for MVP)
        ['SEC-BASIC', createMockScore('SEC-BASIC', 'security', 15, 25, 0.60)],
        
        // Limited scalability (not optimized yet)
        ['SCALE-BASIC', createMockScore('SCALE-BASIC', 'scalability', 8, 20, 0.40)],
        
        // Minimal maintainability (technical debt)
        ['MAINT-MIN', createMockScore('MAINT-MIN', 'maintainability', 6, 15, 0.40)],
        
        // No advanced features yet
        ['EXCEL-NONE', createMockScore('EXCEL-NONE', 'excellence', 2, 10, 0.20)]
      ]);

      const result = calculateFinalGrade(mvpScores);

      expect(result.score).toBeGreaterThan(50);
      expect(result.score).toBeLessThan(75);
      expect(result.grade).toMatch(/[CD][+-]?/);
      
      // Should pass with prototype profile
      const prototypeResult = applyProfile(result, 'prototype');
      expect(prototypeResult.passed).toBe(true);
      
      // Should not pass with public profile
      const publicResult = applyProfile(result, 'public');
      expect(publicResult.passed).toBe(false);
    });
  });

  describe('Complex Finding Analysis', () => {
    test('should correctly categorize and count mixed severity findings', () => {
      const complexFindings = [
        { ruleId: 'R1', severity: 'critical', message: 'Critical 1', location: '$.a' },
        { ruleId: 'R2', severity: 'critical', message: 'Critical 2', location: '$.b' },
        { ruleId: 'R3', severity: 'major', message: 'Major 1', location: '$.c' },
        { ruleId: 'R4', severity: 'major', message: 'Major 2', location: '$.d' },
        { ruleId: 'R5', severity: 'major', message: 'Major 3', location: '$.e' },
        { ruleId: 'R6', severity: 'minor', message: 'Minor 1', location: '$.f' },
        { ruleId: 'R7', severity: 'info', message: 'Info 1', location: '$.g' },
        { ruleId: 'R8', severity: 'info', message: 'Info 2', location: '$.h' }
      ];

      const scoresWithComplexFindings = new Map<string, DependencyAwareScore>([
        ['COMPLEX', {
          ...createMockScore('COMPLEX', 'functionality', 10, 20, 0.5),
          findings: complexFindings as any
        }]
      ]);

      const result = calculateFinalGrade(scoresWithComplexFindings);

      expect(result.totalFindings).toBe(8);
      expect(result.criticalFindings).toBe(2);
      expect(result.majorFindings).toBe(3);
      expect(result.minorFindings).toBe(3); // minor + info combined

      // Verify sorting (critical first, then major, then minor/info)
      expect(result.findings[0].severity).toBe('critical');
      expect(result.findings[1].severity).toBe('critical');
      expect(result.findings[2].severity).toBe('major');
      expect(result.findings[3].severity).toBe('major');
      expect(result.findings[4].severity).toBe('major');
      expect(['minor', 'info']).toContain(result.findings[5].severity);
    });

    test('should handle duplicate findings across rules', () => {
      const duplicateFindings = new Map<string, DependencyAwareScore>([
        ['RULE-A', {
          ...createMockScore('RULE-A', 'functionality', 10, 20, 0.5),
          findings: [
            { ruleId: 'RULE-A', severity: 'major', message: 'Same issue', location: '$.same' }
          ]
        }],
        ['RULE-B', {
          ...createMockScore('RULE-B', 'security', 8, 15, 0.53),
          findings: [
            { ruleId: 'RULE-B', severity: 'major', message: 'Different message', location: '$.same' }
          ]
        }]
      ]);

      const result = calculateFinalGrade(duplicateFindings);

      expect(result.totalFindings).toBe(2); // Should keep both (different rule IDs)
      expect(result.majorFindings).toBe(2);
    });

    test('should handle findings with missing optional fields', () => {
      const incompleteFindings = [
        { ruleId: 'R1', severity: 'critical', message: 'Critical issue', location: '$.test' },
        { ruleId: 'R2', severity: 'major', message: 'Major issue', location: '$.test2' }
        // Missing category, fixHint, line fields
      ];

      const scoresWithIncompleteFindings = new Map<string, DependencyAwareScore>([
        ['INCOMPLETE', {
          ...createMockScore('INCOMPLETE', 'functionality', 10, 20, 0.5),
          findings: incompleteFindings as any
        }]
      ]);

      expect(() => {
        const result = calculateFinalGrade(scoresWithIncompleteFindings);
        expect(result.totalFindings).toBe(2);
      }).not.toThrow();
    });
  });

  describe('Grade Comparison Edge Cases', () => {
    const baselineGrade: GradeResult = {
      score: 75,
      grade: 'B',
      passed: true,
      findings: [
        { ruleId: 'OLD-1', severity: 'major', message: 'Old issue 1', location: '$.old1' },
        { ruleId: 'OLD-2', severity: 'minor', message: 'Old issue 2', location: '$.old2' },
        { ruleId: 'FIXED', severity: 'major', message: 'This will be fixed', location: '$.fixed' }
      ],
      criticalFindings: 0,
      majorFindings: 2,
      minorFindings: 1,
      totalFindings: 3,
      breakdown: [],
      excellence: false
    };

    test('should handle comparison with identical findings', () => {
      const identicalGrade: GradeResult = {
        ...baselineGrade,
        findings: [...baselineGrade.findings] // Exact same findings
      };

      const comparison = compareGrades(baselineGrade, identicalGrade);

      expect(comparison.scoreDelta).toBe(0);
      expect(comparison.fixedFindings).toBe(0);
      expect(comparison.newFindings).toBe(0);
      expect(comparison.improved).toBe(false);
    });

    test('should handle comparison with findings reordered', () => {
      const reorderedGrade: GradeResult = {
        ...baselineGrade,
        findings: [...baselineGrade.findings].reverse() // Same findings, different order
      };

      const comparison = compareGrades(baselineGrade, reorderedGrade);

      expect(comparison.scoreDelta).toBe(0);
      expect(comparison.fixedFindings).toBe(0);
      expect(comparison.newFindings).toBe(0);
    });

    test('should handle massive improvement scenario', () => {
      const massiveImprovementGrade: GradeResult = {
        ...baselineGrade,
        score: 100,
        grade: 'A+',
        passed: true,
        excellence: true,
        findings: [], // All issues fixed
        totalFindings: 0,
        criticalFindings: 0,
        majorFindings: 0,
        minorFindings: 0
      };

      const comparison = compareGrades(baselineGrade, massiveImprovementGrade);

      expect(comparison.improved).toBe(true);
      expect(comparison.scoreDelta).toBe(30); // 70 to 100
      expect(comparison.fixedFindings).toBe(3); // All baseline findings fixed
      expect(comparison.newFindings).toBe(0);
      expect(comparison.message).toContain('📈');
      expect(comparison.message).toContain('30 points');
    });

    test('should handle massive regression scenario', () => {
      const perfectBaseline: GradeResult = {
        score: 100,
        grade: 'A+',
        passed: true,
        excellence: true,
        breakdown: [],
        findings: [],
        totalFindings: 0,
        criticalFindings: 0,
        majorFindings: 0,
        minorFindings: 0
      };

      const massiveRegressionGrade: GradeResult = {
        ...perfectBaseline,
        score: 20,
        grade: 'F',
        passed: false,
        excellence: false,
        findings: [
          { ruleId: 'NEW-1', severity: 'critical', message: 'Critical regression', location: '$.critical' },
          { ruleId: 'NEW-2', severity: 'major', message: 'Major regression', location: '$.major' }
        ],
        totalFindings: 2,
        criticalFindings: 1,
        majorFindings: 1,
        minorFindings: 0
      };

      const comparison = compareGrades(perfectBaseline, massiveRegressionGrade);

      expect(comparison.improved).toBe(false);
      expect(comparison.scoreDelta).toBe(-80); // 100 to 20
      expect(comparison.fixedFindings).toBe(0);
      expect(comparison.newFindings).toBe(2);
      expect(comparison.message).toContain('📉');
      expect(comparison.message).toContain('80 points');
    });
  });
});