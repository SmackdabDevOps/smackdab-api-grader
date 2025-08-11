#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

// Start the MCP server
const server = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Create interface for reading server output
const rl = readline.createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

// Handle server errors
server.stderr.on('data', (data) => {
  console.error('Server log:', data.toString());
});

// Send initialization request
const initRequest = JSON.stringify({
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {
      prompts: {},
      tools: {}
    },
    clientInfo: {
      name: "test-client",
      version: "1.0.0"
    }
  },
  id: 1
});

// Send list tools request after init
const listToolsRequest = JSON.stringify({
  jsonrpc: "2.0",
  method: "tools/list",
  params: {},
  id: 2
});

let initialized = false;

// Handle server responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('Response:', JSON.stringify(response, null, 2));
    
    if (response.id === 1 && response.result) {
      console.log('✅ Server initialized successfully');
      initialized = true;
      // Send list tools request
      server.stdin.write(listToolsRequest + '\n');
    } else if (response.id === 2 && response.result) {
      console.log('✅ Tools listed successfully:');
      response.result.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
      process.exit(0);
    }
  } catch (e) {
    // Not JSON, ignore
  }
});

// Send initialization after server starts
setTimeout(() => {
  console.log('Sending initialization request...');
  server.stdin.write(initRequest + '\n');
}, 1000);

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Test timed out');
  server.kill();
  process.exit(1);
}, 10000);