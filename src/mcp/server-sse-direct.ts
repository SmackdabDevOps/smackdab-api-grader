import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { authenticateRequest, initializeApiKeys } from './auth.js';
import * as pipeline from '../app/pipeline.js';
import fetch from 'node-fetch';

// Initialize API keys
initializeApiKeys();

const app = express();

// CORS configuration for browser-based clients
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Health check endpoint (with JSON parsing for this route only)
app.get('/health', express.json(), (req, res) => {
  res.json({ status: 'healthy', version: '1.2.0' });
});

// Debug endpoint to check environment variables (remove in production)
app.get('/debug/env', (req, res) => {
  const envVars = Object.keys(process.env)
    .filter(key => key.includes('API') || key === 'NODE_ENV')
    .reduce((obj, key) => {
      obj[key] = key.includes('API') ? '***' + process.env[key]?.substring(0, 10) + '...' : process.env[key];
      return obj;
    }, {} as any);
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    API_related_vars: envVars,
    total_env_vars: Object.keys(process.env).length
  });
});

// Direct SSE endpoint for MCP (Qodo-compatible)
app.post('/sse', authenticateRequest, async (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable Nginx buffering
  });

  // Tool registry
  const tools: Record<string, any> = {};

  // Helper to send SSE messages
  function sendSSE(data: any) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // Register tools
  tools['version'] = {
    description: 'Get grader version information',
    inputSchema: {},
    handler: async () => {
      const version = await pipeline.version();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(version, null, 2)
        }]
      };
    }
  };

  tools['list_checkpoints'] = {
    description: 'List all grading checkpoints',
    inputSchema: {},
    handler: async () => {
      const checkpoints = await pipeline.listCheckpoints();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(checkpoints, null, 2)
        }]
      };
    }
  };

  tools['grade_contract'] = {
    description: 'Grade an OpenAPI specification',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'OpenAPI content (base64 encoded) or URL' },
        isUrl: { type: 'boolean', description: 'Whether content is a URL' },
        templatePath: { type: 'string', description: 'Optional template path' }
      },
      required: ['content']
    },
    handler: async (args: any) => {
    try {
      let yamlContent: string;
      
      if (args.isUrl) {
        const response = await fetch(args.content);
        yamlContent = await response.text();
      } else {
        yamlContent = Buffer.from(args.content, 'base64').toString('utf-8');
      }

      const result = await pipeline.gradeInline({ content: yamlContent, templatePath: args.templatePath }, { progress: () => {} });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            stack: error.stack
          }, null, 2)
        }],
        isError: true
      };
    }
  }
  };

  // Handle incoming MCP messages
  let buffer = '';
  
  req.on('data', (chunk) => {
    buffer += chunk.toString();
    
    // Try to parse complete JSON messages
    try {
      const message = JSON.parse(buffer);
      buffer = ''; // Clear buffer on successful parse
      
      // Handle MCP protocol
      handleMCPMessage(message, tools, sendSSE);
    } catch (e) {
      // Not a complete JSON yet, keep buffering
    }
  });

  req.on('end', () => {
    res.end();
  });

  // Send initial connection event
  sendSSE({ type: 'connection', status: 'established' });
});

// Handle MCP protocol messages
async function handleMCPMessage(message: any, tools: Record<string, any>, sendSSE: (data: any) => void) {
  const { method, params, id } = message;

  try {
    switch (method) {
      case 'initialize':
        sendSSE({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'smackdab-api-grader',
              version: '1.2.0'
            }
          }
        });
        break;

      case 'tools/list':
        const toolList = Object.keys(tools).map(name => ({
          name,
          description: tools[name].description,
          inputSchema: tools[name].inputSchema
        }));
        
        sendSSE({
          jsonrpc: '2.0',
          id,
          result: { tools: toolList }
        });
        break;

      case 'tools/call':
        const { name, arguments: args } = params;
        const tool = tools[name];
        
        if (!tool) {
          sendSSE({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Tool not found: ${name}`
            }
          });
          return;
        }

        const result = await tool.handler(args);
        sendSSE({
          jsonrpc: '2.0',
          id,
          result
        });
        break;

      default:
        sendSSE({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        });
    }
  } catch (error: any) {
    sendSSE({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SSE MCP Server (Direct) running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});
