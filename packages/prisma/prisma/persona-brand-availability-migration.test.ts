import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261003160000_persona_brand_availability/migration.sql',
  ),
  'utf8',
);

describe('persona brand availability migration (#6009)', () => {
  it('defaults every existing character to the owning brand only', () => {
    expect(migrationSource).toContain(
      `ADD COLUMN "availabilityMode" "PersonaAvailabilityMode" NOT NULL DEFAULT 'OWNING_BRAND'`,
    );
    expect(migrationSource).toContain(
      `CREATE TYPE "PersonaAvailabilityMode" AS ENUM ('OWNING_BRAND', 'ALL_BRANDS', 'SELECTED_BRANDS')`,
    );
    expect(schemaSource).toMatch(
      /availabilityMode\s+PersonaAvailabilityMode\s+@default\(OWNING_BRAND\)/,
    );
  });

  it('indexes the brand lookup so lists stay one indexed query', () => {
    expect(migrationSource).toContain(
      'CREATE INDEX "personas_available_brand_ids_idx"',
    );
    expect(migrationSource).toContain('USING GIN ("availableBrandIds")');
    expect(schemaSource).toContain(
      '@@index([availableBrandIds], type: Gin, map: "personas_available_brand_ids_idx")',
    );
  });

  it('records actor, time, previous and new availability', () => {
    for (const column of [
      'actorUserId',
      'previousMode',
      'previousBrandIds',
      'newMode',
      'newBrandIds',
      'createdAt',
    ]) {
      expect(migrationSource).toContain(`"${column}"`);
    }
    expect(migrationSource).toContain(
      'CREATE TABLE "persona_availability_audits"',
    );
  });

  it('never rewrites or deletes character rows', () => {
    expect(migrationSource).not.toMatch(/DELETE FROM|UPDATE "personas"/);
  });
});
