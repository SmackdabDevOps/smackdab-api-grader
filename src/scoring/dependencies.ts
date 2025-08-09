// Dependency Resolution System
// Ensures rules are evaluated in correct order and handles cascading failures

import { RULE_REGISTRY, Rule } from '../rules/registry.js';
import { RuleScore, scoreRule } from './coverage.js';
import { Finding } from './prerequisites.js';

export interface DependencyGraph {
  nodes: Map<string, Rule>;
  edges: Map<string, Set<string>>;  // ruleId -> dependencies
  sorted?: string[];  // Topologically sorted rule IDs
}

export interface DependencyAwareScore extends RuleScore {
  skipped: boolean;
  skipReason?: string;
  failedDependencies?: string[];
}

/**
 * Build a dependency graph from rules
 */
export function buildDependencyGraph(rules: Rule[]): DependencyGraph {
  const nodes = new Map<string, Rule>();
  const edges = new Map<string, Set<string>>();
  
  // Add all rules as nodes
  for (const rule of rules) {
    nodes.set(rule.id, rule);
    
    // Initialize edge set
    if (!edges.has(rule.id)) {
      edges.set(rule.id, new Set());
    }
    
    // Add dependencies as edges
    if (rule.dependsOn && rule.dependsOn.length > 0) {
      for (const dep of rule.dependsOn) {
        edges.get(rule.id)!.add(dep);
      }
    }
  }
  
  return { nodes, edges };
}

/**
 * Perform topological sort on the dependency graph
 * Returns rules in order they should be evaluated
 */
export function topologicalSort(graph: DependencyGraph): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>(); // For cycle detection
  const sorted: string[] = [];
  
  function visit(ruleId: string): boolean {
    // Already processed
    if (visited.has(ruleId)) {
      return true;
    }
    
    // Cycle detected
    if (visiting.has(ruleId)) {
      console.warn(`Cycle detected in rule dependencies involving ${ruleId}`);
      return false;
    }
    
    visiting.add(ruleId);
    
    // Visit dependencies first
    const deps = graph.edges.get(ruleId) || new Set();
    for (const dep of deps) {
      if (!visit(dep)) {
        return false; // Cycle detected in dependency
      }
    }
    
    visiting.delete(ruleId);
    visited.add(ruleId);
    sorted.push(ruleId);
    
    return true;
  }
  
  // Visit all nodes
  for (const ruleId of graph.nodes.keys()) {
    visit(ruleId);
  }
  
  return sorted;
}

/**
 * Score rules with dependency awareness
 * Rules with failed dependencies are skipped
 */
export function scoreWithDependencies(
  spec: any,
  ruleIds?: string[]
): Map<string, DependencyAwareScore> {
  // Get rules to score
  const rulesToScore = ruleIds 
    ? ruleIds.map(id => RULE_REGISTRY[id]).filter(r => r)
    : Object.values(RULE_REGISTRY).filter(r => r.severity !== 'prerequisite');
  
  // Build dependency graph
  const graph = buildDependencyGraph(rulesToScore);
  
  // Sort rules by dependencies
  const sorted = topologicalSort(graph);
  graph.sorted = sorted;
  
  // Track which rules failed
  const failed = new Set<string>();
  const scores = new Map<string, DependencyAwareScore>();
  
  // Score rules in dependency order
  for (const ruleId of sorted) {
    const rule = graph.nodes.get(ruleId);
    if (!rule) continue;
    
    // Check if any dependencies failed
    const failedDeps = rule.dependsOn?.filter(dep => failed.has(dep)) || [];
    
    if (failedDeps.length > 0) {
      // Skip this rule due to failed dependencies
      scores.set(ruleId, {
        ruleId: rule.id,
        ruleName: rule.description,
        category: rule.category,
        severity: rule.severity,
        applicable: false,
        coverage: 0,
        score: 0,
        maxScore: rule.points,
        targetsChecked: 0,
        targetsPassed: 0,
        findings: [{
          ruleId: rule.id,
          severity: 'info',
          message: `Skipped due to failed dependencies: ${failedDeps.join(', ')}`,
          location: '$',
          category: rule.category
        }],
        skipped: true,
        skipReason: 'Failed dependencies',
        failedDependencies: failedDeps
      });
      
      // Mark this rule as failed too (cascading)
      failed.add(ruleId);
    } else {
      // Score the rule normally
      const score = scoreRule(rule, spec);
      
      // Check if rule failed (coverage < 100%)
      if (score.applicable && score.coverage < 1.0) {
        failed.add(ruleId);
      }
      
      scores.set(ruleId, {
        ...score,
        skipped: false
      });
    }
  }
  
  return scores;
}

/**
 * Analyze dependency chains to find root causes
 */
export function analyzeDependencyChains(
  scores: Map<string, DependencyAwareScore>
): {
  rootCauses: string[];
  cascadingFailures: Map<string, string[]>;
  affectedRules: number;
} {
  const rootCauses: string[] = [];
  const cascadingFailures = new Map<string, string[]>();
  let affectedRules = 0;
  
  // Find root cause failures (failed but no failed dependencies)
  for (const [ruleId, score] of scores) {
    if (score.skipped && score.failedDependencies) {
      // This is a cascading failure
      for (const dep of score.failedDependencies) {
        if (!cascadingFailures.has(dep)) {
          cascadingFailures.set(dep, []);
        }
        cascadingFailures.get(dep)!.push(ruleId);
      }
      affectedRules++;
    } else if (score.applicable && score.coverage < 1.0) {
      // This is a root cause failure
      rootCauses.push(ruleId);
    }
  }
  
  return {
    rootCauses,
    cascadingFailures,
    affectedRules
  };
}

