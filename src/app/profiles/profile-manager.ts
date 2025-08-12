/**
 * Profile Manager
 * Manages API grading profiles and their associated rules
 * Each profile defines what rules apply and how they're weighted
 */

import { Phase2ProfileDB } from '../../mcp/persistence/db-phase2.js';

export interface ProfileRule {
  rule_id: string;
  weight: number;
  category: 'required' | 'optional' | 'disabled';
  severity_override?: 'error' | 'warning' | 'info';
  override_message?: string;
}

export interface GradingProfile {
  id: string;
  name: string;
  type: string;
  description: string;
  rules: ProfileRule[];
  prerequisites: {
    requiresMultiTenantHeaders: boolean;
    requiresAuthentication: boolean;
    requiresApiId: boolean;
    customPrerequisites?: string[];
  };
  priorityConfig: {
    security: number;
    performance: number;
    documentation: number;
    consistency: number;
    best_practices: number;
  };
}

export class ProfileManager {
  private db: Phase2ProfileDB;
  private cachedProfiles: Map<string, GradingProfile> = new Map();

  constructor(dbPath: string = './data/grader.sqlite') {
    this.db = new Phase2ProfileDB(dbPath);
  }

  async initialize() {
    await this.db.connect();
    await this.ensureDefaultProfiles();
  }

  /**
   * Ensure default profiles exist in the database
   */
  private async ensureDefaultProfiles() {
    const profiles = await this.db.listProfiles();
    
    if (profiles.length === 0) {
      // Create default profiles
      await this.createDefaultProfiles();
    }
  }

  private async createDefaultProfiles() {
    // Enterprise SaaS Profile (like Smackdab)
    await this.createProfile({
      name: 'Enterprise Multi-Tenant SaaS',
      type: 'SaaS',
      description: 'For multi-tenant SaaS applications with strict requirements',
      prerequisites: {
        requiresMultiTenantHeaders: true,  // REQUIRES X-Organization-ID!
        requiresAuthentication: true,
        requiresApiId: true,
        customPrerequisites: ['multi-tenant-isolation', 'rbac-scopes']
      },
      rules: [
        // All the strict Smackdab rules
        { rule_id: 'PREREQ-003', weight: 100, category: 'required' }, // Multi-tenant headers
        { rule_id: 'SEC-001', weight: 25, category: 'required' },
        { rule_id: 'SEC-002', weight: 20, category: 'required' },
        { rule_id: 'FUNC-001', weight: 15, category: 'required' },
        { rule_id: 'FUNC-002', weight: 15, category: 'required' },
        { rule_id: 'SCALE-001', weight: 10, category: 'required' },
        { rule_id: 'SCALE-002', weight: 10, category: 'required' },
        { rule_id: 'MAINT-001', weight: 5, category: 'required' },
      ],
      priorityConfig: {
        security: 35,      // High security priority
        performance: 20,
        documentation: 10,
        consistency: 20,
        best_practices: 15
      }
    });

    // Simple REST API Profile (no multi-tenancy)
    await this.createProfile({
      name: 'Simple REST API',
      type: 'REST',
      description: 'For standard REST APIs without multi-tenancy',
      prerequisites: {
        requiresMultiTenantHeaders: false,  // NO X-Organization-ID needed!
        requiresAuthentication: true,
        requiresApiId: true,
        customPrerequisites: []
      },
      rules: [
        // Simpler rules, no multi-tenant requirements
        { rule_id: 'SEC-001', weight: 20, category: 'required' },
        { rule_id: 'FUNC-001', weight: 20, category: 'required' },
        { rule_id: 'FUNC-002', weight: 20, category: 'required' },
        { rule_id: 'DOC-001', weight: 15, category: 'optional' },
        { rule_id: 'MAINT-001', weight: 15, category: 'optional' },
        { rule_id: 'BEST-001', weight: 10, category: 'optional' },
      ],
      priorityConfig: {
        security: 25,
        performance: 20,
        documentation: 20,  // Higher doc priority for public APIs
        consistency: 20,
        best_practices: 15
      }
    });

    // GraphQL API Profile
    await this.createProfile({
      name: 'GraphQL API',
      type: 'GraphQL',
      description: 'For GraphQL APIs with schema-first design',
      prerequisites: {
        requiresMultiTenantHeaders: false,  // GraphQL handles auth differently
        requiresAuthentication: true,
        requiresApiId: true,
        customPrerequisites: ['graphql-schema', 'introspection-control']
      },
      rules: [
        // GraphQL-specific rules
        { rule_id: 'GRAPHQL-001', weight: 25, category: 'required' },
        { rule_id: 'GRAPHQL-002', weight: 25, category: 'required' },
        { rule_id: 'SEC-001', weight: 20, category: 'required' },
        { rule_id: 'PERF-001', weight: 15, category: 'required' }, // N+1 query prevention
        { rule_id: 'DOC-001', weight: 10, category: 'optional' },
        { rule_id: 'CACHE-001', weight: 5, category: 'optional' },
      ],
      priorityConfig: {
        security: 30,
        performance: 30,    // High performance priority (N+1 queries)
        documentation: 10,   // GraphQL is self-documenting
        consistency: 15,
        best_practices: 15
      }
    });

    // Microservice Profile
    await this.createProfile({
      name: 'Microservice API',
      type: 'Microservice',
      description: 'For microservices with service mesh integration',
      prerequisites: {
        requiresMultiTenantHeaders: false,  // Service mesh handles routing
        requiresAuthentication: true,
        requiresApiId: true,
        customPrerequisites: ['health-endpoints', 'tracing-headers']
      },
      rules: [
        // Microservice-specific rules
        { rule_id: 'MICRO-001', weight: 20, category: 'required' }, // Health checks
        { rule_id: 'MICRO-002', weight: 20, category: 'required' }, // Readiness
        { rule_id: 'TRACE-001', weight: 20, category: 'required' }, // Distributed tracing
        { rule_id: 'RESILIENCE-001', weight: 15, category: 'required' }, // Circuit breakers
        { rule_id: 'SEC-001', weight: 15, category: 'required' },
        { rule_id: 'ASYNC-001', weight: 10, category: 'optional' },
      ],
      priorityConfig: {
        security: 20,
        performance: 25,
        documentation: 10,
        consistency: 15,
        best_practices: 30   // High priority on microservice patterns
      }
    });

    // Internal Tool Profile (most relaxed)
    await this.createProfile({
      name: 'Internal Tool API',
      type: 'Custom',
      description: 'For internal tools and utilities with relaxed requirements',
      prerequisites: {
        requiresMultiTenantHeaders: false,
        requiresAuthentication: false,  // May use network security instead
        requiresApiId: true,
        customPrerequisites: []
      },
      rules: [
        // Very relaxed rules for internal tools
        { rule_id: 'FUNC-001', weight: 30, category: 'required' },
        { rule_id: 'FUNC-002', weight: 30, category: 'required' },
        { rule_id: 'DOC-001', weight: 20, category: 'optional' },
        { rule_id: 'MAINT-001', weight: 20, category: 'optional' },
      ],
      priorityConfig: {
        security: 10,       // Low security (internal network)
        performance: 20,
        documentation: 30,   // High doc priority for maintainability
        consistency: 20,
        best_practices: 20
      }
    });
  }

