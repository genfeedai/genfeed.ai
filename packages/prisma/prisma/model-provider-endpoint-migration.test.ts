import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260820143000_add_model_provider_endpoint/migration.sql',
  ),
  'utf8',
);

const modelSchema = schema.slice(
  schema.indexOf('model Model {'),
  schema.indexOf('model Persona {'),
);

describe('model provider endpoint identity (#3323)', () => {
  it('keeps selection keys unique and adds provider endpoint identity', () => {
    expect(modelSchema).toContain('key         String  @unique');
    expect(modelSchema).toContain('endpoint    String');
    expect(modelSchema).toContain(
      '@@unique([provider, endpoint], map: "models_provider_endpoint_key")',
    );
  });

  it('backfills endpoints without rewriting existing model keys', () => {
    expect(migration).toContain('ADD COLUMN "endpoint" TEXT');
    expect(migration).toContain('SET "endpoint" = "key"');
    expect(migration).toContain('ALTER COLUMN "endpoint" SET NOT NULL');
    expect(migration).not.toContain('UPDATE "models" SET "key"');
  });

  it('enforces one row per provider endpoint while retaining key uniqueness', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "models_provider_endpoint_key" ON "models"("provider", "endpoint")',
    );
    expect(migration).not.toContain('DROP INDEX "models_key_key"');
  });
});
