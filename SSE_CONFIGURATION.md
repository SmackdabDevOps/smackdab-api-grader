# SSE Configuration for Qodo and VS Code

The SmackDab API Grader now supports both connection methods:
1. **NPM Bridge** - For Claude Desktop (stdio-based)
2. **Direct SSE** - For Qodo, VS Code, and other SSE-compatible MCP clients

## SSE Endpoint Configuration

### For Qodo Users

Add the following to your Qodo MCP configuration:

```json
{
  "mcpServers": {
    "smackdab-api-grader": {
      "url": "https://smackdab-api-grader.onrender.com/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### For VS Code Users

If using an MCP extension that supports SSE, configure it with:

```json
{
  "mcp.servers": {
    "smackdab-api-grader": {
      "transport": "sse",
      "url": "https://smackdab-api-grader.onrender.com/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### For Local Development

When running locally, use:
```json
{
  "url": "http://localhost:3000/sse",
  "headers": {
    "Authorization": "Bearer sk_prod_001"
  }
}
```

## Available Tools via SSE

All tools are available through the SSE endpoint:
- `grade_contract` - Grade an API contract
- `list_checkpoints` - List grading checkpoints
- `generate_api_id` - Generate unique API ID
- `validate_api_id` - Validate API ID in spec
- `get_api_history` - Get grading history
- `get_api_improvements` - Calculate improvements
- `compare_api_versions` - Compare two versions
- `get_api_analytics` - Get detailed analytics
- `generate_checkpoint_report` - Generate detailed report

## Authentication

The SSE endpoint requires authentication via the `Authorization` header:
```
Authorization: Bearer YOUR_API_KEY
```

For testing, you can use the default key: `sk_prod_001`

## Protocol

The SSE endpoint implements the full MCP protocol (version 2025-03-26) over Server-Sent Events. It supports:
- JSON-RPC 2.0 messages
- Tool discovery via `tools/list`
- Tool execution via `tools/call`
- Proper session management

## Comparison: NPM Bridge vs Direct SSE

| Feature | NPM Bridge (Claude Desktop) | Direct SSE (Qodo/VS Code) |
|---------|--------------------------|------------------------|
| Installation | `npm install -g smackdab-api-grader-mcp` | No installation needed |
| Configuration | Add to Claude Desktop config | Add URL to MCP config |
| Updates | Manual npm updates | Automatic (server-side) |
| Network | Local stdio bridge | Direct HTTPS connection |
| Performance | Additional hop | Direct connection |

## Testing the SSE Endpoint

Test with curl:
```bash
curl -X POST https://smackdab-api-grader.onrender.com/sse \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' \
  -N
```

## Troubleshooting

1. **401 Unauthorized**: Check your API key in the Authorization header
2. **404 Not Found**: Ensure you're using `/sse` endpoint (not `/api/sse`)
3. **Connection timeout**: The SSE connection stays open for streaming - this is normal
4. **No response**: Some proxies buffer SSE responses - check X-Accel-Buffering header

## Migration from NPM to SSE

If you're currently using the NPM package with Claude Desktop, you can continue using it. However, if you're using Qodo or VS Code with SSE support, you can migrate to direct SSE:

1. Remove the NPM package configuration
2. Add the SSE URL configuration as shown above
3. Use the same API key for authentication

Both methods will continue to be supported.