  async createProfile(profileData: Omit<GradingProfile, 'id'>): Promise<GradingProfile> {
    const dbProfile = await this.db.createProfile({
      name: profileData.name,
      type: profileData.type,
      description: profileData.description,
      detection_patterns: {},
      priority_config: profileData.priorityConfig,
      created_by: 'system'
    });

    // Set the rules
    await this.db.setProfileRules(dbProfile.id, profileData.rules);

    const profile: GradingProfile = {
      id: dbProfile.id,
      ...profileData
    };

    this.cachedProfiles.set(profile.id, profile);
    return profile;
  }

  async getProfile(id: string): Promise<GradingProfile | null> {
    if (this.cachedProfiles.has(id)) {
      return this.cachedProfiles.get(id)!;
    }

    const dbProfile = await this.db.getProfile(id);
    if (!dbProfile) return null;

    const rules = await this.db.getProfileRules(id);
    
    const profile: GradingProfile = {
      id: dbProfile.id,
      name: dbProfile.name,
      type: dbProfile.type,
      description: dbProfile.description,
      rules: rules,
      prerequisites: this.inferPrerequisites(dbProfile, rules),
      priorityConfig: dbProfile.priority_config
    };

    this.cachedProfiles.set(id, profile);
    return profile;
  }

  async getProfileByType(type: string): Promise<GradingProfile | null> {
    const profiles = await this.db.listProfiles({ type });
    if (profiles.length === 0) return null;

    return this.getProfile(profiles[0].id);
  }

  /**
   * Get the default profile (Simple REST)
   */
  async getDefaultProfile(): Promise<GradingProfile> {
    const profile = await this.getProfileByType('REST');
    if (!profile) {
      throw new Error('Default REST profile not found');
    }
    return profile;
  }

  /**
   * Infer prerequisites from profile type and rules
   */
  private inferPrerequisites(dbProfile: any, rules: ProfileRule[]): GradingProfile['prerequisites'] {
    // Check if PREREQ-003 (multi-tenant headers) is required
    const hasMultiTenantRule = rules.some(r => 
      r.rule_id === 'PREREQ-003' && r.category === 'required'
    );

    return {
      requiresMultiTenantHeaders: hasMultiTenantRule || dbProfile.type === 'Enterprise_SaaS',
      requiresAuthentication: true, // Most APIs need auth
      requiresApiId: true, // All need tracking
      customPrerequisites: []
    };
  }

  /**
   * Check if a specific prerequisite should be enforced for a profile
   */
  shouldEnforcePrerequisite(profile: GradingProfile, prerequisiteId: string): boolean {
    switch (prerequisiteId) {
      case 'PREREQ-003': // Multi-tenant headers
        return profile.prerequisites.requiresMultiTenantHeaders;
      case 'PREREQ-002': // Authentication
        return profile.prerequisites.requiresAuthentication;
      case 'PREREQ-API-ID': // API ID
        return profile.prerequisites.requiresApiId;
      default:
        return profile.prerequisites.customPrerequisites?.includes(prerequisiteId) || false;
    }
  }

  /**
   * Get prerequisites for a profile
   */
  getProfilePrerequisites(profile: GradingProfile): string[] {
    const prereqs: string[] = [];
    
    if (profile.prerequisites.requiresApiId) {
      prereqs.push('PREREQ-API-ID');
    }
    
    if (profile.prerequisites.requiresAuthentication) {
      prereqs.push('PREREQ-002');
    }
    
    if (profile.prerequisites.requiresMultiTenantHeaders) {
      prereqs.push('PREREQ-003');
    }
    
    if (profile.prerequisites.customPrerequisites) {
      prereqs.push(...profile.prerequisites.customPrerequisites);
    }
    
    return prereqs;
  }

  async close() {
    await this.db.close();
  }
}