# API Grader MCP Server - SDK Implementation

## ✅ Fixed Implementation Using MCP SDK

This is the corrected implementation of the API Grader as a proper MCP server using the official TypeScript SDK.

## What Was Fixed

### Before (Problems)
- ❌ Raw Express HTTP/SSE implementation without MCP SDK
- ❌ Using deprecated protocol version (2024-11-05)
- ❌ Manual JSON-RPC message handling
- ❌ No proper transport abstraction
- ❌ Incompatible with MCP clients

### After (Fixed)
- ✅ Proper MCP SDK usage with `McpServer` class
- ✅ Latest protocol version (2025-03-26)
- ✅ SDK handles all protocol details
- ✅ Support for both stdio AND Streamable HTTP transports
- ✅ Compatible with all MCP clients

## Quick Start

### For Remote Access (HTTP Mode)

```bash
# Install dependencies
npm install

# Start in HTTP mode (default)
npm run dev:http

# Server will be available at http://localhost:3000
```

### For Claude Desktop (stdio Mode)

```bash
# Start in stdio mode
npm run dev:stdio

# Or use the compiled version
npm run build
npm run start:stdio
```

## Configuration for Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "api-grader": {
      "command": "tsx",
      "args": [
        "/path/to/api-grader-mcp-starter/src/mcp/server-sdk.ts",
        "--stdio"
      ],
      "env": {
        "TEMPLATE_PATH": "/path/to/templates/MASTER_API_TEMPLATE_v3.yaml",
        "USE_SQLITE": "true"
      }
    }
  }
}
```

## Available Tools

The server exposes the following MCP tools:

### 1. `version`
Get server version information

### 2. `list_checkpoints`
List all available grading checkpoints

### 3. `grade_contract`
Grade an OpenAPI specification
- Input: `content` (base64 or URL), `isUrl` (boolean), `templatePath` (optional)
- Output: Complete grading report with scores

### 4. `generate_api_id`
Generate a unique API identifier
- Input: `organization`, `domain`, `type` (all optional)
- Output: UUID v4 for x-api-id field

### 5. `validate_api_id`
Check if an API has valid x-api-id
- Input: `content` (base64 encoded OpenAPI)
- Output: Validation result

### 6. `get_api_history`
Get grading history for an API
- Input: `apiUuid`
- Output: Historical grades and scores

### 7. `get_api_improvements`
Calculate improvement metrics
- Input: `apiUuid`
- Output: Improvement analysis

### 8. `compare_api_versions`
Compare two API versions
- Input: `baselineContent`, `candidateContent` (both base64)
- Output: Comparison report

### 9. `get_api_analytics`
Get comprehensive analytics
- Input: `apiUuid`
- Output: Metrics and trends

## Architecture

```
src/mcp/
├── server-sdk.ts          # NEW: Proper MCP SDK implementation
├── server-sse-simple.ts   # OLD: Manual SSE (deprecated)
├── tools/                 # Tool implementations
├── persistence/           # Database layer
└── utils/                 # Utilities
```

## Testing

```bash
# Run the test script
node test_sdk_server.js

# Or use curl
curl http://localhost:3000/health
```

## Deployment

For production deployment to Render or similar:

```bash
# Build the project
npm run build

# Start in production mode
NODE_ENV=production npm start
```

## Key Differences from Old Implementation

1. **SDK Usage**: Now uses `@modelcontextprotocol/sdk` instead of manual implementation
2. **Transport Support**: Supports BOTH stdio (local) and HTTP (remote)
3. **Protocol Version**: Uses latest 2025-03-26 instead of deprecated 2024-11-05
4. **Tool Registration**: Proper `registerTool()` API instead of manual switching
5. **Session Management**: SDK handles sessions automatically
6. **Type Safety**: Full TypeScript with Zod schemas

## Environment Variables

- `PORT`: Server port (default: 3000)
- `MCP_TRANSPORT`: Force transport type ('stdio' or 'http')
- `TEMPLATE_PATH`: Path to grading template
- `USE_SQLITE`: Use SQLite instead of PostgreSQL
- `DATABASE_PATH`: SQLite database path

## Migration from Old Server

If you were using the old SSE implementation:

1. Update your client configuration to point to `server-sdk.ts`
2. Use `--stdio` flag for Claude Desktop
3. No changes needed for tool names or parameters
4. Old database and templates are fully compatible

## Troubleshooting

### Server won't start
- Check if port 3000 is available
- Ensure Node.js >= 20 is installed
- Run `npm install` to get dependencies

### Claude Desktop can't connect
- Must use stdio mode (`--stdio` flag)
- Check file paths in config are absolute
- Restart Claude Desktop after config changes

### HTTP mode issues
- Server returns SSE by default (expected)
- Use proper MCP client or test with included script
- Check CORS if accessing from browser

## Next Steps

- [ ] Add more comprehensive tests
- [ ] Implement authentication for HTTP mode
- [ ] Add WebSocket transport support
- [ ] Create Docker container
- [ ] Add monitoring and metrics

## Support

For issues or questions, check:
- MCP SDK docs: https://github.com/modelcontextprotocol/typescript-sdk
- MCP Specification: https://modelcontextprotocol.io/specification