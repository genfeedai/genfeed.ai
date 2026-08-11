import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260811140000_enforce_single_billing_identity_per_org/migration.sql',
  ),
  'utf8',
);

describe('single billing identity per org migration (#2762)', () => {
  it('enforces one active customer row per organization', () => {
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "customers_organizationId_active_key"',
    );
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX "customers_organizationId_active_key"\nON "customers"\("organizationId"\)\nWHERE "isDeleted" = false;/,
    );
  });

  it('enforces one active subscription row per organization', () => {
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX "subscriptions_organizationId_active_key"\nON "subscriptions"\("organizationId"\)\nWHERE "isDeleted" = false;/,
    );
  });

  it('keeps the customer row that live subscriptions reference when deduping', () => {
    expect(migrationSource).toContain(
      'WHERE s."customerId" = c."id" AND s."isDeleted" = false',
    );
    expect(migrationSource).toContain('PARTITION BY c."organizationId"');
  });

  it('keeps the subscription row bound to a Stripe subscription when deduping', () => {
    expect(migrationSource).toContain(
      '(s."stripeSubscriptionId" IS NOT NULL) DESC',
    );
  });

  it('soft-deletes duplicate rows instead of hard-deleting them', () => {
    const softDeletes = migrationSource.match(
      /SET "isDeleted" = true, "updatedAt" = now\(\)/g,
    );
    expect(softDeletes).toHaveLength(2);
    expect(migrationSource).not.toMatch(/DELETE FROM/);
  });

  it('clears org-billing customer ids that leaked onto the consumer-lane user slot', () => {
    expect(migrationSource).toContain('UPDATE "users"');
    expect(migrationSource).toContain('SET "stripeCustomerId" = NULL');
    expect(migrationSource).toMatch(
      /IN \(\s*SELECT "stripeCustomerId"\s*FROM "customers"/,
    );
  });
});
