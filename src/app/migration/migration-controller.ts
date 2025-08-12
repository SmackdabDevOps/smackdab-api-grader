/**
 * Migration Controller
 * Orchestrates Phase 2 deployment with monitoring and rollback capabilities
 */

import { FeatureFlagManager } from './feature-flags';

export interface MigrationConfig {
  environment: 'development' | 'staging' | 'production';
  rollbackThreshold: {
    errorRate: number; // Percentage
    performanceDegradation: number; // Percentage
    userComplaints: number; // Count
  };
  monitoring: {
    interval: number; // Seconds
    metricsWindow: number; // Seconds
    alerting: boolean;
  };
  canary: {
    enabled: boolean;
    percentage: number;
    duration: number; // Hours
  };
}

export interface MigrationState {
  id: string;
  phase: 'planning' | 'canary' | 'rolling' | 'completed' | 'rolled_back';
  startTime: Date;
  currentWeek: number;
  metrics: MigrationMetrics;
  issues: MigrationIssue[];
  rollbacks: RollbackEvent[];
}

export interface MigrationMetrics {
  errorRate: number;
  performance: {
    p50: number;
    p95: number;
    p99: number;
  };
  userSatisfaction: number;
  apiCoverage: {
    total: number;
    contextAware: number;
    legacy: number;
  };
  detectionAccuracy: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface MigrationIssue {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'performance' | 'accuracy' | 'error' | 'user_feedback';
  description: string;
  affected: string[];
  resolved: boolean;
}

export interface RollbackEvent {
  timestamp: Date;
  reason: string;
  affectedFlags: string[];
  previousState: Record<string, number>;
  newState: Record<string, number>;
  automatic: boolean;
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  details: Record<string, any>;
}

export class MigrationController {
  private flagManager: FeatureFlagManager;
  private config: MigrationConfig;
  private state: MigrationState;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private monitoringTimer?: NodeJS.Timeout;
  private canaryTimer?: NodeJS.Timeout;
  
  // Rollback thresholds
  private readonly CRITICAL_ERROR_RATE = 0.05; // 5%
  private readonly CRITICAL_PERFORMANCE_DEGRADATION = 0.5; // 50% slower
  private readonly CRITICAL_USER_COMPLAINTS = 10;
  
  constructor(
    flagManager: FeatureFlagManager,
    config: Partial<MigrationConfig> = {}
  ) {
    this.flagManager = flagManager;
    this.config = {
      environment: 'development',
      rollbackThreshold: {
        errorRate: 5,
        performanceDegradation: 30,
        userComplaints: 5
      },
      monitoring: {
        interval: 60,
        metricsWindow: 300,
        alerting: true
      },
      canary: {
        enabled: true,
        percentage: 5,
        duration: 24
      },
      ...config
    };
    
    this.state = this.initializeState();
    this.initializeHealthChecks();
  }
  
  /**
   * Start migration process
   */
  async startMigration(): Promise<void> {
    console.log('🚀 Starting Phase 2 Migration');
    console.log(`Environment: ${this.config.environment}`);
    
    // Validate prerequisites
    const validation = await this.validatePrerequisites();
    if (!validation.success) {
      throw new Error(`Prerequisites not met: ${validation.errors.join(', ')}`);
    }
    
    // Start with canary if enabled
    if (this.config.canary.enabled) {
      await this.startCanaryDeployment();
    } else {
      await this.startRollingDeployment();
    }
    
    // Start monitoring
    this.startMonitoring();
  }
  
  /**
   * Validate prerequisites before migration
   */
  private async validatePrerequisites(): Promise<{
    success: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    // Check system health
    const health = await this.checkSystemHealth();
    if (health.some(h => h.status === 'unhealthy')) {
      errors.push('System health checks failed');
    }
    
    // Check database migrations
    // In real implementation, check if DB schema is ready
    
    // Check dependencies
    const rolloutStatus = this.flagManager.getRolloutStatus();
    Object.entries(rolloutStatus).forEach(([flag, status]) => {
      if (!status.dependencies_met) {
        errors.push(`Flag ${flag} has unmet dependencies`);
      }
    });
    
    // Check monitoring
    if (this.config.monitoring.alerting && !this.isMonitoringConfigured()) {
      errors.push('Monitoring/alerting not configured');
    }
    
    return {
      success: errors.length === 0,
      errors
    };
  }
  
