/**
 * Tests for Adaptive Scoring Engine
 * Verifies profile-based scoring and priority adjustments
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AdaptiveScoringEngine, BusinessContext } from '../../../src/app/scoring/adaptive-scoring';
import { GradingProfile } from '../../../src/app/profiles/profile-manager';
import { DetectionResult } from '../../../src/app/profiles/detection-engine';

describe('AdaptiveScoringEngine', () => {
  let engine: AdaptiveScoringEngine;
  
  beforeEach(() => {
    engine = new AdaptiveScoringEngine();
  });

  describe('Profile-specific scoring', () => {
    it('should apply REST profile weights correctly', () => {
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'Simple REST API',
        type: 'REST',
        description: 'Standard REST API profile',
        rules: [
          { rule_id: 'SEC-001', weight: 10, category: 'required' },
          { rule_id: 'FUNC-001', weight: 15, category: 'required' },
          { rule_id: 'DOC-001', weight: 5, category: 'optional' }
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
          matchedPatterns: ['RESTful paths', 'Standard verbs'],
          missingIndicators: [],
          signalStrength: { 'restful-paths': 100 }
        },
        alternatives: []
      };

      const ruleResults = new Map([
        ['SEC-001', { score: 80, maxScore: 100 }],
        ['FUNC-001', { score: 90, maxScore: 100 }],
        ['DOC-001', { score: 70, maxScore: 100 }]
      ]);

      const score = engine.calculateScore(ruleResults, profile, detection);

      expect(score.profile).toBe('Simple REST API');
      expect(score.confidence).toBe(0.95);
      expect(score.baseScore).toBeGreaterThan(0);
      expect(score.adjustedScore).toBeGreaterThan(0);
      expect(score.breakdown.length).toBeGreaterThan(0);
    });

    it('should apply GraphQL profile with higher security weight', () => {
      const profile: GradingProfile = {
        id: 'graphql-1',
        name: 'GraphQL API',
        type: 'GraphQL',
        description: 'GraphQL API profile',
        rules: [
          { rule_id: 'SEC-001', weight: 15, category: 'required' },
          { rule_id: 'PERF-001', weight: 15, category: 'required' }
        ],
        prerequisites: {
          requiresMultiTenantHeaders: false,
          requiresAuthentication: true,
          requiresApiId: true
        },
        priorityConfig: {
          security: 30,      // Higher for GraphQL
          performance: 30,   // N+1 concerns
          documentation: 10, // Self-documenting
          consistency: 15,
          best_practices: 15
        }
      };

      const detection: DetectionResult = {
        detectedProfile: 'GraphQL',
        confidence: 0.92,
        reasoning: {
          matchedPatterns: ['/graphql endpoint', 'Single POST'],
          missingIndicators: [],
          signalStrength: { 'graphql-endpoint': 100 }
        },
        alternatives: []
      };

      const ruleResults = new Map([
        ['SEC-001', { score: 85, maxScore: 100 }],
        ['PERF-001', { score: 75, maxScore: 100 }]
      ]);

      const score = engine.calculateScore(ruleResults, profile, detection);

      expect(score.profile).toBe('GraphQL API');
      
      // Find security category in breakdown
      const securityCategory = score.breakdown.find(b => b.category === 'security');
      expect(securityCategory).toBeDefined();
      expect(securityCategory?.priority).toBe('critical');
    });

    it('should apply Enterprise SaaS profile with multi-tenant requirements', () => {
      const profile: GradingProfile = {
        id: 'saas-1',
        name: 'Enterprise SaaS',
        type: 'SaaS',
        description: 'Multi-tenant SaaS profile',
        rules: [
          { rule_id: 'SEC-001', weight: 20, category: 'required' },
          { rule_id: 'SCALE-001', weight: 15, category: 'required' },
          { rule_id: 'COMP-001', weight: 10, category: 'required' }
        ],
        prerequisites: {
          requiresMultiTenantHeaders: true, // KEY DIFFERENCE
          requiresAuthentication: true,
          requiresApiId: true
        },
        priorityConfig: {
          security: 35,     // Multi-tenant isolation critical
          scalability: 25,  // Enterprise load
          functionality: 20,
          consistency: 10,
          compliance: 10
        }
      };

      const detection: DetectionResult = {
        detectedProfile: 'SaaS',
        confidence: 0.98,
        reasoning: {
          matchedPatterns: ['X-Organization-ID headers', 'Admin endpoints'],
          missingIndicators: [],
          signalStrength: { 'multi-tenant-headers': 100 }
        },
        alternatives: []
      };

      const ruleResults = new Map([
        ['SEC-001', { score: 95, maxScore: 100 }],
        ['SCALE-001', { score: 85, maxScore: 100 }],
        ['COMP-001', { score: 90, maxScore: 100 }]
      ]);

      const score = engine.calculateScore(ruleResults, profile, detection);

      expect(score.profile).toBe('Enterprise SaaS');
      expect(score.confidence).toBe(0.98);
      
      // SaaS should have high adjusted score with good rule scores
      expect(score.adjustedScore).toBeGreaterThan(85);
    });
  });

  describe('Business context adjustments', () => {
    it('should increase security weight for finance domain', () => {
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'REST API',
        type: 'REST',
        description: 'REST API',
        rules: [
          { rule_id: 'SEC-001', weight: 10, category: 'required' },
          { rule_id: 'FUNC-001', weight: 10, category: 'required' }
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

      const businessContext: BusinessContext = {
        domain: 'finance',
        maturityLevel: 'stable',
        performanceCritical: false
      };

      const ruleResults = new Map([
        ['SEC-001', { score: 80, maxScore: 100 }],
        ['FUNC-001', { score: 90, maxScore: 100 }]
      ]);

      const score = engine.calculateScore(ruleResults, profile, detection, businessContext);

      // Check that business context adjustment was applied
      const businessAdjustment = score.adjustments.find(a => a.type === 'business');
      expect(businessAdjustment).toBeDefined();
      expect(businessAdjustment?.factor).toBeGreaterThan(1.0); // Finance should increase standards
    });

    it('should apply maturity adjustments for alpha APIs', () => {
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'REST API',
        type: 'REST',
        description: 'REST API',
        rules: [
          { rule_id: 'DOC-001', weight: 10, category: 'required' },
          { rule_id: 'FUNC-001', weight: 10, category: 'required' }
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

      const businessContext: BusinessContext = {
        domain: 'general',
        maturityLevel: 'alpha', // Early stage API
        performanceCritical: false
      };

      const ruleResults = new Map([
        ['DOC-001', { score: 50, maxScore: 100 }], // Poor documentation
        ['FUNC-001', { score: 90, maxScore: 100 }]
      ]);

      const score = engine.calculateScore(ruleResults, profile, detection, businessContext);

      // Check maturity adjustment
      const maturityAdjustment = score.adjustments.find(a => a.type === 'maturity');
      expect(maturityAdjustment).toBeDefined();
      expect(maturityAdjustment?.factor).toBeLessThan(1.0); // Alpha should be more lenient
    });

    it('should boost performance for performance-critical APIs', () => {
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'REST API',
        type: 'REST',
        description: 'REST API',
        rules: [
          { rule_id: 'PERF-001', weight: 10, category: 'required' },
          { rule_id: 'SCALE-001', weight: 10, category: 'required' }
        ],
        prerequisites: {
          requiresMultiTenantHeaders: false,
          requiresAuthentication: true,
          requiresApiId: true
        },
        priorityConfig: {
          security: 25,
          performance: 20,
          scalability: 20,
          functionality: 20,
          best_practices: 15
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

      const businessContext: BusinessContext = {
        domain: 'ecommerce',
        maturityLevel: 'stable',
        performanceCritical: true // Performance is critical
      };

      const ruleResults = new Map([
        ['PERF-001', { score: 85, maxScore: 100 }],
        ['SCALE-001', { score: 80, maxScore: 100 }]
      ]);

      const score = engine.calculateScore(ruleResults, profile, detection, businessContext);

      // E-commerce + performance critical should result in high standards
      expect(score.adjustments.length).toBeGreaterThan(0);
      expect(score.adjustedScore).toBeGreaterThan(score.baseScore * 0.9);
    });
  });

  describe('Confidence adjustments', () => {
    it('should apply penalty for low detection confidence', () => {
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'REST API',
        type: 'REST',
        description: 'REST API',
        rules: [
          { rule_id: 'FUNC-001', weight: 10, category: 'required' }
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

      const lowConfidenceDetection: DetectionResult = {
        detectedProfile: 'REST',
        confidence: 0.45, // Very low confidence
        reasoning: {
          matchedPatterns: [],
          missingIndicators: ['No clear REST patterns'],
          signalStrength: {}
        },
        alternatives: []
      };

      const ruleResults = new Map([
        ['FUNC-001', { score: 90, maxScore: 100 }]
      ]);

      const score = engine.calculateScore(ruleResults, profile, lowConfidenceDetection);

      // Low confidence should reduce the adjusted score
      const confidenceAdjustment = score.adjustments.find(a => a.type === 'confidence');
      expect(confidenceAdjustment).toBeDefined();
      expect(confidenceAdjustment?.factor).toBeLessThan(0.9);
    });

    it('should not penalize high confidence detection', () => {
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'REST API',
        type: 'REST',
        description: 'REST API',
        rules: [
          { rule_id: 'FUNC-001', weight: 10, category: 'required' }
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

      const highConfidenceDetection: DetectionResult = {
        detectedProfile: 'REST',
        confidence: 0.98, // Very high confidence
        reasoning: {
          matchedPatterns: ['Clear REST patterns', 'Standard verbs'],
          missingIndicators: [],
          signalStrength: { 'restful-paths': 100 }
        },
        alternatives: []
      };

      const ruleResults = new Map([
        ['FUNC-001', { score: 90, maxScore: 100 }]
      ]);

      const score = engine.calculateScore(ruleResults, profile, highConfidenceDetection);

      // High confidence should not reduce score
      const confidenceAdjustment = score.adjustments.find(a => a.type === 'confidence');
      expect(confidenceAdjustment).toBeDefined();
      expect(confidenceAdjustment?.factor).toBe(1.0);
    });
  });

  describe('Excellence bonuses', () => {
    it('should apply bonuses for exceptional API features', () => {
      const profile: GradingProfile = {
        id: 'rest-1',
        name: 'REST API',
        type: 'REST',
        description: 'REST API',
        rules: [],
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

      const baseScore = engine.calculateScore(new Map(), profile, detection);
      
      // API spec with excellent features
      const excellentSpec = {
        components: {
          securitySchemes: {
            OAuth2: { type: 'oauth2' },
            ApiKey: { type: 'apiKey' }
          }
        },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'Success' },
                '400': { description: 'Bad Request' },
                '500': { description: 'Internal Error' }
              }
            }
          }
        }
      };

      const enhancedScore = engine.applyExcellenceBonuses(baseScore, excellentSpec);

      expect(enhancedScore.adjustedScore).toBeGreaterThan(baseScore.adjustedScore);
      expect(enhancedScore.adjustments.length).toBeGreaterThan(baseScore.adjustments.length);
    });
  });
});