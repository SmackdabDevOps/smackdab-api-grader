import express from 'express';
import cors from 'cors';
import * as pipeline from '../app/pipeline.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Session support for GET-based SSE clients (e.g., some MCP transports)
const sessions = new Map<string, { res: express.Response, keepAlive: NodeJS.Timeout }>();
const sessionsByAuth = new Map<string, { id: string, res: express.Response }>();
function genId() { return Math.random().toString(36).slice(2, 10); }

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

// GET-based SSE session: client opens stream, then POSTs messages to /sse/message?session={id}
app.get('/sse', async (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const id = genId();
  const token = req.headers.authorization || '';
  const keepAlive = setInterval(() => {
    // comment line to keep connection alive
    res.write(': keep-alive\n\n');
  }, 15000);
  sessions.set(id, { res, keepAlive });
  if (token) sessionsByAuth.set(token, { id, res });
  res.on('close', () => {
    clearInterval(keepAlive);
    sessions.delete(id);
    const m = sessionsByAuth.get(token);
    if (m && m.id === id) sessionsByAuth.delete(token);
  });
  // Announce connection and endpoint for POST messages
  res.write('event: connection\n');
  res.write('data: {"type":"connection","status":"established"}\n\n');
  res.write('event: endpoint\n');
  res.write(`data: ${JSON.stringify({ sessionId: id, postUrl: '/sse/message' })}\n\n`);
});

// POST messages to an existing GET-based session
app.post('/sse/message', express.text({ type: '*/*' }), async (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  const id = String((req.query.session || '')).trim();
  const session = sessions.get(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  try {
    const message = JSON.parse(req.body || '{}');
    const out = await handleMcpMessage(message);
    session.res.write(`data: ${JSON.stringify(out)}\n\n`);
    return res.json({ ok: true });
  } catch (e:any) {
    session.res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: String(e.message||e) } })}\n\n`);
    return res.status(400).json({ error: 'Bad request' });
  }
});

// SSE endpoint - simplified direct implementation
app.post('/sse', express.text({ type: '*/*' }), async (req, res) => {
  // Check auth
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  const token = req.headers.authorization || '';
  const live = token ? sessionsByAuth.get(token) : undefined;
  if (live) {
    // Route response to the open GET stream associated with this token
    try {
      const message = JSON.parse(req.body || '{}');
      const out = await handleMcpMessage(message);
      live.res.write(`data: ${JSON.stringify(out)}\n\n`);
      return res.json({ ok: true });
    } catch (e:any) {
      live.res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: String(e.message||e) } })}\n\n`);
      return res.status(400).json({ error: 'Bad request' });
    }
  }
  // Fallback: one-shot POST responding via SSE in the POST response
  console.log('SSE one-shot POST received (no live session)');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('data: {"type":"connection","status":"established"}\n\n');
  try {
    const message = JSON.parse(req.body || '{}');
    const out = await handleMcpMessage(message);
    res.write(`data: ${JSON.stringify(out)}\n\n`);
  } catch (error: any) {
    const errorResponse = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: error.message } };
    res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
  }
  res.write('event: done\n');
  res.write('data: {"ok":true}\n\n');
  res.end();
});

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
            const result = await pipeline.gradeInline({ content: yamlContent, templatePath }, { progress: () => {} });
            response = { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
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