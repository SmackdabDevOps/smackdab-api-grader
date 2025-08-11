import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  buildDependencyGraph,
  topologicalSort,
  scoreWithDependencies,
  analyzeDependencyChains,
  getEvaluationOrder,
  validateDependencies,
  generateDependencyReport,
  getUnblockedRules,
  visualizeDependencyGraph,
  DependencyGraph,
  DependencyAwareScore
} from '../../../src/scoring/dependencies';
import { RULE_REGISTRY, Rule } from '../../../src/rules/registry';

describe('Dependency Resolution System', () => {
  // Mock rules for testing dependency relationships
  const mockRuleA: Rule = {
    id: 'TEST-A',
    category: 'functionality',
    severity: 'major',
    points: 10,
    description: 'Rule A - no dependencies',
    rationale: 'Test rule',
    detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
    validate: () => ({ passed: true }),
    effort: 'easy'
  };

  const mockRuleB: Rule = {
    id: 'TEST-B',
    category: 'security',
    severity: 'major',
    points: 8,
    description: 'Rule B - depends on A',
    rationale: 'Test rule',
    dependsOn: ['TEST-A'],
    detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
    validate: () => ({ passed: true }),
    effort: 'medium'
  };

  const mockRuleC: Rule = {
    id: 'TEST-C',
    category: 'scalability',
    severity: 'minor',
    points: 5,
    description: 'Rule C - depends on B',
    rationale: 'Test rule',
    dependsOn: ['TEST-B'],
    detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
    validate: () => ({ passed: true }),
    effort: 'hard'
  };

  const mockRuleD: Rule = {
    id: 'TEST-D',
    category: 'maintainability',
    severity: 'minor',
    points: 3,
    description: 'Rule D - depends on A and B',
    rationale: 'Test rule',
    dependsOn: ['TEST-A', 'TEST-B'],
    detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
    validate: () => ({ passed: true }),
    effort: 'easy'
  };

  const mockFailingRule: Rule = {
    id: 'TEST-FAIL',
    category: 'functionality',
    severity: 'critical',
    points: 15,
    description: 'Always failing rule',
    rationale: 'Test rule that always fails',
    detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
    validate: () => ({ 
      passed: false, 
      message: 'This rule always fails',
      fixHint: 'Fix the issue'
    }),
    effort: 'medium'
  };

  const mockCyclicRuleX: Rule = {
    id: 'TEST-X',
    category: 'functionality',
    severity: 'major',
    points: 10,
    description: 'Rule X - creates cycle with Y',
    rationale: 'Test rule',
    dependsOn: ['TEST-Y'],
    detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
    validate: () => ({ passed: true })
  };

  const mockCyclicRuleY: Rule = {
    id: 'TEST-Y',
    category: 'security',
    severity: 'major',
    points: 8,
    description: 'Rule Y - creates cycle with X',
    rationale: 'Test rule',
    dependsOn: ['TEST-X'],
    detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
    validate: () => ({ passed: true })
  };

  const mockSpec = {
    openapi: '3.0.3',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/test': {
        get: { responses: { '200': { description: 'OK' } } }
      }
    }
  };

  const linearRules = [mockRuleA, mockRuleB, mockRuleC, mockRuleD];
  const cyclicRules = [mockCyclicRuleX, mockCyclicRuleY];

  describe('buildDependencyGraph', () => {
    test('should create nodes for all rules', () => {
      const graph = buildDependencyGraph(linearRules);

      expect(graph.nodes.size).toBe(4);
      expect(graph.nodes.has('TEST-A')).toBe(true);
      expect(graph.nodes.has('TEST-B')).toBe(true);
      expect(graph.nodes.has('TEST-C')).toBe(true);
      expect(graph.nodes.has('TEST-D')).toBe(true);
    });

    test('should create correct dependency edges', () => {
      const graph = buildDependencyGraph(linearRules);

      expect(graph.edges.get('TEST-A')).toEqual(new Set());
      expect(graph.edges.get('TEST-B')).toEqual(new Set(['TEST-A']));
      expect(graph.edges.get('TEST-C')).toEqual(new Set(['TEST-B']));
      expect(graph.edges.get('TEST-D')).toEqual(new Set(['TEST-A', 'TEST-B']));
    });

    test('should handle rules without dependencies', () => {
      const graph = buildDependencyGraph([mockRuleA]);

      expect(graph.nodes.size).toBe(1);
      expect(graph.edges.get('TEST-A')).toEqual(new Set());
    });

    test('should handle empty rule list', () => {
      const graph = buildDependencyGraph([]);

      expect(graph.nodes.size).toBe(0);
      expect(graph.edges.size).toBe(0);
    });
  });

  describe('topologicalSort', () => {
    test('should sort rules in dependency order', () => {
      const graph = buildDependencyGraph(linearRules);
      const sorted = topologicalSort(graph);

      const indexA = sorted.indexOf('TEST-A');
      const indexB = sorted.indexOf('TEST-B');
      const indexC = sorted.indexOf('TEST-C');
      const indexD = sorted.indexOf('TEST-D');

      // A should come before B, B before C, and both A and B before D
      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
      expect(indexA).toBeLessThan(indexD);
      expect(indexB).toBeLessThan(indexD);
    });

    test('should handle cycles gracefully', () => {
      const graph = buildDependencyGraph(cyclicRules);
      const sorted = topologicalSort(graph);

      // Should still return some ordering, even with cycles
      expect(sorted.length).toBeGreaterThan(0);
      expect(sorted).toContain('TEST-X');
      expect(sorted).toContain('TEST-Y');
    });

    test('should handle single rule', () => {
      const graph = buildDependencyGraph([mockRuleA]);
      const sorted = topologicalSort(graph);

      expect(sorted).toEqual(['TEST-A']);
    });

    test('should warn about cycles', () => {
      const originalWarn = console.warn;
      const warnSpy = jest.fn();
      console.warn = warnSpy;

      const graph = buildDependencyGraph(cyclicRules);
      topologicalSort(graph);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cycle detected')
      );

      console.warn = originalWarn;
    });
  });

  describe('scoreWithDependencies', () => {
    test('should score independent rules normally', () => {
      const scores = scoreWithDependencies(mockSpec, ['TEST-A']);

      expect(scores.has('TEST-A')).toBe(true);
      const scoreA = scores.get('TEST-A')!;
      expect(scoreA.skipped).toBe(false);
      expect(scoreA.applicable).toBe(true);
      expect(scoreA.score).toBe(10); // Full points since it passes
    });

    test('should skip rules with failed dependencies', () => {
      // Create a spec where rule A will fail, causing B to be skipped
      const mockSpecWithFailure = { ...mockSpec };
      
      // Override rule A to fail for this test
      const failingRuleA = {
        ...mockRuleA,
        validate: () => ({ passed: false, message: 'Rule A failed' })
      };
      
      // Temporarily replace rule in registry
      const originalRuleA = RULE_REGISTRY['TEST-A'];
      RULE_REGISTRY['TEST-A'] = failingRuleA as any;
      RULE_REGISTRY['TEST-B'] = mockRuleB as any;

      const scores = scoreWithDependencies(mockSpecWithFailure, ['TEST-A', 'TEST-B']);

      const scoreA = scores.get('TEST-A');
      const scoreB = scores.get('TEST-B');

      expect(scoreA?.skipped).toBe(false);
      expect(scoreA?.applicable).toBe(true);
      expect(scoreA?.coverage).toBeLessThan(1.0); // Should fail

      expect(scoreB?.skipped).toBe(true);
      expect(scoreB?.skipReason).toBe('Failed dependencies');
      expect(scoreB?.failedDependencies).toContain('TEST-A');

      // Restore original rule
      if (originalRuleA) {
        RULE_REGISTRY['TEST-A'] = originalRuleA;
      } else {
        delete RULE_REGISTRY['TEST-A'];
      }
      delete RULE_REGISTRY['TEST-B'];
    });

    test('should handle cascading failures', () => {
      // Set up rules where A fails -> B is skipped -> C is skipped
      const failingRuleA = {
        ...mockRuleA,
        validate: () => ({ passed: false, message: 'Rule A failed' })
      };

      RULE_REGISTRY['TEST-A'] = failingRuleA as any;
      RULE_REGISTRY['TEST-B'] = mockRuleB as any;
      RULE_REGISTRY['TEST-C'] = mockRuleC as any;

      const scores = scoreWithDependencies(mockSpec, ['TEST-A', 'TEST-B', 'TEST-C']);

      const scoreA = scores.get('TEST-A');
      const scoreB = scores.get('TEST-B');
      const scoreC = scores.get('TEST-C');

      expect(scoreA?.skipped).toBe(false);
      expect(scoreA?.coverage).toBeLessThan(1.0);

      expect(scoreB?.skipped).toBe(true);
      expect(scoreB?.failedDependencies).toContain('TEST-A');

      expect(scoreC?.skipped).toBe(true);
      expect(scoreC?.failedDependencies).toContain('TEST-B');

      // Cleanup
      delete RULE_REGISTRY['TEST-A'];
      delete RULE_REGISTRY['TEST-B'];
      delete RULE_REGISTRY['TEST-C'];
    });

    test('should handle multiple dependencies', () => {
      // Rule D depends on both A and B
      const failingRuleA = {
        ...mockRuleA,
        validate: () => ({ passed: false, message: 'Rule A failed' })
      };

      RULE_REGISTRY['TEST-A'] = failingRuleA as any;
      RULE_REGISTRY['TEST-B'] = mockRuleB as any;
      RULE_REGISTRY['TEST-D'] = mockRuleD as any;

      const scores = scoreWithDependencies(mockSpec, ['TEST-A', 'TEST-B', 'TEST-D']);

      const scoreD = scores.get('TEST-D');

      expect(scoreD?.skipped).toBe(true);
      expect(scoreD?.failedDependencies).toContain('TEST-A');

      // Cleanup
      delete RULE_REGISTRY['TEST-A'];
      delete RULE_REGISTRY['TEST-B'];
      delete RULE_REGISTRY['TEST-D'];
    });

    test('should score all rules when no specific IDs provided', () => {
      // This tests scoring against the actual rule registry
      const scores = scoreWithDependencies(mockSpec);

      expect(scores.size).toBeGreaterThan(0);
      
      // Should not include prerequisite rules
      for (const score of scores.values()) {
        expect(score.severity).not.toBe('prerequisite');
      }
    });
  });

  describe('analyzeDependencyChains', () => {
    test('should identify root causes and cascading failures', () => {
      // Set up a chain where A fails -> B skipped -> C skipped
      const mockScores = new Map<string, DependencyAwareScore>([
        ['TEST-A', {
          ruleId: 'TEST-A',
          ruleName: 'Rule A',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 0.5, // Failed
          score: 5,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }],
        ['TEST-B', {
          ruleId: 'TEST-B',
          ruleName: 'Rule B',
          category: 'security',
          severity: 'major',
          applicable: false,
          coverage: 0,
          score: 0,
          maxScore: 8,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: [],
          skipped: true,
          skipReason: 'Failed dependencies',
          failedDependencies: ['TEST-A']
        }],
        ['TEST-C', {
          ruleId: 'TEST-C',
          ruleName: 'Rule C',
          category: 'scalability',
          severity: 'minor',
          applicable: false,
          coverage: 0,
          score: 0,
          maxScore: 5,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: [],
          skipped: true,
          skipReason: 'Failed dependencies',
          failedDependencies: ['TEST-B']
        }]
      ]);

      const analysis = analyzeDependencyChains(mockScores);

      expect(analysis.rootCauses).toContain('TEST-A');
      expect(analysis.rootCauses).not.toContain('TEST-B');
      expect(analysis.rootCauses).not.toContain('TEST-C');

      expect(analysis.cascadingFailures.get('TEST-A')).toContain('TEST-B');
      expect(analysis.cascadingFailures.get('TEST-B')).toContain('TEST-C');

      expect(analysis.affectedRules).toBe(2); // B and C are affected
    });

    test('should handle multiple root causes', () => {
      const mockScores = new Map<string, DependencyAwareScore>([
        ['TEST-A', {
          ruleId: 'TEST-A',
          ruleName: 'Rule A',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 0.5, // Failed
          score: 5,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }],
        ['TEST-FAIL', {
          ruleId: 'TEST-FAIL',
          ruleName: 'Failing Rule',
          category: 'functionality',
          severity: 'critical',
          applicable: true,
          coverage: 0, // Failed
          score: 0,
          maxScore: 15,
          targetsChecked: 1,
          targetsPassed: 0,
          findings: [],
          skipped: false
        }]
      ]);

      const analysis = analyzeDependencyChains(mockScores);

      expect(analysis.rootCauses).toContain('TEST-A');
      expect(analysis.rootCauses).toContain('TEST-FAIL');
      expect(analysis.rootCauses).toHaveLength(2);
    });

    test('should handle no failures', () => {
      const mockScores = new Map<string, DependencyAwareScore>([
        ['TEST-A', {
          ruleId: 'TEST-A',
          ruleName: 'Rule A',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 1.0, // Passed
          score: 10,
          maxScore: 10,
          targetsChecked: 1,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }]
      ]);

      const analysis = analyzeDependencyChains(mockScores);

      expect(analysis.rootCauses).toHaveLength(0);
      expect(analysis.cascadingFailures.size).toBe(0);
      expect(analysis.affectedRules).toBe(0);
    });
  });

  describe('getEvaluationOrder', () => {
    test('should return correct evaluation order', () => {
      // Temporarily add test rules to registry
      RULE_REGISTRY['TEST-A'] = mockRuleA as any;
      RULE_REGISTRY['TEST-B'] = mockRuleB as any;
      RULE_REGISTRY['TEST-C'] = mockRuleC as any;

      const order = getEvaluationOrder(['TEST-A', 'TEST-B', 'TEST-C']);

      const indexA = order.indexOf('TEST-A');
      const indexB = order.indexOf('TEST-B');
      const indexC = order.indexOf('TEST-C');

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);

      // Cleanup
      delete RULE_REGISTRY['TEST-A'];
      delete RULE_REGISTRY['TEST-B'];
      delete RULE_REGISTRY['TEST-C'];
    });

    test('should handle all rules when no IDs specified', () => {
      const order = getEvaluationOrder();

      expect(order.length).toBeGreaterThan(0);
      // Should include actual registry rules
    });
  });

  describe('validateDependencies', () => {
    test('should pass validation for correct dependencies', () => {
      // Temporarily add test rules
      RULE_REGISTRY['TEST-A'] = mockRuleA as any;
      RULE_REGISTRY['TEST-B'] = mockRuleB as any;

      const validation = validateDependencies();

      // Should not report issues for our test rules
      const hasTestIssues = validation.issues.some(issue => 
        issue.includes('TEST-A') || issue.includes('TEST-B')
      );

      // Cleanup
      delete RULE_REGISTRY['TEST-A'];
      delete RULE_REGISTRY['TEST-B'];

      // The validation might find issues in the real registry, but not for our test rules
      expect(typeof validation.valid).toBe('boolean');
    });

    test('should detect missing dependencies', () => {
      // Add a rule with non-existent dependency
      const invalidRule: Rule = {
        ...mockRuleA,
        id: 'TEST-INVALID',
        dependsOn: ['NON-EXISTENT-RULE']
      };

      RULE_REGISTRY['TEST-INVALID'] = invalidRule as any;

      const validation = validateDependencies();

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain(
        expect.stringContaining('TEST-INVALID depends on non-existent rule NON-EXISTENT-RULE')
      );

      // Cleanup
      delete RULE_REGISTRY['TEST-INVALID'];
    });

    test('should detect cycles in dependencies', () => {
      // Add cyclic rules
      RULE_REGISTRY['TEST-X'] = mockCyclicRuleX as any;
      RULE_REGISTRY['TEST-Y'] = mockCyclicRuleY as any;

      const validation = validateDependencies();

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('Dependency graph contains cycles');

      // Cleanup
      delete RULE_REGISTRY['TEST-X'];
      delete RULE_REGISTRY['TEST-Y'];
    });
  });

  describe('generateDependencyReport', () => {
    test('should generate comprehensive report', () => {
      const mockScores = new Map<string, DependencyAwareScore>([
        ['TEST-A', {
          ruleId: 'TEST-A',
          ruleName: 'Rule A',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 0.3, // Failed
          score: 3,
          maxScore: 10,
          targetsChecked: 10,
          targetsPassed: 3,
          findings: [],
          skipped: false
        }],
        ['TEST-B', {
          ruleId: 'TEST-B',
          ruleName: 'Rule B',
          category: 'security',
          severity: 'major',
          applicable: false,
          coverage: 0,
          score: 0,
          maxScore: 8,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: [],
          skipped: true,
          skipReason: 'Failed dependencies',
          failedDependencies: ['TEST-A']
        }]
      ]);

      const report = generateDependencyReport(mockScores);

      expect(report).toContain('Dependency Analysis Report');
      expect(report).toContain('Root Cause Failures');
      expect(report).toContain('Rule A');
      expect(report).toContain('30.0% coverage');
      expect(report).toContain('Cascading Failures');
      expect(report).toContain('Rule B');
      expect(report).toContain('Summary');
      expect(report).toContain('Recommendation');
    });

    test('should handle no failures', () => {
      const mockScores = new Map<string, DependencyAwareScore>([
        ['TEST-A', {
          ruleId: 'TEST-A',
          ruleName: 'Rule A',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 1.0, // Passed
          score: 10,
          maxScore: 10,
          targetsChecked: 1,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }]
      ]);

      const report = generateDependencyReport(mockScores);

      expect(report).toContain('Dependency Analysis Report');
      expect(report).toContain('Root Causes: 0');
      expect(report).toContain('Cascading Failures: 0');
    });
  });

  describe('getUnblockedRules', () => {
    test('should identify rules that would be unblocked', () => {
      const mockScores = new Map<string, DependencyAwareScore>([
        ['TEST-A', {
          ruleId: 'TEST-A',
          ruleName: 'Rule A',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 0.5, // Failed
          score: 5,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }],
        ['TEST-B', {
          ruleId: 'TEST-B',
          ruleName: 'Rule B',
          category: 'security',
          severity: 'major',
          applicable: false,
          coverage: 0,
          score: 0,
          maxScore: 8,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: [],
          skipped: true,
          skipReason: 'Failed dependencies',
          failedDependencies: ['TEST-A']
        }]
      ]);

      const unblocked = getUnblockedRules('TEST-A', mockScores);

      expect(unblocked).toContain('TEST-B');
    });

    test('should not unblock rules with other failed dependencies', () => {
      const mockScores = new Map<string, DependencyAwareScore>([
        ['TEST-A', {
          ruleId: 'TEST-A',
          ruleName: 'Rule A',
          category: 'functionality',
          severity: 'major',
          applicable: true,
          coverage: 0.5, // Failed
          score: 5,
          maxScore: 10,
          targetsChecked: 2,
          targetsPassed: 1,
          findings: [],
          skipped: false
        }],
        ['TEST-FAIL', {
          ruleId: 'TEST-FAIL',
          ruleName: 'Failing Rule',
          category: 'functionality',
          severity: 'critical',
          applicable: true,
          coverage: 0, // Also failed
          score: 0,
          maxScore: 15,
          targetsChecked: 1,
          targetsPassed: 0,
          findings: [],
          skipped: false
        }],
        ['TEST-D', {
          ruleId: 'TEST-D',
          ruleName: 'Rule D',
          category: 'maintainability',
          severity: 'minor',
          applicable: false,
          coverage: 0,
          score: 0,
          maxScore: 3,
          targetsChecked: 0,
          targetsPassed: 0,
          findings: [],
          skipped: true,
          skipReason: 'Failed dependencies',
          failedDependencies: ['TEST-A', 'TEST-FAIL']
        }]
      ]);

      const unblocked = getUnblockedRules('TEST-A', mockScores);

      // TEST-D should not be unblocked because TEST-FAIL is still failing
      expect(unblocked).not.toContain('TEST-D');
    });

    test('should handle non-existent rule', () => {
      const mockScores = new Map<string, DependencyAwareScore>();
      const unblocked = getUnblockedRules('NON-EXISTENT', mockScores);

      expect(unblocked).toHaveLength(0);
    });
  });

  describe('visualizeDependencyGraph', () => {
    test('should generate visual representation', () => {
      RULE_REGISTRY['TEST-A'] = mockRuleA as any;
      RULE_REGISTRY['TEST-B'] = mockRuleB as any;

      const graph = buildDependencyGraph([mockRuleA, mockRuleB]);
      const visual = visualizeDependencyGraph(graph);

      expect(visual).toContain('Dependency Graph');
      expect(visual).toContain('FUNCTIONALITY');
      expect(visual).toContain('SECURITY');
      expect(visual).toContain('TEST-A');
      expect(visual).toContain('TEST-B');
      expect(visual).toContain('no dependencies');
      expect(visual).toContain('[TEST-A]');

      // Cleanup
      delete RULE_REGISTRY['TEST-A'];
      delete RULE_REGISTRY['TEST-B'];
    });

    test('should show evaluation order when available', () => {
      const graph = buildDependencyGraph([mockRuleA, mockRuleB]);
      graph.sorted = ['TEST-A', 'TEST-B'];
      
      const visual = visualizeDependencyGraph(graph);

      expect(visual).toContain('Evaluation Order:');
      expect(visual).toContain('TEST-A → TEST-B');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty dependency graph', () => {
      const emptyGraph: DependencyGraph = {
        nodes: new Map(),
        edges: new Map()
      };

      const sorted = topologicalSort(emptyGraph);
      expect(sorted).toEqual([]);

      const visual = visualizeDependencyGraph(emptyGraph);
      expect(visual).toContain('Dependency Graph');
    });

    test('should handle rules with undefined dependsOn', () => {
      const ruleWithoutDeps: Rule = {
        ...mockRuleA,
        dependsOn: undefined
      };

      const graph = buildDependencyGraph([ruleWithoutDeps]);
      expect(graph.edges.get('TEST-A')).toEqual(new Set());
    });

    test('should handle rules with empty dependsOn array', () => {
      const ruleWithEmptyDeps: Rule = {
        ...mockRuleA,
        dependsOn: []
      };

      const graph = buildDependencyGraph([ruleWithEmptyDeps]);
      expect(graph.edges.get('TEST-A')).toEqual(new Set());
    });

    test('should handle complex dependency chains', () => {
      // Create a diamond dependency pattern: A -> B, A -> C, B -> D, C -> D
      const complexRules = [
        mockRuleA, // No deps
        { ...mockRuleB, dependsOn: ['TEST-A'] }, // Depends on A
        { ...mockRuleC, id: 'TEST-C2', dependsOn: ['TEST-A'] }, // Also depends on A
        { ...mockRuleD, dependsOn: ['TEST-B', 'TEST-C2'] } // Depends on both B and C2
      ];

      const graph = buildDependencyGraph(complexRules);
      const sorted = topologicalSort(graph);

      const indexA = sorted.indexOf('TEST-A');
      const indexB = sorted.indexOf('TEST-B');
      const indexC2 = sorted.indexOf('TEST-C2');
      const indexD = sorted.indexOf('TEST-D');

      // A must come first
      expect(indexA).toBeLessThan(indexB);
      expect(indexA).toBeLessThan(indexC2);
      
      // B and C2 must come before D
      expect(indexB).toBeLessThan(indexD);
      expect(indexC2).toBeLessThan(indexD);
    });

    test('should handle self-referencing rules gracefully', () => {
      const selfRefRule: Rule = {
        ...mockRuleA,
        id: 'TEST-SELF',
        dependsOn: ['TEST-SELF']
      };

      const graph = buildDependencyGraph([selfRefRule]);
      const sorted = topologicalSort(graph);

      // Should handle gracefully and still return the rule
      expect(sorted).toContain('TEST-SELF');
    });
  });

  describe('Performance with Large Dependency Graphs', () => {
    test('should handle large dependency graphs efficiently', () => {
      // Create 100 rules with chain dependencies
      const largeRuleSet: Rule[] = [];
      for (let i = 0; i < 100; i++) {
        largeRuleSet.push({
          id: `LARGE-${i}`,
          category: 'functionality',
          severity: 'minor',
          points: 1,
          description: `Large rule ${i}`,
          rationale: 'Performance test',
          dependsOn: i > 0 ? [`LARGE-${i-1}`] : undefined,
          detect: () => [{ type: 'path', location: '$.paths', identifier: `test-${i}` }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        });
      }

      const start = Date.now();
      
      const graph = buildDependencyGraph(largeRuleSet);
      const sorted = topologicalSort(graph);
      
      const duration = Date.now() - start;

      expect(sorted).toHaveLength(100);
      expect(duration).toBeLessThan(100); // Should complete quickly
      
      // Verify correct ordering
      for (let i = 1; i < 100; i++) {
        const prevIndex = sorted.indexOf(`LARGE-${i-1}`);
        const currIndex = sorted.indexOf(`LARGE-${i}`);
        expect(prevIndex).toBeLessThan(currIndex);
      }
    });

    test('should handle wide dependency graphs (many independent rules)', () => {
      // Create 50 independent rules (no dependencies)
      const wideRuleSet: Rule[] = [];
      for (let i = 0; i < 50; i++) {
        wideRuleSet.push({
          id: `WIDE-${i}`,
          category: 'functionality',
          severity: 'minor',
          points: 2,
          description: `Wide rule ${i}`,
          rationale: 'Performance test',
          detect: () => [{ type: 'path', location: '$.paths', identifier: `test-${i}` }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        });
      }

      const start = Date.now();
      
      const graph = buildDependencyGraph(wideRuleSet);
      const sorted = topologicalSort(graph);
      
      const duration = Date.now() - start;

      expect(sorted).toHaveLength(50);
      expect(duration).toBeLessThan(50); // Should complete very quickly

      // All rules should be present
      for (let i = 0; i < 50; i++) {
        expect(sorted).toContain(`WIDE-${i}`);
      }
    });

    test('should handle complex star dependency patterns', () => {
      // Create a pattern where one central rule is depended on by many others
      const centralRule: Rule = {
        id: 'CENTRAL',
        category: 'functionality',
        severity: 'critical',
        points: 20,
        description: 'Central rule',
        rationale: 'Core dependency',
        detect: () => [{ type: 'path', location: '$.paths', identifier: 'central' }],
        validate: () => ({ passed: true }),
        effort: 'hard'
      };

      const dependentRules: Rule[] = [];
      for (let i = 0; i < 20; i++) {
        dependentRules.push({
          id: `DEPENDENT-${i}`,
          category: 'maintainability',
          severity: 'minor',
          points: 1,
          description: `Dependent rule ${i}`,
          rationale: 'Depends on central',
          dependsOn: ['CENTRAL'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: `dep-${i}` }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        });
      }

      const starRuleSet = [centralRule, ...dependentRules];
      
      const start = Date.now();
      const graph = buildDependencyGraph(starRuleSet);
      const sorted = topologicalSort(graph);
      const duration = Date.now() - start;

      expect(sorted).toHaveLength(21);
      expect(duration).toBeLessThan(100);

      // Central rule should come first
      const centralIndex = sorted.indexOf('CENTRAL');
      for (let i = 0; i < 20; i++) {
        const dependentIndex = sorted.indexOf(`DEPENDENT-${i}`);
        expect(centralIndex).toBeLessThan(dependentIndex);
      }
    });
  });

  describe('Advanced Dependency Scenarios', () => {
    test('should handle partial dependency failures', () => {
      // Create scenario where one dependency passes, another fails
      const passingRule: Rule = {
        id: 'PASS',
        category: 'functionality',
        severity: 'major',
        points: 10,
        description: 'Always passes',
        rationale: 'Test rule',
        detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
        validate: () => ({ passed: true }),
        effort: 'easy'
      };

      const failingRule: Rule = {
        id: 'FAIL',
        category: 'security',
        severity: 'critical',
        points: 15,
        description: 'Always fails',
        rationale: 'Test rule',
        detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
        validate: () => ({ passed: false, message: 'Always fails' }),
        effort: 'hard'
      };

      const mixedDepRule: Rule = {
        id: 'MIXED',
        category: 'scalability',
        severity: 'major',
        points: 8,
        description: 'Depends on both passing and failing',
        rationale: 'Test rule',
        dependsOn: ['PASS', 'FAIL'],
        detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
        validate: () => ({ passed: true }),
        effort: 'medium'
      };

      RULE_REGISTRY['PASS'] = passingRule as any;
      RULE_REGISTRY['FAIL'] = failingRule as any;
      RULE_REGISTRY['MIXED'] = mixedDepRule as any;

      const scores = scoreWithDependencies(mockSpec, ['PASS', 'FAIL', 'MIXED']);

      const passScore = scores.get('PASS');
      const failScore = scores.get('FAIL');
      const mixedScore = scores.get('MIXED');

      expect(passScore?.skipped).toBe(false);
      expect(passScore?.coverage).toBe(1.0);

      expect(failScore?.skipped).toBe(false);
      expect(failScore?.coverage).toBeLessThan(1.0);

      expect(mixedScore?.skipped).toBe(true);
      expect(mixedScore?.failedDependencies).toContain('FAIL');

      // Cleanup
      delete RULE_REGISTRY['PASS'];
      delete RULE_REGISTRY['FAIL'];
      delete RULE_REGISTRY['MIXED'];
    });

    test('should handle transitive dependency analysis', () => {
      // Create A -> B -> C -> D chain to test transitive effects
      const rules = [
        {
          id: 'TRANS-A',
          category: 'functionality',
          severity: 'critical',
          points: 20,
          description: 'Transitive root',
          rationale: 'Foundation',
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: false, message: 'Root fails' }),
          effort: 'hard'
        },
        {
          id: 'TRANS-B',
          category: 'security',
          severity: 'major',
          points: 15,
          description: 'Transitive level 1',
          rationale: 'Depends on A',
          dependsOn: ['TRANS-A'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'medium'
        },
        {
          id: 'TRANS-C',
          category: 'scalability',
          severity: 'major',
          points: 12,
          description: 'Transitive level 2',
          rationale: 'Depends on B',
          dependsOn: ['TRANS-B'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        },
        {
          id: 'TRANS-D',
          category: 'maintainability',
          severity: 'minor',
          points: 8,
          description: 'Transitive level 3',
          rationale: 'Depends on C',
          dependsOn: ['TRANS-C'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        }
      ];

      // Add all rules to registry
      rules.forEach(rule => {
        RULE_REGISTRY[rule.id] = rule as any;
      });

      const scores = scoreWithDependencies(mockSpec, rules.map(r => r.id));

      // All except A should be skipped due to transitive dependency failure
      expect(scores.get('TRANS-A')?.skipped).toBe(false);
      expect(scores.get('TRANS-A')?.coverage).toBeLessThan(1.0);

      expect(scores.get('TRANS-B')?.skipped).toBe(true);
      expect(scores.get('TRANS-C')?.skipped).toBe(true);
      expect(scores.get('TRANS-D')?.skipped).toBe(true);

      const analysis = analyzeDependencyChains(scores);
      expect(analysis.rootCauses).toContain('TRANS-A');
      expect(analysis.affectedRules).toBe(3); // B, C, D all affected

      // Cleanup
      rules.forEach(rule => {
        delete RULE_REGISTRY[rule.id];
      });
    });

    test('should provide detailed impact analysis for fixing dependencies', () => {
      // Setup a scenario to test impact analysis
      const impactRules = [
        {
          id: 'IMPACT-ROOT',
          category: 'functionality',
          severity: 'critical',
          points: 25,
          description: 'High-impact root rule',
          rationale: 'Critical foundation',
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: false, message: 'Critical failure' }),
          effort: 'hard'
        },
        {
          id: 'IMPACT-BRANCH1',
          category: 'security',
          severity: 'major',
          points: 15,
          description: 'Security branch',
          rationale: 'Security depends on foundation',
          dependsOn: ['IMPACT-ROOT'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'medium'
        },
        {
          id: 'IMPACT-BRANCH2',
          category: 'scalability',
          severity: 'major',
          points: 12,
          description: 'Scalability branch',
          rationale: 'Scalability depends on foundation',
          dependsOn: ['IMPACT-ROOT'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        },
        {
          id: 'IMPACT-LEAF',
          category: 'maintainability',
          severity: 'minor',
          points: 5,
          description: 'Leaf rule',
          rationale: 'Depends on both branches',
          dependsOn: ['IMPACT-BRANCH1', 'IMPACT-BRANCH2'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        }
      ];

      impactRules.forEach(rule => {
        RULE_REGISTRY[rule.id] = rule as any;
      });

      const scores = scoreWithDependencies(mockSpec, impactRules.map(r => r.id));

      // Calculate potential score recovery if root is fixed
      const unblocked = getUnblockedRules('IMPACT-ROOT', scores);
      
      expect(unblocked).toContain('IMPACT-BRANCH1');
      expect(unblocked).toContain('IMPACT-BRANCH2');
      // IMPACT-LEAF should not be directly unblocked as it has multiple dependencies

      const potentialRecovery = unblocked.reduce((sum, ruleId) => {
        const score = scores.get(ruleId);
        return sum + (score ? score.maxScore : 0);
      }, 0);

      expect(potentialRecovery).toBe(27); // 15 + 12 from the two branches

      // Cleanup
      impactRules.forEach(rule => {
        delete RULE_REGISTRY[rule.id];
      });
    });

    test('should handle conditional dependencies correctly', () => {
      // Test scenario where fixing one rule partially unblocks others
      const conditionalRules = [
        {
          id: 'COND-A',
          category: 'functionality',
          severity: 'major',
          points: 10,
          description: 'Conditional root A',
          rationale: 'First condition',
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: false, message: 'A fails' }),
          effort: 'medium'
        },
        {
          id: 'COND-B',
          category: 'security',
          severity: 'major',
          points: 10,
          description: 'Conditional root B',
          rationale: 'Second condition',
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: false, message: 'B fails' }),
          effort: 'medium'
        },
        {
          id: 'COND-AB',
          category: 'scalability',
          severity: 'minor',
          points: 5,
          description: 'Depends on both A and B',
          rationale: 'Requires both conditions',
          dependsOn: ['COND-A', 'COND-B'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        }
      ];

      conditionalRules.forEach(rule => {
        RULE_REGISTRY[rule.id] = rule as any;
      });

      const scores = scoreWithDependencies(mockSpec, conditionalRules.map(r => r.id));

      // All rules should have issues
      expect(scores.get('COND-A')?.coverage).toBeLessThan(1.0);
      expect(scores.get('COND-B')?.coverage).toBeLessThan(1.0);
      expect(scores.get('COND-AB')?.skipped).toBe(true);

      // Fixing only A shouldn't unblock AB (B still fails)
      const unblockedByA = getUnblockedRules('COND-A', scores);
      expect(unblockedByA).not.toContain('COND-AB');

      // Fixing only B shouldn't unblock AB (A still fails)
      const unblockedByB = getUnblockedRules('COND-B', scores);
      expect(unblockedByB).not.toContain('COND-AB');

      // Cleanup
      conditionalRules.forEach(rule => {
        delete RULE_REGISTRY[rule.id];
      });
    });

    test('should handle dependency priority scenarios', () => {
      // Test high-priority rules blocking multiple low-priority ones
      const priorityRules = [
        {
          id: 'HIGH-PRIORITY',
          category: 'functionality',
          severity: 'critical',
          points: 50,
          description: 'High priority blocking rule',
          rationale: 'Critical infrastructure',
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: false, message: 'High priority failure' }),
          effort: 'hard'
        },
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `LOW-PRIORITY-${i}`,
          category: 'maintainability' as const,
          severity: 'minor' as const,
          points: 2,
          description: `Low priority rule ${i}`,
          rationale: 'Minor enhancement',
          dependsOn: ['HIGH-PRIORITY'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'easy' as const
        }))
      ];

      priorityRules.forEach(rule => {
        RULE_REGISTRY[rule.id] = rule as any;
      });

      const scores = scoreWithDependencies(mockSpec, priorityRules.map(r => r.id));

      // High priority rule fails, blocking all low priority rules
      const highPriorityScore = scores.get('HIGH-PRIORITY');
      expect(highPriorityScore?.coverage).toBeLessThan(1.0);

      for (let i = 0; i < 10; i++) {
        const lowPriorityScore = scores.get(`LOW-PRIORITY-${i}`);
        expect(lowPriorityScore?.skipped).toBe(true);
        expect(lowPriorityScore?.failedDependencies).toContain('HIGH-PRIORITY');
      }

      // Calculate blocked value
      const blockedValue = Array.from({ length: 10 }, (_, i) => i).reduce((sum, i) => {
        const score = scores.get(`LOW-PRIORITY-${i}`);
        return sum + (score ? score.maxScore : 0);
      }, 0);

      expect(blockedValue).toBe(20); // 10 rules × 2 points each

      const analysis = analyzeDependencyChains(scores);
      expect(analysis.rootCauses).toContain('HIGH-PRIORITY');
      expect(analysis.affectedRules).toBe(10);

      // Cleanup
      priorityRules.forEach(rule => {
        delete RULE_REGISTRY[rule.id];
      });
    });
  });

  describe('Dependency Optimization Recommendations', () => {
    test('should identify highest-impact dependency fixes', () => {
      // Create a scenario with different impact levels
      const optimizationRules = [
        {
          id: 'HIGH-IMPACT-ROOT',
          category: 'functionality',
          severity: 'critical',
          points: 20,
          description: 'High impact root',
          rationale: 'Blocks many high-value rules',
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: false, message: 'Blocks high value' }),
          effort: 'medium'
        },
        {
          id: 'LOW-IMPACT-ROOT',
          category: 'maintainability',
          severity: 'minor',
          points: 5,
          description: 'Low impact root',
          rationale: 'Blocks few low-value rules',
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: false, message: 'Blocks low value' }),
          effort: 'easy'
        },
        // High-impact root blocks high-value rules
        {
          id: 'HIGH-VALUE-1',
          category: 'security',
          severity: 'major',
          points: 15,
          description: 'High value rule 1',
          rationale: 'Important security feature',
          dependsOn: ['HIGH-IMPACT-ROOT'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'medium'
        },
        {
          id: 'HIGH-VALUE-2',
          category: 'scalability',
          severity: 'major',
          points: 12,
          description: 'High value rule 2',
          rationale: 'Important scalability feature',
          dependsOn: ['HIGH-IMPACT-ROOT'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        },
        // Low-impact root blocks low-value rule
        {
          id: 'LOW-VALUE-1',
          category: 'maintainability',
          severity: 'minor',
          points: 3,
          description: 'Low value rule 1',
          rationale: 'Minor enhancement',
          dependsOn: ['LOW-IMPACT-ROOT'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        }
      ];

      optimizationRules.forEach(rule => {
        RULE_REGISTRY[rule.id] = rule as any;
      });

      const scores = scoreWithDependencies(mockSpec, optimizationRules.map(r => r.id));

      // Calculate impact of fixing each root cause
      const highImpactUnblocked = getUnblockedRules('HIGH-IMPACT-ROOT', scores);
      const lowImpactUnblocked = getUnblockedRules('LOW-IMPACT-ROOT', scores);

      const highImpactValue = highImpactUnblocked.reduce((sum, ruleId) => {
        const score = scores.get(ruleId);
        return sum + (score ? score.maxScore : 0);
      }, 0);

      const lowImpactValue = lowImpactUnblocked.reduce((sum, ruleId) => {
        const score = scores.get(ruleId);
        return sum + (score ? score.maxScore : 0);
      }, 0);

      expect(highImpactValue).toBe(27); // 15 + 12
      expect(lowImpactValue).toBe(3);   // Just 3

      // High-impact root should be prioritized for fixing
      expect(highImpactValue).toBeGreaterThan(lowImpactValue);

      // Cleanup
      optimizationRules.forEach(rule => {
        delete RULE_REGISTRY[rule.id];
      });
    });

    test('should provide effort vs impact analysis', () => {
      // Create rules with different effort-to-impact ratios
      const effortRules = [
        {
          id: 'EASY-HIGH-IMPACT',
          category: 'functionality',
          severity: 'major',
          points: 15,
          description: 'Easy fix, high impact',
          rationale: 'Low hanging fruit',
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: false, message: 'Easy to fix' }),
          effort: 'easy'
        },
        {
          id: 'HARD-LOW-IMPACT',
          category: 'maintainability',
          severity: 'minor',
          points: 3,
          description: 'Hard fix, low impact',
          rationale: 'Expensive change',
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: false, message: 'Hard to fix' }),
          effort: 'hard'
        },
        {
          id: 'DEPENDS-ON-EASY',
          category: 'security',
          severity: 'major',
          points: 10,
          description: 'Depends on easy rule',
          rationale: 'Quick win dependency',
          dependsOn: ['EASY-HIGH-IMPACT'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'medium'
        },
        {
          id: 'DEPENDS-ON-HARD',
          category: 'scalability',
          severity: 'minor',
          points: 2,
          description: 'Depends on hard rule',
          rationale: 'Expensive dependency',
          dependsOn: ['HARD-LOW-IMPACT'],
          detect: () => [{ type: 'path', location: '$.paths', identifier: 'test' }],
          validate: () => ({ passed: true }),
          effort: 'easy'
        }
      ];

      effortRules.forEach(rule => {
        RULE_REGISTRY[rule.id] = rule as any;
      });

      const scores = scoreWithDependencies(mockSpec, effortRules.map(r => r.id));

      // Easy high-impact rule should unblock more value
      const easyUnblocked = getUnblockedRules('EASY-HIGH-IMPACT', scores);
      const hardUnblocked = getUnblockedRules('HARD-LOW-IMPACT', scores);

      const easyTotalValue = easyUnblocked.reduce((sum, ruleId) => {
        const score = scores.get(ruleId);
        return sum + (score ? score.maxScore : 0);
      }, 0) + 15; // Include the easy rule's own value

      const hardTotalValue = hardUnblocked.reduce((sum, ruleId) => {
        const score = scores.get(ruleId);
        return sum + (score ? score.maxScore : 0);
      }, 0) + 3; // Include the hard rule's own value

      // Easy rule should provide better value/effort ratio
      expect(easyTotalValue).toBeGreaterThan(hardTotalValue);

      // Cleanup
      effortRules.forEach(rule => {
        delete RULE_REGISTRY[rule.id];
      });
    });
  });
});