/**
 * Example query over the labeled property graph: every entity with a given
 * relationship to a company, across the latest report for each ticker.
 * npx tsx --env-file=.env.local scripts/graph-query.ts CUSTOMER_OF
 */
import { queryRows } from "@/lib/tiger";

const type = process.argv[2] ?? "CUSTOMER_OF";

const SQL = `
WITH latest AS (
  SELECT DISTINCT ON (ticker) id, ticker FROM reports WHERE as_of IS NULL ORDER BY ticker, generated_at DESC
)
SELECT f.name AS entity, f.node_label AS label, r.relationship_type AS relationship, l.ticker AS company, f.magnitude_label AS magnitude
FROM relationships r
JOIN latest l ON l.id = r.report_id
JOIN entities f ON f.id = r.from_node_id
WHERE r.relationship_type = $1
ORDER BY f.name, l.ticker`;

queryRows(SQL, [type])
  .then((rows) => {
    console.table(rows);
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
