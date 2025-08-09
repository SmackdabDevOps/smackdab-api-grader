#!/bin/bash

echo "🚀 Automated Railway Deployment"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Not in the api-grader-mcp-starter directory${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found project directory${NC}"

# Try to get Railway project info
PROJECT_ID="252c1372-fb45-413f-abab-d10fd0695914"
echo -e "${YELLOW}📦 Project ID: $PROJECT_ID${NC}"

# Create a railway.json config
cat > railway.json << EOF
{
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
EOF

echo -e "${GREEN}✅ Created railway.json${NC}"

# Open the dashboard
echo ""
echo -e "${YELLOW}📋 MANUAL STEPS REQUIRED:${NC}"
echo ""
echo "1. Opening Railway Dashboard..."
echo "   https://railway.com/project/$PROJECT_ID"
echo ""
echo "2. In the dashboard:"
echo "   a) If you see 'PostgreSQL' service - good!"
echo "   b) If not, click 'New' → 'Database' → 'PostgreSQL'"
echo ""
echo "3. Click 'New' → 'Empty Service'"
echo "   - Name it: api-grader"
echo ""
echo "4. Click on 'api-grader' service"
echo "   - Go to 'Settings' tab"
echo "   - Under 'Source', connect this GitHub repo OR"
echo "   - Use 'railway up --service api-grader' after selecting the service"
echo ""
echo "5. Go to 'Variables' tab and add these:"
echo -e "${GREEN}"
cat << 'VARS'
NODE_ENV=production
ALLOWED_ORIGINS=*
RATE_LIMIT=100
API_KEYS={"sk_dev_123": {"teamId": "dev-team", "userId": "dev-user"}}
TEMPLATE_PATH=/app/templates/MASTER_API_TEMPLATE_v3.yaml
PORT=3000
VARS
echo -e "${NC}"
echo ""
echo "6. After deployment completes (2-3 min):"
echo "   railway run npm run migrate --service api-grader"
echo "   railway run npm run generate-key --service api-grader"
echo ""

# Try to open the dashboard
if command -v open &> /dev/null; then
    echo -e "${GREEN}Opening Railway dashboard...${NC}"
    open "https://railway.com/project/$PROJECT_ID"
elif command -v xdg-open &> /dev/null; then
    xdg-open "https://railway.com/project/$PROJECT_ID"
else
    echo "Please open: https://railway.com/project/$PROJECT_ID"
fi

echo ""
echo -e "${YELLOW}⏳ Waiting for you to complete dashboard setup...${NC}"
echo "Press ENTER when you've added the service in the dashboard..."
read

# Now try to deploy
echo -e "${YELLOW}🚀 Attempting deployment...${NC}"
echo "Running: railway up --service api-grader"
railway up --service api-grader

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment initiated successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Wait for deployment to complete (check dashboard)"
    echo "2. Run: railway run npm run migrate --service api-grader"
    echo "3. Run: railway run npm run generate-key --service api-grader"
    echo "4. Test: curl https://YOUR-APP.railway.app/health"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    echo "Please complete the setup in the Railway dashboard"
fi