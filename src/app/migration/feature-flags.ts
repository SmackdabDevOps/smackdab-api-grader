/**
 * Feature Flags System
 * Controls rollout of Phase 2 context-aware grading features
 */

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  conditions: FlagCondition[];
  metadata: {
    created: Date;
    modified: Date;
    owner: string;
    tags: string[];
  };
  dependencies?: string[]; // Other flags this depends on
  overrides?: FlagOverride[];
}

export interface FlagCondition {
  type: 'user' | 'organization' | 'api_type' | 'domain' | 'time' | 'custom';
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
  weight?: number;
}

export interface FlagOverride {
  condition: FlagCondition;
  enabled: boolean;
  reason: string;
}

export interface FeatureFlagConfig {
  defaultEnabled: boolean;
  cacheTTL: number; // seconds
  evaluationMode: 'strict' | 'permissive';
  monitoringEnabled: boolean;
}

export interface FlagEvaluation {
  flagId: string;
  enabled: boolean;
  reason: string;
  evaluationTime: number; // ms
  conditions_met: string[];
  overrideApplied?: string;
}

export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  private evaluationCache: Map<string, { result: boolean; timestamp: number }> = new Map();
  private config: FeatureFlagConfig;
  
  // Phase 2 Feature Flags
  readonly FLAGS = {
    CONTEXT_AWARE_GRADING: 'context_aware_grading',
    ML_DETECTION: 'ml_detection',
    ADAPTIVE_SCORING: 'adaptive_scoring',
    BUSINESS_CONTEXT: 'business_context',
    LEARNING_SYSTEM: 'learning_system',
    PROFILE_SYSTEM: 'profile_system',
    PATTERN_DETECTION: 'pattern_detection',
    COMPLIANCE_MAPPING: 'compliance_mapping',
    FEEDBACK_COLLECTION: 'feedback_collection',
    WEIGHT_OPTIMIZATION: 'weight_optimization'
  };
  
  constructor(config: Partial<FeatureFlagConfig> = {}) {
    this.config = {
      defaultEnabled: false,
      cacheTTL: 300, // 5 minutes
      evaluationMode: 'strict',
      monitoringEnabled: true,
      ...config
    };
    
    this.initializePhase2Flags();
  }
  
  /**
   * Initialize Phase 2 feature flags
   */
  private initializePhase2Flags(): void {
    // Main context-aware grading flag
    this.createFlag({
      id: this.FLAGS.CONTEXT_AWARE_GRADING,
      name: 'Context-Aware Grading',
      description: 'Master flag for Phase 2 context-aware grading system',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'platform-team',
        tags: ['phase2', 'grading', 'master']
      }
    });
    
    // ML Detection flag
    this.createFlag({
      id: this.FLAGS.ML_DETECTION,
      name: 'ML-Based API Detection',
      description: 'Enable machine learning based API type detection',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'ml-team',
        tags: ['phase2', 'detection', 'ml']
      },
      dependencies: [this.FLAGS.CONTEXT_AWARE_GRADING]
    });
    
    // Adaptive Scoring flag
    this.createFlag({
      id: this.FLAGS.ADAPTIVE_SCORING,
      name: 'Adaptive Scoring Engine',
      description: 'Enable dynamic weight adjustment based on API type',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'grading-team',
        tags: ['phase2', 'scoring', 'adaptive']
      },
      dependencies: [this.FLAGS.CONTEXT_AWARE_GRADING, this.FLAGS.PROFILE_SYSTEM]
    });
    
    // Business Context flag
    this.createFlag({
      id: this.FLAGS.BUSINESS_CONTEXT,
      name: 'Business Context Analysis',
      description: 'Enable domain detection and compliance mapping',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'business-team',
        tags: ['phase2', 'business', 'compliance']
      },
      dependencies: [this.FLAGS.CONTEXT_AWARE_GRADING]
    });
    
    // Learning System flag
    this.createFlag({
      id: this.FLAGS.LEARNING_SYSTEM,
      name: 'Learning Feedback System',
      description: 'Enable feedback collection and weight optimization',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'ml-team',
        tags: ['phase2', 'learning', 'feedback']
      },
      dependencies: [this.FLAGS.CONTEXT_AWARE_GRADING, this.FLAGS.FEEDBACK_COLLECTION]
    });
    
    // Profile System flag
    this.createFlag({
      id: this.FLAGS.PROFILE_SYSTEM,
      name: 'Profile-Based Grading',
      description: 'Enable different grading profiles for API types',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'grading-team',
        tags: ['phase2', 'profiles', 'rules']
      },
      dependencies: [this.FLAGS.CONTEXT_AWARE_GRADING]
    });
    
    // Pattern Detection flag
    this.createFlag({
      id: this.FLAGS.PATTERN_DETECTION,
      name: 'Pattern-Based Detection',
      description: 'Enable pattern libraries for API detection',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'detection-team',
        tags: ['phase2', 'patterns', 'detection']
      },
      dependencies: [this.FLAGS.ML_DETECTION]
    });
    
    // Compliance Mapping flag
    this.createFlag({
      id: this.FLAGS.COMPLIANCE_MAPPING,
      name: 'Compliance Requirement Mapping',
      description: 'Enable industry-specific compliance rules',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'compliance-team',
        tags: ['phase2', 'compliance', 'regulations']
      },
      dependencies: [this.FLAGS.BUSINESS_CONTEXT]
    });
    
    // Feedback Collection flag
    this.createFlag({
      id: this.FLAGS.FEEDBACK_COLLECTION,
      name: 'User Feedback Collection',
      description: 'Enable feedback UI and collection pipeline',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'product-team',
        tags: ['phase2', 'feedback', 'ui']
      },
      dependencies: [this.FLAGS.CONTEXT_AWARE_GRADING]
    });
    
    // Weight Optimization flag
    this.createFlag({
      id: this.FLAGS.WEIGHT_OPTIMIZATION,
      name: 'Automatic Weight Optimization',
      description: 'Enable ML-based weight optimization from feedback',
      enabled: false,
      rolloutPercentage: 0,
      conditions: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        owner: 'ml-team',
        tags: ['phase2', 'optimization', 'learning']
      },
      dependencies: [this.FLAGS.LEARNING_SYSTEM]
    });
  }
  
  /**
   * Create or update a feature flag
   */
  createFlag(flag: FeatureFlag): void {
    // Validate dependencies
    if (flag.dependencies) {
      for (const dep of flag.dependencies) {
        if (!this.flags.has(dep)) {
          throw new Error(`Dependency flag ${dep} does not exist`);
        }
      }
    }
    
    this.flags.set(flag.id, flag);
    this.clearCache(flag.id);
  }
  
  /**
   * Evaluate if a feature is enabled
   */
  isEnabled(
    flagId: string,
    context: Record<string, any> = {}
  ): boolean {
    // Check cache first
    const cached = this.getCached(flagId);
    if (cached !== null) {
      return cached;
    }
    
    const flag = this.flags.get(flagId);
    if (!flag) {
      return this.config.defaultEnabled;
    }
    
    const evaluation = this.evaluateFlag(flag, context);
    
    // Cache result
    this.cacheResult(flagId, evaluation.enabled);
    
    // Log evaluation if monitoring enabled
    if (this.config.monitoringEnabled) {
      this.logEvaluation(evaluation);
    }
    
    return evaluation.enabled;
  }
  
  /**
   * Evaluate a feature flag with detailed reasoning
   */
  evaluateFlag(
    flag: FeatureFlag,
    context: Record<string, any>
  ): FlagEvaluation {
    const startTime = Date.now();
    const conditionsMet: string[] = [];
    let enabled = flag.enabled;
    let reason = 'Default state';
    
    // Check dependencies first
    if (flag.dependencies) {
      for (const depId of flag.dependencies) {
        if (!this.isEnabled(depId, context)) {
          return {
            flagId: flag.id,
            enabled: false,
            reason: `Dependency ${depId} is not enabled`,
            evaluationTime: Date.now() - startTime,
            conditions_met: conditionsMet
          };
        }
      }
    }
    
    // Check overrides
    for (const override of flag.overrides || []) {
      if (this.evaluateCondition(override.condition, context)) {
        return {
          flagId: flag.id,
          enabled: override.enabled,
          reason: override.reason,
          evaluationTime: Date.now() - startTime,
          conditions_met: conditionsMet,
          overrideApplied: override.reason
        };
      }
    }
    
    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashContext(context);
      const rolloutEnabled = (hash % 100) < flag.rolloutPercentage;
      if (!rolloutEnabled) {
        return {
          flagId: flag.id,
          enabled: false,
          reason: `Not included in ${flag.rolloutPercentage}% rollout`,
          evaluationTime: Date.now() - startTime,
          conditions_met: conditionsMet
        };
      }
    }
    
    // Evaluate conditions
    if (flag.conditions.length > 0) {
      const results = flag.conditions.map(condition => ({
        condition,
        met: this.evaluateCondition(condition, context)
      }));
      
      if (this.config.evaluationMode === 'strict') {
        // All conditions must be met
        enabled = results.every(r => r.met);
        reason = enabled ? 'All conditions met' : 'Not all conditions met';
      } else {
        // Any condition can enable
        enabled = results.some(r => r.met);
        reason = enabled ? 'At least one condition met' : 'No conditions met';
      }
      
      conditionsMet.push(...results.filter(r => r.met).map(r => 
        `${r.condition.type}:${r.condition.operator}:${r.condition.value}`
      ));
    }
    
    return {
      flagId: flag.id,
      enabled,
      reason,
      evaluationTime: Date.now() - startTime,
      conditions_met: conditionsMet
    };
  }
  
  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: FlagCondition,
    context: Record<string, any>
  ): boolean {
    const contextValue = context[condition.type];
    
    if (contextValue === undefined) {
      return false;
    }
    
    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      
      case 'contains':
        return String(contextValue).includes(String(condition.value));
      
      case 'greater_than':
        return Number(contextValue) > Number(condition.value);
      
      case 'less_than':
        return Number(contextValue) < Number(condition.value);
      
      case 'in':
        return Array.isArray(condition.value) && 
               condition.value.includes(contextValue);
      
      case 'not_in':
        return Array.isArray(condition.value) && 
               !condition.value.includes(contextValue);
      
      default:
        return false;
    }
  }
  
  /**
   * Set rollout percentage for gradual deployment
   */
  setRolloutPercentage(flagId: string, percentage: number): void {
    const flag = this.flags.get(flagId);
    if (!flag) {
      throw new Error(`Flag ${flagId} not found`);
    }
    
    if (percentage < 0 || percentage > 100) {
      throw new Error('Rollout percentage must be between 0 and 100');
    }
    
    flag.rolloutPercentage = percentage;
    flag.metadata.modified = new Date();
    this.clearCache(flagId);
    
    console.log(`Set ${flagId} rollout to ${percentage}%`);
  }
  
  /**
   * Enable feature for specific conditions
   */
  enableForCondition(
    flagId: string,
    condition: FlagCondition,
    reason: string
  ): void {
    const flag = this.flags.get(flagId);
    if (!flag) {
      throw new Error(`Flag ${flagId} not found`);
    }
    
    if (!flag.overrides) {
      flag.overrides = [];
    }
    
    flag.overrides.push({
      condition,
      enabled: true,
      reason
    });
    
    flag.metadata.modified = new Date();
    this.clearCache(flagId);
  }
  
  /**
   * Get rollout status for all Phase 2 features
   */
  getRolloutStatus(): Record<string, {
    enabled: boolean;
    rollout: number;
    dependencies_met: boolean;
  }> {
    const status: Record<string, any> = {};
    
    Object.values(this.FLAGS).forEach(flagId => {
      const flag = this.flags.get(flagId);
      if (flag) {
        const dependenciesMet = !flag.dependencies || 
          flag.dependencies.every(dep => this.flags.get(dep)?.enabled);
        
        status[flagId] = {
          enabled: flag.enabled,
          rollout: flag.rolloutPercentage,
          dependencies_met: dependenciesMet
        };
      }
    });
    
    return status;
  }
  
  /**
   * Create rollout plan for Phase 2
   */
  createRolloutPlan(): Array<{
    week: number;
    flags: Array<{ id: string; percentage: number }>;
    description: string;
  }> {
    return [
      {
        week: 1,
        flags: [
          { id: this.FLAGS.CONTEXT_AWARE_GRADING, percentage: 10 },
          { id: this.FLAGS.PROFILE_SYSTEM, percentage: 10 }
        ],
        description: 'Initial rollout to 10% of users with basic profile system'
      },
      {
        week: 2,
        flags: [
          { id: this.FLAGS.CONTEXT_AWARE_GRADING, percentage: 25 },
          { id: this.FLAGS.PROFILE_SYSTEM, percentage: 25 },
          { id: this.FLAGS.ML_DETECTION, percentage: 10 },
          { id: this.FLAGS.PATTERN_DETECTION, percentage: 10 }
        ],
        description: 'Expand to 25% and introduce ML detection'
      },
      {
        week: 3,
        flags: [
          { id: this.FLAGS.CONTEXT_AWARE_GRADING, percentage: 50 },
          { id: this.FLAGS.PROFILE_SYSTEM, percentage: 50 },
          { id: this.FLAGS.ML_DETECTION, percentage: 25 },
          { id: this.FLAGS.PATTERN_DETECTION, percentage: 25 },
          { id: this.FLAGS.ADAPTIVE_SCORING, percentage: 10 },
          { id: this.FLAGS.BUSINESS_CONTEXT, percentage: 10 }
        ],
        description: 'Half rollout with adaptive scoring and business context'
      },
      {
        week: 4,
        flags: [
          { id: this.FLAGS.CONTEXT_AWARE_GRADING, percentage: 75 },
          { id: this.FLAGS.PROFILE_SYSTEM, percentage: 75 },
          { id: this.FLAGS.ML_DETECTION, percentage: 50 },
          { id: this.FLAGS.PATTERN_DETECTION, percentage: 50 },
          { id: this.FLAGS.ADAPTIVE_SCORING, percentage: 25 },
          { id: this.FLAGS.BUSINESS_CONTEXT, percentage: 25 },
          { id: this.FLAGS.FEEDBACK_COLLECTION, percentage: 10 }
        ],
        description: '75% rollout with feedback collection starting'
      },
      {
        week: 5,
        flags: [
          { id: this.FLAGS.CONTEXT_AWARE_GRADING, percentage: 100 },
          { id: this.FLAGS.PROFILE_SYSTEM, percentage: 100 },
          { id: this.FLAGS.ML_DETECTION, percentage: 75 },
          { id: this.FLAGS.PATTERN_DETECTION, percentage: 75 },
          { id: this.FLAGS.ADAPTIVE_SCORING, percentage: 50 },
          { id: this.FLAGS.BUSINESS_CONTEXT, percentage: 50 },
          { id: this.FLAGS.COMPLIANCE_MAPPING, percentage: 25 },
          { id: this.FLAGS.FEEDBACK_COLLECTION, percentage: 25 }
        ],
        description: 'Full rollout of core features, compliance mapping begins'
      },
      {
        week: 6,
        flags: [
          { id: this.FLAGS.CONTEXT_AWARE_GRADING, percentage: 100 },
          { id: this.FLAGS.PROFILE_SYSTEM, percentage: 100 },
          { id: this.FLAGS.ML_DETECTION, percentage: 100 },
          { id: this.FLAGS.PATTERN_DETECTION, percentage: 100 },
          { id: this.FLAGS.ADAPTIVE_SCORING, percentage: 75 },
          { id: this.FLAGS.BUSINESS_CONTEXT, percentage: 75 },
          { id: this.FLAGS.COMPLIANCE_MAPPING, percentage: 50 },
          { id: this.FLAGS.FEEDBACK_COLLECTION, percentage: 50 },
          { id: this.FLAGS.LEARNING_SYSTEM, percentage: 10 }
        ],
        description: 'Learning system pilot with 10% of users'
      },
      {
        week: 7,
        flags: [
          { id: this.FLAGS.CONTEXT_AWARE_GRADING, percentage: 100 },
          { id: this.FLAGS.PROFILE_SYSTEM, percentage: 100 },
          { id: this.FLAGS.ML_DETECTION, percentage: 100 },
          { id: this.FLAGS.PATTERN_DETECTION, percentage: 100 },
          { id: this.FLAGS.ADAPTIVE_SCORING, percentage: 100 },
          { id: this.FLAGS.BUSINESS_CONTEXT, percentage: 100 },
          { id: this.FLAGS.COMPLIANCE_MAPPING, percentage: 75 },
          { id: this.FLAGS.FEEDBACK_COLLECTION, percentage: 75 },
          { id: this.FLAGS.LEARNING_SYSTEM, percentage: 25 },
          { id: this.FLAGS.WEIGHT_OPTIMIZATION, percentage: 10 }
        ],
        description: 'Near-complete rollout with weight optimization testing'
      },
      {
        week: 8,
        flags: Object.values(this.FLAGS).map(id => ({ id, percentage: 100 })),
        description: 'Full Phase 2 deployment - all features at 100%'
      }
    ];
  }
  
  /**
   * Cache management
   */
  private getCached(flagId: string): boolean | null {
    const cached = this.evaluationCache.get(flagId);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.config.cacheTTL * 1000) {
      this.evaluationCache.delete(flagId);
      return null;
    }
    
    return cached.result;
  }
  
  private cacheResult(flagId: string, result: boolean): void {
    this.evaluationCache.set(flagId, {
      result,
      timestamp: Date.now()
    });
  }
  
  private clearCache(flagId?: string): void {
    if (flagId) {
      this.evaluationCache.delete(flagId);
    } else {
      this.evaluationCache.clear();
    }
  }
  
  /**
   * Hash context for consistent rollout
   */
  private hashContext(context: Record<string, any>): number {
    const str = JSON.stringify(context);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  /**
   * Log evaluation for monitoring
   */
  private logEvaluation(evaluation: FlagEvaluation): void {
    // In production, send to monitoring service
    if (evaluation.evaluationTime > 10) {
      console.warn(`Slow flag evaluation: ${evaluation.flagId} took ${evaluation.evaluationTime}ms`);
    }
  }
  
  /**
   * Export flag configuration
   */
  exportFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }
  
  /**
   * Import flag configuration
   */
  importFlags(flags: FeatureFlag[]): void {
    flags.forEach(flag => this.createFlag(flag));
  }
}