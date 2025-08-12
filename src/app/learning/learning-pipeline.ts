/**
 * Learning Pipeline
 * Integrates feedback collection, learning engine, and UI components
 * Orchestrates the complete learning feedback loop
 */

import { FeedbackCollector, FeedbackItem, FeedbackMetrics } from './feedback-collector';
import { LearningEngine, LearningModel, WeightMap } from './learning-engine';
import { FeedbackUI, FeedbackForm, FeedbackSession } from './feedback-ui';

export interface LearningPipelineConfig {
  enabled: boolean;
  autoLearn: boolean;
  learningInterval: number; // Hours between learning cycles
  minFeedbackForLearning: number;
  confidenceThreshold: number;
  validationSplitRatio: number;
  persistenceEnabled: boolean;
  persistencePath?: string;
}

export interface LearningCycle {
  cycleId: string;
  startTime: Date;
  endTime?: Date;
  feedbackCount: number;
  modelVersion: number;
  improvements: Array<{
    metric: string;
    before: number;
    after: number;
  }>;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}

export interface PipelineMetrics {
  totalFeedback: number;
  learningCycles: number;
  currentModelVersion: number;
  averageSatisfaction: number;
  detectionAccuracy: number;
  lastLearningCycle?: Date;
  nextScheduledCycle?: Date;
}

export interface GradingFeedbackContext {
  apiSpec: any;
  gradingResult: any;
  detectionResult: {
    type: string;
    confidence: number;
  };
  appliedProfile: string;
  businessDomain: string;
}

export class LearningPipeline {
  private feedbackCollector: FeedbackCollector;
  private learningEngine: LearningEngine;
  private feedbackUI: FeedbackUI;
  private config: LearningPipelineConfig;
  
  private learningCycles: Map<string, LearningCycle> = new Map();
  private pendingFeedback: FeedbackItem[] = [];
  private lastLearningTime: Date = new Date();
  private learningTimer?: NodeJS.Timeout;
  
  constructor(config: Partial<LearningPipelineConfig> = {}) {
    this.config = {
      enabled: true,
      autoLearn: true,
      learningInterval: 24, // Daily learning cycles
      minFeedbackForLearning: 10,
      confidenceThreshold: 0.7,
      validationSplitRatio: 0.2,
      persistenceEnabled: true,
      ...config
    };
    
    // Initialize components
    this.feedbackCollector = new FeedbackCollector();
    this.learningEngine = new LearningEngine();
    this.feedbackUI = new FeedbackUI();
    
    // Initialize learning model
    this.learningEngine.initialize();
    
    // Start auto-learning if enabled
    if (this.config.autoLearn) {
      this.startAutoLearning();
    }
    
    // Load persisted state if enabled
    if (this.config.persistenceEnabled) {
      this.loadPersistedState();
    }
  }
  
  /**
   * Process grading result and collect feedback
   */
  async processGradingResult(
    context: GradingFeedbackContext
  ): Promise<{
    feedbackRequested: boolean;
    sessionId?: string;
    adjustedWeights?: WeightMap;
  }> {
    const { gradingResult, detectionResult, appliedProfile, businessDomain } = context;
    
    // Get adjusted weights for this API type
    const adjustedWeights = this.learningEngine.predictWeights(
      detectionResult.type,
      businessDomain
    );
    
    // Check if feedback should be requested
    const shouldPrompt = this.feedbackUI.shouldPromptFeedback(
      gradingResult.score,
      detectionResult.confidence
    );
    
    let sessionId: string | undefined;
    
    if (shouldPrompt) {
      // Generate feedback form
      const form = this.feedbackUI.generateFeedbackForm(
        gradingResult,
        detectionResult.confidence < 0.7 ? 'detailed' : 'minimal'
      );
      
      // Start feedback session
      sessionId = this.feedbackUI.startSession(form);
      
      // Display feedback UI (implementation depends on environment)
      this.displayFeedbackUI(form, sessionId);
    }
    
    return {
      feedbackRequested: shouldPrompt,
      sessionId,
      adjustedWeights
    };
  }
  
