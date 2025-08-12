/**
 * Feedback UI Component
 * Provides user interface elements for collecting and displaying feedback
 */

export interface FeedbackUIConfig {
  enabled: boolean;
  position: 'top' | 'bottom' | 'inline';
  style: 'minimal' | 'detailed' | 'wizard';
  autoPrompt: boolean;
  promptThreshold: number; // Score threshold to prompt for feedback
}

export interface FeedbackPrompt {
  id: string;
  type: 'rating' | 'correction' | 'severity' | 'suggestion';
  title: string;
  description: string;
  options: FeedbackOption[];
  required: boolean;
}

export interface FeedbackOption {
  value: string | number;
  label: string;
  icon?: string;
  description?: string;
}

export interface FeedbackForm {
  prompts: FeedbackPrompt[];
  context: {
    apiName: string;
    score: number;
    grade: string;
    violations: number;
    detectedType: string;
    confidence: number;
  };
  metadata: Record<string, any>;
}

export interface FeedbackResponse {
  promptId: string;
  value: any;
  timestamp: Date;
}

export interface FeedbackSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  responses: FeedbackResponse[];
  completed: boolean;
  skipped: boolean;
}

export class FeedbackUI {
  private config: FeedbackUIConfig;
  private sessions: Map<string, FeedbackSession> = new Map();
  private templates: Map<string, FeedbackForm> = new Map();
  
  constructor(config: Partial<FeedbackUIConfig> = {}) {
    this.config = {
      enabled: true,
      position: 'bottom',
      style: 'minimal',
      autoPrompt: true,
      promptThreshold: 60,
      ...config
    };
    
    this.initializeTemplates();
  }
  
  /**
   * Initialize feedback form templates
   */
  private initializeTemplates(): void {
    // Quick rating template
    this.templates.set('quick-rating', {
      prompts: [{
        id: 'overall-rating',
        type: 'rating',
        title: 'How accurate was this grading?',
        description: 'Rate the accuracy and relevance of the grading results',
        options: [
          { value: 1, label: '⭐', description: 'Very Poor' },
          { value: 2, label: '⭐⭐', description: 'Poor' },
          { value: 3, label: '⭐⭐⭐', description: 'Average' },
          { value: 4, label: '⭐⭐⭐⭐', description: 'Good' },
          { value: 5, label: '⭐⭐⭐⭐⭐', description: 'Excellent' }
        ],
        required: true
      }],
      context: {} as any,
      metadata: {}
    });
    
    // Detailed feedback template
    this.templates.set('detailed', {
      prompts: [
        {
          id: 'accuracy-rating',
          type: 'rating',
          title: 'Detection Accuracy',
          description: 'Was the API type correctly identified?',
          options: [
            { value: 1, label: 'Completely Wrong' },
            { value: 2, label: 'Mostly Wrong' },
            { value: 3, label: 'Partially Correct' },
            { value: 4, label: 'Mostly Correct' },
            { value: 5, label: 'Perfectly Correct' }
          ],
          required: true
        },
        {
          id: 'relevance-rating',
          type: 'rating',
          title: 'Rule Relevance',
          description: 'Were the applied rules relevant to your API?',
          options: [
            { value: 1, label: 'Not Relevant' },
            { value: 2, label: 'Slightly Relevant' },
            { value: 3, label: 'Somewhat Relevant' },
            { value: 4, label: 'Mostly Relevant' },
            { value: 5, label: 'Highly Relevant' }
          ],
          required: true
        },
        {
          id: 'severity-feedback',
          type: 'severity',
          title: 'Severity Assessment',
          description: 'Were the violation severities appropriate?',
          options: [
            { value: 'too_high', label: 'Too Strict' },
            { value: 'correct', label: 'Just Right' },
            { value: 'too_low', label: 'Too Lenient' }
          ],
          required: false
        },
        {
          id: 'suggestions',
          type: 'suggestion',
          title: 'Improvement Suggestions',
          description: 'Any specific feedback or suggestions?',
          options: [],
          required: false
        }
      ],
      context: {} as any,
      metadata: {}
    });
    
    // Correction wizard template
    this.templates.set('correction-wizard', {
      prompts: [
        {
          id: 'api-type-correction',
          type: 'correction',
          title: 'API Type Correction',
          description: 'What is the actual API type?',
          options: [
            { value: 'REST', label: 'REST API' },
            { value: 'GraphQL', label: 'GraphQL API' },
            { value: 'gRPC', label: 'gRPC API' },
            { value: 'SaaS', label: 'Enterprise SaaS' },
            { value: 'Microservice', label: 'Microservice' },
            { value: 'Internal', label: 'Internal Tool' }
          ],
          required: true
        },
        {
          id: 'incorrect-rules',
          type: 'correction',
          title: 'Incorrect Rules',
          description: 'Which rules should not have been applied?',
          options: [], // Dynamically populated
          required: false
        },
        {
          id: 'missing-rules',
          type: 'correction',
          title: 'Missing Rules',
          description: 'Which important rules were missing?',
          options: [], // User input
          required: false
        }
      ],
      context: {} as any,
      metadata: {}
    });
  }
  
