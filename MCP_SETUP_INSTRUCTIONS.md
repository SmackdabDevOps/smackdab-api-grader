# MCP Setup Instructions - Smackdab API Grader

## Quick Setup for Claude Desktop

1. **Copy this configuration** to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "smackdab-grader": {
      "command": "npx",
      "args": [
        "tsx",
        "/Users/brooksswift/Desktop/api-grader-mcp-starter/src/mcp/full-grader.ts"
      ],
      "env": {
        "USE_REMOTE": "true"
      }
    }
  }
}
```

2. **Update the path** to match your local repository location
3. **Restart Claude Desktop**

## Quick Setup for Qodo

1. **Use the configuration** in `qodo-mcp-config-final.json`
2. **Import** into Qodo's MCP settings
3. **Restart Qodo**

## Available MCP Servers

### Production Server (Recommended)
- **File**: `src/mcp/full-grader.ts`
- **Name**: `smackdab-grader`
- **Features**: All grading tools with remote/local modes

### Development Servers
- **Basic Test**: `src/mcp/basic-server.ts` - Minimal test server
- **Remote Test**: `src/mcp/remote-grader.ts` - Remote connection testing

## Available Tools

The `smackdab-grader` provides these tools:

- `version` - Get grader version information
- `list_checkpoints` - List all grading rules
- `grade_file` - Grade a local OpenAPI file
- `grade_content` - Grade pasted OpenAPI content  
- `grade_url` - Grade OpenAPI from a URL
- `explain_rule` - Get detailed rule explanations
- `suggest_fixes` - Get improvement suggestions
- `test_connection` - Test connection status

## Configuration Options

### Remote Mode (Default)
```json
"env": {
  "USE_REMOTE": "true",
  "MCP_REMOTE_URL": "https://smackdab-api-grader.onrender.com",
  "MCP_API_KEY": "sk_prod_001"
}
```

### Local Mode
```json
"env": {
  "USE_REMOTE": "false"
}
```

## For Team Distribution

Your team members need:

1. **Clone the repository**
   ```bash
   git clone [repository-url]
   cd api-grader-mcp-starter
   npm install
   ```

2. **Copy the configuration** from `qodo-mcp-config-final.json` or the Claude Desktop config above

3. **Update paths** to match their local setup

4. **Restart** their MCP client (Claude Desktop or Qodo)

## Testing

In Claude Desktop or Qodo, test with:
- "What MCP tools are available?"
- "Use the smackdab grader to get version"
- "Grade this OpenAPI spec: [paste content]"

## Troubleshooting

If you see validation errors on startup:
1. Click OK to dismiss - the server still works
2. Check that all paths are absolute and correct
3. Ensure `npx` and `tsx` are installed globally

## Support

- **Render Dashboard**: Monitor the deployment
- **Logs**: Check `~/.claude/logs/` for Claude Desktop logs
- **Test Locally**: Run `npx tsx src/mcp/full-grader.ts` to test directly