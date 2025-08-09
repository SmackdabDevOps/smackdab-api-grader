#!/bin/bash

# STATUS CHECKER - See exactly what's happening

clear
echo "╔════════════════════════════════════════════════════════╗"
echo "║          🔍 DEPLOYMENT STATUS CHECK 🔍              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

echo "🎯 Checking Railway Status..."
echo "──────────────────────────────"
echo ""

# Check CLI authentication
if railway whoami &>/dev/null; then
    USER=$(railway whoami 2>/dev/null)
    echo "✅ Logged in as: $USER"
else
    echo "❌ Not logged in to Railway CLI"
    echo "   Run: railway login"
fi

# Check project link
if railway status &>/dev/null; then
    echo "✅ Linked to Railway project"
else
    echo "❌ Not linked to project"
    echo "   Run: railway link 252c1372-fb45-413f-abab-d10fd0695914"
fi

echo ""
echo "📦 Services in Project:"
echo "──────────────────────────────"

# List services
SERVICES=$(railway service 2>&1)

if echo "$SERVICES" | grep -q "Multiple services"; then
    echo "✅ Multiple services found:"
    echo "$SERVICES" | grep -E "^  " | while read -r line; do
        echo "   • $line"
    done
elif echo "$SERVICES" | grep -q "No service"; then
    echo "⚠️  No services found in project"
    echo "   You need to create 'api-grader' service in dashboard"
else
    echo "$SERVICES"
fi

echo ""
echo "🌐 Checking Deployment URLs:"
echo "──────────────────────────────"

# Try to get deployment info
if railway service api-grader &>/dev/null; then
    echo "✅ api-grader service exists"
    
    # Check for deployment URL
    DEPLOYMENT=$(railway status --service api-grader 2>&1)
    if echo "$DEPLOYMENT" | grep -q "railway.app"; then
        URL=$(echo "$DEPLOYMENT" | grep -o 'https://[^ ]*railway.app')
        echo "🌐 Deployment URL: $URL"
        echo ""
        echo "🧪 Testing deployment..."
        if curl -s "$URL/health" | grep -q "healthy"; then
            echo "✅ DEPLOYMENT IS WORKING!"
        else
            echo "⚠️  Deployment exists but health check failed"
            echo "   Might still be starting up..."
        fi
    else
        echo "⚠️  No deployment URL found yet"
        echo "   Service might still be deploying"
    fi
else
    echo "❌ api-grader service not found"
    echo "   Create it in the Railway dashboard"
fi

echo ""
echo "🔧 Quick Actions:"
echo "──────────────────────────────"
echo ""
echo "1. Deploy now:           ./ULTRATHINK_DEPLOY.sh"
echo "2. Check logs:           railway logs --service api-grader"
echo "3. Run migration:        railway run npm run migrate --service api-grader"
echo "4. Open dashboard:       open https://railway.com/project/252c1372-fb45-413f-abab-d10fd0695914"
echo "5. Test local MCP:       npm run dev"
echo ""

echo "📋 Current Directory:"
echo "   $(pwd)"
echo ""
echo "📁 Key Files:"
ls -la *.sh package.json Dockerfile railway.json 2>/dev/null | grep -v "^total" | head -10
echo ""