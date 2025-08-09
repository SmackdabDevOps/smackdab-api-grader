# MCP Server Setup Guide

## Smackdab API Grader MCP Server

This MCP server provides tools for grading OpenAPI specifications against Smackdab standards.

## Available Tools

1. **version** - Get grader version information
2. **list_checkpoints** - List all grading checkpoints
3. **grade_contract** - Grade an OpenAPI specification file
4. **grade_inline** - Grade inline OpenAPI YAML content
5. **grade_and_record** - Grade an API and record results to database
6. **explain_finding** - Get detailed explanation for a specific rule violation
7. **suggest_fixes** - Suggest fixes for API violations
8. **get_api_history** - Get grading history for an API

## Setup for Claude Code

### Option 1: Using Claude CLI (Recommended)

```bash
# Navigate to the project directory
cd /Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter

# Add the MCP server
claude mcp add smackdab-api-grader npm run dev

# Verify it's connected
claude mcp list
```

### Option 2: Manual Configuration

Create or update `.claude.json` in your home directory or project:

```json
{
  "mcpServers": {
    "smackdab-api-grader": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter"
    }
  }
}
```

## Setup for Qodo

1. Open Qodo Gen in Agentic Mode
2. Navigate to Tools Management
3. Click "Add new MCP"
4. Paste the following configuration:

```json
{
  "mcpServers": {
    "smackdab-api-grader": {
      "command": "node",
      "args": [
        "/Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter/node_modules/.bin/tsx",
        "/Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter/src/mcp/server.ts"
      ],
      "env": {}
    }
  }
}
```

5. Save and test the connection

## Alternative Qodo Configuration (if npm is available)

```json
{
  "mcpServers": {
    "smackdab-api-grader": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter"
    }
  }
}
```

## Testing the Integration

### In Claude Code

Once configured, you can use the tools directly:

```
Use the smackdab-api-grader tool to grade the API at /path/to/openapi.yaml
```

### Using MCP Inspector

```bash
npx @modelcontextprotocol/inspector npm run dev
```

Then navigate to http://localhost:3000 to test the tools.

### Direct Testing

```bash
# Send a test message to the server
echo '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | npm run dev
```

## Troubleshooting

### Server not connecting

1. Ensure Node.js is installed: `node --version`
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Check for errors: `npm run dev`

### Tools not appearing

1. Restart Claude Code/Qodo after configuration
2. Check the server is running: `claude mcp list`
3. Review server logs for errors

### Permission errors

Ensure the script has execute permissions:
```bash
chmod +x node_modules/.bin/tsx
```

## Usage Examples

### Grade an API file

```typescript
// Input
{
  "path": "/Users/brooksswift/Desktop/Smackdab/inventory_system_design/contracts/openapi/v2/archive_original/INV-001-product-core-api-hateoas.yaml",
  "templatePath": "/Users/brooksswift/Desktop/Smackdab/.claude/templates/MASTER_API_TEMPLATE_v3.yaml"
}

// Returns
{
  "grade": {
    "total": 85,
    "letter": "B",
    "compliancePct": 0.85,
    "autoFailTriggered": false,
    "criticalIssues": 2,
    "autoFailReasons": []
  },
  "findings": [...],
  "checkpoints": [...],
  "metadata": {...}
}
```

### Grade inline content

```typescript
// Input
{
  "content": "openapi: 3.0.3\ninfo:\n  title: Sample API\n  version: 1.0.0\n...",
  "templatePath": "/Users/brooksswift/Desktop/Smackdab/.claude/templates/MASTER_API_TEMPLATE_v3.yaml"
}
```

### Get API history

```typescript
// Input
{
  "apiId": "urn:smackdab:api:abc123",
  "limit": 10,
  "since": "2024-01-01"
}
```

## Development

To modify the server:

1. Edit files in `src/mcp/` or `src/app/`
2. The server auto-reloads with tsx watch mode
3. Test changes using the MCP Inspector

## Support

For issues or questions, check:
- MCP Documentation: https://modelcontextprotocol.io
- Claude Code MCP Guide: https://docs.anthropic.com/en/docs/claude-code/mcp
- Qodo MCP Guide: https://docs.qodo.ai/qodo-documentation/qodo-gen/tools-mcps/agentic-tools-mcps