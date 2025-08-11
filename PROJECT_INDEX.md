# Smackdab API Grader MCP Starter - Project Index

## 📋 Overview

The **Smackdab API Contract Grader MCP Edition** is a comprehensive tool for grading OpenAPI specifications against Smackdab standards. It provides a Model Context Protocol (MCP) server that exposes grading tools to AI assistants like Claude Code and Qodo, enabling automated API quality assessment and improvement suggestions.

### Key Features
- **MCP Server Integration**: Fully compatible with Claude Code and Qodo AI assistants
- **Comprehensive Grading**: Multi-checkpoint validation system covering structure, semantics, and best practices
- **Dual Scoring Engines**: Legacy binary scoring and new coverage-based scoring system
- **Database Persistence**: SQLite/PostgreSQL support for grading history and trend analysis
- **Fix Suggestions**: Automated suggestions for resolving API violations
- **SSE Support**: Server-Sent Events for real-time progress updates during grading

## 🏗️ Architecture

### System Components

```
┌─────────────────────┐
│   MCP Client        │ (Claude Code, Qodo, etc.)
│                     │
└──────────┬──────────┘
           │ stdio/SSE
           ▼
┌─────────────────────┐
│   MCP Server        │ src/mcp/server*.ts
│   (Tool Provider)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Grading Pipeline   │ src/app/pipeline.ts
│                     │
├─────────┬───────────┤
│ Linters │ Semantic  │
│         │ Checks    │
└─────────┴───────────┘
           │
           ▼
┌─────────────────────┐
│   Persistence       │ SQLite/PostgreSQL
│   Layer             │
└─────────────────────┘
```

## 📁 Project Structure

### Root Configuration Files
- `package.json` - Node.js project configuration and dependencies
- `tsconfig.json` - TypeScript compiler configuration
- `Dockerfile` - Container deployment configuration
- `render.yaml` - Render platform deployment configuration

### Source Code (`src/`)

#### MCP Server Layer (`src/mcp/`)
- **`server.ts`** - Main MCP server implementation (stdio transport)
- **`server-sse.ts`** - Server-Sent Events implementation
- **`server-sse-simple.ts`** - Simplified SSE server for production
- **`server-sse-direct.ts`** - Direct SSE server implementation
- **`auth.ts`** - Authentication utilities for API keys
- **`schemas.ts`** - Zod schemas for tool input validation

##### Persistence (`src/mcp/persistence/`)
- **`db.ts`** - SQLite database abstraction
- **`db-postgres.ts`** - PostgreSQL database implementation
- **`migrate.ts`** - Database migration runner
- **`migrations/`** - SQL migration scripts

#### Application Core (`src/app/`)

##### Main Pipeline
- **`pipeline.ts`** - Main grading orchestrator and workflow controller
- **`checkpoints.ts`** - Grading checkpoint definitions and weights
- **`context.ts`** - Grading context and state management
- **`scoring.ts`** - Legacy scoring system implementation

##### Linters (`src/app/linters/`)
- **`openapiValidator.ts`** - OpenAPI 3.0.3 structure validation
- **`spectralRunner.ts`** - Spectral linting rule runner
- **`examplesValidator.ts`** - Example data validation

##### Semantic Analyzers (`src/app/semantic/`)
- **`comprehensive.ts`** - Comprehensive semantic analysis
- **`http.ts`** - HTTP method and status code validation
- **`http_semantics.ts`** - RESTful semantics validation
- **`naming.ts`** - Naming convention checks
- **`pagination.ts`** - Pagination pattern validation
- **`caching.ts`** - Cache header validation
- **`envelope.ts`** - Response envelope pattern checks
- **`async.ts`** - Asynchronous operation patterns
- **`webhooks.ts`** - Webhook configuration validation
- **`i18n.ts`** - Internationalization support checks
- **`tenancy.ts`** - Multi-tenancy pattern validation
- **`extensions.ts`** - OpenAPI extension validation

##### Fix Engine (`src/app/fixes/`)
- **`fixesEngine.ts`** - Main fix suggestion engine
- **`suggestFixes.ts`** - Fix suggestion generator
- **`patch.ts`** - JSON patch generation utilities

##### Analytics (`src/app/analytics/`)
- **`trends.ts`** - Grading trend analysis