  /**
   * Generate feedback form based on grading results
   */
  generateFeedbackForm(
    gradingResult: any,
    style?: 'minimal' | 'detailed' | 'wizard'
  ): FeedbackForm {
    const formStyle = style || this.config.style;
    const template = this.templates.get(
      formStyle === 'minimal' ? 'quick-rating' :
      formStyle === 'detailed' ? 'detailed' :
      'correction-wizard'
    )!;
    
    // Clone template
    const form: FeedbackForm = JSON.parse(JSON.stringify(template));
    
    // Populate context
    form.context = {
      apiName: gradingResult.apiName || 'Unknown API',
      score: gradingResult.score,
      grade: gradingResult.grade,
      violations: gradingResult.violations?.length || 0,
      detectedType: gradingResult.detectedType || 'REST',
      confidence: gradingResult.confidence || 0
    };
    
    // Populate dynamic options for correction wizard
    if (formStyle === 'wizard' && gradingResult.violations) {
      const incorrectRulesPrompt = form.prompts.find(p => p.id === 'incorrect-rules');
      if (incorrectRulesPrompt) {
        incorrectRulesPrompt.options = gradingResult.violations.map((v: any) => ({
          value: v.ruleId,
          label: v.ruleName || v.ruleId,
          description: v.description
        }));
      }
    }
    
    return form;
  }
  
  /**
   * Start feedback session
   */
  startSession(form: FeedbackForm): string {
    const sessionId = this.generateSessionId();
    const session: FeedbackSession = {
      sessionId,
      startTime: new Date(),
      responses: [],
      completed: false,
      skipped: false
    };
    
    this.sessions.set(sessionId, session);
    return sessionId;
  }
  
  /**
   * Record feedback response
   */
  recordResponse(sessionId: string, response: Omit<FeedbackResponse, 'timestamp'>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.responses.push({
      ...response,
      timestamp: new Date()
    });
  }
  
  /**
   * Complete feedback session
   */
  completeSession(sessionId: string): FeedbackSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.endTime = new Date();
    session.completed = true;
    
