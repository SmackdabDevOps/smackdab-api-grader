# Fully Remote MCP Server Setup

## ⚠️ IMPORTANT: NO LOCAL SERVERS REQUIRED

This application is now **100% hosted** on Render. No local files or servers are needed.

## Production Server

- **URL**: https://smackdab-api-grader.onrender.com
- **Protocol**: MCP over SSE (Server-Sent Events)
- **Auth**: Bearer token `sk_prod_001`

## Available Tools (All Remote)

1. `version` - Get grader version
2. `list_checkpoints` - List grading checkpoints
3. `grade_contract` - Grade OpenAPI specs
4. `generate_api_id` - Generate unique API identifier
5. `validate_api_id` - Validate x-api-id presence
6. `get_api_history` - Get API grading history
7. `get_api_improvements` - Track improvements
8. `compare_api_versions` - Compare versions
9. `get_api_analytics` - Get analytics

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "smackdab-grader": {
      "command": "curl",
      "args": [
        "-N",
        "-H",
        "Authorization: Bearer sk_prod_001",
        "https://smackdab-api-grader.onrender.com/sse"
      ]
    }
  }
}
```

## Direct API Access

### Test Connection
```bash
curl -X POST https://smackdab-api-grader.onrender.com/sse \
  -H "Authorization: Bearer sk_prod_001" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

### Generate API ID
```bash
curl -X POST https://smackdab-api-grader.onrender.com/sse \
  -H "Authorization: Bearer sk_prod_001" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "generate_api_id",
      "arguments": {"organization": "myorg"}
    }
  }'
```

## Archived Local Servers

All local MCP server implementations have been moved to `/archived/local-mcp-servers/`:
- `basic-server.ts` - Deprecated
- `full-grader.ts` - Deprecated  
- `remote-grader.ts` - Deprecated
- `server.ts` - Deprecated

These are no longer needed since everything runs from the hosted server.

## Architecture

```
Any MCP Client (Claude Desktop, Qodo, etc.)
              ↓
      SSE Connection (HTTP)
              ↓
   Render Hosted Server (24/7)
   (smackdab-api-grader.onrender.com)
              ↓
      Grading Pipeline
```

## No Local Dependencies

- ❌ No local Node.js required
- ❌ No local TypeScript files
- ❌ No local npm packages
- ✅ Just the hosted URL and API key

## Important Notes

1. **Breaking Change**: APIs now require `x-api-id` field or they fail prerequisites
2. **Auto-deployment**: Pushing to master branch auto-deploys to Render
3. **Service**: Running on Render PAID tier (not free tier)