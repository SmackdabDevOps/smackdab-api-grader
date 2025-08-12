/**
 * Domain Detector
 * Specialized detection for vertical industries with ML-enhanced pattern matching
 */

import { BusinessDomain, BusinessContext } from './business-analyzer';

export interface DomainPattern {
  id: string;
  domain: BusinessDomain;
  pattern: RegExp | string[];
  weight: number;
  context: 'path' | 'schema' | 'operation' | 'header' | 'security';
  description: string;
}

export interface DomainDetectionResult {
  primaryDomain: BusinessDomain;
  confidence: number;
  matchedPatterns: DomainPattern[];
  secondaryDomains: Array<{ domain: BusinessDomain; confidence: number }>;
  industrySpecificFeatures: string[];
  recommendedCompliance: string[];
}

export class DomainDetector {
  // Industry-specific API patterns
  private readonly DOMAIN_PATTERNS: DomainPattern[] = [
    // Finance patterns
    {
      id: 'fin-pci',
      domain: 'finance',
      pattern: /\/(cards?|payments?|transactions?|checkout)/i,
      weight: 0.9,
      context: 'path',
      description: 'Payment card industry paths'
    },
    {
      id: 'fin-banking',
      domain: 'finance',
      pattern: /\/(accounts?|balances?|transfers?|deposits?|withdrawals?)/i,
      weight: 0.85,
      context: 'path',
      description: 'Banking operations'
    },
    {
      id: 'fin-kyc',
      domain: 'finance',
      pattern: ['kyc', 'aml', 'know-your-customer', 'anti-money-laundering'],
      weight: 0.95,
      context: 'operation',
      description: 'KYC/AML compliance'
    },
    {
      id: 'fin-trading',
      domain: 'finance',
      pattern: /\/(orders?|trades?|positions?|portfolios?|quotes?)/i,
      weight: 0.8,
      context: 'path',
      description: 'Trading platform'
    },
    
    // Healthcare patterns
    {
      id: 'health-clinical',
      domain: 'healthcare',
      pattern: /\/(patients?|appointments?|consultations?|visits?)/i,
      weight: 0.9,
      context: 'path',
      description: 'Clinical operations'
    },
    {
      id: 'health-phi',
      domain: 'healthcare',
      pattern: ['phi', 'protected-health', 'medical-record', 'patient-data'],
      weight: 0.95,
      context: 'security',
      description: 'Protected health information'
    },
    {
      id: 'health-rx',
      domain: 'healthcare',
      pattern: /\/(prescriptions?|medications?|drugs?|pharmacy)/i,
      weight: 0.85,
      context: 'path',
      description: 'Prescription management'
    },
    {
      id: 'health-hl7',
      domain: 'healthcare',
      pattern: ['hl7', 'fhir', 'dicom', 'icd-10', 'cpt'],
      weight: 0.9,
      context: 'schema',
      description: 'Healthcare standards'
    },
    
    // E-commerce patterns
    {
      id: 'ecom-catalog',
      domain: 'ecommerce',
      pattern: /\/(products?|catalog|categories|inventory)/i,
      weight: 0.85,
      context: 'path',
      description: 'Product catalog'
    },
    {
      id: 'ecom-cart',
      domain: 'ecommerce',
      pattern: /\/(cart|basket|checkout|orders?)/i,
      weight: 0.9,
      context: 'path',
      description: 'Shopping cart flow'
    },
    {
      id: 'ecom-fulfillment',
      domain: 'ecommerce',
      pattern: /\/(shipping|delivery|fulfillment|tracking)/i,
      weight: 0.8,
      context: 'path',
      description: 'Order fulfillment'
    },
    
    // Government patterns
    {
      id: 'gov-citizen',
      domain: 'government',
      pattern: /\/(citizens?|residents?|constituents?|voters?)/i,
      weight: 0.85,
      context: 'path',
      description: 'Citizen services'
    },
    {
      id: 'gov-fedramp',
      domain: 'government',
      pattern: ['fedramp', 'fisma', 'nist-800', 'state-ramp'],
      weight: 0.95,
      context: 'security',
      description: 'Government compliance'
    },
    {
      id: 'gov-permits',
      domain: 'government',
      pattern: /\/(permits?|licenses?|registrations?|applications?)/i,
      weight: 0.8,
      context: 'path',
      description: 'Permit and licensing'
    },
    
    // Education patterns
    {
      id: 'edu-academic',
      domain: 'education',
      pattern: /\/(students?|teachers?|courses?|enrollments?)/i,
      weight: 0.85,
      context: 'path',
      description: 'Academic management'
    },
    {
      id: 'edu-ferpa',
      domain: 'education',
      pattern: ['ferpa', 'student-privacy', 'education-records'],
      weight: 0.9,
      context: 'security',
      description: 'FERPA compliance'
    },
    {
      id: 'edu-lms',
      domain: 'education',
      pattern: /\/(assignments?|grades?|submissions?|quizzes?)/i,
      weight: 0.8,
      context: 'path',
      description: 'Learning management'
    },
    
    // Logistics patterns
    {
      id: 'log-shipping',
      domain: 'logistics',
      pattern: /\/(shipments?|tracking|carriers?|routes?)/i,
      weight: 0.85,
      context: 'path',
      description: 'Shipping operations'
    },
    {
      id: 'log-warehouse',
      domain: 'logistics',
      pattern: /\/(warehouse|inventory|stock|fulfillment)/i,
      weight: 0.8,
      context: 'path',
      description: 'Warehouse management'
    },
    
    // Telecommunications patterns
    {
      id: 'telco-subscriber',
      domain: 'telecommunications',
      pattern: /\/(subscribers?|lines?|numbers?|accounts?)/i,
      weight: 0.85,
      context: 'path',
      description: 'Subscriber management'
    },
    {
      id: 'telco-usage',
      domain: 'telecommunications',
      pattern: /\/(usage|billing|plans?|data|minutes)/i,
      weight: 0.8,
      context: 'path',
      description: 'Usage and billing'
    },
    
    // Manufacturing patterns
    {
      id: 'mfg-production',
      domain: 'manufacturing',
      pattern: /\/(production|assembly|manufacturing|batches?)/i,
      weight: 0.85,
      context: 'path',
      description: 'Production management'
    },
    {
      id: 'mfg-quality',
      domain: 'manufacturing',
      pattern: /\/(quality|inspection|defects?|compliance)/i,
      weight: 0.8,
      context: 'path',
      description: 'Quality control'
    }
  ];