  /**
   * Submit feedback from UI session
   */
  async submitFeedback(
    sessionId: string,
    responses: Array<{ promptId: string; value: any }>
  ): Promise<void> {
    // Record responses
    responses.forEach(response => {
      this.feedbackUI.recordResponse(sessionId, response);
    });
    
    // Complete session
    const session = this.feedbackUI.completeSession(sessionId);
    
    // Convert to feedback item
    const feedbackItem = this.convertSessionToFeedback(session);
    
    // Collect feedback
    const feedbackId = this.feedbackCollector.collectFeedback(feedbackItem);
    
    // Add to pending feedback
    this.pendingFeedback.push({
      ...feedbackItem,
      id: feedbackId,
      timestamp: new Date()
    });
    
    // Trigger learning if threshold met
    if (this.pendingFeedback.length >= this.config.minFeedbackForLearning) {
      await this.triggerLearning();
    }
  }
  
  /**
   * Trigger learning cycle
   */
  async triggerLearning(): Promise<LearningCycle> {
    const cycleId = this.generateCycleId();
    const cycle: LearningCycle = {
      cycleId,
      startTime: new Date(),
      feedbackCount: this.pendingFeedback.length,
      modelVersion: 1,
      improvements: [],
      status: 'running'
    };
    
    this.learningCycles.set(cycleId, cycle);
    
    try {
      // Split feedback for training and validation
      const { training, validation } = this.splitFeedback(this.pendingFeedback);
      
      // Get current model performance
      const beforeMetrics = this.learningEngine.validateModel(validation);
      
      // Analyze feedback patterns
      const analyses = this.feedbackCollector.analyzeFeedback();
      
      // Train model
      const learningUpdate = this.learningEngine.train(training, analyses);
      
      // Validate improvements
      const afterMetrics = this.learningEngine.validateModel(validation);
      
      // Record improvements
      cycle.improvements = [
        {
          metric: 'accuracy',
          before: beforeMetrics.accuracy,
          after: afterMetrics.accuracy
        },
        {
          metric: 'userSatisfaction',
          before: beforeMetrics.userSatisfaction,
          after: afterMetrics.userSatisfaction
        },
        {
          metric: 'f1Score',
          before: beforeMetrics.f1Score,
          after: afterMetrics.f1Score
        }
      ];
      
      // Update cycle status
      cycle.endTime = new Date();
      cycle.status = 'completed';
      cycle.modelVersion = learningUpdate.updates.length;
      
      // Clear pending feedback
      this.pendingFeedback = [];
      
      // Update last learning time
      this.lastLearningTime = new Date();
      
      // Persist state if enabled
      if (this.config.persistenceEnabled) {
        await this.persistState();
      }
      
      // Log success
      console.log(`Learning cycle ${cycleId} completed:`, {
        feedbackProcessed: cycle.feedbackCount,
        improvements: cycle.improvements.filter(i => i.after > i.before).length,
        modelVersion: cycle.modelVersion
      });
      
    } catch (error) {
      cycle.status = 'failed';
      cycle.error = error instanceof Error ? error.message : String(error);
      cycle.endTime = new Date();
      
      console.error(`Learning cycle ${cycleId} failed:`, error);
    }
    
    return cycle;
  }
  
  /**
   * Start auto-learning timer
   */
  private startAutoLearning(): void {
    if (this.learningTimer) {
      clearInterval(this.learningTimer);
    }
    
    const intervalMs = this.config.learningInterval * 60 * 60 * 1000;
    
    this.learningTimer = setInterval(async () => {
      if (this.pendingFeedback.length >= this.config.minFeedbackForLearning) {
        await this.triggerLearning();
      }
    }, intervalMs);
  }
  
  /**
   * Stop auto-learning
   */
  stopAutoLearning(): void {
    if (this.learningTimer) {
      clearInterval(this.learningTimer);
      this.learningTimer = undefined;
    }
  }
  
  /**
   * Get current weights for API type
   */
  getOptimizedWeights(apiType: string, domain: string): WeightMap {
    return this.learningEngine.predictWeights(apiType, domain);
  }
  