/**
 * Get the evaluation order for rules
 */
export function getEvaluationOrder(ruleIds?: string[]): string[] {
  const rules = ruleIds 
    ? ruleIds.map(id => RULE_REGISTRY[id]).filter(r => r)
    : Object.values(RULE_REGISTRY);
  
  const graph = buildDependencyGraph(rules);
  return topologicalSort(graph);
}

/**
 * Validate that dependencies are satisfied
 */
export function validateDependencies(): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  for (const rule of Object.values(RULE_REGISTRY)) {
    if (rule.dependsOn) {
      for (const dep of rule.dependsOn) {
        if (!RULE_REGISTRY[dep]) {
          issues.push(`Rule ${rule.id} depends on non-existent rule ${dep}`);
        }
      }
    }
  }
  
  // Check for cycles
  const graph = buildDependencyGraph(Object.values(RULE_REGISTRY));
  const sorted = topologicalSort(graph);
  
  if (sorted.length !== graph.nodes.size) {
    issues.push('Dependency graph contains cycles');
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Generate a dependency report
 */
export function generateDependencyReport(
  scores: Map<string, DependencyAwareScore>
): string {
  const lines: string[] = [
    '=== Dependency Analysis Report ===',
    ''
  ];
  
  // Analyze chains
  const analysis = analyzeDependencyChains(scores);
  
  // Report root causes
  if (analysis.rootCauses.length > 0) {
    lines.push('🔴 Root Cause Failures:');
    for (const ruleId of analysis.rootCauses) {
      const score = scores.get(ruleId);
      if (score) {
        const pct = (score.coverage * 100).toFixed(1);
        lines.push(`  • ${score.ruleName} (${pct}% coverage)`);
      }
    }
    lines.push('');
  }
  
  // Report cascading failures
  if (analysis.cascadingFailures.size > 0) {
    lines.push('🔗 Cascading Failures:');
    for (const [cause, affected] of analysis.cascadingFailures) {
      const causeRule = RULE_REGISTRY[cause];
      lines.push(`  ${causeRule?.description || cause} caused:`);
      for (const affectedId of affected) {
        const affectedRule = RULE_REGISTRY[affectedId];
        lines.push(`    → ${affectedRule?.description || affectedId}`);
      }
    }
    lines.push('');
  }
  
  // Summary
  lines.push('=== Summary ===');
  lines.push(`Root Causes: ${analysis.rootCauses.length}`);
  lines.push(`Cascading Failures: ${analysis.affectedRules}`);
  lines.push(`Total Rules Affected: ${analysis.rootCauses.length + analysis.affectedRules}`);
  
  // Recommendations
  if (analysis.rootCauses.length > 0) {
    lines.push('');
    lines.push('💡 Recommendation: Fix root cause failures first to unblock dependent rules');
  }
  
  return lines.join('\n');
}

/**
 * Get rules that would be unblocked if a specific rule is fixed
 */
export function getUnblockedRules(
  ruleId: string,
  currentScores: Map<string, DependencyAwareScore>
): string[] {
  const unblocked: string[] = [];
  
  for (const [id, score] of currentScores) {
    if (score.skipped && score.failedDependencies?.includes(ruleId)) {
      // This rule would potentially be unblocked
      // (might still be blocked by other dependencies)
      const otherFailedDeps = score.failedDependencies.filter(d => d !== ruleId);
      
      // Check if all other dependencies are passing
      let wouldUnblock = true;
      for (const dep of otherFailedDeps) {
        const depScore = currentScores.get(dep);
        if (depScore && (depScore.skipped || depScore.coverage < 1.0)) {
          wouldUnblock = false;
          break;
        }
      }
      
      if (wouldUnblock) {
        unblocked.push(id);
      }
    }
  }
  
  return unblocked;
}

/**
 * Create a visual representation of the dependency graph (for debugging)
 */
export function visualizeDependencyGraph(graph: DependencyGraph): string {
  const lines: string[] = [
    '=== Dependency Graph ===',
    ''
  ];
  
  // Group rules by category
  const byCategory = new Map<string, Rule[]>();
  for (const rule of graph.nodes.values()) {
    if (!byCategory.has(rule.category)) {
      byCategory.set(rule.category, []);
    }
    byCategory.get(rule.category)!.push(rule);
  }
  
  // Display each category
  for (const [category, rules] of byCategory) {
    lines.push(`📁 ${category.toUpperCase()}`);
    
    for (const rule of rules) {
      const deps = graph.edges.get(rule.id) || new Set();
      
      if (deps.size > 0) {
        lines.push(`  ${rule.id} → [${Array.from(deps).join(', ')}]`);
      } else {
        lines.push(`  ${rule.id} (no dependencies)`);
      }
    }
    
    lines.push('');
  }
  
  // Show evaluation order
  if (graph.sorted) {
    lines.push('Evaluation Order:');
    lines.push(graph.sorted.join(' → '));
  }
  
  return lines.join('\n');
}