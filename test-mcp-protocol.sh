#!/bin/bash

# Test MCP Protocol Implementation
# =================================

BASE_URL="https://smackdab-api-grader.onrender.com"
API_KEY="sk_prod_001"

echo "Testing MCP Protocol Implementation"
echo "===================================="
echo ""
echo "Waiting 90 seconds for deployment..."
sleep 90

echo ""
echo "1. Testing health endpoint..."
curl -s $BASE_URL/health | python3 -m json.tool

echo ""
echo "2. Testing MCP initialize..."
curl -X POST $BASE_URL/sse \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' \
  --max-time 5 -s | head -10 | python3 -c "import sys; [print(line) for line in sys.stdin if line.strip()]"

echo ""
echo "3. Testing tools/list..."
curl -X POST $BASE_URL/sse \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}' \
  --max-time 5 -s | head -10 | python3 -c "import sys, json; lines = [l for l in sys.stdin if l.startswith('data:')]; data = lines[0].replace('data: ', '') if lines else '{}'; print(json.dumps(json.loads(data), indent=2))" 2>/dev/null || echo "Not JSON yet"

echo ""
echo "4. Testing version tool..."
curl -X POST $BASE_URL/sse \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"version","arguments":{}},"id":3}' \
  --max-time 5 -s | head -10

echo ""
echo "5. Configuration for Qodo:"
cat << EOF
{
  "online-api-grader": {
    "url": "$BASE_URL/sse",
    "headers": {
      "Authorization": "Bearer $API_KEY"
    }
  }
}
EOF
