import express from 'express';
import cors from 'cors';
import * as pipeline from '../app/pipeline.js';
import { generateApiId, validateApiIdFormat, getApiIdInstructions } from './tools/api-id-generator.js';
import { checkApiId } from '../scoring/prerequisites.js';
import { calculateMetrics } from '../app/tracking/metrics-calculator.js';
import { calculateImprovements, generateImprovementSummary } from '../app/tracking/improvement-analyzer.js';
import { compareApiVersions, generateComparisonSummary } from '../app/tracking/version-comparator.js';
import { GraderDB } from './persistence/db.js';

const app = express();
const PORT = process.env.PORT || 3000;

// No session management needed for MCP SSE compliance

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

// GET endpoint - MCP spec says this returns 405 if SSE not supported on GET
app.get('/sse', async (req, res) => {
  // MCP clients don't use GET for SSE - they POST and expect SSE response
  res.status(405).json({ error: 'Method Not Allowed - Use POST' });
});

// Remove the /sse/message endpoint - not needed for MCP

// SSE endpoint - MCP compliant implementation
app.post('/sse', express.text({ type: '*/*' }), async (req, res) => {
  // Check auth
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  // MCP SSE: POST request with JSON-RPC, respond with SSE stream
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  try {
    const message = JSON.parse(req.body || '{}');
    const out = await handleMcpMessage(message);
    
    // Send response as SSE data
    res.write(`data: ${JSON.stringify(out)}\n\n`);
  } catch (error: any) {
    const errorResponse = { 
      jsonrpc: '2.0', 
      id: null, 
      error: { 
        code: -32700, 
        message: 'Parse error', 
        data: error.message 
      } 
    };
    res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
  }
  
  // End the SSE stream
  res.end();
});

// Helper to load spec from YAML content
async function loadSpec(yamlContent: string) {
  const { parseDocument } = await import('yaml');
  const doc = parseDocument(yamlContent, { keepNodeTypes: true } as any);
  return { js: doc.toJS(), raw: yamlContent };
}

