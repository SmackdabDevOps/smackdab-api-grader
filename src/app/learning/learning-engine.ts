/**
 * Learning Engine
 * Optimizes grading weights based on user feedback using reinforcement learning principles
 */

import { FeedbackItem, FeedbackAnalysis, WeightAdjustment } from './feedback-collector';

export interface LearningModel {
  modelId: string;
  version: number;
  created: Date;
  lastUpdated: Date;
  weights: WeightMap;
  performance: ModelPerformance;
  trainingData: TrainingMetadata;
  status: 'active' | 'training' | 'deprecated' | 'experimental';
}

export interface WeightMap {
  rules: Record<string, RuleWeight>;
  categories: Record<string, number>;
  profiles: Record<string, ProfileWeight>;
  domains: Record<string, DomainWeight>;
}

export interface RuleWeight {
  baseWeight: number;
  currentWeight: number;
  adjustmentHistory: Array<{
    timestamp: Date;
    oldWeight: number;
    newWeight: number;
    reason: string;
    confidence: number;
  }>;
  performance: {
    accuracyRate: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
    userSatisfaction: number;
  };
}

export interface ProfileWeight {
  profile: string;
  weights: Record<string, number>;
  confidence: number;
}

export interface DomainWeight {
  domain: string;
  categoryWeights: Record<string, number>;
  ruleModifiers: Record<string, number>;
}

export interface ModelPerformance {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  userSatisfaction: number;
  convergenceRate: number;
  stabilityScore: number;
}

export interface TrainingMetadata {
  totalSamples: number;
  trainingIterations: number;
  learningRate: number;
  convergenceThreshold: number;
  lastTraining: Date;
  nextScheduledTraining?: Date;
}

export interface LearningUpdate {
  modelId: string;
  updates: WeightUpdate[];
  reason: string;
  confidence: number;
  validationRequired: boolean;
}

export interface WeightUpdate {
  type: 'rule' | 'category' | 'profile' | 'domain';
  id: string;
  oldValue: number;
  newValue: number;
  impact: 'low' | 'medium' | 'high';
}

export class LearningEngine {
  private models: Map<string, LearningModel> = new Map();
  private activeModelId: string | null = null;
  
  // Learning parameters
  private readonly LEARNING_RATE = 0.01;
  private readonly MOMENTUM = 0.9;
  private readonly REGULARIZATION = 0.001;
  private readonly MIN_SAMPLES = 10;
  private readonly CONFIDENCE_THRESHOLD = 0.7;
  private readonly STABILITY_WINDOW = 100;
  
  // Weight constraints
  private readonly MIN_WEIGHT = 0.1;
  private readonly MAX_WEIGHT = 3.0;
  private readonly MAX_ADJUSTMENT = 0.5;
  
  /**
   * Initialize learning engine with base model
   */
  initialize(): LearningModel {
    const model: LearningModel = {
      modelId: this.generateModelId(),
      version: 1,
      created: new Date(),
      lastUpdated: new Date(),
      weights: this.createInitialWeights(),
      performance: this.createInitialPerformance(),
      trainingData: {
        totalSamples: 0,
        trainingIterations: 0,
        learningRate: this.LEARNING_RATE,
        convergenceThreshold: 0.001,
        lastTraining: new Date(),
      },
      status: 'active'
    };
    
    this.models.set(model.modelId, model);
    this.activeModelId = model.modelId;
    
    return model;
  }
  
