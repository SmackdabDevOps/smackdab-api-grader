/**
 * Adaptive Scoring Engine
 * Implements priority-based scoring with dynamic weight adjustment
 * Based on detected API profiles and business context
 */

import { GradingProfile } from '../profiles/profile-manager';
import { DetectionResult } from '../profiles/detection-engine';

export interface AdaptiveScore {
  baseScore: number;
  adjustedScore: number;
  confidence: number;
  profile: string;
  breakdown: CategoryScore[];
  adjustments: ScoreAdjustment[];
}

export interface CategoryScore {
  category: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ScoreAdjustment {
  type: 'profile' | 'business' | 'maturity' | 'confidence';
  factor: number;
  reason: string;
}

export interface BusinessContext {
  domain?: 'finance' | 'healthcare' | 'ecommerce' | 'analytics' | 'general';
  maturityLevel?: 'alpha' | 'beta' | 'stable' | 'mature';
  complianceRequirements?: string[];
  performanceCritical?: boolean;
}

export interface ScoringWeights {
  [category: string]: number;
}

export class AdaptiveScoringEngine {
  // Priority multipliers based on mathematical model
  private readonly PRIORITY_MULTIPLIERS = {
    critical: 2.0,
    high: 1.5,
    medium: 1.0,
    low: 0.5
  };

  // Default weight distributions per profile type
  private readonly PROFILE_WEIGHTS: Record<string, ScoringWeights> = {
    REST: {
      security: 0.25,
      functionality: 0.30,
      documentation: 0.20,
      consistency: 0.15,
      best_practices: 0.10
    },
    GraphQL: {
      security: 0.30,      // Higher due to introspection risks
      performance: 0.30,    // N+1 query concerns
      documentation: 0.10,  // Self-documenting
      consistency: 0.15,
      best_practices: 0.15
    },
    SaaS: {
      security: 0.35,      // Multi-tenant isolation critical
      scalability: 0.25,   // Must handle enterprise load
      functionality: 0.20,
      consistency: 0.10,
      compliance: 0.10
    },
    Microservice: {
      resilience: 0.30,    // Circuit breakers, retries
      performance: 0.25,   // Latency critical
      observability: 0.20, // Distributed tracing
      consistency: 0.15,
      best_practices: 0.10
    },
    Custom: {
      functionality: 0.40,  // Focus on working correctly
      documentation: 0.30,  // Important for internal tools
      consistency: 0.20,
      best_practices: 0.10
    }
  };

  /**
   * Calculate adaptive score based on profile and context
   */
  calculateScore(
    ruleResults: Map<string, any>,
    profile: GradingProfile,
    detection: DetectionResult,
    businessContext?: BusinessContext
  ): AdaptiveScore {
    // Step 1: Get base weights for profile
    const baseWeights = this.getProfileWeights(profile.type);
    
    // Step 2: Apply profile-specific adjustments
    const adjustedWeights = this.adjustWeightsForProfile(
      baseWeights,
      profile,
      detection.confidence
    );
    
    // Step 3: Apply business context modifiers
    const contextWeights = businessContext
      ? this.applyBusinessContext(adjustedWeights, businessContext)
      : adjustedWeights;
    
    // Step 4: Normalize weights
    const normalizedWeights = this.normalizeWeights(contextWeights);
    
    // Step 5: Calculate base score
    const categoryScores = this.calculateCategoryScores(
      ruleResults,
      normalizedWeights,
      profile
    );
    
    const baseScore = this.computeBaseScore(categoryScores);
    
    // Step 6: Apply adjustments
    const adjustments: ScoreAdjustment[] = [];
    let adjustedScore = baseScore;
    
    // Profile confidence adjustment
    const confidenceAdjustment = this.getConfidenceAdjustment(detection.confidence);
    adjustedScore *= confidenceAdjustment;
    adjustments.push({
      type: 'confidence',
      factor: confidenceAdjustment,
      reason: `Detection confidence: ${Math.round(detection.confidence * 100)}%`
    });
    
    // Business context adjustments
    if (businessContext) {
      const contextAdjustment = this.getBusinessContextAdjustment(businessContext);
      adjustedScore *= contextAdjustment;
      adjustments.push({
        type: 'business',
        factor: contextAdjustment,
        reason: `Business domain: ${businessContext.domain || 'general'}`
      });
      
      const maturityAdjustment = this.getMaturityAdjustment(businessContext);
      adjustedScore *= maturityAdjustment;
      adjustments.push({
        type: 'maturity',
        factor: maturityAdjustment,
        reason: `API maturity: ${businessContext.maturityLevel || 'stable'}`
      });
    }
    
    // Cap at 100
    adjustedScore = Math.min(100, adjustedScore);
    
    return {
      baseScore,
      adjustedScore,
      confidence: detection.confidence,
      profile: profile.name,
      breakdown: categoryScores,
      adjustments
    };
  }

