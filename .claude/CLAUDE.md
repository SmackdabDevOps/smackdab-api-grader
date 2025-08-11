# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Smackdab API Contract Grader — MCP Edition**

This is an MCP (Model Context Protocol) server that grades OpenAPI specifications against Smackdab standards. It works as a service for other agents like Qodo or Claude Desktop. The system provides comprehensive API contract validation with scoring, fixes suggestions, and persistence.

### ⚠️ CRITICAL: LOCAL vs PRODUCTION DEPLOYMENT

**There are TWO versions of this application:**

1. **LOCAL VERSION** (`http://localhost:3000`)
   - FOR TESTING ONLY
   - Started with: `npm start` or `npm run dev`
   - Changes here DO NOT affect production
   - Use only for development and testing

2. **PRODUCTION VERSION** (`https://smackdab-api-grader.onrender.com`)
   - HOSTED ON RENDER
   - This is what Claude Desktop and other MCP clients use
   - ALL CHANGES MUST BE DEPLOYED HERE
   - Auto-deploys on push to master branch
   - Service ID: srv-d2bk12be5dus738am0pg

**⚠️ IMPORTANT: When making changes:**
1. Test locally first
2. Commit and push to master branch
3. Render will auto-deploy to production
4. Changes are NOT live until Render deployment completes
5. Check deployment status at: https://dashboard.render.com

### Current Status
- **Production Deployment**: Hosted on Render (PAID tier)
- **Test Coverage**: Partial test failures exist but core functionality works
- **Main Branch**: master
- **Version**: 1.3.0

## Architecture Overview

The system has two main entry points:

1. **MCP Server (stdio)**: `src/mcp/server.ts` - Standard MCP server for local development
2. **SSE Server (HTTP)**: `src/mcp/server-sse-simple.ts` - Production SSE-based server for web deployments (current production)

The grading pipeline (`src/app/pipeline.ts`) orchestrates multiple validation stages:
- OpenAPI validation
- Spectral linting
- Semantic checks (comprehensive rules)
- Scoring (coverage-based or legacy binary)
- Fix suggestions

## Common Commands

```bash
# Install dependencies
npm install  # or pnpm install

# Build and typecheck
npm run build

# Run MCP server locally
npm run dev

# Run SSE server for production
npm start  # Runs server-sse-simple.ts on PORT 3000/3001

# Run tests
npm test
npm run test:watch  # Watch mode
npm run test:coverage  # Coverage report

# Run database migrations
npm run migrate  # Unified migration
npm run migrate:postgres  # PostgreSQL only
npm run migrate:sqlite  # SQLite only

# Generate API key
npm run generate-key
```

## Key Components

### Grading Pipeline
- **Entry**: `src/app/pipeline.ts:gradeContract()` - Main grading orchestrator
- **Stages**:
  1. Prerequisites check
  2. OpenAPI validation
  3. Spectral linting
  4. Semantic validation
  5. Scoring (binary or coverage-based)
  6. Fix suggestions
- **Scoring**: Two engines available - legacy binary scoring or coverage-based scoring (controlled by `USE_LEGACY_SCORING` env var)
- **Template**: Uses YAML template at `templates/MASTER_API_TEMPLATE_v3.yaml` or path specified via `TEMPLATE_PATH`

### MCP Tools (Exposed via SSE server)
The simplified SSE server currently exposes:
- `version` - Get grader version info
- `list_checkpoints` - List all grading checkpoints  
- `grade_contract` - Grade an OpenAPI file (base64 or URL)

Full MCP server (`src/mcp/server.ts`) additionally includes:
- `grade_inline` - Grade OpenAPI content directly
- `grade_and_record` - Grade and persist results
- `get_grade_history` - Retrieve grading history
- `suggest_fixes` - Get improvement suggestions

### Semantic Rules
Comprehensive semantic validation in `src/app/semantic/`:
- HTTP semantics (`http.ts`, `http_semantics.ts`)
- Async patterns (`async.ts`)
- Caching (`caching.ts`)
- Envelopes (`envelope.ts`)
- Extensions (`extensions.ts`)
- Internationalization (`i18n.ts`)
- Multi-tenancy (`tenancy.ts`)
- Webhooks (`webhooks.ts`)
- Pagination (`pagination.ts`)
- Naming conventions (`naming.ts`)
- Comprehensive checks (`comprehensive.ts`)

### Database
- **Dual Support**: SQLite (default for dev) and PostgreSQL (production)
- **Factory Pattern**: `src/mcp/persistence/db-factory.ts` handles database selection
- **Unified Migration**: `src/mcp/persistence/migrate-unified.ts`
- **Schema**: Stores grading results, checkpoints, API keys
- **Connection**: Configured via `DATABASE_URL` or individual `PG*` env vars

### Authentication
- **SSE Server**: Bearer token authentication
- **Default Production Key**: `sk_prod_001` (hardcoded in `src/mcp/server-sse-simple.ts:29`)
- **Configurable Keys**: Can be set via `API_KEYS` env var (JSON format)
- **Session Support**: GET-based SSE sessions with POST message routing

## Environment Variables

