/**
 * Usage Tracker
 * High-performance usage tracking with real-time aggregation
 * Supports millions of events per second with minimal latency
 */

export interface UsageMetric {
  id: string;
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  unit: string;
  aggregation: 'sum' | 'avg' | 'max' | 'min' | 'count' | 'percentile';
  dimensions: string[];
  retention: {
    raw: number; // hours
    hourly: number; // days
    daily: number; // days
    monthly: number; // months
  };
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

export interface UsageEvent {
  tenantId: string;
  metricId: string;
  value: number;
  timestamp: Date;
  dimensions: Map<string, string>;
  metadata?: any;
}

export interface AggregatedUsage {
  tenantId: string;
  metricId: string;
  period: {
    start: Date;
    end: Date;
    granularity: 'minute' | 'hour' | 'day' | 'month';
  };
  values: {
    sum: number;
    avg: number;
    min: number;
    max: number;
    count: number;
    percentiles?: {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
    };
  };
  dimensions: Map<string, Map<string, number>>;
}

export interface UsageQuota {
  tenantId: string;
  metricId: string;
  limit: number;
  period: 'hour' | 'day' | 'month' | 'total';
  used: number;
  remaining: number;
  resetAt: Date;
  enforcement: 'soft' | 'hard';
  overage?: {
    allowed: boolean;
    rate: number;
    hardLimit?: number;
  };
}

export interface UsageReport {
  tenantId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: Map<string, MetricReport>;
  totals: {
    cost: number;
    events: number;
    violations: number;
  };
  trends: Map<string, TrendAnalysis>;
  forecast: Map<string, ForecastData>;
}

export interface MetricReport {
  metricId: string;
  usage: number;
  cost: number;
  quota?: {
    limit: number;
    percentage: number;
  };
  breakdown: Array<{
    dimension: string;
    value: string;
    usage: number;
    percentage: number;
  }>;
}

export interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable';
  changeRate: number; // percentage
  anomalies: Array<{
    timestamp: Date;
    value: number;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export interface ForecastData {
  predictions: Array<{
    date: Date;
    value: number;
    confidence: number;
  }>;
  expectedCost: number;
  quotaExhaustion?: Date;
}

export class UsageTracker {
  private metrics: Map<string, UsageMetric> = new Map();
  private buffer: UsageEvent[] = [];
  private aggregations: Map<string, AggregatedUsage> = new Map();
  private quotas: Map<string, UsageQuota> = new Map();
  private storage: TimeSeriesStorage;
  private processor: StreamProcessor;
  private alertManager: AlertManager;
  
  private config = {
    bufferSize: 10000,
    flushInterval: 1000, // ms
    aggregationWindow: 60000, // ms
    compressionRatio: 10,
    parallelism: 4
  };
  
  constructor(config?: Partial<typeof UsageTracker.prototype.config>) {
    this.config = { ...this.config, ...config };
    this.storage = new TimeSeriesStorage();
    this.processor = new StreamProcessor();
    this.alertManager = new AlertManager();
    
    this.initialize();
  }
  
  /**
   * Initialize usage tracker
   */
  private async initialize(): Promise<void> {
    // Load metric definitions
    await this.loadMetrics();
    
    // Start processing pipeline
    this.startProcessingPipeline();
    
    // Start aggregation workers
    this.startAggregationWorkers();
    
    // Start retention manager
    this.startRetentionManager();
    
    console.log('Usage tracker initialized');
  }
  
  /**
   * Track usage event
   */
  async track(event: UsageEvent): Promise<void> {
    // Validate event
    const metric = this.metrics.get(event.metricId);
    if (!metric) {
      throw new Error(`Unknown metric: ${event.metricId}`);
    }
    
    // Check quota
    const quota = await this.checkQuota(event);
    if (quota && !quota.allowed) {
      throw new Error(`Quota exceeded for ${event.metricId}`);
    }
    
    // Add to buffer
    this.buffer.push(event);
    
    // Process immediately if buffer full
    if (this.buffer.length >= this.config.bufferSize) {
      await this.flush();
    }
    
    // Update real-time counters
    await this.updateRealTimeCounters(event);
    
    // Check alerts
    await this.checkAlerts(event);
  }
  
  /**
   * Track batch of events
   */
  async trackBatch(events: UsageEvent[]): Promise<void> {
    // Validate all events first
    for (const event of events) {
      const metric = this.metrics.get(event.metricId);
      if (!metric) {
        throw new Error(`Unknown metric: ${event.metricId}`);
      }
    }
    
    // Group by tenant for quota checking
    const byTenant = this.groupByTenant(events);
    
    // Check quotas
    for (const [tenantId, tenantEvents] of byTenant) {
      for (const event of tenantEvents) {
        const quota = await this.checkQuota(event);
        if (quota && !quota.allowed) {
          throw new Error(`Quota exceeded for tenant ${tenantId}`);
        }
      }
    }
    
    // Add to buffer
    this.buffer.push(...events);
    
    // Process if needed
    if (this.buffer.length >= this.config.bufferSize) {
      await this.flush();
    }
  }
  
  /**
   * Get usage for period
   */
  async getUsage(
    tenantId: string,
    metricId: string,
    period: { start: Date; end: Date },
    granularity: 'minute' | 'hour' | 'day' | 'month' = 'hour'
  ): Promise<AggregatedUsage[]> {
    // Fetch from storage
    const data = await this.storage.query(
      tenantId,
      metricId,
      period,
      granularity
    );
    
    // Apply aggregation
    return this.aggregateData(data, granularity);
  }
  
  /**
   * Get current usage and quota
   */
  async getCurrentUsage(
    tenantId: string,
    metricId: string
  ): Promise<{
    current: number;
    quota?: UsageQuota;
    trend: TrendAnalysis;
  }> {
    // Get current value
    const current = await this.getCurrentValue(tenantId, metricId);
    
    // Get quota if exists
    const quotaKey = `${tenantId}:${metricId}`;
    const quota = this.quotas.get(quotaKey);
    
    // Calculate trend
    const trend = await this.calculateTrend(tenantId, metricId);
    
    return { current, quota, trend };
  }
  
  /**
   * Set quota for metric
   */
  async setQuota(
    tenantId: string,
    metricId: string,
    limit: number,
    period: 'hour' | 'day' | 'month' | 'total',
    enforcement: 'soft' | 'hard' = 'hard',
    overage?: UsageQuota['overage']
  ): Promise<void> {
    const quota: UsageQuota = {
      tenantId,
      metricId,
      limit,
      period,
      used: await this.getUsedAmount(tenantId, metricId, period),
      remaining: 0,
      resetAt: this.calculateResetTime(period),
      enforcement,
      overage
    };
    
    quota.remaining = Math.max(0, quota.limit - quota.used);
    
    const key = `${tenantId}:${metricId}`;
    this.quotas.set(key, quota);
    
    // Persist quota
    await this.storage.saveQuota(quota);
  }
  
  /**
   * Generate usage report
   */
  async generateReport(
    tenantId: string,
    period: { start: Date; end: Date }
  ): Promise<UsageReport> {
    const metrics = new Map<string, MetricReport>();
    const trends = new Map<string, TrendAnalysis>();
    const forecast = new Map<string, ForecastData>();
    
    // Process each metric
    for (const [metricId, metric] of this.metrics) {
      // Get usage data
      const usage = await this.getUsage(tenantId, metricId, period, 'day');
      
      // Calculate totals
      const total = usage.reduce((sum, u) => sum + u.values.sum, 0);
      
      // Calculate cost
      const cost = await this.calculateCost(tenantId, metricId, total);
      
      // Get quota info
      const quotaKey = `${tenantId}:${metricId}`;
      const quota = this.quotas.get(quotaKey);
      
      // Get breakdown by dimensions
      const breakdown = await this.getDimensionBreakdown(
        tenantId,
        metricId,
        period
      );
      
      metrics.set(metricId, {
        metricId,
        usage: total,
        cost,
        quota: quota ? {
          limit: quota.limit,
          percentage: (total / quota.limit) * 100
        } : undefined,
        breakdown
      });
      
      // Calculate trend
      trends.set(metricId, await this.calculateTrend(tenantId, metricId, period));
      
      // Generate forecast
      forecast.set(metricId, await this.generateForecast(tenantId, metricId, usage));
    }
    
    // Calculate totals
    const totals = {
      cost: Array.from(metrics.values()).reduce((sum, m) => sum + m.cost, 0),
      events: Array.from(metrics.values()).reduce((sum, m) => sum + m.usage, 0),
      violations: await this.countViolations(tenantId, period)
    };
    
    return {
      tenantId,
      period,
      metrics,
      totals,
      trends,
      forecast
    };
  }
  
  /**
   * Export usage data
   */
  async exportUsage(
    tenantId: string,
    period: { start: Date; end: Date },
    format: 'json' | 'csv' | 'parquet'
  ): Promise<Buffer> {
    // Fetch all data
    const data: any[] = [];
    
    for (const [metricId] of this.metrics) {
      const usage = await this.getUsage(tenantId, metricId, period, 'hour');
      
      usage.forEach(u => {
        data.push({
          tenantId,
          metricId,
          timestamp: u.period.start,
          ...u.values,
          dimensions: Object.fromEntries(u.dimensions)
        });
      });
    }
    
    // Convert to requested format
    switch (format) {
      case 'json':
        return Buffer.from(JSON.stringify(data, null, 2));
      
      case 'csv':
        return this.convertToCSV(data);
      
      case 'parquet':
        return this.convertToParquet(data);
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  /**
   * Clean up old data
   */
  async cleanup(before: Date): Promise<number> {
    return this.storage.cleanup(before);
  }
  
  // Private helper methods
  
  private async loadMetrics(): Promise<void> {
    const defaultMetrics: UsageMetric[] = [
      {
        id: 'api_calls',
        name: 'API Calls',
        type: 'counter',
        unit: 'calls',
        aggregation: 'sum',
        dimensions: ['endpoint', 'method', 'status'],
        retention: {
          raw: 24,
          hourly: 7,
          daily: 30,
          monthly: 12
        },
        thresholds: {
          warning: 80,
          critical: 95
        }
      },
      {
        id: 'response_time',
        name: 'Response Time',
        type: 'histogram',
        unit: 'ms',
        aggregation: 'percentile',
        dimensions: ['endpoint', 'method'],
        retention: {
          raw: 6,
          hourly: 3,
          daily: 14,
          monthly: 6
        }
      },
      {
        id: 'storage_used',
        name: 'Storage Used',
        type: 'gauge',
        unit: 'bytes',
        aggregation: 'max',
        dimensions: ['type'],
        retention: {
          raw: 1,
          hourly: 1,
          daily: 30,
          monthly: 12
        }
      },
      {
        id: 'compute_time',
        name: 'Compute Time',
        type: 'counter',
        unit: 'seconds',
        aggregation: 'sum',
        dimensions: ['function', 'region'],
        retention: {
          raw: 12,
          hourly: 3,
          daily: 30,
          monthly: 12
        }
      }
    ];
    
    defaultMetrics.forEach(metric => {
      this.metrics.set(metric.id, metric);
    });
  }
  
  private startProcessingPipeline(): void {
    setInterval(async () => {
      await this.flush();
    }, this.config.flushInterval);
  }
  
  private startAggregationWorkers(): void {
    for (let i = 0; i < this.config.parallelism; i++) {
      this.startAggregationWorker(i);
    }
  }
  
  private startAggregationWorker(workerId: number): void {
    setInterval(async () => {
      await this.processAggregations(workerId);
    }, this.config.aggregationWindow);
  }
  
  private startRetentionManager(): void {
    setInterval(async () => {
      await this.enforceRetention();
    }, 3600000); // Every hour
  }
  
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    // Take events from buffer
    const events = this.buffer.splice(0, this.buffer.length);
    
    // Process in parallel
    const chunks = this.chunkArray(events, Math.ceil(events.length / this.config.parallelism));
    
    await Promise.all(
      chunks.map(chunk => this.processChunk(chunk))
    );
  }
  
  private async processChunk(events: UsageEvent[]): Promise<void> {
    // Group by metric and tenant
    const grouped = this.groupEvents(events);
    
    // Process each group
    for (const [key, groupEvents] of grouped) {
      await this.processEventGroup(key, groupEvents);
    }
  }
  
  private async processEventGroup(
    key: string,
    events: UsageEvent[]
  ): Promise<void> {
    const [tenantId, metricId] = key.split(':');
    const metric = this.metrics.get(metricId);
    if (!metric) return;
    
    // Aggregate based on metric type
    const aggregated = this.aggregateEvents(events, metric);
    
    // Store raw events if within retention
    if (metric.retention.raw > 0) {
      await this.storage.storeRaw(events);
    }
    
    // Store aggregated data
    await this.storage.storeAggregated(aggregated);
    
    // Update quotas
    await this.updateQuotas(tenantId, metricId, aggregated.values.sum);
  }
  
  private aggregateEvents(
    events: UsageEvent[],
    metric: UsageMetric
  ): AggregatedUsage {
    const values = {
      sum: 0,
      avg: 0,
      min: Infinity,
      max: -Infinity,
      count: events.length,
      percentiles: undefined as any
    };
    
    const allValues: number[] = [];
    const dimensions = new Map<string, Map<string, number>>();
    
    events.forEach(event => {
      const value = event.value;
      allValues.push(value);
      
      values.sum += value;
      values.min = Math.min(values.min, value);
      values.max = Math.max(values.max, value);
      
      // Track dimensions
      event.dimensions.forEach((dimValue, dimKey) => {
        if (!dimensions.has(dimKey)) {
          dimensions.set(dimKey, new Map());
        }
        const dimMap = dimensions.get(dimKey)!;
        dimMap.set(dimValue, (dimMap.get(dimValue) || 0) + value);
      });
    });
    
    values.avg = values.sum / values.count;
    
    // Calculate percentiles if needed
    if (metric.type === 'histogram' || metric.type === 'summary') {
      values.percentiles = this.calculatePercentiles(allValues);
    }
    
    return {
      tenantId: events[0].tenantId,
      metricId: events[0].metricId,
      period: {
        start: new Date(Math.min(...events.map(e => e.timestamp.getTime()))),
        end: new Date(Math.max(...events.map(e => e.timestamp.getTime()))),
        granularity: 'minute'
      },
      values,
      dimensions
    };
  }
  
  private calculatePercentiles(values: number[]): any {
    values.sort((a, b) => a - b);
    
    return {
      p50: this.percentile(values, 50),
      p90: this.percentile(values, 90),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99)
    };
  }
  
  private percentile(values: number[], p: number): number {
    const index = Math.ceil((p / 100) * values.length) - 1;
    return values[Math.max(0, index)];
  }
  
  private async processAggregations(workerId: number): Promise<void> {
    // Process different granularities
    await this.aggregateHourly(workerId);
    await this.aggregateDaily(workerId);
    await this.aggregateMonthly(workerId);
  }
  
  private async aggregateHourly(workerId: number): Promise<void> {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3600000);
    
    // Get minute-level data
    const data = await this.storage.getAggregated('minute', hourAgo, now);
    
    // Aggregate to hourly
    const hourly = this.rollupAggregations(data, 'hour');
    
    // Store hourly aggregations
    for (const agg of hourly) {
      await this.storage.storeAggregated(agg);
    }
  }
  
  private async aggregateDaily(workerId: number): Promise<void> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86400000);
    
