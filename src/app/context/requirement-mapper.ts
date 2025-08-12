/**
 * Requirement Mapper
 * Maps compliance requirements and business needs to specific grading rules
 */

import { BusinessDomain, BusinessContext } from './business-analyzer';

export interface ComplianceRule {
  ruleId: string;
  compliance: string;
  requirement: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  autoFail: boolean;
  evidence: string[];
}

export interface RequirementMapping {
  compliance: string;
  rules: ComplianceRule[];
  description: string;
  references: string[];
}

export interface MappedRequirements {
  domain: BusinessDomain;
  mandatoryRules: ComplianceRule[];
  recommendedRules: ComplianceRule[];
  conditionalRules: Array<{
    condition: string;
    rules: ComplianceRule[];
  }>;
  totalRules: number;
  complianceScore: number;
}

export class RequirementMapper {
  // Compliance to rule mappings
  private readonly COMPLIANCE_RULES: Record<string, RequirementMapping> = {
    'PCI-DSS': {
      compliance: 'PCI-DSS',
      description: 'Payment Card Industry Data Security Standard',
      references: ['https://www.pcisecuritystandards.org/'],
      rules: [
        {
          ruleId: 'SEC-PCI-001',
          compliance: 'PCI-DSS',
          requirement: 'Encrypt transmission of cardholder data',
          severity: 'critical',
          autoFail: true,
          evidence: ['TLS 1.2+', 'HTTPS only', 'No sensitive data in URLs']
        },
        {
          ruleId: 'SEC-PCI-002',
          compliance: 'PCI-DSS',
          requirement: 'Strong access control measures',
          severity: 'critical',
          autoFail: true,
          evidence: ['Authentication required', 'Role-based access', 'MFA for admin']
        },
        {
          ruleId: 'SEC-PCI-003',
          compliance: 'PCI-DSS',
          requirement: 'Mask card numbers in responses',
          severity: 'critical',
          autoFail: true,
          evidence: ['Only last 4 digits visible', 'No full PAN storage']
        },
        {
          ruleId: 'AUDIT-PCI-001',
          compliance: 'PCI-DSS',
          requirement: 'Log all access to cardholder data',
          severity: 'high',
          autoFail: false,
          evidence: ['Audit endpoints', 'Immutable logs', 'Access tracking']
        },
        {
          ruleId: 'SEC-PCI-004',
          compliance: 'PCI-DSS',
          requirement: 'Regular security testing',
          severity: 'high',
          autoFail: false,
          evidence: ['Vulnerability scanning', 'Penetration testing']
        }
      ]
    },
    
    'HIPAA': {
      compliance: 'HIPAA',
      description: 'Health Insurance Portability and Accountability Act',
      references: ['https://www.hhs.gov/hipaa/'],
      rules: [
        {
          ruleId: 'SEC-HIPAA-001',
          compliance: 'HIPAA',
          requirement: 'Encrypt PHI at rest and in transit',
          severity: 'critical',
          autoFail: true,
          evidence: ['AES-256 encryption', 'TLS 1.2+', 'Encrypted storage']
        },
        {
          ruleId: 'SEC-HIPAA-002',
          compliance: 'HIPAA',
          requirement: 'Unique user identification',
          severity: 'critical',
          autoFail: true,
          evidence: ['Individual user accounts', 'No shared credentials']
        },
        {
          ruleId: 'AUDIT-HIPAA-001',
          compliance: 'HIPAA',
          requirement: 'Audit logs for PHI access',
          severity: 'critical',
          autoFail: true,
          evidence: ['Complete audit trail', 'PHI access logging', '6-year retention']
        },
        {
          ruleId: 'SEC-HIPAA-003',
          compliance: 'HIPAA',
          requirement: 'Access control and authorization',
          severity: 'critical',
          autoFail: true,
          evidence: ['Role-based access', 'Minimum necessary access']
        },
        {
          ruleId: 'SEC-HIPAA-004',
          compliance: 'HIPAA',
          requirement: 'Data integrity controls',
          severity: 'high',
          autoFail: false,
          evidence: ['Data validation', 'Integrity checksums', 'Version control']
        }
      ]
    },
    
    'GDPR': {
      compliance: 'GDPR',
      description: 'General Data Protection Regulation',
      references: ['https://gdpr.eu/'],
      rules: [
        {
          ruleId: 'PRIVACY-GDPR-001',
          compliance: 'GDPR',
          requirement: 'Consent management',
          severity: 'critical',
          autoFail: true,
          evidence: ['Explicit consent', 'Consent withdrawal', 'Consent records']
        },
        {
          ruleId: 'PRIVACY-GDPR-002',
          compliance: 'GDPR',
          requirement: 'Right to erasure (forget)',
          severity: 'critical',
          autoFail: true,
          evidence: ['Data deletion endpoints', 'Complete erasure', 'Deletion confirmation']
        },
        {
          ruleId: 'PRIVACY-GDPR-003',
          compliance: 'GDPR',
          requirement: 'Data portability',
          severity: 'high',
          autoFail: false,
          evidence: ['Data export endpoints', 'Machine-readable format', 'Complete data']
        },
        {
          ruleId: 'SEC-GDPR-001',
          compliance: 'GDPR',
          requirement: 'Data protection by design',
          severity: 'high',
          autoFail: false,
          evidence: ['Encryption', 'Pseudonymization', 'Access controls']
        },
        {
          ruleId: 'PRIVACY-GDPR-004',
          compliance: 'GDPR',
          requirement: 'Privacy notice and transparency',
          severity: 'medium',
          autoFail: false,
          evidence: ['Clear privacy policy', 'Data usage disclosure', 'Contact information']
        }
      ]
    },
    
    'FedRAMP': {
      compliance: 'FedRAMP',
      description: 'Federal Risk and Authorization Management Program',
      references: ['https://www.fedramp.gov/'],
      rules: [
        {
          ruleId: 'SEC-FEDRAMP-001',
          compliance: 'FedRAMP',
          requirement: 'FIPS 140-2 validated cryptography',
          severity: 'critical',
          autoFail: true,
          evidence: ['FIPS-validated modules', 'Approved algorithms']
        },
        {
          ruleId: 'SEC-FEDRAMP-002',
          compliance: 'FedRAMP',
          requirement: 'Continuous monitoring',
          severity: 'critical',
          autoFail: true,
          evidence: ['Real-time monitoring', 'Security metrics', 'Incident response']
        },
        {
          ruleId: 'AUDIT-FEDRAMP-001',
          compliance: 'FedRAMP',
          requirement: 'Comprehensive audit logging',
          severity: 'critical',
          autoFail: true,
          evidence: ['All system events', 'User activities', 'Security events']
        },
        {
          ruleId: 'SEC-FEDRAMP-003',
          compliance: 'FedRAMP',
          requirement: 'Multi-factor authentication',
          severity: 'critical',
          autoFail: true,
          evidence: ['MFA for all users', 'PIV/CAC support', 'Strong authentication']
        }
      ]
    },
    
    'SOX': {
      compliance: 'SOX',
      description: 'Sarbanes-Oxley Act',
      references: ['https://www.sox-online.com/'],
      rules: [
        {
          ruleId: 'AUDIT-SOX-001',
          compliance: 'SOX',
          requirement: 'Financial data audit trail',
          severity: 'critical',
          autoFail: true,
          evidence: ['Complete audit logs', 'Immutable records', '7-year retention']
        },
        {
          ruleId: 'SEC-SOX-001',
          compliance: 'SOX',
          requirement: 'Access controls for financial data',
          severity: 'critical',
          autoFail: true,
          evidence: ['Role-based access', 'Segregation of duties', 'Access reviews']
        },
        {
          ruleId: 'SEC-SOX-002',
          compliance: 'SOX',
          requirement: 'Data integrity controls',
          severity: 'high',
          autoFail: false,
          evidence: ['Change tracking', 'Version control', 'Approval workflows']
        }
      ]
    },
    
    'FERPA': {
      compliance: 'FERPA',
      description: 'Family Educational Rights and Privacy Act',
      references: ['https://www2.ed.gov/policy/gen/guid/fpco/ferpa/'],
      rules: [
        {
          ruleId: 'PRIVACY-FERPA-001',
          compliance: 'FERPA',
          requirement: 'Protect student education records',
          severity: 'critical',
          autoFail: true,
          evidence: ['Access controls', 'Encryption', 'Need-to-know basis']
        },
        {
          ruleId: 'PRIVACY-FERPA-002',
          compliance: 'FERPA',
          requirement: 'Parent/student access rights',
          severity: 'high',
          autoFail: false,
          evidence: ['Record access endpoints', 'Consent management', 'Access logs']
        },
        {
          ruleId: 'AUDIT-FERPA-001',
          compliance: 'FERPA',
          requirement: 'Disclosure tracking',
          severity: 'high',
          autoFail: false,
          evidence: ['Disclosure logs', 'Recipient tracking', 'Purpose documentation']
        }
      ]
    },
    
    'ISO-27001': {
      compliance: 'ISO-27001',
      description: 'Information Security Management System',
      references: ['https://www.iso.org/isoiec-27001-information-security.html'],
      rules: [
        {
          ruleId: 'SEC-ISO-001',
          compliance: 'ISO-27001',
          requirement: 'Risk assessment and treatment',
          severity: 'high',
          autoFail: false,
          evidence: ['Risk register', 'Threat modeling', 'Mitigation controls']
        },
        {
          ruleId: 'SEC-ISO-002',
          compliance: 'ISO-27001',
          requirement: 'Access control policy',
          severity: 'high',
          autoFail: false,
          evidence: ['Access policies', 'User management', 'Privilege controls']
        },
        {
          ruleId: 'SEC-ISO-003',
          compliance: 'ISO-27001',
          requirement: 'Cryptography controls',
          severity: 'high',
          autoFail: false,
          evidence: ['Encryption standards', 'Key management', 'Crypto policies']
        },
        {
          ruleId: 'AUDIT-ISO-001',
          compliance: 'ISO-27001',
          requirement: 'Logging and monitoring',
          severity: 'medium',
          autoFail: false,
          evidence: ['Security monitoring', 'Event logging', 'Log reviews']
        }
      ]
    },
    
    'CCPA': {
      compliance: 'CCPA',
      description: 'California Consumer Privacy Act',
      references: ['https://oag.ca.gov/privacy/ccpa'],
      rules: [
        {
          ruleId: 'PRIVACY-CCPA-001',
          compliance: 'CCPA',
          requirement: 'Consumer data access rights',
          severity: 'high',
          autoFail: false,
          evidence: ['Data access endpoints', 'Identity verification', 'Response timeline']
        },
        {
          ruleId: 'PRIVACY-CCPA-002',
          compliance: 'CCPA',
          requirement: 'Right to delete personal information',
          severity: 'high',
          autoFail: false,
          evidence: ['Deletion endpoints', 'Verification process', 'Confirmation']
        },
        {
          ruleId: 'PRIVACY-CCPA-003',
          compliance: 'CCPA',
          requirement: 'Opt-out of sale',
          severity: 'high',
          autoFail: false,
          evidence: ['Opt-out mechanism', 'Do Not Sell option', 'Preference management']
        }
      ]
    }
  };

