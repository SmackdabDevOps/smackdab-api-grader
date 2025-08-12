/**
 * Profile-Aware Prerequisite System
 * Only enforces prerequisites that make sense for the detected API type
 * This replaces the rigid one-size-fits-all prerequisite checking
 */

import { RULE_REGISTRY } from '../rules/registry.js';
import { GradingProfile } from '../app/profiles/profile-manager.js';

export interface Finding {
  ruleId: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  location: string;
  fixHint?: string;
  category?: string;
  line?: number;
}

export interface ProfileAwarePrerequisiteResult {
  passed: boolean;
  failures: Finding[];
  profile: GradingProfile;
  blockedReason?: string;
  requiredFixes: string[];
  skippedPrerequisites: string[]; // Prerequisites not applicable to this profile
}

/**
 * Check prerequisites based on the detected/selected profile
 * Different API types have different requirements
 */
export async function checkProfileAwarePrerequisites(
  spec: any,
  profile: GradingProfile
): Promise<ProfileAwarePrerequisiteResult> {
  const failures: Finding[] = [];
  const requiredFixes: string[] = [];
  const skippedPrerequisites: string[] = [];
  
  console.log(`Checking prerequisites for profile: ${profile.name} (${profile.type})`);
  
  // Get prerequisites that apply to this profile
  const applicablePrereqs = getApplicablePrerequisites(profile);
  const allPrereqs = ['PREREQ-001', 'PREREQ-002', 'PREREQ-003', 'PREREQ-API-ID'];
  
  // Track which prerequisites we're skipping
  for (const prereqId of allPrereqs) {
    if (!applicablePrereqs.includes(prereqId)) {
      skippedPrerequisites.push(prereqId);
      console.log(`  Skipping ${prereqId} - not required for ${profile.type} profile`);
    }
  }
  
  // Check only the prerequisites that apply to this profile
  for (const ruleId of applicablePrereqs) {
    const rule = RULE_REGISTRY[ruleId];
    if (!rule) {
      // Handle special prerequisites not in registry
      if (ruleId === 'PREREQ-API-ID') {
        const apiIdCheck = checkApiId(spec);
        failures.push(...apiIdCheck.failures);
        if (!apiIdCheck.passed) {
          requiredFixes.push('Add x-api-id using generate_api_id tool');
        }
      }
      continue;
    }
    
    // Detect targets for this rule
    const targets = rule.detect(spec);
    
    // If no targets, rule doesn't apply (passes by default)
    if (targets.length === 0) {
      continue;
    }
    
    // Validate each target
    for (const target of targets) {
      const result = rule.validate(target, spec);
      
      if (!result.passed) {
        // Customize message based on profile
        const message = customizeMessageForProfile(
          `${target.identifier}: ${result.message}`,
          ruleId,
          profile
        );
        
        failures.push({
          ruleId,
          severity: 'critical',
          message,
          location: target.location,
          fixHint: result.fixHint,
          category: rule.category
        });
        
        if (result.fixHint && !requiredFixes.includes(result.fixHint)) {
          requiredFixes.push(result.fixHint);
        }
      }
    }
  }
  
  // Also check for basic structural integrity
  const structuralIssues = checkStructuralIntegrity(spec);
  failures.push(...structuralIssues.failures);
  requiredFixes.push(...structuralIssues.fixes);
  
  const passed = failures.length === 0;
  
  return {
    passed,
    failures,
    profile,
    blockedReason: !passed 
      ? `Failed ${failures.length} prerequisite check(s) for ${profile.name} profile. These must be fixed before scoring can begin.`
      : undefined,
    requiredFixes,
    skippedPrerequisites
  };
}

/**
 * Determine which prerequisites apply to a given profile
 */
function getApplicablePrerequisites(profile: GradingProfile): string[] {
  const prereqs: string[] = [];
  
  // PREREQ-001: OpenAPI version - always required
  prereqs.push('PREREQ-001');
  
  // PREREQ-002: Authentication - based on profile
  if (profile.prerequisites.requiresAuthentication) {
    prereqs.push('PREREQ-002');
  }
  
  // PREREQ-003: Multi-tenant headers - ONLY for multi-tenant profiles!
  if (profile.prerequisites.requiresMultiTenantHeaders) {
    prereqs.push('PREREQ-003');
  }
  
  // PREREQ-API-ID: API tracking ID - usually required
  if (profile.prerequisites.requiresApiId) {
    prereqs.push('PREREQ-API-ID');
  }
  
  // Add any custom prerequisites for this profile
  if (profile.prerequisites.customPrerequisites) {
    prereqs.push(...profile.prerequisites.customPrerequisites);
  }
  
  return prereqs;
}

