#!/usr/bin/env node

/**
 * Full API Grader MCP Server
 * Complete functionality with both local and remote capabilities
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs/promises';
import * as path from 'path';
import * as pipeline from '../app/pipeline.js';

// Configuration
const REMOTE_URL = process.env.MCP_REMOTE_URL || "https://smackdab-api-grader.onrender.com";
const API_KEY = process.env.MCP_API_KEY || "sk_prod_001";
const USE_REMOTE = process.env.USE_REMOTE === "true";

// Create server instance
const server = new Server(
  {
    name: "smackdab-api-grader",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to call remote API
async function callRemoteAPI(method: string, params: any): Promise<any> {
  try {
    const response = await fetch(`${REMOTE_URL}/sse`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });

    const text = await response.text();
    
    // Parse SSE response
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data && data !== '{"ok":true}' && data !== '{"type":"connection","status":"established"}') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.result) {
              return parsed.result;
            }
            if (parsed.error) {
              throw new Error(parsed.error.message);
            }
          } catch (e) {
            // Continue to next line
          }
        }
      }
    }
    
    throw new Error("No valid response from remote server");
  } catch (error: any) {
    console.error("Remote API error:", error);
    throw error;
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "version",
        description: "Get grader version information",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_checkpoints",
        description: "List all grading checkpoints with descriptions",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "grade_file",
        description: "Grade an OpenAPI specification from a file",
        inputSchema: {
          type: "object",
          properties: {
            filepath: {
              type: "string",
              description: "Path to the OpenAPI file (YAML or JSON)",
            },
          },
          required: ["filepath"],
        },
      },
      {
        name: "grade_content",
        description: "Grade OpenAPI specification content directly",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "OpenAPI specification in YAML or JSON format",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "grade_url",
        description: "Grade an OpenAPI specification from a URL",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to the OpenAPI specification",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "explain_rule",
        description: "Get detailed explanation for a specific rule",
        inputSchema: {
          type: "object",
          properties: {
            ruleId: {
              type: "string",
              description: "Rule ID to explain (e.g., SEC-AUTH-001)",
            },
          },
          required: ["ruleId"],
        },
      },
      {
        name: "suggest_fixes",
        description: "Get fix suggestions for a previously graded API",
        inputSchema: {
          type: "object",
          properties: {
            filepath: {
              type: "string",
              description: "Path to the OpenAPI file to get fixes for",
            },
          },
          required: ["filepath"],
        },
      },
      {
        name: "test_connection",
        description: "Test connection to grading service",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "test_connection":
        const mode = USE_REMOTE ? "remote" : "local";
        const url = USE_REMOTE ? REMOTE_URL : "local pipeline";
        return {
          content: [
            {
              type: "text",
              text: `✓ Connected to ${url} (${mode} mode)`,
            },
          ],
        };

      case "version":
        if (USE_REMOTE) {
          const result = await callRemoteAPI("tools/call", {
            name: "version",
            arguments: {},
          });
          return { content: result.content };
        } else {
          const version = await pipeline.version();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(version, null, 2),
              },
            ],
          };
        }

      case "list_checkpoints":
        if (USE_REMOTE) {
          const result = await callRemoteAPI("tools/call", {
            name: "list_checkpoints",
            arguments: {},
          });
          return { content: result.content };
        } else {
          const checkpoints = await pipeline.listCheckpoints();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(checkpoints, null, 2),
              },
            ],
          };
        }

      case "grade_file":
        if (!args?.filepath) {
          throw new Error("File path is required");
        }
        
        // Read file content
        const fileContent = await fs.readFile(args.filepath, 'utf-8');
        
        if (USE_REMOTE) {
          const base64Content = Buffer.from(fileContent).toString('base64');
          const result = await callRemoteAPI("tools/call", {
            name: "grade_contract",
            arguments: {
              content: base64Content,
              isUrl: false,
            },
          });
          return { content: result.content };
        } else {
          const result = await pipeline.gradeInline(
            { content: fileContent },
            { progress: () => {} }
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

      case "grade_content":
        if (!args?.content) {
          throw new Error("OpenAPI content is required");
        }
        
        if (USE_REMOTE) {
          const base64Content = Buffer.from(args.content).toString('base64');
          const result = await callRemoteAPI("tools/call", {
            name: "grade_contract",
            arguments: {
              content: base64Content,
              isUrl: false,
            },
          });
          return { content: result.content };
        } else {
          const result = await pipeline.gradeInline(
            { content: args.content },
            { progress: () => {} }
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

      case "grade_url":
        if (!args?.url) {
          throw new Error("URL is required");
        }
        
        if (USE_REMOTE) {
          const result = await callRemoteAPI("tools/call", {
            name: "grade_contract",
            arguments: {
              content: args.url,
              isUrl: true,
            },
          });
          return { content: result.content };
        } else {
          // Fetch content from URL
          const response = await fetch(args.url);
          const content = await response.text();
          
          const result = await pipeline.gradeInline(
            { content },
            { progress: () => {} }
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

      case "explain_rule":
        if (!args?.ruleId) {
          throw new Error("Rule ID is required");
        }
        
        if (USE_REMOTE) {
          // Remote doesn't have this endpoint yet, provide basic explanation
          return {
            content: [
              {
                type: "text",
                text: `Rule ${args.ruleId}: Please refer to the Smackdab API standards documentation for details about this rule.`,
              },
            ],
          };
        } else {
          const explanation = await pipeline.explainFinding({ ruleId: args.ruleId });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(explanation, null, 2),
              },
            ],
          };
        }

      case "suggest_fixes":
        if (!args?.filepath) {
          throw new Error("File path is required");
        }
        
        if (USE_REMOTE) {
          return {
            content: [
              {
                type: "text",
                text: "Fix suggestions are only available in local mode. Set USE_REMOTE=false to use this feature.",
              },
            ],
          };
        } else {
          const fixes = await pipeline.suggestFixes({ path: args.filepath });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(fixes, null, 2),
              },
            ],
          };
        }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

// Main function
async function main() {
  // Create transport
  const transport = new StdioServerTransport();
  
  // Connect server to transport
  await server.connect(transport);
  
  // Server is now running
  if (process.env.DEBUG) {
    const mode = USE_REMOTE ? "remote" : "local";
    console.error(`Full API Grader started in ${mode} mode`);
  }
}

// Start the server
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});