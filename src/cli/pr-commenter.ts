#!/usr/bin/env node
import { GraderDB } from '../mcp/persistence/db.js';

function fmtRow(r:any){ return `| ${r.graded_at} | ${r.total_score.toFixed(1)} | ${r.letter_grade} | ${r.auto_fail ? '❌' : '✅'} | ${r.findings_count} |`; }

async function main(){
  const apiId = process.argv[2];
  if (!apiId){ console.error('Usage: pr-commenter <apiId> [limit=10]'); process.exit(1); }
  const limit = parseInt(process.argv[3] || '10', 10);

  const db = new GraderDB();
  await db.connect();
  await db.migrate();
  const rows = await db.getHistory(apiId, limit);

  const latest = rows[0];
  const trend = rows.slice(0,5).map((r:any)=>r.total_score);
  const delta = trend.length >= 2 ? (trend[0] - trend[1]).toFixed(1) : '0.0';

  const md = `
### 📊 Smackdab API Grader — Latest Results for \`${apiId}\`

**Latest score:** **${latest?.total_score?.toFixed(1) ?? 'n/a'}** (${latest?.letter_grade ?? 'n/a'}) ${latest?.auto_fail ? '❌ Auto‑fail' : '✅ Pass'}  
**Change since previous:** ${delta} points  
**Findings:** ${latest?.findings_count ?? 0}

| Graded At | Score | Grade | Pass | Findings |
|---|---:|:---:|:---:|---:|
${rows.map(fmtRow).join('\n')}

_Tooling: MCP server \`smackdab-api-grader\`_
`;
  console.log(md.trim());
}

main().catch(e=>{ console.error(e); process.exit(1); });
