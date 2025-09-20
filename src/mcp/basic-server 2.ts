#!/usr/bin/env node

/**
 * Basic MCP Server - Following official Anthropic examples
 * Minimal implementation that should work with Claude Desktop and Qodo
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// Create server instance
const server = new Server(
  {
    name: "basic-api-grader",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "test",
        description: "Test that the server is working",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "echo",
        description: "Echo back a message",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Message to echo back",
            },
          },
          required: ["message"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "test":
      return {
        content: [
          {
            type: "text",
            text: "✓ Basic MCP server is working!",
          },
        ],
      };

    case "echo":
      return {
        content: [
          {
            type: "text",
            text: `Echo: ${args?.message || "no message"}`,
          },
        ],
      };

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

// Main function
async function main() {
  // Create transport
  const transport = new StdioServerTransport();
  
  // Connect server to transport
  await server.connect(transport);
  
  // Server is now running
  // DO NOT write to stdout - only stderr for debugging
  if (process.env.DEBUG) {
    console.error("Basic MCP server started");
  }
}

// Start the server
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});