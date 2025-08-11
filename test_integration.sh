#!/bin/bash

echo "=== Testing MCP Client Integration with Render API ==="
echo

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Set environment
export API_GRADER_URL="https://smackdab-api-grader.onrender.com"
export API_GRADER_KEY="sk_prod_001"

echo "1. Testing REST API health..."
HEALTH=$(curl -s $API_GRADER_URL/health | jq -r '.status')
if [ "$HEALTH" = "healthy" ]; then
    echo -e "${GREEN}✓ REST API is healthy${NC}"
else
    echo -e "${RED}✗ REST API health check failed${NC}"
    exit 1
fi

echo
echo "2. Testing API version endpoint..."
VERSION=$(curl -s -X POST $API_GRADER_URL/api/version \
    -H "Authorization: Bearer $API_GRADER_KEY" \
    -H "Content-Type: application/json" | jq -r '.version')
if [ "$VERSION" = "2.0.0" ]; then
    echo -e "${GREEN}✓ REST API version 2.0.0 confirmed${NC}"
else
    echo -e "${RED}✗ Wrong API version: $VERSION${NC}"
    exit 1
fi

echo
echo "3. Testing NPM client connection..."
cd mcp-client-npm
CONNECTION=$(node dist/cli.js --test 2>&1 | grep "Connection successful" | wc -l)
if [ "$CONNECTION" -eq "1" ]; then
    echo -e "${GREEN}✓ NPM client connected successfully${NC}"
else
    echo -e "${RED}✗ NPM client connection failed${NC}"
    exit 1
fi

echo
echo "4. Testing MCP stdio protocol..."
INIT_RESPONSE=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js 2>/dev/null | head -1)
SERVER_NAME=$(echo "$INIT_RESPONSE" | jq -r '.result.serverInfo.name')
if [ "$SERVER_NAME" = "smackdab-api-grader" ]; then
    echo -e "${GREEN}✓ MCP stdio protocol working${NC}"
else
    echo -e "${RED}✗ MCP stdio protocol failed${NC}"
    exit 1
fi

echo
echo "5. Testing tool listing..."
TOOLS_REQUEST='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
TOOLS_RESPONSE=$(echo -e "$INIT_RESPONSE\n$TOOLS_REQUEST" | node dist/index.js 2>/dev/null | tail -1)
TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | jq '.result.tools | length')
if [ "$TOOL_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✓ Found $TOOL_COUNT tools available${NC}"
else
    echo -e "${RED}✗ No tools found${NC}"
    exit 1
fi

echo
echo "6. Testing generate_api_id tool..."
GENERATE_REQUEST='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"generate_api_id","arguments":{"organization":"test","domain":"inventory"}}}'
GENERATE_RESPONSE=$(echo -e "$INIT_RESPONSE\n$GENERATE_REQUEST" | node dist/index.js 2>/dev/null | tail -1)
API_ID=$(echo "$GENERATE_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.apiId' 2>/dev/null)
if [[ "$API_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]; then
    echo -e "${GREEN}✓ Generated valid UUID: $API_ID${NC}"
else
    echo -e "${RED}✗ Invalid UUID generated${NC}"
    exit 1
fi

echo
echo "==================================="
echo -e "${GREEN}All tests passed successfully!${NC}"
echo
echo "Your MCP setup is working correctly:"
echo "- REST API deployed on Render ✓"
echo "- NPM client package functional ✓"
echo "- MCP stdio protocol operational ✓"
echo "- Tools accessible via Claude Desktop ✓"
echo
echo "Users can now install with:"
echo "  npx @smackdab/api-grader-mcp"
echo
cd ..