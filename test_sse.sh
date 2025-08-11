#\!/bin/bash

# Get base64 content
BASE64_CONTENT=$(cat test-api-base64.txt | tr -d '\n')

# Create the request payload
cat > grade_request.json << JSON
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "grade_contract",
    "arguments": {
      "content": "$BASE64_CONTENT",
      "format": "base64"
    }
  }
}
JSON

# First, establish SSE connection to get session ID
SESSION_RESPONSE=$(curl -s -i -X GET "http://localhost:3000/sse" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer sk_prod_001")

SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -i "x-session-id:" | cut -d' ' -f2 | tr -d '\r')

echo "Session ID: $SESSION_ID"

# Send the grade request
curl -X POST "http://localhost:3000/sse" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_prod_001" \
  -H "X-Session-ID: $SESSION_ID" \
  -d @grade_request.json

