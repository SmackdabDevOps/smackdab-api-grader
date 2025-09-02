/**
 * REST API Server for Render Deployment with SSE Support
 * 
 * This server provides:
 * 1. Standard REST API endpoints for the NPM bridge (Claude Desktop)
 * 2. SSE endpoint for direct MCP connections (Qodo, VS Code)
 */

import express from 'express';
import cors from 'cors';
import * as pipeline from '../app/pipeline.js';
import { generateApiId, validateApiIdFormat, getApiIdInstructions } from '../mcp/tools/api-id-generator.js';
import { GraderDB } from '../mcp/persistence/db.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-MCP-Client'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));

// Simple auth middleware
function checkAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Allow health and version endpoints without auth
  if (req.path === '/health' || req.path === '/api/version') {
    return next();
  }
  
  const auth = req.headers.authorization;
  
  // Check for API keys from environment (can be JSON string or single key)
  let validKeys: Set<string> = new Set();
  
  if (process.env.API_KEYS) {
    // Parse JSON object of keys
    try {
      const keys = JSON.parse(process.env.API_KEYS);
      Object.keys(keys).forEach(k => validKeys.add(k));
    } catch {
      // If not JSON, treat as single key
      validKeys.add(process.env.API_KEYS);
    }
  } else if (process.env.API_KEY) {
    // Single API key
    validKeys.add(process.env.API_KEY);
  } else {
    // Default key for testing
    validKeys.add('sk_prod_001');
  }
  
  const providedKey = auth?.replace('Bearer ', '');
  if (!providedKey || !validKeys.has(providedKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: '2.0.0',
    type: 'rest-api-with-sse',
    timestamp: new Date().toISOString()
  });
});

