import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260827120000_add_billing_accounts/migration.sql',
  ),
  'utf8',
);

describe('billing accounts migration (#3612)', () => {
  it('creates the billing account tables and enums', () => {
    expect(migrationSource).toContain('CREATE TYPE "BillingAccountStatus"');
    expect(migrationSource).toContain('CREATE TABLE "billing_accounts"');
    expect(migrationSource).toContain('CREATE TABLE "credit_reservations"');
  });

  it('does not rewrite Stripe customer or subscription identifiers', () => {
    expect(migrationSource).not.toContain('SET "stripeSubscriptionId"');
    expect(migrationSource).toContain(
      'UPDATE "subscriptions" s\nSET "billingAccountId"',
    );
  });

  it('backfills one billing account per organization without merging wallets', () => {
    expect(migrationSource).toContain('\'ba_\' || o."id"');
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "credit_balances_billingAccountId_active_key"',
    );
  });
});
