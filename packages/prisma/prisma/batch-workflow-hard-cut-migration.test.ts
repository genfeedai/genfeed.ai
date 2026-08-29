import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260829100000_drop_batch_workflow_jobs/migration.sql',
  ),
  'utf8',
);

describe('batch workflow hard cut migration', () => {
  it('drops the parallel job table and adds durable execution idempotency', () => {
    expect(migration).toContain('DROP TABLE "batch_workflow_jobs"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "workflow_executions_org_idempotency_key"',
    );
    expect(schema).not.toMatch(/model BatchWorkflowJob\s*\{/);
    expect(schema).not.toContain('@@map("batch_workflow_jobs")');
    expect(schema).toContain(
      '@@unique([organizationId, idempotencyKey], map: "workflow_executions_org_idempotency_key")',
    );
  });
});
