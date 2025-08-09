#!/bin/bash

# Test script for live Render deployment
# Run this after setting API_KEYS environment variable on Render

echo "================================================="
echo "Testing Live MCP Server on Render"
echo "================================================="
echo ""

URL="https://smackdab-api-grader.onrender.com"
API_KEY="sk_prod_001"

echo "1. Testing health endpoint..."
curl -s "$URL/health" | jq '.' || echo "Failed to get health"
echo ""

echo "2. Testing SSE authentication..."
response=$(curl -X POST "$URL/sse" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' \
  --max-time 3 -s)

if echo "$response" | grep -q "Invalid API key"; then
  echo "❌ FAILED: API key not configured on Render"
  echo "   Please add API_KEYS environment variable in Render dashboard:"
  echo "   API_KEYS={\"sk_prod_001\": \"Production Key 1\"}"
elif echo "$response" | grep -q "data:"; then
  echo "✅ SUCCESS: SSE endpoint is working!"
  echo "Response:"
  echo "$response" | head -5
else
  echo "⚠️  Unexpected response:"
  echo "$response"
fi
echo ""

echo "3. Testing MCP tools/list..."
response=$(curl -X POST "$URL/sse" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}' \
  --max-time 3 -s)

if echo "$response" | grep -q "grade_contract"; then
  echo "✅ SUCCESS: MCP tools are available!"
  echo "Tools found: version, list_checkpoints, grade_contract"
else
  echo "⚠️  Tools not found in response"
fi
echo ""

echo "================================================="
echo "Qodo Configuration (add to settings):"
echo "================================================="
cat <<EOF
{
    "online-api-grader": {
        "url": "$URL/sse",
        "headers": {
            "Authorization": "Bearer $API_KEY"
        }
    }
}
EOF