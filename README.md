# Smackdab API Contract Grader — MCP Edition

This is a starter repo for the MCP-based API grader. It includes:
- MCP server exposing tools (grade_contract, grade_inline, grade_and_record, etc.)
- Deterministic pipeline stubs
- Persistence layer (SQLite/Postgres-ready) + migrations
- Safe patch scaffolding (JSON Patch / unified diff)
- CLI wrapper (optional)

## Quick start

```bash
pnpm i    # or npm i / yarn
pnpm build
pnpm dev:mcp  # runs the MCP server via stdio
```

See `src/mcp/server.ts` for tool definitions and `src/app/pipeline.ts` for the grading stages.
