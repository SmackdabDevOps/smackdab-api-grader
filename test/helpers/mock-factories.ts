/**
 * Mock factories for creating test data
 * Following TDD principles: Create predictable, isolated test data
 */

export interface MockFinding {
  ruleId: string;
  message: string;
  severity: 'error' | 'warn' | 'info';
  jsonPath: string;
  category?: string;
  line?: number;
}

export interface MockGradeResult {
  total: number;
  letter: string;
  compliancePct: number;
  autoFailTriggered: boolean;
  criticalIssues: number;
  perCategory: Record<string, any>;
  autoFailReasons?: string[];
}

export interface MockCheckpoint {
  checkpoint_id: string;
  category: string;
  max_points: number;
  scored_points: number;
}

export interface MockMetadata {
  specHash: string;
  templateHash: string;
  rulesetHash: string;
  templateVersion: string;
  toolVersions: { grader: string } & Record<string, string>;
  scoringEngine: string;
  instanceId: string;
  instanceStartTime: string;
  gradedAt: string;
}

/**
 * Factory for creating mock OpenAPI specifications
 */
export class MockOpenApiFactory {
  static validMinimal(): any {
    return {
      openapi: '3.0.3',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A test API specification'
      },
      paths: {
        '/health': {
          get: {
            summary: 'Health check',
            operationId: 'getHealth',
            responses: {
              '200': {
                description: 'Service is healthy',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  static validWithTenancy(): any {
    const spec = this.validMinimal();
    spec.info['x-smackdab-tenancy'] = true;
    spec.paths['/organizations/{organizationId}/users'] = {
      get: {
        summary: 'Get users for organization',
        operationId: 'getOrganizationUsers',
        parameters: [
          {
            name: 'organizationId',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'List of users',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      email: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    return spec;
  }

  static invalid(): any {
    return {
      openapi: '3.0.0', // Wrong version
      info: {
        title: 'Bad API'
        // Missing version and description
      },
      paths: {} // Empty paths
    };
  }

  static withMissingRequired(): any {
    return {
      openapi: '3.0.3',
      // Missing info object entirely
      paths: {
        '/test': {
          get: {
            // Missing responses
          }
        }
      }
    };
  }
}

/**
 * Factory for creating mock findings
 */
export class MockFindingFactory {
  static error(overrides: Partial<MockFinding> = {}): MockFinding {
    return {
      ruleId: 'TEST-ERROR',
      message: 'Test error finding',
      severity: 'error',
      jsonPath: '$.paths["/test"]',
      category: 'testing',
      line: 10,
      ...overrides
    };
  }

  static warning(overrides: Partial<MockFinding> = {}): MockFinding {
    return {
      ruleId: 'TEST-WARN',
      message: 'Test warning finding',
      severity: 'warn',
      jsonPath: '$.info.title',
      category: 'testing',
      line: 3,
      ...overrides
    };
  }

  static info(overrides: Partial<MockFinding> = {}): MockFinding {
    return {
      ruleId: 'TEST-INFO',
      message: 'Test info finding',
      severity: 'info',
      jsonPath: '$.info.description',
      category: 'testing',
      line: 5,
      ...overrides
    };
  }

  static tenancyViolation(): MockFinding {
    return {
      ruleId: 'TENANCY-MISSING',
      message: 'API does not support multi-tenancy patterns',
      severity: 'error',
      jsonPath: '$.info',
      category: 'tenancy',
      line: 2
    };
  }

  static list(count: number = 3): MockFinding[] {
    return [
      this.error({ ruleId: 'ERROR-1' }),
      this.warning({ ruleId: 'WARN-1' }),
      this.info({ ruleId: 'INFO-1' })
    ].slice(0, count);
  }
}

/**
 * Factory for creating mock grade results
 */
export class MockGradeFactory {
  static passing(overrides: Partial<MockGradeResult> = {}): MockGradeResult {
    return {
      total: 85,
      letter: 'B',
      compliancePct: 0.85,
      autoFailTriggered: false,
      criticalIssues: 0,
      perCategory: {
        tenancy: { earned: 20, max: 20, percentage: 1.0 },
        naming: { earned: 15, max: 20, percentage: 0.75 },
        http: { earned: 25, max: 25, percentage: 1.0 }
      },
      autoFailReasons: [],
      ...overrides
    };
  }

  static failing(overrides: Partial<MockGradeResult> = {}): MockGradeResult {
    return {
      total: 45,
      letter: 'F',
      compliancePct: 0.45,
      autoFailTriggered: true,
      criticalIssues: 3,
      perCategory: {
        tenancy: { earned: 0, max: 20, percentage: 0.0 },
        naming: { earned: 10, max: 20, percentage: 0.5 },
        http: { earned: 15, max: 25, percentage: 0.6 }
      },
      autoFailReasons: ['Missing required tenancy patterns'],
      ...overrides
    };
  }

  static perfect(): MockGradeResult {
    return {
      total: 100,
      letter: 'A+',
      compliancePct: 1.0,
      autoFailTriggered: false,
      criticalIssues: 0,
      perCategory: {
        tenancy: { earned: 20, max: 20, percentage: 1.0 },
        naming: { earned: 20, max: 20, percentage: 1.0 },
        http: { earned: 25, max: 25, percentage: 1.0 },
        caching: { earned: 15, max: 15, percentage: 1.0 },
        pagination: { earned: 20, max: 20, percentage: 1.0 }
      },
      autoFailReasons: []
    };
  }
}

/**
 * Factory for creating mock checkpoints
 */
export class MockCheckpointFactory {
  static create(overrides: Partial<MockCheckpoint> = {}): MockCheckpoint {
    return {
      checkpoint_id: 'TEST-CHECKPOINT',
      category: 'testing',
      max_points: 10,
      scored_points: 8,
      ...overrides
    };
  }

  static list(categories: string[] = ['tenancy', 'naming', 'http']): MockCheckpoint[] {
    return categories.map(category => ({
      checkpoint_id: `${category.toUpperCase()}-TEST`,
      category,
      max_points: 20,
      scored_points: 15
    }));
  }
}

/**
 * Factory for creating mock metadata
 */
export class MockMetadataFactory {
  static create(overrides: Partial<MockMetadata> = {}): MockMetadata {
    return {
      specHash: 'test-spec-hash-123',
      templateHash: 'test-template-hash-456',
      rulesetHash: 'test-ruleset-hash-789',
      templateVersion: '3.2.3',
      toolVersions: {
        grader: '2.0.0'
      },
      scoringEngine: 'coverage-based',
      instanceId: 'test-instance',
      instanceStartTime: '2024-01-01T00:00:00.000Z',
      gradedAt: '2024-01-01T00:00:00.000Z',
      ...overrides
    };
  }

  static legacy(): MockMetadata {
    return this.create({
      toolVersions: { grader: '1.2.0' },
      scoringEngine: 'legacy'
    });
  }

  static coverageBased(): MockMetadata {
    return this.create({
      toolVersions: { grader: '2.0.0' },
      scoringEngine: 'coverage-based'
    });
  }
}

/**
 * Factory for creating complete grading results
 */
export class MockGradingResultFactory {
  static complete(options: {
    grade?: Partial<MockGradeResult>;
    findings?: MockFinding[];
    checkpoints?: MockCheckpoint[];
    metadata?: Partial<MockMetadata>;
  } = {}) {
    return {
      grade: MockGradeFactory.passing(options.grade),
      findings: options.findings || MockFindingFactory.list(2),
      checkpoints: options.checkpoints || MockCheckpointFactory.list(),
      metadata: MockMetadataFactory.create(options.metadata)
    };
  }

  static passingResult() {
    return this.complete({
      grade: MockGradeFactory.passing(),
      findings: [MockFindingFactory.warning(), MockFindingFactory.info()],
      checkpoints: MockCheckpointFactory.list()
    });
  }

  static failingResult() {
    return this.complete({
      grade: MockGradeFactory.failing(),
      findings: [
        MockFindingFactory.error(),
        MockFindingFactory.tenancyViolation(),
        MockFindingFactory.warning()
      ],
      checkpoints: MockCheckpointFactory.list()
    });
  }

  static perfectResult() {
    return this.complete({
      grade: MockGradeFactory.perfect(),
      findings: [],
      checkpoints: MockCheckpointFactory.list().map(cp => ({
        ...cp,
        scored_points: cp.max_points
      }))
    });
  }
}

/**
 * Mock database responses
 */
export class MockDbFactory {
  static historyRow(overrides: any = {}) {
    return {
      run_id: 'run_test_123',
      api_id: 'api_test_456',
      graded_at: '2024-01-01T00:00:00.000Z',
      total_score: 85,
      letter_grade: 'B',
      compliance_pct: 0.85,
      auto_fail: 0,
      critical_issues: 0,
      findings_count: 2,
      template_version: '3.2.3',
      ...overrides
    };
  }

  static historyRows(count: number = 3) {
    return Array.from({ length: count }, (_, i) => 
      this.historyRow({
        run_id: `run_test_${i + 1}`,
        graded_at: new Date(2024, 0, i + 1).toISOString(),
        total_score: 85 - (i * 5)
      })
    );
  }
}

/**
 * Helper to create YAML content from OpenAPI objects
 */
export function createYamlContent(spec: any): string {
  return `openapi: "${spec.openapi}"
info:
  title: "${spec.info.title}"
  version: "${spec.info.version}"
  description: "${spec.info.description || ''}"
paths:
${Object.entries(spec.paths || {}).map(([path, methods]: [string, any]) => 
  `  "${path}":
${Object.entries(methods).map(([method, operation]: [string, any]) =>
  `    ${method}:
      summary: "${operation.summary || ''}"
      operationId: "${operation.operationId || ''}"
      responses:
        '200':
          description: "Success response"`
).join('\n')}`
).join('\n')}`;
}