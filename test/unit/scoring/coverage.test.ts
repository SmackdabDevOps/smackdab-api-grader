import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  scoreRule,
  scoreAllRules,
  calculateCategoryScores,
  getImprovementOpportunities,
  calculateCoverageStats,
  generateCoverageReport,
  RuleScore,
  CategoryScore
} from '../../../src/scoring/coverage';
import { RULE_REGISTRY, Rule, Target, ValidationResult } from '../../../src/rules/registry';

describe('Coverage-Based Scoring System', () => {
  // Test fixtures
  const mockSpec = {
    openapi: '3.0.3',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/api/v2/users': {
        get: {
          summary: 'List users',
          responses: { '200': { description: 'OK' } }
        },
        post: {
          summary: 'Create user',
          parameters: [{ $ref: '#/components/parameters/OrganizationHeader' }],
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', required: ['name'] }
              }
            }
          },
          responses: { '201': { description: 'Created' } }
        }
      },
      '/api/v2/users/{id}': {
        get: {
          summary: 'Get user',
          parameters: [
            { name: 'id', in: 'path', schema: { type: 'integer' } }
          ],
          responses: { '200': { description: 'OK' } }
        }
      }
    },
    components: {
      parameters: {
        OrganizationHeader: {
          name: 'X-Organization-ID',
          in: 'header',
          required: true,
          schema: { type: 'integer', format: 'int64' }
        }
      },
      securitySchemes: {
        OAuth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://auth.example.com/oauth/authorize',
              tokenUrl: 'https://auth.example.com/oauth/token',
              scopes: { read: 'Read access' }
            }
          }
        }
      }
    }
  };

  // Mock rule that always passes
  const mockPassingRule: Rule = {
    id: 'TEST-PASS',
    category: 'functionality',
    severity: 'major',
    points: 10,
    description: 'Test rule that always passes',
    rationale: 'Testing coverage calculation',
    detect: (spec) => [
      { type: 'path', location: '$.paths["/api/v2/users"]', identifier: 'Users path' },
      { type: 'path', location: '$.paths["/api/v2/users/{id}"]', identifier: 'User detail path' }
    ],
    validate: () => ({ passed: true })
  };

  // Mock rule that always fails
  const mockFailingRule: Rule = {
    id: 'TEST-FAIL',
    category: 'security',
    severity: 'critical',
    points: 15,
    description: 'Test rule that always fails',
    rationale: 'Testing failure scenarios',
    detect: (spec) => [
      { type: 'operation', location: '$.paths["/api/v2/users"].get', identifier: 'GET /api/v2/users' },
      { type: 'operation', location: '$.paths["/api/v2/users"].post', identifier: 'POST /api/v2/users' }
    ],
    validate: () => ({ 
      passed: false, 
      message: 'This always fails',
      fixHint: 'Fix the issue'
    })
  };

  // Mock rule with partial coverage
  const mockPartialRule: Rule = {
    id: 'TEST-PARTIAL',
    category: 'scalability',
    severity: 'minor',
    points: 8,
    description: 'Test rule with partial coverage',
    rationale: 'Testing partial scenarios',
    detect: (spec) => [
      { type: 'operation', location: '$.paths["/api/v2/users"].get', identifier: 'GET /api/v2/users' },
      { type: 'operation', location: '$.paths["/api/v2/users"].post', identifier: 'POST /api/v2/users' },
      { type: 'operation', location: '$.paths["/api/v2/users/{id}"].get', identifier: 'GET /api/v2/users/{id}' }
    ],
    validate: (target) => ({
      passed: target.identifier.includes('GET'), // Only GET operations pass
      message: target.identifier.includes('POST') ? 'POST operations fail' : undefined,
      fixHint: 'Implement proper handling for POST operations'
    })
  };

  // Mock rule with no targets (not applicable)
  const mockNotApplicableRule: Rule = {
    id: 'TEST-NA',
    category: 'maintainability',
    severity: 'minor',
    points: 5,
    description: 'Test rule not applicable',
    rationale: 'Testing non-applicable rules',
    detect: () => [], // No targets found
    validate: () => ({ passed: true })
  };

  // Mock rule with weighted targets
  const mockWeightedRule: Rule = {
    id: 'TEST-WEIGHTED',
    category: 'excellence',
    severity: 'minor',
    points: 12,
    description: 'Test rule with potential weighting',
    rationale: 'Testing weight calculation',
    detect: (spec) => [
      { type: 'operation', location: '$.paths["/api/v2/users"].get', identifier: 'GET /api/v2/users', method: 'get' },
      { type: 'operation', location: '$.paths["/api/v2/users"].post', identifier: 'POST /api/v2/users', method: 'post' },
      { type: 'operation', location: '$.paths["/api/v2/users/{id}"].get', identifier: 'GET /api/v2/users/{id}', method: 'get' }
    ],
    validate: () => ({ passed: true })
  };

  describe('scoreRule', () => {
    test('should score rule with all targets passing', () => {
      const score = scoreRule(mockPassingRule, mockSpec);

      expect(score.ruleId).toBe('TEST-PASS');
      expect(score.ruleName).toBe('Test rule that always passes');
      expect(score.category).toBe('functionality');
      expect(score.applicable).toBe(true);
      expect(score.coverage).toBe(1.0);
      expect(score.score).toBe(10); // Full points
      expect(score.maxScore).toBe(10);
      expect(score.targetsChecked).toBe(2);
      expect(score.targetsPassed).toBe(2);
      expect(score.findings).toHaveLength(0);
    });

    test('should score rule with all targets failing', () => {
      const score = scoreRule(mockFailingRule, mockSpec);

      expect(score.applicable).toBe(true);
      expect(score.coverage).toBe(0.0);
      expect(score.score).toBe(0); // No points
      expect(score.maxScore).toBe(15);
      expect(score.targetsChecked).toBe(2);
      expect(score.targetsPassed).toBe(0);
      expect(score.findings).toHaveLength(2);
      expect(score.findings[0].ruleId).toBe('TEST-FAIL');
      expect(score.findings[0].severity).toBe('critical');
      expect(score.findings[0].message).toContain('This always fails');
    });

    test('should score rule with partial coverage', () => {
      const score = scoreRule(mockPartialRule, mockSpec);

      expect(score.applicable).toBe(true);
      expect(score.coverage).toBeCloseTo(0.67, 2); // 2/3 targets pass
      expect(score.score).toBeCloseTo(5.33, 1); // 0.67 * 8 points
      expect(score.maxScore).toBe(8);
      expect(score.targetsChecked).toBe(3);
      expect(score.targetsPassed).toBe(2);
      expect(score.findings).toHaveLength(1); // Only POST fails
      expect(score.findings[0].message).toContain('POST operations fail');
    });

    test('should handle non-applicable rules', () => {
      const score = scoreRule(mockNotApplicableRule, mockSpec);

      expect(score.applicable).toBe(false);
      expect(score.coverage).toBe(1.0); // Non-applicable = full coverage
      expect(score.score).toBe(5); // Full points for non-applicable
      expect(score.maxScore).toBe(5);
      expect(score.targetsChecked).toBe(0);
      expect(score.targetsPassed).toBe(0);
      expect(score.findings).toHaveLength(0);
    });

    test('should handle weighted targets (equal weights for now)', () => {
      const score = scoreRule(mockWeightedRule, mockSpec);

      expect(score.applicable).toBe(true);
      expect(score.coverage).toBe(1.0);
      expect(score.score).toBe(12);
      expect(score.targetsChecked).toBe(3);
      expect(score.targetsPassed).toBe(3);
    });

    test('should map severity correctly in findings', () => {
      const criticalRule: Rule = {
        ...mockFailingRule,
        severity: 'critical'
      };
      const majorRule: Rule = {
        ...mockFailingRule,
        severity: 'major'
      };
      const minorRule: Rule = {
        ...mockFailingRule,
        severity: 'minor'
      };

      const criticalScore = scoreRule(criticalRule, mockSpec);
      const majorScore = scoreRule(majorRule, mockSpec);
      const minorScore = scoreRule(minorRule, mockSpec);

      expect(criticalScore.findings[0].severity).toBe('critical');
      expect(majorScore.findings[0].severity).toBe('major');
      expect(minorScore.findings[0].severity).toBe('minor');
    });

    test('should include fix hints in findings', () => {
      const score = scoreRule(mockFailingRule, mockSpec);

      expect(score.findings[0].fixHint).toBe('Fix the issue');
    });

    test('should include category in findings', () => {
      const score = scoreRule(mockFailingRule, mockSpec);

      expect(score.findings[0].category).toBe('security');
    });

    test('should handle rules with validation errors', () => {
      const errorRule: Rule = {
        id: 'TEST-ERROR',
        category: 'functionality',
        severity: 'major',
        points: 10,
        description: 'Rule with validation error',
        rationale: 'Testing error handling',
        detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
        validate: () => {
          throw new Error('Validation error');
        }
      };

      expect(() => {
        scoreRule(errorRule, mockSpec);
      }).toThrow('Validation error');
    });

    test('should handle rules with detection errors', () => {
      const errorRule: Rule = {
        id: 'TEST-DETECT-ERROR',
        category: 'functionality',
        severity: 'major',
        points: 10,
        description: 'Rule with detection error',
        rationale: 'Testing error handling',
        detect: () => {
          throw new Error('Detection error');
        },
        validate: () => ({ passed: true })
      };

      expect(() => {
        scoreRule(errorRule, mockSpec);
      }).toThrow('Detection error');
    });
  });

  describe('scoreAllRules', () => {
    beforeEach(() => {
      // Clean up registry
      delete RULE_REGISTRY['TEST-PASS'];
      delete RULE_REGISTRY['TEST-FAIL'];
      delete RULE_REGISTRY['TEST-PARTIAL'];
      delete RULE_REGISTRY['TEST-NA'];
    });

    test('should score specific rules when provided', () => {
      // Add test rules to registry
      RULE_REGISTRY['TEST-PASS'] = mockPassingRule as any;
      RULE_REGISTRY['TEST-FAIL'] = mockFailingRule as any;

      const scores = scoreAllRules(mockSpec, ['TEST-PASS', 'TEST-FAIL']);

      expect(scores.size).toBe(2);
      expect(scores.has('TEST-PASS')).toBe(true);
      expect(scores.has('TEST-FAIL')).toBe(true);

      const passingScore = scores.get('TEST-PASS')!;
      const failingScore = scores.get('TEST-FAIL')!;

      expect(passingScore.coverage).toBe(1.0);
      expect(failingScore.coverage).toBe(0.0);

      // Cleanup
      delete RULE_REGISTRY['TEST-PASS'];
      delete RULE_REGISTRY['TEST-FAIL'];
    });

    test('should skip non-existent rules', () => {
      const scores = scoreAllRules(mockSpec, ['NON-EXISTENT']);

      expect(scores.size).toBe(0);
    });

    test('should score all registry rules when no IDs provided', () => {
      const scores = scoreAllRules(mockSpec);

      expect(scores.size).toBeGreaterThan(0);
      
      // Should not include prerequisite rules
      for (const score of scores.values()) {
        expect(score.severity).not.toBe('prerequisite');
      }
    });

    test('should skip prerequisite rules', () => {
      // Add a prerequisite rule to test skipping
      const prereqRule: Rule = {
        id: 'TEST-PREREQ',
        category: 'functionality',
        severity: 'prerequisite',
        points: 0,
        description: 'Test prerequisite rule',
        rationale: 'Should be skipped',
        detect: () => [{ type: 'path', location: '$.test', identifier: 'test' }],
        validate: () => ({ passed: true })
      };

      RULE_REGISTRY['TEST-PREREQ'] = prereqRule as any;

      const scores = scoreAllRules(mockSpec);

      expect(scores.has('TEST-PREREQ')).toBe(false);

      delete RULE_REGISTRY['TEST-PREREQ'];
    });

    test('should handle empty specification', () => {
      const emptySpec = {};
      const scores = scoreAllRules(emptySpec);

      // Should still work, rules just might not be applicable
      expect(scores.size).toBeGreaterThan(0);
    });
  });

  describe('calculateCategoryScores', () => {
    test('should calculate category scores correctly', () => {
      const mockScores = new Map<string, RuleScore>([
        ['FUNC-001', {
          ruleId: 'FUNC-001',
          ruleName: 'Func Rule 1',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 1.0,
          score: 20,
          maxScore: 20,
          targetsChecked: 5,
          targetsPassed: 5,
          findings: []
        }],
        ['FUNC-002', {
          ruleId: 'FUNC-002',
          ruleName: 'Func Rule 2',
          category: 'functionality',
          severity: 'minor',
          applicable: true,
          coverage: 0.5,
          score: 5,
          maxScore: 10,
          targetsChecked: 4,
          targetsPassed: 2,
          findings: []
        }],
        ['SEC-001', {
          ruleId: 'SEC-001',
          ruleName: 'Security Rule 1',
          category: 'security',
          severity: 'critical',
          applicable: false,
          coverage: 1.0,
          score: 15,
          maxScore: 15,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: []
        }]
      ]);

      const categoryScores = calculateCategoryScores(mockScores);

      // Check functionality category
      const funcScore = categoryScores.get('functionality')!;
      expect(funcScore.earned).toBe(25); // 20 + 5
      expect(funcScore.maximum).toBe(30); // 20 + 10
      expect(funcScore.percentage).toBeCloseTo(0.833, 3); // 25/30
      expect(funcScore.ruleCount).toBe(2);
      expect(funcScore.rulesApplicable).toBe(2);
      expect(funcScore.rulesPassed).toBe(1); // Only first rule has coverage 1.0

      // Check security category
      const secScore = categoryScores.get('security')!;
      expect(secScore.earned).toBe(15);
      expect(secScore.maximum).toBe(15);
      expect(secScore.percentage).toBe(1.0);
      expect(secScore.ruleCount).toBe(1);
      expect(secScore.rulesApplicable).toBe(0); // Rule is not applicable
      expect(secScore.rulesPassed).toBe(0);

      // Check empty categories
      const scaleScore = categoryScores.get('scalability')!;
      expect(scaleScore.earned).toBe(0);
      expect(scaleScore.maximum).toBe(0);
      expect(scaleScore.percentage).toBe(0);
      expect(scaleScore.ruleCount).toBe(0);
      expect(scaleScore.rulesApplicable).toBe(0);
      expect(scaleScore.rulesPassed).toBe(0);
    });

    test('should handle empty scores map', () => {
      const categoryScores = calculateCategoryScores(new Map());

      expect(categoryScores.size).toBe(5); // All categories should exist
      for (const score of categoryScores.values()) {
        expect(score.earned).toBe(0);
        expect(score.maximum).toBe(0);
        expect(score.percentage).toBe(0);
        expect(score.ruleCount).toBe(0);
        expect(score.rulesApplicable).toBe(0);
        expect(score.rulesPassed).toBe(0);
      }
    });

    test('should handle unknown categories gracefully', () => {
      const mockScores = new Map<string, RuleScore>([
        ['UNKNOWN-001', {
          ruleId: 'UNKNOWN-001',
          ruleName: 'Unknown Rule',
          category: 'unknown' as any,
          severity: 'major',
          applicable: true,
          coverage: 1.0,
          score: 10,
          maxScore: 10,
          targetsChecked: 1,
          targetsPassed: 1,
          findings: []
        }]
      ]);

      const categoryScores = calculateCategoryScores(mockScores);

      // Should still create all standard categories
      expect(categoryScores.size).toBe(5);
      expect(categoryScores.has('unknown')).toBe(false);
    });

    test('should calculate percentage correctly with zero maximum', () => {
      const mockScores = new Map<string, RuleScore>([
        ['TEST-001', {
          ruleId: 'TEST-001',
          ruleName: 'Test Rule',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 1.0,
          score: 0,
          maxScore: 0, // Edge case
          targetsChecked: 1,
          targetsPassed: 1,
          findings: []
        }]
      ]);

      const categoryScores = calculateCategoryScores(mockScores);
      const funcScore = categoryScores.get('functionality')!;

      expect(funcScore.percentage).toBe(0); // Should handle division by zero
      expect(Number.isNaN(funcScore.percentage)).toBe(false);
    });
  });

  describe('getImprovementOpportunities', () => {
    test('should identify and sort improvement opportunities', () => {
      const mockScores = new Map<string, RuleScore>([
        ['HIGH-IMPACT', {
          ruleId: 'HIGH-IMPACT',
          ruleName: 'High Impact Rule',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 0.2, // Low coverage
          score: 4,
          maxScore: 20, // High potential
          targetsChecked: 5,
          targetsPassed: 1,
          findings: []
        }],
        ['LOW-IMPACT', {
          ruleId: 'LOW-IMPACT',
          ruleName: 'Low Impact Rule',
          category: 'maintainability',
          severity: 'minor',
          applicable: true,
          coverage: 0.5,
          score: 2,
          maxScore: 4, // Low potential
          targetsChecked: 2,
          targetsPassed: 1,
          findings: []
        }],
        ['PERFECT', {
          ruleId: 'PERFECT',
          ruleName: 'Perfect Rule',
          category: 'security',
          severity: 'critical',
          applicable: true,
          coverage: 1.0, // Should be excluded
          score: 15,
          maxScore: 15,
          targetsChecked: 3,
          targetsPassed: 3,
          findings: []
        }],
        ['NOT-APPLICABLE', {
          ruleId: 'NOT-APPLICABLE',
          ruleName: 'N/A Rule',
          category: 'scalability',
          severity: 'minor',
          applicable: false, // Should be excluded
          coverage: 1.0,
          score: 8,
          maxScore: 8,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: []
        }]
      ]);

      RULE_REGISTRY['HIGH-IMPACT'] = { effort: 'medium' } as any;
      RULE_REGISTRY['LOW-IMPACT'] = { effort: 'easy' } as any;

      const opportunities = getImprovementOpportunities(mockScores);

      expect(opportunities).toHaveLength(2); // Only imperfect, applicable rules

      // Should be sorted by potential points (highest first)
      expect(opportunities[0].ruleId).toBe('HIGH-IMPACT');
      expect(opportunities[0].potentialPoints).toBe(16); // 20 - 4
      expect(opportunities[0].currentCoverage).toBe(0.2);
      expect(opportunities[0].fixCount).toBe(4); // 5 - 1
      expect(opportunities[0].effort).toBe('medium');

      expect(opportunities[1].ruleId).toBe('LOW-IMPACT');
      expect(opportunities[1].potentialPoints).toBe(2); // 4 - 2
      expect(opportunities[1].effort).toBe('easy');

      // Cleanup
      delete RULE_REGISTRY['HIGH-IMPACT'];
      delete RULE_REGISTRY['LOW-IMPACT'];
    });

    test('should handle empty scores', () => {
      const opportunities = getImprovementOpportunities(new Map());
      expect(opportunities).toHaveLength(0);
    });

    test('should handle rules without effort metadata', () => {
      const mockScores = new Map<string, RuleScore>([
        ['NO-EFFORT', {
          ruleId: 'NO-EFFORT',
          ruleName: 'No Effort Rule',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 0.5,
          score: 5,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 1,
          findings: []
        }]
      ]);

      // Don't add to registry, so no effort info
      const opportunities = getImprovementOpportunities(mockScores);

      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].effort).toBeUndefined();
    });
  });

  describe('calculateCoverageStats', () => {
    test('should calculate coverage statistics correctly', () => {
      const mockScores = new Map<string, RuleScore>([
        ['PERFECT', {
          ruleId: 'PERFECT',
          ruleName: 'Perfect Rule',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 1.0,
          score: 10,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 2,
          findings: []
        }],
        ['PARTIAL', {
          ruleId: 'PARTIAL',
          ruleName: 'Partial Rule',
          category: 'security',
          severity: 'major',
          applicable: true,
          coverage: 0.6,
          score: 6,
          maxScore: 10,
          targetsChecked: 5,
          targetsPassed: 3,
          findings: []
        }],
        ['FAILING', {
          ruleId: 'FAILING',
          ruleName: 'Failing Rule',
          category: 'scalability',
          severity: 'minor',
          applicable: true,
          coverage: 0.1,
          score: 1,
          maxScore: 10,
          targetsChecked: 10,
          targetsPassed: 1,
          findings: []
        }],
        ['NOT-APPLICABLE', {
          ruleId: 'NOT-APPLICABLE',
          ruleName: 'N/A Rule',
          category: 'maintainability',
          severity: 'minor',
          applicable: false,
          coverage: 1.0,
          score: 5,
          maxScore: 5,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: []
        }]
      ]);

      const stats = calculateCoverageStats(mockScores);

      expect(stats.totalRules).toBe(4);
      expect(stats.applicableRules).toBe(3);
      expect(stats.perfectRules).toBe(1);
      expect(stats.averageCoverage).toBeCloseTo(0.57, 2); // (1.0 + 0.6 + 0.1) / 3

      expect(stats.worstCoverage.ruleId).toBe('FAILING');
      expect(stats.worstCoverage.coverage).toBe(0.1);

      expect(stats.bestPartialCoverage.ruleId).toBe('PARTIAL');
      expect(stats.bestPartialCoverage.coverage).toBe(0.6);
    });

    test('should handle all perfect scores', () => {
      const mockScores = new Map<string, RuleScore>([
        ['PERFECT1', {
          ruleId: 'PERFECT1',
          ruleName: 'Perfect Rule 1',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 1.0,
          score: 10,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 2,
          findings: []
        }],
        ['PERFECT2', {
          ruleId: 'PERFECT2',
          ruleName: 'Perfect Rule 2',
          category: 'security',
          severity: 'major',
          applicable: true,
          coverage: 1.0,
          score: 15,
          maxScore: 15,
          targetsChecked: 3,
          targetsPassed: 3,
          findings: []
        }]
      ]);

      const stats = calculateCoverageStats(mockScores);

      expect(stats.perfectRules).toBe(2);
      expect(stats.averageCoverage).toBe(1.0);
      expect(stats.worstCoverage.ruleId).toBe('');
      expect(stats.worstCoverage.coverage).toBe(1.0);
      expect(stats.bestPartialCoverage.ruleId).toBe('');
      expect(stats.bestPartialCoverage.coverage).toBe(0.0);
    });

    test('should handle no applicable rules', () => {
      const mockScores = new Map<string, RuleScore>([
        ['NOT-APPLICABLE', {
          ruleId: 'NOT-APPLICABLE',
          ruleName: 'N/A Rule',
          category: 'maintainability',
          severity: 'minor',
          applicable: false,
          coverage: 1.0,
          score: 5,
          maxScore: 5,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: []
        }]
      ]);

      const stats = calculateCoverageStats(mockScores);

      expect(stats.totalRules).toBe(1);
      expect(stats.applicableRules).toBe(0);
      expect(stats.perfectRules).toBe(0);
      expect(stats.averageCoverage).toBe(0);
    });

    test('should handle empty scores', () => {
      const stats = calculateCoverageStats(new Map());

      expect(stats.totalRules).toBe(0);
      expect(stats.applicableRules).toBe(0);
      expect(stats.perfectRules).toBe(0);
      expect(stats.averageCoverage).toBe(0);
      expect(stats.worstCoverage.coverage).toBe(1.0);
      expect(stats.bestPartialCoverage.coverage).toBe(0.0);
    });
  });

  describe('generateCoverageReport', () => {
    test('should generate comprehensive coverage report', () => {
      const mockScores = new Map<string, RuleScore>([
        ['FUNC-001', {
          ruleId: 'FUNC-001',
          ruleName: 'CRUD Operations',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 0.8,
          score: 8,
          maxScore: 10,
          targetsChecked: 5,
          targetsPassed: 4,
          findings: []
        }],
        ['SEC-001', {
          ruleId: 'SEC-001',
          ruleName: 'Authentication',
          category: 'security',
          severity: 'critical',
          applicable: true,
          coverage: 1.0,
          score: 15,
          maxScore: 15,
          targetsChecked: 3,
          targetsPassed: 3,
          findings: []
        }],
        ['MAINT-001', {
          ruleId: 'MAINT-001',
          ruleName: 'Documentation',
          category: 'maintainability',
          severity: 'minor',
          applicable: false,
          coverage: 1.0,
          score: 5,
          maxScore: 5,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: []
        }]
      ]);

      const report = generateCoverageReport(mockScores);

      expect(report).toContain('Coverage-Based Scoring Report');
      expect(report).toContain('📊 FUNCTIONALITY');
      expect(report).toContain('(8.0/10 = 80.0%)');
      expect(report).toContain('⚠️ CRUD Operations');
      expect(report).toContain('Coverage: 4/5 = 80.0%');
      expect(report).toContain('Points: 8.0/10');

      expect(report).toContain('📊 SECURITY');
      expect(report).toContain('✅ Authentication');
      expect(report).toContain('Coverage: 3/3 = 100.0%');

      expect(report).toContain('📊 MAINTAINABILITY');
      expect(report).toContain('➖ Documentation (N/A - no targets)');

      expect(report).toContain('=== Summary ===');
      expect(report).toContain('Total Rules: 3');
      expect(report).toContain('Applicable: 2');
      expect(report).toContain('Perfect Coverage: 1');
      expect(report).toContain('Average Coverage: 90.0%'); // (0.8 + 1.0) / 2
      expect(report).toContain('Worst Coverage: FUNC-001 (80.0%)');
    });

    test('should handle empty scores', () => {
      const report = generateCoverageReport(new Map());

      expect(report).toContain('Coverage-Based Scoring Report');
      expect(report).toContain('Total Rules: 0');
      expect(report).toContain('Applicable: 0');
      expect(report).toContain('Perfect Coverage: 0');
      expect(report).toContain('Average Coverage: 0.0%');
    });

    test('should group by category correctly', () => {
      const mockScores = new Map<string, RuleScore>([
        ['FUNC-001', {
          ruleId: 'FUNC-001',
          ruleName: 'Func Rule 1',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 1.0,
          score: 10,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 2,
          findings: []
        }],
        ['FUNC-002', {
          ruleId: 'FUNC-002',
          ruleName: 'Func Rule 2',
          category: 'functionality',
          severity: 'minor',
          applicable: true,
          coverage: 0.5,
          score: 2,
          maxScore: 4,
          targetsChecked: 4,
          targetsPassed: 2,
          findings: []
        }]
      ]);

      const report = generateCoverageReport(mockScores);

      expect(report).toContain('📊 FUNCTIONALITY (12.0/14 = 85.7%)');
    });

    test('should use correct status icons', () => {
      const mockScores = new Map<string, RuleScore>([
        ['PERFECT', {
          ruleId: 'PERFECT',
          ruleName: 'Perfect Rule',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 1.0,
          score: 10,
          maxScore: 10,
          targetsChecked: 1,
          targetsPassed: 1,
          findings: []
        }],
        ['FAILING', {
          ruleId: 'FAILING',
          ruleName: 'Failing Rule',
          category: 'security',
          severity: 'major',
          applicable: true,
          coverage: 0.0,
          score: 0,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 0,
          findings: []
        }],
        ['PARTIAL', {
          ruleId: 'PARTIAL',
          ruleName: 'Partial Rule',
          category: 'scalability',
          severity: 'major',
          applicable: true,
          coverage: 0.5,
          score: 5,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 1,
          findings: []
        }]
      ]);

      const report = generateCoverageReport(mockScores);

      expect(report).toContain('✅ Perfect Rule');
      expect(report).toContain('❌ Failing Rule');
      expect(report).toContain('⚠️ Partial Rule');
    });
  });

  describe('Edge Cases and Performance', () => {
    test('should handle malformed specifications gracefully', () => {
      const malformedSpec = {
        // Missing required fields
        paths: null,
        components: undefined
      };

      expect(() => {
        scoreRule(mockPassingRule, malformedSpec as any);
      }).not.toThrow();
    });

    test('should handle very large numbers of targets', () => {
      const largeRule: Rule = {
        id: 'LARGE-RULE',
        category: 'functionality',
        severity: 'major',
        points: 100,
        description: 'Rule with many targets',
        rationale: 'Performance test',
        detect: () => {
          const targets: Target[] = [];
          for (let i = 0; i < 1000; i++) {
            targets.push({
              type: 'path',
              location: `$.paths["/path${i}"]`,
              identifier: `Path ${i}`
            });
          }
          return targets;
        },
        validate: (target) => ({
          passed: parseInt(target.identifier.split(' ')[1]) % 2 === 0 // Even numbers pass
        })
      };

      const start = Date.now();
      const score = scoreRule(largeRule, mockSpec);
      const duration = Date.now() - start;

      expect(score.targetsChecked).toBe(1000);
      expect(score.targetsPassed).toBe(500); // Half should pass
      expect(score.coverage).toBe(0.5);
      expect(duration).toBeLessThan(1000); // Should complete in reasonable time
    });

    test('should handle rules with complex validation logic', () => {
      const complexRule: Rule = {
        id: 'COMPLEX-RULE',
        category: 'excellence',
        severity: 'minor',
        points: 10,
        description: 'Complex validation rule',
        rationale: 'Testing complex scenarios',
        detect: (spec) => [
          { type: 'path', location: '$.paths', identifier: 'All paths' }
        ],
        validate: (target, spec) => {
          // Complex validation logic
          const paths = spec?.paths || {};
          const pathCount = Object.keys(paths).length;
          const hasGet = Object.values(paths).some((p: any) => p?.get);
          const hasPost = Object.values(paths).some((p: any) => p?.post);
          
          const score = (pathCount >= 2 ? 0.4 : 0) + 
                       (hasGet ? 0.3 : 0) + 
                       (hasPost ? 0.3 : 0);
          
          return {
            passed: score >= 0.8,
            message: score < 0.8 ? `Complex validation score: ${score}` : undefined,
            confidence: 0.9
          };
        }
      };

      const score = scoreRule(complexRule, mockSpec);

      expect(score.applicable).toBe(true);
      expect(typeof score.coverage).toBe('number');
      expect(score.coverage).toBeGreaterThanOrEqual(0);
      expect(score.coverage).toBeLessThanOrEqual(1);
    });

    test('should handle circular references in specification', () => {
      const circularSpec: any = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {}
      };
      circularSpec.circular = circularSpec; // Create circular reference

      expect(() => {
        scoreRule(mockPassingRule, circularSpec);
      }).not.toThrow();
    });

    test('should handle extremely low coverage values', () => {
      const lowCoverageRule: Rule = {
        id: 'LOW-COV-RULE',
        category: 'functionality',
        severity: 'major',
        points: 10,
        description: 'Rule with very low coverage',
        rationale: 'Testing precision',
        detect: () => Array.from({ length: 10000 }, (_, i) => ({
          type: 'path' as const,
          location: `$.path${i}`,
          identifier: `Target ${i}`
        })),
        validate: (target) => ({
          passed: target.identifier === 'Target 0' // Only first target passes
        })
      };

      const score = scoreRule(lowCoverageRule, mockSpec);

      expect(score.coverage).toBeCloseTo(0.0001, 4); // 1/10000
      expect(score.score).toBeCloseTo(0.001, 3); // Very small score
      expect(score.targetsChecked).toBe(10000);
      expect(score.targetsPassed).toBe(1);
    });

    test('should handle concurrent rule scoring', async () => {
      const rules = [mockPassingRule, mockFailingRule, mockPartialRule];
      
      const start = Date.now();
      const promises = rules.map(rule => 
        new Promise(resolve => {
          setTimeout(() => resolve(scoreRule(rule, mockSpec)), Math.random() * 10);
        })
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      expect(results).toHaveLength(3);
      expect(duration).toBeLessThan(100);
      
      for (const result of results) {
        expect(result).toBeDefined();
        expect(typeof (result as RuleScore).score).toBe('number');
      }
    });

    test('should handle memory efficiently with repeated scoring', () => {
      const iterations = 100;
      const memBefore = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < iterations; i++) {
        scoreRule(mockPassingRule, mockSpec);
        scoreRule(mockFailingRule, mockSpec);
        scoreRule(mockPartialRule, mockSpec);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const memAfter = process.memoryUsage().heapUsed;
      const memIncrease = memAfter - memBefore;
      
      // Memory increase should be reasonable (less than 10MB)
      expect(memIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Real-World Rule Scenarios', () => {
    test('should handle authentication rule scenarios', () => {
      const authRule: Rule = {
        id: 'AUTH-SCENARIOS',
        category: 'security',
        severity: 'critical',
        points: 25,
        description: 'Authentication coverage scenarios',
        rationale: 'Security is critical',
        detect: (spec) => {
          const operations: Target[] = [];
          const paths = spec.paths || {};
          
          for (const [path, pathItem] of Object.entries(paths)) {
            const methods = ['get', 'post', 'put', 'patch', 'delete'];
            for (const method of methods) {
              if ((pathItem as any)[method]) {
                operations.push({
                  type: 'operation',
                  location: `$.paths["${path}"].${method}`,
                  identifier: `${method.toUpperCase()} ${path}`,
                  method: method as any,
                  path
                });
              }
            }
          }
          
          return operations;
        },
        validate: (target) => {
          // Write operations require auth, read operations may not
          const isWriteOp = ['post', 'put', 'patch', 'delete'].includes(target.method || '');
          const hasAuth = target.identifier.includes('/api/v2/'); // Simplified check
          
          if (isWriteOp && !hasAuth) {
            return {
              passed: false,
              message: `${target.identifier} requires authentication`,
              fixHint: 'Add security requirement to operation'
            };
          }
          
          return { passed: true };
        }
      };

      const score = scoreRule(authRule, mockSpec);
      
      expect(score.applicable).toBe(true);
      expect(score.targetsChecked).toBe(3); // 3 operations in mockSpec
      expect(score.coverage).toBeGreaterThan(0);
    });

    test('should handle pagination rule scenarios', () => {
      const paginationRule: Rule = {
        id: 'PAGINATION-SCENARIOS',
        category: 'scalability',
        severity: 'major',
        points: 15,
        description: 'Pagination implementation scenarios',
        rationale: 'Scalability requires proper pagination',
        detect: (spec) => {
          const listOperations: Target[] = [];
          const paths = spec.paths || {};
          
          for (const [path, pathItem] of Object.entries(paths)) {
            const getOp = (pathItem as any).get;
            if (getOp && !path.includes('{')) { // Collection endpoints
              listOperations.push({
                type: 'operation',
                location: `$.paths["${path}"].get`,
                identifier: `GET ${path}`,
                path
              });
            }
          }
          
          return listOperations;
        },
        validate: (target, spec) => {
          const pathItem = spec.paths?.[target.path as string];
          const getOp = pathItem?.get;
          const parameters = getOp?.parameters || [];
          
          const hasLimitParam = parameters.some((p: any) => 
            p.name === 'limit' || (p.$ref && p.$ref.includes('Limit'))
          );
          const hasCursorParam = parameters.some((p: any) => 
            p.name === 'after_key' || p.name === 'cursor' || (p.$ref && p.$ref.includes('After'))
          );
          
          if (!hasLimitParam) {
            return {
              passed: false,
              message: `${target.identifier} missing limit parameter`,
              fixHint: 'Add limit parameter for pagination'
            };
          }
          
          if (!hasCursorParam) {
            return {
              passed: false,
              message: `${target.identifier} missing cursor parameter`,
              fixHint: 'Add cursor/after_key parameter for key-set pagination'
            };
          }
          
          return { passed: true };
        }
      };

      const score = scoreRule(paginationRule, mockSpec);
      
      expect(score.applicable).toBe(true);
      expect(score.targetsChecked).toBe(1); // Only /api/v2/users GET is a collection
      expect(typeof score.coverage).toBe('number');
    });

    test('should handle multi-tenancy rule scenarios', () => {
      const tenancyRule: Rule = {
        id: 'TENANCY-SCENARIOS',
        category: 'security',
        severity: 'critical',
        points: 20,
        description: 'Multi-tenancy header scenarios',
        rationale: 'Data isolation is critical',
        detect: (spec) => {
          const writeOperations: Target[] = [];
          const paths = spec.paths || {};
          
          for (const [path, pathItem] of Object.entries(paths)) {
            const writeMethods = ['post', 'put', 'patch', 'delete'];
            for (const method of writeMethods) {
              if ((pathItem as any)[method]) {
                writeOperations.push({
                  type: 'operation',
                  location: `$.paths["${path}"].${method}`,
                  identifier: `${method.toUpperCase()} ${path}`,
                  method: method as any,
                  path
                });
              }
            }
          }
          
          return writeOperations;
        },
        validate: (target, spec) => {
          const pathItem = spec.paths?.[target.path as string];
          const operation = pathItem?.[target.method as string];
          const allParameters = [
            ...(pathItem?.parameters || []),
            ...(operation?.parameters || [])
          ];
          
          const hasOrgHeader = allParameters.some((p: any) => 
            p.name === 'X-Organization-ID' || 
            (p.$ref && p.$ref.includes('Organization'))
          );
          
          if (!hasOrgHeader) {
            return {
              passed: false,
              message: `${target.identifier} missing X-Organization-ID header`,
              fixHint: 'Add X-Organization-ID parameter for multi-tenancy'
            };
          }
          
          return { passed: true };
        }
      };

      const score = scoreRule(tenancyRule, mockSpec);
      
      expect(score.applicable).toBe(true);
      expect(score.targetsChecked).toBe(1); // Only POST /api/v2/users is a write op
      expect(score.targetsPassed).toBe(1); // It has the org header
      expect(score.coverage).toBe(1.0);
    });

    test('should handle error response rule scenarios', () => {
      const errorRule: Rule = {
        id: 'ERROR-SCENARIOS',
        category: 'maintainability',
        severity: 'major',
        points: 12,
        description: 'Error response coverage scenarios',
        rationale: 'Proper error handling improves maintainability',
        detect: (spec) => {
          const allOperations: Target[] = [];
          const paths = spec.paths || {};
          
          for (const [path, pathItem] of Object.entries(paths)) {
            const methods = ['get', 'post', 'put', 'patch', 'delete'];
            for (const method of methods) {
              if ((pathItem as any)[method]) {
                allOperations.push({
                  type: 'operation',
                  location: `$.paths["${path}"].${method}`,
                  identifier: `${method.toUpperCase()} ${path}`,
                  method: method as any
                });
              }
            }
          }
          
          return allOperations;
        },
        validate: (target, spec) => {
          const [path, method] = target.location.split('.').slice(-2);
          const pathKey = path.replace(/^\["/, '').replace(/"\]$/, '');
          const operation = spec.paths?.[pathKey]?.[method];
          const responses = operation?.responses || {};
          
          const hasErrorResponses = Object.keys(responses).some(code => 
            code.startsWith('4') || code.startsWith('5')
          );
          
          if (!hasErrorResponses) {
            return {
              passed: false,
              message: `${target.identifier} missing error response definitions`,
              fixHint: 'Add 4xx and 5xx response definitions'
            };
          }
          
          return { passed: true };
        }
      };

      const score = scoreRule(errorRule, mockSpec);
      
      expect(score.applicable).toBe(true);
      expect(score.coverage).toBe(0.0); // mockSpec has no error responses defined
      expect(score.findings.length).toBeGreaterThan(0);
    });

    test('should handle schema validation rule scenarios', () => {
      const schemaRule: Rule = {
        id: 'SCHEMA-SCENARIOS',
        category: 'functionality',
        severity: 'major',
        points: 18,
        description: 'Schema validation scenarios',
        rationale: 'Schemas ensure data consistency',
        detect: (spec) => {
          const operationsWithBodies: Target[] = [];
          const paths = spec.paths || {};
          
          for (const [path, pathItem] of Object.entries(paths)) {
            const methodsWithBodies = ['post', 'put', 'patch'];
            for (const method of methodsWithBodies) {
              const operation = (pathItem as any)[method];
              if (operation?.requestBody) {
                operationsWithBodies.push({
                  type: 'operation',
                  location: `$.paths["${path}"].${method}`,
                  identifier: `${method.toUpperCase()} ${path}`,
                  method: method as any
                });
              }
            }
          }
          
          return operationsWithBodies;
        },
        validate: (target, spec) => {
          const [path, method] = target.location.split('.').slice(-2);
          const pathKey = path.replace(/^\["/, '').replace(/"\]$/, '');
          const operation = spec.paths?.[pathKey]?.[method];
          const requestBody = operation?.requestBody;
          
          if (!requestBody) {
            return { passed: true }; // No body to validate
          }
          
          const content = requestBody.content || {};
          const jsonContent = content['application/json'];
          
          if (!jsonContent?.schema) {
            return {
              passed: false,
              message: `${target.identifier} requestBody missing schema`,
              fixHint: 'Add schema definition to requestBody content'
            };
          }
          
          const schema = jsonContent.schema;
          const hasValidation = schema.required || schema.properties || schema.type;
          
          if (!hasValidation) {
            return {
              passed: false,
              message: `${target.identifier} schema lacks validation rules`,
              fixHint: 'Add required fields, type, or properties to schema'
            };
          }
          
          return { passed: true };
        }
      };

      const score = scoreRule(schemaRule, mockSpec);
      
      expect(score.applicable).toBe(true);
      expect(score.targetsChecked).toBe(1); // POST /api/v2/users has requestBody
      expect(score.coverage).toBe(1.0); // mockSpec has proper schema with required field
    });
  });

  describe('Scoring System Integration', () => {
    test('should provide consistent scores across multiple runs', () => {
      const iterations = 10;
      const scores = [];
      
      for (let i = 0; i < iterations; i++) {
        const score = scoreRule(mockPartialRule, mockSpec);
        scores.push(score);
      }
      
      // All scores should be identical
      const firstScore = scores[0];
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i].score).toBe(firstScore.score);
        expect(scores[i].coverage).toBe(firstScore.coverage);
        expect(scores[i].targetsChecked).toBe(firstScore.targetsChecked);
        expect(scores[i].targetsPassed).toBe(firstScore.targetsPassed);
      }
    });

    test('should handle cross-category rule dependencies', () => {
      // This test verifies coverage scoring works with rules that might
      // interact across categories (though dependencies are handled elsewhere)
      const functionalityScore = scoreRule(mockPassingRule, mockSpec);
      const securityScore = scoreRule(mockFailingRule, mockSpec);
      
      // Scores should be independent
      expect(functionalityScore.coverage).toBe(1.0);
      expect(securityScore.coverage).toBe(0.0);
      
      // Categories should be different
      expect(functionalityScore.category).toBe('functionality');
      expect(securityScore.category).toBe('security');
    });

    test('should provide meaningful improvement suggestions', () => {
      const mixedScores = new Map<string, RuleScore>([
        ['HIGH-POTENTIAL', {
          ruleId: 'HIGH-POTENTIAL',
          ruleName: 'High Potential Rule',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 0.3, // Low coverage
          score: 6,
          maxScore: 20, // High max score
          targetsChecked: 10,
          targetsPassed: 3,
          findings: [
            { ruleId: 'HIGH-POTENTIAL', severity: 'major', message: 'Issue 1', location: '$.path1' },
            { ruleId: 'HIGH-POTENTIAL', severity: 'major', message: 'Issue 2', location: '$.path2' }
          ]
        }],
        ['LOW-POTENTIAL', {
          ruleId: 'LOW-POTENTIAL',
          ruleName: 'Low Potential Rule',
          category: 'maintainability',
          severity: 'minor',
          applicable: true,
          coverage: 0.8, // High coverage
          score: 3.2,
          maxScore: 4, // Low max score
          targetsChecked: 5,
          targetsPassed: 4,
          findings: [
            { ruleId: 'LOW-POTENTIAL', severity: 'minor', message: 'Minor issue', location: '$.path3' }
          ]
        }]
      ]);

      RULE_REGISTRY['HIGH-POTENTIAL'] = { effort: 'medium' } as any;
      RULE_REGISTRY['LOW-POTENTIAL'] = { effort: 'hard' } as any;

      const opportunities = getImprovementOpportunities(mixedScores);

      expect(opportunities).toHaveLength(2);
      
      // High potential should come first (sorted by potential points)
      expect(opportunities[0].ruleId).toBe('HIGH-POTENTIAL');
      expect(opportunities[0].potentialPoints).toBe(14); // 20 - 6
      expect(opportunities[0].fixCount).toBe(7); // 10 - 3
      expect(opportunities[0].currentCoverage).toBe(0.3);
      expect(opportunities[0].effort).toBe('medium');
      
      expect(opportunities[1].ruleId).toBe('LOW-POTENTIAL');
      expect(opportunities[1].potentialPoints).toBe(0.8); // 4 - 3.2
      expect(opportunities[1].fixCount).toBe(1); // 5 - 4
      expect(opportunities[1].effort).toBe('hard');

      delete RULE_REGISTRY['HIGH-POTENTIAL'];
      delete RULE_REGISTRY['LOW-POTENTIAL'];
    });

    test('should handle zero-point rules correctly', () => {
      const zeroPointRule: Rule = {
        id: 'ZERO-POINTS',
        category: 'maintainability',
        severity: 'minor',
        points: 0, // Zero points
        description: 'Information only rule',
        rationale: 'Provides info but no score impact',
        detect: () => [{ type: 'path', location: '$.info', identifier: 'API info' }],
        validate: () => ({ passed: false, message: 'Just informational' })
      };

      const score = scoreRule(zeroPointRule, mockSpec);

      expect(score.maxScore).toBe(0);
      expect(score.score).toBe(0);
      expect(score.coverage).toBe(0.0); // Still calculated
      expect(score.applicable).toBe(true);
      expect(score.findings).toHaveLength(1);
    });

    test('should preserve finding metadata correctly', () => {
      const detailedRule: Rule = {
        id: 'DETAILED-FINDINGS',
        category: 'security',
        severity: 'major',
        points: 10,
        description: 'Rule with detailed findings',
        rationale: 'Testing finding metadata',
        detect: () => [
          { type: 'operation', location: '$.paths["/api/v2/users"].get', identifier: 'GET users' },
          { type: 'operation', location: '$.paths["/api/v2/users"].post', identifier: 'POST users' }
        ],
        validate: (target) => ({
          passed: false,
          message: `Detailed issue for ${target.identifier}`,
          fixHint: `Fix the ${target.type} at ${target.location}`,
          confidence: 0.95,
          severity: 'major'
        })
      };

      const score = scoreRule(detailedRule, mockSpec);

      expect(score.findings).toHaveLength(2);
      
      for (const finding of score.findings) {
        expect(finding.ruleId).toBe('DETAILED-FINDINGS');
        expect(finding.severity).toBe('major');
        expect(finding.message).toContain('Detailed issue for');
        expect(finding.fixHint).toContain('Fix the');
        expect(finding.location).toContain('$.paths');
        expect(finding.category).toBe('security');
      }
    });
  });
});