  /**
   * Get pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    const feedbackMetrics = this.feedbackCollector.getMetrics();
    const model = this.learningEngine.exportModel();
    const cycles = Array.from(this.learningCycles.values());
    
    const nextScheduled = new Date(
      this.lastLearningTime.getTime() + 
      this.config.learningInterval * 60 * 60 * 1000
    );
    
    return {
      totalFeedback: feedbackMetrics.totalFeedback,
      learningCycles: cycles.length,
      currentModelVersion: model?.version || 0,
      averageSatisfaction: feedbackMetrics.averageRating,
      detectionAccuracy: feedbackMetrics.accuracyScore,
      lastLearningCycle: cycles.length > 0 ? 
        cycles[cycles.length - 1].endTime : undefined,
      nextScheduledCycle: this.config.autoLearn ? nextScheduled : undefined
    };
  }
  
  /**
   * Get learning history
   */
  getLearningHistory(): LearningCycle[] {
    return Array.from(this.learningCycles.values())
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }
  
  /**
   * Export pipeline state
   */
  exportState(): {
    feedback: FeedbackItem[];
    model: LearningModel | null;
    cycles: LearningCycle[];
    metrics: PipelineMetrics;
  } {
    return {
      feedback: this.feedbackCollector.exportFeedback(),
      model: this.learningEngine.exportModel(),
      cycles: this.getLearningHistory(),
      metrics: this.getMetrics()
    };
  }
  
  /**
   * Import pipeline state
   */
  importState(state: {
    feedback?: FeedbackItem[];
    model?: LearningModel;
    cycles?: LearningCycle[];
  }): void {
    if (state.feedback) {
      this.feedbackCollector.importFeedback(state.feedback);
    }
    
    if (state.model) {
      this.learningEngine.importModel(state.model);
    }
    
    if (state.cycles) {
      state.cycles.forEach(cycle => {
        this.learningCycles.set(cycle.cycleId, cycle);
      });
    }
  }
  
  /**
   * Convert feedback session to feedback item
   */
  private convertSessionToFeedback(session: FeedbackSession): Omit<FeedbackItem, 'id' | 'timestamp'> {
    const responses = new Map(
      session.responses.map(r => [r.promptId, r.value])
    );
    
    // Extract ratings
    const overallRating = responses.get('overall-rating') as number || 
                         responses.get('accuracy-rating') as number || 3;
    
    // Extract corrections
    const corrections: any = {};
    if (responses.has('api-type-correction')) {
      corrections.actualApiType = responses.get('api-type-correction');
    }
    if (responses.has('incorrect-rules')) {
      corrections.incorrectRules = responses.get('incorrect-rules');
    }
    if (responses.has('severity-feedback')) {
      corrections.severityAdjustments = responses.get('severity-feedback');
    }
    
    return {
      apiSpecId: 'unknown', // Should be provided by context
      gradingResultId: 'unknown', // Should be provided by context
      feedbackType: 'overall',
      rating: overallRating as 1 | 2 | 3 | 4 | 5,
      comment: responses.get('suggestions') as string,
      metadata: {
        detectedType: 'REST', // Should be from context
        detectionConfidence: 0.5, // Should be from context
        appliedProfile: 'REST', // Should be from context
        businessDomain: 'general', // Should be from context
        finalScore: 0, // Should be from context
        ruleViolations: [] // Should be from context
      },
      userContext: {},
      corrections: Object.keys(corrections).length > 0 ? corrections : undefined
    };
  }
  
  /**
   * Split feedback for training and validation
   */
  private splitFeedback(
    feedback: FeedbackItem[]
  ): { training: FeedbackItem[]; validation: FeedbackItem[] } {
    const shuffled = [...feedback].sort(() => Math.random() - 0.5);
    const splitIndex = Math.floor(shuffled.length * (1 - this.config.validationSplitRatio));
    
    return {
      training: shuffled.slice(0, splitIndex),
      validation: shuffled.slice(splitIndex)
    };
  }
  
  /**
   * Display feedback UI (platform-specific implementation)
   */
  private displayFeedbackUI(form: FeedbackForm, sessionId: string): void {
    // CLI implementation
    if (process.env.CLI_MODE) {
      const prompt = this.feedbackUI.generateCLIPrompt(form);
      console.log(prompt);
      // Note: Actual CLI interaction would require readline or similar
    }
    
    // Web implementation would inject HTML widget
    // const widget = this.feedbackUI.generateHTMLWidget(form);
    // document.body.insertAdjacentHTML('beforeend', widget);
  }
  
