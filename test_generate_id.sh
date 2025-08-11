#\!/bin/bash
curl -X POST http://localhost:3000/sse \
  -H "Authorization: Bearer sk_prod_001" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "generate_api_id",
      "arguments": {
        "organization": "testorg"
      }
    }
  }'
