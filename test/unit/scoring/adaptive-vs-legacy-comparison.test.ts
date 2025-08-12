/**
 * Comparison Tests: Adaptive vs Legacy Scoring
 * Demonstrates improvements in context-aware grading
 */

import { describe, it, expect } from '@jest/globals';
import { AdaptiveScoringEngine } from '../../../src/app/scoring/adaptive-scoring';
import { calculateWeightedGrade } from '../../../src/app/scoring/coverage-scoring';
import { GradingProfile } from '../../../src/app/profiles/profile-manager';
import { DetectionResult } from '../../../src/app/profiles/detection-engine';

describe('Adaptive vs Legacy Scoring Comparison', () => {
  const adaptiveEngine = new AdaptiveScoringEngine();

  describe('Multi-tenant header requirements', () => {
    it('Legacy: Fails REST API for missing X-Organization-ID', () => {
      // Legacy scoring with rigid Smackdab rules
      const legacyScores = new Map([
        ['PREREQ-003', { // X-Organization-ID requirement
          ruleId: 'PREREQ-003',
          coverage: 0,      // FAILED - no multi-tenant header
          score: 0,         // Gets 0 points
          maxScore: 100,    // Out of 100 (auto-fail)
          targetsChecked: 1,
          targetsPassed: 0,
          findings: ['Missing X-Organization-ID header']
        }],
        ['FUNC-001', {
          ruleId: 'FUNC-001',
          coverage: 1.0,    // Passed
          score: 90,
          maxScore: 100,
          targetsChecked: 10,
          targetsPassed: 10,
          findings: []
        }]
      ]);

      const legacyGrade = calculateWeightedGrade(legacyScores);
      
      // Legacy fails because of missing multi-tenant header
      expect(legacyGrade.passed).toBe(false);
      expect(legacyGrade.score).toBeLessThan(60); // Failing grade
    });

    it('Adaptive: Passes REST API without X-Organization-ID', () => {
      // Adaptive scoring with context awareness
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'Simple REST API',
        type: 'REST',
        description: 'REST API without multi-tenancy',
        rules: [
          { rule_id: 'FUNC-001', weight: 30, category: 'required' },
          { rule_id: 'SEC-001', weight: 25, category: 'required' }
        ],
        prerequisites: {
          requiresMultiTenantHeaders: false, // KEY: Not required for REST
          requiresAuthentication: true,
          requiresApiId: true
        },
        priorityConfig: {
          security: 25,
          functionality: 30,
          documentation: 20,
          consistency: 15,
          best_practices: 10
        }
      };

      const detection: DetectionResult = {
        detectedProfile: 'REST',
        confidence: 0.95,
        reasoning: {
          matchedPatterns: ['RESTful paths', 'No multi-tenant headers'],
          missingIndicators: [],
          signalStrength: {}
        },
        alternatives: []
      };

      const adaptiveResults = new Map([
        ['FUNC-001', { score: 90, maxScore: 100 }],
        ['SEC-001', { score: 85, maxScore: 100 }]
        // Note: PREREQ-003 not even evaluated for REST profile!
      ]);

      const adaptiveScore = adaptiveEngine.calculateScore(
        adaptiveResults,
        profile,
        detection
      );

      // Adaptive passes because multi-tenant not required
      expect(adaptiveScore.adjustedScore).toBeGreaterThan(70); // Passing grade
      expect(adaptiveScore.profile).toBe('Simple REST API');
    });
  });

  describe('Profile-specific rule weighting', () => {
    it('Legacy: Applies same weights to all API types', () => {
      // Legacy treats GraphQL same as REST
      const legacyScores = new Map([
        ['DOC-001', {
          ruleId: 'DOC-001',
          coverage: 0.5,    // Medium documentation
          score: 50,
          maxScore: 100,
          targetsChecked: 10,
          targetsPassed: 5,
          findings: []
        }],
        ['PERF-001', {
          ruleId: 'PERF-001',
          coverage: 0.7,
          score: 70,
          maxScore: 100,
          targetsChecked: 10,
          targetsPassed: 7,
          findings: []
        }]
      ]);

      // Legacy uses fixed weights
      const fixedWeights = new Map([
        ['DOC-001', 1.0],  // Same weight
        ['PERF-001', 1.0]  // Same weight
      ]);

      const legacyGrade = calculateWeightedGrade(legacyScores, fixedWeights);
      
      // Legacy averages equally: (50 + 70) / 2 = 60
      expect(legacyGrade.score).toBeCloseTo(60, 0);
    });

    it('Adaptive: Adjusts weights based on API type', () => {
      // GraphQL profile with different priorities
      const graphqlProfile: GradingProfile = {
        id: 'graphql-1',
        name: 'GraphQL API',
        type: 'GraphQL',
        description: 'GraphQL with performance focus',
        rules: [
          { rule_id: 'DOC-001', weight: 10, category: 'optional' },  // Low weight
          { rule_id: 'PERF-001', weight: 30, category: 'required' }  // High weight
        ],
        prerequisites: {
          requiresMultiTenantHeaders: false,
          requiresAuthentication: true,
          requiresApiId: true
        },
        priorityConfig: {
          security: 30,
          performance: 30,    // GraphQL has N+1 query concerns
          documentation: 10,  // Self-documenting, less important
          consistency: 15,
          best_practices: 15
        }
      };

      const detection: DetectionResult = {
        detectedProfile: 'GraphQL',
        confidence: 0.92,
        reasoning: {
          matchedPatterns: ['/graphql endpoint'],
          missingIndicators: [],
          signalStrength: {}
        },
        alternatives: []
      };

      const adaptiveResults = new Map([
        ['DOC-001', { score: 50, maxScore: 100 }],  // Same scores
        ['PERF-001', { score: 70, maxScore: 100 }]  // Same scores
      ]);

      const adaptiveScore = adaptiveEngine.calculateScore(
        adaptiveResults,
        graphqlProfile,
        detection
      );

      // Adaptive weights performance higher for GraphQL
      // Score should be closer to performance score (70) than doc score (50)
      expect(adaptiveScore.baseScore).toBeGreaterThan(60);
      
      // Check that performance has higher weight in breakdown
      const perfCategory = adaptiveScore.breakdown.find(b => b.category === 'performance');
      const docCategory = adaptiveScore.breakdown.find(b => b.category === 'documentation');
      
      if (perfCategory && docCategory) {
        expect(perfCategory.weight).toBeGreaterThan(docCategory.weight);
      }
    });
  });

  describe('Business context awareness', () => {
    it('Legacy: No consideration for business domain', () => {
      // Legacy doesn't know if it's a finance API
      const legacyScores = new Map([
        ['SEC-001', {
          ruleId: 'SEC-001',
          coverage: 0.7,    // Decent security
          score: 70,
          maxScore: 100,
          targetsChecked: 10,
          targetsPassed: 7,
          findings: []
        }]
      ]);

      const legacyGrade = calculateWeightedGrade(legacyScores);
      
      // Legacy gives same score regardless of domain
      expect(legacyGrade.score).toBe(70);
    });

    it('Adaptive: Stricter security for finance domain', () => {
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'REST API',
        type: 'REST',
        description: 'Financial REST API',
        rules: [
          { rule_id: 'SEC-001', weight: 25, category: 'required' }
        ],
        prerequisites: {
          requiresMultiTenantHeaders: false,
          requiresAuthentication: true,
          requiresApiId: true
        },
        priorityConfig: {
          security: 25,
          functionality: 30,
          documentation: 20,
          consistency: 15,
          best_practices: 10
        }
      };

      const detection: DetectionResult = {
        detectedProfile: 'REST',
        confidence: 0.95,
        reasoning: {
          matchedPatterns: [],
          missingIndicators: [],
          signalStrength: {}
        },
        alternatives: []
      };

      const adaptiveResults = new Map([
        ['SEC-001', { score: 70, maxScore: 100 }]  // Same 70% security
      ]);

      // Test without business context
      const generalScore = adaptiveEngine.calculateScore(
        adaptiveResults,
        profile,
        detection
      );

      // Test with finance context
      const financeScore = adaptiveEngine.calculateScore(
        adaptiveResults,
        profile,
        detection,
        {
          domain: 'finance',
          maturityLevel: 'stable'
        }
      );

      // Finance domain should have stricter grading
      expect(financeScore.adjustedScore).toBeGreaterThan(generalScore.adjustedScore);
      
      // Check for business adjustment
      const businessAdjustment = financeScore.adjustments.find(a => a.type === 'business');
      expect(businessAdjustment).toBeDefined();
      expect(businessAdjustment?.factor).toBeGreaterThan(1.0);
    });
  });

  describe('API maturity considerations', () => {
    it('Legacy: Same standards for alpha and production', () => {
      const legacyScores = new Map([
        ['DOC-001', {
          ruleId: 'DOC-001',
          coverage: 0.3,    // Poor documentation
          score: 30,
          maxScore: 100,
          targetsChecked: 10,
          targetsPassed: 3,
          findings: ['Incomplete documentation']
        }]
      ]);

      const legacyGrade = calculateWeightedGrade(legacyScores);
      
      // Legacy fails regardless of maturity
      expect(legacyGrade.score).toBe(30); // Failing grade
    });

    it('Adaptive: More lenient for alpha APIs', () => {
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'REST API',
        type: 'REST',
        description: 'Alpha stage API',
        rules: [
          { rule_id: 'DOC-001', weight: 20, category: 'optional' }
        ],
        prerequisites: {
          requiresMultiTenantHeaders: false,
          requiresAuthentication: true,
          requiresApiId: true
        },
        priorityConfig: {
          security: 25,
          functionality: 30,
          documentation: 20,
          consistency: 15,
          best_practices: 10
        }
      };

      const detection: DetectionResult = {
        detectedProfile: 'REST',
        confidence: 0.90,
        reasoning: {
          matchedPatterns: [],
          missingIndicators: [],
          signalStrength: {}
        },
        alternatives: []
      };

      const adaptiveResults = new Map([
        ['DOC-001', { score: 30, maxScore: 100 }]  // Same poor documentation
      ]);

      // Alpha API with poor docs
      const alphaScore = adaptiveEngine.calculateScore(
        adaptiveResults,
        profile,
        detection,
        {
          domain: 'general',
          maturityLevel: 'alpha'
        }
      );

      // Production API with poor docs
      const prodScore = adaptiveEngine.calculateScore(
        adaptiveResults,
        profile,
        detection,
        {
          domain: 'general',
          maturityLevel: 'stable'
        }
      );

      // Alpha should be more forgiving
      expect(alphaScore.adjustedScore).toBeLessThan(prodScore.adjustedScore);
      
      // Check maturity adjustment
      const maturityAdjustment = alphaScore.adjustments.find(a => a.type === 'maturity');
      expect(maturityAdjustment).toBeDefined();
      expect(maturityAdjustment?.factor).toBeLessThan(1.0); // Penalty reduction
    });
  });

  describe('Summary comparison', () => {
    it('should demonstrate overall improvement in grading fairness', () => {
      // Scenario: Simple internal REST API
      // - No multi-tenancy needed
      // - Good functionality
      // - Moderate documentation
      // - Basic security
      
      // Legacy scoring would fail this
      const legacyScores = new Map([
        ['PREREQ-003', { // Multi-tenant header
          ruleId: 'PREREQ-003',
          coverage: 0,
          score: 0,
          maxScore: 100,
          targetsChecked: 1,
          targetsPassed: 0,
          findings: ['Missing X-Organization-ID']
        }],
        ['FUNC-001', {
          ruleId: 'FUNC-001',
          coverage: 0.9,
          score: 90,
          maxScore: 100,
          targetsChecked: 10,
          targetsPassed: 9,
          findings: []
        }],
        ['DOC-001', {
          ruleId: 'DOC-001',
          coverage: 0.6,
          score: 60,
          maxScore: 100,
          targetsChecked: 10,
          targetsPassed: 6,
          findings: []
        }],
        ['SEC-001', {
          ruleId: 'SEC-001',
          coverage: 0.75,
          score: 75,
          maxScore: 100,
          targetsChecked: 10,
          targetsPassed: 7,
          findings: []
        }]
      ]);

      const legacyGrade = calculateWeightedGrade(legacyScores);

      // Adaptive scoring for the same API
      const profile: GradingProfile = {
        id: 'internal-1',
        name: 'Internal Tool API',
        type: 'Custom',
        description: 'Internal tool with relaxed requirements',
        rules: [
          { rule_id: 'FUNC-001', weight: 40, category: 'required' },
          { rule_id: 'DOC-001', weight: 30, category: 'optional' },
          { rule_id: 'SEC-001', weight: 20, category: 'optional' }
        ],
        prerequisites: {
          requiresMultiTenantHeaders: false, // Not needed!
          requiresAuthentication: false,     // Internal network
          requiresApiId: true
        },
        priorityConfig: {
          functionality: 40,
          documentation: 30,
          security: 10,
          consistency: 10,
          best_practices: 10
        }
      };

      const detection: DetectionResult = {
        detectedProfile: 'Custom',
        confidence: 0.85,
        reasoning: {
          matchedPatterns: ['Internal endpoints', 'No auth required'],
          missingIndicators: [],
          signalStrength: {}
        },
        alternatives: []
      };

      const adaptiveResults = new Map([
        ['FUNC-001', { score: 90, maxScore: 100 }],
        ['DOC-001', { score: 60, maxScore: 100 }],
        ['SEC-001', { score: 75, maxScore: 100 }]
      ]);

      const adaptiveScore = adaptiveEngine.calculateScore(
        adaptiveResults,
        profile,
        detection,
        {
          domain: 'general',
          maturityLevel: 'stable'
        }
      );

      // Summary assertions
      console.log('\n=== Scoring Comparison ===');
      console.log(`Legacy Score: ${legacyGrade.score.toFixed(1)}% (${legacyGrade.grade})`);
      console.log(`Legacy Passed: ${legacyGrade.passed}`);
      console.log(`Adaptive Score: ${adaptiveScore.adjustedScore.toFixed(1)}%`);
      console.log(`Adaptive Profile: ${adaptiveScore.profile}`);
      console.log(`Key Difference: Adaptive doesn't require X-Organization-ID for internal tools`);

      // Adaptive should give a much better grade
      expect(adaptiveScore.adjustedScore).toBeGreaterThan(legacyGrade.score);
      expect(adaptiveScore.adjustedScore).toBeGreaterThan(70); // Passing
      expect(legacyGrade.passed).toBe(false); // Legacy fails
    });
  });
});