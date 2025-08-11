# 🧹 Cleanup Report - DRY RUN

**Date**: 2025-08-10  
**Type**: Comprehensive Analysis (all)  
**Mode**: Safe (dry-run)  
**Target**: /Users/brooksswift/Desktop/Smackdab/api-grader-mcp-starter

## 📊 Summary

This is a **dry-run** analysis. No changes have been made to the project.

### Statistics
- **Files Analyzed**: 42 TypeScript files, 17 test files, 4 CommonJS files
- **Dependencies**: 19 production, 3 development
- **Potential Issues**: 15 items identified
- **Estimated Cleanup Impact**: ~20% reduction in unnecessary files

## 🔍 Findings

### 1. Unused Dependencies ⚠️
**Risk Level**: Low  
**Action**: Remove from package.json

- **minimatch** - No imports found in any TypeScript files
  - Recommendation: Remove unless used in JavaScript files

### 2. Type Dependencies in Production 🚨
**Risk Level**: Medium  
**Action**: Move to devDependencies

The following TypeScript type packages are in production dependencies but should be in devDependencies:
- `@types/cors`
- `@types/express`
- `@types/node-fetch`
- `@types/pg`

```json
// Move these from "dependencies" to "devDependencies":
"@types/cors": "^2.8.19",
"@types/express": "^5.0.3",
"@types/node-fetch": "^2.6.13",
"@types/pg": "^8.15.5",
```

### 3. Obsolete Files 📁
**Risk Level**: Low  
**Action**: Consider removal after verification

#### Legacy CommonJS Grader Files
- `comprehensive-grader.cjs` - Appears to be version 1
- `comprehensive-grader-v2.cjs` - Superseded by v3
- `comprehensive-grader-v3.cjs` - Latest, but may be obsolete with TypeScript implementation
- **Recommendation**: Archive or remove if TypeScript implementation is complete

#### Backup/Old Files
- `package-old.json` - Backup file, no longer needed
- **Recommendation**: Remove

#### Debug/Test Files (Production)
- `debug-func002.js` - Debug file in root
- `simple-grader.js` - Appears to be an old implementation
- **Recommendation**: Move to test directory or remove

### 4. Test Files Organization 🧪
**Risk Level**: Low  
**Action**: Reorganize for clarity

Currently 17 test files in root directory:
```
test-*.js (10 files)
test-*.ts (3 files)  
test-*.sh (4 files)
test-mcp.cjs (1 file)
```

**Recommendation**: Create `tests/` directory structure:
```
tests/
├── unit/       # Unit tests
├── integration/  # Integration tests
├── e2e/        # End-to-end tests
└── scripts/    # Test scripts
```

### 5. Deployment Scripts Cleanup 🚀
**Risk Level**: Low  
**Action**: Consolidate or document

Multiple deployment-related scripts remain:
- `DEPLOY_TO_RENDER.sh`
- `RENDER_FINAL_DEPLOY.sh`
- `monitor-deployment.sh`
- `grade-mock-api.sh`
- `rebuild-mcp.sh`

**Recommendation**: Move to `scripts/` directory and document purpose

### 6. Sample/Report Files 📄
**Risk Level**: Low  
**Action**: Move to appropriate directories

JSON report files in root:
- `improved-inventory-sample-comprehensive-report.json`
- `improved-inventory-sample-grade-report.json`
- `test-api-grade-report.json`
- `render-deploy.json`

YAML test files in root:
- `improved-inventory-sample.yaml`
- `test-api.yaml`

**Recommendation**: Move to `samples/` or `test-data/` directory

### 7. Code Quality Issues 💻
**Risk Level**: Low  
**Action**: Address in next iteration

- **TODO Comment**: `src/app/io/yamlLoader.ts:7` - "implement jsonPath -> line mapping"
- **Empty Directory**: `src/reporters/` - No files present

### 8. SSE Server Variants 🔄
**Risk Level**: Medium  
**Action**: Document differences or consolidate

Three SSE server implementations exist:
- `server-sse.ts` (referenced as "old" in package.json)
- `server-sse-simple.ts` (default production)
- `server-sse-direct.ts` (alternative production)

**Recommendation**: Document the purpose of each or consolidate into one configurable implementation

## 🎯 Recommended Actions (Priority Order)

### High Priority
1. **Move type dependencies** to devDependencies (4 packages)
2. **Remove `package-old.json`** backup file
3. **Remove debug file** `debug-func002.js`

### Medium Priority
4. **Organize test files** into `tests/` directory structure
5. **Document or consolidate** SSE server implementations
6. **Move sample files** to appropriate directories

### Low Priority
7. **Archive legacy CJS files** after verifying TypeScript implementation
8. **Create `scripts/` directory** for deployment scripts
9. **Remove unused dependency** `minimatch` if confirmed unused
10. **Address TODO comment** in yamlLoader.ts

## 📈 Expected Impact

After implementing these recommendations:
- **Cleaner root directory**: ~20 files moved/removed
- **Smaller package size**: 4 type packages moved to dev dependencies
- **Better organization**: Clear separation of tests, scripts, and samples
- **Improved maintainability**: Consolidated implementations and clear structure

## 🛡️ Safety Notes

This is a **dry-run report**. Before implementing:
1. **Backup the project** or ensure git is up to date
2. **Test after each change** to ensure nothing breaks
3. **Verify CJS files** are not used before removal
4. **Check CI/CD pipelines** for script dependencies

## 💡 Next Steps

To apply these changes:
1. Review this report with the team
2. Prioritize changes based on project needs
3. Run without `--dry-run` flag to apply changes
4. Or manually implement selected recommendations

---

*Generated by sc:cleanup tool - No changes have been applied*