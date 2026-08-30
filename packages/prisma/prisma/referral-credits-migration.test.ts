import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260830140000_native_referral_credits/migration.sql',
  ),
  'utf8',
);
const ledgerIndexSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260830141000_referral_credit_idempotency_index/migration.sql',
  ),
  'utf8',
);

const stripSqlComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

describe('native referral credits migration (#1435)', () => {
  it('creates durable attribution and reward records with bounded amounts', () => {
    expect(migrationSource).toContain('CREATE TABLE "referral_codes"');
    expect(migrationSource).toContain('CREATE TABLE "referrals"');
    expect(migrationSource).toContain('CREATE TABLE "referral_rewards"');
    expect(migrationSource).toContain('referral_rewards_amount_check');
    expect(migrationSource).toContain('"reversedCredits" <= "rewardCredits"');
    expect(schemaSource).toContain('model ReferralReward');
  });

  it('keeps first-touch uniqueness scoped to active attribution rows', () => {
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "referrals_referredBillingAccountId_active_key"',
    );
    expect(migrationSource).toContain(
      'ON "referrals"("referredBillingAccountId")\n  WHERE "isDeleted" = false;',
    );
    expect(schemaSource).toContain('referredBillingAccountId String');
  });

  it('builds the hot-ledger idempotency index concurrently and in isolation', () => {
    const ledgerIndexSql = stripSqlComments(ledgerIndexSource);

    expect(ledgerIndexSql.match(/CREATE UNIQUE INDEX/g)).toHaveLength(1);
    expect(ledgerIndexSql).toContain(
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_org_idempotency_key"',
    );
    expect(ledgerIndexSql).toContain(
      'ON "credit_transactions" ("organizationId", "idempotencyKey")',
    );
    expect(ledgerIndexSql).toContain('WHERE "isDeleted" = false');
    expect(ledgerIndexSql).toContain('AND "idempotencyKey" IS NOT NULL');
    expect(migrationSource).not.toContain(
      'credit_transactions_org_idempotency_key',
    );
  });

  it('does not model the raw partial indexes as unconditional Prisma uniques', () => {
    expect(schemaSource).not.toContain(
      '@@unique([organizationId, idempotencyKey], map: "credit_transactions_org_idempotency_key")',
    );
    expect(schemaSource).not.toMatch(
      /referredBillingAccountId\s+String\s+@unique/,
    );
  });
});