  /**
   * Train model with feedback data
   */
  train(
    feedbackItems: FeedbackItem[],
    analyses: FeedbackAnalysis[]
  ): LearningUpdate {
    if (!this.activeModelId) {
      throw new Error('No active model to train');
    }
    
    const model = this.models.get(this.activeModelId)!;
    const updates: WeightUpdate[] = [];
    
    // Group feedback by category
    const categorizedFeedback = this.categorizeFeedback(feedbackItems);
    
    // Calculate gradients
    const gradients = this.calculateGradients(categorizedFeedback, model);
    
    // Apply gradient descent with momentum
    const weightUpdates = this.applyGradientDescent(gradients, model);
    
    // Apply adjustments from analysis
    const analysisUpdates = this.applyAnalysisAdjustments(analyses, model);
    
    // Combine updates
    updates.push(...weightUpdates, ...analysisUpdates);
    
    // Regularization to prevent overfitting
    this.applyRegularization(model);
    
    // Update model performance
    this.updateModelPerformance(model, feedbackItems);
    
    // Update training metadata
    model.trainingData.totalSamples += feedbackItems.length;
    model.trainingData.trainingIterations++;
    model.lastUpdated = new Date();
    
    // Check for convergence
    const hasConverged = this.checkConvergence(model, updates);
    
    return {
      modelId: model.modelId,
      updates,
      reason: `Training iteration ${model.trainingData.trainingIterations} with ${feedbackItems.length} samples`,
      confidence: this.calculateUpdateConfidence(updates, feedbackItems.length),
      validationRequired: !hasConverged || updates.some(u => u.impact === 'high')
    };
  }
  
  /**
   * Calculate gradients for weight updates
   */
  private calculateGradients(
    categorizedFeedback: Map<string, FeedbackItem[]>,
    model: LearningModel
  ): Map<string, number> {
    const gradients = new Map<string, number>();
    
    categorizedFeedback.forEach((items, category) => {
      // Calculate error signal
      const errorSignal = this.calculateErrorSignal(items);
      
      // Calculate gradient for each rule in category
      items.forEach(item => {
        item.metadata.ruleViolations.forEach(ruleId => {
          const currentGradient = gradients.get(ruleId) || 0;
          const ruleGradient = this.calculateRuleGradient(item, ruleId, errorSignal);
          gradients.set(ruleId, currentGradient + ruleGradient);
        });
      });
    });
    
    // Normalize gradients
    const maxGradient = Math.max(...Array.from(gradients.values()).map(Math.abs));
    if (maxGradient > 0) {
      gradients.forEach((value, key) => {
        gradients.set(key, value / maxGradient);
      });
    }
    
    return gradients;
  }
  
  /**
   * Calculate error signal from feedback
   */
  private calculateErrorSignal(items: FeedbackItem[]): number {
    if (items.length === 0) return 0;
    
    // Target satisfaction is 4.0
    const targetRating = 4.0;
    const avgRating = items.reduce((sum, i) => sum + i.rating, 0) / items.length;
    
    // Error is difference from target
    return targetRating - avgRating;
  }
  
  /**
   * Calculate gradient for specific rule
   */
  private calculateRuleGradient(
    feedback: FeedbackItem,
    ruleId: string,
    errorSignal: number
  ): number {
    // Base gradient from error signal
    let gradient = errorSignal * this.LEARNING_RATE;
    
    // Adjust based on severity feedback
    if (feedback.corrections?.severityAdjustments?.[ruleId]) {
      const adjustment = feedback.corrections.severityAdjustments[ruleId];
      if (adjustment === 'too_high') {
        gradient -= 0.1; // Reduce weight
      } else if (adjustment === 'too_low') {
        gradient += 0.1; // Increase weight
      }
    }
    
    // Adjust based on incorrect rules
    if (feedback.corrections?.incorrectRules?.includes(ruleId)) {
      gradient -= 0.2; // Significantly reduce weight
    }
    
    // Scale by confidence
    gradient *= feedback.metadata.detectionConfidence;
    
    return gradient;
  }
  