  /**
   * Persist pipeline state
   */
  private async persistState(): Promise<void> {
    if (!this.config.persistenceEnabled) return;
    
    const state = this.exportState();
    const path = this.config.persistencePath || './learning-state.json';
    
    // In real implementation, use proper file system operations
    console.log(`Persisting learning state to ${path}`);
    // await fs.writeFile(path, JSON.stringify(state, null, 2));
  }
  
  /**
   * Load persisted state
   */
  private async loadPersistedState(): Promise<void> {
    if (!this.config.persistenceEnabled) return;
    
    const path = this.config.persistencePath || './learning-state.json';
    
    try {
      // In real implementation, use proper file system operations
      console.log(`Loading learning state from ${path}`);
      // const data = await fs.readFile(path, 'utf-8');
      // const state = JSON.parse(data);
      // this.importState(state);
    } catch (error) {
      console.log('No persisted state found, starting fresh');
    }
  }
  
  /**
   * Generate unique cycle ID
   */
  private generateCycleId(): string {
    return `cycle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Generate dashboard report
   */
  generateDashboard(): string {
    const metrics = this.getMetrics();
    const feedbackStats = this.feedbackUI.getStatistics();
    const recentCycles = this.getLearningHistory().slice(-5);
    
    const lines: string[] = [
      '╔════════════════════════════════════════════════════════════╗',
      '║           🧠 Learning Pipeline Dashboard                    ║',
      '╚════════════════════════════════════════════════════════════╝',
      '',
      '📊 Overall Metrics',
      '─────────────────────────────────────────',
      `Total Feedback Collected: ${metrics.totalFeedback}`,
      `Learning Cycles Completed: ${metrics.learningCycles}`,
      `Current Model Version: v${metrics.currentModelVersion}`,
      `Average User Satisfaction: ${(metrics.averageSatisfaction * 20).toFixed(1)}%`,
      `Detection Accuracy: ${(metrics.detectionAccuracy * 100).toFixed(1)}%`,
      '',
      '⏱️ Learning Schedule',
      '─────────────────────────────────────────',
      `Last Learning: ${metrics.lastLearningCycle?.toLocaleString() || 'Never'}`,
      `Next Scheduled: ${metrics.nextScheduledCycle?.toLocaleString() || 'Not scheduled'}`,
      `Pending Feedback: ${this.pendingFeedback.length}`,
      `Min for Learning: ${this.config.minFeedbackForLearning}`,
      '',
      '📝 Feedback Statistics',
      '─────────────────────────────────────────',
      `Total Sessions: ${feedbackStats.totalSessions}`,
      `Completed: ${feedbackStats.completedSessions}`,
      `Skipped: ${feedbackStats.skippedSessions}`,
      `Completion Rate: ${(feedbackStats.completionRate * 100).toFixed(1)}%`,
      `Avg Response Time: ${(feedbackStats.averageResponseTime / 1000).toFixed(1)}s`,
      ''
    ];
    
    if (recentCycles.length > 0) {
      lines.push('📈 Recent Learning Cycles');
      lines.push('─────────────────────────────────────────');
      recentCycles.forEach(cycle => {
        const improvements = cycle.improvements.filter(i => i.after > i.before).length;
        const status = cycle.status === 'completed' ? '✅' :
                      cycle.status === 'failed' ? '❌' : '⏳';
        lines.push(`${status} ${cycle.cycleId.substring(0, 16)}...`);
        lines.push(`   Feedback: ${cycle.feedbackCount} | Improvements: ${improvements}/${cycle.improvements.length}`);
      });
    }
    
    lines.push('');
    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push(`║ Status: ${this.config.enabled ? '🟢 Active' : '🔴 Disabled'} | Auto-Learn: ${this.config.autoLearn ? 'ON' : 'OFF'}                     ║`);
    lines.push('╚════════════════════════════════════════════════════════════╝');
    
    return lines.join('\\n');
  }
}