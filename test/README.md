# Test Infrastructure for Smackdab API Grader MCP

This directory contains the comprehensive Test-Driven Development (TDD) infrastructure for the Smackdab API Grader MCP project.

## TDD Philosophy

This test suite follows strict TDD practices:

### RED-GREEN-REFACTOR Cycle
1. **RED PHASE** ❌ - Write failing tests that specify desired behavior
2. **GREEN PHASE** ✅ - Write minimal code to make tests pass
3. **REFACTOR PHASE** 🔄 - Improve code structure while maintaining green tests

### Current Status: RED PHASE ❌

All tests are currently **FAILING BY DESIGN**. This is the RED phase of TDD, where we:
- Define expected behavior through tests
- Specify interfaces and contracts
- Set clear requirements for implementation

## Directory Structure

```
test/
├── unit/              # Unit tests for individual modules
│   ├── mcp/          # MCP server and protocol tests
│   ├── app/          # Application logic tests
│   └── semantic/     # Semantic analysis module tests
├── integration/       # Integration tests across modules
├── e2e/              # End-to-end tests (full workflow)
├── fixtures/         # Test data files
│   ├── valid-api.yaml      # Valid OpenAPI specification
│   ├── invalid-api.yaml    # Invalid OpenAPI specification
│   └── template.yaml       # Test template file
└── helpers/          # Test utilities and helpers
    ├── setup.ts           # Jest global setup
    ├── mcp-client.ts      # MCP protocol test helpers
    ├── mock-factories.ts  # Test data factories
    └── db-helpers.ts      # Database test utilities
```

## Test Categories

### Unit Tests (`test/unit/`)
- **MCP Server Tests** - Server initialization, tool registration, protocol compliance
- **Pipeline Tests** - Core grading logic, scoring systems, semantic analysis
- **Semantic Module Tests** - Individual semantic analyzers (tenancy, naming, HTTP, etc.)

### Integration Tests (`test/integration/`)
- **Database Integration** - Data persistence, query operations, transaction handling
- **Template Integration** - Template loading and validation
- **Scoring Integration** - Legacy vs coverage-based scoring systems

### End-to-End Tests (`test/e2e/`)
- **Complete Workflow** - Full API grading pipeline
- **Multi-tenant Scenarios** - Tenant isolation and data separation
- **Error Handling** - Graceful degradation and recovery

## Test Helpers

### Mock Factories (`helpers/mock-factories.ts`)
Provides consistent test data generation:
```typescript
import { MockOpenApiFactory, MockGradingResultFactory } from './helpers/mock-factories.js';

// Create valid OpenAPI spec
const spec = MockOpenApiFactory.validWithTenancy();

// Create passing grade result
const result = MockGradingResultFactory.passingResult();
```

### MCP Client (`helpers/mcp-client.ts`)
Test utilities for MCP protocol communication:
```typescript
import { createTestMcpServer, createConnectedTestClient } from './helpers/mcp-client.js';

const server = createTestMcpServer();
const client = await createConnectedTestClient(server);
const result = await client.callTool('grade_contract', { path: '/test.yaml' });
```

### Database Helpers (`helpers/db-helpers.ts`)
Database testing utilities with setup/teardown:
```typescript
import { createDatabaseTestContext, dbAssertions } from './helpers/db-helpers.js';

describe('Database Tests', () => {
  const { getMockDb } = createDatabaseTestContext();
  
  test('should store run data', async () => {
    const mockDb = getMockDb();
    // ... test logic
    dbAssertions.expectRunStored(mockDb, runId);
  });
});
```

## Running Tests

### Basic Commands
```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test types
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e         # End-to-end tests only

# Debug mode with verbose output
npm run test:debug

# CI mode (no watch, with coverage)
npm run test:ci
```

### Coverage Requirements
- **Minimum 80%** line coverage
- **Minimum 75%** branch coverage
- **100% coverage** required for tenant-critical code paths

## Test Fixtures

### Valid API (`fixtures/valid-api.yaml`)
Complete, compliant OpenAPI 3.0.3 specification with:
- Multi-tenant patterns (`/organizations/{orgId}/branches/{branchId}/...`)
- Proper security schemes (JWT with tenant context)
- Complete schemas with examples
- Comprehensive error responses

### Invalid API (`fixtures/invalid-api.yaml`)
Intentionally broken specification for testing error handling:
- Wrong OpenAPI version (3.0.0 instead of 3.0.3)
- Missing required fields
- Non-tenant paths
- Invalid parameter definitions

### Template (`fixtures/template.yaml`)
Simplified template for testing template loading and rule validation.

## Multi-Tenant Testing

### Tenant Isolation Tests
Every test must verify proper tenant data separation:
```typescript
test('should isolate data by tenant', async () => {
  const tenant1 = { orgId: 'org-123', branchId: 'branch-456' };
  const tenant2 = { orgId: 'org-789', branchId: 'branch-101' };
  
  // Test that tenant1 cannot access tenant2 data
});
```

### Required Test Patterns
1. **Cross-tenant access prevention**
2. **JWT tenant context validation**
3. **Database row-level security**
4. **Cache key tenant isolation**
5. **Message queue tenant separation**

## Technology-Specific Tests

### Database (PostgreSQL + Citus)
- Test distributed queries with `organization_id`
- Verify row-level security enforcement
- Test performance with hot tenant scenarios
- NO materialized view tests (not supported)

### Cache (Dragonfly/Valkey)
- Test cache keys include tenant context
- Test tenant-aware invalidation
- NO Redis-specific tests (wrong technology)

### Message Queue (Apache Pulsar)
- Test topic-based tenant separation
- Test message tenant isolation
- NO RabbitMQ/Kafka tests (wrong technology)

## BDD Scenarios

Some tests use Given-When-Then format for clarity:
```gherkin
Given I am authenticated as user in organization "org-123"
When I query for all users
Then I should only see users from my organization
And I should not see users from other organizations
```

## Test Configuration

### Jest Configuration (`../jest.config.js`)
- TypeScript + ESM support
- Node.js test environment
- Coverage thresholds enforced
- Setup/teardown automation
- Module name mapping for imports

### Environment Setup (`helpers/setup.ts`)
- Test environment variables
- Mock global functions (crypto, Date)
- Console log suppression
- Deterministic test data

## Next Steps (GREEN PHASE)

After all tests are failing (RED phase complete), the next steps are:

1. **Implement MCP Server** - Make server initialization tests pass
2. **Implement Tool Registration** - Make tool listing tests pass
3. **Implement Pipeline Functions** - Make grading logic tests pass
4. **Implement Database Layer** - Make persistence tests pass
5. **Implement Semantic Analyzers** - Make semantic rule tests pass

Each implementation should be **minimal** - just enough to make tests pass, nothing more.

## Contributing

When adding new tests:

1. **Follow TDD** - Write failing tests first
2. **Test Multi-tenancy** - Always include tenant isolation tests
3. **Use Factories** - Leverage mock factories for consistent data
4. **Document Intent** - Clear test descriptions and comments
5. **Test Edge Cases** - Include error scenarios and boundary conditions

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [TDD Best Practices](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- [OpenAPI 3.0.3 Specification](https://swagger.io/specification/)