  // Domain-specific rule requirements
  private readonly DOMAIN_RULES: Record<BusinessDomain, {
    mandatory: string[];
    recommended: string[];
    ruleWeights: Record<string, number>;
  }> = {
    finance: {
      mandatory: ['SEC-001', 'SEC-002', 'AUTH-001', 'AUDIT-001'],
      recommended: ['RATE-001', 'CACHE-001', 'MONITOR-001'],
      ruleWeights: {
        'SEC-*': 2.0,    // Double weight for security
        'AUDIT-*': 1.5,  // Higher weight for audit
        'AUTH-*': 1.5    // Higher weight for authentication
      }
    },
    healthcare: {
      mandatory: ['SEC-001', 'PRIVACY-001', 'AUDIT-001', 'AUTH-001'],
      recommended: ['CONSENT-001', 'INTEGRITY-001'],
      ruleWeights: {
        'PRIVACY-*': 2.0,  // Double weight for privacy
        'SEC-*': 2.0,      // Double weight for security
        'AUDIT-*': 1.8     // Very high weight for audit
      }
    },
    government: {
      mandatory: ['SEC-001', 'AUTH-001', 'AUDIT-001', 'ACCESS-001'],
      recommended: ['TRANSPARENCY-001', 'ACCOUNTABILITY-001'],
      ruleWeights: {
        'SEC-*': 1.8,
        'AUDIT-*': 1.8,
        'ACCESS-*': 1.5
      }
    },
    ecommerce: {
      mandatory: ['SEC-001', 'PAYMENT-001', 'CART-001'],
      recommended: ['PERF-001', 'SCALE-001', 'UX-001'],
      ruleWeights: {
        'PAYMENT-*': 2.0,
        'SEC-*': 1.5,
        'PERF-*': 1.3
      }
    },
    education: {
      mandatory: ['PRIVACY-001', 'ACCESS-001', 'AUTH-001'],
      recommended: ['ACCESSIBILITY-001', 'CONTENT-001'],
      ruleWeights: {
        'PRIVACY-*': 1.8,
        'ACCESS-*': 1.5,
        'ACCESSIBILITY-*': 1.3
      }
    },
    telecommunications: {
      mandatory: ['SEC-001', 'PRIVACY-001', 'RELIABILITY-001'],
      recommended: ['PERF-001', 'SCALE-001'],
      ruleWeights: {
        'RELIABILITY-*': 1.8,
        'PERF-*': 1.5,
        'SCALE-*': 1.5
      }
    },
    logistics: {
      mandatory: ['TRACKING-001', 'RELIABILITY-001'],
      recommended: ['PERF-001', 'INTEGRATION-001'],
      ruleWeights: {
        'TRACKING-*': 1.5,
        'RELIABILITY-*': 1.5,
        'INTEGRATION-*': 1.3
      }
    },
    manufacturing: {
      mandatory: ['QUALITY-001', 'TRACKING-001'],
      recommended: ['EFFICIENCY-001', 'SAFETY-001'],
      ruleWeights: {
        'QUALITY-*': 1.5,
        'SAFETY-*': 1.8,
        'EFFICIENCY-*': 1.3
      }
    },
    media: {
      mandatory: ['CONTENT-001', 'COPYRIGHT-001'],
      recommended: ['CDN-001', 'STREAMING-001'],
      ruleWeights: {
        'CONTENT-*': 1.3,
        'COPYRIGHT-*': 1.5,
        'STREAMING-*': 1.3
      }
    },
    travel: {
      mandatory: ['BOOKING-001', 'PAYMENT-001'],
      recommended: ['AVAILABILITY-001', 'PRICING-001'],
      ruleWeights: {
        'BOOKING-*': 1.5,
        'PAYMENT-*': 1.5,
        'AVAILABILITY-*': 1.3
      }
    },
    realestate: {
      mandatory: ['LISTING-001', 'FAIRHOUSING-001'],
      recommended: ['SEARCH-001', 'MEDIA-001'],
      ruleWeights: {
        'FAIRHOUSING-*': 2.0,
        'LISTING-*': 1.3,
        'SEARCH-*': 1.2
      }
    },
    automotive: {
      mandatory: ['SAFETY-001', 'VIN-001'],
      recommended: ['DIAGNOSTIC-001', 'RECALL-001'],
      ruleWeights: {
        'SAFETY-*': 2.0,
        'VIN-*': 1.3,
        'RECALL-*': 1.5
      }
    },
    energy: {
      mandatory: ['RELIABILITY-001', 'SAFETY-001'],
      recommended: ['EFFICIENCY-001', 'MONITORING-001'],
      ruleWeights: {
        'SAFETY-*': 1.8,
        'RELIABILITY-*': 1.8,
        'MONITORING-*': 1.3
      }
    },
    agriculture: {
      mandatory: ['TRACKING-001', 'QUALITY-001'],
      recommended: ['SUSTAINABILITY-001', 'COMPLIANCE-001'],
      ruleWeights: {
        'QUALITY-*': 1.5,
        'TRACKING-*': 1.3,
        'SUSTAINABILITY-*': 1.2
      }
    },
    general: {
      mandatory: ['SEC-001', 'AUTH-001'],
      recommended: ['DOC-001', 'TEST-001'],
      ruleWeights: {}
    }
  };