/**
 * Customize error messages based on profile context
 */
function customizeMessageForProfile(
  baseMessage: string,
  ruleId: string,
  profile: GradingProfile
): string {
  // Special handling for multi-tenant header requirement
  if (ruleId === 'PREREQ-003' && profile.type === 'Enterprise_SaaS') {
    return baseMessage + ' (Required for multi-tenant SaaS applications)';
  }
  
  if (ruleId === 'PREREQ-002' && profile.type === 'Custom') {
    return baseMessage + ' (Consider if authentication is needed for your use case)';
  }
  
  return baseMessage;
}

/**
 * Check for required x-api-id (same as before)
 */
function checkApiId(spec: any): { passed: boolean; failures: Finding[] } {
  const failures: Finding[] = [];
  
  if (!spec?.info?.['x-api-id']) {
    failures.push({
      ruleId: 'PREREQ-API-ID',
      severity: 'critical',
      message: `API specification missing required x-api-id. 

To fix this:
1. Run: npx tsx src/mcp/tools/api-id-generator.ts
2. Copy the generated ID
3. Add to your OpenAPI spec:
   info:
     x-api-id: <generated-id>`,
      location: '$.info',
      category: 'prerequisites',
      fixHint: 'Run: npx tsx src/mcp/tools/api-id-generator.ts'
    });
  } else {
    // Validate ID format
    const apiId = spec.info['x-api-id'];
    const validFormat = /^[a-z0-9]+_\d{13}_[a-f0-9]{16}$/;
    if (!validFormat.test(apiId)) {
      failures.push({
        ruleId: 'PREREQ-API-ID-FORMAT',
        severity: 'critical',
        message: 'Invalid x-api-id format. Use generate_api_id tool to create valid ID.',
        location: '$.info.x-api-id',
        category: 'prerequisites',
        fixHint: 'The x-api-id must follow the format: {prefix}_{timestamp}_{random}. Use generate_api_id tool.'
      });
    }
  }
  
  return { 
    passed: failures.length === 0,
    failures 
  };
}

/**
 * Check basic structural integrity of the OpenAPI spec
 */
function checkStructuralIntegrity(spec: any): { failures: Finding[], fixes: string[] } {
  const failures: Finding[] = [];
  const fixes: string[] = [];
  
  // Check for x-api-id first
  const apiIdCheck = checkApiId(spec);
  failures.push(...apiIdCheck.failures);
  if (!apiIdCheck.passed) {
    fixes.push('Add x-api-id using generate_api_id tool');
  }
  
  // Check required top-level fields
  if (!spec.openapi) {
    failures.push({
      ruleId: 'PREREQ-STRUCT',
      severity: 'critical',
      message: 'Missing openapi field',
      location: '$',
      fixHint: "Add 'openapi: 3.0.3' to the root of your specification"
    });
    fixes.push("Add 'openapi: 3.0.3'");
  }
  
  if (!spec.info) {
    failures.push({
      ruleId: 'PREREQ-STRUCT',
      severity: 'critical',
      message: 'Missing info object',
      location: '$',
      fixHint: 'Add info object with title and version'
    });
    fixes.push('Add info object');
  }
  
  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    failures.push({
      ruleId: 'PREREQ-STRUCT',
      severity: 'critical',
      message: 'No paths defined',
      location: '$',
      fixHint: 'Add at least one path to your API'
    });
    fixes.push('Add API paths');
  }
  
  return { failures, fixes };
}

/**
 * Get a human-readable explanation of why certain prerequisites were skipped
 */
export function explainSkippedPrerequisites(
  skippedPrereqs: string[],
  profile: GradingProfile
): string {
  if (skippedPrereqs.length === 0) {
    return `All standard prerequisites apply to ${profile.name} profile.`;
  }
  
  const explanations: string[] = [];
  
  for (const prereqId of skippedPrereqs) {
    switch (prereqId) {
      case 'PREREQ-003':
        explanations.push(
          `✓ X-Organization-ID headers not required (${profile.name} is not a multi-tenant API)`
        );
        break;
      case 'PREREQ-002':
        if (!profile.prerequisites.requiresAuthentication) {
          explanations.push(
            `✓ Authentication not strictly required (${profile.name} may use network-level security)`
          );
        }
        break;
      default:
        explanations.push(`✓ ${prereqId} not applicable to ${profile.name}`);
    }
  }
  
  return explanations.join('\n');
}