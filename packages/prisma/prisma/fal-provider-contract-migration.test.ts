import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260822100000_add_fal_provider_contracts/migration.sql',
  ),
  'utf8',
);

describe('versioned Fal provider contracts (#3324)', () => {
  it('keeps immutable provider metadata keyed by provider endpoint version', () => {
    expect(schema).toContain('model ModelProviderContract {');
    expect(schema).toContain(
      '@@unique([provider, endpoint, version], map: "model_provider_contracts_identity_version_key")',
    );
    expect(migration).toContain('CREATE TABLE "model_provider_contracts"');
    expect(migration).toContain('"unitPrice" TEXT');
    expect(migration).toContain('"conditionalDimensions" JSONB');
  });

  it('stores reviewed and pending versions separately on the model row', () => {
    expect(schema).toContain('reviewedProviderContractVersion String?');
    expect(schema).toContain('pendingProviderContractVersion  String?');
    expect(schema).toContain('providerSchemaFamily            String?');
    expect(migration).toContain('"reviewedProviderContractVersion" TEXT');
    expect(migration).toContain('"pendingProviderContractVersion" TEXT');
  });

  it('persists freshness and failure state without replacing reviewed pricing columns', () => {
    expect(schema).toContain('providerSyncStatus              String?');
    expect(schema).toContain('providerSyncFailedAt            DateTime?');
    expect(schema).toContain('providerSyncFailureCode         String?');
    expect(migration).not.toContain('DROP COLUMN "providerCostUsd"');
    expect(migration).not.toContain('DROP COLUMN "pricingType"');
  });
});
