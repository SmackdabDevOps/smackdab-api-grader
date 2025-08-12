/**
 * Feedback Collector
 * Collects user feedback on grading results for continuous improvement
 */

export interface FeedbackItem {
  id: string;
  timestamp: Date;
  apiSpecId: string;
  gradingResultId: string;
  feedbackType: 'accuracy' | 'relevance' | 'severity' | 'overall';
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  metadata: {
    detectedType: string;
    detectionConfidence: number;
    appliedProfile: string;
    businessDomain: string;
    finalScore: number;
    ruleViolations: string[];
  };
  userContext: {
    userId?: string;
    organizationId?: string;
    experienceLevel?: 'beginner' | 'intermediate' | 'expert';
    apiDomain?: string;
  };
  corrections?: {
    actualApiType?: string;
    missingRules?: string[];
    incorrectRules?: string[];
    severityAdjustments?: Record<string, 'too_high' | 'too_low' | 'correct'>;
  };
}

export interface FeedbackAnalysis {
  feedbackId: string;
  patterns: FeedbackPattern[];
  confidence: number;
  suggestedAdjustments: WeightAdjustment[];
  validationRequired: boolean;
}

export interface FeedbackPattern {
  type: 'recurring' | 'anomaly' | 'trend' | 'correlation';
  description: string;
  frequency: number;
  impact: 'low' | 'medium' | 'high';
  evidence: string[];
}

export interface WeightAdjustment {
  ruleId: string;
  currentWeight: number;
  suggestedWeight: number;
  reason: string;
  confidence: number;
}

export interface FeedbackMetrics {
  totalFeedback: number;
  averageRating: number;
  satisfactionRate: number;
  accuracyScore: number;
  mostCommonIssues: Array<{ issue: string; count: number }>;
  feedbackByDomain: Record<string, number>;
  feedbackByApiType: Record<string, number>;
  temporalTrends: Array<{
    period: string;
    avgRating: number;
    feedbackCount: number;
  }>;
}

export class FeedbackCollector {
  private feedbackStore: Map<string, FeedbackItem> = new Map();
  private analysisCache: Map<string, FeedbackAnalysis> = new Map();
  
  // Feedback thresholds
  private readonly PATTERN_THRESHOLD = 3; // Min occurrences for pattern
  private readonly CONFIDENCE_THRESHOLD = 0.7; // Min confidence for adjustments
  private readonly SATISFACTION_THRESHOLD = 0.8; // Target satisfaction rate
  
  /**
   * Collect user feedback
   */
  collectFeedback(feedback: Omit<FeedbackItem, 'id' | 'timestamp'>): string {
    const id = this.generateFeedbackId();
    const feedbackItem: FeedbackItem = {
      id,
      timestamp: new Date(),
      ...feedback
    };
    
    this.feedbackStore.set(id, feedbackItem);
    
    // Trigger immediate analysis for critical feedback
    if (feedback.rating <= 2 || feedback.corrections) {
      this.analyzeImmediate(feedbackItem);
    }
    
    return id;
  }
  
  /**
   * Batch collect feedback for bulk processing
   */
  batchCollect(feedbackItems: Array<Omit<FeedbackItem, 'id' | 'timestamp'>>): string[] {
    return feedbackItems.map(item => this.collectFeedback(item));
  }
  
  /**
   * Analyze feedback patterns
   */
  analyzeFeedback(timeWindow?: { start: Date; end: Date }): FeedbackAnalysis[] {
    const relevantFeedback = this.filterByTimeWindow(timeWindow);
    const analyses: FeedbackAnalysis[] = [];
    
    // Group feedback by API type
    const byApiType = this.groupByApiType(relevantFeedback);
    
    byApiType.forEach((items, apiType) => {
      const patterns = this.detectPatterns(items);
      const adjustments = this.calculateAdjustments(items, patterns);
      
      analyses.push({
        feedbackId: `analysis-${apiType}-${Date.now()}`,
        patterns,
        confidence: this.calculateConfidence(items, patterns),
        suggestedAdjustments: adjustments,
        validationRequired: adjustments.some(a => a.confidence < this.CONFIDENCE_THRESHOLD)
      });
    });
    
    return analyses;
  }
  
