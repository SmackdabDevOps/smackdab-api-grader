#!/bin/bash

echo "🚀 Running Post-Deployment Setup..."
echo ""

# Get service name
echo "Looking for your service name in Railway..."
echo "Check your Railway dashboard for the service name (like 'production-xyz')"
echo ""
read -p "Enter your service name from Railway dashboard: " SERVICE_NAME

if [ -z "$SERVICE_NAME" ]; then
    echo "❌ Service name required!"
    exit 1
fi

echo ""
echo "Linking to service: $SERVICE_NAME"
railway service $SERVICE_NAME

echo ""
echo "Running database migration..."
railway run npm run migrate

if [ $? -eq 0 ]; then
    echo "✅ Database migration complete!"
else
    echo "⚠️  Migration might have failed. Check logs with: railway logs"
fi

echo ""
echo "Generating API key..."
railway run npm run generate-key

echo ""
echo "Checking deployment logs..."
railway logs | tail -20

echo ""
echo "📋 Getting deployment URL..."
echo "Look in your Railway dashboard for the deployment URL"
echo "It will be under Settings → Domains"
echo ""
echo "Once you have the URL, test with:"
echo "./test-deployment.sh https://YOUR-URL.railway.app"