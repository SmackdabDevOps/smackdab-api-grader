# Immediate Critical Fixes - Start Here

## Fix #1: Remove Global Crypto Mock (MOST CRITICAL)
This is breaking ALL tests that use crypto (fixesEngine, auth, etc.)

### File: `test/helpers/setup.ts`
**Problem**: Global crypto mock is interfering with actual crypto usage
**Solution**: Comment out or remove lines 26-34

```typescript
// REMOVE OR COMMENT OUT THESE LINES:
// Mock crypto for deterministic tests
// Object.defineProperty(global, 'crypto', {
//   value: {
//     randomBytes: jest.fn((size: number) => Buffer.alloc(size, 'test')),
//     createHash: jest.fn(() => ({
//       update: jest.fn().mockReturnThis(),
//       digest: jest.fn(() => 'mocked-hash-value'),
//     })),
//   },
// });
```

## Fix #2: Fix Crypto Import in fixesEngine
The crypto import is correct but being overridden by global mock

### File: `src/app/fixes/fixesEngine.ts`
**Current Line 20**: Already correct!
```typescript
function sha(s:string){ return crypto.createHash('sha256').update(s).digest('hex'); }
```
This will work once global mock is removed.

## Fix #3: Fix YamlLoader Test Pattern
Tests are passing YAML content as if it's a file path

### File: `test/unit/app/io/yamlLoader.test.ts`
**Add proper mocking at the top of the test file**:
```typescript
// Mock fs to return content when path is requested
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(`
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
`)
}));
```

## Fix #4: Fix Rate Limiting Tests
API keys not initialized properly

### File: `test/unit/auth/rate-limiting.test.ts`
**Add proper API key setup in beforeEach**:
```typescript
beforeEach(() => {
  // Clear API keys before each test
  getApiKeys().clear();
  
  // ADD THIS: Initialize a test API key
  getApiKeys().set('test-api-key', {
    teamId: 'test-team',
    userId: 'test-user'
  });
  
  // Then use this key in your mock requests:
  mockRequest = createMockRequest({
    authorization: 'Bearer test-api-key'
  });
  
  // ... rest of setup
});
```

## Fix #5: Fix Import Issues in Tests
Many tests have incorrect imports due to ESM

### Pattern to fix across all test files:
```typescript
// WRONG:
import { something } from '../../../src/module';

// CORRECT (add .js extension):
import { something } from '../../../src/module.js';
```

## Test These Fixes

After applying these fixes, test in this order:

```bash
# 1. Test that crypto is working
npm test -- test/unit/app/fixes/fixesEngine.test.ts

# 2. Test that yamlLoader is working  
npm test -- test/unit/app/io/yamlLoader.test.ts

# 3. Test that auth is working
npm test -- test/unit/auth/rate-limiting.test.ts

# 4. If all above pass, run all tests
npm test
```

## Expected Results After These Fixes

1. **fixesEngine tests**: Should pass (crypto will work)
2. **yamlLoader tests**: Should pass (proper mocking)
3. **rate-limiting tests**: Should mostly pass (might need timing adjustments)
4. **Overall**: ~20-30 tests should start passing

## If These Don't Work

1. Check if there are multiple versions of modules installed
2. Clear Jest cache: `npx jest --clearCache`
3. Check Node version: Should be 18+ for crypto
4. Check if tests are running in correct environment: `NODE_ENV=test`

## Next Priority After These Work

1. Fix semantic rule tests (scoring calculations)
2. Fix database initialization in integration tests
3. Fix MCP protocol mocking
4. Clean up duplicate test files