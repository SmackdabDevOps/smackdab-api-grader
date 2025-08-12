/**
 * Trend Analysis System
 * Analyzes API quality trends over time with predictive analytics
 * Provides industry benchmarks and peer comparisons
 */

export interface TrendConfig {
  timeRanges: {
    realtime: number;      // minutes
    hourly: number;        // hours
    daily: number;         // days
    weekly: number;        // weeks
    monthly: number;       // months
  };
  aggregations: {
    functions: ('avg' | 'sum' | 'min' | 'max' | 'p50' | 'p95' | 'p99')[];
    groupBy: string[];
    rollups: boolean;
  };
  forecasting: {
    enabled: boolean;
    models: ('arima' | 'prophet' | 'lstm' | 'exponential')[];
    horizonDays: number;
    confidenceLevel: number;
  };
  benchmarking: {
    enabled: boolean;
    industries: string[];
    peerGroups: Map<string, string[]>;
    updateFrequency: number; // hours
  };
  alerts: {
    enabled: boolean;
    thresholds: Map<string, AlertThreshold>;
    channels: ('email' | 'slack' | 'webhook' | 'sms')[];
  };
}

export interface AlertThreshold {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number;
  duration: number; // consecutive periods
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface TrendData {
  metric: string;
  timestamp: Date;
  value: number;
  dimensions: Map<string, string>;
  metadata: {
    apiId?: string;
    apiType?: string;
    organization?: string;
    region?: string;
    version?: string;
  };
}

export interface TrendAnalysis {
  metric: string;
  period: string;
  current: {
    value: number;
    timestamp: Date;
    percentile: number;
  };
  historical: {
    avg: number;
    min: number;
    max: number;
    stdDev: number;
    trend: 'improving' | 'stable' | 'declining';
    trendStrength: number; // 0-1
  };
  forecast?: {
    predictions: TimeSeries;
    confidence: [number, number][];
    accuracy: number;
    model: string;
  };
  benchmark?: {
    industry: number;
    percentile: number;
    leaders: string[];
    gap: number;
  };
  anomalies: AnomalyPoint[];
  insights: Insight[];
}

export interface TimeSeries {
  timestamps: Date[];
  values: number[];
  labels?: string[];
}

export interface AnomalyPoint {
  timestamp: Date;
  value: number;
  expected: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  type: 'spike' | 'dip' | 'gradual' | 'pattern';
}

export interface Insight {
  type: 'trend' | 'correlation' | 'seasonality' | 'forecast' | 'benchmark';
  title: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  confidence: number;
  recommendations: string[];
  relatedMetrics: string[];
}

export interface IndustryBenchmark {
  industry: string;
  metrics: Map<string, BenchmarkStats>;
  lastUpdated: Date;
  sampleSize: number;
  topPerformers: string[];
}

export interface BenchmarkStats {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  leaders: Array<{ org: string; value: number }>;
}

export class TrendAnalyzer {
  private config: TrendConfig;
  private dataStore: Map<string, TrendData[]> = new Map();
  private aggregateCache: Map<string, any> = new Map();
  private forecastModels: Map<string, any> = new Map();
  private benchmarks: Map<string, IndustryBenchmark> = new Map();
  private alertState: Map<string, AlertState> = new Map();
  private updateTimer?: NodeJS.Timeout;
  
  constructor(config?: Partial<TrendConfig>) {
    this.config = {
      timeRanges: {
        realtime: 5,
        hourly: 24,
        daily: 30,
        weekly: 12,
        monthly: 12
      },
      aggregations: {
        functions: ['avg', 'min', 'max', 'p50', 'p95', 'p99'],
        groupBy: ['apiType', 'organization', 'region'],
        rollups: true
      },
      forecasting: {
        enabled: true,
        models: ['arima', 'prophet', 'exponential'],
        horizonDays: 7,
        confidenceLevel: 0.95
      },
      benchmarking: {
        enabled: true,
        industries: ['technology', 'finance', 'healthcare', 'retail', 'government'],
        peerGroups: new Map(),
        updateFrequency: 24
      },
      alerts: {
        enabled: true,
        thresholds: new Map(),
        channels: ['email', 'slack']
      },
      ...config
    };
    
    this.initialize();
  }
  