  /**
   * Detect patterns in feedback
   */
  private detectPatterns(items: FeedbackItem[]): FeedbackPattern[] {
    const patterns: FeedbackPattern[] = [];
    
    // Detect recurring issues
    const issueFrequency = new Map<string, number>();
    items.forEach(item => {
      if (item.corrections?.incorrectRules) {
        item.corrections.incorrectRules.forEach(rule => {
          issueFrequency.set(rule, (issueFrequency.get(rule) || 0) + 1);
        });
      }
    });
    
    // Create patterns for frequent issues
    issueFrequency.forEach((count, rule) => {
      if (count >= this.PATTERN_THRESHOLD) {
        patterns.push({
          type: 'recurring',
          description: `Rule ${rule} frequently marked as incorrect`,
          frequency: count,
          impact: count > 10 ? 'high' : count > 5 ? 'medium' : 'low',
          evidence: items
            .filter(i => i.corrections?.incorrectRules?.includes(rule))
            .map(i => i.id)
        });
      }
    });
    
    // Detect rating trends
    const ratingTrend = this.detectRatingTrend(items);
    if (ratingTrend) {
      patterns.push(ratingTrend);
    }
    
    // Detect anomalies
    const anomalies = this.detectAnomalies(items);
    patterns.push(...anomalies);
    
    // Detect correlations
    const correlations = this.detectCorrelations(items);
    patterns.push(...correlations);
    
    return patterns;
  }
  
  /**
   * Detect rating trends
   */
  private detectRatingTrend(items: FeedbackItem[]): FeedbackPattern | null {
    if (items.length < 10) return null;
    
    // Sort by timestamp
    const sorted = [...items].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    // Calculate moving average
    const windowSize = Math.min(5, Math.floor(items.length / 3));
    const movingAverages: number[] = [];
    
    for (let i = windowSize; i <= sorted.length; i++) {
      const window = sorted.slice(i - windowSize, i);
      const avg = window.reduce((sum, item) => sum + item.rating, 0) / windowSize;
      movingAverages.push(avg);
    }
    
    // Detect trend direction
    if (movingAverages.length < 2) return null;
    
    const firstAvg = movingAverages[0];
    const lastAvg = movingAverages[movingAverages.length - 1];
    const change = lastAvg - firstAvg;
    
    if (Math.abs(change) > 0.5) {
      return {
        type: 'trend',
        description: change > 0 
          ? `Improving satisfaction trend (+${change.toFixed(2)})`
          : `Declining satisfaction trend (${change.toFixed(2)})`,
        frequency: items.length,
        impact: Math.abs(change) > 1 ? 'high' : 'medium',
        evidence: sorted.slice(-5).map(i => i.id)
      };
    }
    
    return null;
  }
  
  /**
   * Detect anomalies in feedback
   */
  private detectAnomalies(items: FeedbackItem[]): FeedbackPattern[] {
    const patterns: FeedbackPattern[] = [];
    
    // Calculate statistics
    const ratings = items.map(i => i.rating);
    const mean = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    const stdDev = Math.sqrt(
      ratings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratings.length
    );
    
    // Find outliers (2 standard deviations)
    const outliers = items.filter(item => 
      Math.abs(item.rating - mean) > 2 * stdDev
    );
    
    if (outliers.length > 0) {
      patterns.push({
        type: 'anomaly',
        description: `${outliers.length} ratings significantly deviate from average`,
        frequency: outliers.length,
        impact: outliers.length > items.length * 0.1 ? 'high' : 'low',
        evidence: outliers.slice(0, 5).map(i => i.id)
      });
    }
    
    // Detect sudden confidence drops
    const lowConfidence = items.filter(i => 
      i.metadata.detectionConfidence < 0.5
    );
    
    if (lowConfidence.length > items.length * 0.2) {
      patterns.push({
        type: 'anomaly',
        description: 'High frequency of low-confidence detections',
        frequency: lowConfidence.length,
        impact: 'high',
        evidence: lowConfidence.slice(0, 5).map(i => i.id)
      });
    }
    
    return patterns;
  }
  
