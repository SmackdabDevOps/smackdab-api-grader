/**
 * MCP Server Unit Tests - RED PHASE
 * These tests will initially FAIL as they test functionality that needs to be implemented
 * Following TDD: Write failing tests first to define expected behavior
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { createTestMcpServer, createConnectedTestClient } from '../../helpers/mcp-client';
import { MockOpenApiFactory } from '../../helpers/mock-factories';

describe('MCP Server Initialization', () => {
  describe('Server Creation', () => {
    test('should create MCP server with correct name and version', async () => {
      // RED PHASE: This test defines the expected server metadata
      const server = createTestMcpServer();
      
      // This will fail until server.getServerInfo() is properly implemented
      const serverInfo = await (server as any).getServerInfo();
      
      expect(serverInfo.name).toBe('smackdab-api-grader');
      expect(serverInfo.version).toBe('1.2.0');
      expect(serverInfo.description).toBe('Grades OpenAPI specifications against Smackdab standards');
    });

    test('should initialize with proper protocol capabilities', async () => {
      // RED PHASE: Define expected MCP protocol capabilities
      const server = createTestMcpServer();
      
      // This will fail until capabilities are properly defined
      const capabilities = await (server as any).getCapabilities();
      
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.tools.listChanged).toBe(true);
      expect(capabilities.resources).toBeUndefined(); // This server doesn't use resources
    });

    test('should fail to start without required environment setup', async () => {
      // RED PHASE: Test proper error handling for missing setup
      delete process.env.TEST_MODE;
      
      const server = createTestMcpServer();
      
      // This should fail until proper environment validation is implemented
      await expect(async () => {
        await server.connect({} as any);
      }).rejects.toThrow('Environment not properly configured');
      
      // Restore test environment
      process.env.TEST_MODE = 'true';
    });
  });

  describe('Tool Registration', () => {
    test('should register all 8 expected tools', async () => {
      // RED PHASE: Define the complete tool set that should be available
      const server = createTestMcpServer();
      const client = await createConnectedTestClient(server);
      
      const tools = await client.listTools();
      
      expect(tools.tools).toHaveLength(8);
      
      const expectedTools = [
        'version',
        'list_checkpoints',
        'grade_contract',
        'grade_inline',
        'grade_and_record',
        'explain_finding',
        'suggest_fixes',
        'get_api_history'
      ];
      
      const toolNames = tools.tools.map((tool: any) => tool.name);
      expectedTools.forEach(toolName => {
        expect(toolNames).toContain(toolName);
      });
    });

    test('should register version tool with correct schema', async () => {
      // RED PHASE: Test tool schema validation
      const server = createTestMcpServer();
      const client = await createConnectedTestClient(server);
      
      const tools = await client.listTools();
      const versionTool = tools.tools.find((t: any) => t.name === 'version');
      
      expect(versionTool).toBeDefined();
      expect(versionTool.description).toBe('Get grader version information');
      expect(versionTool.inputSchema).toEqual({});
    });

    test('should register grade_contract tool with required parameters', async () => {
      // RED PHASE: Test parameter validation for core grading tool
      const server = createTestMcpServer();
      const client = await createConnectedTestClient(server);
      
      const tools = await client.listTools();
      const gradeTool = tools.tools.find((t: any) => t.name === 'grade_contract');
      
      expect(gradeTool).toBeDefined();
      expect(gradeTool.description).toBe('Grade an OpenAPI specification file');
      expect(gradeTool.inputSchema.properties.path).toBeDefined();
      expect(gradeTool.inputSchema.properties.templatePath).toBeDefined();
      expect(gradeTool.inputSchema.required).toContain('path');
    });
  });
});

describe('MCP Server Tool Execution', () => {
  let server: McpServer;
  
  beforeEach(async () => {
    server = createTestMcpServer();
    // Mock the pipeline functions that will be called
    jest.doMock('../../../src/app/pipeline.js', () => ({
      version: jest.fn(),
      listCheckpoints: jest.fn(),
      gradeContract: jest.fn(),
      gradeInline: jest.fn(),
      gradeAndRecord: jest.fn(),
      explainFinding: jest.fn(),
      suggestFixes: jest.fn()
    }));
  });

  describe('version tool', () => {
    test('should return version information with correct structure', async () => {
      // RED PHASE: Define expected version response structure
      const client = await createConnectedTestClient(server);
      
      // Mock the pipeline.version function
      const mockVersion = {
        serverVersion: '2.0.0',
        scoringEngine: 'coverage-based',
        instanceId: 'test-instance',
        instanceStartTime: '2024-01-01T00:00:00.000Z',
        rulesetHash: 'dev-hash',
        templateVersion: '3.2.3',
        templateHash: 'dev-template',
        toolVersions: {
          grader: '2.0.0',
          scoringSystem: 'coverage-based-v1'
        }
      };
      
      const pipeline = await import('../../../src/app/pipeline.js');
      (pipeline.version as jest.Mock).mockResolvedValue(mockVersion);
      
      const result = await client.callTool('version');
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const versionInfo = JSON.parse(result.content[0].text);
      expect(versionInfo.serverVersion).toBe('2.0.0');
      expect(versionInfo.scoringEngine).toBe('coverage-based');
      expect(versionInfo.instanceId).toBe('test-instance');
    });

    test('should handle version retrieval errors gracefully', async () => {
      // RED PHASE: Test error handling
      const client = await createConnectedTestClient(server);
      
      const pipeline = await import('../../../src/app/pipeline.js');
      (pipeline.version as jest.Mock).mockRejectedValue(new Error('Version service unavailable'));
      
      // This should fail until proper error handling is implemented
      await expect(client.callTool('version')).rejects.toThrow();
    });
  });

  describe('list_checkpoints tool', () => {
    test('should return all available checkpoints', async () => {
      // RED PHASE: Define expected checkpoints structure
      const client = await createConnectedTestClient(server);
      
      const mockCheckpoints = [
        {
          id: 'TENANCY-REQUIRED',
          category: 'tenancy',
          description: 'API must support multi-tenant patterns',
          weight: 25,
          autoFail: true
        },
        {
          id: 'NAMING-OPERATIONS',
          category: 'naming',
          description: 'All operations must have camelCase operationIds',
          weight: 10,
          autoFail: false
        }
      ];
      
      const pipeline = await import('../../../src/app/pipeline.js');
      (pipeline.listCheckpoints as jest.Mock).mockResolvedValue(mockCheckpoints);
      
      const result = await client.callTool('list_checkpoints');
      const checkpoints = JSON.parse(result.content[0].text);
      
      expect(Array.isArray(checkpoints)).toBe(true);
      expect(checkpoints).toHaveLength(2);
      expect(checkpoints[0]).toMatchObject({
        id: 'TENANCY-REQUIRED',
        category: 'tenancy',
        weight: 25,
        autoFail: true
      });
    });
  });

  describe('grade_contract tool', () => {
    test('should grade a valid API specification', async () => {
      // RED PHASE: Test the core grading functionality
      const client = await createConnectedTestClient(server);
      
      const mockGradeResult = {
        grade: {
          total: 85,
          letter: 'B',
          compliancePct: 0.85,
          autoFailTriggered: false,
          criticalIssues: 0,
          perCategory: {
            tenancy: { earned: 20, max: 20 },
            naming: { earned: 15, max: 20 }
          }
        },
        findings: [
          {
            ruleId: 'NAMING-CONVENTION',
            message: 'operationId should be camelCase',
            severity: 'warn',
            jsonPath: '$.paths["/users"].get'
          }
        ],
        checkpoints: [
          {
            checkpoint_id: 'TENANCY-REQUIRED',
            category: 'tenancy',
            max_points: 20,
            scored_points: 20
          }
        ],
        metadata: {
          specHash: 'test-hash',
          templateHash: 'template-hash',
          rulesetHash: 'ruleset-hash',
          templateVersion: '3.2.3'
        }
      };
      
      const pipeline = await import('../../../src/app/pipeline.js');
      (pipeline.gradeContract as jest.Mock).mockResolvedValue(mockGradeResult);
      
      const result = await client.callTool('grade_contract', {
        path: '/test/fixtures/valid-api.yaml'
      });
      
      const gradeResult = JSON.parse(result.content[0].text);
      
      expect(gradeResult.grade.total).toBe(85);
      expect(gradeResult.grade.letter).toBe('B');
      expect(gradeResult.findings).toHaveLength(1);
      expect(gradeResult.checkpoints).toHaveLength(1);
    });

    test('should require path parameter', async () => {
      // RED PHASE: Test parameter validation
      const client = await createConnectedTestClient(server);
      
      // This should fail until proper parameter validation is implemented
      await expect(
        client.callTool('grade_contract', {})
      ).rejects.toThrow(/path.*required/i);
    });

    test('should handle grading errors with proper error response', async () => {
      // RED PHASE: Test error handling in grading
      const client = await createConnectedTestClient(server);
      
      const pipeline = await import('../../../src/app/pipeline.js');
      (pipeline.gradeContract as jest.Mock).mockRejectedValue(new Error('Invalid OpenAPI specification'));
      
      const result = await client.callTool('grade_contract', {
        path: '/test/fixtures/invalid-api.yaml'
      });
      
      // Should return error content rather than throwing
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error grading contract');
    });

    test('should use default template path when not provided', async () => {
      // RED PHASE: Test default behavior
      const client = await createConnectedTestClient(server);
      
      const pipeline = await import('../../../src/app/pipeline.js');
      (pipeline.gradeContract as jest.Mock).mockResolvedValue({
        grade: { total: 100 },
        findings: [],
        checkpoints: [],
        metadata: {}
      });
      
      await client.callTool('grade_contract', {
        path: '/test/fixtures/valid-api.yaml'
      });
      
      // Should be called with default template path
      expect(pipeline.gradeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          templatePath: '.claude/templates/MASTER_API_TEMPLATE_v3.yaml'
        }),
        expect.any(Object)
      );
    });
  });

  describe('grade_inline tool', () => {
    test('should grade inline YAML content', async () => {
      // RED PHASE: Test inline grading functionality
      const client = await createConnectedTestClient(server);
      
      const validYaml = `
openapi: "3.0.3"
info:
  title: "Test API"
  version: "1.0.0"
paths:
  /health:
    get:
      responses:
        '200':
          description: "OK"
`;
      
      const pipeline = await import('../../../src/app/pipeline.js');
      (pipeline.gradeInline as jest.Mock).mockResolvedValue({
        grade: { total: 75 },
        findings: [],
        checkpoints: [],
        metadata: {}
      });
      
      const result = await client.callTool('grade_inline', {
        content: validYaml
      });
      
      const gradeResult = JSON.parse(result.content[0].text);
      expect(gradeResult.grade.total).toBe(75);
      
      expect(pipeline.gradeInline).toHaveBeenCalledWith(
        expect.objectContaining({ content: validYaml }),
        expect.any(Object)
      );
    });

    test('should require content parameter', async () => {
      // RED PHASE: Test parameter validation
      const client = await createConnectedTestClient(server);
      
      await expect(
        client.callTool('grade_inline', {})
      ).rejects.toThrow(/content.*required/i);
    });
  });
});

describe('MCP Server Database Integration', () => {
  describe('get_api_history tool', () => {
    test('should retrieve API grading history', async () => {
      // RED PHASE: Test database integration
      const server = createTestMcpServer();
      const client = await createConnectedTestClient(server);
      
      // Mock database response
      const mockHistory = [
        {
          run_id: 'run_123',
          graded_at: '2024-01-01T00:00:00.000Z',
          total_score: 85,
          letter_grade: 'B',
          compliance_pct: 0.85
        }
      ];
      
      // This will fail until proper database mocking is set up
      const result = await client.callTool('get_api_history', {
        apiId: 'api_test_123',
        limit: 10
      });
      
      const history = JSON.parse(result.content[0].text);
      expect(history.apiId).toBe('api_test_123');
      expect(history.rows).toHaveLength(1);
      expect(history.rows[0].total_score).toBe(85);
    });

    test('should require apiId parameter', async () => {
      // RED PHASE: Test parameter validation
      const client = await createConnectedTestClient(createTestMcpServer());
      
      await expect(
        client.callTool('get_api_history', {})
      ).rejects.toThrow(/apiId.*required/i);
    });
  });

  describe('grade_and_record tool', () => {
    test('should grade API and store results in database', async () => {
      // RED PHASE: Test combined grading and storage
      const server = createTestMcpServer();
      const client = await createConnectedTestClient(server);
      
      const pipeline = await import('../../../src/app/pipeline.js');
      (pipeline.gradeAndRecord as jest.Mock).mockResolvedValue({
        runId: 'run_new_123',
        apiId: 'api_test_456',
        grade: { total: 90 },
        findings: [],
        checkpoints: [],
        metadata: {}
      });
      
      const result = await client.callTool('grade_and_record', {
        path: '/test/fixtures/valid-api.yaml'
      });
      
      const recordResult = JSON.parse(result.content[0].text);
      expect(recordResult.runId).toBe('run_new_123');
      expect(recordResult.apiId).toBe('api_test_456');
      expect(recordResult.grade.total).toBe(90);
    });
  });
});

// These tests will ALL FAIL initially - that's the point of TDD RED phase
// They define the expected behavior that needs to be implemented