  /**
   * Apply gradient descent with momentum
   */
  private applyGradientDescent(
    gradients: Map<string, number>,
    model: LearningModel
  ): WeightUpdate[] {
    const updates: WeightUpdate[] = [];
    const momentum = new Map<string, number>();
    
    gradients.forEach((gradient, ruleId) => {
      const ruleWeight = model.weights.rules[ruleId] || this.createDefaultRuleWeight();
      const currentWeight = ruleWeight.currentWeight;
      
      // Apply momentum
      const prevMomentum = momentum.get(ruleId) || 0;
      const newMomentum = this.MOMENTUM * prevMomentum + gradient;
      momentum.set(ruleId, newMomentum);
      
      // Calculate new weight
      let newWeight = currentWeight + newMomentum;
      
      // Apply constraints
      newWeight = Math.max(this.MIN_WEIGHT, Math.min(this.MAX_WEIGHT, newWeight));
      
      // Limit adjustment size
      const adjustment = newWeight - currentWeight;
      if (Math.abs(adjustment) > this.MAX_ADJUSTMENT) {
        newWeight = currentWeight + Math.sign(adjustment) * this.MAX_ADJUSTMENT;
      }
      
      // Update model
      ruleWeight.currentWeight = newWeight;
      ruleWeight.adjustmentHistory.push({
        timestamp: new Date(),
        oldWeight: currentWeight,
        newWeight,
        reason: 'Gradient descent optimization',
        confidence: Math.abs(gradient)
      });
      
      // Record update
      updates.push({
        type: 'rule',
        id: ruleId,
        oldValue: currentWeight,
        newValue: newWeight,
        impact: Math.abs(adjustment) > 0.3 ? 'high' : 
                Math.abs(adjustment) > 0.1 ? 'medium' : 'low'
      });
      
      model.weights.rules[ruleId] = ruleWeight;
    });
    
    return updates;
  }
  
  /**
   * Apply adjustments from feedback analysis
   */
  private applyAnalysisAdjustments(
    analyses: FeedbackAnalysis[],
    model: LearningModel
  ): WeightUpdate[] {
    const updates: WeightUpdate[] = [];
    
    analyses.forEach(analysis => {
      analysis.suggestedAdjustments.forEach(adjustment => {
        if (adjustment.confidence >= this.CONFIDENCE_THRESHOLD) {
          const ruleWeight = model.weights.rules[adjustment.ruleId] || this.createDefaultRuleWeight();
          const currentWeight = ruleWeight.currentWeight;
          
          // Apply suggested adjustment
          let newWeight = adjustment.suggestedWeight;
          
          // Validate constraints
          newWeight = Math.max(this.MIN_WEIGHT, Math.min(this.MAX_WEIGHT, newWeight));
          
          // Update model
          ruleWeight.currentWeight = newWeight;
          ruleWeight.adjustmentHistory.push({
            timestamp: new Date(),
            oldWeight: currentWeight,
            newWeight,
            reason: adjustment.reason,
            confidence: adjustment.confidence
          });
          
          // Record update
          updates.push({
            type: 'rule',
            id: adjustment.ruleId,
            oldValue: currentWeight,
            newValue: newWeight,
            impact: Math.abs(newWeight - currentWeight) > 0.3 ? 'high' : 'medium'
          });
          
          model.weights.rules[adjustment.ruleId] = ruleWeight;
        }
      });
    });
    
    return updates;
  }
  
  /**
   * Apply regularization to prevent overfitting
   */
  private applyRegularization(model: LearningModel): void {
    Object.values(model.weights.rules).forEach(ruleWeight => {
      // L2 regularization
      const regularizationTerm = this.REGULARIZATION * ruleWeight.currentWeight;
      ruleWeight.currentWeight = Math.max(
        this.MIN_WEIGHT,
        ruleWeight.currentWeight - regularizationTerm
      );
    });
  }
  
