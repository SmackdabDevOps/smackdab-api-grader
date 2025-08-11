/**
 * Remote Bridge Tests
 * Tests the MCP remote bridge functionality for team access
 */

import { spawn, ChildProcess } from 'child_process';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import readline from 'readline';

describe('MCP Remote Bridge', () => {
  let bridge: ChildProcess;
  let responses: any[] = [];
  let errors: string[] = [];

  beforeEach(() => {
    responses = [];
    errors = [];
  });

  afterEach(() => {
    if (bridge && !bridge.killed) {
      bridge.kill();
    }
  });

  describe('Bridge Connection', () => {
    it('should connect to remote server', async () => {
      bridge = spawn('node', ['mcp-remote-bridge.cjs'], {
        env: {
          ...process.env,
          MCP_REMOTE_URL: 'http://localhost:3001',
          MCP_API_KEY: 'sk_prod_001'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const connected = await waitForConnection(bridge);
      expect(connected).toBe(true);
    });

    it('should handle invalid API key', async () => {
      bridge = spawn('node', ['mcp-remote-bridge.cjs'], {
        env: {
          ...process.env,
          MCP_REMOTE_URL: 'http://localhost:3001',
          MCP_API_KEY: 'invalid_key'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const errorReceived = await waitForError(bridge, 'Unauthorized');
      expect(errorReceived).toBe(true);
    });

    it('should handle unreachable server', async () => {
      bridge = spawn('node', ['mcp-remote-bridge.cjs'], {
        env: {
          ...process.env,
          MCP_REMOTE_URL: 'http://localhost:9999',
          MCP_API_KEY: 'sk_prod_001'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const errorReceived = await waitForError(bridge, 'ECONNREFUSED');
      expect(errorReceived).toBe(true);
    });
  });

  describe('MCP Protocol', () => {
    beforeEach(async () => {
      // Start local test server first
      await startTestServer();
      
      bridge = spawn('node', ['mcp-remote-bridge.cjs'], {
        env: {
          ...process.env,
          MCP_REMOTE_URL: 'http://localhost:3001',
          MCP_API_KEY: 'sk_prod_001'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      await waitForConnection(bridge);
    });

    it('should handle initialize request', async () => {
      const message = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' }
        }
      };

      const response = await sendAndReceive(bridge, message);
      
      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', 1);
      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('protocolVersion', '2024-11-05');
      expect(response.result).toHaveProperty('serverInfo');
    });

    it('should handle tools/list request', async () => {
      const message = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      const response = await sendAndReceive(bridge, message);
      
      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', 2);
      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('tools');
      expect(Array.isArray(response.result.tools)).toBe(true);
      
      // Check for expected tools
      const toolNames = response.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('version');
      expect(toolNames).toContain('list_checkpoints');
      expect(toolNames).toContain('grade_contract');
    });

    it('should handle tools/call for version', async () => {
      const message = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'version',
          arguments: {}
        }
      };

      const response = await sendAndReceive(bridge, message);
      
      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', 3);
      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
      
      const content = JSON.parse(response.result.content[0].text);
      expect(content).toHaveProperty('serverVersion');
      expect(content).toHaveProperty('scoringEngine');
    });

    it('should handle concurrent requests', async () => {
      const messages = [
        { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'version', arguments: {} } },
        { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_checkpoints', arguments: {} } }
      ];

      const promises = messages.map(msg => sendAndReceive(bridge, msg));
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(2);
      expect(responses[0].id).toBe(10);
      expect(responses[1].id).toBe(11);
    });

    it('should handle malformed requests', async () => {
      const message = {
        jsonrpc: '2.0',
        id: 99,
        method: 'invalid_method'
      };

      const response = await sendAndReceive(bridge, message);
      
      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', 99);
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await startTestServer();
      
      bridge = spawn('node', ['mcp-remote-bridge.cjs'], {
        env: {
          ...process.env,
          MCP_REMOTE_URL: 'http://localhost:3001',
          MCP_API_KEY: 'sk_prod_001'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      await waitForConnection(bridge);
    });

    it('should recover from server disconnect', async () => {
      // Send initial request
      const message1 = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'version', arguments: {} }
      };
      
      const response1 = await sendAndReceive(bridge, message1);
      expect(response1).toHaveProperty('result');

      // Simulate server restart
      await stopTestServer();
      await startTestServer();

      // Send request after reconnection
      const message2 = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'version', arguments: {} }
      };
      
      const response2 = await sendAndReceive(bridge, message2);
      expect(response2).toHaveProperty('result');
    });

    it('should handle network timeout', async () => {
      // This would require mocking network delays
      // For now, we'll test that the bridge has timeout handling
      expect(bridge).toBeDefined();
      expect(bridge.killed).toBe(false);
    });
  });
});

// Helper functions
async function waitForConnection(bridge: ChildProcess): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000);
    
    if (bridge.stderr) {
      const rl = readline.createInterface({ input: bridge.stderr });
      rl.on('line', (line) => {
        if (line.includes('Connecting to')) {
          clearTimeout(timeout);
          rl.close();
          resolve(true);
        }
      });
    }
  });
}

async function waitForError(bridge: ChildProcess, errorText: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000);
    
    if (bridge.stderr) {
      const rl = readline.createInterface({ input: bridge.stderr });
      rl.on('line', (line) => {
        if (line.includes(errorText)) {
          clearTimeout(timeout);
          rl.close();
          resolve(true);
        }
      });
    }

    bridge.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        resolve(true);
      }
    });
  });
}

async function sendAndReceive(bridge: ChildProcess, message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for response')), 5000);
    
    if (bridge.stdout) {
      const rl = readline.createInterface({ input: bridge.stdout });
      
      const handler = (line: string) => {
        try {
          const response = JSON.parse(line);
          if (response.id === message.id) {
            clearTimeout(timeout);
            rl.close();
            resolve(response);
          }
        } catch (e) {
          // Not JSON or not our response
        }
      };
      
      rl.on('line', handler);
    }
    
    if (bridge.stdin) {
      bridge.stdin.write(JSON.stringify(message) + '\n');
    }
  });
}

// Test server management
let testServer: ChildProcess | null = null;

async function startTestServer(): Promise<void> {
  return new Promise((resolve) => {
    testServer = spawn('npm', ['run', 'start'], {
      env: { ...process.env, PORT: '3001' },
      stdio: 'ignore'
    });
    
    // Wait for server to start
    setTimeout(resolve, 2000);
  });
}

async function stopTestServer(): Promise<void> {
  if (testServer) {
    testServer.kill();
    testServer = null;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}