// SSE endpoint for direct MCP connections (Qodo, VS Code, etc.)
// This endpoint must be registered BEFORE the auth middleware
app.post('/sse', async (req, res) => {
  // Check auth for SSE endpoint
  // For now, accept the default test key for SSE endpoint testing
  const auth = req.headers.authorization;
  const providedKey = auth?.replace('Bearer ', '');
  
  // Accept sk_prod_001 for testing or any configured API key
  const validKeys = new Set<string>(['sk_prod_001']);
  
  if (process.env.API_KEY) {
    validKeys.add(process.env.API_KEY);
  }
  if (process.env.API_KEYS) {
    try {
      const keys = JSON.parse(process.env.API_KEYS);
      Object.keys(keys).forEach(k => validKeys.add(k));
    } catch {
      validKeys.add(process.env.API_KEYS);
    }
  }
  
  if (!providedKey || !validKeys.has(providedKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log('SSE connection request received');
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  // Create MCP server instance for this connection
  const mcpServer = new McpServer({
    name: 'smackdab-api-grader',
    version: '2.0.0'
  });
  
  // Register all tools
  mcpServer.registerTool(
    'grade_contract',
    {
      description: 'Grade an API contract against SmackDab standards',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'OpenAPI specification YAML/JSON content or URL' },
          isUrl: { type: 'boolean', description: 'Whether content is a URL' },
          templatePath: { type: 'string', description: 'Optional path to grading template' }
        },
        required: ['content']
      }
    },
    async (params: any) => {
      let yamlContent: string;
      if (params.isUrl) {
        const response = await fetch(params.content);
        yamlContent = await response.text();
      } else {
        yamlContent = params.content;
      }
      
      const template = params.templatePath || process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
      const result = await pipeline.gradeInline(
        { content: yamlContent, templatePath: template },
        { progress: (stage, percent, note) => console.log(`[${percent}%] ${stage}: ${note || ''}`) }
      );
      
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
  
  mcpServer.registerTool(
    'list_checkpoints',
    {
      description: 'List all available grading checkpoints',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    async () => {
      const checkpoints = await pipeline.listCheckpoints();
      return { content: [{ type: 'text', text: JSON.stringify(checkpoints, null, 2) }] };
    }
  );
  
  mcpServer.registerTool(
    'generate_api_id',
    {
      description: 'Generate a unique API ID for tracking',
      inputSchema: {
        type: 'object',
        properties: {
          organization: { type: 'string', description: 'Organization name' },
          domain: { type: 'string', description: 'API domain' },
          type: { type: 'string', description: 'API type' }
        },
        required: ['organization', 'domain', 'type']
      }
    },
    async (params: any) => {
      const apiId = generateApiId(params);
      const instructions = getApiIdInstructions(apiId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ apiId, instructions }, null, 2)
        }]
      };
    }
  );
  
  mcpServer.registerTool(
    'validate_api_id',
    {
      description: 'Validate API ID in OpenAPI spec',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'OpenAPI specification content' }
        },
        required: ['content']
      }
    },
    async (params: any) => {
      const { parseDocument } = await import('yaml');
      const doc = parseDocument(params.content);
      const spec = doc.toJS();
      
      const apiId = spec?.info?.['x-api-id'];
      const isValid = apiId && validateApiIdFormat(apiId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            hasApiId: !!apiId,
            apiId: apiId || null,
            isValid,
            message: isValid ? 'Valid x-api-id found' : 'Missing or invalid x-api-id'
          }, null, 2)
        }]
      };
    }
  );
  
  mcpServer.registerTool(
    'get_api_history',
    {
      description: 'Get grading history for an API',
      inputSchema: {
        type: 'object',
        properties: {
          apiUuid: { type: 'string', description: 'API UUID to get history for' }
        },
        required: ['apiUuid']
      }
    },
    async (params: any) => {
      const db = new GraderDB();
      const history = await db.getApiHistory(params.apiUuid);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            apiId: params.apiUuid,
            totalGrades: history.length,
            history: history.map((h: any) => ({
              timestamp: h.timestamp,
              score: h.totalScore,
              grade: h.finalGrade,
              version: h.apiVersion
            }))
          }, null, 2)
        }]
      };
    }
  );
  
  mcpServer.registerTool(
    'get_api_improvements',
    {
      description: 'Calculate improvements over time',
      inputSchema: {
        type: 'object',
        properties: {
          apiUuid: { type: 'string', description: 'API UUID' }
        },
        required: ['apiUuid']
      }
    },
    async (params: any) => {
      const db = new GraderDB();
      const history = await db.getApiHistory(params.apiUuid);
      
      if (history.length < 2) {
        return {
          content: [{
            type: 'text',
            text: 'Not enough history to calculate improvements (need at least 2 grades)'
          }]
        };
      }
      
      const latest = history[history.length - 1];
      const baseline = history[0];
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            apiId: params.apiUuid,
            improvements: {
              scoreChange: latest.totalScore - baseline.totalScore,
              gradeChange: `${baseline.finalGrade} -> ${latest.finalGrade}`,
              improvementRate: ((latest.totalScore - baseline.totalScore) / baseline.totalScore * 100).toFixed(2) + '%',
              gradesAnalyzed: history.length
            },
            summary: `API improved from ${baseline.finalGrade} (${baseline.totalScore}) to ${latest.finalGrade} (${latest.totalScore})`
          }, null, 2)
        }]
      };
    }
  );
  
  mcpServer.registerTool(
    'compare_api_versions',
    {
      description: 'Compare two API versions',
      inputSchema: {
        type: 'object',
        properties: {
          baselineContent: { type: 'string', description: 'Baseline API spec' },
          candidateContent: { type: 'string', description: 'Candidate API spec' }
        },
        required: ['baselineContent', 'candidateContent']
      }
    },
    async (params: any) => {
      const templatePath = process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
      const progressCallback = (stage: string, percent: number) => {
        console.log(`[${percent}%] ${stage}`);
      };
      
      const [baselineGrade, candidateGrade] = await Promise.all([
        pipeline.gradeInline({ content: params.baselineContent, templatePath }, { progress: progressCallback }),
        pipeline.gradeInline({ content: params.candidateContent, templatePath }, { progress: progressCallback })
      ]);
      
      const comparison = {
        baseline: {
          score: baselineGrade.totalScore,
          grade: baselineGrade.finalGrade,
          passed: baselineGrade.checkpointsPassed,
          failed: baselineGrade.checkpointsFailed
        },
        candidate: {
          score: candidateGrade.totalScore,
          grade: candidateGrade.finalGrade,
          passed: candidateGrade.checkpointsPassed,
          failed: candidateGrade.checkpointsFailed
        },
        improvement: {
          score: candidateGrade.totalScore - baselineGrade.totalScore,
          grade: `${baselineGrade.finalGrade} -> ${candidateGrade.finalGrade}`,
          passedDelta: candidateGrade.checkpointsPassed - baselineGrade.checkpointsPassed
        }
      };
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            comparison,
            summary: `Version comparison: ${comparison.improvement.grade} (${comparison.improvement.score > 0 ? '+' : ''}${comparison.improvement.score} points)`
          }, null, 2)
        }]
      };
    }
  );
  
  mcpServer.registerTool(
    'get_api_analytics',
    {
      description: 'Get detailed analytics for an API',
      inputSchema: {
        type: 'object',
        properties: {
          apiUuid: { type: 'string', description: 'API UUID' }
        },
        required: ['apiUuid']
      }
    },
    async (params: any) => {
      const db = new GraderDB();
      const history = await db.getApiHistory(params.apiUuid);
      
      if (history.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No grading history found for this API'
          }]
        };
      }
      
      const scores = history.map((h: any) => h.totalScore);
      const grades = history.map((h: any) => h.finalGrade);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            apiId: params.apiUuid,
            metrics: {
              averageScore: (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2),
              maxScore: Math.max(...scores),
              minScore: Math.min(...scores),
              currentScore: scores[scores.length - 1],
              totalGrades: history.length,
              uniqueGrades: [...new Set(grades)],
              trend: scores[scores.length - 1] > scores[0] ? 'improving' : 
                     scores[scores.length - 1] < scores[0] ? 'declining' : 'stable'
            },
            timeline: {
              firstGraded: history[0].timestamp,
              lastGraded: history[history.length - 1].timestamp,
              grades: history.map((h: any) => ({
                date: h.timestamp,
                score: h.totalScore,
                grade: h.finalGrade
              }))
            }
          }, null, 2)
        }]
      };
    }
  );
  
  mcpServer.registerTool(
    'generate_checkpoint_report',
    {
      description: 'Generate a detailed report of checkpoint results',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'OpenAPI specification content' }
        },
        required: ['content']
      }
    },
    async (params: any) => {
      const templatePath = process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
      const result = await pipeline.gradeInline(
        { content: params.content, templatePath },
        { progress: (stage, percent, note) => console.log(`[${percent}%] ${stage}: ${note || ''}`) }
      );
      
      const report = {
        summary: {
          totalScore: result.totalScore,
          finalGrade: result.finalGrade,
          checkpointsPassed: result.checkpointsPassed,
          checkpointsFailed: result.checkpointsFailed,
          percentPassed: result.percentPassed
        },
        details: result.detailedResults
      };
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(report, null, 2)
        }]
      };
    }
  );
  
  // Register lint_mermaid tool
  mcpServer.registerTool(
    'lint_mermaid',
    {
      description: 'Lint a Mermaid diagram using @mermaid-js/parser and report syntax issues.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Mermaid code (base64) or URL' },
          isUrl: { type: 'boolean', description: 'Whether content is a URL' },
          diagramType: { type: 'string', description: 'Diagram type (e.g., flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt, journey, mindmap, pie, gitGraph, requirementDiagram, c4, quadrantChart, timeline, sankey, xychart)' }
        },
        required: ['content']
      }
    },
    async (params: any) => {
      try {
        let code: string;
        if (params.isUrl) {
          const response = await fetch(params.content);
          code = await response.text();
        } else {
          // Expect base64-encoded content
          code = Buffer.from(params.content, 'base64').toString('utf-8');
        }

        function inferDiagramType(src: string): string | undefined {
          const head = src.trim().split(/\r?\n/)[0]?.trim() ?? '';
          const s = head.toLowerCase();
          if (/^(flowchart|graph)\b/.test(s)) return 'flowchart';
          if (/^sequence\s*diagram|^sequencediagram/.test(s)) return 'sequenceDiagram';
          if (/^class\s*diagram|^classdiagram/.test(s)) return 'classDiagram';
          if (/^state\s*diagram|^statediagram/.test(s)) return 'stateDiagram';
          if (/^er\s*diagram|^erdiagram/.test(s)) return 'erDiagram';
          if (/^gantt\b/.test(s)) return 'gantt';
          if (/^journey\b/.test(s)) return 'journey';
          if (/^mindmap\b/.test(s)) return 'mindmap';
          if (/^pie\b/.test(s)) return 'pie';
          if (/^gitgraph\b/.test(s)) return 'gitGraph';
          if (/^requirement\s*diagram|^requirementdiagram/.test(s)) return 'requirementDiagram';
          if (/^c4\b/.test(s)) return 'c4';
          if (/^quadrant\s*chart|^quadrantchart/.test(s)) return 'quadrantChart';
          if (/^timeline\b/.test(s)) return 'timeline';
          if (/^sankey\b/.test(s)) return 'sankey';
          if (/^xychart\b/.test(s)) return 'xychart';
          return undefined;
        }

        const usedType = params.diagramType || inferDiagramType(code);
        if (!usedType) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: false,
                errors: [{ message: 'Unable to infer diagram type. Provide diagramType explicitly.' }]
              }, null, 2)
            }],
            isError: true
          };
        }

        const parser = await import('@mermaid-js/parser');
        const parseFn: any = (parser as any).parse || (parser as any).default?.parse;
        if (typeof parseFn !== 'function') {
          throw new Error('Parser parse function not found on @mermaid-js/parser');
        }

        try {
          const ast = parseFn(usedType, code);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ ok: true, diagramType: usedType, errors: [], astSummary: ast ? { hasAst: true } : { hasAst: false } }, null, 2)
            }]
          };
        } catch (err: any) {
          const msg = err?.message || String(err);
          const lineColMatch = msg.match(/line\s+(\d+),\s*column\s+(\d+)/i) || msg.match(/Ln\s*(\d+),\s*Col\s*(\d+)/i);
          const offsetMatch = msg.match(/offset\s*(\d+)/i);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: false,
                diagramType: usedType,
                errors: [{
                  message: msg,
                  line: lineColMatch ? Number(lineColMatch[1]) : undefined,
                  column: lineColMatch ? Number(lineColMatch[2]) : undefined,
                  offset: offsetMatch ? Number(offsetMatch[1]) : undefined
                }]
              }, null, 2)
            }],
            isError: true
          };
        }
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error linting diagram: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Create SSE transport
  const transport = new SSEServerTransport('/sse', res);
  
  // Connect MCP server to transport
  await mcpServer.connect(transport);
  
  console.log('SSE MCP connection established');
  
  // Handle connection close
  req.on('close', () => {
    console.log('SSE connection closed');
    mcpServer.close();
  });
});

