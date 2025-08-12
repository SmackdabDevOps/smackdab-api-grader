/**
 * Priority Calculator
 * Determines rule priorities based on business context and API characteristics
 */

import { GradingProfile } from '../profiles/profile-manager';

export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type BusinessDomain = 'finance' | 'healthcare' | 'ecommerce' | 'government' | 'education' | 'general';

export interface PriorityContext {
  domain: BusinessDomain;
  regulations?: string[];
  riskLevel?: 'high' | 'medium' | 'low';
  userBase?: 'internal' | 'b2b' | 'b2c' | 'public';
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
}

export interface RulePriority {
  ruleId: string;
  basePriority: Priority;
  contextPriority: Priority;
  weight: number;
  reasoning: string[];
}

export interface PriorityMatrix {
  categories: Map<string, Priority>;
  rules: Map<string, RulePriority>;
  overallMultiplier: number;
}

export class PriorityCalculator {
  // Domain-specific priority adjustments
  private readonly DOMAIN_PRIORITIES: Record<BusinessDomain, Record<string, Priority>> = {
    finance: {
      security: 'critical',
      compliance: 'critical',
      audit: 'critical',
      encryption: 'critical',
      authentication: 'critical',
      performance: 'high',
      documentation: 'high',
      consistency: 'medium'
    },
    healthcare: {
      security: 'critical',
      compliance: 'critical',  // HIPAA
      privacy: 'critical',
      audit: 'critical',
      documentation: 'critical',  // Clinical documentation
      consistency: 'high',
      performance: 'medium'
    },
    government: {
      security: 'critical',
      compliance: 'critical',  // FedRAMP, FISMA
      accessibility: 'critical',  // 508 compliance
      audit: 'critical',
      documentation: 'high',
      transparency: 'high',
      performance: 'medium'
    },
    ecommerce: {
      performance: 'critical',  // Cart abandonment
      security: 'critical',  // Payment processing
      availability: 'critical',  // 24/7 operations
      scalability: 'high',
      functionality: 'high',
      documentation: 'medium',
      consistency: 'medium'
    },
    education: {
      accessibility: 'critical',  // WCAG compliance
      documentation: 'high',
      functionality: 'high',
      security: 'high',
      performance: 'medium',
      scalability: 'medium',
      consistency: 'medium'
    },
    general: {
      security: 'high',
      functionality: 'high',
      documentation: 'medium',
      performance: 'medium',
      consistency: 'medium',
      best_practices: 'low'
    }
  };

  // Regulation-specific requirements
  private readonly REGULATION_REQUIREMENTS: Record<string, string[]> = {
    'PCI-DSS': ['encryption', 'authentication', 'audit', 'access-control', 'monitoring'],
    'HIPAA': ['privacy', 'encryption', 'audit', 'access-control', 'backup'],
    'GDPR': ['privacy', 'consent', 'data-portability', 'right-to-delete', 'audit'],
    'SOC2': ['security', 'availability', 'processing-integrity', 'confidentiality', 'privacy'],
    'FISMA': ['security', 'access-control', 'audit', 'incident-response', 'continuity'],
    'FedRAMP': ['security', 'continuous-monitoring', 'incident-response', 'vulnerability-management']
  };

  /**
   * Calculate priority matrix for given context
   */
  calculatePriorities(
    profile: GradingProfile,
    context: PriorityContext
  ): PriorityMatrix {
    const categories = this.calculateCategoryPriorities(context);
    const rules = this.calculateRulePriorities(profile, context, categories);
    const overallMultiplier = this.calculateOverallMultiplier(context);

    return {
      categories,
      rules,
      overallMultiplier
    };
  }

  /**
   * Calculate category-level priorities
   */
  private calculateCategoryPriorities(context: PriorityContext): Map<string, Priority> {
    const priorities = new Map<string, Priority>();
    
    // Start with domain defaults
    const domainPriorities = this.DOMAIN_PRIORITIES[context.domain];
    Object.entries(domainPriorities).forEach(([category, priority]) => {
      priorities.set(category, priority);
    });

    // Adjust for regulations
    if (context.regulations?.length) {
      this.applyRegulationPriorities(priorities, context.regulations);
    }

    // Adjust for risk level
    if (context.riskLevel === 'high') {
      this.escalatePriorities(priorities, ['security', 'audit', 'monitoring']);
    }

    // Adjust for data classification
    if (context.dataClassification === 'restricted' || context.dataClassification === 'confidential') {
      this.escalatePriorities(priorities, ['security', 'encryption', 'access-control']);
    }

    // Adjust for user base
    if (context.userBase === 'public' || context.userBase === 'b2c') {
      this.escalatePriorities(priorities, ['performance', 'availability', 'usability']);
    }

    return priorities;
  }

  /**
   * Calculate individual rule priorities
   */
  private calculateRulePriorities(
    profile: GradingProfile,
    context: PriorityContext,
    categoryPriorities: Map<string, Priority>
  ): Map<string, RulePriority> {
    const rulePriorities = new Map<string, RulePriority>();

    profile.rules.forEach(rule => {
      const category = this.getRuleCategory(rule.rule_id);
      const basePriority = this.getBasePriority(rule.rule_id);
      const categoryPriority = categoryPriorities.get(category) || 'medium';
      
      // Determine final priority (higher of base or category)
      const contextPriority = this.combinePriorities(basePriority, categoryPriority);
      
      // Calculate weight based on priority
      const weight = this.priorityToWeight(contextPriority);
      
      // Build reasoning
      const reasoning: string[] = [];
      if (contextPriority !== basePriority) {
        reasoning.push(`Elevated from ${basePriority} due to ${context.domain} domain requirements`);
      }
      if (context.regulations?.length) {
        reasoning.push(`Compliance requirements: ${context.regulations.join(', ')}`);
      }
      if (context.riskLevel === 'high') {
        reasoning.push('High risk environment requires stricter controls');
      }

      rulePriorities.set(rule.rule_id, {
        ruleId: rule.rule_id,
        basePriority,
        contextPriority,
        weight,
        reasoning
      });
    });

    return rulePriorities;
  }

