import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260829110000_workflow_node_continuations/migration.sql',
  ),
  'utf8',
);

describe('workflow node provider continuations', () => {
  it('pins one continuation to an execution node and immutable version', () => {
    expect(schema).toContain('model WorkflowNodeContinuation');
    expect(schema).toContain(
      '@@unique([executionId, nodeId], map: "workflow_node_continuations_execution_node_key")',
    );
    expect(migration).toContain('"workflowVersionId" TEXT NOT NULL');
    expect(migration).toContain(
      'workflow_node_continuations_org_provider_external_key',
    );
    expect(migration).toContain('"pollAttempt" INTEGER');
    expect(migration).toContain('workflow_node_continuations_poll_outbox_idx');
    expect(migration).toContain(
      'CREATE TYPE "WorkflowNodeContinuationStatus" AS ENUM',
    );
  });
});
