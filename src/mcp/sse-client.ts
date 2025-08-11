#!/usr/bin/env tsx
/**
 * Minimal SSE-to-stdio bridge for Claude Desktop
 * This allows Claude Desktop to connect to the remote SSE server
 */

import readline from 'readline';
import fetch from 'node-fetch';

const SSE_URL = process.env.MCP_SSE_URL || 'https://smackdab-api-grader.onrender.com/sse';
const API_KEY = process.env.MCP_SSE_API_KEY || 'sk_prod_001';

// Setup stdio
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Handle incoming JSON-RPC from Claude Desktop
rl.on('line', async (line) => {
  try {
    const message = JSON.parse(line);
    
    // Send to SSE server via POST
    const response = await fetch(SSE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Parse SSE response
    const text = await response.text();
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            // Skip connection status messages
            if (parsed.type !== 'connection' && parsed.ok !== true) {
              process.stdout.write(JSON.stringify(parsed) + '\n');
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  } catch (error: any) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: error.message
      }
    }) + '\n');
  }
});

// Handle termination
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));