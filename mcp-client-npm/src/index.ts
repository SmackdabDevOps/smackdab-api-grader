/**
 * Smackdab API Grader MCP Client
 * 
 * This local MCP server bridges between Claude Desktop (stdio) 
 * and the remote API grader service hosted on Render.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import fetch from 'node-fetch';

// Configuration from environment or defaults
const API_BASE_URL = process.env.API_GRADER_URL || 'https://smackdab-api-grader.onrender.com';
const API_KEY = process.env.API_GRADER_KEY || '';
const DEBUG = process.env.DEBUG === 'true';

// Log function that respects debug mode
function log(...args: any[]) {
  if (DEBUG) {
    console.error('[API-Grader-MCP]', ...args);
  }
}

// Helper to call remote API
async function callRemoteAPI(endpoint: string, data: any): Promise<any> {
  const url = `${API_BASE_URL}/api/${endpoint}`;
  log(`Calling remote API: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': API_KEY ? `Bearer ${API_KEY}` : '',
        'X-MCP-Client': 'true'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error (${response.status}): ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    log('API call failed:', error);
    throw error;
  }
}

// Create and configure the MCP server
export async function createServer() {
  const server = new McpServer({
    name: 'smackdab-api-grader',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {},
      logging: {}
    }
  });

  // Tool: Get Version
  server.registerTool(
    'version',
    {
      title: 'Get Version',
      description: 'Get API grader version and connection information',
      inputSchema: {}
    },
    async (): Promise<CallToolResult> => {
      try {
        const localVersion = '1.0.0';
        const remoteInfo = await callRemoteAPI('version', {});
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              client: {
                version: localVersion,
                transport: 'stdio',
                apiUrl: API_BASE_URL
              },
              server: remoteInfo
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: List Checkpoints
  server.registerTool(
    'list_checkpoints',
    {
      title: 'List Checkpoints',
      description: 'List all available grading checkpoints',
      inputSchema: {}
    },
    async (): Promise<CallToolResult> => {
      try {
        const checkpoints = await callRemoteAPI('checkpoints', {});
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(checkpoints, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Grade Contract
  server.registerTool(
    'grade_contract',
    {
      title: 'Grade API Contract',
      description: 'Grade an OpenAPI specification against best practices',
      inputSchema: {
        content: z.string().describe('OpenAPI specification content (YAML or JSON) or base64 encoded'),
        isBase64: z.boolean().optional().describe('Whether content is base64 encoded'),
        isUrl: z.boolean().optional().describe('Whether content is a URL to fetch'),
        templatePath: z.string().optional().describe('Optional template path for grading')
      }
    },
    async ({ content, isBase64, isUrl, templatePath }): Promise<CallToolResult> => {
      try {
        log('Grading contract...');
        
        // Prepare the content
        let apiContent = content;
        if (isBase64) {
          apiContent = Buffer.from(content, 'base64').toString('utf-8');
        }
        
        const result = await callRemoteAPI('grade', {
          content: apiContent,
          isUrl: isUrl || false,
          templatePath
        });
        
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

  // Tool: Generate API ID
  server.registerTool(
    'generate_api_id',
    {
      title: 'Generate API ID',
      description: 'Generate a unique API identifier (UUID v4) for x-api-id field',
      inputSchema: {
        organization: z.string().optional().describe('Organization name'),
        domain: z.string().optional().describe('Business domain'),
        type: z.string().optional().describe('API type (rest, graphql, etc.)')
      }
    },
    async ({ organization, domain, type }): Promise<CallToolResult> => {
      try {
        const result = await callRemoteAPI('generate-id', {
          organization,
          domain,
          type
        });
        
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
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Validate API ID
  server.registerTool(
    'validate_api_id',
    {
      title: 'Validate API ID',
      description: 'Check if an OpenAPI spec has a valid x-api-id',
      inputSchema: {
        content: z.string().describe('OpenAPI content (YAML/JSON or base64)'),
        isBase64: z.boolean().optional().describe('Whether content is base64 encoded')
      }
    },
    async ({ content, isBase64 }): Promise<CallToolResult> => {
      try {
        let apiContent = content;
        if (isBase64) {
          apiContent = Buffer.from(content, 'base64').toString('utf-8');
        }
        
        const result = await callRemoteAPI('validate-id', {
          content: apiContent
        });
        
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
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Get API History
  server.registerTool(
    'get_api_history',
    {
      title: 'Get API History',
      description: 'Get grading history for an API by its UUID',
      inputSchema: {
        apiUuid: z.string().describe('The API UUID from x-api-id field')
      }
    },
    async ({ apiUuid }): Promise<CallToolResult> => {
      try {
        const result = await callRemoteAPI('history', { apiUuid });
        
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
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Get API Improvements
  server.registerTool(
    'get_api_improvements',
    {
      title: 'Get API Improvements',
      description: 'Analyze improvement trends for an API',
      inputSchema: {
        apiUuid: z.string().describe('The API UUID from x-api-id field')
      }
    },
    async ({ apiUuid }): Promise<CallToolResult> => {
      try {
        const result = await callRemoteAPI('improvements', { apiUuid });
        
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
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Compare API Versions
  server.registerTool(
    'compare_api_versions',
    {
      title: 'Compare API Versions',
      description: 'Compare two versions of an API specification',
      inputSchema: {
        baselineContent: z.string().describe('Baseline API spec (YAML/JSON or base64)'),
        candidateContent: z.string().describe('Candidate API spec (YAML/JSON or base64)'),
        isBase64: z.boolean().optional().describe('Whether contents are base64 encoded')
      }
    },
    async ({ baselineContent, candidateContent, isBase64 }): Promise<CallToolResult> => {
      try {
        let baseline = baselineContent;
        let candidate = candidateContent;
        
        if (isBase64) {
          baseline = Buffer.from(baselineContent, 'base64').toString('utf-8');
          candidate = Buffer.from(candidateContent, 'base64').toString('utf-8');
        }
        
        const result = await callRemoteAPI('compare', {
          baselineContent: baseline,
          candidateContent: candidate
        });
        
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
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool: Get API Analytics
  server.registerTool(
    'get_api_analytics',
    {
      title: 'Get API Analytics',
      description: 'Get comprehensive analytics and metrics for an API',
      inputSchema: {
        apiUuid: z.string().describe('The API UUID from x-api-id field')
      }
    },
    async ({ apiUuid }): Promise<CallToolResult> => {
      try {
        const result = await callRemoteAPI('analytics', { apiUuid });
        
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
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  return server;
}

// Main function for direct execution
export async function main() {
  log('Starting Smackdab API Grader MCP Client...');
  log(`Connecting to API: ${API_BASE_URL}`);
  
  try {
    const server = await createServer();
    const transport = new StdioServerTransport();
    
    await server.connect(transport);
    log('MCP server connected via stdio');
    
    // Keep the process running
    process.on('SIGINT', () => {
      log('Shutting down...');
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}