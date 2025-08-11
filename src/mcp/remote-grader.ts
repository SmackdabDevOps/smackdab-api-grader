#!/usr/bin/env node

/**
 * Remote API Grader MCP Server
 * Connects to the Render deployment and exposes grading tools
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration
const REMOTE_URL = process.env.MCP_REMOTE_URL || "https://smackdab-api-grader.onrender.com";
const API_KEY = process.env.MCP_API_KEY || "sk_prod_001";

// Create server instance
const server = new Server(
  {
    name: "remote-api-grader",
    version: "1.0.0",
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
        name: "test_connection",
        description: "Test connection to remote grader",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_version",
        description: "Get grader version information",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_checkpoints",
        description: "List all grading checkpoints",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "grade_api",
        description: "Grade an OpenAPI specification",
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
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "test_connection":
        return {
          content: [
            {
              type: "text",
              text: `✓ Connected to ${REMOTE_URL}`,
            },
          ],
        };

      case "get_version":
        const versionResult = await callRemoteAPI("tools/call", {
          name: "version",
          arguments: {},
        });
        return {
          content: versionResult.content || [
            {
              type: "text",
              text: JSON.stringify(versionResult, null, 2),
            },
          ],
        };

      case "list_checkpoints":
        const checkpointsResult = await callRemoteAPI("tools/call", {
          name: "list_checkpoints",
          arguments: {},
        });
        return {
          content: checkpointsResult.content || [
            {
              type: "text",
              text: JSON.stringify(checkpointsResult, null, 2),
            },
          ],
        };

      case "grade_api":
        if (!args?.content) {
          throw new Error("OpenAPI content is required");
        }
        
        // Convert content to base64 for transmission
        const base64Content = Buffer.from(args.content).toString('base64');
        
        const gradeResult = await callRemoteAPI("tools/call", {
          name: "grade_contract",
          arguments: {
            content: base64Content,
            isUrl: false,
          },
        });
        
        return {
          content: gradeResult.content || [
            {
              type: "text",
              text: JSON.stringify(gradeResult, null, 2),
            },
          ],
        };

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
    console.error(`Remote API Grader connected to ${REMOTE_URL}`);
  }
}

// Start the server
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});