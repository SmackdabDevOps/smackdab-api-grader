/**
 * Business Context Analyzer
 * Extracts business domain and context from API specifications
 * Determines industry vertical and compliance requirements
 */

export type BusinessDomain = 
  | 'finance'
  | 'healthcare'
  | 'ecommerce'
  | 'education'
  | 'government'
  | 'logistics'
  | 'manufacturing'
  | 'media'
  | 'telecommunications'
  | 'travel'
  | 'realestate'
  | 'automotive'
  | 'energy'
  | 'agriculture'
  | 'general';

export interface BusinessContext {
  domain: BusinessDomain;
  subDomain?: string;
  confidence: number;
  indicators: string[];
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  complianceRequirements: string[];
  businessCriticality: 'low' | 'medium' | 'high' | 'critical';
  userBase: 'internal' | 'b2b' | 'b2c' | 'public';
  geographicScope: 'local' | 'national' | 'regional' | 'global';
  regulatoryEnvironment: string[];
}

export interface DomainSignal {
  domain: BusinessDomain;
  signal: string;
  weight: number;
  evidence: string[];
}

export class BusinessAnalyzer {
  // Domain-specific keywords and patterns
  private readonly DOMAIN_INDICATORS: Record<BusinessDomain, string[]> = {
    finance: [
      'payment', 'transaction', 'account', 'balance', 'credit', 'debit',
      'loan', 'mortgage', 'investment', 'portfolio', 'trading', 'banking',
      'card', 'ach', 'wire', 'swift', 'iban', 'routing', 'currency',
      'exchange', 'rate', 'interest', 'dividend', 'stock', 'bond',
      'kyc', 'aml', 'compliance', 'audit', 'ledger', 'reconciliation'
    ],
    healthcare: [
      'patient', 'medical', 'health', 'clinical', 'diagnosis', 'treatment',
      'prescription', 'medication', 'drug', 'pharmacy', 'hospital', 'doctor',
      'physician', 'nurse', 'appointment', 'procedure', 'surgery', 'lab',
      'test', 'result', 'vitals', 'symptom', 'condition', 'disease',
      'insurance', 'claim', 'coverage', 'hipaa', 'phi', 'ehr', 'emr'
    ],
    ecommerce: [
      'product', 'cart', 'checkout', 'order', 'shipping', 'delivery',
      'inventory', 'catalog', 'price', 'discount', 'coupon', 'promotion',
      'customer', 'review', 'rating', 'wishlist', 'recommendation',
      'payment', 'refund', 'return', 'merchant', 'vendor', 'marketplace',
      'sku', 'variant', 'category', 'brand', 'store', 'shop'
    ],
    education: [
      'student', 'teacher', 'course', 'class', 'lesson', 'assignment',
      'grade', 'score', 'exam', 'test', 'quiz', 'curriculum', 'syllabus',
      'enrollment', 'registration', 'attendance', 'transcript', 'diploma',
      'certificate', 'degree', 'school', 'university', 'college', 'campus',
      'semester', 'term', 'academic', 'lecture', 'tutorial', 'homework'
    ],
    government: [
      'citizen', 'resident', 'permit', 'license', 'registration', 'tax',
      'benefit', 'service', 'application', 'approval', 'case', 'record',
      'document', 'certificate', 'id', 'passport', 'visa', 'immigration',
      'voting', 'election', 'policy', 'regulation', 'compliance', 'audit',
      'public', 'municipal', 'federal', 'state', 'agency', 'department'
    ],
    logistics: [
      'shipment', 'cargo', 'freight', 'container', 'package', 'parcel',
      'tracking', 'delivery', 'route', 'carrier', 'transport', 'warehouse',
      'inventory', 'stock', 'supply', 'chain', 'distribution', 'fulfillment',
      'manifest', 'customs', 'import', 'export', 'logistics', 'fleet',
      'vehicle', 'driver', 'dispatch', 'scheduling', 'dock', 'terminal'
    ],
    manufacturing: [
      'production', 'assembly', 'factory', 'plant', 'equipment', 'machine',
      'process', 'workflow', 'quality', 'inspection', 'defect', 'batch',
      'lot', 'serial', 'part', 'component', 'material', 'raw', 'finished',
      'goods', 'inventory', 'supply', 'vendor', 'procurement', 'order',
      'maintenance', 'downtime', 'efficiency', 'yield', 'capacity', 'shift'
    ],
    media: [
      'content', 'media', 'video', 'audio', 'image', 'stream', 'broadcast',
      'channel', 'program', 'episode', 'series', 'movie', 'music', 'song',
      'album', 'artist', 'publisher', 'editor', 'article', 'post', 'blog',
      'news', 'publication', 'subscription', 'viewer', 'listener', 'audience',
      'rating', 'review', 'comment', 'share', 'like', 'playlist'
    ],
    telecommunications: [
      'phone', 'call', 'sms', 'message', 'voip', 'network', 'carrier',
      'plan', 'subscription', 'data', 'usage', 'roaming', 'coverage',
      'signal', 'tower', 'cell', 'bandwidth', 'speed', 'connection',
      'number', 'line', 'device', 'sim', 'esim', 'activation', 'porting',
      'billing', 'minutes', 'text', 'international', 'domestic', 'prepaid'
    ],
    travel: [
      'booking', 'reservation', 'flight', 'hotel', 'room', 'accommodation',
      'airline', 'airport', 'departure', 'arrival', 'passenger', 'ticket',
      'itinerary', 'trip', 'vacation', 'destination', 'travel', 'tour',
      'rental', 'car', 'vehicle', 'cruise', 'ship', 'train', 'bus',
      'checkin', 'checkout', 'luggage', 'baggage', 'seat', 'upgrade'
    ],
    realestate: [
      'property', 'listing', 'house', 'apartment', 'condo', 'building',
      'real', 'estate', 'rent', 'lease', 'buy', 'sell', 'mortgage',
      'agent', 'broker', 'owner', 'tenant', 'landlord', 'inspection',
      'appraisal', 'value', 'price', 'square', 'feet', 'bedroom', 'bathroom',
      'location', 'neighborhood', 'amenity', 'viewing', 'showing', 'offer'
    ],
    automotive: [
      'vehicle', 'car', 'auto', 'truck', 'motorcycle', 'vin', 'make',
      'model', 'year', 'engine', 'transmission', 'mileage', 'fuel',
      'maintenance', 'service', 'repair', 'part', 'dealer', 'manufacturer',
      'warranty', 'insurance', 'registration', 'license', 'driver', 'test',
      'drive', 'finance', 'lease', 'trade', 'inspection', 'diagnostic'
    ],
    energy: [
      'power', 'energy', 'electricity', 'gas', 'oil', 'renewable', 'solar',
      'wind', 'nuclear', 'coal', 'grid', 'utility', 'consumption', 'usage',
      'meter', 'reading', 'bill', 'rate', 'tariff', 'peak', 'demand',
      'generation', 'transmission', 'distribution', 'outage', 'restoration',
      'efficiency', 'conservation', 'carbon', 'emission', 'sustainability'
    ],
    agriculture: [
      'farm', 'crop', 'harvest', 'planting', 'seed', 'soil', 'fertilizer',
      'pesticide', 'irrigation', 'weather', 'climate', 'yield', 'production',
      'livestock', 'cattle', 'poultry', 'dairy', 'grain', 'fruit', 'vegetable',
      'organic', 'sustainable', 'equipment', 'machinery', 'tractor', 'field',
      'acre', 'hectare', 'season', 'market', 'commodity', 'price'
    ],
    general: []
  };

