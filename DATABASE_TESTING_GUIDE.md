# Database and Persistence Testing Guide

This document provides a comprehensive overview of the database and persistence testing infrastructure for the API Grader MCP project.

## 🎯 Testing Philosophy

Our database testing follows a **comprehensive, layered approach** designed to ensure:

- **Data Integrity**: Every operation maintains consistent, valid data states
- **Multi-Tenant Security**: Complete isolation between different teams and organizations  
- **Performance Under Load**: Acceptable response times even with large datasets
- **Error Resilience**: Graceful handling of failures and automatic recovery
- **Cross-Database Compatibility**: Consistent behavior across SQLite and PostgreSQL

## 📋 Test Suite Overview

### Test Categories

| Category | Files | Purpose | Coverage Target |
|----------|-------|---------|----------------|
| **Unit Tests** | `test/unit/persistence/db.test.ts` | Data model validation, interface contracts | 95%+ |
| **SQLite Integration** | `test/integration/database-sqlite.test.ts` | File-based database operations, WAL mode | 90%+ |
| **PostgreSQL Integration** | `test/integration/database-postgres.test.ts` | Multi-tenant features, advanced SQL | 90%+ |
| **Migrations** | `test/integration/migrations.test.ts` | Schema evolution, rollback procedures | 100% |
| **Performance** | `test/integration/database-performance.test.ts` | Load testing, concurrency, scalability | 85%+ |
| **Error Handling** | `test/integration/database-error-handling.test.ts` | Failure scenarios, recovery mechanisms | 100% |

### Key Test Infrastructure Files

- **Test Helpers**: `test/helpers/db-helpers.ts` - Mock databases and test utilities
- **Mock Factories**: `test/helpers/mock-factories.ts` - Realistic test data generation
- **Global Setup**: `test/helpers/setup.ts` - Environment configuration and mocks
- **Test Runner**: `scripts/run-database-tests.sh` - Automated test execution script

## 🔧 Quick Start

### Prerequisites

```bash
# Ensure Node.js 20+ and npm are installed
node --version  # Should be v20+
npm --version

# Install dependencies
npm install

# Optional: Install PostgreSQL for full test coverage
# macOS: brew install postgresql
# Ubuntu: sudo apt-get install postgresql-client
```

### Running Tests

```bash
# Run all database tests
npm run test:integration

# Or use the comprehensive test runner
./scripts/run-database-tests.sh all

# Run specific test categories
./scripts/run-database-tests.sh unit           # Unit tests only
./scripts/run-database-tests.sh sqlite        # SQLite integration
./scripts/run-database-tests.sh postgres      # PostgreSQL integration  
./scripts/run-database-tests.sh performance   # Performance tests
```

### Environment Variables

```bash
# Test Configuration
NODE_ENV=test                    # Automatically set by test runner
TEST_MODE=true                   # Enables test-specific behaviors
DB_PATH=:memory:                 # SQLite in-memory for speed

# PostgreSQL Configuration (for integration tests)
DATABASE_URL=postgresql://user:pass@host:port/db
# Or individual components:
PGHOST=localhost
PGPORT=5432
PGUSER=test_user
PGPASSWORD=test_password
PGDATABASE=test_db

# Performance Testing
RUN_PERFORMANCE_TESTS=true      # Enable resource-intensive tests
```

## 📊 Test Coverage and Quality Gates

### Coverage Requirements

| Component | Line Coverage | Branch Coverage | Critical Path Coverage |
|-----------|---------------|-----------------|----------------------|
| **Core Database Classes** | ≥90% | ≥85% | 100% |
| **Migration Scripts** | 100% | 100% | 100% |
| **Error Handlers** | ≥95% | ≥90% | 100% |
| **Data Models** | ≥90% | ≥80% | 100% |

### Quality Gates

✅ **All tests must pass before deployment**  
✅ **No console errors or warnings during test execution**  
✅ **Memory usage stays under 500MB during test runs**  
✅ **Database connections properly closed after each test**  
✅ **No test database artifacts left behind**

## 🏗️ Architecture and Design Patterns

### Test Database Strategy