##### I/O (`src/app/io/`)
- **`templateLoader.ts`** - Template file loading utilities
- **`yamlLoader.ts`** - YAML file parsing utilities

##### Patching (`src/app/patching/`)
- **`applyPatches.ts`** - Apply suggested fixes to specifications

#### Scoring System (`src/scoring/`)
- **`prerequisites.ts`** - Prerequisite checks (must pass before grading)
- **`coverage.ts`** - Coverage-based scoring calculations
- **`dependencies.ts`** - Dependency-aware scoring
- **`finalizer.ts`** - Final grade calculation and summary

#### CLI Tools (`src/cli/`)
- **`index.ts`** - Command-line interface implementation
- **`pr-commenter.ts`** - GitHub PR comment integration

#### Rules (`src/rules/`)
- **`registry.ts`** - Rule registry and management

### Templates (`templates/`)
- **`MASTER_API_TEMPLATE_v3.yaml`** - Master grading template with all rule definitions

### Sample Specifications (`samples/specs/`)
- **`perfect/inventory.yaml`** - Example of a perfect specification
- **`fail/bad.yaml`** - Example with multiple violations

## 🛠️ Available MCP Tools

### 1. `version`
Get grader version and configuration information.

**Output**: Server version, scoring engine type, instance ID, template version

### 2. `list_checkpoints`
List all available grading checkpoints with descriptions and weights.

**Output**: Array of checkpoint definitions

### 3. `grade_contract`
Grade an OpenAPI specification file.

**Input**:
- `path` (string): Path to the OpenAPI file
- `templatePath` (string, optional): Custom template path

**Output**: Grade object with score, findings, and checkpoints

### 4. `grade_inline`
Grade inline OpenAPI YAML content.

**Input**:
- `content` (string): OpenAPI YAML content
- `templatePath` (string, optional): Custom template path

**Output**: Grade object with score, findings, and checkpoints

### 5. `grade_and_record`
Grade an API and persist results to database.

**Input**:
- `apiId` (string): Unique API identifier
- `path` or `content`: Specification to grade
- `templatePath` (string, optional): Custom template path
- `metadata` (object, optional): Additional metadata

**Output**: Grade object with database record ID

### 6. `explain_finding`
Get detailed explanation for a specific rule violation.

**Input**:
- `ruleId` (string): Rule identifier (e.g., "OAS-STRUCT")

**Output**: Detailed explanation with examples and fix suggestions

### 7. `suggest_fixes`
Generate fix suggestions for API violations.

**Input**:
- `findings` (array): Array of violations
- `spec` (object): Current specification

**Output**: Array of suggested fixes with JSON patches

### 8. `get_api_history`
Retrieve grading history for an API.

**Input**:
- `apiId` (string): API identifier
- `limit` (number, optional): Maximum records
- `since` (string, optional): Date filter

**Output**: Array of historical grading records

## 🎯 Grading System

### Checkpoint Categories

1. **Structure** (20% weight)
   - OpenAPI 3.0.3 compliance
   - Valid schema structure
   - Required fields presence

2. **Documentation** (15% weight)
   - API description completeness
   - Operation summaries
   - Parameter documentation

3. **Security** (20% weight)
   - Authentication schemes
   - Security definitions
   - HTTPS enforcement

4. **Semantic Correctness** (15% weight)
   - RESTful patterns
   - HTTP method usage
   - Status code appropriateness

5. **Examples** (10% weight)
   - Request/response examples
   - Schema examples
   - Example validity

6. **Best Practices** (20% weight)
   - Versioning strategy
   - Error handling patterns
   - Naming conventions

### Scoring Modes

#### Legacy Binary Scoring
- Pass/fail evaluation per checkpoint
- Total score: sum of passed checkpoint weights
- Letter grades: A+ (97+), A (93-96), B+ (87-92), etc.

#### Coverage-Based Scoring (v2.0)
- Prerequisite validation (must pass to proceed)
- Rule coverage percentage calculation
- Dependency-aware scoring adjustments
- More granular feedback and progression tracking

### Auto-Fail Conditions
- Invalid OpenAPI structure
- Missing required version (3.0.3)
- Critical security violations
- Failed prerequisites (coverage mode)

## 🚀 Deployment Options

### Local Development
```bash
npm install
npm run build
npm run dev:mcp  # Standard MCP server
npm run dev:sse  # SSE server for testing
```

