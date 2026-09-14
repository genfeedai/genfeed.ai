import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readThreadWorkflowSnapshot } from '@api/collections/agent-threads/utils/reconcile-thread-workflow-snapshot';
import { AGENT_CONVERSATION_WORKFLOW_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';

// From apps/server/api, run:
// THREAD_SNAPSHOT_VERIFY_ADMIN_URL=postgresql://localhost/postgres bun run scripts/verify-thread-snapshot-index.ts
// Supply a dedicated development server and a role with CREATEDB. Only the new database is mutated.
const adminUrl = process.env.THREAD_SNAPSHOT_VERIFY_ADMIN_URL;
assert(
  adminUrl,
  'Set THREAD_SNAPSHOT_VERIFY_ADMIN_URL to a dedicated verification server',
);
const database = `thread_snapshot_verify_${process.pid}_${Date.now()}`;
const admin = new Client({ connectionString: adminUrl });
const url = new URL(adminUrl);
url.pathname = `/${database}`;
const connectionString = url.toString();
const db = new Client({ connectionString });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: [{ emit: 'event', level: 'query' }],
});
const queries: { query: string; params: string }[] = [];
prisma.$on('query', (event) => queries.push(event));
const indexName = 'workflow_executions_thread_snapshot_idx';
const hostile = `thread'"; DROP TABLE workflow_executions; -- 雪\\`;
const date = new Date('2026-09-08T10:00:00.000Z');
function snapshot(
  threadId = 'dense',
  organizationId = 'org-1',
): AgentThreadSnapshotDocument {
  return {
    id: 'snapshot',
    threadId,
    organizationId,
    isDeleted: false,
    createdAt: date,
    updatedAt: date,
    data: {},
    lastSequence: 0,
    memorySummaryRefs: [],
    pendingApprovals: [],
    pendingInputRequests: [],
    timeline: [],
  };
}
async function insert(
  id: string,
  threadId: unknown,
  canonicalId: unknown,
  organizationId = 'org-1',
  isDeleted = false,
  createdAt = date,
) {
  await db.query(
    `INSERT INTO workflow_executions
    (id, "organizationId", "isDeleted", result, status, "createdAt")
    VALUES ($1, $2, $3, $4::jsonb, 'COMPLETED', $5)`,
    [
      id,
      organizationId,
      isDeleted,
      JSON.stringify({ metadata: { threadId, canonicalId } }),
      createdAt.toISOString(),
    ],
  );
}
type PlanNode = {
  'Node Type': string;
  'Index Name'?: string;
  'Index Cond'?: string;
  'Actual Rows': number;
  'Rows Removed by Filter'?: number;
  Plans?: PlanNode[];
};
function nodes(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(nodes)];
}
function assertBounded(plan: PlanNode) {
  const scans = nodes(plan).filter((node) => node['Index Name'] === indexName);
  assert.equal(
    scans.length,
    3,
    'Expected three snapshot expression index scans',
  );
  for (const scan of scans) {
    assert.equal(scan['Node Type'], 'Index Scan');
    for (const predicate of [
      'organizationId',
      'isDeleted',
      'metadata,threadId',
      'metadata,canonicalId',
    ]) {
      assert(
        scan['Index Cond']?.includes(predicate),
        `Missing ${predicate} in Index Cond`,
      );
    }
    assert(scan['Actual Rows'] <= 1, 'Each branch must fetch at most one row');
    assert.equal(scan['Rows Removed by Filter'] ?? 0, 0);
  }
}
async function capture() {
  queries.length = 0;
  const result = await readThreadWorkflowSnapshot(prisma, snapshot());
  assert.equal(result.activeRun?.runId, 'winner-z');
  assert.equal(queries.length, 1, 'One database round trip');
  const captured = queries[0];
  assert(captured);
  return captured;
}
async function explain(label: string) {
  const captured = await capture();
  const result = await db.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${captured.query}`,
    JSON.parse(captured.params),
  );
  console.log(
    JSON.stringify({ label, ...captured, plan: result.rows[0] }, null, 2),
  );
  return result.rows[0]['QUERY PLAN'][0].Plan as PlanNode;
}
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  await db.connect();
  await db.query(`CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
    CREATE TABLE workflow_executions (
      id TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "isDeleted" BOOLEAN NOT NULL DEFAULT false,
      result JSONB, status "WorkflowExecutionStatus" NOT NULL DEFAULT 'PENDING',
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(), "startedAt" TIMESTAMP, "completedAt" TIMESTAMP
    );
    CREATE INDEX baseline_scope ON workflow_executions ("organizationId", "isDeleted", "createdAt" DESC);
    INSERT INTO workflow_executions (id, "organizationId", result)
    SELECT 'base-' || tenant || '-' || n, 'org-' || tenant,
      jsonb_build_object('metadata', jsonb_build_object('threadId', 'thread-' || n, 'canonicalId', 'unrelated'))
    FROM generate_series(1, 10) tenant CROSS JOIN generate_series(1, 20000) n;
    INSERT INTO workflow_executions (id, "organizationId", result)
    SELECT 'dense-' || n, 'org-1', jsonb_build_object('metadata', jsonb_build_object('threadId', 'dense', 'canonicalId', 'unrelated-' || n))
    FROM generate_series(1, 20000) n`);
  for (const [
    index,
    canonicalId,
  ] of AGENT_CONVERSATION_WORKFLOW_IDS.entries()) {
    await insert(
      `old-${index}`,
      'dense',
      canonicalId,
      'org-1',
      false,
      new Date('2026-09-07'),
    );
    await insert(`winner-${index === 2 ? 'z' : index}`, 'dense', canonicalId);
    await insert(`type-${index}`, `only-${index}`, canonicalId);
  }
  await insert('winner-y', 'dense', AGENT_CONVERSATION_WORKFLOW_IDS[2]);
  await insert(
    'zzzz-old',
    'dense',
    AGENT_CONVERSATION_WORKFLOW_IDS[2],
    'org-1',
    false,
    new Date('2026-09-07'),
  );
  const canonicalId = AGENT_CONVERSATION_WORKFLOW_IDS[0];
  const newer = new Date('2026-09-09');
  await insert('foreign', 'dense', canonicalId, 'org-2', false, newer);
  await insert('deleted', 'dense', canonicalId, 'org-1', true, newer);
  await insert('deleted-only', 'deleted-only', canonicalId, 'org-1', true);
  await insert('foreign-only', 'foreign-only', canonicalId, 'org-2');
  await insert('hostile', hostile, canonicalId, `org'雪`);
  await insert('empty', '', canonicalId);
  await insert('numeric-thread', 42, canonicalId);
  await insert('null-thread', null, canonicalId);
  await insert('missing-thread', undefined, canonicalId);
  await insert('numeric-canonical', 'non-string', 42);
  await insert('null-canonical', 'null-canonical', null);
  await insert('missing-canonical', 'missing-canonical', undefined);
  await db.query(`INSERT INTO workflow_executions (id, "organizationId", result) VALUES
    ('missing-metadata', 'org-1', '{}'), ('null-metadata', 'org-1', '{"metadata":null}'),
    ('non-object-metadata', 'org-1', '{"metadata":42}')`);
  await db.query('ANALYZE workflow_executions');
  const beforePlan = await explain('BEFORE');
  assert.throws(() => assertBounded(beforePlan), /Expected three/);
  console.log('PASS: bounded-plan assertion fails without the migration');
  await db.query(
    await readFile(
      new URL(
        '../../../../packages/prisma/prisma/migrations/20260914170000_workflow_thread_snapshot_index/migration.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const validity = await db.query(
    'SELECT indisvalid, indisready FROM pg_index WHERE indexrelid = $1::regclass',
    [indexName],
  );
  assert.deepEqual(validity.rows, [{ indisvalid: true, indisready: true }]);
  await db.query('ANALYZE workflow_executions');
  assertBounded(await explain('AFTER'));
  for (const [threadId, organizationId, expected] of [
    ['dense', 'org-1', 'winner-z'],
    ['dense', 'org-2', 'foreign'],
    [hostile, `org'雪`, 'hostile'],
    ['', 'org-1', 'empty'],
    ...AGENT_CONVERSATION_WORKFLOW_IDS.map((_, index) => [
      `only-${index}`,
      'org-1',
      `type-${index}`,
    ]),
  ]) {
    const result = await readThreadWorkflowSnapshot(
      prisma,
      snapshot(threadId, organizationId),
    );
    assert.equal(result.activeRun?.runId, expected);
    assert.equal(result.activeRun?.status, 'completed');
    assert.equal(
      result.activeRun?.startedAt,
      (expected === 'foreign' ? newer : date).toISOString(),
    );
  }
  for (const threadId of [
    'absent',
    'deleted-only',
    'foreign-only',
    '42',
    'null',
    'undefined',
    'non-string',
    'null-canonical',
    'missing-canonical',
  ]) {
    const current = snapshot(threadId);
    assert.equal(await readThreadWorkflowSnapshot(prisma, current), current);
  }
  const absentTenant = snapshot('dense', 'absent-org');
  assert.equal(
    await readThreadWorkflowSnapshot(prisma, absentTenant),
    absentTenant,
  );

  const captured = await capture();
  await db.query('SET plan_cache_mode = force_generic_plan');
  await db.query(`PREPARE snapshot_lookup AS ${captured.query}`);
  // EXECUTE arguments cannot use extended-protocol placeholders. PostgreSQL itself
  // quotes the bound values, including quotes/backslashes/Unicode, as SQL literals.
  async function executePlan(params: string) {
    const literals = await db.query<{ literal: string }>(
      'SELECT quote_literal(value) AS literal FROM unnest($1::text[]) WITH ORDINALITY AS p(value, ordinal) ORDER BY ordinal',
      [JSON.parse(params)],
    );
    const result = await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE snapshot_lookup(${literals.rows.map((row) => row.literal).join(', ')})`,
    );
    console.log(
      JSON.stringify(
        { label: 'GENERIC PREPARED', params, plan: result.rows[0] },
        null,
        2,
      ),
    );
    assertBounded(result.rows[0]['QUERY PLAN'][0].Plan as PlanNode);
  }
  await executePlan(captured.params);
  queries.length = 0;
  await readThreadWorkflowSnapshot(prisma, snapshot(hostile, `org'雪`));
  assert(queries[0]);
  await executePlan(queries[0].params);
  const prepared = await db.query(
    "SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = 'snapshot_lookup'",
  );
  assert.equal(Number(prepared.rows[0].generic_plans), 2);
  assert.equal(Number(prepared.rows[0].custom_plans), 0);
  await db.query('DEALLOCATE snapshot_lookup');
  console.log(
    'PASS: valid concurrent index, three bounded index scans, named generic prepared plans, tenant isolation, soft deletes, JSON identity semantics, hostile identifiers, all conversation types, timestamp/id ordering and no-match identity',
  );
} finally {
  const cleanup = await Promise.allSettled([prisma.$disconnect(), db.end()]);
  if (created) {
    cleanup.push(
      await admin.query(`DROP DATABASE "${database}"`).then(
        () => ({ status: 'fulfilled' as const, value: undefined }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      ),
    );
  }
  cleanup.push(
    await admin.end().then(
      () => ({ status: 'fulfilled' as const, value: undefined }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    ),
  );
  for (const result of cleanup) {
    if (result.status === 'rejected') {
      console.error('Verification cleanup failed:', result.reason);
      process.exitCode = 1;
    }
  }
}