// Unified MCP message handler
async function handleMcpMessage(message: any) {
  console.log('Received message:', message.method);
  let response: any;
  switch (message.method) {
    case 'initialize':
      response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'smackdab-api-grader', version: '1.3.0' }
        }
      };
      break;
    case 'tools/list':
      response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            { name: 'version', description: 'Get grader version information', inputSchema: {} },
            { name: 'list_checkpoints', description: 'List all grading checkpoints', inputSchema: {} },
            { name: 'grade_contract', description: 'Grade an OpenAPI specification', inputSchema: {
              type: 'object', properties: {
                content: { type: 'string', description: 'OpenAPI content (base64 encoded) or URL' },
                isUrl: { type: 'boolean', description: 'Whether content is a URL' },
                templatePath: { type: 'string', description: 'Optional template path' }
              }, required: ['content']
            } },
            { name: 'generate_api_id', description: 'Generate a unique API identifier', inputSchema: {
              type: 'object', properties: {
                organization: { type: 'string', description: 'Organization name (optional)' },
                domain: { type: 'string', description: 'Business domain (optional)' },
                type: { type: 'string', description: 'API type (optional)' }
              }
            } },
            { name: 'validate_api_id', description: 'Validate an API has x-api-id', inputSchema: {
              type: 'object', properties: {
                content: { type: 'string', description: 'OpenAPI content (base64 encoded)' }
              }, required: ['content']
            } },
            { name: 'get_api_history', description: 'Get grading history for an API', inputSchema: {
              type: 'object', properties: {
                apiUuid: { type: 'string', description: 'The API UUID from x-api-id' }
              }, required: ['apiUuid']
            } },
            { name: 'get_api_improvements', description: 'Get improvement metrics for an API', inputSchema: {
              type: 'object', properties: {
                apiUuid: { type: 'string', description: 'The API UUID from x-api-id' }
              }, required: ['apiUuid']
            } },
            { name: 'compare_api_versions', description: 'Compare two API versions', inputSchema: {
              type: 'object', properties: {
                baselineContent: { type: 'string', description: 'Baseline OpenAPI content (base64)' },
                candidateContent: { type: 'string', description: 'Candidate OpenAPI content (base64)' }
              }, required: ['baselineContent', 'candidateContent']
            } },
            { name: 'get_api_analytics', description: 'Get comprehensive analytics for an API', inputSchema: {
              type: 'object', properties: {
                apiUuid: { type: 'string', description: 'The API UUID from x-api-id' }
              }, required: ['apiUuid']
            } }
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
            jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify({ version: '1.3.0', grader: 'smackdab-api-grader' }, null, 2) }] }
          };
          break;
        case 'list_checkpoints':
          response = {
            jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(await pipeline.listCheckpoints(), null, 2) }] }
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
            const templatePath = args.templatePath || process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
            // Provide proper progress callback that gradeContract expects
            const progressCallback = (stage: string, percent: number, note?: string) => {
              // Could optionally send progress events via SSE if needed
              console.log(`[${percent}%] ${stage}: ${note || ''}`);
            };
            const result = await pipeline.gradeInline({ content: yamlContent, templatePath }, { progress: progressCallback });
            response = { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
          } catch (error: any) {
            response = { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } };
          }
          break;
        case 'generate_api_id':
          try {
            const apiId = generateApiId({
              organization: args.organization,
              domain: args.domain,
              type: args.type
            });
            const instructions = getApiIdInstructions(apiId);
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ apiId, instructions }, null, 2)
                }]
              }
            };
          } catch (error: any) {
            response = { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } };
          }
          break;
          
        case 'validate_api_id':
          try {
            const yamlContent = Buffer.from(args.content, 'base64').toString('utf-8');
            const { js: spec } = await loadSpec(yamlContent);
            const validation = checkApiId(spec);
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify(validation, null, 2)
                }]
              }
            };
          } catch (error: any) {
            response = { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } };
          }
          break;
          
        case 'get_api_history':
          try {
            const db = new GraderDB();
            await db.connect();
            const history = await (db as any).db!.all(
              `SELECT * FROM run WHERE api_id = ? ORDER BY graded_at DESC LIMIT 20`,
              args.apiUuid
            );
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ apiUuid: args.apiUuid, history }, null, 2)
                }]
              }
            };
          } catch (error: any) {
            response = { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } };
          }
          break;
          
        case 'get_api_improvements':
          try {
            // Placeholder - would need to implement database queries
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    apiUuid: args.apiUuid,
                    message: 'Improvement tracking requires database implementation'
                  }, null, 2)
                }]
              }
            };
          } catch (error: any) {
            response = { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } };
          }
          break;
          
        case 'compare_api_versions':
          try {
            const baselineYaml = Buffer.from(args.baselineContent, 'base64').toString('utf-8');
            const candidateYaml = Buffer.from(args.candidateContent, 'base64').toString('utf-8');
            
            // Parse specs
            const { js: baselineSpec } = await loadSpec(baselineYaml);
            const { js: candidateSpec } = await loadSpec(candidateYaml);
            
            // Calculate metrics
            const baselineMetrics = await calculateMetrics(baselineSpec);
            const candidateMetrics = await calculateMetrics(candidateSpec);
            
            // Compare versions
            const comparison = await compareApiVersions(
              baselineSpec,
              candidateSpec,
              baselineMetrics,
              candidateMetrics
            );
            
            const summary = generateComparisonSummary(comparison);
            
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ comparison, summary }, null, 2)
                }]
              }
            };
          } catch (error: any) {
            response = { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } };
          }
          break;
          
        case 'get_api_analytics':
          try {
            // Placeholder for comprehensive analytics
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    apiUuid: args.apiUuid,
                    message: 'Comprehensive analytics requires full database implementation'
                  }, null, 2)
                }]
              }
            };
          } catch (error: any) {
            response = { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } };
          }
          break;
          
        default:
          response = { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Unknown tool: ${toolName}` } };
      }
      break;
    default:
      response = { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } };
  }
  return response;
}

// Start server
app.listen(PORT, () => {
  console.log(`Simple SSE MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});