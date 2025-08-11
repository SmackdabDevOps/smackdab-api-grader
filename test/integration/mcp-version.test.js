#!/usr/bin/env node

// Test script to verify MCP server returns version info
import { spawn } from 'child_process';

const mcp = spawn('node', [
  '/Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter/node_modules/.bin/tsx',
  '/Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter/src/mcp/server.ts'
]);

let buffer = '';

mcp.stdout.on('data', (data) => {
  buffer += data.toString();
  
  // Try to parse complete JSON messages
  const lines = buffer.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    try {
      const msg = JSON.parse(lines[i]);
      console.log('MCP Response:', JSON.stringify(msg, null, 2));
    } catch (e) {
      // Not a complete JSON message yet
    }
  }
  buffer = lines[lines.length - 1];
});

mcp.stderr.on('data', (data) => {
  console.error('MCP stderr:', data.toString());
});

// Send initialization
setTimeout(() => {
  const init = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '0.1.0',
      capabilities: {}
    }
  };
  mcp.stdin.write(JSON.stringify(init) + '\n');
}, 100);

// Call version tool
setTimeout(() => {
  const versionCall = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'version',
      arguments: {}
    }
  };
  mcp.stdin.write(JSON.stringify(versionCall) + '\n');
}, 500);

// Call grade_contract with test file
setTimeout(() => {
  const gradeCall = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'grade_contract',
      arguments: {
        path: '/tmp/test-api-minimal.yaml'
      }
    }
  };
  mcp.stdin.write(JSON.stringify(gradeCall) + '\n');
}, 1000);

// Exit after a delay
setTimeout(() => {
  console.log('\n=== Test complete ===');
  mcp.kill();
  process.exit(0);
}, 3000);