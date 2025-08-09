# API Grader Version Information

## Current Status: ✅ VERSION 2.0.0 - NEW COVERAGE-BASED SCORING

### What's New
- **Coverage-Based Scoring**: No more harsh binary grading! Score = coverage × rule_points
- **Version Tracking**: Every grading now includes version and instance information
- **Prerequisite Gating**: Critical issues block scoring without harsh auto-fail
- **Granular Feedback**: See exactly which rules are partially met

### Version Information Available
Every grading result now includes:
- `instanceId`: Unique identifier for the grader instance (e.g., "285eafda")
- `instanceStartTime`: When this grader instance started
- `gradedAt`: When the specific grading was performed
- `scoringEngine`: "coverage-based" (new) or "legacy" (old)
- `graderVersion`: "2.0.0" (new) or "1.2.0" (legacy)

### How to Use in Qodo

1. **Restart Qodo MCP Connection**:
   - Restart Qodo or disconnect/reconnect the MCP server
   - This ensures the new code is loaded

2. **Check Version**:
   ```
   Call tool: version
   ```
   This returns current grader version and instance info

3. **Grade with New System**:
   ```
   Call tool: grade_contract
   Arguments: {
     "path": "/path/to/your/api.yaml"
   }
   ```
   
   The result will include:
   - Coverage-based scoring (not binary)
   - Version information in metadata
   - Granular category breakdowns

### Example Output with New Scoring

```json
{
  "grade": {
    "total": 42,
    "letter": "F",
    "compliancePct": 0.42,
    "coverageBased": true,  // <-- Indicates new scoring
    "perCategory": {
      "functionality": { "percentage": 45.2 },
      "security": { "percentage": 38.5 },
      // ... etc
    }
  },
  "metadata": {
    "instanceId": "285eafda",
    "instanceStartTime": "2025-08-09T13:37:29.851Z",
    "gradedAt": "2025-08-09T13:37:35.123Z",
    "scoringEngine": "coverage-based",
    "toolVersions": {
      "grader": "2.0.0"
    }
  }
}
```

### Legacy Mode (if needed)
To use the old harsh scoring:
```
Call tool: grade_contract
Arguments: {
  "path": "/path/to/api.yaml",
  "legacyMode": true
}
```

## Testing the Changes

### Direct Test (command line):
```bash
node test-direct.js /tmp/test-api-minimal.yaml
```

### Through MCP (what Qodo uses):
The MCP server at the path configured in Qodo:
```json
{
  "smackdab-api-grader": {
    "command": "node",
    "args": [
      ".../node_modules/.bin/tsx",
      ".../src/mcp/server.ts"
    ]
  }
}
```

## Next Steps (Phase 2 - Tomorrow)
- Add API design profiles (REST, GraphQL, gRPC)
- Implement priority-based scoring
- Add smart validation that understands business context
- Create learning feedback system