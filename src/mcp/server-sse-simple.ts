import express from 'express';
import cors from 'cors';
import * as pipeline from '../app/pipeline.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS for browser clients
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', version: '1.3.0' });
});

// Simple auth check - hardcoded for now
function checkAuth(req: express.Request): boolean {
  const auth = req.headers.authorization;
  return auth === 'Bearer sk_prod_001';
}

// SSE endpoint - simplified direct implementation
app.post('/sse', express.text({ type: 'application/json' }), async (req, res) => {
  console.log('SSE request received');
  
  // Check auth
  if (!checkAuth(req)) {
    console.log('Auth failed');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  // Send connection established
  res.write('data: {"type":"connection","status":"established"}\n\n');
  
  try {
    // Parse the request body
    const message = JSON.parse(req.body);
    console.log('Received message:', message.method);
    
    let response: any;
    
    // Handle MCP protocol messages
    switch (message.method) {
      case 'initialize':
        response = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'smackdab-api-grader',
              version: '1.3.0'
            }
          }
        };
        break;
        
      case 'tools/list':
        response = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: 'version',
                description: 'Get grader version information',
                inputSchema: {}
              },
              {
                name: 'list_checkpoints',
                description: 'List all grading checkpoints',
                inputSchema: {}
              },
              {
                name: 'grade_contract',
                description: 'Grade an OpenAPI specification',
                inputSchema: {
                  type: 'object',
                  properties: {
                    content: {
                      type: 'string',
                      description: 'OpenAPI content (base64 encoded) or URL'
                    },
                    isUrl: {
                      type: 'boolean',
                      description: 'Whether content is a URL'
                    },
                    templatePath: {
                      type: 'string',
                      description: 'Optional template path'
                    }
                  },
                  required: ['content']
                }
              }
            ]
          }
        };
        break;
        
      case 'tools/call':
        const toolName = message.params?.name;
        const args = message.params?.arguments || {};
        
        switch (toolName) {
          case 'version':
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    version: '1.3.0',
                    grader: 'smackdab-api-grader'
                  }, null, 2)
                }]
              }
            };
            break;
            
          case 'list_checkpoints':
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify(await pipeline.listCheckpoints(), null, 2)
                }]
              }
            };
            break;
            
          case 'grade_contract':
            try {
              let yamlContent: string;
              
              if (args.isUrl) {
                const fetchResponse = await fetch(args.content);
                yamlContent = await fetchResponse.text();
              } else {
                yamlContent = Buffer.from(args.content, 'base64').toString('utf-8');
              }
              
              const result = await pipeline.gradeInline({ content: yamlContent, templatePath: args.templatePath }, { progress: () => {} });
              
              response = {
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }]
                }
              };
            } catch (error: any) {
              response = {
                jsonrpc: '2.0',
                id: message.id,
                error: {
                  code: -32603,
                  message: error.message
                }
              };
            }
            break;
            
          default:
            response = {
              jsonrpc: '2.0',
              id: message.id,
              error: {
                code: -32601,
                message: `Unknown tool: ${toolName}`
              }
            };
        }
        break;
        
      default:
        response = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `Method not found: ${message.method}`
          }
        };
    }
    
    // Send the response
    res.write(`data: ${JSON.stringify(response)}\n\n`);
    
  } catch (error: any) {
    console.error('Error processing message:', error);
    const errorResponse = {
      jsonrpc: '2.0',
      id: (req.body as any)?.id || null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: error.message
      }
    };
    res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
  }
  
  // End the response
  res.end();
});

// Start server
app.listen(PORT, () => {
  console.log(`Simple SSE MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});