### Docker Deployment
```bash
docker build -t api-grader .
docker run -p 3000:3000 api-grader
```

### Render Deployment
- Configuration in `render.yaml`
- Deploy script: `RENDER_FINAL_DEPLOY.sh`
- Environment setup: `setup-render-env.md`

## 🔧 Configuration

### Environment Variables
- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string
- `USE_LEGACY_SCORING` - Enable legacy scoring mode
- `API_KEY` - Authentication key for SSE endpoints

### MCP Configuration

#### Claude Code Setup
```json
{
  "mcpServers": {
    "smackdab-api-grader": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/path/to/api-grader-mcp-starter"
    }
  }
}
```

#### Qodo Setup
See `qodo-mcp-config.json` for Qodo-specific configuration.

## 📊 Database Schema

### Tables

#### `api_grades`
- `id` - Unique identifier
- `api_id` - API identifier
- `spec_hash` - Specification content hash
- `grade_total` - Numeric score
- `grade_letter` - Letter grade
- `compliance_pct` - Compliance percentage
- `findings` - JSON array of violations
- `checkpoints` - JSON array of checkpoint results
- `metadata` - Additional metadata
- `created_at` - Timestamp

#### `api_metadata`
- `api_id` - Primary key
- `name` - API name
- `version` - API version
- `description` - API description
- `owner` - API owner
- `tags` - JSON array of tags
- `created_at` - First seen timestamp
- `updated_at` - Last modified timestamp

## 🧪 Testing

### Test Scripts
- `test-mcp.cjs` - MCP protocol testing
- `test-comprehensive.ts` - Comprehensive grading tests
- `test-product-api.ts` - Product API specification tests
- `test-master-template.ts` - Template validation tests
- `test-sse-comprehensive.sh` - SSE endpoint testing
- `test-deployment.sh` - Deployment validation

### Test Utilities
- `test-specific-rules.js` - Test individual rules
- `test-rule-detection.js` - Rule detection testing
- `test-new-scoring.js` - Coverage-based scoring tests

## 📈 Monitoring & Analytics

### Health Checks
- `/health` - Basic health status
- `/metrics` - Prometheus-compatible metrics
- `/ready` - Readiness probe for orchestrators

### Analytics Features
- Trend analysis over time
- Rule violation frequency
- API improvement tracking
- Compliance percentage trends

## 🔐 Security

### Authentication
- API key authentication for SSE endpoints
- Token generation utility: `src/mcp/utils/generate-key.ts`
- Secure key storage recommendations in documentation

### Best Practices
- Input validation on all endpoints
- SQL injection prevention via parameterized queries
- Rate limiting on public endpoints
- CORS configuration for web clients

## 📚 Documentation

### Setup Guides
- `README.md` - Main project documentation
- `MCP_SETUP.md` - MCP server setup instructions
- `setup-render-env.md` - Render environment setup

### API Documentation
- `SIMPLE_GRADER_README.md` - Simple grader usage
- `VERSION_INFO.md` - Version history and changes

## 🤝 Integration Points

### CI/CD Integration
- GitHub Actions support via `pr-commenter.ts`
- Webhook notifications for grading results
- API for programmatic access

### IDE Integration
- Claude Code via MCP protocol
- Qodo via MCP configuration
- VS Code extension ready

## 🎓 Best Practices

### For Users
1. Always use OpenAPI 3.0.3 format
2. Include comprehensive examples
3. Document all parameters and responses
4. Follow RESTful conventions
5. Implement proper error handling

### For Developers
1. Run tests before committing
2. Update migration scripts for schema changes
3. Maintain backward compatibility
4. Document new rules in template
5. Update version information appropriately

## 🚦 Quick Start

1. **Install dependencies**: `npm install`
2. **Build project**: `npm run build`
3. **Run MCP server**: `npm run dev:mcp`
4. **Configure AI assistant**: Follow MCP_SETUP.md
5. **Grade an API**: Use the `grade_contract` tool

## 📞 Support & Resources

- **MCP Documentation**: https://modelcontextprotocol.io
- **Claude Code MCP Guide**: https://docs.anthropic.com/en/docs/claude-code/mcp
- **Qodo MCP Guide**: https://docs.qodo.ai/qodo-documentation/qodo-gen/tools-mcps/agentic-tools-mcps
- **Project Repository**: [GitHub Link]
- **Issue Tracker**: [GitHub Issues]