  // Compliance requirements by industry
  private readonly INDUSTRY_COMPLIANCE: Record<BusinessDomain, {
    required: string[];
    recommended: string[];
    conditional: Array<{ condition: string; compliance: string }>;
  }> = {
    finance: {
      required: ['PCI-DSS', 'SOX'],
      recommended: ['ISO-27001', 'GDPR'],
      conditional: [
        { condition: 'eu_operations', compliance: 'MiFID-II' },
        { condition: 'us_banking', compliance: 'Dodd-Frank' },
        { condition: 'international', compliance: 'Basel-III' }
      ]
    },
    healthcare: {
      required: ['HIPAA'],
      recommended: ['HITECH', 'ISO-27001'],
      conditional: [
        { condition: 'medical_devices', compliance: 'FDA-21-CFR' },
        { condition: 'eu_operations', compliance: 'GDPR' },
        { condition: 'clinical_trials', compliance: 'GCP' }
      ]
    },
    government: {
      required: ['FedRAMP', 'FISMA'],
      recommended: ['NIST-800-53', 'ISO-27001'],
      conditional: [
        { condition: 'state_level', compliance: 'StateRAMP' },
        { condition: 'law_enforcement', compliance: 'CJIS' },
        { condition: 'defense', compliance: 'DFARS' }
      ]
    },
    education: {
      required: ['FERPA'],
      recommended: ['COPPA', 'Accessibility-508'],
      conditional: [
        { condition: 'eu_operations', compliance: 'GDPR' },
        { condition: 'online_learning', compliance: 'WCAG-2.1' },
        { condition: 'minors', compliance: 'COPPA' }
      ]
    },
    ecommerce: {
      required: ['PCI-DSS'],
      recommended: ['GDPR', 'CCPA'],
      conditional: [
        { condition: 'eu_operations', compliance: 'GDPR' },
        { condition: 'california', compliance: 'CCPA' },
        { condition: 'food_delivery', compliance: 'FDA' }
      ]
    },
    telecommunications: {
      required: ['CPNI'],
      recommended: ['ISO-27001'],
      conditional: [
        { condition: 'voip', compliance: 'E911' },
        { condition: 'marketing', compliance: 'TCPA' },
        { condition: 'eu_operations', compliance: 'GDPR' }
      ]
    },
    logistics: {
      required: [],
      recommended: ['ISO-9001', 'ISO-14001'],
      conditional: [
        { condition: 'customs', compliance: 'C-TPAT' },
        { condition: 'air_cargo', compliance: 'IATA' },
        { condition: 'maritime', compliance: 'IMO' }
      ]
    },
    manufacturing: {
      required: ['ISO-9001'],
      recommended: ['ISO-14001', 'OSHA'],
      conditional: [
        { condition: 'automotive', compliance: 'ISO-26262' },
        { condition: 'medical_devices', compliance: 'ISO-13485' },
        { condition: 'aerospace', compliance: 'AS9100' }
      ]
    },
    media: {
      required: [],
      recommended: ['DMCA', 'GDPR'],
      conditional: [
        { condition: 'children_content', compliance: 'COPPA' },
        { condition: 'eu_operations', compliance: 'GDPR' },
        { condition: 'streaming', compliance: 'Content-Ratings' }
      ]
    },
    travel: {
      required: [],
      recommended: ['PCI-DSS', 'GDPR'],
      conditional: [
        { condition: 'airlines', compliance: 'IATA' },
        { condition: 'us_operations', compliance: 'DOT' },
        { condition: 'eu_operations', compliance: 'GDPR' }
      ]
    },
    realestate: {
      required: ['Fair-Housing'],
      recommended: [],
      conditional: [
        { condition: 'lending', compliance: 'RESPA' },
        { condition: 'mortgages', compliance: 'Truth-in-Lending' },
        { condition: 'rentals', compliance: 'Fair-Housing' }
      ]
    },
    automotive: {
      required: [],
      recommended: ['ISO-26262'],
      conditional: [
        { condition: 'safety_systems', compliance: 'ISO-26262' },
        { condition: 'emissions', compliance: 'EPA' },
        { condition: 'autonomous', compliance: 'UNECE' }
      ]
    },
    energy: {
      required: [],
      recommended: ['ISO-50001'],
      conditional: [
        { condition: 'power_grid', compliance: 'NERC-CIP' },
        { condition: 'nuclear', compliance: 'NRC' },
        { condition: 'renewable', compliance: 'FERC' }
      ]
    },
    agriculture: {
      required: [],
      recommended: ['FDA', 'USDA'],
      conditional: [
        { condition: 'organic', compliance: 'Organic-Certification' },
        { condition: 'food_safety', compliance: 'FSMA' },
        { condition: 'pesticides', compliance: 'EPA' }
      ]
    },
    general: {
      required: [],
      recommended: ['GDPR', 'ISO-27001'],
      conditional: []
    }
  };

