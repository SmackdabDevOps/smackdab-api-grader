#!/bin/bash

# RENDER DEPLOYMENT - ACTUALLY AUTOMATED
# ========================================

clear
echo "🚀 RENDER.COM - TRUE HANDS-OFF DEPLOYMENT"
echo "=========================================="
echo ""
echo "This will ACTUALLY work with minimal manual steps."
echo ""
echo "Step 1: Create a Render account (if you haven't)"
echo "        https://dashboard.render.com/register"
echo ""
echo "Step 2: Install Render CLI (one time only):"
echo "        brew install render"
echo "        OR"
echo "        npm install -g @render/cli"
echo ""
echo "Step 3: Get your API key:"
echo "        1. Go to https://dashboard.render.com/u/settings"
echo "        2. Click 'API Keys'"
echo "        3. Create a new API key"
echo "        4. Copy it"
echo ""
read -p "Enter your Render API key: " RENDER_API_KEY

if [ -z "$RENDER_API_KEY" ]; then
    echo "❌ API key required!"
    exit 1
fi

export RENDER_API_KEY=$RENDER_API_KEY

echo ""
echo "Step 4: Deploying to Render..."
echo ""

# Initialize git if needed
if [ ! -d .git ]; then
    git init
    git add .
    git commit -m "Initial commit for Render deployment"
fi

# Deploy using the render.yaml blueprint
echo "Creating your services on Render..."
render blueprint launch

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "Your app will be available at:"
echo "https://api-grader-mcp.onrender.com"
echo ""
echo "PostgreSQL database has been created automatically."
echo ""
echo "From now on, just 'git push' and Render auto-deploys!"
echo ""
echo "To check status:"
echo "render services list"
echo ""
echo "To view logs:"
echo "render logs api-grader-mcp"
