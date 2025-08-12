/**
 * Experiment Tracking System
 * Manages A/B testing, canary deployments, and model evaluation
 * Provides statistical significance testing and automatic rollout decisions
 */

export interface ExperimentConfig {
  name: string;
  description: string;
  type: 'ab_test' | 'canary' | 'multi_armed_bandit';
  startDate: Date;
  endDate?: Date;
  targetMetrics: string[];
  successCriteria: {
    metric: string;
    threshold: number;
    direction: 'increase' | 'decrease';
  }[];
  allocation: {
    control: number;  // Percentage
    treatment: number;
    strategy: 'random' | 'deterministic' | 'progressive';
  };
  safetyThresholds: {
    maxErrorRate: number;
    minSampleSize: number;
    pValueThreshold: number;
  };
}

export interface Variant {
  id: string;
  name: string;
  description: string;
  modelVersion: string;
  config: any;
  allocation: number;
  status: 'active' | 'paused' | 'stopped' | 'winner' | 'loser';
}

export interface MetricSnapshot {
  timestamp: Date;
  variantId: string;
  metrics: Map<string, number>;
  sampleSize: number;
  errorRate: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
}

export interface ExperimentResult {
  experimentId: string;
  winner?: string;
  confidence: number;
  pValue: number;
  effectSize: number;
  sampleSizePerVariant: Map<string, number>;
  metrics: Map<string, VariantMetrics>;
  recommendation: string;
  risks: string[];
}

export interface VariantMetrics {
  mean: number;
  variance: number;
  standardError: number;
  confidenceInterval: [number, number];
  percentChange: number;
}

export interface BanditState {
  arms: Map<string, ArmState>;
  totalPulls: number;
  algorithm: 'epsilon_greedy' | 'ucb' | 'thompson_sampling';
  explorationRate: number;
}

export interface ArmState {
  variantId: string;
  pulls: number;
  rewards: number;
  averageReward: number;
  ucbScore?: number;
  thompsonAlpha: number;
  thompsonBeta: number;
}

export class ExperimentTracker {
  private experiments: Map<string, Experiment> = new Map();
  private activeExperiments: Set<string> = new Set();
  private metricHistory: Map<string, MetricSnapshot[]> = new Map();
  private banditStates: Map<string, BanditState> = new Map();
  private updateInterval: number = 60000; // 1 minute
  private updateTimer?: NodeJS.Timeout;
  
  constructor() {
    this.startMetricCollection();
  }
  
  /**
   * Create a new experiment
   */
  async createExperiment(
    config: ExperimentConfig,
    variants: Variant[]
  ): Promise<string> {
    const experimentId = this.generateExperimentId(config.name);
    
    // Validate experiment configuration
    this.validateExperiment(config, variants);
    
    const experiment: Experiment = {
      id: experimentId,
      config,
      variants,
      status: 'pending',
      createdAt: new Date(),
      results: new Map(),
      currentAllocation: new Map()
    };
    
    // Initialize allocation
    this.initializeAllocation(experiment);
    
    // Initialize bandit if needed
    if (config.type === 'multi_armed_bandit') {
      this.initializeBandit(experimentId, variants);
    }
    
    this.experiments.set(experimentId, experiment);
    
    console.log(`Created experiment: ${experimentId}`);
    return experimentId;
  }
  
  /**
   * Start an experiment
   */
  async startExperiment(experimentId: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    
    if (experiment.status === 'running') {
      console.log(`Experiment ${experimentId} is already running`);
      return;
    }
    
    console.log(`Starting experiment: ${experimentId}`);
    
    experiment.status = 'running';
    experiment.startedAt = new Date();
    this.activeExperiments.add(experimentId);
    
    // Initialize metric collection
    this.metricHistory.set(experimentId, []);
    
    // Start progressive rollout if configured
    if (experiment.config.allocation.strategy === 'progressive') {
      this.startProgressiveRollout(experimentId);
    }
    
    console.log(`Experiment ${experimentId} started`);
  }
  
