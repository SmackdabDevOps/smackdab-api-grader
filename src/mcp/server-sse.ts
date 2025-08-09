import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import * as pipeline from '../app/pipeline.js';
import { GraderDB } from './persistence/db-postgres.js';
import { authenticateRequest } from './auth.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', version: '1.2.0' });
});

// SSE endpoint for MCP
app.post('/sse', authenticateRequest, async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  
  // Create MCP server instance for this connection
  const mcpServer = new McpServer({
    name: 'smackdab-api-grader',
    version: '1.2.0',
    description: 'Grades OpenAPI specifications against Smackdab standards'
  });

  // Helper for progress notifications
  function progress(stage: string, pct: number, note?: string) {
    console.error(`[${req.user?.teamId}] Progress: ${stage} - ${pct}% ${note || ''}`);
  }

  // Register tools with user context
  mcpServer.registerTool('version', {
    description: 'Get grader version information',
    inputSchema: {}
  }, async () => {
    const version = await pipeline.version();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(version, null, 2)
      }]
    };
  });

  mcpServer.registerTool('list_checkpoints', {
    description: 'List all grading checkpoints',
    inputSchema: {}
  }, async () => {
    const checkpoints = await pipeline.listCheckpoints();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(checkpoints, null, 2)
      }]
    };
  });

  mcpServer.registerTool('grade_contract', {
    description: 'Grade an OpenAPI specification - provide content as base64 or URL',
    inputSchema: {
      content: z.string().describe('OpenAPI content (base64 encoded) or URL'),
      isUrl: z.boolean().optional().describe('Whether content is a URL'),
      templatePath: z.string().optional().describe('Optional template path or use default')
    }
  }, async ({ content, isUrl, templatePath }) => {
    try {
      // Convert content to local temp file for processing
      let spec: string;
      if (isUrl) {
        // Fetch from URL
        const response = await fetch(content);
        spec = await response.text();
      } else {
        // Decode base64
        spec = Buffer.from(content, 'base64').toString('utf-8');
      }
      
      // Use gradeInline since we have content
      const result = await pipeline.gradeInline({ 
        content: spec, 
        templatePath: templatePath || process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml' 
      }, { progress });
      
      // Track usage
      await trackUsage(req.user?.teamId, 'grade_contract');
      
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
          text: `Error grading contract: ${error.message}`
        }],
        isError: true
      };
    }
  });

  mcpServer.registerTool('grade_inline', {
    description: 'Grade inline OpenAPI YAML content',
    inputSchema: {
      content: z.string().describe('OpenAPI YAML content'),
      templatePath: z.string().optional().describe('Optional template path')
    }
  }, async ({ content, templatePath }) => {
    try {
      const result = await pipeline.gradeInline({ 
        content, 
        templatePath: templatePath || process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml' 
      }, { progress });
      
      // Track usage
      await trackUsage(req.user?.teamId, 'grade_inline');
      
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
          text: `Error grading inline content: ${error.message}`
        }],
        isError: true
      };
    }
  });

  mcpServer.registerTool('grade_and_record', {
    description: 'Grade an API and record results to database',
    inputSchema: {
      content: z.string().describe('OpenAPI content (base64 encoded) or URL'),
      isUrl: z.boolean().optional().describe('Whether content is a URL'),
      templatePath: z.string().optional().describe('Optional template path')
    }
  }, async ({ content, isUrl, templatePath }) => {
    try {
      // Convert content to spec
      let spec: string;
      if (isUrl) {
        const response = await fetch(content);
        spec = await response.text();
      } else {
        spec = Buffer.from(content, 'base64').toString('utf-8');
      }
      
      // Grade and record with team context
      const result = await pipeline.gradeAndRecord({ 
        content: spec,
        teamId: req.user?.teamId,
        userId: req.user?.userId,
        templatePath: templatePath || process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml' 
      }, { progress });
      
      // Track usage
      await trackUsage(req.user?.teamId, 'grade_and_record');
      
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
          text: `Error grading and recording: ${error.message}`
        }],
        isError: true
      };
    }
  });

  mcpServer.registerTool('explain_finding', {
    description: 'Get detailed explanation for a specific rule violation',
    inputSchema: {
      ruleId: z.string().describe('Rule ID to explain')
    }
  }, async ({ ruleId }) => {
    try {
      const explanation = await pipeline.explainFinding({ ruleId });
      await trackUsage(req.user?.teamId, 'explain_finding');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(explanation, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error explaining finding: ${error.message}`
        }],
        isError: true
      };
    }
  });

  mcpServer.registerTool('suggest_fixes', {
    description: 'Suggest fixes for API violations',
    inputSchema: {
      content: z.string().describe('OpenAPI content (base64 encoded)'),
      templatePath: z.string().optional().describe('Optional template path')
    }
  }, async ({ content, templatePath }) => {
    try {
      // Decode content
      const spec = Buffer.from(content, 'base64').toString('utf-8');
      
      // Create temp file for processing
      const tempPath = `/tmp/spec-${Date.now()}.yaml`;
      await require('fs').promises.writeFile(tempPath, spec);
      
      const fixes = await pipeline.suggestFixes({ 
        path: tempPath,
        templatePath: templatePath || process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml'
      });
      
      // Clean up temp file
      await require('fs').promises.unlink(tempPath);
      
      await trackUsage(req.user?.teamId, 'suggest_fixes');
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(fixes, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error suggesting fixes: ${error.message}`
        }],
        isError: true
      };
    }
  });

  mcpServer.registerTool('get_api_history', {
    description: 'Get grading history for an API',
    inputSchema: {
      apiId: z.string().describe('API identifier'),
      limit: z.number().optional().describe('Maximum number of results'),
      since: z.string().optional().describe('Get results since this date')
    }
  }, async ({ apiId, limit, since }) => {
    try {
      const db = new GraderDB();
      await db.connect();
      const rows = await db.getHistory(apiId, limit ?? 20, since, req.user?.teamId);
      await trackUsage(req.user?.teamId, 'get_api_history');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ apiId, rows }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error getting API history: ${error.message}`
        }],
        isError: true
      };
    }
  });

  // Connect the MCP server to the SSE transport
  await mcpServer.connect(transport);
  
  // Log connection
  console.log(`[${new Date().toISOString()}] Team ${req.user?.teamId} connected from ${req.ip}`);
});

// Usage tracking function
async function trackUsage(teamId: string | undefined, tool: string) {
  if (!teamId) return;
  
  try {
    const db = new GraderDB();
    await db.connect();
    await db.trackUsage(teamId, tool);
  } catch (error) {
    console.error('Failed to track usage:', error);
  }
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Smackdab API Grader SSE server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});