  // Compliance mapping
  private readonly DOMAIN_COMPLIANCE: Record<BusinessDomain, string[]> = {
    finance: ['PCI-DSS', 'SOX', 'Basel-III', 'MiFID-II', 'Dodd-Frank', 'GDPR'],
    healthcare: ['HIPAA', 'HITECH', 'FDA-21-CFR', 'GDPR', 'HL7'],
    government: ['FedRAMP', 'FISMA', 'NIST-800-53', 'StateRAMP', 'CJIS'],
    education: ['FERPA', 'COPPA', 'GDPR', 'Accessibility-508'],
    ecommerce: ['PCI-DSS', 'GDPR', 'CCPA', 'Consumer-Protection'],
    telecommunications: ['CPNI', 'TCPA', 'E911', 'Net-Neutrality'],
    energy: ['NERC-CIP', 'ISO-50001', 'EPA-Regulations'],
    automotive: ['ISO-26262', 'UNECE', 'NHTSA'],
    logistics: ['C-TPAT', 'IATA', 'IMO', 'Customs-Regulations'],
    manufacturing: ['ISO-9001', 'ISO-14001', 'OSHA'],
    media: ['COPPA', 'DMCA', 'GDPR', 'Content-Ratings'],
    travel: ['IATA', 'PCI-DSS', 'GDPR', 'DOT-Regulations'],
    realestate: ['Fair-Housing', 'RESPA', 'Truth-in-Lending'],
    agriculture: ['FDA', 'USDA', 'EPA', 'Organic-Certification'],
    general: ['GDPR', 'CCPA']
  };

