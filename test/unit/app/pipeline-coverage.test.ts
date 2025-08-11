/**
 * Additional Pipeline Tests for Coverage
 * Target: Cover uncovered branches and edge cases
 */

import { gradeContract, gradeInline, gradeAndRecord, version, listCheckpoints, explainFinding, suggestFixes } from '../../../src/app/pipeline';
import * as fs from 'fs/promises';
import { GraderDB } from '../../../src/mcp/persistence/db';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../../../src/mcp/persistence/db');

describe('Pipeline Coverage Tests', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('version', () => {
    test('should return version information', async () => {
      const result = await version();
      
      expect(result).toHaveProperty('serverVersion');
      expect(result).toHaveProperty('scoringEngine');
      expect(result).toHaveProperty('instanceId');
      expect(result).toHaveProperty('toolVersions');
      expect(result.scoringEngine).toBe('coverage-based');
    });

    test('should use legacy scoring when configured', async () => {
      process.env.USE_LEGACY_SCORING = 'true';
      const result = await version();
      expect(result.scoringEngine).toBe('legacy');
      delete process.env.USE_LEGACY_SCORING;
    });
  });

  describe('listCheckpoints', () => {
    test('should return checkpoint list', async () => {
      const checkpoints = await listCheckpoints();
      
      expect(Array.isArray(checkpoints)).toBe(true);
      expect(checkpoints.length).toBeGreaterThan(0);
      expect(checkpoints[0]).toHaveProperty('id');
      expect(checkpoints[0]).toHaveProperty('category');
      expect(checkpoints[0]).toHaveProperty('weight');
    });
  });

  describe('explainFinding', () => {
    test('should explain known rule', async () => {
      const result = await explainFinding({ ruleId: 'OAS-STRUCT' });
      
      expect(result).toHaveProperty('ruleId');
      expect(result).toHaveProperty('explanation');
      expect(result.ruleId).toBe('OAS-STRUCT');
    });

    test('should handle unknown rule', async () => {
      const result = await explainFinding({ ruleId: 'UNKNOWN-RULE' });
      
      expect(result.ruleId).toBe('UNKNOWN-RULE');
      expect(result.explanation).toBe('Unknown rule');
    });
  });

  describe('gradeInline', () => {
    test('should grade inline YAML content', async () => {
      const yamlContent = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /api/v2/test:
    get:
      operationId: getTest
      responses:
        '200':
          description: Success
`;

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(yamlContent);

      const result = await gradeInline(
        { content: yamlContent },
        { progress: jest.fn() }
      );

      expect(result).toHaveProperty('grade');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('metadata');
      expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/inline-spec.yaml', yamlContent, 'utf8');
    });
  });

  describe('gradeAndRecord', () => {
    test('should grade and save to database', async () => {
      const yamlContent = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths: {}
`;

      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const mockDb = {
        connect: jest.fn(),
        migrate: jest.fn(),
        insertRun: jest.fn()
      };
      
      (GraderDB as jest.Mock).mockImplementation(() => mockDb);

      const result = await gradeAndRecord(
        { path: 'test.yaml' },
        { progress: jest.fn() }
      );

      expect(result).toHaveProperty('runId');
      expect(result).toHaveProperty('apiId');
      expect(result).toHaveProperty('grade');
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockDb.migrate).toHaveBeenCalled();
      expect(mockDb.insertRun).toHaveBeenCalled();
    });
  });

  describe('suggestFixes', () => {
    test('should suggest fixes for violations', async () => {
      const yamlContent = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        200:
          description: Success
`;

      mockFs.readFile.mockResolvedValue(yamlContent);

      const result = await suggestFixes({ path: 'test.yaml' });

      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('fixes');
      expect(Array.isArray(result.fixes)).toBe(true);
    });
  });

  describe('gradeContract with legacy scoring', () => {
    test('should use legacy scoring when specified', async () => {
      const yamlContent = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      operationId: getUsers
      responses:
        '200':
          description: Success
`;

      mockFs.readFile.mockResolvedValue(yamlContent);

      const result = await gradeContract(
        { path: 'test.yaml', legacyMode: true },
        { progress: jest.fn() }
      );

      expect(result.metadata.scoringEngine).toBe('legacy');
      expect(result.grade).toHaveProperty('autoFailReasons');
    });
  });

  describe('gradeContract with coverage scoring', () => {
    test('should use coverage-based scoring by default', async () => {
      const yamlContent = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      operationId: getUsers
      responses:
        '200':
          description: Success
`;

      mockFs.readFile.mockResolvedValue(yamlContent);

      const result = await gradeContract(
        { path: 'test.yaml', legacyMode: false },
        { progress: jest.fn() }
      );

      expect(result.metadata.scoringEngine).toBe('coverage-based');
      expect(result.grade).toHaveProperty('coverageBased', true);
    });
  });
});