  /**
   * Map compliance requirements to specific rules
   */
  mapRequirements(context: BusinessContext): MappedRequirements {
    const mandatoryRules: ComplianceRule[] = [];
    const recommendedRules: ComplianceRule[] = [];
    const conditionalRules: Array<{ condition: string; rules: ComplianceRule[] }> = [];
    
    // Map compliance requirements to rules
    context.complianceRequirements.forEach(compliance => {
      const mapping = this.COMPLIANCE_RULES[compliance];
      if (mapping) {
        mapping.rules.forEach(rule => {
          if (rule.autoFail || rule.severity === 'critical') {
            mandatoryRules.push(rule);
          } else {
            recommendedRules.push(rule);
          }
        });
      }
    });
    
    // Add domain-specific rules
    const domainRules = this.DOMAIN_RULES[context.domain];
    if (domainRules) {
      // Add mandatory domain rules
      domainRules.mandatory.forEach(ruleId => {
        if (!mandatoryRules.some(r => r.ruleId === ruleId)) {
          mandatoryRules.push({
            ruleId,
            compliance: context.domain,
            requirement: `Domain-specific requirement for ${context.domain}`,
            severity: 'high',
            autoFail: false,
            evidence: []
          });
        }
      });
      
      // Add recommended domain rules
      domainRules.recommended.forEach(ruleId => {
        if (!recommendedRules.some(r => r.ruleId === ruleId)) {
          recommendedRules.push({
            ruleId,
            compliance: context.domain,
            requirement: `Recommended for ${context.domain}`,
            severity: 'medium',
            autoFail: false,
            evidence: []
          });
        }
      });
    }
    
    // Add conditional rules based on context
    if (context.dataClassification === 'restricted') {
      conditionalRules.push({
        condition: 'Restricted data handling',
        rules: [
          {
            ruleId: 'SEC-RESTRICTED-001',
            compliance: 'Data Classification',
            requirement: 'Enhanced encryption for restricted data',
            severity: 'critical',
            autoFail: true,
            evidence: ['AES-256', 'Key rotation', 'HSM usage']
          }
        ]
      });
    }
    
    if (context.businessCriticality === 'critical') {
      conditionalRules.push({
        condition: 'Critical business function',
        rules: [
          {
            ruleId: 'RELIABILITY-CRITICAL-001',
            compliance: 'Business Continuity',
            requirement: '99.99% uptime SLA',
            severity: 'high',
            autoFail: false,
            evidence: ['HA deployment', 'Disaster recovery', 'Failover']
          }
        ]
      });
    }
    
    if (context.geographicScope === 'global') {
      conditionalRules.push({
        condition: 'Global operations',
        rules: [
          {
            ruleId: 'GLOBAL-001',
            compliance: 'International',
            requirement: 'Multi-region compliance',
            severity: 'high',
            autoFail: false,
            evidence: ['Data residency', 'Regional compliance', 'Localization']
          }
        ]
      });
    }
    
    // Calculate compliance score
    const totalRules = mandatoryRules.length + recommendedRules.length;
    const criticalRules = mandatoryRules.filter(r => r.severity === 'critical').length;
    const complianceScore = this.calculateComplianceScore(
      mandatoryRules.length,
      recommendedRules.length,
      criticalRules
    );
    
    return {
      domain: context.domain,
      mandatoryRules,
      recommendedRules,
      conditionalRules,
      totalRules,
      complianceScore
    };
  }