  /**
   * Start canary deployment
   */
  private async startCanaryDeployment(): Promise<void> {
    console.log(`🐤 Starting canary deployment (${this.config.canary.percentage}%)`);
    this.state.phase = 'canary';
    
    // Enable features for canary percentage
    this.flagManager.setRolloutPercentage(
      this.flagManager.FLAGS.CONTEXT_AWARE_GRADING,
      this.config.canary.percentage
    );
    
    // Monitor canary for specified duration
    this.canaryTimer = setTimeout(async () => {
      const canaryMetrics = await this.collectMetrics();
      
      if (this.shouldRollback(canaryMetrics)) {
        console.log('❌ Canary failed, rolling back');
        await this.rollback('Canary metrics below threshold');
      } else {
        console.log('✅ Canary successful, proceeding with rollout');
        await this.startRollingDeployment();
      }
    }, this.config.canary.duration * 60 * 60 * 1000);
  }
  
  /**
   * Start rolling deployment
   */
  private async startRollingDeployment(): Promise<void> {
    console.log('📈 Starting rolling deployment');
    this.state.phase = 'rolling';
    
    const rolloutPlan = this.flagManager.createRolloutPlan();
    
    for (const week of rolloutPlan) {
      if (this.state.phase === 'rolled_back') {
        console.log('Migration rolled back, stopping deployment');
        break;
      }
      
      console.log(`Week ${week.week}: ${week.description}`);
      this.state.currentWeek = week.week;
      
      // Apply flag changes
      for (const flagUpdate of week.flags) {
        this.flagManager.setRolloutPercentage(flagUpdate.id, flagUpdate.percentage);
        
        // Wait and monitor after each change
        await this.waitAndMonitor(60); // 1 minute monitoring after each change
      }
      
      // Collect metrics after week deployment
      const weekMetrics = await this.collectMetrics();
      
      // Check if rollback needed
      if (this.shouldRollback(weekMetrics)) {
        await this.rollback(`Week ${week.week} metrics below threshold`);
        break;
      }
      
      // Log week success
      console.log(`✅ Week ${week.week} deployment successful`);
      
      // In production, wait actual week
      if (this.config.environment === 'production') {
        await this.waitForNextWeek();
      } else {
        // In dev/staging, just wait briefly
        await this.sleep(5000);
      }
    }
    
    if (this.state.phase !== 'rolled_back') {
      this.state.phase = 'completed';
      console.log('🎉 Phase 2 migration completed successfully!');
    }
  }
  
  /**
   * Start continuous monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    this.monitoringTimer = setInterval(async () => {
      const metrics = await this.collectMetrics();
      this.state.metrics = metrics;
      
      // Check for issues
      const issues = this.detectIssues(metrics);
      this.state.issues.push(...issues);
      
      // Check if automatic rollback needed
      if (this.shouldAutoRollback(metrics)) {
        await this.rollback('Automatic rollback triggered by metrics');
      }
      
      // Send alerts if needed
      if (this.config.monitoring.alerting) {
        this.sendAlerts(issues);
      }
      
      // Log metrics
      this.logMetrics(metrics);
      
    }, this.config.monitoring.interval * 1000);
  }
  
  /**
   * Collect current metrics
   */
  private async collectMetrics(): Promise<MigrationMetrics> {
    // In real implementation, collect from monitoring systems
    return {
      errorRate: Math.random() * 0.02, // 0-2% error rate
      performance: {
        p50: 50 + Math.random() * 20,
        p95: 200 + Math.random() * 50,
        p99: 500 + Math.random() * 100
      },
      userSatisfaction: 0.7 + Math.random() * 0.3, // 70-100%
      apiCoverage: {
        total: 1000,
        contextAware: Math.floor(500 + Math.random() * 500),
        legacy: Math.floor(Math.random() * 500)
      },
      detectionAccuracy: 0.85 + Math.random() * 0.15, // 85-100%
      falsePositives: Math.floor(Math.random() * 10),
      falseNegatives: Math.floor(Math.random() * 10)
    };
  }
  