  /**
   * Initialize trend analyzer
   */
  private async initialize(): Promise<void> {
    // Load historical data
    await this.loadHistoricalData();
    
    // Initialize forecast models
    if (this.config.forecasting.enabled) {
      await this.initializeForecastModels();
    }
    
    // Load industry benchmarks
    if (this.config.benchmarking.enabled) {
      await this.loadBenchmarks();
    }
    
    // Start update cycle
    this.startUpdateCycle();
    
    console.log('Trend analyzer initialized');
  }
  
  /**
   * Record metric data point
   */
  async recordMetric(
    metric: string,
    value: number,
    metadata?: any
  ): Promise<void> {
    const dataPoint: TrendData = {
      metric,
      timestamp: new Date(),
      value,
      dimensions: this.extractDimensions(metadata),
      metadata
    };
    
    // Store data point
    const series = this.dataStore.get(metric) || [];
    series.push(dataPoint);
    
    // Keep sliding window
    const maxPoints = 10000;
    if (series.length > maxPoints) {
      series.splice(0, series.length - maxPoints);
    }
    
    this.dataStore.set(metric, series);
    
    // Check alerts
    if (this.config.alerts.enabled) {
      await this.checkAlerts(metric, value);
    }
    
    // Invalidate cache
    this.invalidateCache(metric);
  }
  
  /**
   * Analyze trends for a metric
   */
  async analyzeTrend(
    metric: string,
    timeRange: keyof TrendConfig['timeRanges'],
    dimensions?: Map<string, string>
  ): Promise<TrendAnalysis> {
    // Get data for time range
    const data = this.getDataForTimeRange(metric, timeRange, dimensions);
    
    if (data.length === 0) {
      throw new Error(`No data available for metric ${metric}`);
    }
    
    // Calculate statistics
    const stats = this.calculateStatistics(data);
    
    // Detect trend
    const trend = this.detectTrend(data);
    
    // Generate forecast
    let forecast;
    if (this.config.forecasting.enabled && data.length > 10) {
      forecast = await this.generateForecast(data);
    }
    
    // Get benchmark
    let benchmark;
    if (this.config.benchmarking.enabled) {
      benchmark = this.getBenchmark(metric, stats.current);
    }
    
    // Detect anomalies
    const anomalies = this.detectAnomalies(data);
    
    // Generate insights
    const insights = this.generateInsights({
      metric,
      stats,
      trend,
      forecast,
      benchmark,
      anomalies
    });
    
    return {
      metric,
      period: timeRange,
      current: {
        value: stats.current,
        timestamp: new Date(),
        percentile: stats.percentile
      },
      historical: {
        avg: stats.avg,
        min: stats.min,
        max: stats.max,
        stdDev: stats.stdDev,
        trend: trend.direction,
        trendStrength: trend.strength
      },
      forecast,
      benchmark,
      anomalies,
      insights
    };
  }
  
  /**
   * Compare metrics across dimensions
   */
  async compareMetrics(
    metrics: string[],
    timeRange: keyof TrendConfig['timeRanges'],
    groupBy?: string
  ): Promise<{
    comparison: Map<string, any>;
    correlations: Map<string, number>;
    insights: Insight[];
  }> {
    const comparison = new Map<string, any>();
    const correlations = new Map<string, number>();
    
    // Get data for each metric
    const metricData = new Map<string, TrendData[]>();
    for (const metric of metrics) {
      metricData.set(metric, this.getDataForTimeRange(metric, timeRange));
    }
    
    // Group by dimension if specified
    if (groupBy) {
      const grouped = this.groupByDimension(metricData, groupBy);
      comparison.set('grouped', grouped);
    } else {
      // Direct comparison
      metricData.forEach((data, metric) => {
        comparison.set(metric, this.calculateStatistics(data));
      });
    }
    
    // Calculate correlations
    for (let i = 0; i < metrics.length; i++) {
      for (let j = i + 1; j < metrics.length; j++) {
        const correlation = this.calculateCorrelation(
          metricData.get(metrics[i])!,
          metricData.get(metrics[j])!
        );
        correlations.set(`${metrics[i]}_${metrics[j]}`, correlation);
      }
    }
    
    // Generate comparative insights
    const insights = this.generateComparativeInsights(
      comparison,
      correlations
    );
    
    return { comparison, correlations, insights };
  }
  