  /**
   * Analyze API specification to extract business context
   */
  analyzeContext(spec: any): BusinessContext {
    // Extract all text from spec for analysis
    const textContent = this.extractTextContent(spec);
    
    // Detect primary business domain
    const domainSignals = this.detectDomain(textContent, spec);
    const primaryDomain = this.selectPrimaryDomain(domainSignals);
    
    // Determine data classification
    const dataClassification = this.classifyDataSensitivity(spec, primaryDomain.domain);
    
    // Identify compliance requirements
    const complianceRequirements = this.identifyCompliance(primaryDomain.domain, spec);
    
    // Assess business criticality
    const businessCriticality = this.assessCriticality(spec, primaryDomain.domain);
    
    // Determine user base
    const userBase = this.determineUserBase(spec);
    
    // Identify geographic scope
    const geographicScope = this.identifyGeographicScope(spec);
    
    // Determine regulatory environment
    const regulatoryEnvironment = this.identifyRegulations(primaryDomain.domain, geographicScope);
    
    return {
      domain: primaryDomain.domain,
      subDomain: this.identifySubDomain(primaryDomain.domain, textContent),
      confidence: primaryDomain.confidence,
      indicators: primaryDomain.indicators,
      dataClassification,
      complianceRequirements,
      businessCriticality,
      userBase,
      geographicScope,
      regulatoryEnvironment
    };
  }

  /**
   * Extract all text content from spec for analysis
   */
  private extractTextContent(spec: any): string {
    const texts: string[] = [];
    
    // Add info section
    if (spec.info) {
      texts.push(spec.info.title || '');
      texts.push(spec.info.description || '');
    }
    
    // Add tags
    if (spec.tags) {
      spec.tags.forEach((tag: any) => {
        texts.push(tag.name || '');
        texts.push(tag.description || '');
      });
    }
    
    // Add paths and operations
    Object.entries(spec.paths || {}).forEach(([path, pathObj]: [string, any]) => {
      texts.push(path);
      Object.values(pathObj).forEach((op: any) => {
        if (typeof op === 'object') {
          texts.push(op.summary || '');
          texts.push(op.description || '');
          texts.push(op.operationId || '');
        }
      });
    });
    
    // Add schema names and descriptions
    if (spec.components?.schemas) {
      Object.entries(spec.components.schemas).forEach(([name, schema]: [string, any]) => {
        texts.push(name);
        texts.push(schema.description || '');
        
        // Add property names
        if (schema.properties) {
          Object.keys(schema.properties).forEach(prop => texts.push(prop));
        }
      });
    }
    
    return texts.join(' ').toLowerCase();
  }

