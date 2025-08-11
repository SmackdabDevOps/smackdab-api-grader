#!/bin/bash

echo "🧪 Testing Render Deployment"
echo "============================="
echo ""
echo "URL: https://smackdab-api-grader.onrender.com"
echo ""

# Test health endpoint
echo "1. Testing health endpoint..."
HEALTH=$(curl -s https://smackdab-api-grader.onrender.com/health)
echo "   Response: $HEALTH"

if echo "$HEALTH" | grep -q "healthy"; then
    echo "   ✅ Health check passed!"
else
    echo "   ❌ Health check failed"
fi

echo ""
echo "2. Testing SSE endpoint with authentication..."
SSE_RESPONSE=$(curl -s -X POST https://smackdab-api-grader.onrender.com/sse \
  -H "Authorization: Bearer sk_prod_001" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 1}' | head -1)

echo "   Response: $SSE_RESPONSE"

if echo "$SSE_RESPONSE" | grep -q "event:"; then
    echo "   ✅ SSE endpoint working!"
elif echo "$SSE_RESPONSE" | grep -q "Invalid API key"; then
    echo "   ⏳ Environment variables updating... Try again in 1 minute"
else
    echo "   ❌ SSE endpoint issue"
fi

echo ""
echo "3. Your team can now connect using:"
echo ""
cat << 'EOF'
{
  "mcpServers": {
    "smackdab-api-grader": {
      "url": "https://smackdab-api-grader.onrender.com/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer sk_prod_001"
      }
    }
  }
}
EOF

echo ""
echo "📝 Note: If API key error, wait 1-2 minutes for redeploy after env var update"
