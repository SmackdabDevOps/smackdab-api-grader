#!/bin/bash

clear
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     🚀 SMACKDAB API GRADER - RAILWAY DEPLOYMENT 🚀          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Project Status:"
echo "✅ Railway Project Created: smackdab-api-grader"
echo "✅ All code ready for deployment"
echo "✅ Docker configuration complete"
echo "✅ SSE server implementation complete"
echo "✅ PostgreSQL adapter ready"
echo "✅ Authentication system ready"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 COMPLETE THESE STEPS IN RAILWAY DASHBOARD:"
echo ""
echo "1️⃣  Opening Railway Dashboard..."
open "https://railway.com/project/252c1372-fb45-413f-abab-d10fd0695914"
sleep 2

echo ""
echo "2️⃣  In the Dashboard (if not already done):"
echo "    • Click 'New' → 'Database' → 'Add PostgreSQL'"
echo "    • Wait 30 seconds for provisioning"
echo ""
echo "3️⃣  Add Your Application Service:"
echo "    • Click 'New' → 'Empty Service'"
echo "    • Name it: api-grader"
echo ""
echo "4️⃣  Configure the Service:"
echo "    • Click on 'api-grader' service"
echo "    • Go to 'Settings' tab"
echo "    • Scroll to 'Deploy' section"
echo "    • Click 'Configure GitHub App' (if using GitHub)"
echo "    • OR we'll use CLI deployment below"
echo ""
echo "5️⃣  Add Environment Variables:"
echo "    • Go to 'Variables' tab"
echo "    • Click 'Raw Editor'"
echo "    • Paste this block:"
echo ""
echo "════════════════════════════════════════════════════════════"
cat << 'VARS'
NODE_ENV=production
ALLOWED_ORIGINS=*
RATE_LIMIT=100
API_KEYS={"sk_dev_123": {"teamId": "dev-team", "userId": "dev-user"}}
TEMPLATE_PATH=/app/templates/MASTER_API_TEMPLATE_v3.yaml
PORT=3000
VARS
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Press ENTER when you've completed the above steps..."
read

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 DEPLOYING YOUR APPLICATION..."
echo ""

# Try to link and deploy
echo "Attempting to deploy via CLI..."
railway service api-grader 2>/dev/null

# Deploy
echo "Uploading and deploying code..."
railway up --service api-grader

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ DEPLOYMENT INITIATED!"
    echo ""
    echo "⏳ Deployment will take 2-3 minutes. Check the Railway dashboard."
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 AFTER DEPLOYMENT COMPLETES:"
    echo ""
    echo "1. Check deployment status in dashboard"
    echo "2. Get your URL from the deployment (look for *.railway.app)"
    echo "3. Run database migration:"
    echo "   railway run npm run migrate --service api-grader"
    echo ""
    echo "4. Generate API key:"
    echo "   railway run npm run generate-key --service api-grader"
    echo ""
    echo "5. Test your deployment:"
    echo "   ./test-deployment.sh https://YOUR-APP.railway.app"
    echo ""
else
    echo ""
    echo "⚠️  CLI deployment needs service selection."
    echo ""
    echo "ALTERNATIVE DEPLOYMENT METHOD:"
    echo "1. In Railway dashboard, click on 'api-grader' service"
    echo "2. Go to 'Settings' → 'Source'"
    echo "3. Either:"
    echo "   a) Connect a GitHub repo, OR"
    echo "   b) In terminal, run: railway up --service api-grader"
    echo ""
    echo "If you need to select the service first:"
    echo "   railway service api-grader"
    echo "   railway up"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 HELPFUL COMMANDS:"
echo ""
echo "Check logs:           railway logs --service api-grader"
echo "Run migrations:       railway run npm run migrate --service api-grader"
echo "Generate API key:     railway run npm run generate-key --service api-grader"
echo "Test deployment:      ./test-deployment.sh <YOUR_URL>"
echo "View in dashboard:    open https://railway.com/project/252c1372-fb45-413f-abab-d10fd0695914"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Your local MCP server still works! Run 'npm run dev' anytime."
echo ""