  /**
   * Get weight distribution for a profile type
   */
  private getProfileWeights(profileType: string): ScoringWeights {
    return this.PROFILE_WEIGHTS[profileType] || this.PROFILE_WEIGHTS.Custom;
  }

  /**
   * Adjust weights based on profile configuration
   */
  private adjustWeightsForProfile(
    weights: ScoringWeights,
    profile: GradingProfile,
    confidence: number
  ): ScoringWeights {
    const adjusted: ScoringWeights = { ...weights };
    
    // Apply profile priority configuration
    if (profile.priorityConfig) {
      Object.keys(profile.priorityConfig).forEach(category => {
        const priority = (profile.priorityConfig as any)[category];
        if (adjusted[category] !== undefined) {
          adjusted[category] *= (priority / 100); // Convert percentage to factor
        }
      });
    }
    
    // Apply confidence penalty if detection uncertain
    if (confidence < 0.9) {
      Object.keys(adjusted).forEach(category => {
        adjusted[category] *= (0.8 + confidence * 0.2); // Scale from 0.8 to 1.0
      });
    }
    
    return adjusted;
  }

  /**
   * Apply business context modifiers to weights
   */
  private applyBusinessContext(
    weights: ScoringWeights,
    context: BusinessContext
  ): ScoringWeights {
    const adjusted: ScoringWeights = { ...weights };
    
    // Domain-specific adjustments
    switch (context.domain) {
      case 'finance':
        // Financial APIs need extra security
        if (adjusted.security) adjusted.security *= 1.5;
        if (adjusted.compliance) adjusted.compliance *= 1.5;
        break;
        
      case 'healthcare':
        // Healthcare needs privacy and compliance
        if (adjusted.security) adjusted.security *= 1.4;
        if (adjusted.compliance) adjusted.compliance *= 1.6;
        if (adjusted.documentation) adjusted.documentation *= 1.2;
        break;
        
      case 'ecommerce':
        // E-commerce needs performance and reliability
        if (adjusted.performance) adjusted.performance *= 1.3;
        if (adjusted.scalability) adjusted.scalability *= 1.3;
        if (adjusted.resilience) adjusted.resilience *= 1.2;
        break;
        
      case 'analytics':
        // Analytics needs performance and scalability
        if (adjusted.performance) adjusted.performance *= 1.4;
        if (adjusted.scalability) adjusted.scalability *= 1.4;
        break;
    }
    
    // Performance-critical adjustment
    if (context.performanceCritical) {
      if (adjusted.performance) adjusted.performance *= 1.5;
      if (adjusted.scalability) adjusted.scalability *= 1.3;
    }
    
    // Maturity level adjustments
    switch (context.maturityLevel) {
      case 'alpha':
        // Alpha APIs can be more lenient on docs and consistency
        if (adjusted.documentation) adjusted.documentation *= 0.7;
        if (adjusted.consistency) adjusted.consistency *= 0.7;
        break;
        
      case 'mature':
        // Mature APIs should excel in all areas
        Object.keys(adjusted).forEach(key => {
          adjusted[key] *= 1.1;
        });
        break;
    }
    
    return adjusted;
  }

  /**
   * Normalize weights to sum to 1.0
   */
  private normalizeWeights(weights: ScoringWeights): ScoringWeights {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (total === 0) return weights;
    
    const normalized: ScoringWeights = {};
    Object.keys(weights).forEach(key => {
      normalized[key] = weights[key] / total;
    });
    
    return normalized;
  }

  /**
   * Calculate scores for each category
   */
  private calculateCategoryScores(
    ruleResults: Map<string, any>,
    weights: ScoringWeights,
    profile: GradingProfile
  ): CategoryScore[] {
    const categoryScores: CategoryScore[] = [];
    const categoryRawScores: Record<string, { total: number; max: number }> = {};
    
    // Aggregate rule results by category
    ruleResults.forEach((result, ruleId) => {
      const category = this.getRuleCategory(ruleId);
      if (!categoryRawScores[category]) {
        categoryRawScores[category] = { total: 0, max: 0 };
      }
      
      // Find rule weight from profile
      const profileRule = profile.rules.find(r => r.rule_id === ruleId);
      const ruleWeight = profileRule?.weight || 1;
      
      categoryRawScores[category].total += result.score * ruleWeight;
      categoryRawScores[category].max += result.maxScore * ruleWeight;
    });
    
    // Calculate weighted scores
    Object.keys(categoryRawScores).forEach(category => {
      const rawScore = categoryRawScores[category].max > 0
        ? (categoryRawScores[category].total / categoryRawScores[category].max) * 100
        : 0;
      
      const weight = weights[category] || 0;
      const priority = this.getCategoryPriority(category);
      
      categoryScores.push({
        category,
        weight,
        rawScore,
        weightedScore: rawScore * weight,
        priority
      });
    });
    
    return categoryScores;
  }

