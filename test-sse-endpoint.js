#!/usr/bin/env node

/**
 * Test script for SSE MCP endpoint
 * Tests direct MCP protocol communication over SSE
 */

import eventsource from 'eventsource';
const EventSource = eventsource;

const SSE_URL = process.env.SSE_URL || 'http://localhost:3000/sse';
const API_KEY = process.env.API_KEY || 'sk_prod_001';

console.log('Testing SSE MCP endpoint at:', SSE_URL);

// Create test request for initialize
const initializeRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {
      roots: {}
    },
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  }
};

// Send POST request to establish SSE connection
async function testSSEConnection() {
  try {
    console.log('\nSending initialize request...');
    
    const response = await fetch(SSE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(initializeRequest)
    });

    if (!response.ok) {
      console.error('Failed to connect:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }

    console.log('SSE connection established');
    console.log('Response headers:', response.headers);

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      console.log('Received SSE data:', chunk);
    }

  } catch (error) {
    console.error('Error testing SSE endpoint:', error);
  }
}

// Test with EventSource (alternative approach)
async function testWithEventSource() {
  console.log('\n--- Testing with EventSource ---');
  
  const eventSource = new EventSource(SSE_URL, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`
    }
  });

  eventSource.onopen = () => {
    console.log('EventSource connected');
  };

  eventSource.onmessage = (event) => {
    console.log('Message received:', event.data);
    try {
      const data = JSON.parse(event.data);
      console.log('Parsed data:', data);
    } catch (e) {
      console.log('Raw data:', event.data);
    }
  };

  eventSource.onerror = (error) => {
    console.error('EventSource error:', error);
    eventSource.close();
  };

  // Send test request after connection
  setTimeout(() => {
    console.log('Sending test tool call...');
    // Note: EventSource doesn't support POST, so this is just for demonstration
    // Real MCP SSE would need a different approach
    eventSource.close();
  }, 2000);
}

// Run tests
async function runTests() {
  console.log('=== MCP SSE Endpoint Test ===\n');
  
  // Test direct POST->SSE
  await testSSEConnection();
  
  // Test with EventSource (for comparison)
  // await testWithEventSource();
  
  console.log('\n=== Test Complete ===');
}

runTests();