    return session;
  }
  
  /**
   * Skip feedback session
   */
  skipSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.endTime = new Date();
    session.skipped = true;
  }
  
  /**
   * Should prompt for feedback based on config
   */
  shouldPromptFeedback(score: number, confidence: number): boolean {
    if (!this.config.enabled || !this.config.autoPrompt) {
      return false;
    }
    
    // Prompt for low scores
    if (score < this.config.promptThreshold) {
      return true;
    }
    
    // Prompt for low confidence
    if (confidence < 0.7) {
      return true;
    }
    
    // Random sampling for high scores (10% chance)
    if (Math.random() < 0.1) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Generate CLI-friendly feedback prompt
   */
  generateCLIPrompt(form: FeedbackForm): string {
    const lines: string[] = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📊 Feedback Request',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `API: ${form.context.apiName}`,
      `Score: ${form.context.score}/100 (${form.context.grade})`,
      `Detected Type: ${form.context.detectedType} (${Math.round(form.context.confidence * 100)}% confidence)`,
      `Violations: ${form.context.violations}`,
      ''
    ];
    
    form.prompts.forEach((prompt, index) => {
      lines.push(`${index + 1}. ${prompt.title}`);
      if (prompt.description) {
        lines.push(`   ${prompt.description}`);
      }
      
      if (prompt.options.length > 0) {
        lines.push('');
        prompt.options.forEach((option, i) => {
          const label = option.description ? 
            `${option.label} - ${option.description}` : 
            option.label;
          lines.push(`   ${String.fromCharCode(97 + i)}) ${label}`);
        });
      }
      lines.push('');
    });
    
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('Press (s) to skip, or provide your feedback');
    lines.push('');
    
    return lines.join('\\n');
  }
  
  /**
   * Generate HTML feedback widget
   */
  generateHTMLWidget(form: FeedbackForm): string {
    const html = `
<div class="feedback-widget" style="
  position: fixed;
  ${this.config.position}: 20px;
  right: 20px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  max-width: 400px;
  z-index: 10000;
">
  <div class="feedback-header" style="margin-bottom: 12px;">
    <h3 style="margin: 0; font-size: 16px; color: #333;">
      📊 How was this grading?
    </h3>
    <div style="color: #666; font-size: 12px; margin-top: 4px;">
      Score: ${form.context.score}/100 | ${form.context.detectedType}
    </div>
  </div>
  
  <div class="feedback-body">
    ${form.prompts.map(prompt => this.generatePromptHTML(prompt)).join('')}
  </div>
  
  <div class="feedback-actions" style="margin-top: 12px; text-align: right;">
    <button onclick="skipFeedback()" style="
      padding: 6px 12px;
      margin-right: 8px;
      border: 1px solid #ccc;
      background: white;
      border-radius: 4px;
      cursor: pointer;
    ">Skip</button>
    <button onclick="submitFeedback()" style="
      padding: 6px 12px;
      border: none;
      background: #4CAF50;
      color: white;
      border-radius: 4px;
      cursor: pointer;
    ">Submit</button>
  </div>
</div>`;
    
    return html;
  }
  
  /**
   * Generate HTML for individual prompt
   */
  private generatePromptHTML(prompt: FeedbackPrompt): string {
    if (prompt.type === 'rating') {
      return `
<div class="feedback-prompt" style="margin-bottom: 12px;">
  <label style="display: block; margin-bottom: 4px; font-size: 14px; color: #555;">
    ${prompt.title}
  </label>
  <div class="rating-options" style="display: flex; gap: 8px;">
    ${prompt.options.map(opt => `
      <button class="rating-btn" data-value="${opt.value}" style="
        padding: 8px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
      " title="${opt.description}">${opt.label}</button>
    `).join('')}
  </div>
</div>`;
    }
    
    if (prompt.type === 'correction' || prompt.type === 'severity') {
      return `
<div class="feedback-prompt" style="margin-bottom: 12px;">
  <label style="display: block; margin-bottom: 4px; font-size: 14px; color: #555;">
    ${prompt.title}
  </label>
  <select id="${prompt.id}" style="
    width: 100%;
    padding: 6px;
    border: 1px solid #ddd;
    border-radius: 4px;
  ">
    <option value="">Select...</option>
    ${prompt.options.map(opt => `
      <option value="${opt.value}">${opt.label}</option>
    `).join('')}
  </select>
</div>`;
    }
    
    if (prompt.type === 'suggestion') {
      return `
<div class="feedback-prompt" style="margin-bottom: 12px;">
  <label style="display: block; margin-bottom: 4px; font-size: 14px; color: #555;">
    ${prompt.title}
  </label>
  <textarea id="${prompt.id}" style="
    width: 100%;
    padding: 6px;
    border: 1px solid #ddd;
    border-radius: 4px;
    min-height: 60px;
    resize: vertical;
  " placeholder="Optional feedback..."></textarea>
</div>`;
    }
    
    return '';
  }
  
  /**
   * Generate feedback summary
   */
  generateSummary(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return 'Session not found';
    }
    
    const lines: string[] = [
      '📊 Feedback Summary',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Session: ${sessionId}`,
      `Duration: ${this.formatDuration(session.startTime, session.endTime)}`,
      `Status: ${session.completed ? '✅ Completed' : session.skipped ? '⏭️ Skipped' : '⏸️ In Progress'}`,
      ''
    ];
    
    if (session.responses.length > 0) {
      lines.push('Responses:');
      session.responses.forEach(response => {
        lines.push(`  • ${response.promptId}: ${response.value}`);
      });
    }
    
    return lines.join('\\n');
  }
  
  /**
   * Format duration
   */
  private formatDuration(start: Date, end?: Date): string {
    if (!end) return 'Ongoing';
    
    const duration = end.getTime() - start.getTime();
    const seconds = Math.floor(duration / 1000);
    
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get configuration
   */
  getConfig(): FeedbackUIConfig {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<FeedbackUIConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get session statistics
   */
  getStatistics(): {
    totalSessions: number;
    completedSessions: number;
    skippedSessions: number;
    averageResponseTime: number;
    completionRate: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const completed = sessions.filter(s => s.completed).length;
    const skipped = sessions.filter(s => s.skipped).length;
    
    const responseTimes = sessions
      .filter(s => s.endTime)
      .map(s => s.endTime!.getTime() - s.startTime.getTime());
    
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
      : 0;
    
    return {
      totalSessions: sessions.length,
      completedSessions: completed,
      skippedSessions: skipped,
      averageResponseTime: avgResponseTime,
      completionRate: sessions.length > 0 ? completed / sessions.length : 0
    };
  }
}