  /**
   * Compute base score from category scores
   */
  private computeBaseScore(categoryScores: CategoryScore[]): number {
    let totalWeightedScore = 0;
    let totalWeight = 0;
    
    categoryScores.forEach(score => {
      const priorityMultiplier = this.PRIORITY_MULTIPLIERS[score.priority];
      totalWeightedScore += score.weightedScore * priorityMultiplier;
      totalWeight += score.weight * priorityMultiplier;
    });
    
    return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  }

  /**
   * Get category for a rule ID
   */
  private getRuleCategory(ruleId: string): string {
    // Extract category from rule ID prefix
    if (ruleId.startsWith('SEC')) return 'security';
    if (ruleId.startsWith('FUNC')) return 'functionality';
    if (ruleId.startsWith('DOC')) return 'documentation';
    if (ruleId.startsWith('SCALE')) return 'scalability';
    if (ruleId.startsWith('PERF')) return 'performance';
    if (ruleId.startsWith('MAINT')) return 'consistency';
    if (ruleId.startsWith('BEST')) return 'best_practices';
    if (ruleId.startsWith('COMP')) return 'compliance';
    if (ruleId.startsWith('RESIL')) return 'resilience';
    if (ruleId.startsWith('OBS')) return 'observability';
    
    return 'general';
  }

  /**
   * Get priority level for a category
   */
  private getCategoryPriority(category: string): 'critical' | 'high' | 'medium' | 'low' {
    const priorityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
      security: 'critical',
      compliance: 'critical',
      functionality: 'high',
      performance: 'high',
      scalability: 'high',
      resilience: 'high',
      documentation: 'medium',
      consistency: 'medium',
      observability: 'medium',
      best_practices: 'low',
      general: 'low'
    };
    
    return priorityMap[category] || 'low';
  }

  /**
   * Get confidence adjustment factor
   */
  private getConfidenceAdjustment(confidence: number): number {
    if (confidence >= 0.9) return 1.0;
    if (confidence >= 0.7) return 0.95;
    if (confidence >= 0.5) return 0.9;
    return 0.85; // Low confidence penalty
  }

  /**
   * Get business context adjustment factor
   */
  private getBusinessContextAdjustment(context: BusinessContext): number {
    switch (context.domain) {
      case 'finance':
      case 'healthcare':
        return 1.1; // Stricter requirements
      case 'ecommerce':
      case 'analytics':
        return 1.05; // Slightly stricter
      default:
        return 1.0;
    }
  }

  /**
   * Get maturity level adjustment factor
   */
  private getMaturityAdjustment(context: BusinessContext): number {
    switch (context.maturityLevel) {
      case 'alpha':
        return 0.85; // More lenient for alpha
      case 'beta':
        return 0.92; // Slightly lenient for beta
      case 'mature':
        return 1.05; // Higher standards for mature APIs
      default:
        return 1.0; // Stable APIs
    }
  }

  /**
   * Apply excellence bonuses for exceptional API quality
   */
  applyExcellenceBonuses(
    score: AdaptiveScore,
    spec: any
  ): AdaptiveScore {
    const bonuses: ScoreAdjustment[] = [];
    let bonusPoints = 0;
    
    // Advanced security implementation
    if (spec.components?.securitySchemes?.OAuth2 && 
        spec.components?.securitySchemes?.ApiKey) {
      bonusPoints += 3;
      bonuses.push({
        type: 'profile',
        factor: 1.03,
        reason: 'Multiple authentication methods'
      });
    }
    
    // Comprehensive error handling
    const hasErrorResponses = Object.values(spec.paths || {}).every((path: any) => {
      return Object.values(path).some((op: any) => 
        op.responses && Object.keys(op.responses).some(code => parseInt(code) >= 400)
      );
    });
    
    if (hasErrorResponses) {
      bonusPoints += 2;
      bonuses.push({
        type: 'profile',
        factor: 1.02,
        reason: 'Comprehensive error handling'
      });
    }
    
    // Apply bonuses
    const newScore = Math.min(100, score.adjustedScore + bonusPoints);
    
    return {
      ...score,
      adjustedScore: newScore,
      adjustments: [...score.adjustments, ...bonuses]
    };
  }
}