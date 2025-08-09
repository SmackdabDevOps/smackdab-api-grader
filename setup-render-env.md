# Setting Environment Variables on Render

## Steps to Configure API Keys

1. Go to your Render Dashboard: https://dashboard.render.com/

2. Click on your service: `api-grader-mcp`

3. Go to the "Environment" tab in the left sidebar

4. Add the following environment variable:
   - **Key**: `API_KEYS`
   - **Value**: `{"sk_prod_001": "Production Key 1"}`

5. Click "Save Changes"

6. The service will automatically redeploy with the new environment variables

## Test After Deployment

Once the deployment is complete (usually 3-5 minutes), test with:

```bash
curl -X POST https://smackdab-api-grader.onrender.com/sse \
  -H "Authorization: Bearer sk_prod_001" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' \
  --max-time 3 -s
```

You should see SSE responses like:
```
data: {"type":"connection","status":"established"}
data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05",...}}
```

## Qodo Configuration

Once the API key is set and working, your Qodo configuration is correct:

```json
{
    "online-api-grader": {
        "url": "https://smackdab-api-grader.onrender.com/sse",
        "headers": {
            "Authorization": "Bearer sk_prod_001"
        }
    }
}
```