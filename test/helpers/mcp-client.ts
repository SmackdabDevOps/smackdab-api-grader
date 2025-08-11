import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';

/**
 * SSE MCP Client for testing SSE-based servers
 */
export class SSEMcpClient {
  private baseUrl: string;
  private authToken: string;
  private messageId = 1;

  constructor(baseUrl: string, authToken: string) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
  }

  async callTool(toolName: string, args: any = {}): Promise<any> {
    const id = (this.messageId++).toString();
    
    const message = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    const response = await fetch(`${this.baseUrl}/sse`, {
      method: 'POST',
      headers: {
        'Authorization': this.authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Handle different response types based on server implementation
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      return this.parseSSEResponse(response);
    } else {
      const result = await response.json() as any;
      if (result.error) {
        throw new Error(result.error.message || 'Server error');
      }
      return result.result || result;
    }
  }

  private async parseSSEResponse(response: any): Promise<any> {
    const text = await response.text();
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.jsonrpc && data.result) {
            return data.result;
          } else if (data.jsonrpc && data.error) {
            throw new Error(data.error.message);
          } else if (data.ok) {
            return data;
          }
        } catch (e) {
          // Ignore invalid JSON lines
        }
      }
    }
    
    throw new Error('No valid response found in SSE stream');
  }

  async initialize(): Promise<any> {
    const message = {
      jsonrpc: '2.0',
      id: (this.messageId++).toString(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-sse-client', version: '1.0.0' }
      }
    };

    return this.sendMessage(message);
  }

  async listTools(): Promise<any> {
    const message = {
      jsonrpc: '2.0',
      id: (this.messageId++).toString(),
      method: 'tools/list',
      params: {}
    };

    return this.sendMessage(message);
  }

  private async sendMessage(message: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/sse`, {
      method: 'POST',
      headers: {
        'Authorization': this.authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      return this.parseSSEResponse(response);
    } else {
      const result = await response.json() as any;
      if (result.error) {
        throw new Error(result.error.message || 'Server error');
      }
      return result.result || result;
    }
  }

  async disconnect(): Promise<void> {
    // SSE clients don't maintain persistent connections in our implementation
    // This is a no-op for compatibility
  }
}

/**
 * Create SSE client for testing
 */
export function createSSEClient(baseUrl: string, authToken: string): SSEMcpClient {
  return new SSEMcpClient(baseUrl, authToken);
}

/**
 * Mock MCP transport for testing
 * Simulates the communication between client and server
 */
export class MockMcpTransport extends EventEmitter {
  private connected = false;
  private responses: Map<string, any> = new Map();

  async start(): Promise<void> {
    this.connected = true;
    this.emit('connect');
  }

  async close(): Promise<void> {
    this.connected = false;
    this.emit('disconnect');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async send(message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }
    this.emit('message', message);
  }

  // Helper to mock responses
  mockResponse(id: string, response: any): void {
    this.responses.set(id, response);
  }

  // Simulate receiving a message
  simulateMessage(message: any): void {
    this.emit('message', message);
  }
}

/**
 * MCP Test Client - simulates client interactions with the server
 */
export class McpTestClient {
  private messageId = 1;
  private server: McpServer;
  private transport: MockMcpTransport;
  private responses: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }> = new Map();

  constructor(server: McpServer) {
    this.server = server;
    this.transport = new MockMcpTransport();
    this.setupMessageHandling();
  }

  private setupMessageHandling(): void {
    this.transport.on('message', (message) => {
      // Handle server responses
      if (message.id && this.responses.has(message.id)) {
        const resolver = this.responses.get(message.id);
        this.responses.delete(message.id);
        if (resolver) {
          if (message.error) {
            (resolver as any).reject(new Error(message.error.message));
          } else {
            (resolver as any).resolve(message.result);
          }
        }
      }
    });
  }

  async connect(): Promise<void> {
    await this.transport.start();
    await this.server.connect(this.transport);
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  /**
   * Call a tool on the server
   */
  async callTool(toolName: string, arguments_?: any): Promise<any> {
    const id = (this.messageId++).toString();
    
    return new Promise((resolve, reject) => {
      this.responses.set(id, { resolve, reject });
      
      const message = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: arguments_ || {}
        }
      };

      this.transport.send(message);
    });
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any> {
    const id = (this.messageId++).toString();
    
    return new Promise((resolve, reject) => {
      this.responses.set(id, { resolve, reject });
      
      const message = {
        jsonrpc: '2.0',
        id,
        method: 'tools/list',
        params: {}
      };

      this.transport.send(message);
    });
  }

  /**
   * Get server info
   */
  async getServerInfo(): Promise<any> {
    const id = (this.messageId++).toString();
    
    return new Promise((resolve, reject) => {
      this.responses.set(id, { resolve, reject });
      
      const message = {
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      };

      this.transport.send(message);
    });
  }
}

/**
 * Create a test MCP server instance for testing
 */
export function createTestMcpServer(options?: {
  name?: string;
  version?: string;
  description?: string;
}): McpServer {
  return new McpServer({
    name: options?.name || 'test-server',
    version: options?.version || '1.0.0',
    description: options?.description || 'Test MCP server'
  });
}

/**
 * Helper to create a connected test client
 */
export async function createConnectedTestClient(server: McpServer): Promise<McpTestClient> {
  const client = new McpTestClient(server);
  await client.connect();
  return client;
}