  /**
   * Calculate compliance score
   */
  private calculateComplianceScore(
    mandatory: number,
    recommended: number,
    critical: number
  ): number {
    // Weight: Critical = 40%, Mandatory = 40%, Recommended = 20%
    const criticalWeight = 0.4;
    const mandatoryWeight = 0.4;
    const recommendedWeight = 0.2;
    
    const criticalScore = critical > 0 ? 100 : 0;
    const mandatoryScore = mandatory > 0 ? 100 : 0;
    const recommendedScore = Math.min(recommended * 20, 100); // Each recommended rule adds 20%
    
    return Math.round(
      criticalScore * criticalWeight +
      mandatoryScore * mandatoryWeight +
      recommendedScore * recommendedWeight
    );
  }

  /**
   * Get rule weight adjustment for domain
   */
  getRuleWeight(ruleId: string, domain: BusinessDomain): number {
    const domainRules = this.DOMAIN_RULES[domain];
    if (!domainRules) return 1.0;
    
    // Check for exact match
    if (domainRules.ruleWeights[ruleId]) {
      return domainRules.ruleWeights[ruleId];
    }
    
    // Check for pattern match
    for (const [pattern, weight] of Object.entries(domainRules.ruleWeights)) {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (ruleId.startsWith(prefix)) {
          return weight;
        }
      }
    }
    