  /**
   * Detect correlations in feedback
   */
  private detectCorrelations(items: FeedbackItem[]): FeedbackPattern[] {
    const patterns: FeedbackPattern[] = [];
    
    // Correlate low ratings with specific domains
    const domainRatings = new Map<string, number[]>();
    items.forEach(item => {
      const domain = item.metadata.businessDomain;
      if (!domainRatings.has(domain)) {
        domainRatings.set(domain, []);
      }
      domainRatings.get(domain)!.push(item.rating);
    });
    
    domainRatings.forEach((ratings, domain) => {
      const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      if (avgRating < 3 && ratings.length >= this.PATTERN_THRESHOLD) {
        patterns.push({
          type: 'correlation',
          description: `Low satisfaction in ${domain} domain (avg: ${avgRating.toFixed(2)})`,
          frequency: ratings.length,
          impact: 'high',
          evidence: items
            .filter(i => i.metadata.businessDomain === domain && i.rating < 3)
            .slice(0, 5)
            .map(i => i.id)
        });
      }
    });
    
    // Correlate low ratings with specific API types
    const typeRatings = new Map<string, number[]>();
    items.forEach(item => {
      const type = item.metadata.detectedType;
      if (!typeRatings.has(type)) {
        typeRatings.set(type, []);
      }
      typeRatings.get(type)!.push(item.rating);
    });
    
    typeRatings.forEach((ratings, type) => {
      const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      if (avgRating < 3 && ratings.length >= this.PATTERN_THRESHOLD) {
        patterns.push({
          type: 'correlation',
          description: `${type} APIs consistently receive low ratings`,
          frequency: ratings.length,
          impact: 'medium',
          evidence: items
            .filter(i => i.metadata.detectedType === type && i.rating < 3)
            .slice(0, 5)
            .map(i => i.id)
        });
      }
    });
    
    return patterns;
  }
  
  /**
   * Calculate weight adjustments based on feedback
   */
  private calculateAdjustments(
    items: FeedbackItem[],
    patterns: FeedbackPattern[]
  ): WeightAdjustment[] {
    const adjustments: WeightAdjustment[] = [];
    
    // Analyze severity adjustments
    const severityFeedback = new Map<string, { high: number; low: number; correct: number }>();
    
    items.forEach(item => {
      if (item.corrections?.severityAdjustments) {
        Object.entries(item.corrections.severityAdjustments).forEach(([rule, adjustment]) => {
          if (!severityFeedback.has(rule)) {
            severityFeedback.set(rule, { high: 0, low: 0, correct: 0 });
          }
          const counts = severityFeedback.get(rule)!;
          if (adjustment === 'too_high') counts.high++;
          else if (adjustment === 'too_low') counts.low++;
          else counts.correct++;
        });
      }
    });
    
    // Generate adjustments
    severityFeedback.forEach((counts, ruleId) => {
      const total = counts.high + counts.low + counts.correct;
      if (total >= this.PATTERN_THRESHOLD) {
        const currentWeight = 1.0; // Default weight
        let suggestedWeight = currentWeight;
        let reason = '';
        
        if (counts.high > counts.low && counts.high > counts.correct) {
          suggestedWeight = currentWeight * 0.8;
          reason = `Users report severity is too high (${counts.high}/${total} feedback)`;
        } else if (counts.low > counts.high && counts.low > counts.correct) {
          suggestedWeight = currentWeight * 1.2;
          reason = `Users report severity is too low (${counts.low}/${total} feedback)`;
        }
        
        if (suggestedWeight !== currentWeight) {
          adjustments.push({
            ruleId,
            currentWeight,
            suggestedWeight,
            reason,
            confidence: total / items.length
          });
        }
      }
    });
    
    // Adjust based on patterns
    patterns.forEach(pattern => {
      if (pattern.type === 'recurring' && pattern.impact === 'high') {
        // Extract rule from pattern description
        const ruleMatch = pattern.description.match(/Rule (\S+)/);
        if (ruleMatch) {
          adjustments.push({
            ruleId: ruleMatch[1],
            currentWeight: 1.0,
            suggestedWeight: 0.5,
            reason: pattern.description,
            confidence: pattern.frequency / items.length
          });
        }
      }
    });
    
    return adjustments;
  }
  
  /**
   * Calculate confidence for analysis
   */
  private calculateConfidence(items: FeedbackItem[], patterns: FeedbackPattern[]): number {
    // Base confidence on sample size
    const sampleConfidence = Math.min(items.length / 100, 1);
    
    // Adjust for consistency
    const ratings = items.map(i => i.rating);
    const mean = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    const variance = ratings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratings.length;
    const consistencyScore = 1 / (1 + variance);
    
    // Consider pattern strength
    const patternStrength = patterns.length > 0 
      ? patterns.reduce((sum, p) => sum + (p.impact === 'high' ? 1 : p.impact === 'medium' ? 0.5 : 0.2), 0) / patterns.length
      : 0.5;
    
    return (sampleConfidence * 0.4 + consistencyScore * 0.3 + patternStrength * 0.3);
  }
  
