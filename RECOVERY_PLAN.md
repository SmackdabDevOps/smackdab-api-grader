# API Grader MCP Recovery & Improvement Plan

## Phase 1: Emergency Fixes (Day 1-2)
*Goal: Get MCP working with Qodo/Claude Desktop*

### 1.1 Fix MCP Integration
```bash
# Test current MCP server
echo '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | npm run dev

# Create proper Qodo config
cat > ~/.qodo/mcp-config.json << 'EOF'
{
  "mcpServers": {
    "smackdab-api-grader": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/Users/brooksswift/Desktop/api-grader-mcp-starter"
    }
  }
}
EOF
```

### 1.2 Create Basic Test Suite
```typescript
// test/mcp-integration.test.ts
import { spawn } from 'child_process';

describe('MCP Server', () => {
  test('responds to initialize', async () => {
    const server = spawn('npm', ['run', 'dev']);
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
      id: 1
    }));
    // Assert response contains serverInfo
  });

  test('lists tools correctly', async () => {
    // Test tools/list method
  });

  test('grades sample API', async () => {
    // Test grade_contract with samples/specs/perfect/inventory.yaml
  });
});
```

### 1.3 Document MCP Usage
```markdown
# Quick Start Guide

## Installation
npm install

## Testing MCP Locally
npx @modelcontextprotocol/inspector npm run dev

## Configuring with Qodo
1. Open Qodo Settings
2. Navigate to MCP Servers
3. Add configuration from RECOVERY_PLAN.md section 1.1

## Testing a Grade
Use tool: grade_contract
Arguments:
- path: "./samples/specs/perfect/inventory.yaml"
- templatePath: "./templates/MASTER_API_TEMPLATE_v3.yaml"
```

## Phase 2: Test Coverage (Day 3-5)
*Goal: Achieve 80% test coverage*

### 2.1 Unit Tests Structure
```
test/
├── unit/
│   ├── scoring/
│   │   ├── prerequisites.test.ts
│   │   ├── dependencies.test.ts
│   │   └── finalizer.test.ts
│   ├── semantic/
│   │   ├── http.test.ts
│   │   ├── naming.test.ts
│   │   └── pagination.test.ts
│   └── linters/
│       └── openapiValidator.test.ts
├── integration/
│   ├── pipeline.test.ts
│   └── mcp-server.test.ts
└── e2e/
    └── grading-flow.test.ts
```

### 2.2 Test Implementation Priority
1. **Critical Path Tests** (Day 3)
   - Grade calculation accuracy
   - Finding detection
   - MCP protocol compliance

2. **Semantic Rules** (Day 4)
   - Each module gets basic coverage
   - Edge cases for scoring

3. **Integration Tests** (Day 5)
   - Full pipeline execution
   - Database persistence
   - Error handling

### 2.3 Testing Commands
```json
// package.json additions
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:mcp": "tsx test/mcp-protocol.test.ts"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0"
  }
}
```

## Phase 3: API Contract & Documentation (Day 6-7)
*Goal: Self-documenting, self-grading system*

### 3.1 Create OpenAPI Specification
```yaml
# openapi/grader-api.yaml
openapi: 3.0.3
info:
  title: Smackdab API Grader
  version: 2.0.0
  description: MCP-based API contract grading service

servers:
  - url: stdio://
    description: MCP STDIO transport
  - url: https://api.example.com
    description: HTTP SSE transport

paths:
  /tools/grade_contract:
    post:
      operationId: gradeContract
      summary: Grade an API specification file
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [path]
              properties:
                path:
                  type: string
                  description: Path to OpenAPI file
                templatePath:
                  type: string
                  description: Optional template path
      responses:
        '200':
          description: Grading complete
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GradeReport'

components:
  schemas:
    GradeReport:
      type: object
      properties:
        grade:
          $ref: '#/components/schemas/Grade'
        findings:
          type: array
          items:
            $ref: '#/components/schemas/Finding'
```

### 3.2 Self-Grade the API
```bash
# Grade our own API specification
npm run dev << EOF
{"jsonrpc":"2.0","method":"tools/call","params":{
  "name":"grade_contract",
  "arguments":{
    "path":"./openapi/grader-api.yaml",
    "templatePath":"./templates/MASTER_API_TEMPLATE_v3.yaml"
  }
},"id":1}
EOF
```

## Phase 4: Refactoring (Week 2)
*Goal: Clean architecture, maintainable code*

### 4.1 Consolidate Server Implementations
```typescript
// src/mcp/server-unified.ts
export class UnifiedMCPServer {
  constructor(
    private transport: Transport,
    private pipeline: GradingPipeline,
    private db: GraderDB
  ) {}

  async initialize() {
    // Single initialization point
  }

  async handleRequest(request: MCPRequest) {
    // Unified request handling
  }
}
```