  /**
   * Update model performance metrics
   */
  private updateModelPerformance(
    model: LearningModel,
    feedbackItems: FeedbackItem[]
  ): void {
    if (feedbackItems.length === 0) return;
    
    // Calculate accuracy
    const correctDetections = feedbackItems.filter(f => 
      !f.corrections?.actualApiType || f.corrections.actualApiType === f.metadata.detectedType
    ).length;
    const accuracy = correctDetections / feedbackItems.length;
    
    // Calculate user satisfaction
    const avgRating = feedbackItems.reduce((sum, f) => sum + f.rating, 0) / feedbackItems.length;
    const satisfaction = avgRating / 5;
    
    // Update with exponential moving average
    const alpha = 0.1; // Smoothing factor
    model.performance.accuracy = alpha * accuracy + (1 - alpha) * model.performance.accuracy;
    model.performance.userSatisfaction = alpha * satisfaction + (1 - alpha) * model.performance.userSatisfaction;
    
    // Calculate F1 score (simplified)
    model.performance.f1Score = 2 * (model.performance.precision * model.performance.recall) / 
                                (model.performance.precision + model.performance.recall + 0.001);
    
    // Update stability score
    model.performance.stabilityScore = this.calculateStabilityScore(model);
  }
  
  /**
   * Calculate model stability score
   */
  private calculateStabilityScore(model: LearningModel): number {
    // Look at recent weight changes
    const recentChanges: number[] = [];
    
    Object.values(model.weights.rules).forEach(ruleWeight => {
      const history = ruleWeight.adjustmentHistory.slice(-10);
      history.forEach((h, i) => {
        if (i > 0) {
          const change = Math.abs(h.newWeight - history[i-1].newWeight);
          recentChanges.push(change);
        }
      });
    });
    
    if (recentChanges.length === 0) return 1.0;
    
    // Calculate variance of changes
    const avgChange = recentChanges.reduce((sum, c) => sum + c, 0) / recentChanges.length;
    const variance = recentChanges.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) / recentChanges.length;
    