  /**
   * Detect domain with enhanced pattern matching
   */
  detectDomain(spec: any): DomainDetectionResult {
    const matchedPatterns: DomainPattern[] = [];
    const domainScores = new Map<BusinessDomain, number>();
    
    // Check path patterns
    this.checkPathPatterns(spec, matchedPatterns, domainScores);
    
    // Check schema patterns
    this.checkSchemaPatterns(spec, matchedPatterns, domainScores);
    
    // Check operation patterns
    this.checkOperationPatterns(spec, matchedPatterns, domainScores);
    
    // Check security patterns
    this.checkSecurityPatterns(spec, matchedPatterns, domainScores);
    
    // Calculate domain confidence
    const sortedDomains = Array.from(domainScores.entries())
      .sort((a, b) => b[1] - a[1]);
    
    const primaryDomain = sortedDomains[0]?.[0] || 'general';
    const primaryConfidence = sortedDomains[0]?.[1] || 0;
    
    // Get secondary domains
    const secondaryDomains = sortedDomains.slice(1, 3).map(([domain, score]) => ({
      domain,
      confidence: score
    }));
    
    // Extract industry-specific features
    const industryFeatures = this.extractIndustryFeatures(spec, primaryDomain);
    
    // Determine compliance requirements
    const recommendedCompliance = this.determineCompliance(spec, primaryDomain);
    
    return {
      primaryDomain,
      confidence: Math.min(primaryConfidence, 1),
      matchedPatterns,
      secondaryDomains,
      industrySpecificFeatures: industryFeatures,
      recommendedCompliance
    };
  }

  /**
   * Check path patterns
   */
  private checkPathPatterns(
    spec: any,
    matchedPatterns: DomainPattern[],
    domainScores: Map<BusinessDomain, number>
  ): void {
    const paths = Object.keys(spec.paths || {});
    
    this.DOMAIN_PATTERNS
      .filter(pattern => pattern.context === 'path')
      .forEach(pattern => {
        const regex = pattern.pattern as RegExp;
        const matches = paths.filter(path => regex.test(path));
        
        if (matches.length > 0) {
          matchedPatterns.push(pattern);
          const currentScore = domainScores.get(pattern.domain) || 0;
          domainScores.set(pattern.domain, currentScore + pattern.weight * matches.length / 10);
        }
      });
  }