  /**
   * Apply regulation-specific priority adjustments
   */
  private applyRegulationPriorities(
    priorities: Map<string, Priority>,
    regulations: string[]
  ): void {
    regulations.forEach(regulation => {
      const requirements = this.REGULATION_REQUIREMENTS[regulation];
      if (requirements) {
        requirements.forEach(req => {
          priorities.set(req, 'critical');
        });
      }
    });
  }

  /**
   * Escalate specific category priorities
   */
  private escalatePriorities(
    priorities: Map<string, Priority>,
    categories: string[]
  ): void {
    categories.forEach(category => {
      const current = priorities.get(category);
      if (current) {
        priorities.set(category, this.escalatePriority(current));
      } else {
        priorities.set(category, 'high');
      }
    });
  }

  /**
   * Escalate a priority level
   */
  private escalatePriority(priority: Priority): Priority {
    switch (priority) {
      case 'low': return 'medium';
      case 'medium': return 'high';
      case 'high': return 'critical';
      case 'critical': return 'critical';
    }
  }

  /**
   * Combine two priorities (take the higher)
   */
  private combinePriorities(p1: Priority, p2: Priority): Priority {
    const order: Priority[] = ['critical', 'high', 'medium', 'low'];
    const idx1 = order.indexOf(p1);
    const idx2 = order.indexOf(p2);
    return order[Math.min(idx1, idx2)];
  }

  /**
   * Convert priority to numeric weight
   */
  private priorityToWeight(priority: Priority): number {
    switch (priority) {
      case 'critical': return 2.0;
      case 'high': return 1.5;
      case 'medium': return 1.0;
      case 'low': return 0.5;
    }
  }

  /**
   * Calculate overall scoring multiplier based on context
   */
  private calculateOverallMultiplier(context: PriorityContext): number {
    let multiplier = 1.0;

    // Stricter for regulated industries
    if (context.regulations?.length) {
      multiplier *= 1.1;
    }

    // Stricter for high-risk environments
    if (context.riskLevel === 'high') {
      multiplier *= 1.15;
    }

    // Stricter for sensitive data
    if (context.dataClassification === 'restricted') {
      multiplier *= 1.2;
    } else if (context.dataClassification === 'confidential') {
      multiplier *= 1.1;
    }

    // Slightly more lenient for internal-only APIs
    if (context.userBase === 'internal') {
      multiplier *= 0.95;
    }

    return Math.min(1.5, multiplier); // Cap at 1.5x
  }

  /**
   * Get base priority for a rule
   */
  private getBasePriority(ruleId: string): Priority {
    // Security rules are always at least high priority
    if (ruleId.startsWith('SEC') || ruleId.startsWith('AUTH')) {
      return 'high';
    }
    
    // Prerequisites are critical
    if (ruleId.startsWith('PREREQ')) {
      return 'critical';
    }
    
    // Functionality is high priority
    if (ruleId.startsWith('FUNC')) {
      return 'high';
    }
    
    // Performance and scalability are medium
    if (ruleId.startsWith('PERF') || ruleId.startsWith('SCALE')) {
      return 'medium';
    }
    
    // Documentation and best practices are low
    if (ruleId.startsWith('DOC') || ruleId.startsWith('BEST')) {
      return 'low';
    }
    
    return 'medium';
  }

  /**
   * Get category for a rule ID
   */
  private getRuleCategory(ruleId: string): string {
    const prefixMap: Record<string, string> = {
      'SEC': 'security',
      'AUTH': 'authentication',
      'FUNC': 'functionality',
      'DOC': 'documentation',
      'SCALE': 'scalability',
      'PERF': 'performance',
      'MAINT': 'consistency',
      'BEST': 'best_practices',
      'COMP': 'compliance',
      'AUDIT': 'audit',
      'PRIV': 'privacy',
      'ENCRYPT': 'encryption'
    };

    for (const [prefix, category] of Object.entries(prefixMap)) {
      if (ruleId.startsWith(prefix)) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Generate priority report
   */
  generatePriorityReport(matrix: PriorityMatrix): string {
    const lines: string[] = [
      '# Priority Analysis Report',
      '',
      '## Category Priorities',
      ''
    ];

    // Sort categories by priority
    const sortedCategories = Array.from(matrix.categories.entries())
      .sort((a, b) => this.priorityToWeight(b[1]) - this.priorityToWeight(a[1]));

    sortedCategories.forEach(([category, priority]) => {
      lines.push(`- **${category}**: ${priority.toUpperCase()}`);
    });

    lines.push('', '## Critical Rules', '');

    // List critical rules
    const criticalRules = Array.from(matrix.rules.values())
      .filter(r => r.contextPriority === 'critical')
      .sort((a, b) => b.weight - a.weight);

    if (criticalRules.length > 0) {
      criticalRules.forEach(rule => {
        lines.push(`### ${rule.ruleId}`);
        lines.push(`- Priority: ${rule.contextPriority}`);
        lines.push(`- Weight: ${rule.weight}`);
        if (rule.reasoning.length > 0) {
          lines.push('- Reasoning:');
          rule.reasoning.forEach(reason => {
            lines.push(`  - ${reason}`);
          });
        }
        lines.push('');
      });
    } else {
      lines.push('No critical rules identified for this context.');
    }

    lines.push('', `## Overall Multiplier: ${matrix.overallMultiplier.toFixed(2)}x`);

    return lines.join('\n');
  }
}