  /**
   * Detect issues from metrics
   */
  private detectIssues(metrics: MigrationMetrics): MigrationIssue[] {
    const issues: MigrationIssue[] = [];
    
    // Check error rate
    if (metrics.errorRate > this.config.rollbackThreshold.errorRate / 100) {
      issues.push({
        id: `issue-${Date.now()}-error`,
        timestamp: new Date(),
        severity: 'high',
        type: 'error',
        description: `Error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds threshold`,
        affected: ['all'],
        resolved: false
      });
    }
    
    // Check performance
    if (metrics.performance.p95 > 300) {
      issues.push({
        id: `issue-${Date.now()}-perf`,
        timestamp: new Date(),
        severity: 'medium',
        type: 'performance',
        description: `P95 latency ${metrics.performance.p95}ms is high`,
        affected: ['grading-pipeline'],
        resolved: false
      });
    }
    
    // Check detection accuracy
    if (metrics.detectionAccuracy < 0.9) {
      issues.push({
        id: `issue-${Date.now()}-accuracy`,
        timestamp: new Date(),
        severity: 'medium',
        type: 'accuracy',
        description: `Detection accuracy ${(metrics.detectionAccuracy * 100).toFixed(1)}% below target`,
        affected: ['ml-detection'],
        resolved: false
      });
    }
    
    // Check user satisfaction
    if (metrics.userSatisfaction < 0.75) {
      issues.push({
        id: `issue-${Date.now()}-satisfaction`,
        timestamp: new Date(),
        severity: 'high',
        type: 'user_feedback',
        description: `User satisfaction ${(metrics.userSatisfaction * 100).toFixed(1)}% is low`,
        affected: ['user-experience'],
        resolved: false
      });
    }
    
    return issues;
  }
  
  /**
   * Check if rollback is needed
   */
  private shouldRollback(metrics: MigrationMetrics): boolean {
    return (
      metrics.errorRate > this.config.rollbackThreshold.errorRate / 100 ||
      metrics.userSatisfaction < 0.6 ||
      metrics.detectionAccuracy < 0.8
    );
  }
  
  /**
   * Check if automatic rollback should trigger
   */
  private shouldAutoRollback(metrics: MigrationMetrics): boolean {
    const criticalIssues = this.state.issues.filter(
      i => i.severity === 'critical' && !i.resolved
    );
    
    return (
      metrics.errorRate > this.CRITICAL_ERROR_RATE ||
      criticalIssues.length > 0 ||
      this.state.issues.filter(i => i.type === 'user_feedback' && !i.resolved).length > 
        this.config.rollbackThreshold.userComplaints
    );
  }
  
  /**
   * Execute rollback
   */
  async rollback(reason: string): Promise<void> {
    console.log(`⚠️ Initiating rollback: ${reason}`);
    
    // Capture current state
    const currentState = this.flagManager.getRolloutStatus();
    const previousState: Record<string, number> = {};
    const newState: Record<string, number> = {};
    
    // Disable all Phase 2 features
    Object.values(this.flagManager.FLAGS).forEach(flagId => {
      const status = currentState[flagId];
      if (status) {
        previousState[flagId] = status.rollout;
        newState[flagId] = 0;
        this.flagManager.setRolloutPercentage(flagId, 0);
      }
    });
    
    // Record rollback event
    this.state.rollbacks.push({
      timestamp: new Date(),
      reason,
      affectedFlags: Object.keys(previousState),
      previousState,
      newState,
      automatic: true
    });
    
    this.state.phase = 'rolled_back';
    
    // Stop timers
    if (this.canaryTimer) {
      clearTimeout(this.canaryTimer);
    }
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    console.log('✅ Rollback completed');
    
    // Send alerts
    if (this.config.monitoring.alerting) {
      this.sendRollbackAlert(reason);
    }
  }
  
  /**
   * Check system health
   */
  private async checkSystemHealth(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    
    // Database health
    checks.push({
      name: 'database',
      status: 'healthy', // In real implementation, actually check DB
      lastCheck: new Date(),
      details: { connections: 10, latency: 5 }
    });
    
    // API health
    checks.push({
      name: 'api',
      status: 'healthy',
      lastCheck: new Date(),
      details: { uptime: 99.9, requests: 1000 }
    });
    
    // ML model health
    checks.push({
      name: 'ml-model',
      status: 'healthy',
      lastCheck: new Date(),
      details: { loaded: true, version: 1 }
    });
    
    // Cache health
    checks.push({
      name: 'cache',
      status: 'healthy',
      lastCheck: new Date(),
      details: { hitRate: 0.85, memory: '100MB' }
    });
    
    // Update health checks map
    checks.forEach(check => {
      this.healthChecks.set(check.name, check);
    });
    
    return checks;
  }
  
  /**
   * Initialize health checks
   */
  private initializeHealthChecks(): void {
    const components = ['database', 'api', 'ml-model', 'cache', 'monitoring'];
    
    components.forEach(component => {
      this.healthChecks.set(component, {
        name: component,
        status: 'healthy',
        lastCheck: new Date(),
        details: {}
      });
    });
  }
  
  /**
   * Initialize migration state
   */
  private initializeState(): MigrationState {
    return {
      id: `migration-${Date.now()}`,
      phase: 'planning',
      startTime: new Date(),
      currentWeek: 0,
      metrics: {
        errorRate: 0,
        performance: { p50: 0, p95: 0, p99: 0 },
        userSatisfaction: 1,
        apiCoverage: { total: 0, contextAware: 0, legacy: 0 },
        detectionAccuracy: 1,
        falsePositives: 0,
        falseNegatives: 0
      },
      issues: [],
      rollbacks: []
    };
  }
  