```typescript
// Mock Database for Unit Tests
export class MockGraderDB {
  private runs: Array<any> = [];
  private connected = false;
  
  async connect() { this.connected = true; }
  async insertRun(run, checkpoints, findings) { /* in-memory storage */ }
  async getHistory(apiId, limit, since) { /* filtered results */ }
}

// Real Database Integration Tests
describe('PostgreSQL Integration', () => {
  let testDbName: string;
  let graderDB: GraderDB;
  
  beforeAll(async () => {
    // Create isolated test database
    testDbName = `test_${Date.now()}`;
    await createTestDatabase(testDbName);
  });
  
  afterAll(async () => {
    // Clean up test database
    await dropTestDatabase(testDbName);
  });
});
```

### Multi-Tenant Testing Pattern

```typescript
describe('Team-Based Data Isolation', () => {
  it('should isolate data between teams', async () => {
    const team1 = 'team-alpha';
    const team2 = 'team-beta';
    
    // Insert data for both teams with same API ID
    await graderDB.insertRun({...run, team_id: team1}, [], []);
    await graderDB.insertRun({...run, team_id: team2}, [], []);
    
    // Verify complete isolation
    const team1History = await graderDB.getHistory(apiId, 20, undefined, team1);
    const team2History = await graderDB.getHistory(apiId, 20, undefined, team2);
    
    expect(team1History).toHaveLength(1);
    expect(team2History).toHaveLength(1);
    // Data never leaks between teams
  });
});
```

## 🎯 Specific Test Scenarios

### 1. Unit Tests - Data Model Validation

**File**: `test/unit/persistence/db.test.ts`

**Key Scenarios**:
- RunRow data model validation (required vs optional fields)
- PostgreSQL vs SQLite data type differences  
- JSON report structure validation
- Numeric field constraint checking
- Interface contract compliance

**Example**:
```typescript
it('should validate required fields for SQLite RunRow', () => {
  const validRun: SqliteRunRow = {
    run_id: 'test-run-id',
    api_id: 'test-api-id',
    graded_at: '2024-01-01T12:00:00Z',
    // ... all required fields
    auto_fail: 0, // Integer in SQLite
    json_report: JSON.stringify({ score: 85 })
  };
  
  expect(validRun.run_id).toBeDefined();
  expect(typeof validRun.auto_fail).toBe('number');
});
```

### 2. SQLite Integration Tests

**File**: `test/integration/database-sqlite.test.ts`

**Key Scenarios**:
- WAL mode configuration and performance benefits
- File-based database persistence across connections
- Transaction rollback on constraint violations
- Concurrent read operations (WAL mode advantage)
- In-memory database for testing speed

**Example**:
```typescript
it('should handle concurrent reads efficiently', async () => {
  // WAL mode allows multiple concurrent readers
  const concurrentReads = Array.from({ length: 5 }, () =>
    graderDB.getHistory(apiId, 5)
  );
  
  const results = await Promise.all(concurrentReads);
  expect(results).toHaveLength(5);
  results.forEach(result => expect(result).toHaveLength(5));
});
```

### 3. PostgreSQL Integration Tests  

**File**: `test/integration/database-postgres.test.ts`

**Key Scenarios**:
- Multi-tenant data isolation (team_id filtering)
- Usage tracking and team-based analytics  
- Connection pooling under high load
- Foreign key constraint enforcement
- JSONB operations and indexing
- Concurrent write operations

**Example**:
```typescript
it('should prevent cross-team data access', async () => {
  // Insert run for team1
  await graderDB.insertRun({...run, team_id: team1}, [], []);
  
  // team2 should see no results for same API
  const team2Results = await graderDB.getHistory('secure_api', 20, undefined, team2);
  expect(team2Results).toHaveLength(0);
  
  // team1 can access their own data
  const team1Results = await graderDB.getHistory('secure_api', 20, undefined, team1);
  expect(team1Results).toHaveLength(1);
});
```

### 4. Migration Tests

**File**: `test/integration/migrations.test.ts`

