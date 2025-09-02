# Complete List of Identified Bugs in API Grader

## Status: 2025-08-12

## 🔴 Critical Bugs (Break functionality)

### 1. ✅ FIXED - Caching Issue
**Symptom:** Grader returns same results even after API changes
**Cause:** Missing spec hash comparison, getApiHistory method not implemented
**Impact:** Users can't see improvements after fixing issues
**Status:** FIXED - Added spec hash checking and cache methods

### 2. ✅ FIXED - Path Validation Bug  
**Symptom:** Penalizes APIs with -5 points for "Missing /api/v2/ prefix on paths"
**Cause:** Incorrect validation requiring /api/v2/ in paths instead of server URL
**Impact:** All properly formatted APIs lose 5 points incorrectly
**Status:** FIXED - Updated validation in 4 files

### 3. ❌ ACTIVE - Missing Source Files
**Symptom:** Only compiled JS exists, no TypeScript source for semantic rules
**Cause:** Source files not included or were deleted
**Impact:** Can't properly maintain or update semantic rules
**Files Missing:**
- `src/app/semantic/*.ts`
- `src/app/checkpoints.ts`
- `src/app/pipeline.ts`
- `src/app/tracking/*.ts`

### 4. ❌ ACTIVE - TypeScript Compilation Errors
**Symptom:** `npm run build` fails with 60+ errors
**Cause:** Zod type mismatches, missing imports, incorrect types
**Impact:** Can't rebuild project after changes
**Key Issues:**
- Zod schema type errors in MCP server files
- Missing module imports for tracking components
- Type mismatches in REST server

---

## 🟡 Major Bugs (Wrong behavior)

### 5. ❌ ACTIVE - Duplicate Scoring
**Symptom:** Some rules appear to score multiple times
**Evidence:** Comprehensive.js and individual semantic checks may overlap
**Impact:** Incorrect total scores, confusing results

### 6. ❌ ACTIVE - Prerequisite Blocking
**Symptom:** Single prerequisite failure gives 0 score
**Example:** Invalid x-api-id format blocks ALL scoring
**Impact:** Can't see partial progress, all-or-nothing scoring

### 7. ❌ ACTIVE - Module Import Errors
**Symptom:** ESM vs CommonJS conflicts
**Evidence:** `require is not defined in ES module scope` errors
**Impact:** Scripts and tests fail to run

### 8. ❌ ACTIVE - Missing Rule Registry Entries
**Symptom:** "Prerequisite rule PREREQ-API-ID not found in registry"
**Cause:** Rules referenced but not defined in registry
**Impact:** Incomplete rule validation

---

## 🟠 Minor Bugs (Poor UX)

### 9. ❌ ACTIVE - Unhelpful Error Messages
**Symptom:** Messages like "Missing X-Organization-ID header" with no context
**Missing Info:**
- WHERE the issue is (path, line)
- HOW to fix it (code example)
- WHY it matters

### 10. ❌ ACTIVE - Auto-fail Too Aggressive
**Symptom:** Minor issues trigger auto-fail
**Example:** Missing pagination = F grade
**Impact:** Discourages incremental improvement

### 11. ❌ ACTIVE - No Partial Credit
**Symptom:** Binary pass/fail on rules
**Example:** 9/10 endpoints correct = 0 points
**Impact:** Doesn't reflect actual quality

### 12. ❌ ACTIVE - Inconsistent Rule Application
**Symptom:** Same issue, different penalties in different places
**Example:** Path structure checked in multiple files with different scoring

---

## 🔵 Enhancement Requests (Not bugs, but needed)

### 13. No Configuration Options
**Need:** Different API styles need different rules
**Example:** GraphQL vs REST vs gRPC

### 14. No Progress Tracking
**Need:** Show improvement over time
**Current:** Each grade is isolated

### 15. No Quick Wins Section
**Need:** Show easiest improvements first
**Current:** All issues listed equally

---

## Bug Priority Matrix

### Fix Immediately (This Week):
1. **Missing Source Files** - Can't maintain without them
2. **TypeScript Compilation** - Can't build project
3. **Module Import Errors** - Can't run scripts

### Fix Soon (Next Week):
4. **Prerequisite Blocking** - Makes grader unusable
5. **Duplicate Scoring** - Gives wrong scores
6. **Unhelpful Error Messages** - Users can't fix issues

### Fix Eventually:
7. **Auto-fail Too Aggressive** - Adjust thresholds
8. **No Partial Credit** - Add proportional scoring
9. **Missing Registry Entries** - Add missing rules

---

## Verification Tests Needed

```javascript
// Test: Path validation fixed
test('accepts relative paths with version in server URL', () => {
  const api = {
    servers: [{ url: 'https://api.example.com/api/v2' }],
    paths: { '/products': {} }
  };
  const result = grade(api);
  expect(result.findings).not.toContainEqual(
    expect.objectContaining({ message: expect.stringContaining('/api/v2') })
  );
});

// Test: No duplicate scoring
test('rules only score once', () => {
  const result = grade(testAPI);
  const ruleIds = result.checkpoints.map(c => c.rule_id);
  const unique = new Set(ruleIds);
  expect(ruleIds.length).toBe(unique.size);
});

// Test: Partial credit works
test('gives partial credit for partial compliance', () => {
  const api = createAPIWithNineOfTenEndpointsCorrect();
  const result = grade(api);
  expect(result.score).toBeGreaterThan(0);
  expect(result.score).toBeLessThan(100);
});
```

---

## Root Causes

1. **No Source Control** - Compiled JS edited directly
2. **No Test Suite** - Changes break things silently  
3. **Big Bang Changes** - Phase 2 tried to change everything
4. **No Documentation** - Rules not clearly explained
5. **No User Feedback Loop** - Don't know what's actually needed

---

## Action Plan

### Day 1: Recovery
- [ ] Recreate TypeScript source from JS
- [ ] Fix compilation errors
- [ ] Set up proper build pipeline

### Day 2: Testing
- [ ] Create test suite for each bug
- [ ] Add regression tests
- [ ] Document expected behavior

### Day 3-5: Fix Priority Bugs
- [ ] Fix prerequisite blocking
- [ ] Fix duplicate scoring
- [ ] Improve error messages

### Week 2: Stabilization
- [ ] Add configuration options
- [ ] Add partial credit
- [ ] Document all rules

---

## Success Metrics

- ✅ All TypeScript compiles without errors
- ✅ Test suite passes 100%
- ✅ No false positives on reference APIs
- ✅ Error messages include fix instructions
- ✅ Scores are predictable and consistent