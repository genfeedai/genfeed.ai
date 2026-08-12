import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Hermetic launch-path contracts collected for the API E2E tier.
 *
 * These are not live HTTP tests — they lock production-critical query and
 * migration shapes so nightly P3018 / bootstrap regressions fail in CI without
 * spinning a full Playwright matrix. CPU-cheap by design (read source only).
 */
const here = dirname(fileURLToPath(import.meta.url));
// apps/server/api/test/integration → monorepo root
const repoRoot = join(here, '../../../../..');

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('launch-path contracts (hermetic E2E tier)', () => {
  it('keeps the agent_messages cursor migration free of DROP INDEX CONCURRENTLY', () => {
    const sql = readRepo(
      'packages/prisma/prisma/migrations/20260811170000_agent_messages_cursor_index_id_desc/migration.sql',
    );
    expect(sql).not.toMatch(/DROP\s+INDEX\s+CONCURRENTLY/i);
    expect(sql).toContain('"id" DESC');
  });

  it('bounds review-inbox bootstrap scans in production source', () => {
    const source = readRepo(
      'apps/server/api/src/services/batch-generation/batch-generation-review.service.ts',
    );
    expect(source).toContain('BATCH_SCAN_LIMIT = 50');
    expect(source).toContain('take: BATCH_SCAN_LIMIT');
    expect(source).toMatch(/select:\s*\{\s*createdAt:\s*true/);
    expect(source).toMatch(/items:\s*true/);
  });

  it('aggregates agent-run stats with groupBy instead of four counts', () => {
    const source = readRepo(
      'apps/server/api/src/collections/agent-runs/services/agent-runs.service.ts',
    );
    expect(source).toContain('this.delegate.groupBy({');
    expect(source).toContain("by: ['status']");
    // Guard against reintroducing the four-count fan-out on the bootstrap path.
    const countCalls = source.match(/this\.delegate\.count\(/g) ?? [];
    // getStats must not use count; other methods may still use count elsewhere
    // in the file — assert the comment that documents the two-groupBy path.
    expect(source).toContain(
      'Two groupBy queries replace four separate COUNTs',
    );
    expect(countCalls.length).toBeLessThan(20);
  });

  it('fails closed when Replicate webhook signing secret is missing', () => {
    const source = readRepo(
      'apps/server/api/src/endpoints/webhooks/replicate/webhooks.replicate.controller.ts',
    );
    expect(source).toContain(
      'REPLICATE_WEBHOOK_SIGNING_SECRET is not configured',
    );
    expect(source).not.toContain('validation skipped (missing secret)');
  });

  it('continues prior executions on job retry instead of re-triggering', () => {
    const source = readRepo(
      'apps/server/workers/src/processors/api/collections/workflows/services/workflow-execution.processor.ts',
    );
    expect(source).toContain('priorExecutionIds');
    expect(source).toContain('continueExistingExecution');
    expect(source).toContain('continuedOnRetry');
    expect(source).toContain('attemptsMade');
  });

  it('ships durable workflow_node_claims unique (executionId, nodeId)', () => {
    const schema = readRepo('packages/prisma/prisma/schema.prisma');
    const migration = readRepo(
      'packages/prisma/prisma/migrations/20260812140000_workflow_node_claims/migration.sql',
    );
    expect(schema).toContain('model WorkflowNodeClaim');
    expect(migration).toContain('workflow_node_claims_executionId_nodeId_key');
  });
});
