# Smackdab API Grader MCP Client

Connect Claude Desktop to the Smackdab API Grader service through the Model Context Protocol (MCP).

## Installation

### Quick Start (No Installation)

Run directly with npx:

```bash
npx @smackdab/api-grader-mcp
```

### Global Installation

Install globally for easier access:

```bash
npm install -g @smackdab/api-grader-mcp
```

Then run:

```bash
api-grader-mcp
```

## Configuration for Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "api-grader": {
      "command": "npx",
      "args": ["@smackdab/api-grader-mcp"],
      "env": {
        "API_GRADER_KEY": "your-api-key-here"
      }
    }
  }
}
```

Or if you installed globally:

```json
{
  "mcpServers": {
    "api-grader": {
      "command": "api-grader-mcp",
      "env": {
        "API_GRADER_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Available Tools

Once connected, you can use these tools in Claude Desktop:

### `grade_contract`
Grade an OpenAPI specification against best practices.

Example:
```
"Grade this OpenAPI spec: [paste your spec here]"
```

### `generate_api_id`
Generate a unique API identifier (UUID v4) for the x-api-id field.

Example:
```
"Generate an API ID for my inventory management API"
```

### `validate_api_id`
Check if an OpenAPI spec has a valid x-api-id.

### `list_checkpoints`
List all available grading checkpoints and rules.

### `get_api_history`
Get grading history for an API by its UUID.

### `get_api_improvements`
Analyze improvement trends for an API.

### `compare_api_versions`
Compare two versions of an API specification.

### `get_api_analytics`
Get comprehensive analytics and metrics for an API.

### `version`
Get version and connection information.

## Command Line Options

```bash
api-grader-mcp [options]

Options:
  --api-url <url>    Remote API URL (default: https://smackdab-api-grader.onrender.com)
  --api-key <key>    API key for authentication
  --debug            Enable debug logging
  --test             Test connection to remote API
  --help             Show help message
```

## Environment Variables

- `API_GRADER_URL`: Remote API URL (default: https://smackdab-api-grader.onrender.com)
- `API_GRADER_KEY`: API key for authentication
- `DEBUG`: Enable debug logging (set to 'true')

## Testing Connection

Test that the connection works:

```bash
npx @smackdab/api-grader-mcp --test
```

## Using a Self-Hosted API

If you're running your own instance of the API grader:

```json
{
  "mcpServers": {
    "api-grader": {
      "command": "npx",
      "args": ["@smackdab/api-grader-mcp"],
      "env": {
        "API_GRADER_URL": "https://your-api.com",
        "API_GRADER_KEY": "your-api-key"
      }
    }
  }
}
```

## Troubleshooting

### Claude Desktop doesn't see the tools

1. Make sure you've restarted Claude Desktop after updating the config
2. Check that the command runs without errors: `npx @smackdab/api-grader-mcp`
3. Enable debug mode to see detailed logs:
   ```json
   "env": {
     "DEBUG": "true"
   }
   ```

### Connection errors

1. Test the connection: `npx @smackdab/api-grader-mcp --test`
2. Check your API key is correct
3. Verify the API URL is accessible

### Permission errors on macOS/Linux

If you get permission errors, you may need to make the command executable:

```bash
npm install -g @smackdab/api-grader-mcp
which api-grader-mcp  # Find the installation path
chmod +x /path/to/api-grader-mcp
```

## How It Works

This MCP client acts as a bridge between Claude Desktop (which only supports local stdio connections) and the remote Smackdab API Grader service:

```
Claude Desktop <--stdio--> MCP Client <--HTTP--> API Grader Service
```

The client runs locally on your machine and translates between the MCP protocol that Claude Desktop understands and the REST API that the grader service provides.

## Security

- API keys are never sent to Claude, only to the API grader service
- All communication with the API service is over HTTPS
- The client runs locally on your machine
- No data is stored locally except for debug logs (if enabled)

## Support

- Issues: https://github.com/smackdab/api-grader-mcp/issues
- Documentation: https://github.com/smackdab/api-grader-mcp
- API Grader Service: https://smackdab-api-grader.onrender.com

## License

MIT