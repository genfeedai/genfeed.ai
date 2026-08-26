import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(prismaDir, 'migrations/20260826140000_agent_transfers/migration.sql'),
  'utf8',
);

describe('agent transfer persistence (#2714)', () => {
  it('keeps the durable transfer model tenant scoped and idempotent', () => {
    expect(schema).toContain('model AgentTransfer');
    expect(schema).toContain(
      '@@unique([organizationId, userId, idempotencyKey]',
    );
    expect(schema).toContain(
      'destinationRunId            String?                   @unique',
    );
    expect(migration).toContain('agent_transfers_depth_check');
    expect(migration).toContain('agent_transfers_progress_check');
  });

  it('enforces immutable transfer identity at the database boundary', () => {
    expect(migration).toContain('prevent_agent_transfer_identity_mutation');
    expect(migration).toContain("TG_OP = 'DELETE'");
    expect(migration).toContain(
      'agent transfer identity and payload are immutable',
    );
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
  });
});
