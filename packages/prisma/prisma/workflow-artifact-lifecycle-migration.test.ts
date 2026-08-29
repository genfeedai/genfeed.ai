import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260828190000_workflow_artifact_lifecycle/migration.sql',
  ),
  'utf8',
);

describe('workflow artifact lifecycle migration', () => {
  it('normalizes temporary storage ownership by tenant, execution, and node', () => {
    expect(schema).toContain('model WorkflowArtifact');
    expect(migration).toContain('CREATE TABLE "workflow_artifacts"');
    expect(migration).toContain('"organizationId" TEXT NOT NULL');
    expect(migration).toContain('"executionId" TEXT NOT NULL');
    expect(migration).toContain('"nodeId" TEXT NOT NULL');
    expect(migration).toContain('"storageKey" TEXT NOT NULL');
    expect(migration).toContain('"isDeleted" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain(
      '"executionId", "nodeId", "storageProvider", "storageKey"',
    );
  });

  it('persists expiry, promotion, and reclaimable cleanup state', () => {
    expect(migration).toContain('CREATE TYPE "WorkflowArtifactState"');
    expect(migration).toContain('"expiresAt" TIMESTAMP(3) NOT NULL');
    expect(migration).toContain(
      '"retentionPolicy" TEXT NOT NULL DEFAULT \'terminal\'',
    );
    expect(migration).toContain('"metadata" JSONB NOT NULL DEFAULT \'{}\'');
    expect(migration).toContain('"cleanupClaimedAt" TIMESTAMP(3)');
    expect(migration).toContain('"cleanupAttempts" INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('"promotedAt" TIMESTAMP(3)');
    expect(migration).toContain('"promotionTargetId" TEXT');
    expect(migration).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
  });

  it('supports terminal payload scrubbing and short-lived public executions', () => {
    expect(migration).toContain(
      'ADD COLUMN "scrubAllNodePayloads" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(migration).toContain(
      'ADD COLUMN "scrubNodeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]',
    );
    expect(migration).toContain('ADD COLUMN "payloadScrubbedAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "purgeAfterHours" INTEGER');
    expect(migration).toContain('ADD COLUMN "purgeAt" TIMESTAMP(3)');
    expect(migration).toContain('"workflow_executions_purgeAt_idx"');
  });
});
