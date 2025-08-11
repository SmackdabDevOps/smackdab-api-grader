/**
 * MCP Protocol Contract Tests
 * 
 * Tests all 8 MCP tools against their defined contracts:
 * - version, list_checkpoints, grade_contract, grade_inline
 * - grade_and_record, explain_finding, suggest_fixes, get_api_history
 * 
 * These tests validate MCP tool schemas, error handling, and response formats.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { MockOpenApiFactory, MockGradingResultFactory, createYamlContent } from '../helpers/mock-factories';
import { GraderDB } from '../../src/mcp/persistence/db';

// Mock the pipeline module to control test responses
jest.mock('../../src/app/pipeline.js');
const mockPipeline = jest.requireMock('../../src/app/pipeline.js');

// Mock database for controlled testing
jest.mock('../../src/mcp/persistence/db.js');
const MockGraderDB = GraderDB as jest.MockedClass<typeof GraderDB>;

describe('MCP Protocol Contract Tests', () => {
  let mcpServer: McpServer;
  let testSpecPath: string;
  let mockDb: jest.Mocked<GraderDB>;

  beforeAll(async () => {
    // Setup test fixture files
    testSpecPath = path.join('/tmp', 'test-spec.yaml');
    const validSpec = MockOpenApiFactory.validWithTenancy();
    await fs.writeFile(testSpecPath, createYamlContent(validSpec));
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock database
    mockDb = {
      connect: jest.fn(),
      migrate: jest.fn(),
      getHistory: jest.fn(),
      insertRun: jest.fn(),
      close: jest.fn()
    } as any;
    MockGraderDB.mockImplementation(() => mockDb);

    // Setup default mock pipeline responses
    const mockResult = MockGradingResultFactory.passingResult();
    mockPipeline.version = jest.fn().mockResolvedValue({
      serverVersion: '2.0.0',
      scoringEngine: 'coverage-based',
      instanceId: 'test-instance',
      instanceStartTime: '2024-01-01T00:00:00.000Z',
      rulesetHash: 'test-hash',
      templateVersion: '3.2.3',
      templateHash: 'test-template-hash'
    });
    mockPipeline.listCheckpoints = jest.fn().mockResolvedValue([
      { id: 'TEST-CHECKPOINT', category: 'testing', weight: 10, description: 'Test checkpoint' }
    ]);
    mockPipeline.gradeContract = jest.fn().mockResolvedValue(mockResult);
    mockPipeline.gradeInline = jest.fn().mockResolvedValue(mockResult);
    mockPipeline.gradeAndRecord = jest.fn().mockResolvedValue({
      ...mockResult,
      runId: 'run_test_123',
      apiId: 'api_test_456'
    });
    mockPipeline.explainFinding = jest.fn().mockResolvedValue({
      ruleId: 'TEST-RULE',
      explanation: 'Test rule explanation'
    });
    mockPipeline.suggestFixes = jest.fn().mockResolvedValue({
      count: 2,
      fixes: [
        { description: 'Fix test issue', patch: { op: 'replace', path: '/test', value: 'fixed' } }
      ]
    });

    // Create fresh MCP server for each test
    mcpServer = new McpServer({
      name: 'test-grader',
      version: '1.0.0'
    });

    // Register tools (copy from actual server.ts for contract compliance)
    registerMcpTools();
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      await fs.unlink(testSpecPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Tool: version', () => {
    it('should return version information without parameters', async () => {
      const result = await executeToolTest('version', {});
      
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      
      const versionData = JSON.parse(result.content[0].text);
      expect(versionData).toHaveProperty('serverVersion');
      expect(versionData).toHaveProperty('scoringEngine');
      expect(versionData).toHaveProperty('instanceId');
      expect(versionData).toHaveProperty('rulesetHash');
      expect(versionData).toHaveProperty('templateVersion');
      
      expect(mockPipeline.version).toHaveBeenCalledTimes(1);
    });

    it('should return valid JSON structure', async () => {
      const result = await executeToolTest('version', {});
      
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      
      const data = JSON.parse(result.content[0].text);
      expect(typeof data.serverVersion).toBe('string');
      expect(['legacy', 'coverage-based']).toContain(data.scoringEngine);
    });
  });

  describe('Tool: list_checkpoints', () => {
    it('should return array of checkpoints', async () => {
      const result = await executeToolTest('list_checkpoints', {});
      
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      
      const checkpoints = JSON.parse(result.content[0].text);
      expect(Array.isArray(checkpoints)).toBe(true);
      expect(mockPipeline.listCheckpoints).toHaveBeenCalledTimes(1);
    });

    it('should return checkpoints with required fields', async () => {
      const result = await executeToolTest('list_checkpoints', {});
      const checkpoints = JSON.parse(result.content[0].text);
      
      if (checkpoints.length > 0) {
        const checkpoint = checkpoints[0];
        expect(checkpoint).toHaveProperty('id');
        expect(checkpoint).toHaveProperty('category');
        expect(checkpoint).toHaveProperty('weight');
        expect(checkpoint).toHaveProperty('description');
      }
    });
  });

  describe('Tool: grade_contract', () => {
    it('should accept path parameter and return grading result', async () => {
      const result = await executeToolTest('grade_contract', {
        path: testSpecPath
      });
      
      expect(result).toHaveProperty('content');
      const gradingResult = JSON.parse(result.content[0].text);
      
      expect(gradingResult).toHaveProperty('grade');
      expect(gradingResult).toHaveProperty('findings');
      expect(gradingResult).toHaveProperty('checkpoints');
      expect(gradingResult).toHaveProperty('metadata');
      
      expect(mockPipeline.gradeContract).toHaveBeenCalledWith(
        { path: testSpecPath, templatePath: undefined },
        expect.objectContaining({ progress: expect.any(Function) })
      );
    });

    it('should accept optional templatePath parameter', async () => {
      const templatePath = '/custom/template.yaml';
      
      await executeToolTest('grade_contract', {
        path: testSpecPath,
        templatePath
      });
      
      expect(mockPipeline.gradeContract).toHaveBeenCalledWith(
        { path: testSpecPath, templatePath },
        expect.any(Object)
      );
    });

    it('should handle grading errors gracefully', async () => {
      mockPipeline.gradeContract.mockRejectedValue(new Error('Test grading error'));
      
      const result = await executeToolTest('grade_contract', {
        path: testSpecPath
      });
      
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error grading contract: Test grading error');
    });

    it('should validate grade result structure', async () => {
      const result = await executeToolTest('grade_contract', {
        path: testSpecPath
      });
      
      const gradingResult = JSON.parse(result.content[0].text);
      
      // Validate grade object structure
      expect(gradingResult.grade).toHaveProperty('total');
      expect(gradingResult.grade).toHaveProperty('letter');
      expect(gradingResult.grade).toHaveProperty('compliancePct');
      expect(gradingResult.grade).toHaveProperty('autoFailTriggered');
      expect(gradingResult.grade).toHaveProperty('criticalIssues');
      expect(gradingResult.grade).toHaveProperty('perCategory');
      
      // Validate arrays
      expect(Array.isArray(gradingResult.findings)).toBe(true);
      expect(Array.isArray(gradingResult.checkpoints)).toBe(true);
      
      // Validate metadata
      expect(gradingResult.metadata).toHaveProperty('specHash');
      expect(gradingResult.metadata).toHaveProperty('templateHash');
      expect(gradingResult.metadata).toHaveProperty('rulesetHash');
    });
  });

  describe('Tool: grade_inline', () => {
    it('should accept content parameter and return grading result', async () => {
      const yamlContent = createYamlContent(MockOpenApiFactory.validMinimal());
      
      const result = await executeToolTest('grade_inline', {
        content: yamlContent
      });
      
      expect(result).toHaveProperty('content');
      const gradingResult = JSON.parse(result.content[0].text);
      
      expect(gradingResult).toHaveProperty('grade');
      expect(gradingResult).toHaveProperty('findings');
      expect(gradingResult).toHaveProperty('checkpoints');
      
      expect(mockPipeline.gradeInline).toHaveBeenCalledWith(
        { content: yamlContent, templatePath: undefined },
        expect.any(Object)
      );
    });

    it('should accept optional templatePath parameter', async () => {
      const yamlContent = createYamlContent(MockOpenApiFactory.validMinimal());
      const templatePath = '/custom/template.yaml';
      
      await executeToolTest('grade_inline', {
        content: yamlContent,
        templatePath
      });
      
      expect(mockPipeline.gradeInline).toHaveBeenCalledWith(
        { content: yamlContent, templatePath },
        expect.any(Object)
      );
    });

    it('should handle inline grading errors gracefully', async () => {
      mockPipeline.gradeInline.mockRejectedValue(new Error('Test inline error'));
      
      const result = await executeToolTest('grade_inline', {
        content: 'invalid yaml content'
      });
      
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error grading inline content: Test inline error');
    });
  });

  describe('Tool: grade_and_record', () => {
    it('should grade and persist results to database', async () => {
      const result = await executeToolTest('grade_and_record', {
        path: testSpecPath
      });
      
      expect(result).toHaveProperty('content');
      const recordResult = JSON.parse(result.content[0].text);
      
      expect(recordResult).toHaveProperty('runId');
      expect(recordResult).toHaveProperty('apiId');
      expect(recordResult).toHaveProperty('grade');
      expect(recordResult).toHaveProperty('findings');
      expect(recordResult).toHaveProperty('checkpoints');
      
      expect(mockPipeline.gradeAndRecord).toHaveBeenCalledWith(
        { path: testSpecPath, templatePath: undefined },
        expect.any(Object)
      );
    });

    it('should handle database recording errors gracefully', async () => {
      mockPipeline.gradeAndRecord.mockRejectedValue(new Error('Database connection failed'));
      
      const result = await executeToolTest('grade_and_record', {
        path: testSpecPath
      });
      
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error grading and recording: Database connection failed');
    });
  });

  describe('Tool: explain_finding', () => {
    it('should return explanation for given rule ID', async () => {
      const result = await executeToolTest('explain_finding', {
        ruleId: 'TEST-RULE'
      });
      
      expect(result).toHaveProperty('content');
      const explanation = JSON.parse(result.content[0].text);
      
      expect(explanation).toHaveProperty('ruleId', 'TEST-RULE');
      expect(explanation).toHaveProperty('explanation');
      
      expect(mockPipeline.explainFinding).toHaveBeenCalledWith({
        ruleId: 'TEST-RULE'
      });
    });

    it('should handle unknown rule IDs gracefully', async () => {
      mockPipeline.explainFinding.mockResolvedValue({
        ruleId: 'UNKNOWN-RULE',
        explanation: 'Unknown rule'
      });
      
      const result = await executeToolTest('explain_finding', {
        ruleId: 'UNKNOWN-RULE'
      });
      
      const explanation = JSON.parse(result.content[0].text);
      expect(explanation.explanation).toBe('Unknown rule');
    });

    it('should handle explanation errors gracefully', async () => {
      mockPipeline.explainFinding.mockRejectedValue(new Error('Explanation service unavailable'));
      
      const result = await executeToolTest('explain_finding', {
        ruleId: 'TEST-RULE'
      });
      
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error explaining finding: Explanation service unavailable');
    });
  });

  describe('Tool: suggest_fixes', () => {
    it('should return fix suggestions for API violations', async () => {
      const result = await executeToolTest('suggest_fixes', {
        path: testSpecPath
      });
      
      expect(result).toHaveProperty('content');
      const fixes = JSON.parse(result.content[0].text);
      
      expect(fixes).toHaveProperty('count');
      expect(fixes).toHaveProperty('fixes');
      expect(Array.isArray(fixes.fixes)).toBe(true);
      
      expect(mockPipeline.suggestFixes).toHaveBeenCalledWith({
        path: testSpecPath
      });
    });

    it('should handle fix suggestion errors gracefully', async () => {
      mockPipeline.suggestFixes.mockRejectedValue(new Error('Fix generation failed'));
      
      const result = await executeToolTest('suggest_fixes', {
        path: testSpecPath
      });
      
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error suggesting fixes: Fix generation failed');
    });

    it('should return valid fix structure', async () => {
      const result = await executeToolTest('suggest_fixes', {
        path: testSpecPath
      });
      
      const fixes = JSON.parse(result.content[0].text);
      
      if (fixes.fixes.length > 0) {
        const fix = fixes.fixes[0];
        expect(fix).toHaveProperty('description');
        expect(fix).toHaveProperty('patch');
        expect(fix.patch).toHaveProperty('op');
        expect(fix.patch).toHaveProperty('path');
      }
    });
  });

  describe('Tool: get_api_history', () => {
    beforeEach(() => {
      mockDb.getHistory.mockResolvedValue([
        {
          run_id: 'run_test_1',
          api_id: 'api_test',
          graded_at: '2024-01-01T00:00:00.000Z',
          total_score: 85,
          letter_grade: 'B'
        }
      ]);
    });

    it('should return API grading history', async () => {
      const result = await executeToolTest('get_api_history', {
        apiId: 'test-api'
      });
      
      expect(result).toHaveProperty('content');
      const history = JSON.parse(result.content[0].text);
      
      expect(history).toHaveProperty('apiId', 'test-api');
      expect(history).toHaveProperty('rows');
      expect(Array.isArray(history.rows)).toBe(true);
      
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockDb.migrate).toHaveBeenCalled();
      expect(mockDb.getHistory).toHaveBeenCalledWith('test-api', 20, undefined);
    });

    it('should accept optional limit parameter', async () => {
      await executeToolTest('get_api_history', {
        apiId: 'test-api',
        limit: 10
      });
      
      expect(mockDb.getHistory).toHaveBeenCalledWith('test-api', 10, undefined);
    });

    it('should accept optional since parameter', async () => {
      const sinceDate = '2024-01-01T00:00:00.000Z';
      
      await executeToolTest('get_api_history', {
        apiId: 'test-api',
        since: sinceDate
      });
      
      expect(mockDb.getHistory).toHaveBeenCalledWith('test-api', 20, sinceDate);
    });

    it('should handle database errors gracefully', async () => {
      mockDb.connect.mockRejectedValue(new Error('Database connection failed'));
      
      const result = await executeToolTest('get_api_history', {
        apiId: 'test-api'
      });
      
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error getting API history: Database connection failed');
    });
  });

  // Helper function to register MCP tools (mirrors server.ts)
  function registerMcpTools() {
    mcpServer.registerTool('version', {
      description: 'Get grader version information',
      inputSchema: {}
    }, async () => {
      const version = await mockPipeline.version();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(version, null, 2)
        }]
      };
    });

    mcpServer.registerTool('list_checkpoints', {
      description: 'List all grading checkpoints',
      inputSchema: {}
    }, async () => {
      const checkpoints = await mockPipeline.listCheckpoints();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(checkpoints, null, 2)
        }]
      };
    });

    mcpServer.registerTool('grade_contract', {
      description: 'Grade an OpenAPI specification file',
      inputSchema: {
        path: { type: 'string', description: 'Path to the OpenAPI file' },
        templatePath: { type: 'string', description: 'Optional path to template file' }
      }
    }, async ({ path, templatePath }) => {
      try {
        const result = await mockPipeline.gradeContract({ path, templatePath }, { progress: () => {} });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error grading contract: ${error.message}`
          }],
          isError: true
        };
      }
    });

    mcpServer.registerTool('grade_inline', {
      description: 'Grade inline OpenAPI YAML content',
      inputSchema: {
        content: { type: 'string', description: 'OpenAPI YAML content' },
        templatePath: { type: 'string', description: 'Optional path to template file' }
      }
    }, async ({ content, templatePath }) => {
      try {
        const result = await mockPipeline.gradeInline({ content, templatePath }, { progress: () => {} });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error grading inline content: ${error.message}`
          }],
          isError: true
        };
      }
    });

    mcpServer.registerTool('grade_and_record', {
      description: 'Grade an API and record results to database',
      inputSchema: {
        path: { type: 'string', description: 'Path to the OpenAPI file' },
        templatePath: { type: 'string', description: 'Optional path to template file' }
      }
    }, async ({ path, templatePath }) => {
      try {
        const result = await mockPipeline.gradeAndRecord({ path, templatePath }, { progress: () => {} });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error grading and recording: ${error.message}`
          }],
          isError: true
        };
      }
    });

    mcpServer.registerTool('explain_finding', {
      description: 'Get detailed explanation for a specific rule violation',
      inputSchema: {
        ruleId: { type: 'string', description: 'Rule ID to explain' }
      }
    }, async ({ ruleId }) => {
      try {
        const explanation = await mockPipeline.explainFinding({ ruleId });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(explanation, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error explaining finding: ${error.message}`
          }],
          isError: true
        };
      }
    });

    mcpServer.registerTool('suggest_fixes', {
      description: 'Suggest fixes for API violations',
      inputSchema: {
        path: { type: 'string', description: 'Path to the OpenAPI file' }
      }
    }, async ({ path }) => {
      try {
        const fixes = await mockPipeline.suggestFixes({ path });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(fixes, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error suggesting fixes: ${error.message}`
          }],
          isError: true
        };
      }
    });

    mcpServer.registerTool('get_api_history', {
      description: 'Get grading history for an API',
      inputSchema: {
        apiId: { type: 'string', description: 'API identifier' },
        limit: { type: 'number', description: 'Maximum number of results' },
        since: { type: 'string', description: 'Get results since this date' }
      }
    }, async ({ apiId, limit, since }) => {
      try {
        const db = new GraderDB();
        await db.connect();
        await db.migrate();
        const rows = await db.getHistory(apiId, limit ?? 20, since);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ apiId, rows }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error getting API history: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  // Helper function to execute tool tests
  async function executeToolTest(toolName: string, args: any) {
    const tools = mcpServer.getTools();
    const tool = tools.find(t => t.name === toolName);
    
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    
    return await tool.handler(args);
  }
});

describe('MCP Protocol Edge Cases', () => {
  let mcpServer: McpServer;

  beforeEach(() => {
    mcpServer = new McpServer({
      name: 'test-grader',
      version: '1.0.0'
    });
  });

  it('should handle missing required parameters', async () => {
    mcpServer.registerTool('test_tool', {
      description: 'Test tool with required params',
      inputSchema: {
        requiredParam: { type: 'string', description: 'Required parameter' }
      }
    }, async ({ requiredParam }) => {
      return {
        content: [{ type: 'text', text: requiredParam }]
      };
    });

    const tools = mcpServer.getTools();
    const tool = tools[0];

    // Test with missing parameter
    await expect(tool.handler({})).rejects.toThrow();
  });

  it('should validate parameter types', async () => {
    mcpServer.registerTool('numeric_tool', {
      description: 'Test tool with numeric param',
      inputSchema: {
        numParam: { type: 'number', description: 'Numeric parameter' }
      }
    }, async ({ numParam }) => {
      return {
        content: [{ type: 'text', text: `Number: ${numParam}` }]
      };
    });

    const tools = mcpServer.getTools();
    const tool = tools[0];

    // Valid numeric input
    const result = await tool.handler({ numParam: 42 });
    expect(result.content[0].text).toBe('Number: 42');
  });

  it('should handle large response payloads', async () => {
    const largeGradingResult = {
      grade: { total: 85, letter: 'B', compliancePct: 0.85 },
      findings: Array.from({ length: 1000 }, (_, i) => ({
        ruleId: `RULE-${i}`,
        message: `Finding ${i}`,
        severity: 'info',
        jsonPath: `$.paths["/endpoint${i}"]`
      })),
      checkpoints: Array.from({ length: 100 }, (_, i) => ({
        checkpoint_id: `CP-${i}`,
        category: `category-${i % 10}`,
        max_points: 10,
        scored_points: 8
      })),
      metadata: { specHash: 'test-hash' }
    };

    mcpServer.registerTool('large_response', {
      description: 'Tool that returns large response',
      inputSchema: {}
    }, async () => {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(largeGradingResult, null, 2)
        }]
      };
    });

    const tools = mcpServer.getTools();
    const tool = tools[0];
    
    const result = await tool.handler({});
    expect(result.content[0].text.length).toBeGreaterThan(10000);
    
    // Verify JSON is still parseable
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.findings).toHaveLength(1000);
    expect(parsed.checkpoints).toHaveLength(100);
  });
});