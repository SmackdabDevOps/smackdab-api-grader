/**
 * Helper utilities for testing the grading pipeline
 * Provides mocks, fixtures, and common test patterns
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { jest } from '@jest/globals';

export interface ProgressTracker {
  calls: Array<{ stage: string; progress: number; note?: string }>;
  lastStage: string | null;
  lastProgress: number;
}

/**
 * Mock progress callback that tracks all calls
 */
export function createMockProgress(): [(stage: string, progress: number, note?: string) => void, ProgressTracker] {
  const tracker: ProgressTracker = {
    calls: [],
    lastStage: null,
    lastProgress: 0
  };

  const mockProgress = jest.fn((stage: string, progress: number, note?: string) => {
    tracker.calls.push({ stage, progress, note });
    tracker.lastStage = stage;
    tracker.lastProgress = progress;
  });

  return [mockProgress, tracker];
}

/**
 * Create temporary file with YAML content for testing
 */
export async function createTempSpec(content: string): Promise<string> {
  const tempPath = path.join('/tmp', `test-spec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.yaml`);
  await fs.writeFile(tempPath, content, 'utf8');
  return tempPath;
}

/**
 * Clean up temporary test files
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore errors - file might not exist
  }
}

/**
 * Load fixture file content
 */
export async function loadFixture(fixtureName: string): Promise<string> {
  const fixturePath = path.join(process.cwd(), 'test', 'fixtures', fixtureName);
  return await fs.readFile(fixturePath, 'utf8');
}

/**
 * Get fixture file path
 */
export function getFixturePath(fixtureName: string): string {
  return path.join(process.cwd(), 'test', 'fixtures', fixtureName);
}

/**
 * Mock environment variables for testing
 */
export function mockEnvironment(overrides: Record<string, string | undefined> = {}): jest.SpyInstance {
  const originalEnv = { ...process.env };
  
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_PATH: ':memory:',
    TEST_MODE: 'true',
    ...overrides
  });

  return jest.spyOn(process, 'env', 'get').mockReturnValue({ ...process.env });
}

/**
 * Restore environment variables after test
 */
export function restoreEnvironment(originalEnv: Record<string, string | undefined>): void {
  process.env = originalEnv;
}

/**
 * Minimal valid OpenAPI spec for testing
 */
export const MINIMAL_VALID_SPEC = `
openapi: "3.0.3"
info:
  title: "Test API"
  version: "1.0.0"
paths:
  /test:
    get:
      responses:
        '200':
          description: "Success"
`;

/**
 * Spec that will fail validation
 */
export const INVALID_SPEC = `
openapi: "3.0.0"  # Wrong version
info:
  title: "Bad API"
  # Missing version
paths:
  /test:
    get:
      # Missing responses
`;

/**
 * Large spec for performance testing
 */
export function generateLargeSpec(pathCount: number = 50, operationsPerPath: number = 4): string {
  const paths: string[] = [];
  
  for (let i = 1; i <= pathCount; i++) {
    const pathName = `/api/v2/resources${i}`;
    const operations: string[] = [];
    
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
    for (let j = 0; j < operationsPerPath && j < httpMethods.length; j++) {
      const method = httpMethods[j];
      operations.push(`
    ${method}:
      summary: "${method.toUpperCase()} resource${i}"
      operationId: "${method}Resource${i}"
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
            format: int64
      responses:
        '200':
          description: "Success"
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    format: uuid
                  name:
                    type: string
      security:
        - OAuth2: ['read']`);
    }
    
    paths.push(`  ${pathName}:\n${operations.join('')}`);
  }

  return `
openapi: "3.0.3"
info:
  title: "Large Test API"
  version: "1.0.0"
  description: "Generated large API spec for performance testing"

security:
  - OAuth2: ['read', 'write']

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
            write: Write access

paths:
${paths.join('\n')}
`;
}

/**
 * Assert that grading result has expected structure
 */
export function assertGradingResult(result: any): void {
  expect(result).toHaveProperty('grade');
  expect(result).toHaveProperty('findings');
  expect(result).toHaveProperty('checkpoints');
  expect(result).toHaveProperty('metadata');

  // Grade structure
  expect(result.grade).toHaveProperty('total');
  expect(result.grade).toHaveProperty('letter');
  expect(result.grade).toHaveProperty('compliancePct');
  expect(result.grade.total).toBeGreaterThanOrEqual(0);
  expect(result.grade.total).toBeLessThanOrEqual(100);

  // Findings structure
  expect(Array.isArray(result.findings)).toBe(true);
  result.findings.forEach((finding: any) => {
    expect(finding).toHaveProperty('ruleId');
    expect(finding).toHaveProperty('message');
    expect(finding).toHaveProperty('severity');
    expect(['error', 'warn', 'info']).toContain(finding.severity);
  });

  // Checkpoints structure
  expect(Array.isArray(result.checkpoints)).toBe(true);
  result.checkpoints.forEach((checkpoint: any) => {
    expect(checkpoint).toHaveProperty('checkpoint_id');
    expect(checkpoint).toHaveProperty('category');
    expect(checkpoint).toHaveProperty('max_points');
    expect(checkpoint).toHaveProperty('scored_points');
  });

  // Metadata structure
  expect(result.metadata).toHaveProperty('specHash');
  expect(result.metadata).toHaveProperty('templateHash');
  expect(result.metadata).toHaveProperty('rulesetHash');
  expect(result.metadata).toHaveProperty('templateVersion');
  expect(result.metadata).toHaveProperty('toolVersions');
}