  /**
   * Get top movers (biggest changes)
   */
  async getTopMovers(
    timeRange: keyof TrendConfig['timeRanges'],
    limit: number = 10
  ): Promise<Array<{
    metric: string;
    change: number;
    percentChange: number;
    direction: 'up' | 'down';
    current: number;
    previous: number;
  }>> {
    const movers: any[] = [];
    
    // Calculate changes for all metrics
    this.dataStore.forEach((data, metric) => {
      const recent = this.getDataForTimeRange(metric, timeRange);
      if (recent.length < 2) return;
      
      const current = recent[recent.length - 1].value;
      const previous = recent[0].value;
      const change = current - previous;
      const percentChange = (change / Math.abs(previous)) * 100;
      
      movers.push({
        metric,
        change,
        percentChange,
        direction: change > 0 ? 'up' : 'down',
        current,
        previous
      });
    });
    
    // Sort by absolute percent change
    movers.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
    
    return movers.slice(0, limit);
  }
  
  /**
   * Generate executive summary
   */
  async generateExecutiveSummary(
    timeRange: keyof TrendConfig['timeRanges']
  ): Promise<{
    overview: string;
    keyMetrics: Map<string, any>;
    trends: Array<{ metric: string; trend: string; impact: string }>;
    alerts: Array<{ metric: string; severity: string; message: string }>;
    recommendations: string[];
  }> {
    const keyMetrics = new Map<string, any>();
    const trends: any[] = [];
    const alerts: any[] = [];
    const recommendations: string[] = [];
    
    // Analyze key metrics
    const importantMetrics = ['api_quality_score', 'detection_accuracy', 'response_time'];
    
    for (const metric of importantMetrics) {
      const analysis = await this.analyzeTrend(metric, timeRange);
      
      keyMetrics.set(metric, {
        current: analysis.current.value,
        trend: analysis.historical.trend,
        percentChange: this.calculatePercentChange(analysis)
      });
      
      trends.push({
        metric,
        trend: analysis.historical.trend,
        impact: this.assessImpact(analysis)
      });
      
      // Collect high-severity insights
      analysis.insights
        .filter(i => i.impact === 'negative')
        .forEach(insight => {
          recommendations.push(...insight.recommendations);
        });
    }
    
    // Get active alerts
    this.alertState.forEach((state, metric) => {
      if (state.active) {
        alerts.push({
          metric,
          severity: state.severity,
          message: state.message
        });
      }
    });
    
    // Generate overview
    const overview = this.generateOverview(keyMetrics, trends, alerts);
    
    return {
      overview,
      keyMetrics,
      trends,
      alerts,
      recommendations: [...new Set(recommendations)] // Deduplicate
    };
  }
  
  /**
   * Export data for reporting
   */
  async exportData(
    metrics: string[],
    timeRange: keyof TrendConfig['timeRanges'],
    format: 'json' | 'csv' | 'parquet'
  ): Promise<any> {
    const data: any[] = [];
    
    for (const metric of metrics) {
      const series = this.getDataForTimeRange(metric, timeRange);
      
      series.forEach(point => {
        data.push({
          metric,
          timestamp: point.timestamp,
          value: point.value,
          ...Object.fromEntries(point.dimensions),
          ...point.metadata
        });
      });
    }
    
    switch (format) {
      case 'json':
        return data;
      
      case 'csv':
        return this.convertToCSV(data);
      
      case 'parquet':
        return this.convertToParquet(data);
      
      default:
        return data;
    }
  }
  
  // Private helper methods
  
  private async loadHistoricalData(): Promise<void> {
    // Load historical data from database
    // For simulation, generate sample data
    const metrics = [
      'api_quality_score',
      'detection_accuracy',
      'response_time',
      'error_rate',
      'throughput'
    ];
    
    const now = Date.now();
    const points = 1000;
    
    metrics.forEach(metric => {
      const series: TrendData[] = [];
      
      for (let i = 0; i < points; i++) {
        const timestamp = new Date(now - (points - i) * 60000); // 1 minute intervals
        const baseValue = metric === 'api_quality_score' ? 75 : 
                         metric === 'detection_accuracy' ? 95 :
                         metric === 'response_time' ? 50 :
                         metric === 'error_rate' ? 2 : 1000;
        
        // Add some realistic variation
        const noise = (Math.random() - 0.5) * baseValue * 0.1;
        const trend = Math.sin(i / 100) * baseValue * 0.05;
        const seasonality = Math.sin(i / 24) * baseValue * 0.02;
        
        series.push({
          metric,
          timestamp,
          value: Math.max(0, baseValue + noise + trend + seasonality),
          dimensions: new Map([
            ['apiType', ['REST', 'GraphQL', 'gRPC'][i % 3]],
            ['region', ['us-east', 'eu-west', 'ap-south'][i % 3]]
          ]),
          metadata: {
            apiId: `api-${i % 10}`,
            organization: `org-${i % 5}`
          }
        });
      }
      
      this.dataStore.set(metric, series);
    });
  }
  