  /**
   * Check schema patterns
   */
  private checkSchemaPatterns(
    spec: any,
    matchedPatterns: DomainPattern[],
    domainScores: Map<BusinessDomain, number>
  ): void {
    if (!spec.components?.schemas) return;
    
    const schemaNames = Object.keys(spec.components.schemas);
    const schemaDescriptions = Object.values(spec.components.schemas)
      .map((s: any) => s.description || '')
      .join(' ');
    
    const allSchemaText = [...schemaNames, schemaDescriptions].join(' ').toLowerCase();
    
    this.DOMAIN_PATTERNS
      .filter(pattern => pattern.context === 'schema')
      .forEach(pattern => {
        const keywords = pattern.pattern as string[];
        const matchCount = keywords.filter(kw => allSchemaText.includes(kw)).length;
        
        if (matchCount > 0) {
          matchedPatterns.push(pattern);
          const currentScore = domainScores.get(pattern.domain) || 0;
          domainScores.set(pattern.domain, currentScore + pattern.weight * (matchCount / keywords.length));
        }
      });
  }

  /**
   * Check operation patterns
   */
  private checkOperationPatterns(
    spec: any,
    matchedPatterns: DomainPattern[],
    domainScores: Map<BusinessDomain, number>
  ): void {
    const operations: string[] = [];
    
    Object.values(spec.paths || {}).forEach((path: any) => {
      Object.values(path).forEach((op: any) => {
        if (typeof op === 'object') {
          operations.push(op.operationId || '');
          operations.push(op.summary || '');
          operations.push(op.description || '');
        }
      });
    });
    
    const operationText = operations.join(' ').toLowerCase();
    
    this.DOMAIN_PATTERNS
      .filter(pattern => pattern.context === 'operation')
      .forEach(pattern => {
        const keywords = pattern.pattern as string[];
        const matchCount = keywords.filter(kw => operationText.includes(kw)).length;
        
        if (matchCount > 0) {
          matchedPatterns.push(pattern);
          const currentScore = domainScores.get(pattern.domain) || 0;
          domainScores.set(pattern.domain, currentScore + pattern.weight);
        }
      });
  }

  /**
   * Check security patterns
   */
  private checkSecurityPatterns(
    spec: any,
    matchedPatterns: DomainPattern[],
    domainScores: Map<BusinessDomain, number>
  ): void {
    const securityText = JSON.stringify(spec.components?.securitySchemes || {}).toLowerCase();
    const securityInfo = JSON.stringify(spec.security || []).toLowerCase();
    const allSecurityText = securityText + ' ' + securityInfo;
    
    this.DOMAIN_PATTERNS
      .filter(pattern => pattern.context === 'security')
      .forEach(pattern => {
        const keywords = pattern.pattern as string[];
        const matchCount = keywords.filter(kw => allSecurityText.includes(kw)).length;
        
        if (matchCount > 0) {
          matchedPatterns.push(pattern);
          const currentScore = domainScores.get(pattern.domain) || 0;
          domainScores.set(pattern.domain, currentScore + pattern.weight);
        }
      });
  }

  /**
   * Extract industry-specific features
   */
  private extractIndustryFeatures(spec: any, domain: BusinessDomain): string[] {
    const features: string[] = [];
    
    switch (domain) {
      case 'finance':
        if (this.hasPaymentProcessing(spec)) features.push('Payment Processing');
        if (this.hasKYCCompliance(spec)) features.push('KYC/AML Compliance');
        if (this.hasTradingFeatures(spec)) features.push('Trading Platform');
        if (this.hasBankingFeatures(spec)) features.push('Banking Operations');
        break;
        
      case 'healthcare':
        if (this.hasClinicalFeatures(spec)) features.push('Clinical Management');
        if (this.hasPHIHandling(spec)) features.push('PHI Data Handling');
        if (this.hasTelemedicine(spec)) features.push('Telemedicine Support');
        if (this.hasPrescriptionManagement(spec)) features.push('Prescription Management');
        break;
        
      case 'ecommerce':
        if (this.hasCartCheckout(spec)) features.push('Shopping Cart');
        if (this.hasInventoryManagement(spec)) features.push('Inventory Management');
        if (this.hasOrderFulfillment(spec)) features.push('Order Fulfillment');
        if (this.hasCustomerReviews(spec)) features.push('Customer Reviews');
        break;
        
      case 'government':
        if (this.hasCitizenServices(spec)) features.push('Citizen Services');
        if (this.hasPermitLicensing(spec)) features.push('Permit/Licensing');
        if (this.hasVotingFeatures(spec)) features.push('Voting System');
        if (this.hasTaxFeatures(spec)) features.push('Tax Services');
        break;
        
      case 'education':
        if (this.hasLMSFeatures(spec)) features.push('Learning Management');
        if (this.hasGradingFeatures(spec)) features.push('Grading System');
        if (this.hasEnrollmentFeatures(spec)) features.push('Enrollment Management');
        if (this.hasOnlineLearning(spec)) features.push('Online Learning');
        break;
    }
    
    return features;
  }