/**
 * Assert that progress tracking worked correctly
 */
export function assertProgressTracking(tracker: ProgressTracker): void {
  expect(tracker.calls.length).toBeGreaterThan(0);
  
  // Should start with low progress and end at 100
  expect(tracker.calls[0].progress).toBeLessThan(50);
  expect(tracker.lastProgress).toBe(100);
  
  // Progress should generally increase
  let lastProgress = -1;
  let hasIncreased = false;
  
  for (const call of tracker.calls) {
    if (call.progress > lastProgress) {
      hasIncreased = true;
    }
    lastProgress = call.progress;
  }
  
  expect(hasIncreased).toBe(true);
}

/**
 * Mock database operations for testing
 */
export function mockDatabase() {
  const mockConnect = jest.fn().mockResolvedValue(undefined);
  const mockMigrate = jest.fn().mockResolvedValue(undefined);
  const mockInsertRun = jest.fn().mockResolvedValue(undefined);
  const mockClose = jest.fn().mockResolvedValue(undefined);

  const mockGraderDB = {
    connect: mockConnect,
    migrate: mockMigrate,
    insertRun: mockInsertRun,
    close: mockClose
  };

  return {
    mockGraderDB,
    mocks: {
      connect: mockConnect,
      migrate: mockMigrate,
      insertRun: mockInsertRun,
      close: mockClose
    }
  };
}

/**
 * Mock file system operations
 */
export function mockFileSystem() {
  const mockReadFile = jest.fn();
  const mockWriteFile = jest.fn();
  const mockAccess = jest.fn();

  return {
    mocks: {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      access: mockAccess
    },
    setupMocks: () => {
      jest.mock('node:fs/promises', () => ({
        readFile: mockReadFile,
        writeFile: mockWriteFile,
        access: mockAccess
      }));
    },
    restoreMocks: () => {
      jest.restoreAllMocks();
    }
  };
}

/**
 * Mock template loading for tests
 */
export function mockTemplate(overrides: any = {}) {
  return {
    templateHash: 'test-template-hash',
    rulesetHash: 'test-ruleset-hash',
    spectralYaml: 'extends: spectral:oas',
    ...overrides
  };
}

/**
 * Test data factory for creating consistent test scenarios
 */
export class TestDataFactory {
  static createValidGradingArgs(overrides: any = {}) {
    return {
      path: getFixturePath('valid-api.yaml'),
      templatePath: getFixturePath('template.yaml'),
      legacyMode: false,
      ...overrides
    };
  }

  static createInvalidGradingArgs(overrides: any = {}) {
    return {
      path: getFixturePath('invalid-api.yaml'),
      templatePath: getFixturePath('template.yaml'),
      ...overrides
    };
  }

  static createInlineGradingArgs(content: string, overrides: any = {}) {
    return {
      content,
      templatePath: getFixturePath('template.yaml'),
      ...overrides
    };
  }

  static createExpectedGradeStructure(overrides: any = {}) {
    return {
      total: expect.any(Number),
      letter: expect.any(String),
      compliancePct: expect.any(Number),
      autoFailTriggered: expect.any(Boolean),
      criticalIssues: expect.any(Number),
      perCategory: expect.any(Object),
      autoFailReasons: expect.any(Array),
      ...overrides
    };
  }

  static createExpectedFinding(overrides: any = {}) {
    return {
      ruleId: expect.any(String),
      message: expect.any(String),
      severity: expect.stringMatching(/^(error|warn|info)$/),
      jsonPath: expect.any(String),
      ...overrides
    };
  }
}

/**
 * Performance testing helpers
 */
export class PerformanceHelpers {
  static async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    return { result, timeMs: endTime - startTime };
  }

  static assertPerformance(timeMs: number, maxExpectedMs: number): void {
    expect(timeMs).toBeLessThan(maxExpectedMs);
  }

  static createPerformanceReport(measurements: Array<{ name: string; timeMs: number }>) {
    return {
      fastest: Math.min(...measurements.map(m => m.timeMs)),
      slowest: Math.max(...measurements.map(m => m.timeMs)),
      average: measurements.reduce((sum, m) => sum + m.timeMs, 0) / measurements.length,
      measurements
    };
  }
}