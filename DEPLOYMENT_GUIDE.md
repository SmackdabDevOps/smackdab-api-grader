# API Grader MCP - Complete Deployment Guide

## Architecture Overview

This system uses a **split architecture** to work with Claude Desktop:

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│ Claude Desktop  │ <stdio> │  MCP Client      │ <HTTP>  │  REST API       │
│                 │ ────────>│  (npm package)   │ ────────>│  (on Render)    │
└─────────────────┘         └──────────────────┘         └─────────────────┘
   User's Computer            User's Computer               Your Server
```

## Why This Architecture?

- **Claude Desktop limitation**: Only supports stdio (local processes), not HTTP
- **Solution**: Local MCP client acts as a bridge to your remote API
- **Benefits**: 
  - Your API can be hosted anywhere (Render, AWS, etc.)
  - Easy distribution via NPM
  - Secure API key management
  - Works exactly like other MCP providers (GitHub, Slack, etc.)

## Part 1: Deploy REST API to Render

### 1.1 Prepare for Deployment

The REST API server is in `src/api/rest-server.ts`. This is what gets deployed to Render.

### 1.2 Update Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build || true

# Start REST API server (not MCP)
CMD ["npm", "start"]
```

### 1.3 Environment Variables on Render

Set these in your Render dashboard:

```
PORT=3000
API_KEY=your-secret-api-key
DATABASE_URL=your-database-url
TEMPLATE_PATH=/app/templates/MASTER_API_TEMPLATE_v3.yaml
USE_SQLITE=false  # Use PostgreSQL on Render
```

### 1.4 Deploy to Render

```bash
git add .
git commit -m "Add REST API server for MCP client architecture"
git push origin main
```

Your API will be available at: `https://your-app.onrender.com`

### 1.5 Test the Deployment

```bash
# Test health endpoint
curl https://your-app.onrender.com/health

# Test with API key
curl -X POST https://your-app.onrender.com/api/version \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json"
```

## Part 2: Publish NPM Package

### 2.1 Prepare NPM Package

```bash
cd mcp-client-npm

# Install dependencies
npm install

# Build the package
npm run build

# Test locally
npm link
api-grader-mcp --test
```

### 2.2 Update Package Configuration

Edit `mcp-client-npm/package.json`:

```json
{
  "name": "@yourorg/api-grader-mcp",
  "version": "1.0.0",
  "publishConfig": {
    "access": "public"
  }
}
```

### 2.3 Publish to NPM

```bash
# Login to NPM
npm login

# Publish the package
npm publish --access public
```

Your package is now available at: `https://www.npmjs.com/package/@yourorg/api-grader-mcp`

## Part 3: User Installation

### For End Users

Users only need to do this:

#### 3.1 Quick Test

```bash
# Test without installation
npx @yourorg/api-grader-mcp --test
```

#### 3.2 Configure Claude Desktop

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "api-grader": {
      "command": "npx",
      "args": ["@yourorg/api-grader-mcp"],
      "env": {
        "API_GRADER_KEY": "user-api-key-here",
        "API_GRADER_URL": "https://your-app.onrender.com"
      }
    }
  }
}
```

#### 3.3 Restart Claude Desktop

The tools will now be available in Claude!

## Part 4: API Key Management

### Option 1: Single Shared Key (Simple)

Everyone uses the same key:

```javascript
// In rest-server.ts
const API_KEY = process.env.API_KEY || 'sk_prod_shared';
```

### Option 2: Individual API Keys (Recommended)

Implement proper API key management:

```javascript
// In rest-server.ts
const validKeys = new Set([
  process.env.MASTER_KEY,
  // Load from database
]);

function checkAuth(req, res, next) {
  const key = req.headers.authorization?.replace('Bearer ', '');
  if (!validKeys.has(key)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}
```

### Option 3: OAuth (Advanced)

For enterprise deployments, implement OAuth flow.

## Part 5: Monitoring & Maintenance

### 5.1 Monitor Render Logs

```bash
# View logs in Render dashboard
# Or use Render CLI
render logs --tail
```

### 5.2 Update NPM Package

When you update the client:

```bash
cd mcp-client-npm
npm version patch  # or minor/major
npm publish
```

Users automatically get updates with `npx`.

### 5.3 Update REST API

Just push to your repo:

```bash
git push origin main
```

Render auto-deploys the changes.

## Common Issues & Solutions

### Issue: Claude Desktop doesn't see tools

**Solution**: Check the MCP client can connect:
```bash
npx @yourorg/api-grader-mcp --test
```

### Issue: Authentication errors

**Solution**: Verify API key in Claude config matches server.

### Issue: Render server sleeping

**Solution**: Upgrade to paid Render plan or implement keep-alive.

## Architecture Benefits

✅ **Works with Claude Desktop** - Uses stdio as required  
✅ **Scalable** - REST API can handle many users  
✅ **Secure** - API keys never exposed to Claude  
✅ **Easy Updates** - Users always get latest via npx  
✅ **Standard Pattern** - Same as GitHub, Slack MCP providers  

## Next Steps

1. **Customize branding** - Update package name and documentation
2. **Add authentication** - Implement user management
3. **Add analytics** - Track usage and errors
4. **Create website** - Landing page with docs and API key signup
5. **Monetization** - Subscription tiers with rate limits

## Summary

You now have:

1. **REST API on Render** (`src/api/rest-server.ts`) - Your backend
2. **NPM Package** (`mcp-client-npm/`) - The MCP bridge
3. **Working MCP Integration** - Claude Desktop compatible

This is the production-ready architecture used by all successful MCP providers!