Key environment variables (see `.env.example`):
- `DATABASE_URL` or `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` - Database connection
- `PORT` - Server port (default: 3000 for production, 3001 for SSE)
- `NODE_ENV` - Environment (development/production)
- `TEMPLATE_PATH` - Path to grading template (default: `/app/templates/MASTER_API_TEMPLATE_v3.yaml`)
- `USE_LEGACY_SCORING` - Use legacy scoring engine if "true"
- `API_KEYS` - JSON object of API keys and metadata
- `ALLOWED_ORIGINS` - CORS origins (default: "*")
- `RATE_LIMIT` - Rate limit per IP (default: 100)

## Deployment

### Render Deployment (Current Production)
- **Service**: Web service using Docker
- **Plan**: PAID (not free tier)
- **Service Name**: smackdab-api-grader
- **Service ID**: srv-d2bk12be5dus738am0pg
- **URL**: https://smackdab-api-grader.onrender.com
- **Database**: PostgreSQL
- **Auto-deploy**: Enabled on git push to master branch
- **Health Check**: `/health` endpoint
- **Region**: Oregon
- **Configuration**: `render.yaml`

### Render API Access
To monitor deployments and get logs, use the Render API:

#### Authentication
- **API Key**: `rnd_igmLnJj1AIn3gigb2ZaZDk0Mrj6p`
- **Header Format**: `Authorization: Bearer rnd_igmLnJj1AIn3gigb2ZaZDk0Mrj6p`
- **Base URL**: `https://api.render.com/v1`

#### Key Endpoints
1. **List Services**: `GET /services`
   - Find service ID by name
   
2. **Get Deploys**: `GET /services/{serviceId}/deploys`
   - Check deployment status
   - Get latest deploy info
   
3. **Get Logs**: `GET /services/{serviceId}/logs`
   - View deployment logs
   - Debug issues
   
4. **Get Service Details**: `GET /services/{serviceId}`
   - Check service status
   - Get service configuration

#### Checking Deployment Status
```bash
# Set your API key
export RENDER_API_KEY="your-key-here"

# Get service ID
curl -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services | jq '.[] | select(.name=="smackdab-api-grader-mcp")'

# Get latest deploy
curl -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{serviceId}/deploys?limit=1

# Get logs
curl -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/{serviceId}/logs
```

### Docker
- **Dockerfile**: Multi-stage build with Node 20 Alpine
- **Entry Point**: `src/mcp/server-sse-simple.ts`
- **Port**: 3000
- **Health Check**: Built-in at `/health`

## TEST-DRIVEN DEVELOPMENT (TDD) - MANDATORY

### ⚠️ CRITICAL: ALWAYS USE TDD FOR ALL CODE WORK

**You MUST follow Test-Driven Development (TDD) for ALL code implementations:**

1. **WRITE TESTS FIRST** - Create failing tests BEFORE writing any implementation code
2. **RED** - Verify tests fail with clear error messages
3. **GREEN** - Write MINIMAL code to make tests pass
4. **REFACTOR** - Improve code while keeping tests green
5. **REPEAT** - Continue cycle for each new feature

**NO EXCEPTIONS**: Never write implementation code without tests existing first. If you catch yourself implementing before testing, STOP and write tests immediately.

### TDD Workflow Example
```bash
# 1. Write failing test
npm test feature.spec.ts  # Should FAIL

# 2. Implement minimal code
# Edit implementation file

# 3. Verify test passes
npm test feature.spec.ts  # Should PASS

# 4. Refactor if needed
# 5. All tests should still pass
```

## Testing

### Test Structure
- **Unit Tests**: `test/unit/` - Component-level testing
- **Integration Tests**: `test/integration/` - System integration
- **E2E Tests**: `test/e2e/` - Full workflow testing
- **Edge Cases**: Performance and stress testing
- **Fixtures**: `test/fixtures/` - Test data and mock APIs

### Current Test Status
- Some test failures exist (3 in comprehensive coverage, auth, and pipeline tests)
- Core grading functionality verified to work
- Database tests passing
- Semantic validation tests mostly passing

### Running Tests
```bash
npm test  # Run all tests
npm run test:unit  # Unit tests only
npm run test:integration  # Integration tests
npm run test:e2e  # End-to-end tests
npm run test:coverage  # With coverage report
npm run test:debug  # Verbose debug mode
```

## Project Files of Interest

### Configuration
- `qodo-mcp-config.json` - Qodo MCP integration config
- `jest.config.js` - Jest test configuration
- `tsconfig.json` - TypeScript configuration

### Documentation
- Multiple analysis and summary documents in root
- `summaries/` - Session summaries and progress reports
- `plans/` - Implementation plans

### Scripts
- `scripts/` - Utility scripts for testing and deployment
- Various shell scripts for deployment and monitoring

## Known Issues

1. **Mock Crypto**: Some tests fail due to crypto mocking issues
2. **Forbidden Tech Detection**: Edge case in comprehensive tests
3. **Authentication Tests**: Some auth middleware tests failing
4. **Database Tests**: Integration tests have connection issues

## Next Steps

The application is functional and deployed. Key areas for improvement:
1. Fix remaining test failures
2. Enhance authentication beyond hardcoded key
3. Add more comprehensive error handling
4. Implement full MCP tool set in SSE server
5. Add monitoring and analytics