  private async initializeForecastModels(): Promise<void> {
    this.config.forecasting.models.forEach(model => {
      switch (model) {
        case 'arima':
          this.forecastModels.set('arima', new ARIMAModel());
          break;
        case 'prophet':
          this.forecastModels.set('prophet', new ProphetModel());
          break;
        case 'lstm':
          this.forecastModels.set('lstm', new LSTMModel());
          break;
        case 'exponential':
          this.forecastModels.set('exponential', new ExponentialSmoothing());
          break;
      }
    });
  }
  
  private async loadBenchmarks(): Promise<void> {
    // Load or generate industry benchmarks
    this.config.benchmarking.industries.forEach(industry => {
      const benchmark: IndustryBenchmark = {
        industry,
        metrics: new Map(),
        lastUpdated: new Date(),
        sampleSize: 1000,
        topPerformers: [`${industry}-leader-1`, `${industry}-leader-2`]
      };
      
      // Generate benchmark stats for key metrics
      ['api_quality_score', 'detection_accuracy', 'response_time'].forEach(metric => {
        benchmark.metrics.set(metric, {
          p25: 60,
          p50: 75,
          p75: 85,
          p90: 90,
          p95: 93,
          p99: 98,
          mean: 74,
          leaders: [
            { org: `${industry}-leader-1`, value: 98 },
            { org: `${industry}-leader-2`, value: 97 }
          ]
        });
      });
      
      this.benchmarks.set(industry, benchmark);
    });
  }
  
  private getDataForTimeRange(
    metric: string,
    timeRange: keyof TrendConfig['timeRanges'],
    dimensions?: Map<string, string>
  ): TrendData[] {
    const series = this.dataStore.get(metric) || [];
    const now = Date.now();
    const ranges = {
      realtime: this.config.timeRanges.realtime * 60 * 1000,
      hourly: this.config.timeRanges.hourly * 60 * 60 * 1000,
      daily: this.config.timeRanges.daily * 24 * 60 * 60 * 1000,
      weekly: this.config.timeRanges.weekly * 7 * 24 * 60 * 60 * 1000,
      monthly: this.config.timeRanges.monthly * 30 * 24 * 60 * 60 * 1000
    };
    
    const cutoff = now - ranges[timeRange];
    
    return series.filter(point => {
      if (point.timestamp.getTime() < cutoff) return false;
      
      if (dimensions) {
        for (const [key, value] of dimensions) {
          if (point.dimensions.get(key) !== value) return false;
        }
      }
      
      return true;
    });
  }
  
  private calculateStatistics(data: TrendData[]): any {
    if (data.length === 0) {
      return { current: 0, avg: 0, min: 0, max: 0, stdDev: 0, percentile: 0 };
    }
    
    const values = data.map(d => d.value);
    const current = values[values.length - 1];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // Current value percentile
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = sorted.indexOf(current) / sorted.length * 100;
    
    return { current, avg, min, max, stdDev, percentile };
  }
  
