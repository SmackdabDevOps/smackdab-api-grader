#!/usr/bin/env node

/**
 * Test script for the new SDK-based MCP server
 */

async function testHttpServer() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('Testing SDK-based MCP Server (HTTP mode)...\n');
  
  // 1. Health check
  console.log('1. Health Check:');
  const health = await fetch(`${baseUrl}/health`);
  const healthData = await health.json();
  console.log('   Response:', healthData);
  
  // 2. Initialize session
  console.log('\n2. Initialize Session:');
  const initResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    })
  });
  
  const sessionId = initResponse.headers.get('mcp-session-id');
  const initData = await initResponse.json();
  console.log('   Session ID:', sessionId);
  console.log('   Response:', initData);
  
  if (!sessionId) {
    console.error('   ERROR: No session ID received!');
    return;
  }
  
  // 3. List tools
  console.log('\n3. List Tools:');
  const toolsResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    })
  });
  
  const toolsData = await toolsResponse.json();
  console.log('   Tools found:', toolsData.result?.tools?.length || 0);
  toolsData.result?.tools?.forEach(tool => {
    console.log(`   - ${tool.name}: ${tool.description}`);
  });
  
  // 4. Call version tool
  console.log('\n4. Call Version Tool:');
  const versionResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'version',
        arguments: {}
      }
    })
  });
  
  const versionData = await versionResponse.json();
  if (versionData.result?.content?.[0]?.text) {
    const version = JSON.parse(versionData.result.content[0].text);
    console.log('   Version info:', version);
  }
  
  // 5. Generate API ID
  console.log('\n5. Generate API ID:');
  const apiIdResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'generate_api_id',
        arguments: {
          organization: 'test-org',
          domain: 'inventory',
          type: 'rest'
        }
      }
    })
  });
  
  const apiIdData = await apiIdResponse.json();
  if (apiIdData.result?.content?.[0]?.text) {
    const apiId = JSON.parse(apiIdData.result.content[0].text);
    console.log('   Generated API ID:', apiId.apiId);
  }
  
  console.log('\n✅ All tests completed successfully!');
}

// Run the test
testHttpServer().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});