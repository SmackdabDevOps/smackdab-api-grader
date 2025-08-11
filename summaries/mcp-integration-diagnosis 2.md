# MCP Integration Diagnosis Summary

## Current Status
The MCP server works correctly via stdio protocol but may fail with Qodo/Claude Desktop due to configuration or logging issues.

## Test Results

### ✅ Working
1. **MCP Server Protocol**: Correctly implements MCP protocol via stdio
2. **Tool Registration**: All 8 tools properly registered and respond correctly
3. **JSON-RPC Messages**: Proper request/response format
4. **Error Handling**: Returns structured errors in tool responses

### ⚠️ Potential Issues

#### 1. Logging to stderr
- **Problem**: Server uses `console.error()` for progress and startup messages
- **Location**: `src/mcp/server.ts` lines 17, 209
- **Impact**: Some MCP clients may interpret stderr output as errors
- **Solution**: Remove or redirect logging

#### 2. Configuration Path Issues
- **Qodo Config**: Uses relative command `npm run dev`
- **Claude Desktop**: Needs absolute paths to node and tsx
- **Solution**: Use absolute paths in configurations

#### 3. Package.json Type Module
- **Issue**: ESM module type may cause compatibility issues
- **Impact**: Some tools expect CommonJS
- **Solution**: May need wrapper script or different entry point

## Recommended Fixes

### Fix 1: Clean Up Server Logging
```typescript
// Replace console.error with proper logging
function progress(stage: string, pct: number, note?: string) {
  // Remove or use debug flag
  if (process.env.DEBUG) {
    console.error(`Progress: ${stage} - ${pct}% ${note || ''}`);
  }
}
```

### Fix 2: Update Qodo Configuration
```json
{
  "mcpServers": {
    "smackdab-api-grader": {
      "command": "/usr/local/bin/node",
      "args": [
        "--no-warnings",
        "/Users/brooksswift/Desktop/api-grader-mcp-starter/node_modules/.bin/tsx",
        "src/mcp/server.ts"
      ],
      "cwd": "/Users/brooksswift/Desktop/api-grader-mcp-starter",
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### Fix 3: Create Wrapper Script
Create a CommonJS wrapper that doesn't output to stderr:
```javascript
// mcp-wrapper.cjs
const { spawn } = require('child_process');
const path = require('path');

const server = spawn('tsx', ['src/mcp/server.ts'], {
  cwd: __dirname,
  stdio: ['inherit', 'inherit', 'pipe'] // Suppress stderr
});

server.stderr.on('data', (data) => {
  // Only log actual errors, not startup messages
  const msg = data.toString();
  if (!msg.includes('running') && !msg.includes('Progress')) {
    console.error(msg);
  }
});
```

### Fix 4: Claude Desktop Configuration
For Claude Desktop, add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "smackdab-api-grader": {
      "command": "node",
      "args": [
        "/Users/brooksswift/Desktop/api-grader-mcp-starter/mcp-wrapper.cjs"
      ]
    }
  }
}
```

## Testing Steps

1. **Test with cleaned server**:
   ```bash
   # Remove console.error statements
   # Run: node scripts/test-mcp-stdio.js
   ```

2. **Test with Qodo**:
   - Update qodo-mcp-config.json with absolute paths
   - Restart Qodo
   - Check MCP server appears in tools

3. **Test with Claude Desktop**:
   - Copy configuration to Claude Desktop config location
   - Restart Claude Desktop
   - Check MCP tools availability

## Next Steps

1. Remove or conditionally enable stderr logging
2. Create wrapper script for better compatibility
3. Test with both Qodo and Claude Desktop
4. Document working configuration for both clients