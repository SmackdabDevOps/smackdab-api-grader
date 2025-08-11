import { describe, test, expect, beforeEach } from '@jest/globals';
import { 
  scoreWithCoverage,
  calculateWeightedGrade,
  applyExcellenceBonuses,
  getCoverageMetrics,
  generateCoverageBasedReport,
  compareCoverageScoring,
  identifyOptimalImprovements
} from '../../../src/scoring/coverage-scoring';
import { RuleScore } from '../../../src/scoring/coverage';
import { RULE_REGISTRY } from '../../../src/rules/registry';

describe('Coverage-Based Scoring System', () => {
  const mockSpec = {
    openapi: '3.0.3',
    info: { title: 'Test API', version: '2.0.0' },
    paths: {
      '/api/v2/users': {
        parameters: [{ $ref: '#/components/parameters/OrganizationHeader' }],
        get: {
          summary: 'List users with pagination',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100 } },
            { name: 'after_key', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            '200': { 
              description: 'Users retrieved successfully',
              headers: {
                'ETag': { schema: { type: 'string' } },
                'Cache-Control': { schema: { type: 'string' } }
              }
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal error' }
          },
          security: [{ OAuth2: ['read'] }]
        },
        post: {
          summary: 'Create user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email'],
                  properties: {
                    name: { type: 'string', minLength: 1 },
                    email: { type: 'string', format: 'email' }
                  }
                }
              }
            }
          },
          responses: {
            '201': { description: 'User created' },
            '400': { description: 'Validation error' },
            '409': { description: 'User already exists' }
          },
          security: [{ OAuth2: ['write'] }]
        }
      },
      '/api/v2/users/{id}': {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/OrganizationHeader' }
        ],
        get: {
          responses: { '200': { description: 'User details' } },
          security: [{ OAuth2: ['read'] }]
        },
        put: {
          requestBody: { 
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } }
          },
          responses: { '200': { description: 'User updated' } },
          security: [{ OAuth2: ['write'] }]
        },
        delete: {
          responses: { '204': { description: 'User deleted' } },
          security: [{ OAuth2: ['write'] }]
        }
      },
      '/api/v2/health': {
        get: {
          summary: 'Health check endpoint',
          responses: { '200': { description: 'Service healthy' } }
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
              scopes: {
                read: 'Read access to resources',
                write: 'Write access to resources'
              }
            }
          }
        }
      },
      schemas: {
        User: {
          type: 'object',
          required: ['id', 'name', 'email'],
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' }
          }
        }
      }
    },
    security: [{ OAuth2: [] }]
  };

  const createMockScore = (
    ruleId: string,
    category: string,
    coverage: number,
    maxScore: number,
    findings: any[] = []
  ): RuleScore => ({
    ruleId,
    ruleName: `Rule ${ruleId}`,
    category,
    severity: 'major',
    applicable: true,
    coverage,
    score: Math.round(coverage * maxScore * 100) / 100,
    maxScore,
    targetsChecked: 10,
    targetsPassed: Math.round(coverage * 10),
    findings
  });

  describe('scoreWithCoverage', () => {
    test('should score all rules with coverage-based approach', async () => {
      const result = await scoreWithCoverage(mockSpec);

      expect(result.scores.size).toBeGreaterThan(0);
      expect(result.metadata.scoringEngine).toBe('coverage');
      expect(result.metadata.timestamp).toBeDefined();
      expect(result.metadata.specHash).toBeDefined();

      // All scores should have coverage metrics
      for (const score of result.scores.values()) {
        expect(score.coverage).toBeGreaterThanOrEqual(0);
        expect(score.coverage).toBeLessThanOrEqual(1.0);
        expect(score.targetsChecked).toBeGreaterThanOrEqual(0);
        expect(score.targetsPassed).toBeLessThanOrEqual(score.targetsChecked);
      }
    });

    test('should calculate category totals correctly', async () => {
      const result = await scoreWithCoverage(mockSpec);

      expect(result.categoryTotals.functionality).toBeDefined();
      expect(result.categoryTotals.security).toBeDefined();
      expect(result.categoryTotals.scalability).toBeDefined();
      expect(result.categoryTotals.maintainability).toBeDefined();
      expect(result.categoryTotals.excellence).toBeDefined();

      // Each category should have proper structure
      for (const categoryTotal of Object.values(result.categoryTotals)) {
        expect(categoryTotal.earned).toBeGreaterThanOrEqual(0);
        expect(categoryTotal.maximum).toBeGreaterThanOrEqual(0);
        expect(categoryTotal.percentage).toBeGreaterThanOrEqual(0);
        expect(categoryTotal.percentage).toBeLessThanOrEqual(1.0);
      }
    });

    test('should identify improvement opportunities', async () => {
      const result = await scoreWithCoverage(mockSpec);

      expect(Array.isArray(result.improvementOpportunities)).toBe(true);
      
      // Opportunities should be sorted by potential points (descending)
      for (let i = 1; i < result.improvementOpportunities.length; i++) {
        expect(result.improvementOpportunities[i-1].potentialPoints)
          .toBeGreaterThanOrEqual(result.improvementOpportunities[i].potentialPoints);
      }
    });

    test('should provide coverage statistics', async () => {
      const result = await scoreWithCoverage(mockSpec);

      expect(result.coverageStats.totalRules).toBeGreaterThan(0);
      expect(result.coverageStats.applicableRules).toBeLessThanOrEqual(result.coverageStats.totalRules);
      expect(result.coverageStats.averageCoverage).toBeGreaterThanOrEqual(0);
      expect(result.coverageStats.averageCoverage).toBeLessThanOrEqual(1.0);
    });

    test('should handle empty specification gracefully', async () => {
      const emptySpec = {};
      const result = await scoreWithCoverage(emptySpec);

      expect(result.scores.size).toBeGreaterThan(0); // Rules still evaluated
      expect(result.metadata.scoringEngine).toBe('coverage');
      
      // Many rules may not be applicable
      let applicableCount = 0;
      for (const score of result.scores.values()) {
        if (score.applicable) applicableCount++;
      }
      
      // Should have fewer applicable rules than with full spec
      expect(applicableCount).toBeLessThan(result.scores.size);
    });

    test('should exclude prerequisite rules', async () => {
      const result = await scoreWithCoverage(mockSpec);

      for (const score of result.scores.values()) {
        expect(score.severity).not.toBe('prerequisite');
      }
    });
  });

  describe('calculateWeightedGrade', () => {
    test('should calculate weighted grade with default weights', () => {
      const mockScores = new Map([
        ['FUNC-1', createMockScore('FUNC-1', 'functionality', 0.8, 30)], // 24 points
        ['SEC-1', createMockScore('SEC-1', 'security', 0.9, 25)], // 22.5 points  
        ['SCALE-1', createMockScore('SCALE-1', 'scalability', 0.7, 20)], // 14 points
        ['MAINT-1', createMockScore('MAINT-1', 'maintainability', 0.6, 15)], // 9 points
        ['EXCEL-1', createMockScore('EXCEL-1', 'excellence', 0.5, 10)] // 5 points
      ]);

      const result = calculateWeightedGrade(mockScores);

      expect(result.finalScore).toBeGreaterThan(60);
      expect(result.finalScore).toBeLessThan(85);
      expect(result.categoryBreakdown).toHaveLength(5);

      // Check category calculations
      const funcCategory = result.categoryBreakdown.find(c => c.category === 'functionality');
      expect(funcCategory).toBeDefined();
      expect(funcCategory!.earnedPoints).toBe(24);
      expect(funcCategory!.maxPoints).toBe(30);
      expect(funcCategory!.percentage).toBeCloseTo(0.8, 2);
      expect(funcCategory!.weightedContribution).toBeCloseTo(24 * 0.3, 1); // 30% weight
    });

    test('should handle custom weights', () => {
      const mockScores = new Map([
        ['FUNC-1', createMockScore('FUNC-1', 'functionality', 1.0, 50)]
      ]);

      const customWeights = {
        functionality: 0.6,
        security: 0.2,
        scalability: 0.1,
        maintainability: 0.05,
        excellence: 0.05
      };

      const result = calculateWeightedGrade(mockScores, customWeights);
      
      const funcCategory = result.categoryBreakdown.find(c => c.category === 'functionality');
      expect(funcCategory!.weightedContribution).toBeCloseTo(50 * 0.6, 1);
    });

    test('should handle zero scores correctly', () => {
      const mockScores = new Map([
        ['FAIL-1', createMockScore('FAIL-1', 'functionality', 0.0, 30, [
          { ruleId: 'FAIL-1', severity: 'major', message: 'Complete failure' }
        ])]
      ]);

      const result = calculateWeightedGrade(mockScores);

      expect(result.finalScore).toBeCloseTo(0, 1);
      
      const funcCategory = result.categoryBreakdown.find(c => c.category === 'functionality');
      expect(funcCategory!.earnedPoints).toBe(0);
      expect(funcCategory!.percentage).toBe(0);
    });

    test('should aggregate findings correctly', () => {
      const mockScores = new Map([
        ['RULE-1', createMockScore('RULE-1', 'functionality', 0.5, 20, [
          { ruleId: 'RULE-1', severity: 'critical', message: 'Critical issue' },
          { ruleId: 'RULE-1', severity: 'major', message: 'Major issue' }
        ])],
        ['RULE-2', createMockScore('RULE-2', 'security', 0.7, 15, [
          { ruleId: 'RULE-2', severity: 'minor', message: 'Minor issue' }
        ])]
      ]);

      const result = calculateWeightedGrade(mockScores);

      expect(result.allFindings).toHaveLength(3);
      expect(result.findingsSummary.critical).toBe(1);
      expect(result.findingsSummary.major).toBe(1);
      expect(result.findingsSummary.minor).toBe(1);
      expect(result.findingsSummary.total).toBe(3);

      // Should be sorted by severity
      expect(result.allFindings[0].severity).toBe('critical');
      expect(result.allFindings[1].severity).toBe('major');
      expect(result.allFindings[2].severity).toBe('minor');
    });

    test('should handle missing categories gracefully', () => {
      const mockScores = new Map([
        ['FUNC-ONLY', createMockScore('FUNC-ONLY', 'functionality', 0.8, 30)]
        // Missing other categories
      ]);

      const result = calculateWeightedGrade(mockScores);

      expect(result.categoryBreakdown).toHaveLength(5); // All categories present
      
      // Missing categories should have zero values
      const secCategory = result.categoryBreakdown.find(c => c.category === 'security');
      expect(secCategory!.earnedPoints).toBe(0);
      expect(secCategory!.maxPoints).toBe(0);
      expect(secCategory!.percentage).toBe(0);
      expect(secCategory!.weightedContribution).toBe(0);
    });
  });

  describe('applyExcellenceBonuses', () => {
    test('should apply excellence bonuses correctly', () => {
      const baseScore = 85;
      const mockScores = new Map([
        ['EXCEL-WEBHOOK', createMockScore('EXCEL-WEBHOOK', 'excellence', 1.0, 5)],
        ['EXCEL-GRAPHQL', createMockScore('EXCEL-GRAPHQL', 'excellence', 0.8, 8)],
        ['EXCEL-HYPERMEDIA', createMockScore('EXCEL-HYPERMEDIA', 'excellence', 0.6, 6)]
      ]);

      const result = applyExcellenceBonuses(baseScore, mockScores);

      expect(result.adjustedScore).toBeGreaterThan(baseScore);
      expect(result.excellenceBonuses).toHaveLength(3);
      expect(result.totalBonusPoints).toBeGreaterThan(0);

      // Check individual bonuses
      const webhookBonus = result.excellenceBonuses.find(b => b.feature === 'EXCEL-WEBHOOK');
      expect(webhookBonus).toBeDefined();
      expect(webhookBonus!.bonusPoints).toBeCloseTo(5, 1); // Full coverage = full points
      expect(webhookBonus!.coverage).toBe(1.0);
    });

    test('should not exceed maximum score with bonuses', () => {
      const baseScore = 95;
      const mockScores = new Map([
        ['EXCEL-1', createMockScore('EXCEL-1', 'excellence', 1.0, 10)],
        ['EXCEL-2', createMockScore('EXCEL-2', 'excellence', 1.0, 10)],
        ['EXCEL-3', createMockScore('EXCEL-3', 'excellence', 1.0, 10)]
      ]);

      const result = applyExcellenceBonuses(baseScore, mockScores);

      expect(result.adjustedScore).toBeLessThanOrEqual(100);
      expect(result.cappedAtMaximum).toBe(true);
    });

    test('should handle no excellence features', () => {
      const baseScore = 80;
      const mockScores = new Map([
        ['FUNC-1', createMockScore('FUNC-1', 'functionality', 1.0, 20)]
        // No excellence features
      ]);

      const result = applyExcellenceBonuses(baseScore, mockScores);

      expect(result.adjustedScore).toBe(baseScore);
      expect(result.excellenceBonuses).toHaveLength(0);
      expect(result.totalBonusPoints).toBe(0);
    });

    test('should handle partial excellence coverage', () => {
      const baseScore = 75;
      const mockScores = new Map([
        ['EXCEL-PARTIAL', createMockScore('EXCEL-PARTIAL', 'excellence', 0.3, 10)]
      ]);

      const result = applyExcellenceBonuses(baseScore, mockScores);

      expect(result.adjustedScore).toBeCloseTo(78, 1); // 75 + (0.3 * 10)
      expect(result.excellenceBonuses[0].bonusPoints).toBeCloseTo(3, 1);
    });

    test('should provide meaningful bonus descriptions', () => {
      const baseScore = 80;
      const mockScores = new Map([
        ['EXCEL-WEBHOOK', createMockScore('EXCEL-WEBHOOK', 'excellence', 1.0, 5)]
      ]);

      const result = applyExcellenceBonuses(baseScore, mockScores);

      expect(result.excellenceBonuses[0].description).toContain('excellence');
      expect(result.excellenceBonuses[0].feature).toBe('EXCEL-WEBHOOK');
    });
  });

  describe('getCoverageMetrics', () => {
    test('should provide comprehensive coverage metrics', () => {
      const mockScores = new Map([
        ['PERFECT', createMockScore('PERFECT', 'functionality', 1.0, 20)],
        ['PARTIAL', createMockScore('PARTIAL', 'security', 0.7, 15)],
        ['FAILING', createMockScore('FAILING', 'scalability', 0.1, 10)],
        ['NON-APPLICABLE', {
          ruleId: 'NON-APPLICABLE',
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

      const metrics = getCoverageMetrics(mockScores);

      expect(metrics.totalRules).toBe(4);
      expect(metrics.applicableRules).toBe(3);
      expect(metrics.perfectCoverageRules).toBe(1);
      expect(metrics.averageCoverage).toBeCloseTo(0.6, 1); // (1.0 + 0.7 + 0.1) / 3

      expect(metrics.coverageDistribution.perfect).toBe(1);
      expect(metrics.coverageDistribution.good).toBe(1); // 0.7 is good
      expect(metrics.coverageDistribution.poor).toBe(1); // 0.1 is poor
      expect(metrics.coverageDistribution.failing).toBe(0);

      expect(metrics.worstPerforming.ruleId).toBe('FAILING');
      expect(metrics.worstPerforming.coverage).toBe(0.1);

      expect(metrics.bestImprovementOpportunity.ruleId).toBe('FAILING');
      expect(metrics.bestImprovementOpportunity.potentialGain).toBeCloseTo(9, 1); // 10 - 1
    });

    test('should handle all perfect scores', () => {
      const mockScores = new Map([
        ['PERFECT-1', createMockScore('PERFECT-1', 'functionality', 1.0, 20)],
        ['PERFECT-2', createMockScore('PERFECT-2', 'security', 1.0, 15)]
      ]);

      const metrics = getCoverageMetrics(mockScores);

      expect(metrics.averageCoverage).toBe(1.0);
      expect(metrics.perfectCoverageRules).toBe(2);
      expect(metrics.coverageDistribution.perfect).toBe(2);
      expect(metrics.worstPerforming.ruleId).toBe(''); // No worst when all perfect
      expect(metrics.bestImprovementOpportunity.potentialGain).toBe(0);
    });

    test('should categorize coverage levels correctly', () => {
      const mockScores = new Map([
        ['PERFECT', createMockScore('PERFECT', 'functionality', 1.0, 10)],     // Perfect: 100%
        ['EXCELLENT', createMockScore('EXCELLENT', 'security', 0.95, 10)],     // Excellent: 95%
        ['GOOD', createMockScore('GOOD', 'scalability', 0.75, 10)],           // Good: 75%
        ['POOR', createMockScore('POOR', 'maintainability', 0.45, 10)],       // Poor: 45%
        ['FAILING', createMockScore('FAILING', 'excellence', 0.05, 10)]       // Failing: 5%
      ]);

      const metrics = getCoverageMetrics(mockScores);

      expect(metrics.coverageDistribution.perfect).toBe(1);   // >= 1.0
      expect(metrics.coverageDistribution.excellent).toBe(1); // >= 0.9
      expect(metrics.coverageDistribution.good).toBe(1);      // >= 0.7
      expect(metrics.coverageDistribution.poor).toBe(1);      // >= 0.3
      expect(metrics.coverageDistribution.failing).toBe(1);   // < 0.3
    });
  });

  describe('generateCoverageBasedReport', () => {
    test('should generate comprehensive coverage report', async () => {
      const mockScores = new Map([
        ['FUNC-CRUD', createMockScore('FUNC-CRUD', 'functionality', 0.85, 25)],
        ['SEC-AUTH', createMockScore('SEC-AUTH', 'security', 0.9, 20)],
        ['SCALE-PAGE', createMockScore('SCALE-PAGE', 'scalability', 0.6, 15, [
          { ruleId: 'SCALE-PAGE', severity: 'major', message: 'Missing pagination' }
        ])],
        ['EXCEL-WEBHOOK', createMockScore('EXCEL-WEBHOOK', 'excellence', 0.8, 8)]
      ]);

      const report = await generateCoverageBasedReport(mockScores);

      expect(report).toContain('Coverage-Based API Scoring Report');
      expect(report).toContain('Final Score:');
      expect(report).toContain('Excellence Bonuses:');
      
      // Should contain category breakdowns
      expect(report).toContain('📊 FUNCTIONALITY');
      expect(report).toContain('📊 SECURITY');  
      expect(report).toContain('📊 SCALABILITY');
      
      // Should show coverage percentages
      expect(report).toContain('85.0%'); // Functionality coverage
      expect(report).toContain('90.0%'); // Security coverage
      expect(report).toContain('60.0%'); // Scalability coverage
      
      // Should include improvement suggestions
      expect(report).toContain('Top Improvement Opportunities');
      expect(report).toContain('Coverage Statistics');
      
      // Should show findings
      expect(report).toContain('Issues Found:');
      expect(report).toContain('Missing pagination');
    });

    test('should handle perfect API report', async () => {
      const perfectScores = new Map([
        ['FUNC-PERFECT', createMockScore('FUNC-PERFECT', 'functionality', 1.0, 30)],
        ['SEC-PERFECT', createMockScore('SEC-PERFECT', 'security', 1.0, 25)],
        ['SCALE-PERFECT', createMockScore('SCALE-PERFECT', 'scalability', 1.0, 20)],
        ['MAINT-PERFECT', createMockScore('MAINT-PERFECT', 'maintainability', 1.0, 15)],
        ['EXCEL-PERFECT', createMockScore('EXCEL-PERFECT', 'excellence', 1.0, 10)]
      ]);

      const report = await generateCoverageBasedReport(perfectScores);

      expect(report).toContain('🌟 Perfect API Score! 🌟');
      expect(report).toContain('100/100');
      expect(report).toContain('All categories: 100.0% coverage');
      expect(report).toContain('No improvement opportunities found');
      expect(report).toContain('Issues Found: 0');
    });

    test('should handle failing API report', async () => {
      const failingScores = new Map([
        ['FUNC-FAIL', createMockScore('FUNC-FAIL', 'functionality', 0.2, 30, [
          { ruleId: 'FUNC-FAIL', severity: 'critical', message: 'Missing CRUD operations' }
        ])],
        ['SEC-FAIL', createMockScore('SEC-FAIL', 'security', 0.1, 25, [
          { ruleId: 'SEC-FAIL', severity: 'critical', message: 'No authentication' }
        ])]
      ]);

      const report = await generateCoverageBasedReport(failingScores);

      expect(report).toContain('❌ API Needs Major Improvements');
      expect(report).toContain('Critical issues must be addressed');
      expect(report).toContain('Missing CRUD operations');
      expect(report).toContain('No authentication');
      expect(report).toContain('Focus on critical and major issues first');
    });

    test('should show detailed coverage statistics', async () => {
      const mixedScores = new Map([
        ['HIGH-COV', createMockScore('HIGH-COV', 'functionality', 0.9, 20)],
        ['MED-COV', createMockScore('MED-COV', 'security', 0.6, 15)], 
        ['LOW-COV', createMockScore('LOW-COV', 'scalability', 0.2, 10)]
      ]);

      const report = await generateCoverageBasedReport(mixedScores);

      expect(report).toContain('Coverage Statistics:');
      expect(report).toContain('Average Coverage:');
      expect(report).toContain('Perfect Rules:');
      expect(report).toContain('Good Coverage (≥70%):');
      expect(report).toContain('Poor Coverage (<30%):');
      expect(report).toContain('Worst Performing:');
    });

    test('should include actionable recommendations', async () => {
      const improvableScores = new Map([
        ['EASY-WIN', createMockScore('EASY-WIN', 'functionality', 0.6, 20)],
        ['BIG-IMPACT', createMockScore('BIG-IMPACT', 'security', 0.3, 25)]
      ]);

      // Mock rule registry for effort information
      RULE_REGISTRY['EASY-WIN'] = { effort: 'easy' } as any;
      RULE_REGISTRY['BIG-IMPACT'] = { effort: 'medium' } as any;

      const report = await generateCoverageBasedReport(improvableScores);

      expect(report).toContain('Top Improvement Opportunities');
      expect(report).toContain('BIG-IMPACT'); // Should prioritize higher potential points
      expect(report).toContain('17.5 points'); // 25 * (1.0 - 0.3)
      expect(report).toContain('medium effort');

      // Cleanup
      delete RULE_REGISTRY['EASY-WIN'];
      delete RULE_REGISTRY['BIG-IMPACT'];
    });
  });

  describe('compareCoverageScoring', () => {
    test('should compare two scoring results effectively', () => {
      const baselineScores = new Map([
        ['FUNC-1', createMockScore('FUNC-1', 'functionality', 0.6, 30, [
          { ruleId: 'FUNC-1', severity: 'major', message: 'Issue 1' }
        ])],
        ['SEC-1', createMockScore('SEC-1', 'security', 0.7, 25)]
      ]);

      const improvedScores = new Map([
        ['FUNC-1', createMockScore('FUNC-1', 'functionality', 0.9, 30)], // Improved
        ['SEC-1', createMockScore('SEC-1', 'security', 0.8, 25)]  // Also improved
      ]);

      const comparison = compareCoverageScoring(baselineScores, improvedScores);

      expect(comparison.scoreImproved).toBe(true);
      expect(comparison.scoreDelta).toBeGreaterThan(0);
      expect(comparison.coverageImprovement).toBeCloseTo(0.2, 1); // Average improvement
      expect(comparison.issuesFixed).toBe(1);
      expect(comparison.issuesAdded).toBe(0);
      
      expect(comparison.categoryImprovements.functionality).toBeCloseTo(0.3, 1); // 0.9 - 0.6
      expect(comparison.categoryImprovements.security).toBeCloseTo(0.1, 1);   // 0.8 - 0.7
      
      expect(comparison.summary).toContain('improved');
      expect(comparison.summary).toContain('Fixed 1 issue');
    });

    test('should detect regressions in scoring', () => {
      const baselineScores = new Map([
        ['FUNC-1', createMockScore('FUNC-1', 'functionality', 0.8, 30)],
        ['SEC-1', createMockScore('SEC-1', 'security', 0.9, 25)]
      ]);

      const regressedScores = new Map([
        ['FUNC-1', createMockScore('FUNC-1', 'functionality', 0.5, 30, [
          { ruleId: 'FUNC-1', severity: 'critical', message: 'New critical issue' }
        ])],
        ['SEC-1', createMockScore('SEC-1', 'security', 0.9, 25)] // Unchanged
      ]);

      const comparison = compareCoverageScoring(baselineScores, regressedScores);

      expect(comparison.scoreImproved).toBe(false);
      expect(comparison.scoreDelta).toBeLessThan(0);
      expect(comparison.coverageImprovement).toBeLessThan(0);
      expect(comparison.issuesFixed).toBe(0);
      expect(comparison.issuesAdded).toBe(1);
      
      expect(comparison.summary).toContain('regressed');
      expect(comparison.summary).toContain('1 new issue');
    });

    test('should handle no change scenario', () => {
      const sameScores = new Map([
        ['FUNC-1', createMockScore('FUNC-1', 'functionality', 0.7, 30)]
      ]);

      const comparison = compareCoverageScoring(sameScores, sameScores);

      expect(comparison.scoreImproved).toBe(false);
      expect(comparison.scoreDelta).toBe(0);
      expect(comparison.coverageImprovement).toBe(0);
      expect(comparison.issuesFixed).toBe(0);
      expect(comparison.issuesAdded).toBe(0);
      
      expect(comparison.summary).toContain('No change');
    });

    test('should handle different rule sets', () => {
      const baselineScores = new Map([
        ['RULE-A', createMockScore('RULE-A', 'functionality', 0.8, 20)],
        ['RULE-B', createMockScore('RULE-B', 'security', 0.6, 15)]
      ]);

      const newScores = new Map([
        ['RULE-A', createMockScore('RULE-A', 'functionality', 0.9, 20)], // Improved
        ['RULE-C', createMockScore('RULE-C', 'scalability', 0.7, 18)]    // New rule
        // RULE-B removed
      ]);

      const comparison = compareCoverageScoring(baselineScores, newScores);

      expect(comparison.rulesAdded).toBe(1);
      expect(comparison.rulesRemoved).toBe(1);
      expect(comparison.summary).toContain('1 rule added');
      expect(comparison.summary).toContain('1 rule removed');
    });
  });

  describe('identifyOptimalImprovements', () => {
    test('should identify optimal improvement path', () => {
      const mockScores = new Map([
        ['EASY-HIGH-VALUE', createMockScore('EASY-HIGH-VALUE', 'functionality', 0.3, 25)],
        ['HARD-LOW-VALUE', createMockScore('HARD-LOW-VALUE', 'maintainability', 0.8, 5)],
        ['MEDIUM-MED-VALUE', createMockScore('MEDIUM-MED-VALUE', 'security', 0.5, 15)]
      ]);

      // Mock rule registry for effort levels
      RULE_REGISTRY['EASY-HIGH-VALUE'] = { effort: 'easy' } as any;
      RULE_REGISTRY['HARD-LOW-VALUE'] = { effort: 'hard' } as any;
      RULE_REGISTRY['MEDIUM-MED-VALUE'] = { effort: 'medium' } as any;

      const improvements = identifyOptimalImprovements(mockScores, 3);

      expect(improvements).toHaveLength(3);
      
      // Should prioritize high value/effort ratio
      expect(improvements[0].ruleId).toBe('EASY-HIGH-VALUE');
      expect(improvements[0].priority).toBe('high');
      expect(improvements[0].valueEffortRatio).toBeGreaterThan(improvements[1].valueEffortRatio);

      // Check effort scoring
      expect(improvements[0].effortScore).toBe(3); // Easy = 3 points
      expect(improvements[1].effortScore).toBe(2); // Medium = 2 points  
      expect(improvements[2].effortScore).toBe(1); // Hard = 1 point

      // Cleanup
      delete RULE_REGISTRY['EASY-HIGH-VALUE'];
      delete RULE_REGISTRY['HARD-LOW-VALUE'];
      delete RULE_REGISTRY['MEDIUM-MED-VALUE'];
    });

    test('should limit results to requested count', () => {
      const manyScores = new Map();
      for (let i = 0; i < 10; i++) {
        manyScores.set(`RULE-${i}`, createMockScore(`RULE-${i}`, 'functionality', 0.5, 10));
      }

      const improvements = identifyOptimalImprovements(manyScores, 5);
      expect(improvements).toHaveLength(5);
    });

    test('should handle rules with no improvement potential', () => {
      const perfectScores = new Map([
        ['PERFECT-1', createMockScore('PERFECT-1', 'functionality', 1.0, 20)],
        ['PERFECT-2', createMockScore('PERFECT-2', 'security', 1.0, 15)]
      ]);

      const improvements = identifyOptimalImprovements(perfectScores, 5);
      expect(improvements).toHaveLength(0);
    });

    test('should assign priority levels correctly', () => {
      const mockScores = new Map([
        ['HIGH-PRIORITY', createMockScore('HIGH-PRIORITY', 'security', 0.2, 30)], // High potential, low coverage
        ['MED-PRIORITY', createMockScore('MED-PRIORITY', 'functionality', 0.6, 15)], // Medium potential
        ['LOW-PRIORITY', createMockScore('LOW-PRIORITY', 'maintainability', 0.9, 5)]  // Low potential
      ]);

      RULE_REGISTRY['HIGH-PRIORITY'] = { effort: 'medium' } as any;
      RULE_REGISTRY['MED-PRIORITY'] = { effort: 'easy' } as any;
      RULE_REGISTRY['LOW-PRIORITY'] = { effort: 'easy' } as any;

      const improvements = identifyOptimalImprovements(mockScores);

      const highPriority = improvements.find(i => i.ruleId === 'HIGH-PRIORITY');
      const medPriority = improvements.find(i => i.ruleId === 'MED-PRIORITY');
      const lowPriority = improvements.find(i => i.ruleId === 'LOW-PRIORITY');

      expect(highPriority?.priority).toBe('high');
      expect(medPriority?.priority).toBe('medium');
      expect(lowPriority?.priority).toBe('low');

      // Cleanup
      delete RULE_REGISTRY['HIGH-PRIORITY'];
      delete RULE_REGISTRY['MED-PRIORITY'];
      delete RULE_REGISTRY['LOW-PRIORITY'];
    });

    test('should include actionable recommendations', () => {
      const mockScores = new Map([
        ['IMPROVE-ME', createMockScore('IMPROVE-ME', 'functionality', 0.4, 20, [
          { ruleId: 'IMPROVE-ME', severity: 'major', message: 'Missing endpoints' }
        ])]
      ]);

      RULE_REGISTRY['IMPROVE-ME'] = { effort: 'easy' } as any;

      const improvements = identifyOptimalImprovements(mockScores);

      expect(improvements[0].recommendation).toContain('improve');
      expect(improvements[0].currentIssueCount).toBe(1);
      expect(improvements[0].potentialGain).toBeCloseTo(12, 1); // 20 * (1.0 - 0.4)

      delete RULE_REGISTRY['IMPROVE-ME'];
    });
  });

  describe('Performance and Integration Tests', () => {
    test('should handle large specifications efficiently', async () => {
      // Create a large mock spec
      const largeSpec = {
        openapi: '3.0.3',
        info: { title: 'Large API', version: '1.0.0' },
        paths: {} as any,
        components: { securitySchemes: { OAuth2: { type: 'oauth2', flows: {} } } }
      };

      // Add many paths
      for (let i = 0; i < 50; i++) {
        largeSpec.paths[`/api/v2/resource${i}`] = {
          get: { responses: { '200': { description: 'OK' } } },
          post: { 
            parameters: [{ name: 'X-Organization-ID', in: 'header', required: true, schema: { type: 'integer' } }],
            responses: { '201': { description: 'Created' } } 
          }
        };
      }

      const start = Date.now();
      const result = await scoreWithCoverage(largeSpec);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.scores.size).toBeGreaterThan(0);
      expect(result.metadata.scoringEngine).toBe('coverage');
    });

    test('should provide consistent results across multiple runs', async () => {
      const runs = 3;
      const results = [];

      for (let i = 0; i < runs; i++) {
        const result = await scoreWithCoverage(mockSpec);
        results.push(result);
      }

      // Results should be consistent
      for (let i = 1; i < runs; i++) {
        expect(results[i].scores.size).toBe(results[0].scores.size);
        
        // Check a few specific scores for consistency
        for (const [ruleId, score] of results[0].scores) {
          const otherScore = results[i].scores.get(ruleId);
          expect(otherScore?.coverage).toBeCloseTo(score.coverage, 3);
          expect(otherScore?.score).toBeCloseTo(score.score, 3);
        }
      }
    });

    test('should integrate well with other scoring components', async () => {
      const result = await scoreWithCoverage(mockSpec);
      
      // Should work with weighted grade calculation
      const gradeResult = calculateWeightedGrade(result.scores);
      expect(gradeResult.finalScore).toBeGreaterThanOrEqual(0);
      expect(gradeResult.finalScore).toBeLessThanOrEqual(100);
      
      // Should work with excellence bonuses
      const bonusResult = applyExcellenceBonuses(gradeResult.finalScore, result.scores);
      expect(bonusResult.adjustedScore).toBeGreaterThanOrEqual(gradeResult.finalScore);
      expect(bonusResult.adjustedScore).toBeLessThanOrEqual(100);
      
      // Should work with metrics calculation
      const metrics = getCoverageMetrics(result.scores);
      expect(metrics.totalRules).toBe(result.scores.size);
    });
  });
});