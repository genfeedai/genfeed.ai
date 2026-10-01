import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    './migrations/20261001120000_add_crun_generation_tasks/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Crun task additive migration', () => {
  it('preserves all existing tables and binds uniqueness to tenant quote and credential identity', () => {
    expect(migration).not.toMatch(/DROP|TRUNCATE|DELETE/);
    expect(migration).toContain('("organizationId", "ingredientId")');
    expect(migration).toContain('("organizationId", "quoteId", "outputIndex")');
    expect(migration).toContain('("credentialFingerprint", "providerTaskId")');
    expect(migration).toContain('"quoteSnapshot" JSONB NOT NULL');
    expect(migration).toContain('"terminalReceipt" JSONB');
    expect(migration).not.toMatch(/"(?:apiKey|prompt|inputUrls)"/);
  });
});