    // Get hourly data
    const data = await this.storage.getAggregated('hour', dayAgo, now);
    
    // Aggregate to daily
    const daily = this.rollupAggregations(data, 'day');
    
    // Store daily aggregations
    for (const agg of daily) {
      await this.storage.storeAggregated(agg);
    }
  }
  
  private async aggregateMonthly(workerId: number): Promise<void> {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 86400000);
    
    // Get daily data
    const data = await this.storage.getAggregated('day', monthAgo, now);
    
    // Aggregate to monthly
    const monthly = this.rollupAggregations(data, 'month');
    
    // Store monthly aggregations
    for (const agg of monthly) {
      await this.storage.storeAggregated(agg);
    }
  }
  
  private rollupAggregations(
    aggregations: AggregatedUsage[],
    targetGranularity: 'hour' | 'day' | 'month'
  ): AggregatedUsage[] {
    const rolled: Map<string, AggregatedUsage> = new Map();
    
    aggregations.forEach(agg => {
      const key = this.getRollupKey(agg, targetGranularity);
      
      if (!rolled.has(key)) {
        rolled.set(key, {
          ...agg,
          period: {
            ...agg.period,
            granularity: targetGranularity
          }
        });
      } else {
        const existing = rolled.get(key)!;
        
        // Merge values
        existing.values.sum += agg.values.sum;
        existing.values.count += agg.values.count;
        existing.values.min = Math.min(existing.values.min, agg.values.min);
        existing.values.max = Math.max(existing.values.max, agg.values.max);
        existing.values.avg = existing.values.sum / existing.values.count;
        
        // Merge dimensions
        agg.dimensions.forEach((dimValues, dimKey) => {
          if (!existing.dimensions.has(dimKey)) {
            existing.dimensions.set(dimKey, new Map());
          }
          
          const existingDim = existing.dimensions.get(dimKey)!;
          dimValues.forEach((value, key) => {
            existingDim.set(key, (existingDim.get(key) || 0) + value);
          });
        });
      }
    });
    
    return Array.from(rolled.values());
  }
  
  private getRollupKey(
    agg: AggregatedUsage,
    granularity: string
  ): string {
    const date = agg.period.start;
    let key = `${agg.tenantId}:${agg.metricId}:`;
    
    switch (granularity) {
      case 'hour':
        key += `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
        break;
      case 'day':
        key += `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        break;
      case 'month':
        key += `${date.getFullYear()}-${date.getMonth()}`;
        break;
    }
    
    return key;
  }
  
  private async enforceRetention(): Promise<void> {
    const now = new Date();
    
    for (const [metricId, metric] of this.metrics) {
      // Clean raw data
      if (metric.retention.raw > 0) {
        const cutoff = new Date(now.getTime() - metric.retention.raw * 3600000);
        await this.storage.cleanupRaw(metricId, cutoff);
      }
      
      // Clean aggregated data
      const retentions = [
        { granularity: 'minute' as const, hours: metric.retention.raw },
        { granularity: 'hour' as const, hours: metric.retention.hourly * 24 },
        { granularity: 'day' as const, hours: metric.retention.daily * 24 },
        { granularity: 'month' as const, hours: metric.retention.monthly * 30 * 24 }
      ];
      
      for (const { granularity, hours } of retentions) {
        if (hours > 0) {
          const cutoff = new Date(now.getTime() - hours * 3600000);
          await this.storage.cleanupAggregated(metricId, granularity, cutoff);
        }
      }
    }
  }
  
  private async checkQuota(event: UsageEvent): Promise<{ allowed: boolean } | null> {
    const key = `${event.tenantId}:${event.metricId}`;
    const quota = this.quotas.get(key);
    
    if (!quota) return null;
    
    if (quota.remaining <= 0) {
      if (quota.enforcement === 'hard') {
        return { allowed: false };
      }
      
      if (quota.overage?.allowed) {
        const overageUsed = quota.used - quota.limit;
        if (quota.overage.hardLimit && overageUsed >= quota.overage.hardLimit) {
          return { allowed: false };
        }
      }
    }
    
    return { allowed: true };
  }
  
  private async updateRealTimeCounters(event: UsageEvent): Promise<void> {
    // Update in-memory counters for real-time access
    const key = `${event.tenantId}:${event.metricId}`;
    
    // This would typically update Redis or similar
    await this.processor.updateCounter(key, event.value);
  }
  
  private async checkAlerts(event: UsageEvent): Promise<void> {
    const metric = this.metrics.get(event.metricId);
    if (!metric?.thresholds) return;
    
    const current = await this.getCurrentValue(event.tenantId, event.metricId);
    const quota = this.quotas.get(`${event.tenantId}:${event.metricId}`);
    
    if (quota) {
      const percentage = (current / quota.limit) * 100;
      
      if (percentage >= (metric.thresholds.critical || 95)) {
        await this.alertManager.trigger('critical', {
          tenantId: event.tenantId,
          metricId: event.metricId,
          value: current,
          threshold: quota.limit,
          percentage
        });
      } else if (percentage >= (metric.thresholds.warning || 80)) {
        await this.alertManager.trigger('warning', {
          tenantId: event.tenantId,
          metricId: event.metricId,
          value: current,
          threshold: quota.limit,
          percentage
        });
      }
    }
  }
  
  private async updateQuotas(
    tenantId: string,
    metricId: string,
    amount: number
  ): Promise<void> {
    const key = `${tenantId}:${metricId}`;
    const quota = this.quotas.get(key);
    
    if (quota) {
      quota.used += amount;
      quota.remaining = Math.max(0, quota.limit - quota.used);
      
      // Check if reset needed
      if (new Date() >= quota.resetAt) {
        quota.used = amount;
        quota.remaining = Math.max(0, quota.limit - amount);
        quota.resetAt = this.calculateResetTime(quota.period);
      }
    }
  }
  
  private calculateResetTime(period: 'hour' | 'day' | 'month' | 'total'): Date {
    const now = new Date();
    
    switch (period) {
      case 'hour':
        return new Date(now.getTime() + 3600000);
      case 'day':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;
      case 'month':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);
        return nextMonth;
      case 'total':
        return new Date(9999, 11, 31); // Never resets
    }
  }
  
  private async getCurrentValue(
    tenantId: string,
    metricId: string
  ): Promise<number> {
    const key = `${tenantId}:${metricId}`;
    return this.processor.getCounter(key);
  }
  
  private async getUsedAmount(
    tenantId: string,
    metricId: string,
    period: string
  ): Promise<number> {
    const now = new Date();
    let start: Date;
    
    switch (period) {
      case 'hour':
        start = new Date(now.getTime() - 3600000);
        break;
      case 'day':
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        break;
      case 'month':
        start = new Date(now);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      default:
        start = new Date(0);
    }
    
    const usage = await this.getUsage(tenantId, metricId, { start, end: now });
    return usage.reduce((sum, u) => sum + u.values.sum, 0);
  }
  
  private aggregateData(
    data: any[],
    granularity: string
  ): AggregatedUsage[] {
    // Implementation of data aggregation
    return data;
  }
  
  private groupByTenant(events: UsageEvent[]): Map<string, UsageEvent[]> {
    const grouped = new Map<string, UsageEvent[]>();
    
    events.forEach(event => {
      if (!grouped.has(event.tenantId)) {
        grouped.set(event.tenantId, []);
      }
      grouped.get(event.tenantId)!.push(event);
    });
    
    return grouped;
  }
  
  private groupEvents(events: UsageEvent[]): Map<string, UsageEvent[]> {
    const grouped = new Map<string, UsageEvent[]>();
    
    events.forEach(event => {
      const key = `${event.tenantId}:${event.metricId}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(event);
    });
    
    return grouped;
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  private async calculateTrend(
    tenantId: string,
    metricId: string,
    period?: { start: Date; end: Date }
  ): Promise<TrendAnalysis> {
    const p = period || {
      start: new Date(Date.now() - 7 * 86400000),
      end: new Date()
    };
    
    const usage = await this.getUsage(tenantId, metricId, p, 'day');
    
    if (usage.length < 2) {
      return {
        direction: 'stable',
        changeRate: 0,
        anomalies: []
      };
    }
    
    // Calculate trend
    const firstHalf = usage.slice(0, Math.floor(usage.length / 2));
    const secondHalf = usage.slice(Math.floor(usage.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, u) => sum + u.values.sum, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, u) => sum + u.values.sum, 0) / secondHalf.length;
    
    const changeRate = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    let direction: TrendAnalysis['direction'];
    if (Math.abs(changeRate) < 5) {
      direction = 'stable';
    } else if (changeRate > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }
    
    // Detect anomalies
    const anomalies = this.detectAnomalies(usage);
    
    return {
      direction,
      changeRate,
      anomalies
    };
  }
  
  private detectAnomalies(usage: AggregatedUsage[]): TrendAnalysis['anomalies'] {
    const anomalies: TrendAnalysis['anomalies'] = [];
    
    // Calculate statistics
    const values = usage.map(u => u.values.sum);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );
    
    // Detect outliers (3 sigma)
    usage.forEach(u => {
      const deviation = Math.abs(u.values.sum - mean);
      if (deviation > 3 * stdDev) {
        anomalies.push({
          timestamp: u.period.start,
          value: u.values.sum,
          severity: deviation > 4 * stdDev ? 'high' : 'medium'
        });
      }
    });
    
    return anomalies;
  }
  
  private async calculateCost(
    tenantId: string,
    metricId: string,
    usage: number
  ): Promise<number> {
    // Simplified cost calculation
    const rates: Record<string, number> = {
      api_calls: 0.0001,
      storage_used: 0.02,
      compute_time: 0.05,
      response_time: 0
    };
    
    return usage * (rates[metricId] || 0);
  }
  
  private async getDimensionBreakdown(
    tenantId: string,
    metricId: string,
    period: { start: Date; end: Date }
  ): Promise<MetricReport['breakdown']> {
    const usage = await this.getUsage(tenantId, metricId, period);
    const breakdown: MetricReport['breakdown'] = [];
    
    // Aggregate by dimensions
    const dimensionTotals = new Map<string, number>();
    
    usage.forEach(u => {
      u.dimensions.forEach((values, dimension) => {
        values.forEach((value, key) => {
          const dimKey = `${dimension}:${key}`;
          dimensionTotals.set(dimKey, (dimensionTotals.get(dimKey) || 0) + value);
        });
      });
    });
    
    // Calculate percentages
    const total = Array.from(dimensionTotals.values()).reduce((sum, v) => sum + v, 0);
    
    dimensionTotals.forEach((value, key) => {
      const [dimension, dimValue] = key.split(':');
      breakdown.push({
        dimension,
        value: dimValue,
        usage: value,
        percentage: (value / total) * 100
      });
    });
    
    return breakdown.sort((a, b) => b.usage - a.usage);
  }
  
  private async generateForecast(
    tenantId: string,
    metricId: string,
    historicalUsage: AggregatedUsage[]
  ): Promise<ForecastData> {
    // Simple linear regression forecast
    const values = historicalUsage.map(u => u.values.sum);
    
    if (values.length < 2) {
      return {
        predictions: [],
        expectedCost: 0
      };
    }
    
    // Calculate trend
    const n = values.length;
    const sumX = n * (n - 1) / 2;
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Generate predictions
    const predictions: ForecastData['predictions'] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i + 1);
      
      const value = intercept + slope * (n + i);
      predictions.push({
        date,
        value: Math.max(0, value),
        confidence: Math.max(0, 1 - (i * 0.1))
      });
    }
    
    // Calculate expected cost
    const totalPredicted = predictions.reduce((sum, p) => sum + p.value, 0);
    const expectedCost = await this.calculateCost(tenantId, metricId, totalPredicted);
    
    // Check for quota exhaustion
    const quota = this.quotas.get(`${tenantId}:${metricId}`);
    let quotaExhaustion: Date | undefined;
    
    if (quota) {
      const dailyRate = slope;
      const daysUntilExhaustion = (quota.limit - quota.used) / dailyRate;
      
      if (daysUntilExhaustion > 0 && daysUntilExhaustion < 30) {
        quotaExhaustion = new Date();
        quotaExhaustion.setDate(quotaExhaustion.getDate() + Math.floor(daysUntilExhaustion));
      }
    }
    
    return {
      predictions,
      expectedCost,
      quotaExhaustion
    };
  }
  
  private async countViolations(
    tenantId: string,
    period: { start: Date; end: Date }
  ): Promise<number> {
    // Count quota violations in period
    return 0; // Simplified
  }
  
  private convertToCSV(data: any[]): Buffer {
    if (data.length === 0) return Buffer.from('');
    
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => JSON.stringify(row[h] ?? '')).join(',')
      )
    ].join('\n');
    
    return Buffer.from(csv);
  }
  
  private convertToParquet(data: any[]): Buffer {
    // Simplified - would use parquet library
    return Buffer.from(JSON.stringify(data));
  }
}

// Supporting classes

class TimeSeriesStorage {
  async storeRaw(events: UsageEvent[]): Promise<void> {
    // Store raw events
  }
  
  async storeAggregated(aggregation: AggregatedUsage): Promise<void> {
    // Store aggregated data
  }
  
  async query(
    tenantId: string,
    metricId: string,
    period: { start: Date; end: Date },
    granularity: string
  ): Promise<any[]> {
    return [];
  }
  
  async getAggregated(
    granularity: string,
    start: Date,
    end: Date
  ): Promise<AggregatedUsage[]> {
    return [];
  }
  
  async saveQuota(quota: UsageQuota): Promise<void> {
    // Save quota
  }
  
  async cleanupRaw(metricId: string, before: Date): Promise<void> {
    // Cleanup raw data
  }
  
  async cleanupAggregated(
    metricId: string,
    granularity: 'minute' | 'hour' | 'day' | 'month',
    before: Date
  ): Promise<void> {
    // Cleanup aggregated data
  }
  
  async cleanup(before: Date): Promise<number> {
    return 0;
  }
}

class StreamProcessor {
  private counters: Map<string, number> = new Map();
  
  async updateCounter(key: string, value: number): Promise<void> {
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }
  
  async getCounter(key: string): Promise<number> {
    return this.counters.get(key) || 0;
  }
}

class AlertManager {
  async trigger(severity: string, data: any): Promise<void> {
    console.log(`Alert [${severity}]:`, data);
  }
}