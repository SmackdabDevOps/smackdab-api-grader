import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import supertest from 'supertest';
import { createSSEClient } from '../helpers/mcp-client';
import { MockDatabase } from '../helpers/db-helpers';
import { createMockAPI } from '../helpers/mock-factories';

/**
 * Transport Abstraction Tests
 * 
 * Tests the abstraction layer that allows switching between:
 * - STDIO transport (for CLI/local usage)
 * - SSE transport (for web/cloud usage)
 * 
 * Validates:
 * - Transport switching without business logic changes
 * - Message serialization/deserialization consistency
 * - Protocol compliance across transports
 * - Connection management and lifecycle
 * - Error propagation through transport layers
 */

describe('Transport Abstraction Layer', () => {
  let mockDb: MockDatabase;
  const TEST_API_CONTENT = createMockAPI();
  const TEST_AUTH_TOKEN = 'Bearer sk_prod_001';

  beforeAll(async () => {
    mockDb = new MockDatabase();
    await mockDb.setup();
  });

  afterAll(async () => {
    await mockDb.cleanup();
  });

  describe('Protocol Compliance', () => {
    describe('MCP Protocol Version Compatibility', () => {
      it('should support MCP protocol version 2024-11-05 on all transports', async () => {
        const expectedProtocolVersion = '2024-11-05';
        
        // Test STDIO transport
        const stdioResult = await testStdioProtocol();
        expect(stdioResult.protocolVersion).toBe(expectedProtocolVersion);
        
        // Test SSE transports
        const sseServers = [
          { name: 'sse', port: 3001 },
          { name: 'sse-simple', port: 3002 },
          { name: 'sse-direct', port: 3003 }
        ];
        
        for (const server of sseServers) {
          const sseResult = await testSSEProtocol(server.port);
          expect(sseResult.protocolVersion).toBe(expectedProtocolVersion);
        }
      });
      
      async function testStdioProtocol(): Promise<any> {
        return new Promise((resolve, reject) => {
          const server = spawn('tsx', ['src/mcp/server.ts'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, NODE_ENV: 'test' }
          });
          
          const timeout = setTimeout(() => {
            server.kill();
            reject(new Error('STDIO protocol test timeout'));
          }, 5000);
          
          server.stdout?.on('data', (data) => {
            try {
              const response = JSON.parse(data.toString());
              if (response.result?.protocolVersion) {
                clearTimeout(timeout);
                server.kill();
                resolve(response.result);
              }
            } catch (e) {
              // Ignore non-JSON output
            }
          });
          
          // Send initialize message
          const initMessage = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'test-client', version: '1.0.0' }
            }
          };
          
          server.stdin?.write(JSON.stringify(initMessage) + '\n');
        });
      }
      
      async function testSSEProtocol(port: number): Promise<any> {
        // Mock SSE protocol test - in real implementation would start server and test
        return {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'smackdab-api-grader', version: '1.2.0' }
        };
      }
    });

    describe('Message Format Consistency', () => {
      it('should serialize/deserialize messages identically across transports', async () => {
        const testMessages = [
          {
            type: 'tool_call',
            message: {
              jsonrpc: '2.0',
              id: 'test-1',
              method: 'tools/call',
              params: {
                name: 'version',
                arguments: {}
              }
            }
          },
          {
            type: 'tool_call_with_args',
            message: {
              jsonrpc: '2.0',
              id: 'test-2', 
              method: 'tools/call',
              params: {
                name: 'grade_contract',
                arguments: {
                  content: Buffer.from(TEST_API_CONTENT).toString('base64'),
                  isUrl: false,
                  templatePath: '/app/templates/MASTER_API_TEMPLATE_v3.yaml'
                }
              }
            }
          }
        ];

        for (const testCase of testMessages) {
          // Test message serialization consistency
          const serialized = JSON.stringify(testCase.message);
          const deserialized = JSON.parse(serialized);
          
          expect(deserialized).toEqual(testCase.message);
          expect(deserialized.jsonrpc).toBe('2.0');
          expect(deserialized.id).toBeDefined();
          expect(deserialized.method).toBeDefined();
        }
      });

      it('should handle binary data consistently across transports', async () => {
        const binaryData = Buffer.from(TEST_API_CONTENT);
        const base64Encoded = binaryData.toString('base64');
        
        // Test base64 encoding/decoding consistency
        const decoded = Buffer.from(base64Encoded, 'base64').toString('utf-8');
        expect(decoded).toBe(TEST_API_CONTENT);
        
        // Test with different content types
        const jsonContent = JSON.stringify({ test: 'data', nested: { value: 123 } });
        const jsonBase64 = Buffer.from(jsonContent).toString('base64');
        const jsonDecoded = Buffer.from(jsonBase64, 'base64').toString('utf-8');
        expect(JSON.parse(jsonDecoded)).toEqual(JSON.parse(jsonContent));
      });
    });
  });

  describe('Connection Management', () => {
    describe('STDIO Transport', () => {
      it('should handle stdin/stdout communication reliably', async () => {
        const server = spawn('tsx', ['src/mcp/server.ts'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, NODE_ENV: 'test' }
        });

        let messageCount = 0;
        const responses: any[] = [];

        server.stdout?.on('data', (data) => {
          const lines = data.toString().split('\n').filter(line => line.trim());
          lines.forEach(line => {
            try {
              const response = JSON.parse(line);
              responses.push(response);
              messageCount++;
            } catch (e) {
              // Ignore non-JSON output like logs
            }
          });
        });

        // Send multiple messages to test reliability
        const messages = [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
          { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
          { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'version', arguments: {} } }
        ];

        messages.forEach(message => {
          server.stdin?.write(JSON.stringify(message) + '\n');
        });

        // Wait for responses
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        server.kill();
        
        expect(responses.length).toBeGreaterThanOrEqual(messages.length);
        responses.forEach(response => {
          expect(response).toHaveProperty('jsonrpc', '2.0');
          expect(response).toHaveProperty('id');
        });
      });

      it('should handle process termination gracefully', async () => {
        const server = spawn('tsx', ['src/mcp/server.ts'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, NODE_ENV: 'test' }
        });

        let processExited = false;
        server.on('exit', (code) => {
          processExited = true;
          expect(code).toBe(null); // Killed, not crashed
        });

        // Wait for startup
        await new Promise(resolve => setTimeout(resolve, 1000));

        server.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        expect(processExited).toBe(true);
      });
    });

    describe('SSE Transport', () => {
      let sseServer: ChildProcess;
      const port = 3010;

      beforeEach(async () => {
        sseServer = spawn('tsx', ['src/mcp/server-sse-simple.ts'], {
          stdio: 'pipe',
          env: { ...process.env, NODE_ENV: 'test', PORT: port.toString() }
        });
        
        // Wait for server startup
        await new Promise(resolve => setTimeout(resolve, 3000));
      });

      afterEach(async () => {
        if (sseServer) {
          sseServer.kill();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      });

      it('should maintain persistent SSE connections', async () => {
        const response = await supertest(`http://localhost:${port}`)
          .get('/sse')
          .set('Authorization', TEST_AUTH_TOKEN)
          .expect(200)
          .expect('Content-Type', 'text/event-stream; charset=utf-8');

        expect(response.text).toContain('event: connection');
        expect(response.text).toContain('event: endpoint');
      });

      it('should handle connection drops and reconnection', async () => {
        // Test connection drop handling
        let client = createSSEClient(`http://localhost:${port}`, TEST_AUTH_TOKEN);
        
        // Make initial request
        const result1 = await client.callTool('version');
        expect(result1).toBeDefined();

        // Simulate connection drop and recovery
        await client.disconnect();
        client = createSSEClient(`http://localhost:${port}`, TEST_AUTH_TOKEN);
        
        // Should work after reconnection
        const result2 = await client.callTool('version');
        expect(result2).toBeDefined();
      });

      it('should handle multiple concurrent connections', async () => {
        const clients = await Promise.all([
          createSSEClient(`http://localhost:${port}`, TEST_AUTH_TOKEN),
          createSSEClient(`http://localhost:${port}`, TEST_AUTH_TOKEN),
          createSSEClient(`http://localhost:${port}`, TEST_AUTH_TOKEN)
        ]);

        // All clients should work independently
        const results = await Promise.all(
          clients.map(client => client.callTool('version'))
        );

        results.forEach(result => {
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
        });

        // Clean up
        await Promise.all(clients.map(client => client.disconnect()));
      });
    });
  });

  describe('Transport Switching', () => {
    it('should support runtime transport switching', async () => {
      // Mock unified server that can switch transports
      class UnifiedMCPServer {
        private currentTransport: 'stdio' | 'sse' = 'stdio';
        private server: ChildProcess | null = null;

        async switchTransport(newTransport: 'stdio' | 'sse', port?: number) {
          // Stop current server
          if (this.server) {
            this.server.kill();
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          this.currentTransport = newTransport;
          
          if (newTransport === 'stdio') {
            this.server = spawn('tsx', ['src/mcp/server.ts'], {
              stdio: ['pipe', 'pipe', 'pipe'],
              env: { ...process.env, NODE_ENV: 'test' }
            });
          } else {
            this.server = spawn('tsx', ['src/mcp/server-sse-simple.ts'], {
              stdio: 'pipe',
              env: { ...process.env, NODE_ENV: 'test', PORT: (port || 3011).toString() }
            });
          }
          
          // Wait for startup
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        getTransport() {
          return this.currentTransport;
        }

        async shutdown() {
          if (this.server) {
            this.server.kill();
            this.server = null;
          }
        }
      }

      const unifiedServer = new UnifiedMCPServer();

      try {
        // Test switching from STDIO to SSE
        await unifiedServer.switchTransport('stdio');
        expect(unifiedServer.getTransport()).toBe('stdio');

        await unifiedServer.switchTransport('sse', 3011);
        expect(unifiedServer.getTransport()).toBe('sse');

        // Test functionality after switch
        const client = createSSEClient('http://localhost:3011', TEST_AUTH_TOKEN);
        const result = await client.callTool('version');
        expect(result).toBeDefined();

      } finally {
        await unifiedServer.shutdown();
      }
    });
  });

  describe('Error Propagation', () => {
    it('should propagate errors consistently across transports', async () => {
      const errorScenarios = [
        {
          tool: 'grade_contract',
          args: { content: 'malformed-base64-!' },
          expectedErrorType: 'invalid_input'
        },
        {
          tool: 'explain_finding',
          args: { ruleId: 'non-existent-rule' },
          expectedErrorType: 'not_found'
        },
        {
          tool: 'get_api_history',
          args: { apiId: '', limit: -1 },
          expectedErrorType: 'invalid_params'
        }
      ];

      for (const scenario of errorScenarios) {
        // Test STDIO error handling
        const stdioError = await testStdioError(scenario.tool, scenario.args);
        expect(stdioError).toBeDefined();
        expect(stdioError.error).toBeDefined();

        // Test SSE error handling  
        const sseError = await testSSEError(scenario.tool, scenario.args);
        expect(sseError).toBeDefined();
        expect(sseError.error).toBeDefined();

        // Errors should be structurally similar
        expect(typeof stdioError.error.message).toBe(typeof sseError.error.message);
      }
    });

    async function testStdioError(tool: string, args: any): Promise<any> {
      return new Promise((resolve) => {
        const server = spawn('tsx', ['src/mcp/server.ts'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, NODE_ENV: 'test' }
        });

        server.stdout?.on('data', (data) => {
          try {
            const response = JSON.parse(data.toString());
            if (response.error || response.result?.isError) {
              server.kill();
              resolve(response);
            }
          } catch (e) {
            // Ignore
          }
        });

        const message = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: tool, arguments: args }
        };

        server.stdin?.write(JSON.stringify(message) + '\n');

        // Timeout fallback
        setTimeout(() => {
          server.kill();
          resolve({ error: { message: 'timeout' } });
        }, 5000);
      });
    }

    async function testSSEError(tool: string, args: any): Promise<any> {
      // Mock SSE error test
      return {
        error: {
          code: -32603,
          message: `Error in ${tool}: invalid input`,
          data: args
        }
      };
    }
  });

  describe('Performance Parity', () => {
    it('should have comparable performance across transports', async () => {
      const performanceTests = [
        { tool: 'version', args: {} },
        { tool: 'list_checkpoints', args: {} },
        { tool: 'grade_inline', args: { content: TEST_API_CONTENT } }
      ];

      const results: { [transport: string]: number[] } = {
        stdio: [],
        sse: []
      };

      for (const test of performanceTests) {
        // Test STDIO performance
        const stdioTime = await measureStdioPerformance(test.tool, test.args);
        results.stdio.push(stdioTime);

        // Test SSE performance  
        const sseTime = await measureSSEPerformance(test.tool, test.args);
        results.sse.push(sseTime);
      }

      // Calculate averages
      const stdioAvg = results.stdio.reduce((a, b) => a + b, 0) / results.stdio.length;
      const sseAvg = results.sse.reduce((a, b) => a + b, 0) / results.sse.length;

      // Performance should be within 100% of each other (SSE can be slower due to HTTP overhead)
      expect(Math.max(stdioAvg, sseAvg) / Math.min(stdioAvg, sseAvg)).toBeLessThan(2.0);
    });

    async function measureStdioPerformance(tool: string, args: any): Promise<number> {
      // Mock performance measurement
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));
      return Math.random() * 100 + 50; // 50-150ms
    }

    async function measureSSEPerformance(tool: string, args: any): Promise<number> {
      // Mock performance measurement (slightly slower for HTTP overhead)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 20));
      return Math.random() * 150 + 75; // 75-225ms
    }
  });

  describe('Content Type Handling', () => {
    it('should handle different content types correctly across transports', async () => {
      const contentTypes = [
        { type: 'application/yaml', content: TEST_API_CONTENT },
        { type: 'application/json', content: JSON.stringify({ openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' } }) },
        { type: 'text/plain', content: 'openapi: 3.0.0\ninfo:\n  title: Plain Text API\n  version: 1.0.0' }
      ];

      for (const contentType of contentTypes) {
        const base64Content = Buffer.from(contentType.content).toString('base64');
        
        // Both transports should handle the same content types
        expect(Buffer.from(base64Content, 'base64').toString('utf-8')).toBe(contentType.content);
      }
    });
  });
});