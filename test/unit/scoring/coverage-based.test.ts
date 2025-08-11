/**
 * Coverage-Based Scoring System Unit Tests
 * 
 * Tests the new coverage-based scoring system that replaces binary pass/fail with:
 * - Rule coverage assessment (targets detected vs targets passed)
 * - Dependency-aware scoring (prerequisites enable advanced rules)
 * - Excellence bonuses for exceptional API design
 * - Graduated scoring instead of auto-fail conditions
 * 
 * This represents the evolution from legacy scoring to more nuanced evaluation.
 */

import { scoreWithDependencies } from '../../../src/scoring/dependencies';
import { calculateFinalGrade, generateGradeSummary } from '../../../src/scoring/finalizer';
import { checkPrerequisites } from '../../../src/scoring/prerequisites';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

// Mock the rule registry
jest.mock('../../../src/rules/registry.js');
const mockRuleRegistry = jest.requireMock('../../../src/rules/registry.js');

describe('Coverage-Based Scoring System', () => {
  beforeEach(() => {
    // Setup mock rule registry with test rules
    mockRuleRegistry.RULE_REGISTRY = {
      'PREREQ-001': {
        id: 'PREREQ-001',
        category: 'structure',
        severity: 'prerequisite',
        description: 'Valid OpenAPI 3.0.3',
        detect: jest.fn(() => [{ identifier: 'spec', location: '$' }]),
        validate: jest.fn(() => ({ passed: true, message: 'Valid' }))
      },
      'PREREQ-002': {
        id: 'PREREQ-002',
        category: 'security',
        severity: 'prerequisite', 
        description: 'Authentication defined',
        detect: jest.fn(() => [{ identifier: 'auth', location: '$.components.securitySchemes' }]),
        validate: jest.fn(() => ({ passed: true, message: 'Valid auth' }))
      },
      'BASIC-001': {
        id: 'BASIC-001',
        category: 'naming',
        severity: 'major',
        description: 'Consistent naming patterns',
        maxScore: 10,
        detect: jest.fn(() => [
          { identifier: 'operation1', location: '$.paths./users.get' },
          { identifier: 'operation2', location: '$.paths./users.post' }
        ]),
        validate: jest.fn((target) => ({
          passed: target.identifier === 'operation1',
          message: target.identifier === 'operation1' ? 'Good naming' : 'Poor naming'
        }))
      },
      'ADVANCED-001': {
        id: 'ADVANCED-001',
        category: 'pagination',
        severity: 'minor',
        description: 'Pagination patterns',
        maxScore: 15,
        dependencies: ['BASIC-001'],
        detect: jest.fn(() => [
          { identifier: 'list-endpoint', location: '$.paths./users.get' }
        ]),
        validate: jest.fn(() => ({ passed: true, message: 'Has pagination' }))
      },
      'EXCELLENCE-001': {
        id: 'EXCELLENCE-001',
        category: 'excellence',
        severity: 'info',
        description: 'Exceptional API design patterns',
        maxScore: 5,
        detect: jest.fn(() => [
          { identifier: 'exceptional-pattern', location: '$.info.x-api-maturity' }
        ]),
        validate: jest.fn(() => ({ passed: true, message: 'Exceptional design' }))
      }
    };
  });

  describe('Prerequisite Gating', () => {
    it('should block scoring when prerequisites fail', async () => {
      const spec = MockOpenApiFactory.invalid();
      
      // Mock prerequisite failure
      mockRuleRegistry.RULE_REGISTRY['PREREQ-001'].validate.mockReturnValue({
        passed: false,
        message: 'Invalid OpenAPI version',
        fixHint: 'Change to OpenAPI 3.0.3'
      });

      const result = await checkPrerequisites(spec);

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({
        ruleId: 'PREREQ-001',
        severity: 'critical',
        message: expect.stringContaining('Invalid OpenAPI version'),
        location: '$'
      });
      expect(result.blockedReason).toContain('prerequisite check(s)');
      expect(result.requiredFixes).toContain('Change to OpenAPI 3.0.3');
    });

    it('should pass when all prerequisites are satisfied', async () => {
      const spec = MockOpenApiFactory.validWithTenancy();

      const result = await checkPrerequisites(spec);

      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
      expect(result.blockedReason).toBeUndefined();
      expect(result.requiredFixes).toHaveLength(0);
    });

    it('should include structural integrity checks', async () => {
      const spec = {
        // Missing required fields
        info: {},
        paths: {}
      };

      const result = await checkPrerequisites(spec);

      expect(result.passed).toBe(false);
      expect(result.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'PREREQ-STRUCT',
            message: 'Missing openapi field'
          }),
          expect.objectContaining({
            ruleId: 'PREREQ-STRUCT', 
            message: 'Missing API title'
          }),
          expect.objectContaining({
            ruleId: 'PREREQ-STRUCT',
            message: 'Missing API version'
          })
        ])
      );
    });
  });

  describe('Dependency-Aware Scoring', () => {
    it('should calculate scores with rule dependencies', () => {
      const spec = MockOpenApiFactory.validWithTenancy();

      const ruleScores = scoreWithDependencies(spec);

      expect(ruleScores).toBeInstanceOf(Map);
      expect(ruleScores.has('BASIC-001')).toBe(true);
      expect(ruleScores.has('ADVANCED-001')).toBe(true);

      const basicScore = ruleScores.get('BASIC-001');
      expect(basicScore).toMatchObject({
        coverage: 0.5, // 1 of 2 targets passed
        score: 5, // 50% of 10 max points
        maxScore: 10,
        targetsChecked: 2,
        targetsPassed: 1
      });
    });

    it('should handle dependency blocking correctly', () => {
      const spec = MockOpenApiFactory.validMinimal();
      
      // Make basic rule fail completely
      mockRuleRegistry.RULE_REGISTRY['BASIC-001'].validate.mockReturnValue({
        passed: false,
        message: 'Poor naming everywhere'
      });

      const ruleScores = scoreWithDependencies(spec);

      const basicScore = ruleScores.get('BASIC-001');
      const advancedScore = ruleScores.get('ADVANCED-001');

      expect(basicScore).toBeDefined();
      expect(advancedScore).toBeDefined();
      expect(basicScore!.score).toBe(0);
      expect(advancedScore!.applicable).toBe(false); // Blocked by dependency
      expect(advancedScore!.score).toBe(0);
    });

    it('should enable dependent rules when dependencies pass', () => {
      const spec = MockOpenApiFactory.validWithTenancy();
      
      // Make basic rule pass completely
      mockRuleRegistry.RULE_REGISTRY['BASIC-001'].validate.mockReturnValue({
        passed: true,
        message: 'Great naming'
      });

      const ruleScores = scoreWithDependencies(spec);

      const basicScore = ruleScores.get('BASIC-001');
      const advancedScore = ruleScores.get('ADVANCED-001');

      expect(basicScore).toBeDefined();
      expect(advancedScore).toBeDefined();
      expect(basicScore!.score).toBe(10); // Full points
      expect(advancedScore!.applicable).toBe(true); // Enabled by dependency
      expect(advancedScore!.score).toBe(15); // Advanced rule can score
    });

    it('should handle partial dependency satisfaction', () => {
      const spec = MockOpenApiFactory.validWithTenancy();
      
      // Basic rule passes some but not all targets (50% coverage)
      mockRuleRegistry.RULE_REGISTRY['BASIC-001'].validate
        .mockReturnValueOnce({ passed: true, message: 'Good' })
        .mockReturnValueOnce({ passed: false, message: 'Poor' });

      const ruleScores = scoreWithDependencies(spec);

      const basicScore = ruleScores.get('BASIC-001');
      const advancedScore = ruleScores.get('ADVANCED-001');

      expect(basicScore).toBeDefined();
      expect(advancedScore).toBeDefined();
      expect(basicScore!.coverage).toBe(0.5);
      expect(basicScore!.score).toBe(5); // 50% of max
      
      // Advanced rule may still be enabled with partial dependency
      expect(advancedScore!.applicable).toBe(true);
      expect(advancedScore!.score).toBeGreaterThan(0);
    });
  });

  describe('Coverage Calculation', () => {
    it('should calculate coverage accurately for rules with multiple targets', () => {
      const spec = MockOpenApiFactory.validWithTenancy();
      
      // Mock rule with 4 targets, 3 passing
      mockRuleRegistry.RULE_REGISTRY['BASIC-001'].detect.mockReturnValue([
        { identifier: 'target1', location: '$.paths./endpoint1' },
        { identifier: 'target2', location: '$.paths./endpoint2' },
        { identifier: 'target3', location: '$.paths./endpoint3' },
        { identifier: 'target4', location: '$.paths./endpoint4' }
      ]);
      
      mockRuleRegistry.RULE_REGISTRY['BASIC-001'].validate
        .mockReturnValueOnce({ passed: true, message: 'Good' })
        .mockReturnValueOnce({ passed: true, message: 'Good' })
        .mockReturnValueOnce({ passed: true, message: 'Good' })
        .mockReturnValueOnce({ passed: false, message: 'Poor' });

      const ruleScores = scoreWithDependencies(spec);
      const score = ruleScores.get('BASIC-001');

      expect(score).toBeDefined();
      expect(score!.targetsChecked).toBe(4);
      expect(score!.targetsPassed).toBe(3);
      expect(score!.coverage).toBe(0.75);
      expect(score!.score).toBe(7.5); // 75% of 10 max points
    });

    it('should handle rules with no targets gracefully', () => {
      const spec = MockOpenApiFactory.validMinimal();
      
      mockRuleRegistry.RULE_REGISTRY['BASIC-001'].detect.mockReturnValue([]);

      const ruleScores = scoreWithDependencies(spec);
      const score = ruleScores.get('BASIC-001');

      expect(score).toBeDefined();
      expect(score!.targetsChecked).toBe(0);
      expect(score!.targetsPassed).toBe(0);
      expect(score!.coverage).toBe(1.0); // No targets = full coverage by default
      expect(score!.applicable).toBe(false); // Rule doesn't apply
      expect(score!.score).toBe(0);
    });

    it('should handle perfect coverage correctly', () => {
      const spec = MockOpenApiFactory.validWithTenancy();
      
      mockRuleRegistry.RULE_REGISTRY['BASIC-001'].validate.mockReturnValue({
        passed: true,
        message: 'Perfect'
      });

      const ruleScores = scoreWithDependencies(spec);
      const score = ruleScores.get('BASIC-001');

      expect(score).toBeDefined();
      expect(score!.coverage).toBe(1.0);
      expect(score!.score).toBe(10); // Full max score
      expect(score!.targetsChecked).toBe(score!.targetsPassed);
    });
  });

  describe('Final Grade Calculation', () => {
    it('should calculate final grade from rule scores', () => {
      const ruleScores = new Map([
        ['BASIC-001', {
          ruleId: 'BASIC-001',
          coverage: 0.8,
          score: 8,
          maxScore: 10,
          targetsChecked: 5,
          targetsPassed: 4,
          findings: [],
          skipped: false
        }],
        ['ADVANCED-001', {
          ruleId: 'ADVANCED-001',
          coverage: 1.0,
          score: 15,
          maxScore: 15,
          targetsChecked: 1,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }],
        ['EXCELLENCE-001', {
          ruleId: 'EXCELLENCE-001',
          coverage: 1.0,
          score: 5,
          maxScore: 5,
          targetsChecked: 1,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }]
      ]);

      const gradeResult = calculateFinalGrade(ruleScores);

      expect(gradeResult.score).toBe(93.33); // (8+15+5)/(10+15+5) * 100
      expect(gradeResult.grade).toBe('A');
      expect(gradeResult.excellence).toBe(true);
      expect(gradeResult.criticalFindings).toBe(0);
      
      expect(gradeResult.breakdown).toHaveLength(3);
      expect(gradeResult.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'naming',
            earnedPoints: 8,
            maxPoints: 10,
            percentage: 0.8
          }),
          expect.objectContaining({
            category: 'pagination',
            earnedPoints: 15,
            maxPoints: 15,
            percentage: 1.0
          }),
          expect.objectContaining({
            category: 'excellence',
            earnedPoints: 5,
            maxPoints: 5,
            percentage: 1.0
          })
        ])
      );
    });

    it('should handle zero scores correctly', () => {
      const ruleScores = new Map([
        ['BASIC-001', {
          ruleId: 'BASIC-001',
          coverage: 0.0,
          score: 0,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 0,
          findings: [],
          skipped: false
        }]
      ]);

      const gradeResult = calculateFinalGrade(ruleScores);

      expect(gradeResult.score).toBe(0);
      expect(gradeResult.grade).toBe('F');
      expect(gradeResult.excellence).toBe(false);
    });

    it('should count critical findings correctly', () => {
      const ruleScores = new Map([
        ['BASIC-001', {
          ruleId: 'BASIC-001',
          coverage: 0.2,
          score: 2,
          maxScore: 10,
          targetsChecked: 5,
          targetsPassed: 1,
          findings: [
            { severity: 'error' as const, ruleId: 'BASIC-001', message: 'test', jsonPath: '$.test', category: 'test' },
            { severity: 'error' as const, ruleId: 'BASIC-001', message: 'test', jsonPath: '$.test', category: 'test' },
            { severity: 'warn' as const, ruleId: 'BASIC-001', message: 'test', jsonPath: '$.test', category: 'test' }
          ],
          skipped: false
        }]
      ]);

      const gradeResult = calculateFinalGrade(ruleScores);

      expect(gradeResult.criticalFindings).toBe(2);
    });

    it('should calculate letter grades correctly across all ranges', () => {
      const testCases = [
        { score: 100, expected: 'A+' },
        { score: 97, expected: 'A+' },
        { score: 95, expected: 'A' },
        { score: 93, expected: 'A' },
        { score: 92, expected: 'A-' },
        { score: 90, expected: 'A-' },
        { score: 88, expected: 'B+' },
        { score: 87, expected: 'B+' },
        { score: 85, expected: 'B' },
        { score: 83, expected: 'B' },
        { score: 82, expected: 'B-' },
        { score: 80, expected: 'B-' },
        { score: 75, expected: 'C' },
        { score: 70, expected: 'C' },
        { score: 65, expected: 'D' },
        { score: 60, expected: 'D' },
        { score: 59, expected: 'F' },
        { score: 0, expected: 'F' }
      ];

      testCases.forEach(({ score, expected }) => {
        const ruleScores = new Map([
          ['TEST-RULE', {
            ruleId: 'TEST-RULE',
            coverage: score / 100,
            score,
            maxScore: 100,
            targetsChecked: 1,
            targetsPassed: score === 100 ? 1 : 0,
            findings: [],
            skipped: false
          }]
        ]);

        const result = calculateFinalGrade(ruleScores);
        expect(result.grade).toBe(expected);
      });
    });
  });

  describe('Grade Summary Generation', () => {
    it('should generate comprehensive grade summary', () => {
      const gradeResult = {
        score: 85.5,
        grade: 'B',
        excellence: 8,
        criticalFindings: 2,
        breakdown: [
          { category: 'structure', earnedPoints: 18, maxPoints: 20, percentage: 0.9 },
          { category: 'security', earnedPoints: 15, maxPoints: 20, percentage: 0.75 },
          { category: 'naming', earnedPoints: 12, maxPoints: 15, percentage: 0.8 },
          { category: 'excellence', earnedPoints: 8, maxPoints: 10, percentage: 0.8 }
        ],
        findings: [
          { ruleId: 'STRUCT-001', severity: 'critical', message: 'Missing required field' },
          { ruleId: 'SEC-001', severity: 'major', message: 'Weak authentication' }
        ]
      };

      const summary = generateGradeSummary(gradeResult);

      expect(summary).toContain('Grade: B (85.5%)');
      expect(summary).toContain('Excellence Bonus: 8 points');
      expect(summary).toContain('Critical Issues: 2');
      expect(summary).toContain('structure: 18/20 (90%)');
      expect(summary).toContain('security: 15/20 (75%)');
      expect(summary).toContain('naming: 12/15 (80%)');
      expect(summary).toContain('excellence: 8/10 (80%)');
    });

    it('should handle perfect scores in summary', () => {
      const gradeResult = {
        score: 100,
        grade: 'A+',
        excellence: 10,
        criticalFindings: 0,
        breakdown: [
          { category: 'structure', earnedPoints: 20, maxPoints: 20, percentage: 1.0 }
        ],
        findings: []
      };

      const summary = generateGradeSummary(gradeResult);

      expect(summary).toContain('Grade: A+ (100%)');
      expect(summary).toContain('Excellence Bonus: 10 points');
      expect(summary).toContain('Critical Issues: 0');
      expect(summary).toContain('Perfect score achieved!');
    });

    it('should handle failing grades in summary', () => {
      const gradeResult = {
        score: 45,
        grade: 'F',
        excellence: 0,
        criticalFindings: 8,
        breakdown: [
          { category: 'structure', earnedPoints: 5, maxPoints: 20, percentage: 0.25 }
        ],
        findings: [
          { severity: 'critical', message: 'Critical issue 1' },
          { severity: 'critical', message: 'Critical issue 2' }
        ]
      };

      const summary = generateGradeSummary(gradeResult);

      expect(summary).toContain('Grade: F (45%)');
      expect(summary).toContain('Critical Issues: 8');
      expect(summary).toContain('Significant improvements needed');
      expect(summary).not.toContain('Excellence Bonus');
    });
  });

  describe('Scoring Edge Cases', () => {
    it('should handle rules with zero max score', () => {
      const ruleScores = new Map([
        ['ZERO-SCORE', {
          ruleId: 'ZERO-SCORE',
          coverage: 1.0,
          score: 0,
          maxScore: 0,
          targetsChecked: 1,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }]
      ]);

      const result = calculateFinalGrade(ruleScores);
      expect(result.score).toBe(0);
      expect(result.grade).toBe('F');
    });

    it('should handle mixed applicable/non-applicable rules', () => {
      const ruleScores = new Map([
        ['APPLICABLE', {
          ruleId: 'APPLICABLE',
          coverage: 1.0,
          score: 10,
          maxScore: 10,
          targetsChecked: 1,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }],
        ['NOT-APPLICABLE', {
          ruleId: 'NOT-APPLICABLE',
          coverage: 1.0,
          score: 0,
          maxScore: 10,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: [],
          skipped: true,
          skipReason: 'Not applicable'
        }]
      ]);

      const result = calculateFinalGrade(ruleScores);
      expect(result.score).toBe(100); // Only count applicable rules
    });

    it('should handle empty rule scores gracefully', () => {
      const ruleScores = new Map();

      const result = calculateFinalGrade(ruleScores);
      expect(result.score).toBe(0);
      expect(result.grade).toBe('F');
      expect(result.breakdown).toHaveLength(0);
    });
  });

  describe('Comparison with Legacy Scoring', () => {
    it('should provide more nuanced scoring than legacy binary system', () => {
      const spec = MockOpenApiFactory.validWithTenancy();
      
      // Simulate mixed compliance (some rules pass, some fail)
      mockRuleRegistry.RULE_REGISTRY['BASIC-001'].validate
        .mockReturnValueOnce({ passed: true, message: 'Good' })
        .mockReturnValueOnce({ passed: false, message: 'Poor' });

      const ruleScores = scoreWithDependencies(spec);
      const result = calculateFinalGrade(ruleScores);

      // Coverage-based system should give partial credit
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(100);
      
      // Legacy would likely be binary pass/fail
      expect(ruleScores.get('BASIC-001').coverage).toBe(0.5);
      expect(ruleScores.get('BASIC-001').score).toBe(5); // Partial credit
    });

    it('should eliminate auto-fail conditions in favor of graduated scoring', () => {
      const spec = MockOpenApiFactory.validWithTenancy();
      
      // Even with significant issues, should not auto-fail
      mockRuleRegistry.RULE_REGISTRY['BASIC-001'].validate.mockReturnValue({
        passed: false,
        message: 'Poor implementation'
      });

      const ruleScores = scoreWithDependencies(spec);
      const result = calculateFinalGrade(ruleScores);

      // Should get low score but not auto-fail
      expect(result.score).toBeLessThan(50);
      expect(result.grade).toBe('F'); // Can still fail, but graduated
      expect(result).not.toHaveProperty('autoFailTriggered');
    });
  });
});