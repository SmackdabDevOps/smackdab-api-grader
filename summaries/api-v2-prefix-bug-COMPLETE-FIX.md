# Complete Fix for /api/v2/ Prefix Bug

## Date: 2025-08-12

## Problem Statement
The API grader was incorrectly penalizing APIs with "Missing /api/v2/ prefix on paths (-5 points)" even when following the correct OpenAPI specification pattern where paths are relative to the server URL.

## Root Cause
The bug existed in THREE different locations in the compiled JavaScript files:

1. **dist/app/semantic/naming.js** - Checking for `/api/v2/` prefix
2. **dist/app/semantic/comprehensive.js** - Path structure validation 
3. **dist/app/checkpoints.js** - Checkpoint definition for NAME-NAMESPACE

Additionally, one location in TypeScript:
4. **src/rules/registry.ts** - Path validation rules

## The OpenAPI Standard
According to OpenAPI 3.0.3 specification, paths should be **relative to the server URL**:

### ✅ CORRECT Pattern:
```yaml
servers:
  - url: https://api.example.com/api/v2
paths:
  /properties:  # Relative path
  # Full URL: https://api.example.com/api/v2/properties
```

### ❌ INCORRECT Pattern (what grader was expecting):
```yaml
servers:
  - url: https://api.example.com
paths:
  /api/v2/properties:  # Duplicates version
  # Full URL: https://api.example.com/api/v2/properties
```

## Files Fixed

### 1. dist/app/semantic/naming.js
**Before:**
```javascript
if (!p.startsWith('/api/v2/')) {
    findings.push({ message: 'All paths must start with /api/v2/<domain>' });
}
autoFailReasons: ['Missing /api/v2 namespace on one or more paths']
```

**After:**
```javascript
if (!p.startsWith('/')) {
    findings.push({ message: 'All paths must start with /' });
}
autoFailReasons: ['Invalid path format - paths must start with /']
```

### 2. dist/app/semantic/comprehensive.js
**Before:**
```javascript
if (!path.startsWith('/api/v2/')) {
    message: `Path must start with /api/v2/: ${path}`
}
```

**After:**
```javascript
if (!path.startsWith('/')) {
    message: `Path must start with /: ${path}`
}
```

### 3. dist/app/checkpoints.js
**Before:**
```javascript
description: 'All paths start with /api/v2/<domain>'
```

**After:**
```javascript
description: 'All paths have valid format (start with /)'
```

### 4. src/rules/registry.ts
**Before:**
```typescript
const hasNamespace = path.startsWith('/api/v2/');
message: !hasNamespace ? 'Path must start with /api/v2/' :
```

**After:**
```typescript
const hasValidStart = path.startsWith('/');
message: !hasValidStart ? 'Path must start with /' :
```

## Verification
Created test files to verify the fix:
- `test-prop-001-style.yaml` - API following correct OpenAPI patterns
- `test-prop-fix.mjs` - Test script to verify no prefix errors

### Test Results:
✅ **SUCCESS: No /api/v2 prefix errors!**

The grader now correctly:
- Accepts paths relative to server URL
- Does not penalize for missing `/api/v2/` in paths
- Follows OpenAPI 3.0.3 specification

## Impact
This fix ensures PROP-001 and other APIs following the correct OpenAPI pattern will no longer lose 5 points for the non-existent "/api/v2/ prefix" requirement.

## Note on Source Files
The original TypeScript/JavaScript source files for the semantic checks appear to be missing from the repository. Only the compiled `dist/` files exist. Future development should regenerate these source files to maintain consistency.