  /**
   * Record metric for a variant
   */
  async recordMetric(
    experimentId: string,
    variantId: string,
    metricName: string,
    value: number
  ): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return;
    }
    
    // Get or create metric snapshot
    let snapshot = this.getCurrentSnapshot(experimentId, variantId);
    if (!snapshot) {
      snapshot = {
        timestamp: new Date(),
        variantId,
        metrics: new Map(),
        sampleSize: 0,
        errorRate: 0,
        latency: { p50: 0, p95: 0, p99: 0 }
      };
      this.addSnapshot(experimentId, snapshot);
    }
    
    // Update metric
    const currentValue = snapshot.metrics.get(metricName) || 0;
    const newValue = (currentValue * snapshot.sampleSize + value) / (snapshot.sampleSize + 1);
    snapshot.metrics.set(metricName, newValue);
    snapshot.sampleSize++;
    
    // Update bandit if applicable
    if (experiment.config.type === 'multi_armed_bandit') {
      this.updateBandit(experimentId, variantId, value);
    }
    
    // Check safety thresholds
    await this.checkSafetyThresholds(experimentId);
  }
  
  /**
   * Analyze experiment results
   */
  async analyzeExperiment(experimentId: string): Promise<ExperimentResult> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    
    const snapshots = this.metricHistory.get(experimentId) || [];
    if (snapshots.length === 0) {
      throw new Error('No data collected for experiment');
    }
    
    // Group snapshots by variant
    const variantData = this.groupSnapshotsByVariant(snapshots);
    
    // Calculate statistics for each variant
    const variantStats = new Map<string, VariantMetrics>();
    const sampleSizes = new Map<string, number>();
    
    experiment.variants.forEach(variant => {
      const data = variantData.get(variant.id) || [];
      if (data.length > 0) {
        const stats = this.calculateVariantStatistics(
          data,
          experiment.config.targetMetrics[0]
        );
        variantStats.set(variant.id, stats);
        sampleSizes.set(variant.id, data.reduce((sum, s) => sum + s.sampleSize, 0));
      }
    });
    
    // Perform statistical tests
    const testResult = this.performStatisticalTest(
      variantStats,
      sampleSizes,
      experiment
    );
    
    // Determine winner
    const winner = this.determineWinner(variantStats, testResult, experiment);
    
    // Generate recommendations
    const recommendation = this.generateRecommendation(
      winner,
      testResult,
      variantStats
    );
    
    // Identify risks
    const risks = this.identifyRisks(variantStats, sampleSizes, experiment);
    
    const result: ExperimentResult = {
      experimentId,
      winner: winner?.id,
      confidence: testResult.confidence,
      pValue: testResult.pValue,
      effectSize: testResult.effectSize,
      sampleSizePerVariant: sampleSizes,
      metrics: variantStats,
      recommendation,
      risks
    };
    
    // Store result
    experiment.results.set(new Date().toISOString(), result);
    
    return result;
  }
  
  /**
   * Stop an experiment
   */
  async stopExperiment(
    experimentId: string,
    reason?: string
  ): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    
    console.log(`Stopping experiment ${experimentId}: ${reason || 'Manual stop'}`);
    
    experiment.status = 'stopped';
    experiment.stoppedAt = new Date();
    experiment.stopReason = reason;
    this.activeExperiments.delete(experimentId);
    
    // Analyze final results
    const result = await this.analyzeExperiment(experimentId);
    
    // Apply winner if conclusive
    if (result.winner && result.confidence > 0.95) {
      await this.applyWinner(experimentId, result.winner);
    }
  }
  
  /**
   * Initialize allocation for experiment
   */
  private initializeAllocation(experiment: Experiment): void {
    const { allocation } = experiment.config;
    
    // Set initial allocation
    experiment.variants.forEach(variant => {
      if (variant.name === 'control') {
        experiment.currentAllocation.set(variant.id, allocation.control);
      } else {
        experiment.currentAllocation.set(
          variant.id,
          allocation.treatment / (experiment.variants.length - 1)
        );
      }
    });
  }
  
  /**
   * Initialize multi-armed bandit
   */
  private initializeBandit(experimentId: string, variants: Variant[]): void {
    const banditState: BanditState = {
      arms: new Map(),
      totalPulls: 0,
      algorithm: 'thompson_sampling',
      explorationRate: 0.1
    };
    
    variants.forEach(variant => {
      banditState.arms.set(variant.id, {
        variantId: variant.id,
        pulls: 0,
        rewards: 0,
        averageReward: 0,
        thompsonAlpha: 1,
        thompsonBeta: 1
      });
    });
    
    this.banditStates.set(experimentId, banditState);
  }
  
  /**
   * Update bandit arm
   */
  private updateBandit(
    experimentId: string,
    variantId: string,
    reward: number
  ): void {
    const banditState = this.banditStates.get(experimentId);
    if (!banditState) return;
    
    const arm = banditState.arms.get(variantId);
    if (!arm) return;
    
    // Update arm statistics
    arm.pulls++;
    arm.rewards += reward;
    arm.averageReward = arm.rewards / arm.pulls;
    
    // Update Thompson sampling parameters
    if (reward > 0) {
      arm.thompsonAlpha++;
    } else {
      arm.thompsonBeta++;
    }
    
    // Update UCB score
    if (banditState.algorithm === 'ucb') {
      const exploration = Math.sqrt(2 * Math.log(banditState.totalPulls) / arm.pulls);
      arm.ucbScore = arm.averageReward + exploration;
    }
    
    banditState.totalPulls++;
    
    // Adjust allocation based on bandit algorithm
    this.adjustBanditAllocation(experimentId);
  }
  
  /**
   * Adjust allocation based on bandit algorithm
   */
  private adjustBanditAllocation(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    const banditState = this.banditStates.get(experimentId);
    if (!experiment || !banditState) return;
    
    const allocations = new Map<string, number>();
    
    switch (banditState.algorithm) {
      case 'thompson_sampling':
        // Sample from Beta distributions
        const samples = new Map<string, number>();
        let totalSample = 0;
        
        banditState.arms.forEach((arm, variantId) => {
          const sample = this.sampleBeta(arm.thompsonAlpha, arm.thompsonBeta);
          samples.set(variantId, sample);
          totalSample += sample;
        });
        
        // Normalize to percentages
        samples.forEach((sample, variantId) => {
          allocations.set(variantId, (sample / totalSample) * 100);
        });
        break;
      
      case 'ucb':
        // Allocate based on UCB scores
        const scores = Array.from(banditState.arms.entries())
          .sort((a, b) => (b[1].ucbScore || 0) - (a[1].ucbScore || 0));
        
        // Give most traffic to highest UCB score
        scores.forEach((score, index) => {
          const allocation = index === 0 ? 60 : 40 / (scores.length - 1);
          allocations.set(score[0], allocation);
        });
        break;
      
      case 'epsilon_greedy':
        // Exploit best arm with probability 1-epsilon
        const bestArm = this.getBestArm(banditState);
        const epsilon = banditState.explorationRate;
        
        banditState.arms.forEach((arm, variantId) => {
          if (variantId === bestArm) {
            allocations.set(variantId, 100 * (1 - epsilon) + 
              (100 * epsilon) / banditState.arms.size);
          } else {
            allocations.set(variantId, (100 * epsilon) / banditState.arms.size);
          }
        });
        break;
    }
    
    // Update experiment allocation
    experiment.currentAllocation = allocations;
  }
  
  /**
   * Start progressive rollout
   */
  private startProgressiveRollout(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;
    
    // Start with small treatment allocation
    const initialTreatment = 5; // 5%
    experiment.variants.forEach(variant => {
      if (variant.name === 'control') {
        experiment.currentAllocation.set(variant.id, 100 - initialTreatment);
      } else {
        experiment.currentAllocation.set(variant.id, initialTreatment);
      }
    });
    
    // Schedule progressive increases
    const rolloutSchedule = [10, 25, 50, 75, 100]; // Percentage milestones
    let currentMilestone = 0;
    
    const rolloutTimer = setInterval(async () => {
      if (currentMilestone >= rolloutSchedule.length) {
        clearInterval(rolloutTimer);
        return;
      }
      
      // Check safety before increasing
      const isSafe = await this.checkRolloutSafety(experimentId);
      if (!isSafe) {
        console.log(`Halting rollout for ${experimentId} due to safety concerns`);
        clearInterval(rolloutTimer);
        return;
      }
      
      // Increase treatment allocation
      const newAllocation = rolloutSchedule[currentMilestone];
      experiment.variants.forEach(variant => {
        if (variant.name === 'control') {
          experiment.currentAllocation.set(variant.id, 100 - newAllocation);
        } else {
          experiment.currentAllocation.set(variant.id, newAllocation);
        }
      });
      
      console.log(`Progressive rollout: ${newAllocation}% for treatment`);
      currentMilestone++;
    }, 3600000); // Check every hour
  }
  
  /**
   * Check safety thresholds
   */
  private async checkSafetyThresholds(experimentId: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;
    
    const snapshots = this.metricHistory.get(experimentId) || [];
    const recentSnapshots = snapshots.slice(-100); // Last 100 snapshots
    
    // Check error rate
    const avgErrorRate = recentSnapshots.reduce((sum, s) => sum + s.errorRate, 0) / 
                         recentSnapshots.length;
    
    if (avgErrorRate > experiment.config.safetyThresholds.maxErrorRate) {
      console.log(`Safety threshold exceeded: error rate ${avgErrorRate}`);
      await this.stopExperiment(experimentId, 'Safety threshold exceeded');
    }
  }
  
  /**
   * Check rollout safety
   */
  private async checkRolloutSafety(experimentId: string): Promise<boolean> {
    const result = await this.analyzeExperiment(experimentId);
    
    // Check if treatment is performing worse than control
    const controlMetrics = result.metrics.get('control');
    const treatmentMetrics = Array.from(result.metrics.entries())
      .filter(([id]) => id !== 'control')
      .map(([_, metrics]) => metrics);
    
    if (!controlMetrics || treatmentMetrics.length === 0) {
      return true; // Not enough data
    }
    
    // Check if any treatment is significantly worse
    for (const treatment of treatmentMetrics) {
      if (treatment.percentChange < -10) { // More than 10% worse
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Calculate variant statistics
   */
  private calculateVariantStatistics(
    snapshots: MetricSnapshot[],
    metricName: string
  ): VariantMetrics {
    const values: number[] = [];
    let totalSamples = 0;
    
    snapshots.forEach(snapshot => {
      const value = snapshot.metrics.get(metricName);
      if (value !== undefined) {
        // Weight by sample size
        for (let i = 0; i < snapshot.sampleSize; i++) {
          values.push(value);
        }
        totalSamples += snapshot.sampleSize;
      }
    });
    
    if (values.length === 0) {
      return {
        mean: 0,
        variance: 0,
        standardError: 0,
        confidenceInterval: [0, 0],
        percentChange: 0
      };
    }
    
    // Calculate statistics
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / 
                    (values.length - 1);
    const standardError = Math.sqrt(variance / values.length);
    
    // 95% confidence interval
    const z = 1.96; // 95% confidence
    const margin = z * standardError;
    const confidenceInterval: [number, number] = [
      mean - margin,
      mean + margin
    ];
    
    return {
      mean,
      variance,
      standardError,
      confidenceInterval,
      percentChange: 0 // Will be calculated relative to control
    };
  }
  
  /**
   * Perform statistical test
   */
  private performStatisticalTest(
    variantStats: Map<string, VariantMetrics>,
    sampleSizes: Map<string, number>,
    experiment: Experiment
  ): { pValue: number; confidence: number; effectSize: number } {
    const control = variantStats.get('control');
    if (!control) {
      return { pValue: 1, confidence: 0, effectSize: 0 };
    }
    
    let minPValue = 1;
    let maxEffectSize = 0;
    
    // Compare each treatment to control
    variantStats.forEach((treatment, variantId) => {
      if (variantId === 'control') return;
      
      // Calculate percent change
      treatment.percentChange = ((treatment.mean - control.mean) / control.mean) * 100;
      
      // Two-sample t-test
      const n1 = sampleSizes.get('control') || 0;
      const n2 = sampleSizes.get(variantId) || 0;
      
      if (n1 < 2 || n2 < 2) return;
      
      const pooledVariance = ((n1 - 1) * control.variance + (n2 - 1) * treatment.variance) /
                            (n1 + n2 - 2);
      const standardError = Math.sqrt(pooledVariance * (1/n1 + 1/n2));
      const tStatistic = (treatment.mean - control.mean) / standardError;
      
      // Calculate p-value (simplified)
      const degreesOfFreedom = n1 + n2 - 2;
      const pValue = this.calculatePValue(tStatistic, degreesOfFreedom);
      
      minPValue = Math.min(minPValue, pValue);
      
      // Calculate effect size (Cohen's d)
      const effectSize = Math.abs(treatment.mean - control.mean) / 
                        Math.sqrt(pooledVariance);
      maxEffectSize = Math.max(maxEffectSize, effectSize);
    });
    
    return {
      pValue: minPValue,
      confidence: 1 - minPValue,
      effectSize: maxEffectSize
    };
  }
  
  /**
   * Determine experiment winner
   */
  private determineWinner(
    variantStats: Map<string, VariantMetrics>,
    testResult: { pValue: number; confidence: number; effectSize: number },
    experiment: Experiment
  ): Variant | undefined {
    // Check if results are statistically significant
    if (testResult.pValue > experiment.config.safetyThresholds.pValueThreshold) {
      return undefined; // Not significant
    }
    
    // Find best performing variant
    let bestVariant: Variant | undefined;
    let bestMetric = -Infinity;
    
    experiment.variants.forEach(variant => {
      const stats = variantStats.get(variant.id);
      if (!stats) return;
      
      // Check success criteria
      let meetsAllCriteria = true;
      experiment.config.successCriteria.forEach(criterion => {
        const metricValue = stats.mean; // Simplified
        
        if (criterion.direction === 'increase') {
          if (metricValue < criterion.threshold) {
            meetsAllCriteria = false;
          }
        } else {
          if (metricValue > criterion.threshold) {
            meetsAllCriteria = false;
          }
        }
      });
      
      if (meetsAllCriteria && stats.mean > bestMetric) {
        bestMetric = stats.mean;
        bestVariant = variant;
      }
    });
    
    // Mark winner
    if (bestVariant) {
      bestVariant.status = 'winner';
      experiment.variants.forEach(v => {
        if (v.id !== bestVariant!.id && v.status === 'active') {
          v.status = 'loser';
        }
      });
    }
    
    return bestVariant;
  }
  
  /**
   * Generate recommendation
   */
  private generateRecommendation(
    winner: Variant | undefined,
    testResult: { pValue: number; confidence: number; effectSize: number },
    variantStats: Map<string, VariantMetrics>
  ): string {
    if (!winner) {
      if (testResult.pValue > 0.05) {
        return 'Continue experiment - results not yet statistically significant';
      }
      return 'No clear winner - consider extending experiment or increasing sample size';
    }
    
    const winnerStats = variantStats.get(winner.id);
    if (!winnerStats) {
      return 'Insufficient data for recommendation';
    }
    
    if (testResult.effectSize < 0.2) {
      return `Small effect size detected. ${winner.name} shows marginal improvement.`;
    } else if (testResult.effectSize < 0.5) {
      return `Medium effect size. Recommend gradual rollout of ${winner.name}.`;
    } else {
      return `Large effect size! Strongly recommend immediate rollout of ${winner.name}.`;
    }
  }
  
  /**
   * Identify risks
   */
  private identifyRisks(
    variantStats: Map<string, VariantMetrics>,
    sampleSizes: Map<string, number>,
    experiment: Experiment
  ): string[] {
    const risks: string[] = [];
    
    // Check sample size
    const minSampleSize = experiment.config.safetyThresholds.minSampleSize;
    sampleSizes.forEach((size, variantId) => {
      if (size < minSampleSize) {
        risks.push(`Low sample size for ${variantId}: ${size} < ${minSampleSize}`);
      }
    });
    
    // Check variance
    variantStats.forEach((stats, variantId) => {
      if (stats.variance > stats.mean * 2) {
        risks.push(`High variance detected for ${variantId}`);
      }
    });
    
    // Check for negative impact
    variantStats.forEach((stats, variantId) => {
      if (stats.percentChange < -5) {
        risks.push(`Negative impact detected for ${variantId}: ${stats.percentChange.toFixed(1)}%`);
      }
    });
    
    return risks;
  }
  
  /**
   * Apply winning variant
   */
  private async applyWinner(experimentId: string, winnerId: string): Promise<void> {
    console.log(`Applying winner ${winnerId} from experiment ${experimentId}`);
    
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;
    
    // Set winner to 100% allocation
    experiment.currentAllocation.clear();
    experiment.currentAllocation.set(winnerId, 100);
    
    // In production, this would trigger actual deployment
    console.log(`Winner ${winnerId} deployed to 100% of traffic`);
  }
  
  // Helper methods
  
  private generateExperimentId(name: string): string {
    return `exp_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  }
  
  private validateExperiment(config: ExperimentConfig, variants: Variant[]): void {
    if (variants.length < 2) {
      throw new Error('Experiment must have at least 2 variants');
    }
    
    const hasControl = variants.some(v => v.name === 'control');
    if (!hasControl) {
      throw new Error('Experiment must have a control variant');
    }
    
    const totalAllocation = config.allocation.control + config.allocation.treatment;
    if (Math.abs(totalAllocation - 100) > 0.01) {
      throw new Error('Allocation must sum to 100%');
    }
  }
  
  private getCurrentSnapshot(
    experimentId: string,
    variantId: string
  ): MetricSnapshot | undefined {
    const history = this.metricHistory.get(experimentId);
    if (!history) return undefined;
    
    // Get most recent snapshot for variant
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].variantId === variantId) {
        const age = Date.now() - history[i].timestamp.getTime();
        if (age < 60000) { // Less than 1 minute old
          return history[i];
        }
        break;
      }
    }
    
    return undefined;
  }
  
  private addSnapshot(experimentId: string, snapshot: MetricSnapshot): void {
    const history = this.metricHistory.get(experimentId) || [];
    history.push(snapshot);
    
    // Keep only last 10000 snapshots
    if (history.length > 10000) {
      history.shift();
    }
    
    this.metricHistory.set(experimentId, history);
  }
  
  private groupSnapshotsByVariant(
    snapshots: MetricSnapshot[]
  ): Map<string, MetricSnapshot[]> {
    const grouped = new Map<string, MetricSnapshot[]>();
    
    snapshots.forEach(snapshot => {
      const variantSnapshots = grouped.get(snapshot.variantId) || [];
      variantSnapshots.push(snapshot);
      grouped.set(snapshot.variantId, variantSnapshots);
    });
    
    return grouped;
  }
  
  private sampleBeta(alpha: number, beta: number): number {
    // Simple Beta distribution sampling
    const x = this.sampleGamma(alpha);
    const y = this.sampleGamma(beta);
    return x / (x + y);
  }
  
  private sampleGamma(shape: number): number {
    // Simplified Gamma sampling (Marsaglia & Tsang)
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
    
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      const z = this.normalRandom();
      const u = Math.random();
      const v = Math.pow(1 + c * z, 3);
      
      if (z > -1/c && Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) {
        return d * v;
      }
    }
  }
  
  private normalRandom(): number {
    // Box-Muller transform
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  
  private getBestArm(banditState: BanditState): string {
    let bestArm = '';
    let bestReward = -Infinity;
    
    banditState.arms.forEach((arm, variantId) => {
      if (arm.averageReward > bestReward) {
        bestReward = arm.averageReward;
        bestArm = variantId;
      }
    });
    
    return bestArm;
  }
  
  private calculatePValue(tStatistic: number, degreesOfFreedom: number): number {
    // Simplified p-value calculation
    // In production, use proper t-distribution CDF
    const absT = Math.abs(tStatistic);
    
    if (absT < 1.96) return 0.05;
    if (absT < 2.58) return 0.01;
    if (absT < 3.29) return 0.001;
    return 0.0001;
  }
  
  private startMetricCollection(): void {
    this.updateTimer = setInterval(() => {
      // Collect metrics from active experiments
      this.activeExperiments.forEach(experimentId => {
        // In production, collect real metrics
        console.log(`Collecting metrics for experiment ${experimentId}`);
      });
    }, this.updateInterval);
  }
  
  /**
   * Get experiment status
   */
  getExperimentStatus(experimentId: string): any {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;
    
    return {
      id: experimentId,
      status: experiment.status,
      currentAllocation: Array.from(experiment.currentAllocation.entries()),
      latestResult: Array.from(experiment.results.values()).pop()
    };
  }
  
  /**
   * List all experiments
   */
  listExperiments(): Array<{ id: string; name: string; status: string }> {
    return Array.from(this.experiments.values()).map(exp => ({
      id: exp.id,
      name: exp.config.name,
      status: exp.status
    }));
  }
}

// Internal types
interface Experiment {
  id: string;
  config: ExperimentConfig;
  variants: Variant[];
  status: 'pending' | 'running' | 'stopped' | 'completed';
  createdAt: Date;
  startedAt?: Date;
  stoppedAt?: Date;
  stopReason?: string;
  results: Map<string, ExperimentResult>;
  currentAllocation: Map<string, number>;
}