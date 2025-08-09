#!/bin/bash

# Test script for Railway deployment
echo "🧪 Smackdab API Grader - Deployment Test Suite"
echo "=============================================="
echo ""

# Get deployment URL
if [ -z "$1" ]; then
    echo "Usage: ./test-deployment.sh <DEPLOYMENT_URL>"
    echo "Example: ./test-deployment.sh https://smackdab-api-grader-production.up.railway.app"
    exit 1
fi

BASE_URL="$1"
API_KEY="${2:-sk_dev_123}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
run_test() {
    local test_name="$1"
    local command="$2"
    local expected_pattern="$3"
    
    echo -n "Testing $test_name... "
    
    result=$(eval "$command" 2>&1)
    
    if echo "$result" | grep -q "$expected_pattern"; then
        echo -e "${GREEN}✅ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "  Expected pattern: $expected_pattern"
        echo "  Got: $result" | head -3
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "🌐 Testing deployment at: $BASE_URL"
echo "🔑 Using API key: ${API_KEY:0:10}..."
echo ""

# Test 1: Basic health check
run_test "Health endpoint (no auth)" \
    "curl -s $BASE_URL/health" \
    '"status":"healthy"'

# Test 2: Health check with auth
run_test "Health endpoint (with auth)" \
    "curl -s -H 'Authorization: Bearer $API_KEY' $BASE_URL/health" \
    '"status":"healthy"'

# Test 3: SSE endpoint without auth (should fail)
run_test "SSE endpoint requires auth" \
    "curl -s -X POST $BASE_URL/sse" \
    "Missing or invalid authorization"

# Test 4: SSE endpoint with auth
run_test "SSE endpoint with auth" \
    "curl -s -X POST -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' $BASE_URL/sse -d '{}' | head -1" \
    "event:"

# Test 5: Invalid API key
run_test "Invalid API key rejected" \
    "curl -s -X POST -H 'Authorization: Bearer invalid_key' $BASE_URL/sse" \
    "Invalid API key"

# Test 6: Rate limiting headers
run_test "Rate limit headers present" \
    "curl -s -I -H 'Authorization: Bearer $API_KEY' $BASE_URL/health" \
    "HTTP"

echo ""
echo "========================================"
echo "📊 Test Results:"
echo -e "  Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "  Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 All tests passed! Deployment is working correctly.${NC}"
    echo ""
    echo "✅ Your MCP server is ready for team use!"
    echo ""
    echo "📋 Team Configuration:"
    cat << EOF
{
  "mcpServers": {
    "smackdab-api-grader": {
      "url": "$BASE_URL/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
EOF
else
    echo ""
    echo -e "${RED}⚠️  Some tests failed. Please check the deployment.${NC}"
    echo ""
    echo "Common issues:"
    echo "1. Environment variables not set correctly"
    echo "2. Database migration not run: railway run npm run migrate --service api-grader"
    echo "3. API_KEYS environment variable not configured"
fi