### 4.2 Extract Scoring Strategy
```typescript
// src/scoring/strategy.ts
interface ScoringStrategy {
  score(spec: any, findings: Finding[]): GradeResult;
}

class LegacyScoringStrategy implements ScoringStrategy {
  // Binary pass/fail logic
}

class CoverageScoringStrategy implements ScoringStrategy {
  // Coverage-based logic
}

class ScoringContext {
  constructor(private strategy: ScoringStrategy) {}
  
  score(spec: any, findings: Finding[]): GradeResult {
    return this.strategy.score(spec, findings);
  }
}
```

### 4.3 Implement Dependency Injection
```typescript
// src/container.ts
import { Container } from 'inversify';

const container = new Container();
container.bind<GraderDB>('DB').to(PostgresDB).inSingletonScope();
container.bind<Pipeline>('Pipeline').to(GradingPipeline);
container.bind<MCPServer>('Server').to(UnifiedMCPServer);
```

## Phase 5: Production Readiness (Week 3)
*Goal: Monitoring, security, performance*

### 5.1 Add Observability
```typescript
// src/monitoring/telemetry.ts
import { metrics } from '@opentelemetry/api-metrics';

const meter = metrics.getMeter('api-grader');
const gradeCounter = meter.createCounter('grades_total');
const gradeDuration = meter.createHistogram('grade_duration_seconds');

export function instrumentPipeline(pipeline: Pipeline) {
  return async (spec: any) => {
    const start = Date.now();
    try {
      const result = await pipeline.grade(spec);
      gradeCounter.add(1, { status: 'success', grade: result.grade.letter });
      return result;
    } catch (error) {
      gradeCounter.add(1, { status: 'error' });
      throw error;
    } finally {
      gradeDuration.record((Date.now() - start) / 1000);
    }
  };
}
```

### 5.2 Security Hardening
```typescript
// src/security/auth.ts
import { createHash } from 'crypto';

export class ApiKeyManager {
  private keys = new Map<string, ApiKeyInfo>();

  async validateKey(key: string): Promise<boolean> {
    const hashedKey = this.hash(key);
    const info = this.keys.get(hashedKey);
    
    if (!info) return false;
    if (info.expiresAt < new Date()) return false;
    if (info.rateLimit.isExceeded()) return false;
    
    return true;
  }

  private hash(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}
```

### 5.3 Performance Optimization
```typescript
// src/cache/grading-cache.ts
export class GradingCache {
  private cache = new LRU<string, GradeReport>({ max: 100 });

  getCacheKey(spec: any, template: any): string {
    return sha256(JSON.stringify({ spec, template }));
  }

  async getOrCompute(
    key: string,
    compute: () => Promise<GradeReport>
  ): Promise<GradeReport> {
    const cached = this.cache.get(key);
    if (cached) return cached;
    
    const result = await compute();
    this.cache.set(key, result);
    return result;
  }
}
```

## Implementation Timeline

| Week | Phase | Deliverables | Success Criteria |
|------|-------|--------------|------------------|
| 1 | Emergency + Tests | Working MCP, 50% coverage | Qodo integration works |
| 2 | Refactoring | Clean architecture | All tests pass |
| 3 | Production | Monitoring, security | Ready for deployment |

## Quick Wins Checklist

- [ ] Fix Qodo configuration path
- [ ] Add basic health check test
- [ ] Create minimal API documentation
- [ ] Add GitHub Actions CI/CD
- [ ] Set up error logging
- [ ] Create sample grading scripts
- [ ] Document scoring algorithm
- [ ] Add environment validation

## Long-term Improvements

1. **Multi-tenancy Support**
   - Team-based API keys
   - Usage quotas
   - Billing integration

2. **Advanced Features**
   - Incremental grading
   - Diff-based scoring
   - Custom rule plugins
   - WebUI dashboard

3. **Enterprise Features**
   - SAML/OAuth integration
   - Audit logging
   - Compliance reports
   - SLA monitoring

## Success Metrics

- **Technical**
  - Test coverage > 80%
  - Response time < 2s
  - Availability > 99.9%

- **Business**
  - Successfully grade 100 APIs/day
  - Zero false positives
  - User satisfaction > 4.5/5

## Getting Started Commands

```bash
# 1. Fix immediate issues
npm install
npm run build
npm test

# 2. Test MCP locally
npx @modelcontextprotocol/inspector npm run dev

# 3. Grade a sample API
./grade samples/specs/perfect/inventory.yaml

# 4. Run development server
npm run dev

# 5. Check deployment
npm run start
```

---

*Recovery Plan Created: January 10, 2025*
*Next Review Date: January 17, 2025*