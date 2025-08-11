#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

interface MCPMessage {
  jsonrpc: '2.0';
  id: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

class MCPTester {
  private process: any;
  private buffer: string = '';
  private messageId: number = 1;

  async start() {
    this.process = spawn('npm', ['run', 'dev'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
    });

    this.process.stderr.on('data', (data: Buffer) => {
      // Ignore stderr (contains startup messages)
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async sendMessage(method: string, params: any = {}): Promise<any> {
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method,
      params
    };

    this.buffer = '';
    this.process.stdin.write(JSON.stringify(message) + '\n');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const response = JSON.parse(this.buffer);
      return response;
    } catch (e) {
      console.error('Failed to parse response:', this.buffer);
      return null;
    }
  }

  async stop() {
    this.process.kill();
  }
}

async function testAllTools() {
  console.log('🧪 Testing MCP Tools Implementation\n');
  
  const tester = new MCPTester();
  await tester.start();

  const results: { tool: string; status: string; error?: string }[] = [];

  try {
    // 1. Test initialize
    console.log('Testing initialize...');
    const initResponse = await tester.sendMessage('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' }
    });
    results.push({
      tool: 'initialize',
      status: initResponse?.result?.serverInfo ? '✅' : '❌',
      error: initResponse?.error?.message
    });

    // 2. Test tools/list
    console.log('Testing tools/list...');
    const toolsResponse = await tester.sendMessage('tools/list');
    const tools = toolsResponse?.result?.tools || [];
    results.push({
      tool: 'tools/list',
      status: tools.length === 8 ? '✅' : '❌',
      error: tools.length !== 8 ? `Expected 8 tools, got ${tools.length}` : undefined
    });

    // 3. Test each tool
    const toolTests = [
      { name: 'version', args: {} },
      { name: 'list_checkpoints', args: {} },
      { name: 'grade_contract', args: { path: './samples/specs/perfect/inventory.yaml' } },
      { name: 'grade_inline', args: { content: 'openapi: 3.0.3\ninfo:\n  title: Test\n  version: 1.0.0\npaths: {}' } },
      { name: 'explain_finding', args: { ruleId: 'OAS-STRUCT' } },
      { name: 'suggest_fixes', args: { path: './samples/specs/fail/bad.yaml' } },
      { name: 'get_api_history', args: { apiId: 'test-api', limit: 10 } },
      { name: 'grade_and_record', args: { path: './samples/specs/perfect/inventory.yaml' } }
    ];

    for (const test of toolTests) {
      console.log(`Testing ${test.name}...`);
      const response = await tester.sendMessage('tools/call', {
        name: test.name,
        arguments: test.args
      });

      const hasResult = response?.result?.content && response.result.content.length > 0;
      const hasError = response?.error || response?.result?.isError;

      // Debug: print full response for failed tools
      if (hasError || !hasResult) {
        console.log(`  Response for ${test.name}:`, JSON.stringify(response, null, 2).substring(0, 500));
      }
      
      results.push({
        tool: test.name,
        status: hasResult && !hasError ? '✅' : '❌',
        error: response?.error?.message || (hasError ? 'Tool returned error' : 'No content returned')
      });
    }

  } finally {
    await tester.stop();
  }

  // Print results
  console.log('\n📊 Results Summary\n');
  console.log('Tool                  | Status | Error');
  console.log('---------------------|--------|-------');
  for (const result of results) {
    const toolName = result.tool.padEnd(20);
    console.log(`${toolName} | ${result.status}      | ${result.error || ''}`);
  }

  const passed = results.filter(r => r.status === '✅').length;
  const total = results.length;
  
  console.log(`\n${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('✅ All MCP tools are working!');
    process.exit(0);
  } else {
    console.log('❌ Some tools are not working properly');
    process.exit(1);
  }
}

testAllTools().catch(console.error);