    return 1.0;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(mapped: MappedRequirements): string {
    const lines: string[] = [
      '# Compliance Requirements Mapping',
      '',
      `## Domain: ${mapped.domain}`,
      `## Compliance Score: ${mapped.complianceScore}/100`,
      `## Total Rules: ${mapped.totalRules}`,
      '',
      '## Mandatory Rules',
      ...mapped.mandatoryRules.map(rule => 
        `- **${rule.ruleId}** [${rule.severity.toUpperCase()}]: ${rule.requirement}`
      ),
      '',
      '## Recommended Rules',
      ...mapped.recommendedRules.map(rule => 
        `- **${rule.ruleId}** [${rule.severity.toUpperCase()}]: ${rule.requirement}`
      ),
      ''
    ];
    
    if (mapped.conditionalRules.length > 0) {
      lines.push('## Conditional Rules');
      mapped.conditionalRules.forEach(({ condition, rules }) => {
        lines.push(`### Condition: ${condition}`);
        rules.forEach(rule => {
          lines.push(`- **${rule.ruleId}**: ${rule.requirement}`);
        });
        lines.push('');
      });
    }
    
    // Group by compliance standard
    const byCompliance = new Map<string, ComplianceRule[]>();
    [...mapped.mandatoryRules, ...mapped.recommendedRules].forEach(rule => {
      const rules = byCompliance.get(rule.compliance) || [];
      rules.push(rule);
      byCompliance.set(rule.compliance, rules);
    });
    
    lines.push('## By Compliance Standard');
    byCompliance.forEach((rules, compliance) => {
      lines.push(`### ${compliance}`);
      rules.forEach(rule => {
        lines.push(`- ${rule.ruleId}: ${rule.requirement}`);
      });
      lines.push('');
    });
    
    return lines.join('\n');
  }