**Key Scenarios**:
- Schema creation and table structure validation
- Index creation for performance optimization
- Foreign key relationship establishment
- Migration idempotency (safe to run multiple times)
- Cross-database migration consistency
- Development vs production environment differences

**Example**:
```typescript
it('should create proper foreign key constraints', async () => {
  await graderDB.migrate();
  
  const foreignKeys = await getForeignKeyConstraints();
  
  expect(foreignKeys).toContainEqual({
    table_name: 'run',
    column_name: 'api_id', 
    foreign_table_name: 'api',
    foreign_column_name: 'api_id'
  });
});
```

### 5. Performance Tests

**File**: `test/integration/database-performance.test.ts`

**Key Scenarios**:
- Single insert performance (< 100ms target)
- Bulk insert throughput (< 5ms per record)
- Large dataset query performance (< 1000ms)
- Concurrent operation handling (< 5000ms for 10 ops)
- Connection pool stress testing
- Memory usage under load

**Example**:
```typescript
it('should handle bulk inserts efficiently', async () => {
  const recordCount = 50;
  const testData = generateLargeRunData(recordCount, apiId);
  
  const startTime = performance.now();
  for (const run of testData) {
    await graderDB.insertRun(run, checkpoints, findings);
  }
  const duration = performance.now() - startTime;
  
  const avgTimePerRecord = duration / recordCount;
  expect(avgTimePerRecord).toBeLessThan(5); // 5ms per record threshold
});
```

### 6. Error Handling Tests

**File**: `test/integration/database-error-handling.test.ts`

**Key Scenarios**:
- Connection timeout and retry mechanisms
- Transaction rollback on constraint violations
- Resource exhaustion handling (connection pool, memory)  
- Database corruption detection and recovery
- Deadlock detection and resolution
- Network interruption during operations

**Example**:
```typescript
it('should rollback on constraint violations', async () => {
  const invalidRun = {
    ...validRun,
    team_id: 'non_existent_team' // FK violation
  };
  
  await expect(graderDB.insertRun(invalidRun, [], [])).rejects.toThrow();
  
  // Verify complete rollback - no partial data inserted
  const apis = await query('SELECT * FROM api WHERE api_id = $1', [invalidRun.api_id]);
  expect(apis.rows).toHaveLength(0);
});
```

## 🚀 Performance Benchmarks

### Target Performance Metrics

| Operation | SQLite Target | PostgreSQL Target | Measurement |
|-----------|---------------|-------------------|-------------|
| **Single Insert** | < 50ms | < 100ms | End-to-end with checkpoints/findings |
| **Bulk Insert (50 records)** | < 10s | < 5s | Sequential vs concurrent |
| **History Query (20 results)** | < 100ms | < 200ms | With team filtering |
| **Large Dataset (1000 records)** | < 500ms | < 1000ms | Query with pagination |
| **Concurrent Ops (10 parallel)** | N/A (single writer) | < 5000ms | Mixed read/write operations |

### Memory Usage Targets

- Test execution memory usage: < 500MB
- Individual test memory footprint: < 50MB  
- No memory leaks between test runs
- Proper cleanup of database connections

## 🔧 Troubleshooting

### Common Issues

**❌ PostgreSQL tests failing with connection errors**
```bash
# Check PostgreSQL is running
pg_ctl status

# Create test database manually
createdb api_grader_test

# Set connection environment
export DATABASE_URL="postgresql://localhost/api_grader_test"
```

**❌ SQLite tests failing with file permission errors**
```bash
# Ensure write permissions in project directory
chmod 755 .
ls -la *.sqlite  # Should not exist after test cleanup

# Run with debugging
DEBUG=true npm run test:integration
```

**❌ Performance tests taking too long**
```bash
# Reduce test dataset sizes in CI
export CI=true

# Skip performance tests in development
unset RUN_PERFORMANCE_TESTS
```

**❌ Coverage not meeting thresholds**
```bash
# Generate detailed coverage report
npm run test:coverage

# Check which files need more coverage
open coverage/index.html
```

### Debug Commands