  /**
   * Detect business domain from text content
   */
  private detectDomain(textContent: string, spec: any): DomainSignal[] {
    const signals: DomainSignal[] = [];
    
    Object.entries(this.DOMAIN_INDICATORS).forEach(([domain, keywords]) => {
      if (domain === 'general') return;
      
      const evidence: string[] = [];
      let matchCount = 0;
      
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = textContent.match(regex);
        if (matches) {
          matchCount += matches.length;
          if (evidence.length < 5) {
            evidence.push(keyword);
          }
        }
      });
      
      if (matchCount > 0) {
        signals.push({
          domain: domain as BusinessDomain,
          signal: `${matchCount} keyword matches`,
          weight: Math.min(matchCount / 10, 1) * 100,
          evidence
        });
      }
    });
    
    // Check for specific path patterns
    this.detectDomainFromPaths(spec, signals);
    
    return signals.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Detect domain from API path patterns
   */
  private detectDomainFromPaths(spec: any, signals: DomainSignal[]): void {
    const paths = Object.keys(spec.paths || {});
    
    // Finance patterns
    if (paths.some(p => /\/(accounts|transactions|payments|cards)/.test(p))) {
      const existing = signals.find(s => s.domain === 'finance');
      if (existing) {
        existing.weight *= 1.5;
        existing.evidence.push('Financial path patterns');
      } else {
        signals.push({
          domain: 'finance',
          signal: 'Financial API paths',
          weight: 60,
          evidence: ['Financial path patterns detected']
        });
      }
    }
    
    // Healthcare patterns
    if (paths.some(p => /\/(patients|appointments|prescriptions|medical)/.test(p))) {
      const existing = signals.find(s => s.domain === 'healthcare');
      if (existing) {
        existing.weight *= 1.5;
        existing.evidence.push('Healthcare path patterns');
      }
    }
    
    // E-commerce patterns
    if (paths.some(p => /\/(products|cart|checkout|orders)/.test(p))) {
      const existing = signals.find(s => s.domain === 'ecommerce');
      if (existing) {
        existing.weight *= 1.5;
        existing.evidence.push('E-commerce path patterns');
      }
    }
  }

  /**
   * Select primary domain from signals
   */
  private selectPrimaryDomain(signals: DomainSignal[]): {
    domain: BusinessDomain;
    confidence: number;
    indicators: string[];
  } {
    if (signals.length === 0) {
      return {
        domain: 'general',
        confidence: 0.5,
        indicators: ['No specific domain indicators found']
      };
    }
    
    const topSignal = signals[0];
    const secondSignal = signals[1];
    
    // Calculate confidence based on signal separation
    let confidence = Math.min(topSignal.weight / 100, 1);
    
    if (secondSignal) {
      const separation = topSignal.weight - secondSignal.weight;
      if (separation < 10) {
        confidence *= 0.8; // Low confidence if close competition
      } else if (separation > 30) {
        confidence = Math.min(confidence * 1.2, 0.95); // High confidence if clear winner
      }
    }
    
    return {
      domain: topSignal.domain,
      confidence: Math.round(confidence * 100) / 100,
      indicators: topSignal.evidence
    };
  }

  /**
   * Classify data sensitivity based on domain and content
   */
  private classifyDataSensitivity(
    spec: any,
    domain: BusinessDomain
  ): 'public' | 'internal' | 'confidential' | 'restricted' {
    // Domain-specific defaults
    const domainDefaults: Record<BusinessDomain, 'public' | 'internal' | 'confidential' | 'restricted'> = {
      finance: 'confidential',
      healthcare: 'restricted',
      government: 'confidential',
      education: 'confidential',
      ecommerce: 'internal',
      telecommunications: 'confidential',
      energy: 'internal',
      automotive: 'internal',
      logistics: 'internal',
      manufacturing: 'internal',
      media: 'public',
      travel: 'internal',
      realestate: 'public',
      agriculture: 'internal',
      general: 'internal'
    };
    
    // Check for PII indicators
    const hasPII = this.checkForPII(spec);
    if (hasPII) {
      return domain === 'healthcare' ? 'restricted' : 'confidential';
    }
    
    // Check for financial data
    const hasFinancialData = this.checkForFinancialData(spec);
    if (hasFinancialData) {
      return 'confidential';
    }
    
    // Check for public endpoints
    const hasPublicEndpoints = Object.values(spec.paths || {}).some((path: any) =>
      Object.values(path).some((op: any) => 
        !op.security || op.security.length === 0
      )
    );
    
    if (hasPublicEndpoints && domain !== 'healthcare' && domain !== 'finance') {
      return 'public';
    }
    
    return domainDefaults[domain];
  }

  /**
   * Check for PII in API
   */
  private checkForPII(spec: any): boolean {
    const piiIndicators = [
      'ssn', 'social_security', 'tax_id', 'passport', 'driver_license',
      'date_of_birth', 'dob', 'email', 'phone', 'address', 'name'
    ];
    
    const specString = JSON.stringify(spec).toLowerCase();
    return piiIndicators.some(indicator => specString.includes(indicator));
  }

  /**
   * Check for financial data
   */
  private checkForFinancialData(spec: any): boolean {
    const financialIndicators = [
      'credit_card', 'card_number', 'cvv', 'account_number', 'routing_number',
      'iban', 'swift', 'balance', 'transaction_amount'
    ];
    
    const specString = JSON.stringify(spec).toLowerCase();
    return financialIndicators.some(indicator => specString.includes(indicator));
  }

  /**
   * Identify compliance requirements
   */
  private identifyCompliance(domain: BusinessDomain, spec: any): string[] {
    const requirements = [...(this.DOMAIN_COMPLIANCE[domain] || [])];
    
    // Add GDPR if European
    if (this.hasEuropeanIndicators(spec)) {
      if (!requirements.includes('GDPR')) {
        requirements.push('GDPR');
      }
    }
    
    // Add CCPA if California
    if (this.hasCaliforniaIndicators(spec)) {
      if (!requirements.includes('CCPA')) {
        requirements.push('CCPA');
      }
    }
    
    // Add PCI-DSS if payment processing
    if (this.hasPaymentProcessing(spec)) {
      if (!requirements.includes('PCI-DSS')) {
        requirements.push('PCI-DSS');
      }
    }
    
    return requirements;
  }

  /**
   * Check for European indicators
   */
  private hasEuropeanIndicators(spec: any): boolean {
    const euIndicators = ['gdpr', 'european', 'eu', 'uk', 'germany', 'france'];
    const specString = JSON.stringify(spec).toLowerCase();
    return euIndicators.some(indicator => specString.includes(indicator));
  }

  /**
   * Check for California indicators
   */
  private hasCaliforniaIndicators(spec: any): boolean {
    const caIndicators = ['ccpa', 'california', 'ca'];
    const specString = JSON.stringify(spec).toLowerCase();
    return caIndicators.some(indicator => specString.includes(indicator));
  }

  /**
   * Check for payment processing
   */
  private hasPaymentProcessing(spec: any): boolean {
    const paymentIndicators = ['payment', 'card', 'checkout', 'transaction'];
    const paths = Object.keys(spec.paths || {});
    return paths.some(p => paymentIndicators.some(ind => p.includes(ind)));
  }

  /**
   * Assess business criticality
   */
  private assessCriticality(
    spec: any,
    domain: BusinessDomain
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Critical domains
    if (['finance', 'healthcare', 'government'].includes(domain)) {
      return 'critical';
    }
    
    // Check for critical operations
    const criticalOps = ['payment', 'auth', 'medical', 'emergency'];
    const paths = Object.keys(spec.paths || {});
    const hasCriticalOps = paths.some(p => 
      criticalOps.some(op => p.toLowerCase().includes(op))
    );
    
    if (hasCriticalOps) {
      return 'high';
    }
    
    // Check for data sensitivity
    if (this.checkForPII(spec) || this.checkForFinancialData(spec)) {
      return 'high';
    }
    
    // Domain-based defaults
    if (['ecommerce', 'telecommunications', 'energy'].includes(domain)) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Determine user base type
   */
  private determineUserBase(spec: any): 'internal' | 'b2b' | 'b2c' | 'public' {
    const paths = Object.keys(spec.paths || {});
    
    // Check for admin/internal paths
    if (paths.some(p => /\/(admin|internal|management)/.test(p))) {
      return 'internal';
    }
    
    // Check for public endpoints
    const hasPublicEndpoints = Object.values(spec.paths || {}).some((path: any) =>
      Object.values(path).some((op: any) => !op.security)
    );
    
    if (hasPublicEndpoints) {
      return 'public';
    }
    
    // Check for business indicators
    if (paths.some(p => /\/(organizations|companies|partners)/.test(p))) {
      return 'b2b';
    }
    
    // Check for consumer indicators
    if (paths.some(p => /\/(users|customers|profiles)/.test(p))) {
      return 'b2c';
    }
    
    return 'b2b'; // Default
  }

  /**
   * Identify geographic scope
   */
  private identifyGeographicScope(spec: any): 'local' | 'national' | 'regional' | 'global' {
    const specString = JSON.stringify(spec).toLowerCase();
    
    // Global indicators
    if (specString.includes('international') || 
        specString.includes('global') ||
        specString.includes('worldwide')) {
      return 'global';
    }
    
    // Regional indicators
    if (specString.includes('europe') || 
        specString.includes('asia') ||
        specString.includes('americas')) {
      return 'regional';
    }
    
    // National indicators
    if (specString.includes('national') || 
        specString.includes('federal') ||
        specString.includes('country')) {
      return 'national';
    }
    
    // Local indicators
    if (specString.includes('local') || 
        specString.includes('municipal') ||
        specString.includes('city')) {
      return 'local';
    }
    
    // Check for multi-region support
    const hasMultiRegion = Object.values(spec.paths || {}).some((path: any) =>
      Object.values(path).some((op: any) => 
        op.parameters?.some((p: any) => 
          p.name?.toLowerCase().includes('region') ||
          p.name?.toLowerCase().includes('country')
        )
      )
    );
    
    return hasMultiRegion ? 'global' : 'national';
  }

  /**
   * Identify regulatory environment
   */
  private identifyRegulations(
    domain: BusinessDomain,
    scope: 'local' | 'national' | 'regional' | 'global'
  ): string[] {
    const regulations: string[] = [];
    
    // Global regulations
    if (scope === 'global' || scope === 'regional') {
      regulations.push('GDPR', 'ISO-27001');
    }
    
    // US regulations
    if (scope === 'national' || scope === 'global') {
      if (domain === 'healthcare') regulations.push('HIPAA');
      if (domain === 'finance') regulations.push('SOX', 'Dodd-Frank');
      if (domain === 'education') regulations.push('FERPA');
      if (domain === 'government') regulations.push('FedRAMP');
    }
    
    // Industry-specific
    if (domain === 'finance') {
      regulations.push('PCI-DSS', 'Basel-III');
    }
    
    return [...new Set(regulations)];
  }

  /**
   * Identify sub-domain within primary domain
   */
  private identifySubDomain(domain: BusinessDomain, textContent: string): string | undefined {
    const subDomains: Record<BusinessDomain, Record<string, string[]>> = {
      finance: {
        'banking': ['bank', 'checking', 'savings', 'deposit'],
        'payments': ['payment', 'transaction', 'checkout', 'processing'],
        'lending': ['loan', 'credit', 'mortgage', 'underwriting'],
        'investment': ['portfolio', 'trading', 'stock', 'bond'],
        'insurance': ['policy', 'claim', 'coverage', 'premium']
      },
      healthcare: {
        'clinical': ['diagnosis', 'treatment', 'procedure', 'surgery'],
        'pharmacy': ['prescription', 'medication', 'drug', 'pharmacy'],
        'telemedicine': ['virtual', 'remote', 'telehealth', 'video'],
        'billing': ['claim', 'insurance', 'billing', 'payment'],
        'records': ['ehr', 'emr', 'medical record', 'patient record']
      },
      ecommerce: {
        'marketplace': ['seller', 'vendor', 'merchant', 'marketplace'],
        'retail': ['store', 'shop', 'retail', 'pos'],
        'subscription': ['subscription', 'recurring', 'membership'],
        'digital': ['download', 'digital', 'streaming', 'license']
      },
      // ... other domains
      general: {}
    };
    
    const domainSubDomains = subDomains[domain] || {};
    
    for (const [subDomain, keywords] of Object.entries(domainSubDomains)) {
      const matchCount = keywords.filter(kw => 
        textContent.includes(kw.toLowerCase())
      ).length;
      
      if (matchCount >= 2) {
        return subDomain;
      }
    }
    
    return undefined;
  }

  /**
   * Generate context report
   */
  generateContextReport(context: BusinessContext): string {
    const lines: string[] = [
      '# Business Context Analysis',
      '',
      `## Primary Domain: ${context.domain}`,
      context.subDomain ? `Sub-domain: ${context.subDomain}` : '',
      `Confidence: ${(context.confidence * 100).toFixed(1)}%`,
      '',
      '## Key Indicators',
      ...context.indicators.map(ind => `- ${ind}`),
      '',
      `## Data Classification: ${context.dataClassification.toUpperCase()}`,
      `## Business Criticality: ${context.businessCriticality.toUpperCase()}`,
      `## User Base: ${context.userBase.toUpperCase()}`,
      `## Geographic Scope: ${context.geographicScope.toUpperCase()}`,
      '',
      '## Compliance Requirements',
      ...context.complianceRequirements.map(req => `- ${req}`),
      '',
      '## Regulatory Environment',
      ...context.regulatoryEnvironment.map(reg => `- ${reg}`)
    ];
    
    return lines.filter(line => line !== undefined).join('\n');
  }
}