  /**
   * Check if monitoring is configured
   */
  private isMonitoringConfigured(): boolean {
    // In real implementation, check if monitoring services are configured
    return true;
  }
  
  /**
   * Wait and monitor for specified seconds
   */
  private async waitAndMonitor(seconds: number): Promise<void> {
    const endTime = Date.now() + seconds * 1000;
    
    while (Date.now() < endTime) {
      const metrics = await this.collectMetrics();
      
      if (this.shouldAutoRollback(metrics)) {
        throw new Error('Metrics indicate immediate rollback needed');
      }
      
      await this.sleep(5000); // Check every 5 seconds
    }
  }
  
  /**
   * Wait for next week (in production)
   */
  private async waitForNextWeek(): Promise<void> {
    // In production, actually wait a week
    // For now, just log
    console.log('Waiting for next week deployment window...');
    await this.sleep(1000);
  }
  
  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Log metrics
   */
  private logMetrics(metrics: MigrationMetrics): void {
    // In production, send to metrics service
    console.log('📊 Current Metrics:', {
      errorRate: `${(metrics.errorRate * 100).toFixed(2)}%`,
      p95Latency: `${metrics.performance.p95.toFixed(0)}ms`,
      satisfaction: `${(metrics.userSatisfaction * 100).toFixed(1)}%`,
      accuracy: `${(metrics.detectionAccuracy * 100).toFixed(1)}%`
    });
  }
  
  /**
   * Send alerts for issues
   */
  private sendAlerts(issues: MigrationIssue[]): void {
    issues.forEach(issue => {
      if (issue.severity === 'critical' || issue.severity === 'high') {
        console.error(`🚨 ALERT: ${issue.description}`);
        // In production, send to alerting service
      }
    });
  }
  
  /**
   * Send rollback alert
   */
  private sendRollbackAlert(reason: string): void {
    console.error(`🚨 ROLLBACK ALERT: ${reason}`);
    // In production, send critical alert to ops team
  }
  
  /**
   * Get migration status report
   */
  getMigrationStatus(): string {
    const lines: string[] = [
      '╔════════════════════════════════════════════════════════════╗',
      '║              Phase 2 Migration Status                       ║',
      '╚════════════════════════════════════════════════════════════╝',
      '',
      `Migration ID: ${this.state.id}`,
      `Phase: ${this.state.phase.toUpperCase()}`,
      `Current Week: ${this.state.currentWeek}/8`,
      `Started: ${this.state.startTime.toLocaleString()}`,
      '',
      '📊 Current Metrics',
      '─────────────────────────────────────────',
      `Error Rate: ${(this.state.metrics.errorRate * 100).toFixed(2)}%`,
      `P95 Latency: ${this.state.metrics.performance.p95.toFixed(0)}ms`,
      `User Satisfaction: ${(this.state.metrics.userSatisfaction * 100).toFixed(1)}%`,
      `Detection Accuracy: ${(this.state.metrics.detectionAccuracy * 100).toFixed(1)}%`,
      `API Coverage: ${this.state.metrics.apiCoverage.contextAware}/${this.state.metrics.apiCoverage.total}`,
      '',
      '⚠️ Active Issues',
      '─────────────────────────────────────────'
    ];
    
    const activeIssues = this.state.issues.filter(i => !i.resolved);
    if (activeIssues.length === 0) {
      lines.push('No active issues');
    } else {
      activeIssues.forEach(issue => {
        lines.push(`[${issue.severity.toUpperCase()}] ${issue.description}`);
      });
    }
    
    lines.push('');
    lines.push('🏥 System Health');
    lines.push('─────────────────────────────────────────');
    
    this.healthChecks.forEach(check => {
      const status = check.status === 'healthy' ? '✅' :
                    check.status === 'degraded' ? '⚠️' : '❌';
      lines.push(`${status} ${check.name}: ${check.status}`);
    });
    
    if (this.state.rollbacks.length > 0) {
      lines.push('');
      lines.push('↩️ Rollback History');
      lines.push('─────────────────────────────────────────');
      this.state.rollbacks.forEach(rollback => {
        lines.push(`${rollback.timestamp.toLocaleString()}: ${rollback.reason}`);
      });
    }
    
    lines.push('');
    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push(`║ Environment: ${this.config.environment.toUpperCase().padEnd(47)} ║`);
    lines.push('╚════════════════════════════════════════════════════════════╝');
    
    return lines.join('\\n');
  }
}