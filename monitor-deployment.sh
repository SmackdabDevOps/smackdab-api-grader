#!/bin/bash

echo "Monitoring deployment status..."
echo "Checking every 30 seconds until the deployment is live"
echo ""

URL="https://smackdab-api-grader.onrender.com"
API_KEY="sk_prod_001"

while true; do
    echo -n "$(date '+%H:%M:%S') - "
    
    # Try to call the SSE endpoint with our API key
    response=$(curl -X POST "$URL/sse" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05"},"id":1}' \
        --max-time 3 -s 2>&1)
    
    if echo "$response" | grep -q '"protocolVersion"'; then
        echo "✅ DEPLOYMENT SUCCESSFUL! API is working!"
        echo ""
        echo "Response preview:"
        echo "$response" | head -3
        echo ""
        echo "Your Qodo configuration is ready to use:"
        echo '{'
        echo '    "online-api-grader": {'
        echo '        "url": "https://smackdab-api-grader.onrender.com/sse",'
        echo '        "headers": {'
        echo '            "Authorization": "Bearer sk_prod_001"'
        echo '        }'
        echo '    }'
        echo '}'
        break
    elif echo "$response" | grep -q "Invalid API key"; then
        echo "⏳ Still waiting... (old code still running)"
    else
        echo "⏳ Still waiting... (deployment in progress)"
    fi
    
    sleep 30
done