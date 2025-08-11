#!/usr/bin/env node

/**
 * Simple test for SSE MCP endpoint
 */

const SSE_URL = process.env.SSE_URL || 'http://localhost:3000/sse';
const API_KEY = process.env.API_KEY || 'sk_prod_001';

console.log('Testing SSE MCP endpoint at:', SSE_URL);

// Test initialize request
const initializeRequest = {
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
};

// Test SSE connection
async function testSSE() {
  try {
    console.log('\nSending MCP initialize over SSE...');
    
    const response = await fetch(SSE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(initializeRequest)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const text = await response.text();
      console.error('Error response:', text);
      return;
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    console.log('\nReading SSE stream...');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          console.log('SSE data:', data);
          try {
            const json = JSON.parse(data);
            console.log('Parsed message:', JSON.stringify(json, null, 2));
          } catch (e) {
            // Not JSON, just log as is
          }
        } else if (line.trim()) {
          console.log('SSE line:', line);
        }
      }
    }
    
    console.log('\nSSE stream ended');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testSSE();