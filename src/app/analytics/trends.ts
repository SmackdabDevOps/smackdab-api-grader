import { GraderDB } from '../../mcp/persistence/db.js';

export async function getTopViolations(limit = 10) {
  const db = new GraderDB();
  await db.connect();
  await db.migrate();
  const rows = await (db as any).db!.all(`
    SELECT rule_id, COUNT(*) as cnt
    FROM finding
    GROUP BY rule_id
    ORDER BY cnt DESC
    LIMIT ?
  `, limit);
  return rows;
}