  /**
   * Validate API against mapped requirements
   */
  validateCompliance(
    spec: any,
    mapped: MappedRequirements
  ): {
    compliant: boolean;
    violations: ComplianceRule[];
    warnings: ComplianceRule[];
    passed: ComplianceRule[];
  } {
    const violations: ComplianceRule[] = [];
    const warnings: ComplianceRule[] = [];
    const passed: ComplianceRule[] = [];
    
    // Check mandatory rules
    mapped.mandatoryRules.forEach(rule => {
      if (!this.checkRule(spec, rule)) {
        if (rule.autoFail || rule.severity === 'critical') {
          violations.push(rule);
        } else {
          warnings.push(rule);
        }
      } else {
        passed.push(rule);
      }
    });
    
    // Check recommended rules
    mapped.recommendedRules.forEach(rule => {
      if (!this.checkRule(spec, rule)) {
        warnings.push(rule);
      } else {
        passed.push(rule);
      }
    });
    
    return {
      compliant: violations.length === 0,
      violations,
      warnings,
      passed
    };
  }

  /**
   * Check if spec meets a specific rule
   */
  private checkRule(spec: any, rule: ComplianceRule): boolean {
    // Simplified rule checking - in production this would be comprehensive
    const specString = JSON.stringify(spec).toLowerCase();
    
    // Check for evidence of compliance
    if (rule.evidence.length > 0) {
      const evidenceFound = rule.evidence.some(evidence => 
        specString.includes(evidence.toLowerCase())
      );
      return evidenceFound;
    }
    
    // Default checks by rule type
    if (rule.ruleId.startsWith('SEC-')) {
      // Security rule - check for security schemes
      return spec.components?.securitySchemes != null;
    }
    
    if (rule.ruleId.startsWith('AUDIT-')) {
      // Audit rule - check for audit endpoints
      const paths = Object.keys(spec.paths || {});
      return paths.some(p => /audit|log|history/.test(p));
    }
    
    if (rule.ruleId.startsWith('PRIVACY-')) {
      // Privacy rule - check for privacy-related endpoints
      const paths = Object.keys(spec.paths || {});
      return paths.some(p => /privacy|consent|data/.test(p));
    }
    
    return false;
  }
}