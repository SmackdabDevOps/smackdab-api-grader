# Simple API Contract Grader

## Overview
A lightweight CLI tool for grading OpenAPI 3.0.3 specifications against Smackdab's API standards. This tool implements the 50-checkpoint grading system for internal team use.

## Installation
```bash
# Install minimal dependencies
npm install js-yaml
```

## Usage
```bash
# Grade an API specification
node simple-grader.js <path-to-openapi-spec.yaml>

# Example
node simple-grader.js test-api.yaml
```

## Output
- **Console Output**: Color-coded grading results with pass/fail for each checkpoint
- **JSON Report**: Detailed findings saved to `{filename}-grade-report.json`

## Grading System
- **Total Points**: 100
- **50 Checkpoints**: Covering OpenAPI, Security, Multi-tenancy, HTTP, Caching, Pagination, etc.
- **Auto-Fail Conditions**: Certain critical failures result in automatic F grade (59 max)
- **Letter Grades**: A+ (97+), A (93+), A- (90+), B+ (87+), B (83+), B- (80+), C (70+), D (60+), F (<60)

## Key Standards Checked

### Critical (Auto-Fail)
- ✅ OpenAPI version 3.0.3
- ✅ X-Organization-ID header on all operations
- ✅ Key-set pagination (not offset/cursor)
- ✅ Proper envelope structure
- ✅ RFC 7807 error responses

### Important
- X-Branch-ID header support
- OAuth2 security with proper scopes
- ETag/caching headers
- Rate limiting headers
- Async job patterns
- Webhook security

## Quick Implementation Status
Currently, the simple grader implements basic checks for:
- OpenAPI version validation
- Organization/Branch header presence
- Pagination parameter detection
- Basic structure validation

Most advanced checks return "Not implemented in quick grader" but the framework is ready for expansion.

## Test Files
- `test-api.yaml` - Sample API spec for testing (scores 4/100 due to offset pagination)
- `MASTER_API_TEMPLATE_v3.yaml` - The gold standard template (in .claude/templates/)

## Limitations
This is a simplified version for internal use. For production-grade grading with full validation:
1. Implement remaining checkpoint validations
2. Add proper OpenAPI schema validation
3. Integrate with CI/CD pipeline
4. Add database persistence for tracking

## Next Steps for Team Use
1. Test with your actual API specifications
2. Identify which checkpoints are most critical for your team
3. Gradually implement missing validations as needed
4. Consider integrating into your API development workflow