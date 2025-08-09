# Railway Deployment Guide

## 🚀 Quick Start

### Prerequisites
- Railway account (created at railway.app)
- Railway CLI installed (`brew install railway`)
- This repository cloned locally

### Step 1: Login to Railway
```bash
railway login
```
This will open your browser for authentication.

### Step 2: Initialize Railway Project
```bash
# From the project directory
cd /Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter

# Initialize new Railway project
railway init

# Follow prompts to create new project
```

### Step 3: Add PostgreSQL Database
```bash
# Add PostgreSQL to your project
railway add

# Select "PostgreSQL" from the list
```

### Step 4: Link and Deploy
```bash
# Link to your Railway project
railway link

# Deploy the application
railway up
```

### Step 5: Set Environment Variables
Go to your Railway dashboard and set these variables:

```env
NODE_ENV=production
ALLOWED_ORIGINS=*
RATE_LIMIT=100
API_KEYS={}
TEMPLATE_PATH=/app/templates/MASTER_API_TEMPLATE_v3.yaml
```

### Step 6: Run Database Migration
```bash
# Run migration on Railway
railway run npm run migrate
```

### Step 7: Generate API Keys
```bash
# Generate API key for your team
railway run npm run generate-key
```

## 📋 Architecture Overview

### Local vs Hosted Separation
```
Local MCP Server (UNCHANGED):
- Command: npm run dev
- File: src/mcp/server.ts
- Transport: stdio
- Database: SQLite
- Auth: None
- Use: Claude Code locally

Hosted SSE Server (NEW):
- Command: npm start
- File: src/mcp/server-sse.ts
- Transport: SSE/HTTP
- Database: PostgreSQL
- Auth: API Keys
- Use: Team access via web
```

### Available Commands
```bash
npm run dev          # Run LOCAL stdio server (unchanged)
npm run dev:sse      # Run SSE server locally for testing
npm start            # Production SSE server
npm run migrate      # Setup PostgreSQL database
npm run generate-key # Create API keys for teams
```

## 🔑 Team Configuration

### For Team Members
Once deployed, team members configure their MCP clients:

**Claude Code / Qodo Configuration:**
```json
{
  "mcpServers": {
    "smackdab-api-grader": {
      "url": "https://your-app.railway.app/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer sk_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### Managing API Keys
1. Generate key: `railway run npm run generate-key`
2. Store securely and distribute to team
3. Update API_KEYS environment variable in Railway

## 🔍 Monitoring

### Check Health
```bash
curl https://your-app.railway.app/health
```

### View Logs
```bash
railway logs
```

### Database Access
```bash
railway connect postgres
```

## 📊 Usage Tracking

The hosted version tracks:
- API calls per team
- Tool usage statistics
- Rate limit enforcement

Query usage:
```sql
SELECT tool_name, COUNT(*) 
FROM usage_tracking 
WHERE team_id = 'your-team'
GROUP BY tool_name;
```

## 🚨 Troubleshooting

### SSE Connection Issues
- Check API key is valid
- Verify CORS settings match client domain
- Check rate limits haven't been exceeded

### Database Connection
- Ensure DATABASE_URL is set by Railway
- Run migrations: `railway run npm run migrate`

### Template File Missing
- Verify template exists: `ls templates/`
- Check TEMPLATE_PATH environment variable

## 🔄 Updates and Maintenance

### Deploy Updates
```bash
git add .
git commit -m "Update"
railway up
```

### Rollback
```bash
# View deployments
railway deployments

# Rollback to previous
railway rollback
```

### Scale Up
In Railway dashboard:
- Adjust instance size
- Add replicas for high availability
- Configure autoscaling

## 💰 Costs

Estimated monthly costs:
- **Hobby**: $5-10/month (1GB RAM, shared CPU)
- **Pro**: $20-50/month (2GB RAM, dedicated CPU)
- **Scale**: $100+/month (multiple instances)

PostgreSQL adds ~$10-20/month depending on size.

## 🔐 Security Notes

1. **API Keys**: Never commit real API keys
2. **Environment Variables**: Use Railway's secret management
3. **CORS**: Configure ALLOWED_ORIGINS for your domains
4. **Rate Limiting**: Adjust RATE_LIMIT based on usage
5. **Database**: Railway provides SSL connections by default

## 📝 Local Development

To test the SSE server locally:

```bash
# Create .env file
cp .env.example .env
# Edit .env with local PostgreSQL

# Run PostgreSQL locally (via Docker)
docker run -d \
  -e POSTGRES_DB=api_grader \
  -e POSTGRES_USER=grader \
  -e POSTGRES_PASSWORD=localpass \
  -p 5432:5432 \
  postgres:15

# Run migrations
npm run migrate

# Start SSE server locally
npm run dev:sse

# Test with curl
curl -H "Authorization: Bearer sk_dev_123" \
  http://localhost:3000/health
```

## ✅ Deployment Checklist

- [ ] Railway CLI installed
- [ ] Logged in to Railway
- [ ] Project initialized
- [ ] PostgreSQL added
- [ ] Environment variables set
- [ ] Database migrated
- [ ] API keys generated
- [ ] Health check passing
- [ ] Team members configured
- [ ] Monitoring setup

## 🆘 Support

- Railway Docs: https://docs.railway.app
- MCP Protocol: https://modelcontextprotocol.io
- Issues: Create issue in your repository