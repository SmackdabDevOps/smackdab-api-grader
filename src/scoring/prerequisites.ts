// Prerequisite Gating System
// Hard gates that must pass before any scoring can begin

import { RULE_REGISTRY, Rule, Target, ValidationResult } from '../rules/registry.js';

export interface Finding {
  ruleId: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  location: string;
  fixHint?: string;
  category?: string;
  line?: number;
}

export interface PrerequisiteResult {
  passed: boolean;
  failures: Finding[];
  blockedReason?: string;
  requiredFixes: string[];
}

// Define which rules are prerequisites
const PREREQUISITE_RULES = [
  'PREREQ-001', // Valid OpenAPI 3.0.3
  'PREREQ-002', // Some authentication defined
  'PREREQ-003', // X-Organization-ID on write operations
  'PREREQ-API-ID', // Required x-api-id in info section
];

/**
 * Check all prerequisite rules
 * These are hard gates - if any fail, scoring cannot proceed
 */
export async function checkPrerequisites(spec: any): Promise<PrerequisiteResult> {
  const failures: Finding[] = [];
  const requiredFixes: string[] = [];
  
  for (const ruleId of PREREQUISITE_RULES) {
    const rule = RULE_REGISTRY[ruleId];
    if (!rule) {
      console.warn(`Prerequisite rule ${ruleId} not found in registry`);
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
        failures.push({
          ruleId,
          severity: 'critical',
          message: `${target.identifier}: ${result.message}`,
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
    blockedReason: !passed 
      ? `Failed ${failures.length} prerequisite check(s). These must be fixed before scoring can begin.`
      : undefined,
    requiredFixes
  };
}

/**
 * Check for required x-api-id
 */
export function checkApiId(spec: any): { passed: boolean; failures: Finding[] } {
  const failures: Finding[] = [];
  
  if (!spec?.info?.['x-api-id']) {
    failures.push({
      ruleId: 'PREREQ-API-ID',
      severity: 'critical',
      message: 'API specification missing required x-api-id. Generate one using generate_api_id tool.',
      location: '$.info',
      category: 'prerequisites',
      fixHint: 'Use generate_api_id MCP tool to create a unique API identifier and add it to info.x-api-id'
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
  } else {
    if (!spec.info.title) {
      failures.push({
        ruleId: 'PREREQ-STRUCT',
        severity: 'critical',
        message: 'Missing API title',
        location: '$.info',
        fixHint: 'Add title to info object'
      });
      fixes.push('Add title to info');
    }
    
    if (!spec.info.version) {
      failures.push({
        ruleId: 'PREREQ-STRUCT',
        severity: 'critical',
        message: 'Missing API version',
        location: '$.info',
        fixHint: 'Add version to info object'
      });
      fixes.push('Add version to info');
    }
  }
  
  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    failures.push({
      ruleId: 'PREREQ-STRUCT',
      severity: 'critical',
      message: 'No paths defined',
      location: '$',
      fixHint: 'Add at least one path with an operation'
    });
    fixes.push('Define API paths');
  }
  
  // Check for at least one operation
  if (spec.paths) {
    let hasOperation = false;
    for (const pathItem of Object.values(spec.paths)) {
      const operations = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
      if (operations.some(op => op in (pathItem as any))) {
        hasOperation = true;
        break;
      }
    }
    
    if (!hasOperation) {
      failures.push({
        ruleId: 'PREREQ-STRUCT',
        severity: 'critical',
        message: 'No operations defined in any path',
        location: '$.paths',
        fixHint: 'Add at least one HTTP operation (GET, POST, etc.) to a path'
      });
      fixes.push('Add operations to paths');
    }
  }
  
  return { failures, fixes };
}

/**
 * Get a human-readable summary of prerequisite failures
 */
export function summarizePrerequisiteFailures(result: PrerequisiteResult): string {
  if (result.passed) {
    return 'All prerequisites passed';
  }
  
  const summary: string[] = [
    `❌ ${result.failures.length} prerequisite(s) failed:`,
    ''
  ];
  
  // Group failures by rule
  const byRule = new Map<string, Finding[]>();
  for (const failure of result.failures) {
    if (!byRule.has(failure.ruleId)) {
      byRule.set(failure.ruleId, []);
    }
    byRule.get(failure.ruleId)!.push(failure);
  }
  
  // Format each rule's failures
  for (const [ruleId, failures] of byRule) {
    const rule = RULE_REGISTRY[ruleId];
    const ruleName = rule?.description || ruleId;
    
    summary.push(`📍 ${ruleName} (${failures.length} issue${failures.length > 1 ? 's' : ''}):`);
    
    for (const failure of failures.slice(0, 3)) {  // Show first 3
      summary.push(`   • ${failure.message}`);
      if (failure.fixHint) {
        summary.push(`     💡 ${failure.fixHint}`);
      }
    }
    
    if (failures.length > 3) {
      summary.push(`   ... and ${failures.length - 3} more`);
    }
    
    summary.push('');
  }
  
  summary.push('These must be fixed before the API can be scored.');
  
  return summary.join('\n');
}

/**
 * Check if a specific prerequisite rule passes
 */
export function checkSinglePrerequisite(spec: any, ruleId: string): boolean {
  const rule = RULE_REGISTRY[ruleId];
  if (!rule || rule.severity !== 'prerequisite') {
    return true; // Not a prerequisite or doesn't exist
  }
  
  const targets = rule.detect(spec);
  if (targets.length === 0) {
    return true; // Rule doesn't apply
  }
  
  for (const target of targets) {
    const result = rule.validate(target, spec);
    if (!result.passed) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get quick fix suggestions for prerequisite failures
 */
export function getPrerequisiteQuickFixes(failures: Finding[]): Map<string, string[]> {
  const fixes = new Map<string, string[]>();
  
  for (const failure of failures) {
    if (!fixes.has(failure.ruleId)) {
      fixes.set(failure.ruleId, []);
    }
    
    const ruleFixes = fixes.get(failure.ruleId)!;
    
    // Add specific fixes based on rule
    switch (failure.ruleId) {
      case 'PREREQ-001':
        ruleFixes.push("Change 'openapi' field to '3.0.3'");
        break;
        
      case 'PREREQ-002':
        ruleFixes.push(`
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access`);
        break;
        
      case 'PREREQ-003':
        ruleFixes.push(`
components:
  parameters:
    OrganizationHeader:
      name: X-Organization-ID
      in: header
      required: true
      schema:
        type: integer
        format: int64
      description: Organization identifier for multi-tenancy`);
        break;
        
      case 'PREREQ-API-ID':
      case 'PREREQ-API-ID-FORMAT':
        ruleFixes.push('Run: generate_api_id tool to create a unique API identifier');
        ruleFixes.push('Add the generated ID to info.x-api-id in your OpenAPI spec');
        break;
    }
    
    if (failure.fixHint && !ruleFixes.includes(failure.fixHint)) {
      ruleFixes.push(failure.fixHint);
    }
  }
  
  return fixes;
}