  /**
   * Determine compliance requirements
   */
  private determineCompliance(spec: any, domain: BusinessDomain): string[] {
    const compliance = new Set<string>();
    const industryReqs = this.INDUSTRY_COMPLIANCE[domain];
    
    // Add required compliance
    industryReqs.required.forEach(req => compliance.add(req));
    
    // Add recommended compliance
    industryReqs.recommended.forEach(req => compliance.add(req));
    
    // Check conditional compliance
    industryReqs.conditional.forEach(({ condition, compliance: comp }) => {
      if (this.checkCondition(spec, condition)) {
        compliance.add(comp);
      }
    });
    
    return Array.from(compliance);
  }

  /**
   * Check compliance condition
   */
  private checkCondition(spec: any, condition: string): boolean {
    const specString = JSON.stringify(spec).toLowerCase();
    
    switch (condition) {
      case 'eu_operations':
        return specString.includes('gdpr') || specString.includes('europe');
      case 'california':
        return specString.includes('ccpa') || specString.includes('california');
      case 'us_banking':
        return specString.includes('fdic') || specString.includes('federal reserve');
      case 'medical_devices':
        return specString.includes('device') || specString.includes('fda');
      case 'online_learning':
        return specString.includes('online') || specString.includes('remote');
      case 'minors':
        return specString.includes('children') || specString.includes('coppa');
      default:
        return false;
    }
  }

  // Industry-specific feature checkers
  private hasPaymentProcessing(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /payment|checkout|transaction/.test(p));
  }

  private hasKYCCompliance(spec: any): boolean {
    const specString = JSON.stringify(spec).toLowerCase();
    return specString.includes('kyc') || specString.includes('aml');
  }

  private hasTradingFeatures(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /trade|order|position|portfolio/.test(p));
  }

  private hasBankingFeatures(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /account|balance|transfer|deposit/.test(p));
  }

  private hasClinicalFeatures(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /patient|appointment|consultation|diagnosis/.test(p));
  }

  private hasPHIHandling(spec: any): boolean {
    const specString = JSON.stringify(spec).toLowerCase();
    return specString.includes('phi') || specString.includes('hipaa');
  }

  private hasTelemedicine(spec: any): boolean {
    const specString = JSON.stringify(spec).toLowerCase();
    return specString.includes('telehealth') || specString.includes('virtual');
  }

  private hasPrescriptionManagement(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /prescription|medication|pharmacy/.test(p));
  }

  private hasCartCheckout(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /cart|checkout|basket/.test(p));
  }

  private hasInventoryManagement(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /inventory|stock|product/.test(p));
  }

  private hasOrderFulfillment(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /order|shipping|fulfillment/.test(p));
  }

  private hasCustomerReviews(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /review|rating|feedback/.test(p));
  }

  private hasCitizenServices(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /citizen|resident|service/.test(p));
  }

  private hasPermitLicensing(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /permit|license|registration/.test(p));
  }

  private hasVotingFeatures(spec: any): boolean {
    const specString = JSON.stringify(spec).toLowerCase();
    return specString.includes('voting') || specString.includes('election');
  }

  private hasTaxFeatures(spec: any): boolean {
    const specString = JSON.stringify(spec).toLowerCase();
    return specString.includes('tax') || specString.includes('revenue');
  }

  private hasLMSFeatures(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /course|lesson|assignment/.test(p));
  }

  private hasGradingFeatures(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /grade|score|exam/.test(p));
  }

  private hasEnrollmentFeatures(spec: any): boolean {
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => /enrollment|registration|student/.test(p));
  }

  private hasOnlineLearning(spec: any): boolean {
    const specString = JSON.stringify(spec).toLowerCase();
    return specString.includes('online') || specString.includes('virtual') || specString.includes('remote');
  }
}