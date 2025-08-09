#!/bin/bash

echo "🚀 Railway Deployment Script for Smackdab API Grader"
echo "===================================================="
echo ""

# Check if logged in
railway whoami > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Not logged in to Railway"
    echo "Please run: railway login"
    exit 1
fi

echo "✅ Logged in to Railway"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Not in the api-grader-mcp-starter directory"
    echo "Please cd to the project directory first"
    exit 1
fi

echo "📦 Current project status:"
railway status
echo ""

echo "📝 Next steps to complete deployment:"
echo ""
echo "1. Open Railway Dashboard:"
echo "   https://railway.com/project/252c1372-fb45-413f-abab-d10fd0695914"
echo ""
echo "2. Add PostgreSQL:"
echo "   - Click 'New' → 'Database' → 'Add PostgreSQL'"
echo ""
echo "3. Deploy the application:"
echo "   - Run: railway up"
echo "   - When prompted, select the main service (not postgres)"
echo ""
echo "4. Set Environment Variables in Dashboard:"
echo "   NODE_ENV=production"
echo "   ALLOWED_ORIGINS=*"
echo "   RATE_LIMIT=100"
echo "   API_KEYS={}"
echo "   TEMPLATE_PATH=/app/templates/MASTER_API_TEMPLATE_v3.yaml"
echo ""
echo "5. After deployment completes, run migrations:"
echo "   railway run npm run migrate"
echo ""
echo "6. Generate API key:"
echo "   railway run npm run generate-key"
echo ""
echo "7. Get your deployment URL from the dashboard"
echo ""

read -p "Press Enter to open Railway dashboard in browser..."
open "https://railway.com/project/252c1372-fb45-413f-abab-d10fd0695914"