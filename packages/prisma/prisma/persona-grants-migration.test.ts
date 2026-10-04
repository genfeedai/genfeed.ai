import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261004130000_character_org_grants/migration.sql',
  ),
  'utf8',
);

describe('character organization grants migration (#6037)', () => {
  it('allows one active grant per character and receiving organization', () => {
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "persona_grants_active_persona_recipient_key"',
    );
    expect(migrationSource).toContain(
      'ON "persona_grants" ("personaId", "recipientOrganizationId")',
    );
    expect(migrationSource).toContain('WHERE "revokedAt" IS NULL');
  });

  it('indexes the receiving-side lookup and keeps use as the only access', () => {
    expect(migrationSource).toContain(
      'ON "persona_grants" ("recipientOrganizationId", "revokedAt")',
    );
    expect(migrationSource).toContain(`"access" TEXT NOT NULL DEFAULT 'use'`);
    expect(schemaSource).toMatch(/model PersonaGrant \{/);
  });

  it('records actor, time, previous and new state for every change', () => {
    for (const column of [
      'actorUserId',
      'action',
      'previousMode',
      'previousBrandIds',
      'newMode',
      'newBrandIds',
      'createdAt',
    ]) {
      expect(migrationSource).toContain(`"${column}"`);
    }
    expect(migrationSource).toContain('CREATE TABLE "persona_grant_audits"');
  });

  it('restricts deletes and never rewrites existing rows', () => {
    expect(migrationSource).toContain('ON DELETE RESTRICT');
    expect(migrationSource).not.toMatch(/DELETE FROM|UPDATE "/);
  });
});
