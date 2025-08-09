#!/bin/bash

# COMPREHENSIVE SSE MCP SERVER TEST SUITE
# =========================================

BASE_URL="https://smackdab-api-grader.onrender.com"
API_KEY="sk_prod_001"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}     SSE MCP SERVER COMPREHENSIVE TEST SUITE${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Test counters
PASSED=0
FAILED=0

# Function to run test
run_test() {
    local test_name="$1"
    local test_cmd="$2"
    local expected_pattern="$3"
    local test_type="${4:-contains}"  # contains or status
    
    echo -e "${YELLOW}Test:${NC} $test_name"
    echo -e "${BLUE}Command:${NC} $test_cmd"
    
    # Execute command and capture output and status
    output=$(eval "$test_cmd" 2>&1)
    status=$?
    
    # Check result based on test type
    if [ "$test_type" = "status" ]; then
        if [ $status -eq $expected_pattern ]; then
            echo -e "${GREEN}✓ PASSED${NC} - Exit code: $status"
            ((PASSED++))
            return 0
        else
            echo -e "${RED}✗ FAILED${NC} - Expected exit code: $expected_pattern, Got: $status"
            echo "Output: $output"
            ((FAILED++))
            return 1
        fi
    else
        if echo "$output" | grep -q "$expected_pattern"; then
            echo -e "${GREEN}✓ PASSED${NC} - Found: '$expected_pattern'"
            ((PASSED++))
            return 0
        else
            echo -e "${RED}✗ FAILED${NC} - Expected: '$expected_pattern'"
            echo "Actual output:"
            echo "$output" | head -5
            ((FAILED++))
            return 1
        fi
    fi
    echo ""
}

# 1. BASIC CONNECTIVITY TEST
echo -e "\n${BLUE}▶ 1. BASIC CONNECTIVITY TESTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_test "Server Reachability" \
    "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/health" \
    "200"

run_test "Health Endpoint Content" \
    "curl -s $BASE_URL/health" \
    '"status":"healthy"'

# 2. AUTHENTICATION TESTS
echo -e "\n${BLUE}▶ 2. AUTHENTICATION TESTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_test "SSE Endpoint Without Auth" \
    "curl -s -X POST $BASE_URL/sse -d '{}'" \
    "Missing or invalid authorization"

run_test "SSE Endpoint With Invalid Key" \
    "curl -s -X POST $BASE_URL/sse -H 'Authorization: Bearer invalid_key' -d '{}'" \
    "Invalid API key"

run_test "SSE Endpoint With Valid Key" \
    "curl -s -X POST $BASE_URL/sse -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' -d '{}' | head -1" \
    "event:"

# 3. MCP PROTOCOL TESTS
echo -e "\n${BLUE}▶ 3. MCP PROTOCOL TESTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_test "MCP Initialize Request" \
    "curl -s -X POST $BASE_URL/sse -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0.0\"}},\"id\":1}' | head -3" \
    "event:"

run_test "MCP Tools List Request" \
    "curl -s -X POST $BASE_URL/sse -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"params\":{},\"id\":2}' | head -3" \
    "event:"

# 4. SSE STREAM TESTS
echo -e "\n${BLUE}▶ 4. SSE STREAM TESTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Testing SSE stream connection (5 second timeout)..."
SSE_OUTPUT=$(timeout 5 curl -s -N -X POST $BASE_URL/sse \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' 2>&1 | head -20)

if echo "$SSE_OUTPUT" | grep -q "event:"; then
    echo -e "${GREEN}✓ SSE Stream Working${NC}"
    echo "Stream output sample:"
    echo "$SSE_OUTPUT" | head -5
    ((PASSED++))
else
    echo -e "${RED}✗ SSE Stream Failed${NC}"
    echo "Output: $SSE_OUTPUT"
    ((FAILED++))
fi

# 5. CORS HEADERS TEST
echo -e "\n${BLUE}▶ 5. CORS HEADERS TEST${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CORS_HEADERS=$(curl -s -I -X OPTIONS $BASE_URL/sse \
    -H "Origin: https://qodo.ai" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Authorization,Content-Type" 2>&1)

if echo "$CORS_HEADERS" | grep -q "Access-Control-Allow-Origin"; then
    echo -e "${GREEN}✓ CORS Headers Present${NC}"
    echo "$CORS_HEADERS" | grep "Access-Control"
    ((PASSED++))
else
    echo -e "${RED}✗ CORS Headers Missing${NC}"
    echo "This could prevent browser-based clients from connecting"
    ((FAILED++))
fi

# 6. RESPONSE TIME TEST
echo -e "\n${BLUE}▶ 6. RESPONSE TIME TEST${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RESPONSE_TIME=$(curl -s -o /dev/null -w '%{time_total}' $BASE_URL/health)
echo "Health endpoint response time: ${RESPONSE_TIME}s"

if (( $(echo "$RESPONSE_TIME < 2" | bc -l) )); then
    echo -e "${GREEN}✓ Response time acceptable${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ Response time slow (>2s)${NC}"
    echo "Note: First request to Render free tier can be slow due to cold start"
fi

# 7. ERROR HANDLING TEST
echo -e "\n${BLUE}▶ 7. ERROR HANDLING TEST${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_test "Invalid JSON Request" \
    "curl -s -X POST $BASE_URL/sse -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' -d 'invalid json'" \
    "error"

run_test "Invalid Content-Type" \
    "curl -s -X POST $BASE_URL/sse -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: text/plain' -d 'test'" \
    "error\|event:"

# 8. FINAL SUMMARY
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                        TEST SUMMARY${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Tests Passed: ${GREEN}$PASSED${NC}"
echo -e "Tests Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED! Server is working correctly.${NC}"
    echo ""
    echo "The SSE MCP server is ready for use with:"
    echo "URL: $BASE_URL/sse"
    echo "API Key: $API_KEY"
else
    echo -e "${RED}❌ SOME TESTS FAILED! Server has issues.${NC}"
    echo ""
    echo "Common issues:"
    echo "1. Environment variables not set correctly"
    echo "2. CORS not configured for browser clients"
    echo "3. SSE implementation not MCP-compliant"
    echo "4. Authentication middleware failing"
fi

echo ""
echo "Test completed at: $(date)"
