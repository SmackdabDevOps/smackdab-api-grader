# Server Consolidation Test Suite

This directory contains comprehensive tests to validate the safety and correctness of consolidating the 4 MCP server implementations into a unified server.

## Overview

The API Grader currently has 4 separate server implementations:

1. **server.ts** - STDIO transport for CLI usage
2. **server-sse.ts** - SSE transport with MCP SDK
3. **server-sse-simple.ts** - Manual SSE implementation  
4. **server-sse-direct.ts** - Direct SSE implementation

This test suite ensures these can be safely consolidated without breaking existing functionality.

## Test Structure

### 1. Server Compatibility Tests (`server-compatibility.test.ts`)
- **Purpose**: Verify all 4 implementations behave identically
- **Coverage**: All 8 tools work across all transports
- **Validation**: Error handling, authentication, database usage
- **Performance**: Response times within acceptable variance

### 2. Transport Abstraction Tests (`transport-abstraction.test.ts`)
- **Purpose**: Validate transport switching capabilities
- **Coverage**: STDIO ↔ SSE switching, message serialization
- **Validation**: Protocol compliance, connection management
- **Performance**: Comparable performance across transports

### 3. Server Migration Tests (`server-migration.test.ts`)
- **Purpose**: Ensure zero-downtime migration capability
- **Coverage**: Blue-green deployment, database migration
- **Validation**: Client compatibility, rollback capability
- **Performance**: Migration impact analysis

## Test Execution

### Quick Start
```bash
# Run full consolidation test suite
npm run test:consolidation

# Run individual test suites
npm run test:server-compatibility
npm run test:transport-abstraction  
npm run test:migration

# Run all consolidation tests (faster)
npm run test:consolidation-fast
```

### Manual Execution
```bash
# Full test suite with servers
./test-server-consolidation.sh

# Individual test files
npm test -- --testPathPattern=server-compatibility
npm test -- --testPathPattern=transport-abstraction
npm test -- --testPathPattern=server-migration
```

## Test Requirements

### Environment Setup
```bash
export NODE_ENV=test
export DATABASE_URL="sqlite::memory:"
export API_KEY="sk_test_consolidation_001"
export TEMPLATE_PATH="/app/templates/MASTER_API_TEMPLATE_v3.yaml"
```

### Dependencies
- Node.js 20+
- tsx (TypeScript executor)
- curl (for health checks)
- All npm dependencies installed

### Server Ports (for testing)
- SSE Server: 3001
- SSE Simple: 3002  
- SSE Direct: 3003
- Test servers automatically started/stopped

## Test Categories

### Compatibility Matrix
| Test | STDIO | SSE | SSE-Simple | SSE-Direct |
|------|-------|-----|------------|------------|
| version | ✅ | ✅ | ✅ | ✅ |
| list_checkpoints | ✅ | ✅ | ✅ | ✅ |
| grade_contract | ✅ | ✅ | ✅ | ✅ |
| grade_inline | ✅ | ✅ | ✅ | ✅ |
| grade_and_record | ❌ | ✅ | ✅ | ✅ |
| explain_finding | ✅ | ✅ | ✅ | ✅ |
| suggest_fixes | ✅ | ✅ | ✅ | ✅ |
| get_api_history | ❌ | ✅ | ✅ | ✅ |

*Note: STDIO server lacks authentication context for database operations*

### Error Scenarios Tested
- Malformed base64 input
- Invalid YAML content
- Non-existent rule IDs
- Network timeouts
- Database connection failures
- Authentication failures

### Performance Benchmarks
- Response time variance < 50% between implementations
- No server should exceed 1000ms average response time
- Memory usage should remain stable during testing
- Database operations should complete within 5 seconds

## Migration Strategy Validation

### Blue-Green Deployment
1. **Current State**: 4 separate servers
2. **Transition State**: Unified server running alongside old servers
3. **Target State**: Only unified server running

### Traffic Shifting Pattern
```
Old Servers: 100% → 75% → 50% → 25% → 0%
New Server:   0%  → 25% → 50% → 75% → 100%
```

### Rollback Triggers
- Response time degradation > 50%
- Error rate increase > 2%
- Any tool compatibility failure
- Database consistency issues

## Expected Results

### Success Criteria
✅ All server implementations return identical results  
✅ Transport switching works without data loss  
✅ Migration can be performed with zero downtime  
✅ Performance impact < 10% during migration  
✅ Rollback capability verified  

### Failure Scenarios
❌ Tool behavior differs between implementations  
❌ Transport switching loses messages  
❌ Migration causes data inconsistency  
❌ Performance degrades significantly  
❌ Rollback fails or causes downtime  

## Troubleshooting

### Common Issues

**Server startup failures:**
```bash
# Check if ports are in use
lsof -ti:3001,3002,3003

# Kill existing processes
pkill -f "server-sse"
```

**Test timeouts:**
```bash
# Increase timeout for slow environments
export TEST_TIMEOUT=120000
```

**Database connection issues:**
```bash
# Reset test database
rm -f /tmp/test-*.db
```

### Debug Mode
```bash
# Run with debug logging
DEBUG=true npm run test:consolidation-fast

# Check server logs
tail -f /tmp/*-server.log
```

## Integration with CI/CD

### GitHub Actions
```yaml
name: Server Consolidation Tests
on: [push, pull_request]

jobs:
  consolidation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:consolidation
```

### Quality Gates
- All consolidation tests must pass before merge
- Performance regression tests must pass
- Coverage must remain > 90% for modified code

## Future Enhancements

### Planned Improvements
- [ ] Load testing with concurrent clients
- [ ] Memory leak detection during migration
- [ ] Integration with Prometheus metrics
- [ ] Automated performance regression detection
- [ ] Chaos engineering tests (network partitions, etc.)

### Monitoring Integration
- [ ] Real-time dashboards during migration
- [ ] Automated rollback triggers
- [ ] Performance alerting thresholds
- [ ] Client compatibility monitoring

## Contributing

When adding new server implementations or modifying existing ones:

1. Update all 3 test files to include new scenarios
2. Add performance benchmarks for new endpoints
3. Verify migration strategy accounts for changes
4. Update compatibility matrix documentation
5. Run full consolidation test suite before submitting

## Support

For issues with the consolidation test suite:

1. Check server logs in `/tmp/*-server.log`
2. Verify all dependencies are installed
3. Ensure ports 3001-3003 are available
4. Run individual test suites to isolate issues
5. Check GitHub Issues for known problems