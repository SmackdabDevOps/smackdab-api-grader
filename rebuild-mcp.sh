#!/bin/bash
# Rebuild MCP Server with Fresh Compilation

echo "🔄 Rebuilding MCP Server with updated scoring system..."
echo ""

# Navigate to project directory
cd /Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter

# Clean old build
echo "🧹 Cleaning old build..."
rm -rf dist/

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npx tsc

# Verify the new scoring system is in place
echo ""
echo "✅ Checking for new scoring markers..."
grep -q "coverageBased" dist/app/pipeline.js && echo "  ✓ Coverage-based scoring found" || echo "  ✗ WARNING: Coverage-based scoring NOT found"
grep -q "ruleScores" dist/app/pipeline.js && echo "  ✓ Rule scores tracking found" || echo "  ✗ WARNING: Rule scores NOT found"
grep -q "instanceId" dist/app/pipeline.js && echo "  ✓ Instance ID tracking found" || echo "  ✗ WARNING: Instance ID NOT found"

echo ""
echo "📦 Build complete! The MCP server will now use the new scoring system."
echo ""
echo "⚠️  IMPORTANT: You must restart Qodo for changes to take effect!"
echo ""
echo "To restart Qodo:"
echo "  1. Quit Qodo completely"
echo "  2. Start Qodo again"
echo "  3. The grader should now show version info and use coverage-based scoring"