// Apply auth to all routes AFTER SSE endpoint
app.use(checkAuth);

// API Version
app.post('/api/version', async (req, res) => {
  res.json({
    version: '2.0.0',
    grader: 'smackdab-api-grader',
    type: 'rest-api-with-sse',
    capabilities: [
      'grade_contract',
      'generate_api_id',
      'validate_api_id',
      'get_api_history',
      'get_api_improvements',
      'compare_api_versions',
      'get_api_analytics'
    ]
  });
});

// List Checkpoints
app.post('/api/checkpoints', async (req, res) => {
  try {
    const checkpoints = await pipeline.listCheckpoints();
    res.json(checkpoints);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Grade Contract
app.post('/api/grade', async (req, res) => {
  try {
    const { content, isUrl, templatePath } = req.body;
    
    let yamlContent: string;
    if (isUrl) {
      const response = await fetch(content);
      yamlContent = await response.text();
    } else {
      yamlContent = content;
    }
    
    const template = templatePath || process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
    
    const progressCallback = (stage: string, percent: number, note?: string) => {
      console.log(`[${percent}%] ${stage}: ${note || ''}`);
    };
    
    const result = await pipeline.gradeInline(
      { content: yamlContent, templatePath: template },
      { progress: progressCallback }
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('Grade error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate API ID
app.post('/api/generate-id', async (req, res) => {
  try {
    const { organization, domain, type } = req.body;
    const apiId = generateApiId({ organization, domain, type });
    const instructions = getApiIdInstructions(apiId);
    
    res.json({
      apiId,
      instructions,
      format: 'UUID v4',
      usage: 'Add as x-api-id in your OpenAPI info section'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Validate API ID
app.post('/api/validate-id', async (req, res) => {
  try {
    const { content } = req.body;
    const { parseDocument } = await import('yaml');
    const doc = parseDocument(content);
    const spec = doc.toJS();
    
    const apiId = spec?.info?.['x-api-id'];
    const isValid = apiId && validateApiIdFormat(apiId);
    
    res.json({
      hasApiId: !!apiId,
      apiId: apiId || null,
      isValid,
      message: isValid ? 'Valid x-api-id found' : 'Missing or invalid x-api-id'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get API History
app.post('/api/history', async (req, res) => {
  try {
    const { apiUuid } = req.body;
    const db = new GraderDB();
    const history = await db.getApiHistory(apiUuid);
    
    res.json({
      apiId: apiUuid,
      totalGrades: history.length,
      history: history.map((h: any) => ({
        timestamp: h.timestamp,
        score: h.totalScore,
        grade: h.finalGrade,
        version: h.apiVersion
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get API Improvements
app.post('/api/improvements', async (req, res) => {
  try {
    const { apiUuid } = req.body;
    const db = new GraderDB();
    const history = await db.getApiHistory(apiUuid);
    
    if (history.length < 2) {
      return res.json({
        message: 'Not enough history to calculate improvements (need at least 2 grades)'
      });
    }
    
    const latest = history[history.length - 1];
    const baseline = history[0];
    
    res.json({
      apiId: apiUuid,
      improvements: {
        scoreChange: latest.totalScore - baseline.totalScore,
        gradeChange: `${baseline.finalGrade} -> ${latest.finalGrade}`,
        improvementRate: ((latest.totalScore - baseline.totalScore) / baseline.totalScore * 100).toFixed(2) + '%',
        gradesAnalyzed: history.length
      },
      summary: `API improved from ${baseline.finalGrade} (${baseline.totalScore}) to ${latest.finalGrade} (${latest.totalScore})`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Compare API Versions
app.post('/api/compare', async (req, res) => {
  try {
    const { baselineContent, candidateContent } = req.body;
    
    const templatePath = process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
    const progressCallback = (stage: string, percent: number) => {
      console.log(`[${percent}%] ${stage}`);
    };
    
    // Grade both versions
    const [baselineGrade, candidateGrade] = await Promise.all([
      pipeline.gradeInline({ content: baselineContent, templatePath }, { progress: progressCallback }),
      pipeline.gradeInline({ content: candidateContent, templatePath }, { progress: progressCallback })
    ]);
    
    const comparison = {
      baseline: {
        score: baselineGrade.totalScore,
        grade: baselineGrade.finalGrade,
        passed: baselineGrade.checkpointsPassed,
        failed: baselineGrade.checkpointsFailed
      },
      candidate: {
        score: candidateGrade.totalScore,
        grade: candidateGrade.finalGrade,
        passed: candidateGrade.checkpointsPassed,
        failed: candidateGrade.checkpointsFailed
      },
      improvement: {
        score: candidateGrade.totalScore - baselineGrade.totalScore,
        grade: `${baselineGrade.finalGrade} -> ${candidateGrade.finalGrade}`,
        passedDelta: candidateGrade.checkpointsPassed - baselineGrade.checkpointsPassed
      }
    };
    
    res.json({
      comparison,
      summary: `Version comparison: ${comparison.improvement.grade} (${comparison.improvement.score > 0 ? '+' : ''}${comparison.improvement.score} points)`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get API Analytics
app.post('/api/analytics', async (req, res) => {
  try {
    const { apiUuid } = req.body;
    const db = new GraderDB();
    const history = await db.getApiHistory(apiUuid);
    
    if (history.length === 0) {
      return res.json({
        message: 'No grading history found for this API'
      });
    }
    
    const scores = history.map((h: any) => h.totalScore);
    const grades = history.map((h: any) => h.finalGrade);
    
    res.json({
      apiId: apiUuid,
      metrics: {
        averageScore: (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2),
        maxScore: Math.max(...scores),
        minScore: Math.min(...scores),
        currentScore: scores[scores.length - 1],
        totalGrades: history.length,
        uniqueGrades: [...new Set(grades)],
        trend: scores[scores.length - 1] > scores[0] ? 'improving' : 
               scores[scores.length - 1] < scores[0] ? 'declining' : 'stable'
      },
      timeline: {
        firstGraded: history[0].timestamp,
        lastGraded: history[history.length - 1].timestamp,
        grades: history.map((h: any) => ({
          date: h.timestamp,
          score: h.totalScore,
          grade: h.finalGrade
        }))
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} does not exist`,
    availableEndpoints: [
      'GET /health',
      'POST /sse (MCP SSE endpoint for Qodo/VS Code)',
      'POST /api/version',
      'POST /api/checkpoints',
      'POST /api/grade',
      'POST /api/generate-id',
      'POST /api/validate-id',
      'POST /api/history',
      'POST /api/improvements',
      'POST /api/compare',
      'POST /api/analytics'
    ]
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`REST API Server with SSE running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API base: http://localhost:${PORT}/api`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log('Ready to accept requests from:');
  console.log('  - MCP NPM clients (via REST API)');
  console.log('  - Qodo/VS Code (via SSE endpoint)');
});