```bash
# Run single test file with debugging
npx jest test/integration/database-postgres.test.ts --verbose --no-coverage

# Run with database query logging  
DEBUG=db:query npm test

# Run performance tests only
RUN_PERFORMANCE_TESTS=true npx jest database-performance

# Check for test database cleanup
ls -la | grep -E '\.(sqlite|db)$'  # Should be empty after tests
```

## 📈 Continuous Integration

### CI Pipeline Integration

```yaml
# Example GitHub Actions configuration
name: Database Tests
on: [push, pull_request]

jobs:
  database-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test_password
          POSTGRES_USER: test_user
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run database tests
        run: ./scripts/run-database-tests.sh all
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/test_db
          
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          directory: ./coverage
```

### Quality Gates

- All database tests must pass
- Coverage must meet minimum thresholds (90%+ for persistence layer)
- No performance regressions (benchmarks tracked)
- No memory leaks detected
- All database connections properly closed

## 🚀 Advanced Testing Patterns

### Contract-First Testing

```typescript
// Test the database interface contracts before implementation
describe('Database Interface Contracts', () => {
  it('should implement required methods with proper signatures', () => {
    const db = new GraderDB();
    
    expect(typeof db.connect).toBe('function');
    expect(typeof db.insertRun).toBe('function');
    expect(typeof db.getHistory).toBe('function');
    
    // Verify async nature
    expect(db.connect.constructor.name).toBe('AsyncFunction');
  });
});
```

### Property-Based Testing

```typescript
// Test with randomly generated data to find edge cases
describe('Property-Based Data Validation', () => {
  it('should handle various score ranges correctly', () => {
    fc.assert(fc.property(
      fc.integer(0, 100),
      fc.float(0, 1),
      (score, compliance) => {
        const run = createRunWithScore(score, compliance);
        expect(run.total_score).toBeGreaterThanOrEqual(0);
        expect(run.total_score).toBeLessThanOrEqual(100);
        expect(Math.abs(score/100 - compliance)).toBeLessThan(0.01);
      }
    ));
  });
});
```

### Mutation Testing

```typescript
// Verify that tests actually catch errors by introducing deliberate bugs
describe('Test Effectiveness Validation', () => {
  it('should detect data corruption', async () => {
    const validRun = createValidRun();
    await graderDB.insertRun(validRun, [], []);
    
    // Deliberately corrupt data
    const corruptedData = {...validRun, total_score: null};
    await expect(graderDB.insertRun(corruptedData, [], [])).rejects.toThrow();
  });
});
```

## 📚 Additional Resources

### Database Schema Documentation
- [PostgreSQL Schema Definition](src/mcp/persistence/db-postgres.ts#L57-L139)
- [SQLite Schema Definition](src/mcp/persistence/db.ts#L33-L80) 
- [Migration Scripts](src/mcp/persistence/migrations/)

### Performance Optimization Guides
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [SQLite Optimization](https://sqlite.org/optoverview.html)
- [Node.js Database Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)

### Testing Best Practices
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)
- [Database Testing Strategies](https://martinfowler.com/articles/databaseTesting.html)
- [Integration vs Unit Testing](https://martinfowler.com/bliki/IntegrationTest.html)

---

## 🤝 Contributing to Database Tests

### Adding New Tests

1. **Identify the test category** (unit, integration, performance, error handling)
2. **Follow naming conventions** (`*.test.ts` for test files)
3. **Use existing helpers** (mock factories, database helpers)
4. **Ensure proper cleanup** (close connections, remove temp files)
5. **Add performance expectations** where applicable
6. **Document complex test scenarios** with comments

### Test Review Checklist

- [ ] Tests cover both happy path and error scenarios
- [ ] Multi-tenant isolation verified where applicable  
- [ ] Database connections properly managed
- [ ] No hardcoded values (use configuration/environment)
- [ ] Performance benchmarks included for new features
- [ ] Error messages are descriptive and actionable
- [ ] Test data cleanup after completion

---

**Last Updated**: 2024-01-10  
**Test Coverage**: 90%+ (persistence layer)  
**Performance Verified**: PostgreSQL + SQLite  
**Multi-Tenant Security**: ✅ Verified