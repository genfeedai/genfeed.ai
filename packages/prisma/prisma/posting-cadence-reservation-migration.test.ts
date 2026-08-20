import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260819180000_add_posting_cadences/migration.sql',
  ),
  'utf8',
);

describe('posting cadence reservation identity (#3302)', () => {
  it('enforces one durable reservation per tenant and full identity', () => {
    expect(schema).toContain(
      '@@unique([organizationId, identityKey], map: "slot_reservations_org_identity_key")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "slot_reservations_org_identity_key" ON "slot_reservations"("organizationId", "identityKey")',
    );
  });
});