  /**
   * Immediate analysis for critical feedback
   */
  private analyzeImmediate(feedback: FeedbackItem): void {
    // Log critical feedback
    console.warn('Critical feedback received:', {
      id: feedback.id,
      rating: feedback.rating,
      corrections: feedback.corrections,
      comment: feedback.comment
    });
    
    // Cache for quick retrieval
    const analysis: FeedbackAnalysis = {
      feedbackId: feedback.id,
      patterns: [],
      confidence: 0.5,
      suggestedAdjustments: [],
      validationRequired: true
    };
    
    this.analysisCache.set(feedback.id, analysis);
  }
  
  /**
   * Get feedback metrics
   */
  getMetrics(timeWindow?: { start: Date; end: Date }): FeedbackMetrics {
    const relevantFeedback = this.filterByTimeWindow(timeWindow);
    
    // Calculate basic metrics
    const totalFeedback = relevantFeedback.length;
    const averageRating = relevantFeedback.length > 0
      ? relevantFeedback.reduce((sum, f) => sum + f.rating, 0) / relevantFeedback.length
      : 0;
    const satisfactionRate = relevantFeedback.filter(f => f.rating >= 4).length / Math.max(relevantFeedback.length, 1);
    
    // Calculate accuracy score
    const correctDetections = relevantFeedback.filter(f => 
      !f.corrections?.actualApiType || f.corrections.actualApiType === f.metadata.detectedType
    ).length;
    const accuracyScore = correctDetections / Math.max(relevantFeedback.length, 1);
    
    // Find most common issues
    const issueCount = new Map<string, number>();
    relevantFeedback.forEach(f => {
      if (f.corrections?.incorrectRules) {
        f.corrections.incorrectRules.forEach(rule => {
          issueCount.set(rule, (issueCount.get(rule) || 0) + 1);
        });
      }
    });
    
    const mostCommonIssues = Array.from(issueCount.entries())
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Group by domain
    const feedbackByDomain: Record<string, number> = {};
    relevantFeedback.forEach(f => {
      const domain = f.metadata.businessDomain;
      feedbackByDomain[domain] = (feedbackByDomain[domain] || 0) + 1;
    });
    
    // Group by API type
    const feedbackByApiType: Record<string, number> = {};
    relevantFeedback.forEach(f => {
      const type = f.metadata.detectedType;
      feedbackByApiType[type] = (feedbackByApiType[type] || 0) + 1;
    });
    
    // Calculate temporal trends
    const temporalTrends = this.calculateTemporalTrends(relevantFeedback);
    
    return {
      totalFeedback,
      averageRating,
      satisfactionRate,
      accuracyScore,
      mostCommonIssues,
      feedbackByDomain,
      feedbackByApiType,
      temporalTrends
    };
  }
  
  /**
   * Calculate temporal trends
   */
  private calculateTemporalTrends(items: FeedbackItem[]): Array<{
    period: string;
    avgRating: number;
    feedbackCount: number;
  }> {
    if (items.length === 0) return [];
    
    // Group by day
    const byDay = new Map<string, FeedbackItem[]>();
    items.forEach(item => {
      const day = item.timestamp.toISOString().split('T')[0];
      if (!byDay.has(day)) {
        byDay.set(day, []);
      }
      byDay.get(day)!.push(item);
    });
    
    // Calculate daily metrics
    return Array.from(byDay.entries())
      .map(([period, dayItems]) => ({
        period,
        avgRating: dayItems.reduce((sum, i) => sum + i.rating, 0) / dayItems.length,
        feedbackCount: dayItems.length
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }
  
  /**
   * Filter feedback by time window
   */
  private filterByTimeWindow(timeWindow?: { start: Date; end: Date }): FeedbackItem[] {
    const allFeedback = Array.from(this.feedbackStore.values());
    
    if (!timeWindow) return allFeedback;
    
    return allFeedback.filter(f => 
      f.timestamp >= timeWindow.start && f.timestamp <= timeWindow.end
    );
  }
  
  /**
   * Group feedback by API type
   */
  private groupByApiType(items: FeedbackItem[]): Map<string, FeedbackItem[]> {
    const grouped = new Map<string, FeedbackItem[]>();
    
    items.forEach(item => {
      const type = item.metadata.detectedType;
      if (!grouped.has(type)) {
        grouped.set(type, []);
      }
      grouped.get(type)!.push(item);
    });
    
    return grouped;
  }
  
  /**
   * Generate unique feedback ID
   */
  private generateFeedbackId(): string {
    return `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Export feedback data for analysis
   */
  exportFeedback(): FeedbackItem[] {
    return Array.from(this.feedbackStore.values());
  }
  
  /**
   * Import feedback data
   */
  importFeedback(items: FeedbackItem[]): void {
    items.forEach(item => {
      this.feedbackStore.set(item.id, item);
    });
  }
}