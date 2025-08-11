#!/usr/bin/env node
/**
 * API Grader MCP Server - Built with MCP SDK
 * 
 * This server provides API grading capabilities through MCP tools.
 * Supports both stdio (for Claude Desktop) and Streamable HTTP (for remote access).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import * as pipeline from '../app/pipeline.js';
import { generateApiId, validateApiIdFormat, getApiIdInstructions } from './tools/api-id-generator.js';
import { checkApiId } from '../scoring/prerequisites.js';
import { calculateMetrics } from '../app/tracking/metrics-calculator.js';
import { calculateImprovements, generateImprovementSummary } from '../app/tracking/improvement-analyzer.js';
import { compareApiVersions, generateComparisonSummary } from '../app/tracking/version-comparator.js';
import { GraderDB } from './persistence/db.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Determine transport mode from environment or command line
const USE_STDIO = process.argv.includes('--stdio') || process.env.MCP_TRANSPORT === 'stdio';
const PORT = process.env.PORT || 3000;

// Create the MCP server instance
const mcpServer = new McpServer({
  name: 'smackdab-api-grader',
  version: '2.0.0'
}, {
  capabilities: {
    tools: {},
    logging: {}
  }
});

// Helper to decode base64 content
async function decodeContent(content: string, isUrl: boolean = false): Promise<string> {
  if (isUrl) {
    const response = await fetch(content);
    return await response.text();
  }
  return Buffer.from(content, 'base64').toString('utf-8');
}

// Register Tool: Get Version
mcpServer.registerTool(
  'version',
  {
    title: 'Get Version',
    description: 'Get grader version information',
    inputSchema: {}
  },
  async (): Promise<CallToolResult> => {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          version: '2.0.0',
          grader: 'smackdab-api-grader',
          protocol: '2025-03-26',
          transport: USE_STDIO ? 'stdio' : 'streamable-http'
        }, null, 2)
      }]
    };
  }
);

// Register Tool: List Checkpoints
mcpServer.registerTool(
  'list_checkpoints',
  {
    title: 'List Checkpoints',
    description: 'List all grading checkpoints',
    inputSchema: z.object({})
  },
  async (): Promise<CallToolResult> => {
    const checkpoints = await pipeline.listCheckpoints();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(checkpoints, null, 2)
      }]
    };
  }
);

// Register Tool: Grade Contract
mcpServer.registerTool(
  'grade_contract',
  {
    title: 'Grade API Contract',
    description: 'Grade an OpenAPI specification',
    inputSchema: z.object({
      content: z.string().describe('OpenAPI content (base64 encoded) or URL'),
      isUrl: z.boolean().optional().describe('Whether content is a URL'),
      templatePath: z.string().optional().describe('Optional template path')
    })
  },
  async ({ content, isUrl, templatePath }): Promise<CallToolResult> => {
    try {
      const yamlContent = await decodeContent(content, isUrl);
      const template = templatePath || process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
      
      // Progress callback for grading
      const progressCallback = (stage: string, percent: number, note?: string) => {
        console.log(`[${percent}%] ${stage}: ${note || ''}`);
      };
      
      const result = await pipeline.gradeInline(
        { content: yamlContent, templatePath: template },
        { progress: progressCallback }
      );
      
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
  }
);

// Register Tool: Generate API ID
mcpServer.registerTool(
  'generate_api_id',
  {
    title: 'Generate API ID',
    description: 'Generate a unique API identifier',
    inputSchema: z.object({
      organization: z.string().optional().describe('Organization name'),
      domain: z.string().optional().describe('Business domain'),
      type: z.string().optional().describe('API type')
    })
  },
  async ({ organization, domain, type }): Promise<CallToolResult> => {
    const apiId = generateApiId({ organization, domain, type });
    const instructions = getApiIdInstructions(apiId);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          apiId,
          instructions,
          format: 'UUID v4',
          usage: 'Add as x-api-id in your OpenAPI info section'
        }, null, 2)
      }]
    };
  }
);

// Register Tool: Validate API ID
mcpServer.registerTool(
  'validate_api_id',
  {
    title: 'Validate API ID',
    description: 'Validate an API has x-api-id',
    inputSchema: z.object({
      content: z.string().describe('OpenAPI content (base64 encoded)')
    })
  },
  async ({ content }): Promise<CallToolResult> => {
    try {
      const yamlContent = await decodeContent(content);
      const { parseDocument } = await import('yaml');
      const doc = parseDocument(yamlContent);
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
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error validating API ID: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register Tool: Get API History
mcpServer.registerTool(
  'get_api_history',
  {
    title: 'Get API History',
    description: 'Get grading history for an API',
    inputSchema: z.object({
      apiUuid: z.string().describe('The API UUID from x-api-id')
    })
  },
  async ({ apiUuid }): Promise<CallToolResult> => {
    try {
      const db = new GraderDB();
      const history = await db.getApiHistory(apiUuid);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            apiId: apiUuid,
            totalGrades: history.length,
            history: history.map(h => ({
              timestamp: h.timestamp,
              score: h.totalScore,
              grade: h.finalGrade,
              version: h.apiVersion
            }))
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error fetching history: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register Tool: Get API Improvements
mcpServer.registerTool(
  'get_api_improvements',
  {
    title: 'Get API Improvements',
    description: 'Get improvement metrics for an API',
    inputSchema: z.object({
      apiUuid: z.string().describe('The API UUID from x-api-id')
    })
  },
  async ({ apiUuid }): Promise<CallToolResult> => {
    try {
      const db = new GraderDB();
      const history = await db.getApiHistory(apiUuid);
      
      if (history.length < 2) {
        return {
          content: [{
            type: 'text',
            text: 'Not enough history to calculate improvements (need at least 2 grades)'
          }]
        };
      }
      
      const improvements = calculateImprovements(history);
      const summary = generateImprovementSummary(improvements);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            apiId: apiUuid,
            improvements,
            summary
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error calculating improvements: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register Tool: Compare API Versions
mcpServer.registerTool(
  'compare_api_versions',
  {
    title: 'Compare API Versions',
    description: 'Compare two API versions',
    inputSchema: z.object({
      baselineContent: z.string().describe('Baseline OpenAPI content (base64)'),
      candidateContent: z.string().describe('Candidate OpenAPI content (base64)')
    })
  },
  async ({ baselineContent, candidateContent }): Promise<CallToolResult> => {
    try {
      const baselineYaml = await decodeContent(baselineContent);
      const candidateYaml = await decodeContent(candidateContent);
      
      const templatePath = process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
      const progressCallback = (stage: string, percent: number) => {
        console.log(`[${percent}%] ${stage}`);
      };
      
      // Grade both versions
      const [baselineGrade, candidateGrade] = await Promise.all([
        pipeline.gradeInline({ content: baselineYaml, templatePath }, { progress: progressCallback }),
        pipeline.gradeInline({ content: candidateYaml, templatePath }, { progress: progressCallback })
      ]);
      
      const comparison = compareApiVersions(baselineGrade, candidateGrade);
      const summary = generateComparisonSummary(comparison);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            comparison,
            summary
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error comparing versions: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register Tool: Get API Analytics
mcpServer.registerTool(
  'get_api_analytics',
  {
    title: 'Get API Analytics',
    description: 'Get comprehensive analytics for an API',
    inputSchema: z.object({
      apiUuid: z.string().describe('The API UUID from x-api-id')
    })
  },
  async ({ apiUuid }): Promise<CallToolResult> => {
    try {
      const db = new GraderDB();
      const history = await db.getApiHistory(apiUuid);
      
      if (history.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No grading history found for this API'
          }]
        };
      }
      
      const metrics = calculateMetrics(history);
      const improvements = history.length >= 2 ? calculateImprovements(history) : null;
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            apiId: apiUuid,
            metrics,
            improvements,
            totalGrades: history.length,
            firstGraded: history[0].timestamp,
            lastGraded: history[history.length - 1].timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error fetching analytics: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Main function to start the server
async function main() {
  if (USE_STDIO) {
    // STDIO Transport for Claude Desktop
    console.error('Starting MCP server in STDIO mode...');
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error('MCP server connected via STDIO');
  } else {
    // Streamable HTTP Transport for remote access
    console.log('Starting MCP server in Streamable HTTP mode...');
    
    const app = express();
    app.use(express.json());
    app.use(cors({
      origin: '*',
      exposedHeaders: ['Mcp-Session-Id'],
      allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization']
    }));
    
    // Health check
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        version: '2.0.0',
        transport: 'streamable-http',
        protocol: '2025-03-26'
      });
    });
    
    // Map to store transports by session ID
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
    
    // Handle MCP requests
    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;
      
      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && req.body?.method === 'initialize') {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            transports[newSessionId] = transport;
          }
        });
        
        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };
        
        // Connect the transport to our MCP server
        await mcpServer.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided'
          },
          id: null
        });
        return;
      }
      
      // Handle the request
      await transport.handleRequest(req, res, req.body);
    });
    
    // Handle SSE for notifications
    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    });
    
    // Handle session termination
    app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    });
    
    app.listen(PORT, () => {
      console.log(`MCP Streamable HTTP server listening on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    });
  }
}

// Start the server
main().catch(error => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});