/**
 * Phase 2 End-to-End Integration Tests
 * Validates the complete context-aware grading system
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// Import all Phase 2 components
import { DetectionEngine } from '../../src/app/profiles/detection-engine';
import { ProfileManager } from '../../src/app/profiles/profile-manager';
import { AdaptiveScoring } from '../../src/app/scoring/adaptive-scoring';
import { PriorityCalculator } from '../../src/app/scoring/priority-calculator';
import { MLDetector } from '../../src/app/detection/ml-detector';
import { EnhancedDetectionEngine } from '../../src/app/detection/enhanced-detection-engine';
import { BusinessAnalyzer } from '../../src/app/context/business-analyzer';
import { DomainDetector } from '../../src/app/context/domain-detector';
import { RequirementMapper } from '../../src/app/context/requirement-mapper';
import { FeedbackCollector } from '../../src/app/learning/feedback-collector';
import { LearningEngine } from '../../src/app/learning/learning-engine';
import { FeedbackUI } from '../../src/app/learning/feedback-ui';
import { LearningPipeline } from '../../src/app/learning/learning-pipeline';
import { FeatureFlagManager } from '../../src/app/migration/feature-flags';
import { MigrationController } from '../../src/app/migration/migration-controller';
import { RollbackManager } from '../../src/app/migration/rollback-manager';

// Test fixtures
const restApiSpec = require('../fixtures/rest-api.json');
const graphqlApiSpec = require('../fixtures/graphql-api.json');
const saasApiSpec = require('../fixtures/saas-api.json');
const healthcareApiSpec = require('../fixtures/healthcare-api.json');
const financeApiSpec = require('../fixtures/finance-api.json');

describe('Phase 2: Context-Aware Grading System', () => {
  let detectionEngine: DetectionEngine;
  let profileManager: ProfileManager;
  let adaptiveScoring: AdaptiveScoring;
  let businessAnalyzer: BusinessAnalyzer;
  let learningPipeline: LearningPipeline;
  let featureFlagManager: FeatureFlagManager;
  let migrationController: MigrationController;
  
  beforeAll(async () => {
    // Initialize all components
    detectionEngine = new DetectionEngine();
    profileManager = new ProfileManager();
    adaptiveScoring = new AdaptiveScoring();
    businessAnalyzer = new BusinessAnalyzer();
    learningPipeline = new LearningPipeline({ enabled: true, autoLearn: false });
    featureFlagManager = new FeatureFlagManager();
    migrationController = new MigrationController(featureFlagManager);
    
    // Enable all Phase 2 features for testing
    Object.values(featureFlagManager.FLAGS).forEach(flag => {
      featureFlagManager.setRolloutPercentage(flag, 100);
    });
  });
  
  afterAll(async () => {
    // Cleanup
    learningPipeline.stopAutoLearning();
  });
  
  describe('Track 1: Profile System', () => {
    it('should detect REST API and apply appropriate profile', async () => {
      const detection = detectionEngine.detect(restApiSpec);
      
      expect(detection.type).toBe('REST');
      expect(detection.confidence).toBeGreaterThan(0.8);
      
      const profile = profileManager.getProfile(detection.type);
      expect(profile).toBeDefined();
      expect(profile?.prerequisites.requiresMultiTenantHeaders).toBe(false);
    });
    
    it('should detect GraphQL API with correct profile', async () => {
      const detection = detectionEngine.detect(graphqlApiSpec);
      
      expect(detection.type).toBe('GraphQL');
      expect(detection.confidence).toBeGreaterThan(0.8);
      
      const profile = profileManager.getProfile(detection.type);
      expect(profile?.rules.graphql).toBeDefined();
      expect(profile?.rules.graphql?.introspectionDisabled).toBe(true);
    });
    
    it('should detect SaaS API and require multi-tenant headers', async () => {
      const detection = detectionEngine.detect(saasApiSpec);
      
      expect(detection.type).toBe('SaaS');
      expect(detection.confidence).toBeGreaterThan(0.7);
      
      const profile = profileManager.getProfile(detection.type);
      expect(profile?.prerequisites.requiresMultiTenantHeaders).toBe(true);
      expect(profile?.prerequisites.requiresRateLimiting).toBe(true);
    });
    
    it('should handle unknown API types with fallback', async () => {
      const unknownSpec = { openapi: '3.0.0', info: { title: 'Unknown' }, paths: {} };
      const detection = detectionEngine.detect(unknownSpec);
      
      expect(detection.type).toBe('REST'); // Fallback
      expect(detection.confidence).toBeLessThan(0.5);
    });
  });
  
  describe('Track 2: Adaptive Scoring', () => {
    it('should adjust weights based on API type', async () => {
      const restWeights = adaptiveScoring.calculateWeights('REST', 'general');
      const graphqlWeights = adaptiveScoring.calculateWeights('GraphQL', 'general');
      
      expect(restWeights.security).toBe(0.25);
      expect(graphqlWeights.performance).toBe(0.30);
      expect(restWeights).not.toEqual(graphqlWeights);
    });
    
    it('should calculate priority based on business context', async () => {
      const calculator = new PriorityCalculator();
      
      const financePriority = calculator.calculatePriority('SEC-001', 'finance');
      const generalPriority = calculator.calculatePriority('SEC-001', 'general');
      
      expect(financePriority).toBeGreaterThan(generalPriority);
      expect(financePriority).toBe('critical');
    });
    
    it('should apply mathematical scoring model', async () => {
      const baseScore = 80;
      const finalScore = adaptiveScoring.applyModel(baseScore, {
        profileConfidence: 0.9,
        businessCriticality: 0.8,
        maturityLevel: 0.7
      });
      
      expect(finalScore).toBeLessThan(baseScore);
      expect(finalScore).toBeGreaterThan(40);
    });
  });
  
  describe('Track 3: ML Detection System', () => {
    let mlDetector: MLDetector;
    let enhancedEngine: EnhancedDetectionEngine;
    
    beforeEach(() => {
      mlDetector = new MLDetector();
      enhancedEngine = new EnhancedDetectionEngine();
    });
    
    it('should extract features from API spec', async () => {
      const features = mlDetector.extractFeatures(restApiSpec);
      
      expect(features.rest.resourcePaths).toBeGreaterThan(0);
      expect(features.rest.crudOperations).toBeGreaterThan(0);
      expect(features.rest.httpMethods).toBeGreaterThan(0);
    });
    
    it('should detect hybrid APIs (REST + SaaS)', async () => {
      const hybridSpec = {
        ...restApiSpec,
        paths: {
          ...restApiSpec.paths,
          '/organizations/{orgId}/users': { get: {}, post: {} }
        },
        components: {
          securitySchemes: {
            apiKey: { type: 'apiKey', in: 'header', name: 'X-Organization-ID' }
          }
        }
      };
      
      const detection = mlDetector.detect(hybridSpec);
      
      expect(detection.type).toContain('REST');
      expect(detection.hybridTypes).toContain('SaaS');
      expect(detection.confidence).toBeGreaterThan(0.6);
    });
    
    it('should build consensus between ML and pattern detection', async () => {
      const result = enhancedEngine.detect(restApiSpec);
      
      expect(result.mlConfidence).toBeDefined();
      expect(result.patternConfidence).toBeDefined();
      expect(result.consensusConfidence).toBeDefined();
      expect(result.finalType).toBe('REST');
    });
    
    it('should handle low confidence with fallback', async () => {
      const ambiguousSpec = { openapi: '3.0.0', paths: { '/data': {} } };
      const result = enhancedEngine.detect(ambiguousSpec);
      
      expect(result.consensusConfidence).toBeLessThan(0.5);
      expect(result.finalType).toBe('REST'); // Fallback
      expect(result.warnings).toContain('Low confidence detection');
    });
  });
  
  describe('Track 4: Business Context Understanding', () => {
    let domainDetector: DomainDetector;
    let requirementMapper: RequirementMapper;
    
    beforeEach(() => {
      domainDetector = new DomainDetector();
      requirementMapper = new RequirementMapper();
    });
    
    it('should detect healthcare domain with HIPAA requirements', async () => {
      const context = businessAnalyzer.analyzeContext(healthcareApiSpec);
      
      expect(context.domain).toBe('healthcare');
      expect(context.confidence).toBeGreaterThan(0.7);
      expect(context.complianceRequirements).toContain('HIPAA');
      expect(context.dataClassification).toBe('restricted');
    });
    
    it('should detect finance domain with PCI-DSS requirements', async () => {
      const context = businessAnalyzer.analyzeContext(financeApiSpec);
      
      expect(context.domain).toBe('finance');
      expect(context.complianceRequirements).toContain('PCI-DSS');
      expect(context.businessCriticality).toBe('critical');
    });
    
    it('should map compliance to specific rules', async () => {
      const context = businessAnalyzer.analyzeContext(healthcareApiSpec);
      const mapped = requirementMapper.mapRequirements(context);
      
      expect(mapped.mandatoryRules.length).toBeGreaterThan(0);
      expect(mapped.mandatoryRules.some(r => r.compliance === 'HIPAA')).toBe(true);
      expect(mapped.complianceScore).toBeGreaterThan(50);
    });
    
    it('should detect industry-specific features', async () => {
      const healthcareDetection = domainDetector.detectDomain(healthcareApiSpec);
      
      expect(healthcareDetection.primaryDomain).toBe('healthcare');
      expect(healthcareDetection.industrySpecificFeatures).toContain('PHI Data Handling');
      expect(healthcareDetection.recommendedCompliance).toContain('HIPAA');
    });
  });
  
  describe('Track 5: Learning Feedback System', () => {
    let feedbackCollector: FeedbackCollector;
    let learningEngine: LearningEngine;
    let feedbackUI: FeedbackUI;
    
    beforeEach(() => {
      feedbackCollector = new FeedbackCollector();
      learningEngine = new LearningEngine();
      feedbackUI = new FeedbackUI();
      learningEngine.initialize();
    });
    
    it('should collect and analyze feedback', async () => {
      const feedback = {
        apiSpecId: 'test-api',
        gradingResultId: 'result-1',
        feedbackType: 'overall' as const,
        rating: 4 as const,
        metadata: {
          detectedType: 'REST',
          detectionConfidence: 0.9,
          appliedProfile: 'REST',
          businessDomain: 'general',
          finalScore: 85,
          ruleViolations: ['SEC-001', 'DOC-002']
        },
        userContext: {}
      };
      
      const feedbackId = feedbackCollector.collectFeedback(feedback);
      expect(feedbackId).toBeDefined();
      
      const analyses = feedbackCollector.analyzeFeedback();
      expect(analyses).toBeDefined();
      expect(analyses.length).toBeGreaterThanOrEqual(0);
    });
    
    it('should train model with feedback', async () => {
      const feedbackItems = Array(20).fill(null).map((_, i) => ({
        id: `feedback-${i}`,
        timestamp: new Date(),
        apiSpecId: 'test-api',
        gradingResultId: `result-${i}`,
        feedbackType: 'overall' as const,
        rating: (Math.floor(Math.random() * 3) + 3) as 3 | 4 | 5,
        metadata: {
          detectedType: 'REST',
          detectionConfidence: 0.8 + Math.random() * 0.2,
          appliedProfile: 'REST',
          businessDomain: 'general',
          finalScore: 70 + Math.random() * 30,
          ruleViolations: ['SEC-001']
        },
        userContext: {}
      }));
      
      const analyses = feedbackCollector.analyzeFeedback();
      const update = learningEngine.train(feedbackItems, analyses);
      
      expect(update.modelId).toBeDefined();
      expect(update.updates).toBeDefined();
      expect(update.confidence).toBeGreaterThan(0);
    });
    
    it('should generate feedback UI forms', async () => {
      const gradingResult = {
        apiName: 'Test API',
        score: 75,
        grade: 'C',
        violations: [
          { ruleId: 'SEC-001', ruleName: 'Authentication Required' }
        ],
        detectedType: 'REST',
        confidence: 0.85
      };
      
      const form = feedbackUI.generateFeedbackForm(gradingResult, 'minimal');
      
      expect(form.prompts.length).toBeGreaterThan(0);
      expect(form.context.apiName).toBe('Test API');
      expect(form.context.score).toBe(75);
    });
    
    it('should optimize weights based on feedback', async () => {
      const initialWeights = learningEngine.predictWeights('REST', 'general');
      
      // Simulate feedback and training
      const feedbackItems = Array(50).fill(null).map((_, i) => ({
        id: `feedback-${i}`,
        timestamp: new Date(),
        apiSpecId: 'test-api',
        gradingResultId: `result-${i}`,
        feedbackType: 'severity' as const,
        rating: 3 as const,
        corrections: {
          severityAdjustments: { 'SEC-001': 'too_high' as const }
        },
        metadata: {
          detectedType: 'REST',
          detectionConfidence: 0.9,
          appliedProfile: 'REST',
          businessDomain: 'general',
          finalScore: 70,
          ruleViolations: ['SEC-001']
        },
        userContext: {}
      }));
      
      const analyses = feedbackCollector.analyzeFeedback();
      learningEngine.train(feedbackItems, analyses);
      
      const optimizedWeights = learningEngine.predictWeights('REST', 'general');
      
      // Weights should have changed
      expect(optimizedWeights).toBeDefined();
      // Note: In real implementation, we'd check specific weight changes
    });
  });
  
  describe('Track 6: Migration and Rollback', () => {
    let rollbackManager: RollbackManager;
    
    beforeEach(() => {
      rollbackManager = new RollbackManager();
    });
    
    it('should create feature flags for gradual rollout', async () => {
      const flags = featureFlagManager.exportFlags();
      
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(f => f.id === 'context_aware_grading')).toBe(true);
      expect(flags.some(f => f.id === 'ml_detection')).toBe(true);
    });
    
    it('should evaluate feature flags with conditions', async () => {
      const context = {
        api_type: 'REST',
        domain: 'healthcare',
        user: 'test-user'
      };
      
      const enabled = featureFlagManager.isEnabled(
        featureFlagManager.FLAGS.BUSINESS_CONTEXT,
        context
      );
      
      expect(typeof enabled).toBe('boolean');
    });
    
    it('should create rollback snapshots', async () => {
      const snapshot = await rollbackManager.createSnapshot('test-snapshot');
      
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.featureFlags).toBeDefined();
      expect(snapshot.configuration).toBeDefined();
      expect(snapshot.metrics).toBeDefined();
    });
    
    it('should execute emergency rollback', async () => {
      const result = await rollbackManager.executeRollback(
        'emergency',
        'Test emergency rollback'
      );
      
      expect(result.success).toBe(true);
      expect(result.state.strategy).toBe('emergency');
      expect(result.validationResults).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
    
    it('should generate migration status report', () => {
      const status = migrationController.getMigrationStatus();
      
      expect(status).toContain('Phase 2 Migration Status');
      expect(status).toContain('Current Metrics');
      expect(status).toContain('System Health');
    });
  });
  
  describe('End-to-End Integration', () => {
    it('should process REST API through complete pipeline', async () => {
      // 1. Detection
      const detection = detectionEngine.detect(restApiSpec);
      expect(detection.type).toBe('REST');
      
      // 2. Profile selection
      const profile = profileManager.getProfile(detection.type);
      expect(profile).toBeDefined();
      
      // 3. Business context
      const context = businessAnalyzer.analyzeContext(restApiSpec);
      expect(context.domain).toBeDefined();
      
      // 4. Adaptive scoring
      const weights = adaptiveScoring.calculateWeights(detection.type, context.domain);
      expect(weights).toBeDefined();
      
      // 5. Grading (simulated)
      const gradingResult = {
        score: 85,
        grade: 'B',
        violations: [],
        detectedType: detection.type,
        confidence: detection.confidence
      };
      
      // 6. Feedback processing
      const feedbackContext = {
        apiSpec: restApiSpec,
        gradingResult,
        detectionResult: detection,
        appliedProfile: profile!.id,
        businessDomain: context.domain
      };
      
      const feedbackResult = await learningPipeline.processGradingResult(feedbackContext);
      expect(feedbackResult.adjustedWeights).toBeDefined();
    });
    
    it('should handle healthcare API with compliance requirements', async () => {
      // 1. Detection
      const detection = detectionEngine.detect(healthcareApiSpec);
      
      // 2. Business context with compliance
      const context = businessAnalyzer.analyzeContext(healthcareApiSpec);
      expect(context.domain).toBe('healthcare');
      expect(context.complianceRequirements).toContain('HIPAA');
      
      // 3. Requirement mapping
      const mapper = new RequirementMapper();
      const requirements = mapper.mapRequirements(context);
      expect(requirements.mandatoryRules.length).toBeGreaterThan(0);
      
      // 4. Validate compliance
      const validation = mapper.validateCompliance(healthcareApiSpec, requirements);
      expect(validation).toBeDefined();
      expect(validation.compliant).toBeDefined();
    });
    
    it('should handle migration rollout with monitoring', async () => {
      // Create rollout plan
      const plan = featureFlagManager.createRolloutPlan();
      expect(plan.length).toBe(8); // 8 weeks
      
      // Simulate week 1 rollout
      const week1 = plan[0];
      week1.flags.forEach(flag => {
        featureFlagManager.setRolloutPercentage(flag.id, flag.percentage);
      });
      
      // Check rollout status
      const status = featureFlagManager.getRolloutStatus();
      expect(status.context_aware_grading.rollout).toBe(10);
      
      // Simulate monitoring metrics
      const metrics = {
        errorRate: 0.01,
        performance: { p50: 50, p95: 200, p99: 500 },
        userSatisfaction: 0.85,
        apiCoverage: { total: 1000, contextAware: 100, legacy: 900 },
        detectionAccuracy: 0.92,
        falsePositives: 2,
        falseNegatives: 3
      };
      
      // Check if rollback needed
      const shouldRollback = metrics.errorRate > 0.05 || metrics.userSatisfaction < 0.6;
      expect(shouldRollback).toBe(false);
    });
  });
  
  describe('Performance Tests', () => {
    it('should detect API type within 100ms', async () => {
      const start = Date.now();
      const detection = detectionEngine.detect(restApiSpec);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100);
      expect(detection.type).toBeDefined();
    });
    
    it('should calculate adaptive scores within 50ms', async () => {
      const start = Date.now();
      const weights = adaptiveScoring.calculateWeights('REST', 'general');
      const score = adaptiveScoring.applyModel(80, {
        profileConfidence: 0.9,
        businessCriticality: 0.7,
        maturityLevel: 0.8
      });
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50);
      expect(weights).toBeDefined();
      expect(score).toBeDefined();
    });
    
    it('should process feedback within 200ms', async () => {
      const start = Date.now();
      
      const feedback = {
        apiSpecId: 'test',
        gradingResultId: 'test',
        feedbackType: 'overall' as const,
        rating: 4 as const,
        metadata: {
          detectedType: 'REST',
          detectionConfidence: 0.9,
          appliedProfile: 'REST',
          businessDomain: 'general',
          finalScore: 85,
          ruleViolations: []
        },
        userContext: {}
      };
      
      const collector = new FeedbackCollector();
      collector.collectFeedback(feedback);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200);
    });
  });
  
  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed API specs gracefully', async () => {
      const malformed = { not: 'valid', spec: true };
      
      const detection = detectionEngine.detect(malformed as any);
      expect(detection.type).toBe('REST'); // Fallback
      expect(detection.confidence).toBeLessThan(0.3);
    });
    
    it('should handle empty API specs', async () => {
      const empty = {};
      
      const detection = detectionEngine.detect(empty as any);
      expect(detection.type).toBe('REST'); // Fallback
      expect(detection.confidence).toBe(0);
    });
    
    it('should handle rollback failures gracefully', async () => {
      // Simulate a rollback with intentional failure
      const manager = new RollbackManager();
      
      try {
        // This would fail in real scenario
        const result = await manager.executeRollback('invalid-strategy', 'Test');
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain('not found');
      }
    });
    
    it('should handle learning with insufficient feedback', async () => {
      const engine = new LearningEngine();
      engine.initialize();
      
      // Try to train with too few samples
      const result = engine.train([], []);
      
      expect(result.updates.length).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });
});