    // Lower variance = higher stability
    return 1 / (1 + variance);
  }
  
  /**
   * Check for model convergence
   */
  private checkConvergence(model: LearningModel, updates: WeightUpdate[]): boolean {
    if (updates.length === 0) return true;
    
    // Calculate total change
    const totalChange = updates.reduce((sum, u) => 
      sum + Math.abs(u.newValue - u.oldValue), 0
    );
    
    // Check if below threshold
    return totalChange < model.trainingData.convergenceThreshold * updates.length;
  }
  
  /**
   * Calculate confidence for updates
   */
  private calculateUpdateConfidence(updates: WeightUpdate[], sampleSize: number): number {
    if (updates.length === 0) return 0;
    
    // Base confidence on sample size
    const sampleConfidence = Math.min(sampleSize / this.MIN_SAMPLES, 1);
    
    // Consider update impact
    const highImpactRatio = updates.filter(u => u.impact === 'high').length / updates.length;
    const impactConfidence = 1 - highImpactRatio * 0.5;
    
    return sampleConfidence * impactConfidence;
  }
  
  /**
   * Predict optimal weights for API type and domain
   */
  predictWeights(apiType: string, domain: string): WeightMap {
    if (!this.activeModelId) {
      throw new Error('No active model for prediction');
    }
    
    const model = this.models.get(this.activeModelId)!;
    const predictedWeights: WeightMap = JSON.parse(JSON.stringify(model.weights));
    
    // Apply profile-specific weights
    if (model.weights.profiles[apiType]) {
      const profileWeights = model.weights.profiles[apiType].weights;
      Object.entries(profileWeights).forEach(([ruleId, modifier]) => {
        if (predictedWeights.rules[ruleId]) {
          predictedWeights.rules[ruleId].currentWeight *= modifier;
        }
      });
    }
    
    // Apply domain-specific weights
    if (model.weights.domains[domain]) {
      const domainWeights = model.weights.domains[domain];
      Object.entries(domainWeights.ruleModifiers).forEach(([ruleId, modifier]) => {
        if (predictedWeights.rules[ruleId]) {
          predictedWeights.rules[ruleId].currentWeight *= modifier;
        }
      });
    }
    
    return predictedWeights;
  }
  
  /**
   * Validate model performance
   */
  validateModel(testFeedback: FeedbackItem[]): ModelPerformance {
    if (!this.activeModelId) {
      throw new Error('No active model to validate');
    }
    
    const model = this.models.get(this.activeModelId)!;
    
    // Calculate validation metrics
    const truePositives = testFeedback.filter(f => 
      f.rating >= 4 && f.metadata.finalScore >= 70
    ).length;
    
    const falsePositives = testFeedback.filter(f => 
      f.rating < 4 && f.metadata.finalScore >= 70
    ).length;
    
    const falseNegatives = testFeedback.filter(f => 
      f.rating >= 4 && f.metadata.finalScore < 70
    ).length;
    
    const trueNegatives = testFeedback.filter(f => 
      f.rating < 4 && f.metadata.finalScore < 70
    ).length;
    
    const accuracy = (truePositives + trueNegatives) / testFeedback.length;
    const precision = truePositives / (truePositives + falsePositives + 0.001);
    const recall = truePositives / (truePositives + falseNegatives + 0.001);
    const f1Score = 2 * (precision * recall) / (precision + recall + 0.001);
    
    const avgRating = testFeedback.reduce((sum, f) => sum + f.rating, 0) / testFeedback.length;
    const userSatisfaction = avgRating / 5;
    
    return {
      accuracy,
      precision,
      recall,
      f1Score,
      userSatisfaction,
      convergenceRate: model.performance.convergenceRate,
      stabilityScore: model.performance.stabilityScore
    };
  }
  
  /**
   * Rollback to previous model version
   */
  rollback(modelId: string): void {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    
    this.activeModelId = modelId;
    model.status = 'active';
    
    // Deprecate other models
    this.models.forEach((m, id) => {
      if (id !== modelId && m.status === 'active') {
        m.status = 'deprecated';
      }
    });
  }
  
  /**
   * Export model for persistence
   */
  exportModel(): LearningModel | null {
    if (!this.activeModelId) return null;
    return this.models.get(this.activeModelId) || null;
  }
  
  /**
   * Import model
   */
  importModel(model: LearningModel): void {
    this.models.set(model.modelId, model);
    if (model.status === 'active') {
      this.activeModelId = model.modelId;
    }
  }
  
  /**
   * Create initial weights
   */
  private createInitialWeights(): WeightMap {
    return {
      rules: {},
      categories: {
        security: 1.0,
        performance: 1.0,
        documentation: 1.0,
        errors: 1.0,
        standards: 1.0
      },
      profiles: {},
      domains: {}
    };
  }
  
  /**
   * Create initial performance metrics
   */
  private createInitialPerformance(): ModelPerformance {
    return {
      accuracy: 0.5,
      precision: 0.5,
      recall: 0.5,
      f1Score: 0.5,
      userSatisfaction: 0.5,
      convergenceRate: 0,
      stabilityScore: 1.0
    };
  }
  
  /**
   * Create default rule weight
   */
  private createDefaultRuleWeight(): RuleWeight {
    return {
      baseWeight: 1.0,
      currentWeight: 1.0,
      adjustmentHistory: [],
      performance: {
        accuracyRate: 0.5,
        falsePositiveRate: 0,
        falseNegativeRate: 0,
        userSatisfaction: 0.5
      }
    };
  }
  
  /**
   * Categorize feedback items
   */
  private categorizeFeedback(items: FeedbackItem[]): Map<string, FeedbackItem[]> {
    const categorized = new Map<string, FeedbackItem[]>();
    
    items.forEach(item => {
      const category = item.feedbackType;
      if (!categorized.has(category)) {
        categorized.set(category, []);
      }
      categorized.get(category)!.push(item);
    });
    
    return categorized;
  }
  
  /**
   * Generate unique model ID
   */
  private generateModelId(): string {
    return `model-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}