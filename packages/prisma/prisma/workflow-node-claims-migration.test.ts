import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260812140000_workflow_node_claims/migration.sql',
  ),
  'utf8',
);
const leaseMigration = readFileSync(
  join(
    prismaDir,
    'migrations/20260831120000_workflow_node_claim_leases/migration.sql',
  ),
  'utf8',
);

describe('workflow_node_claims (#2359)', () => {
  it('declares unique (executionId, nodeId) in schema and migration', () => {
    expect(schema).toContain('model WorkflowNodeClaim');
    expect(schema).toContain('@@unique([executionId, nodeId])');
    expect(migration).toContain('workflow_node_claims');
    expect(migration).toContain('workflow_node_claims_executionId_nodeId_key');
  });

  it('adds renewable owner-tokened claim leases', () => {
    expect(schema).toContain('leaseOwnerId   String?');
    expect(schema).toContain('leaseExpiresAt DateTime?');
    expect(leaseMigration).toContain('"leaseOwnerId" TEXT');
    expect(leaseMigration).toContain('"leaseExpiresAt" TIMESTAMP(3)');
  });
});