  private detectTrend(data: TrendData[]): { direction: 'improving' | 'stable' | 'declining'; strength: number } {
    if (data.length < 2) {
      return { direction: 'stable', strength: 0 };
    }
    
    // Calculate linear regression
    const n = data.length;
    const x = data.map((_, i) => i);
    const y = data.map(d => d.value);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared for strength
    const yMean = sumY / n;
    const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const ssResidual = y.reduce((sum, yi, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const rSquared = 1 - (ssResidual / ssTotal);
    
    // Determine direction based on slope
    const normalizedSlope = slope / Math.abs(intercept);
    let direction: 'improving' | 'stable' | 'declining';
    
    if (Math.abs(normalizedSlope) < 0.01) {
      direction = 'stable';
    } else if (normalizedSlope > 0) {
      direction = data[0].metric.includes('error') || data[0].metric.includes('time') ? 
                  'declining' : 'improving';
    } else {
      direction = data[0].metric.includes('error') || data[0].metric.includes('time') ? 
                  'improving' : 'declining';
    }
    
    return {
      direction,
      strength: Math.abs(rSquared)
    };
  }
  
  private async generateForecast(data: TrendData[]): Promise<any> {
    const values = data.map(d => d.value);
    const timestamps = data.map(d => d.timestamp);
    
    // Use best performing model
    let bestModel: any = null;
    let bestAccuracy = 0;
    
    for (const [name, model] of this.forecastModels) {
      const accuracy = await model.evaluate(values);
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        bestModel = model;
      }
    }
    
    if (!bestModel) {
      return null;
    }
    
    // Generate predictions
    const horizon = this.config.forecasting.horizonDays * 24; // Hours
    const predictions = await bestModel.predict(values, horizon);
    
    // Generate future timestamps
    const lastTimestamp = timestamps[timestamps.length - 1];
    const futureTimestamps: Date[] = [];
    for (let i = 1; i <= horizon; i++) {
      futureTimestamps.push(new Date(lastTimestamp.getTime() + i * 3600000));
    }
    
    // Calculate confidence intervals
    const confidence: [number, number][] = predictions.map((pred: number, i: number) => {
      const uncertainty = (i + 1) * 0.05 * pred; // Increasing uncertainty
      return [pred - uncertainty, pred + uncertainty];
    });
    
    return {
      predictions: {
        timestamps: futureTimestamps,
        values: predictions
      },
      confidence,
      accuracy: bestAccuracy,
      model: bestModel.constructor.name
    };
  }
  
  private detectAnomalies(data: TrendData[]): AnomalyPoint[] {
    if (data.length < 10) return [];
    
    const anomalies: AnomalyPoint[] = [];
    const values = data.map(d => d.value);
    
    // Calculate moving average and standard deviation
    const windowSize = Math.min(10, Math.floor(data.length / 5));
    
    for (let i = windowSize; i < data.length; i++) {
      const window = values.slice(i - windowSize, i);
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      const stdDev = Math.sqrt(
        window.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / window.length
      );
      
      const value = values[i];
      const zScore = Math.abs((value - avg) / stdDev);
      
      if (zScore > 3) {
        const deviation = value - avg;
        anomalies.push({
          timestamp: data[i].timestamp,
          value,
          expected: avg,
          deviation,
          severity: zScore > 5 ? 'high' : zScore > 4 ? 'medium' : 'low',
          type: Math.abs(i - (i - 1)) > stdDev * 2 ? 'spike' :
                deviation > 0 ? 'spike' : 'dip'
        });
      }
    }
    
    return anomalies;
  }
  
  private getBenchmark(metric: string, currentValue: number): any {
    // Get industry benchmark
    const industry = 'technology'; // Default or detect from context
    const benchmark = this.benchmarks.get(industry);
    
    if (!benchmark || !benchmark.metrics.has(metric)) {
      return null;
    }
    
    const stats = benchmark.metrics.get(metric)!;
    
    // Determine percentile
    let percentile = 0;
    if (currentValue <= stats.p25) percentile = 25;
    else if (currentValue <= stats.p50) percentile = 50;
    else if (currentValue <= stats.p75) percentile = 75;
    else if (currentValue <= stats.p90) percentile = 90;
    else if (currentValue <= stats.p95) percentile = 95;
    else if (currentValue <= stats.p99) percentile = 99;
    else percentile = 100;
    
    return {
      industry: stats.mean,
      percentile,
      leaders: stats.leaders.map(l => l.org),
      gap: stats.p90 - currentValue
    };
  }
  
  private generateInsights(analysis: any): Insight[] {
    const insights: Insight[] = [];
    
    // Trend insight
    if (analysis.trend.strength > 0.7) {
      insights.push({
        type: 'trend',
        title: `Strong ${analysis.trend.direction} trend detected`,
        description: `${analysis.metric} shows a ${analysis.trend.direction} trend with ${(analysis.trend.strength * 100).toFixed(1)}% confidence`,
        impact: analysis.trend.direction === 'improving' ? 'positive' : 
                analysis.trend.direction === 'declining' ? 'negative' : 'neutral',
        confidence: analysis.trend.strength,
        recommendations: this.generateTrendRecommendations(analysis),
        relatedMetrics: []
      });
    }
    
    // Anomaly insight
    if (analysis.anomalies.length > 0) {
      const highSeverity = analysis.anomalies.filter(a => a.severity === 'high');
      if (highSeverity.length > 0) {
        insights.push({
          type: 'trend',
          title: `${highSeverity.length} high-severity anomalies detected`,
          description: `Unusual patterns detected that require investigation`,
          impact: 'negative',
          confidence: 0.9,
          recommendations: [
            'Investigate root cause of anomalies',
            'Check for system issues or external factors',
            'Review recent changes or deployments'
          ],
          relatedMetrics: []
        });
      }
    }
    
    // Forecast insight
    if (analysis.forecast) {
      const trend = analysis.forecast.predictions.values[0] > analysis.stats.current ? 'increase' : 'decrease';
      insights.push({
        type: 'forecast',
        title: `Expected ${trend} in next ${this.config.forecasting.horizonDays} days`,
        description: `Forecast model predicts ${analysis.metric} will ${trend} with ${(analysis.forecast.accuracy * 100).toFixed(1)}% accuracy`,
        impact: trend === 'increase' ? 
                (analysis.metric.includes('error') ? 'negative' : 'positive') :
                (analysis.metric.includes('error') ? 'positive' : 'negative'),
        confidence: analysis.forecast.accuracy,
        recommendations: this.generateForecastRecommendations(analysis, trend),
        relatedMetrics: []
      });
    }
    
    // Benchmark insight
    if (analysis.benchmark && analysis.benchmark.gap !== 0) {
      const performance = analysis.benchmark.percentile >= 75 ? 'above' : 
                         analysis.benchmark.percentile >= 25 ? 'at' : 'below';
      insights.push({
        type: 'benchmark',
        title: `Performance ${performance} industry average`,
        description: `Currently at ${analysis.benchmark.percentile}th percentile in ${analysis.benchmark.industry} industry`,
        impact: performance === 'above' ? 'positive' : 
                performance === 'below' ? 'negative' : 'neutral',
        confidence: 0.85,
        recommendations: analysis.benchmark.gap > 0 ? [
          `Study practices of industry leaders: ${analysis.benchmark.leaders.join(', ')}`,
          `Focus on improving by ${Math.abs(analysis.benchmark.gap).toFixed(1)} points to reach top quartile`
        ] : [],
        relatedMetrics: []
      });
    }
    
    return insights;
  }
  
  private generateTrendRecommendations(analysis: any): string[] {
    const recommendations: string[] = [];
    
    if (analysis.trend.direction === 'declining') {
      recommendations.push(
        'Investigate root causes of decline',
        'Review recent changes that may have impacted performance',
        'Consider rolling back recent deployments if correlation found'
      );
    } else if (analysis.trend.direction === 'improving') {
      recommendations.push(
        'Document and share successful practices',
        'Continue monitoring to ensure sustained improvement',
        'Set new performance targets based on current trajectory'
      );
    }
    
    return recommendations;
  }
  
  private generateForecastRecommendations(analysis: any, trend: string): string[] {
    const recommendations: string[] = [];
    
    if (trend === 'decrease' && !analysis.metric.includes('error')) {
      recommendations.push(
        'Prepare mitigation strategies for expected decline',
        'Allocate resources to reverse negative trend',
        'Set up alerts for early warning signs'
      );
    } else if (trend === 'increase' && analysis.metric.includes('error')) {
      recommendations.push(
        'Urgent: Error rate expected to increase',
        'Review error handling and recovery mechanisms',
        'Increase monitoring and alerting thresholds'
      );
    }
    
    return recommendations;
  }
  
  private extractDimensions(metadata: any): Map<string, string> {
    const dimensions = new Map<string, string>();
    
    if (metadata) {
      this.config.aggregations.groupBy.forEach(key => {
        if (metadata[key]) {
          dimensions.set(key, metadata[key]);
        }
      });
    }
    
    return dimensions;
  }
  
  private groupByDimension(
    metricData: Map<string, TrendData[]>,
    dimension: string
  ): Map<string, any> {
    const grouped = new Map<string, any>();
    
    metricData.forEach((data, metric) => {
      const groups = new Map<string, TrendData[]>();
      
      data.forEach(point => {
        const value = point.dimensions.get(dimension) || 'unknown';
        const group = groups.get(value) || [];
        group.push(point);
        groups.set(value, group);
      });
      
      const groupStats = new Map<string, any>();
      groups.forEach((groupData, groupName) => {
        groupStats.set(groupName, this.calculateStatistics(groupData));
      });
      
      grouped.set(metric, groupStats);
    });
    
    return grouped;
  }
  
  private calculateCorrelation(data1: TrendData[], data2: TrendData[]): number {
    // Align timestamps
    const aligned = this.alignTimeSeries(data1, data2);
    
    if (aligned.length < 2) return 0;
    
    const x = aligned.map(p => p[0]);
    const y = aligned.map(p => p[1]);
    
    const n = aligned.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    
    const correlation = (n * sumXY - sumX * sumY) /
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return correlation;
  }
  
  private alignTimeSeries(data1: TrendData[], data2: TrendData[]): Array<[number, number]> {
    const aligned: Array<[number, number]> = [];
    
    // Simple alignment by timestamp
    data1.forEach(point1 => {
      const point2 = data2.find(p => 
        Math.abs(p.timestamp.getTime() - point1.timestamp.getTime()) < 60000
      );
      
      if (point2) {
        aligned.push([point1.value, point2.value]);
      }
    });
    
    return aligned;
  }
  
  private generateComparativeInsights(
    comparison: Map<string, any>,
    correlations: Map<string, number>
  ): Insight[] {
    const insights: Insight[] = [];
    
    // High correlation insight
    correlations.forEach((correlation, pair) => {
      if (Math.abs(correlation) > 0.7) {
        const [metric1, metric2] = pair.split('_');
        insights.push({
          type: 'correlation',
          title: `Strong correlation between ${metric1} and ${metric2}`,
          description: `Correlation coefficient: ${correlation.toFixed(3)}`,
          impact: 'neutral',
          confidence: Math.abs(correlation),
          recommendations: [
            `Consider ${metric1} when optimizing ${metric2}`,
            'Investigate causal relationship'
          ],
          relatedMetrics: [metric1, metric2]
        });
      }
    });
    
    return insights;
  }
  
  private calculatePercentChange(analysis: any): number {
    const current = analysis.current.value;
    const historical = analysis.historical.avg;
    
    if (historical === 0) return 0;
    
    return ((current - historical) / historical) * 100;
  }
  
  private assessImpact(analysis: any): string {
    if (analysis.historical.trend === 'improving') return 'positive';
    if (analysis.historical.trend === 'declining') return 'high';
    return 'medium';
  }
  
  private generateOverview(
    keyMetrics: Map<string, any>,
    trends: any[],
    alerts: any[]
  ): string {
    const improving = trends.filter(t => t.trend === 'improving').length;
    const declining = trends.filter(t => t.trend === 'declining').length;
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    
    let summary = `Executive Summary: `;
    summary += `${improving} metrics improving, ${declining} declining. `;
    
    if (criticalAlerts > 0) {
      summary += `⚠️ ${criticalAlerts} critical alerts require immediate attention. `;
    }
    
    const qualityScore = keyMetrics.get('api_quality_score');
    if (qualityScore) {
      summary += `Overall API quality: ${qualityScore.current.toFixed(1)}/100 `;
      summary += `(${qualityScore.trend} trend). `;
    }
    
    return summary;
  }
  
  private async checkAlerts(metric: string, value: number): Promise<void> {
    const threshold = this.config.alerts.thresholds.get(metric);
    if (!threshold) return;
    
    let state = this.alertState.get(metric);
    if (!state) {
      state = {
        active: false,
        consecutiveBreaches: 0,
        lastAlertTime: new Date(),
        severity: threshold.severity,
        message: ''
      };
      this.alertState.set(metric, state);
    }
    
    // Check threshold
    let breached = false;
    switch (threshold.operator) {
      case '>': breached = value > threshold.value; break;
      case '<': breached = value < threshold.value; break;
      case '>=': breached = value >= threshold.value; break;
      case '<=': breached = value <= threshold.value; break;
      case '==': breached = value === threshold.value; break;
      case '!=': breached = value !== threshold.value; break;
    }
    
    if (breached) {
      state.consecutiveBreaches++;
      
      if (state.consecutiveBreaches >= threshold.duration && !state.active) {
        state.active = true;
        state.message = `${metric} ${threshold.operator} ${threshold.value} for ${threshold.duration} periods`;
        await this.sendAlert(metric, state);
      }
    } else {
      state.consecutiveBreaches = 0;
      state.active = false;
    }
  }
  
  private async sendAlert(metric: string, state: AlertState): Promise<void> {
    console.log(`ALERT: ${state.severity.toUpperCase()} - ${metric}: ${state.message}`);
    
    // Send to configured channels
    for (const channel of this.config.alerts.channels) {
      switch (channel) {
        case 'email':
          // await this.sendEmailAlert(metric, state);
          break;
        case 'slack':
          // await this.sendSlackAlert(metric, state);
          break;
        case 'webhook':
          // await this.sendWebhookAlert(metric, state);
          break;
        case 'sms':
          // await this.sendSMSAlert(metric, state);
          break;
      }
    }
  }
  
  private invalidateCache(metric: string): void {
    // Invalidate related cache entries
    const keysToDelete: string[] = [];
    
    this.aggregateCache.forEach((_, key) => {
      if (key.includes(metric)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.aggregateCache.delete(key));
  }
  
  private startUpdateCycle(): void {
    this.updateTimer = setInterval(async () => {
      // Update benchmarks
      if (this.config.benchmarking.enabled) {
        await this.updateBenchmarks();
      }
      
      // Clean old data
      this.cleanOldData();
      
    }, this.config.benchmarking.updateFrequency * 3600000);
  }
  
  private async updateBenchmarks(): Promise<void> {
    // Fetch latest industry benchmarks
    console.log('Updating industry benchmarks');
  }
  
  private cleanOldData(): void {
    const maxAge = 30 * 24 * 3600000; // 30 days
    const cutoff = Date.now() - maxAge;
    
    this.dataStore.forEach((series, metric) => {
      const filtered = series.filter(point => 
        point.timestamp.getTime() > cutoff
      );
      
      if (filtered.length < series.length) {
        this.dataStore.set(metric, filtered);
      }
    });
  }
  
  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(header => row[header]).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }
  
  private convertToParquet(data: any[]): any {
    // In production, use parquet library
    return data;
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): Map<string, any> {
    const metrics = new Map<string, any>();
    
    this.dataStore.forEach((series, metric) => {
      if (series.length > 0) {
        metrics.set(metric, {
          current: series[series.length - 1].value,
          dataPoints: series.length
        });
      }
    });
    
    return metrics;
  }
}

// Helper classes for forecasting models

class ARIMAModel {
  async evaluate(data: number[]): Promise<number> {
    // Simplified ARIMA evaluation
    return 0.85;
  }
  
  async predict(data: number[], horizon: number): Promise<number[]> {
    const predictions: number[] = [];
    const lastValue = data[data.length - 1];
    const trend = (data[data.length - 1] - data[0]) / data.length;
    
    for (let i = 0; i < horizon; i++) {
      predictions.push(lastValue + trend * i + (Math.random() - 0.5) * 5);
    }
    
    return predictions;
  }
}

class ProphetModel {
  async evaluate(data: number[]): Promise<number> {
    return 0.88;
  }
  
  async predict(data: number[], horizon: number): Promise<number[]> {
    // Simplified Prophet-like prediction
    const predictions: number[] = [];
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    
    for (let i = 0; i < horizon; i++) {
      const seasonality = Math.sin(i / 24 * 2 * Math.PI) * 10;
      predictions.push(avg + seasonality + (Math.random() - 0.5) * 3);
    }
    
    return predictions;
  }
}

class LSTMModel {
  async evaluate(data: number[]): Promise<number> {
    return 0.92;
  }
  
  async predict(data: number[], horizon: number): Promise<number[]> {
    // Simplified LSTM-like prediction
    const predictions: number[] = [];
    const windowSize = Math.min(24, data.length);
    const recent = data.slice(-windowSize);
    
    for (let i = 0; i < horizon; i++) {
      const weightedAvg = recent.reduce((sum, val, idx) => 
        sum + val * (idx + 1) / windowSize, 0
      ) / recent.length;
      
      predictions.push(weightedAvg + (Math.random() - 0.5) * 2);
    }
    
    return predictions;
  }
}

class ExponentialSmoothing {
  async evaluate(data: number[]): Promise<number> {
    return 0.80;
  }
  
  async predict(data: number[], horizon: number): Promise<number[]> {
    const predictions: number[] = [];
    const alpha = 0.3;
    let smoothed = data[0];
    
    // Calculate smoothed value
    for (let i = 1; i < data.length; i++) {
      smoothed = alpha * data[i] + (1 - alpha) * smoothed;
    }
    
    for (let i = 0; i < horizon; i++) {
      predictions.push(smoothed + (Math.random() - 0.5) * 1);
    }
    
    return predictions;
  }
}

interface AlertState {
  active: boolean;
  consecutiveBreaches: number;
  lastAlertTime: Date;
  severity: string;
  message: string;
}