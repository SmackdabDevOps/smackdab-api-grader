#!/usr/bin/env node

/**
 * CLI wrapper for the API Grader MCP Client
 * This allows users to run: npx @smackdab/api-grader-mcp
 */

import { main } from './index.js';

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Smackdab API Grader MCP Client

Usage:
  api-grader-mcp [options]

Options:
  --api-url <url>    Remote API URL (default: https://smackdab-api-grader.onrender.com)
  --api-key <key>    API key for authentication
  --debug            Enable debug logging
  --test             Test connection to remote API
  --help             Show this help message

Environment Variables:
  API_GRADER_URL     Remote API URL
  API_GRADER_KEY     API key for authentication
  DEBUG              Enable debug logging (set to 'true')

Examples:
  # Run with default settings
  api-grader-mcp

  # Run with custom API URL
  api-grader-mcp --api-url https://my-api.com

  # Run with API key
  API_GRADER_KEY=sk_123 api-grader-mcp

  # Test connection
  api-grader-mcp --test

For Claude Desktop configuration, add to your config:
{
  "mcpServers": {
    "api-grader": {
      "command": "npx",
      "args": ["@smackdab/api-grader-mcp"],
      "env": {
        "API_GRADER_KEY": "your-api-key-here"
      }
    }
  }
}
  `);
  process.exit(0);
}

// Handle --api-url flag
const apiUrlIndex = args.indexOf('--api-url');
if (apiUrlIndex !== -1 && args[apiUrlIndex + 1]) {
  process.env.API_GRADER_URL = args[apiUrlIndex + 1];
}

// Handle --api-key flag
const apiKeyIndex = args.indexOf('--api-key');
if (apiKeyIndex !== -1 && args[apiKeyIndex + 1]) {
  process.env.API_GRADER_KEY = args[apiKeyIndex + 1];
}

// Handle --debug flag
if (args.includes('--debug')) {
  process.env.DEBUG = 'true';
}

// Handle --test flag
if (args.includes('--test')) {
  console.log('Testing connection to API...');
  const apiUrl = process.env.API_GRADER_URL || 'https://smackdab-api-grader.onrender.com';
  
  fetch(`${apiUrl}/health`)
    .then(res => res.json())
    .then(data => {
      console.log('✅ Connection successful!');
      console.log('API Response:', data);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Connection failed:', err.message);
      process.exit(1);
    });
} else {
  // Normal operation - start the MCP server
  main().catch(error => {
    console.error('Failed to start:', error);
    process.exit(1);
  });
}