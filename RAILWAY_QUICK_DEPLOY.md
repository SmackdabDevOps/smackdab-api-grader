# 🚀 RAILWAY QUICK DEPLOYMENT - FINAL STEPS

## Your Project is Created
- **Project**: smackdab-api-grader
- **URL**: https://railway.com/project/252c1372-fb45-413f-abab-d10fd0695914

## Complete Deployment in 3 Minutes

### Step 1: Open Railway Dashboard
Click here: https://railway.com/project/252c1372-fb45-413f-abab-d10fd0695914

### Step 2: In the Dashboard

1. **If PostgreSQL Not Added Yet:**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Wait for it to provision (30 seconds)

2. **Add Your App Service:**
   - Click "New" → "GitHub Repo" 
   - OR Click "New" → "Empty Service"
   - Name it: `api-grader`

3. **Deploy the Code:**
   - If using Empty Service:
     - Click on the service
     - Go to Settings tab
     - Under "Source", click "Add GitHub Repo" or "Upload from Local"
   - If uploading local:
     - Run this command in terminal: `railway up --service api-grader`

### Step 3: Configure Environment Variables

Click on your `api-grader` service, go to "Variables" tab, and add:

```
NODE_ENV=production
ALLOWED_ORIGINS=*
RATE_LIMIT=100
API_KEYS={"sk_dev_123": {"teamId": "dev-team", "userId": "dev-user"}}
TEMPLATE_PATH=/app/templates/MASTER_API_TEMPLATE_v3.yaml
PORT=3000
```

The DATABASE_URL will be automatically added by Railway.

### Step 4: Deploy Command

In the service settings, ensure the start command is:
```
npm start
```

### Step 5: After Deployment (2-3 minutes)

Once the deployment shows as "Active" in Railway:

1. **Run Database Migration:**
```bash
railway run npm run migrate --service api-grader
```

2. **Generate Production API Key:**
```bash
railway run npm run generate-key --service api-grader
```

3. **Get Your URL:**
Look for the deployment URL in Railway dashboard under "Deployments" tab.
It will be something like: `https://smackdab-api-grader-production.up.railway.app`

### Step 6: Test Your Deployment

```bash
# Test health endpoint
curl https://YOUR-APP.railway.app/health

# Test with API key
curl -H "Authorization: Bearer sk_dev_123" \
     https://YOUR-APP.railway.app/health
```

## 🎉 Team Configuration

Once deployed, your team uses this configuration:

```json
{
  "mcpServers": {
    "smackdab-api-grader": {
      "url": "https://YOUR-APP.railway.app/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

## 🆘 Troubleshooting

### If deployment fails:
1. Check logs in Railway dashboard
2. Verify all environment variables are set
3. Ensure PORT is set to 3000

### If database connection fails:
1. DATABASE_URL should be auto-set by Railway
2. Run migration: `railway run npm run migrate --service api-grader`

### If SSE doesn't connect:
1. Check API key is valid
2. Verify CORS settings
3. Check the URL includes `/sse` endpoint

---

**OPEN DASHBOARD NOW**: https://railway.com/project/252c1372-fb45-413f-abab-d10fd0695914