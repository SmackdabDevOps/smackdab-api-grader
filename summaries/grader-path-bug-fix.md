# Grader Path Bug Fix Summary

## Date: 2025-08-12

## Issue Identified
The API grader was incorrectly penalizing APIs that follow the correct OpenAPI specification pattern for paths.

## The Bug
In `/src/rules/registry.ts`, the grader was requiring paths to start with `/api/v2/`:
```typescript
const hasNamespace = path.startsWith('/api/v2/');
message: !hasNamespace ? 'Path must start with /api/v2/' :
```

This is **incorrect** according to the OpenAPI specification.

## OpenAPI Standard
According to the OpenAPI specification, paths should be **relative to the server URL**.

### Correct Pattern (OpenAPI compliant):
```yaml
servers:
  - url: https://api.example.com/api/v2
paths:
  /products:  # Relative to server URL
  # Full URL: https://api.example.com/api/v2/products
```

### Incorrect Pattern (what the grader was expecting):
```yaml
servers:
  - url: https://api.example.com
paths:
  /api/v2/products:  # Duplicating version in path
  # Full URL: https://api.example.com/api/v2/products
```

## Files Fixed
1. `/src/rules/registry.ts`:
   - Line 1019-1030: Changed validation to check paths start with `/` instead of `/api/v2/`
   - Line 330: Updated path pattern regex from `/api/v\\d+/${resource}` to `/${resource}`
   - Line 315-317: Updated example paths from `/api/v2/${resource}` to `/${resource}`
   - Line 112: Updated comment example from `/api/v2/users` to `/users`

## Impact
This fix ensures the grader correctly validates APIs that follow the OpenAPI standard where:
- The API version is included in the server URL
- Paths are relative to the server URL
- No duplication of versioning information

## Test Files Created
- `test-api-correct-paths.yaml`: Example API following correct OpenAPI patterns

## Evidence from Codebase
The codebase had conflicting examples:
- `improved-inventory-sample.yaml`: Correctly uses relative paths with version in server URL
- `sample-inventory-api.yaml`: Incorrectly duplicates `/api/v2/` in paths

The fix aligns the grader with the OpenAPI specification and best practices.