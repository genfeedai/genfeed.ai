import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260827120000_add_billing_accounts/migration.sql',
  ),
  'utf8',
);
const onlineIndexSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260827150000_billing_account_online_indexes/migration.sql',
  ),
  'utf8',
);
const validationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260827160000_validate_billing_account_foreign_keys/migration.sql',
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
    expect(onlineIndexSource).toContain(
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_balances_billingAccountId_active_key"',
    );
  });

  it('quarantines duplicate and cross-organization Stripe identities', () => {
    expect(migrationSource).toContain('"activeCustomerCount" = 1');
    expect(migrationSource).toContain(
      'other."organizationId" <> candidate."organizationId"',
    );
  });

  it('builds indexes online and validates initially unvalidated foreign keys later', () => {
    expect(migrationSource).toContain('ON UPDATE CASCADE NOT VALID');
    expect(migrationSource).not.toContain('CREATE INDEX IF NOT EXISTS');
    expect(onlineIndexSource).toContain('INDEX CONCURRENTLY');
    expect(onlineIndexSource).toContain(
      'credit_balances_organizationId_active_key',
    );
    expect(validationSource).toContain('VALIDATE CONSTRAINT');
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('billing account identity backfill on PostgreSQL', () => {
  it('copies only an unambiguous Stripe customer identity', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `billing_account_backfill_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
      await client.query(`
        CREATE TABLE "users" ("id" text PRIMARY KEY);
        CREATE TABLE "organizations" (
          "id" text PRIMARY KEY, "userId" text NOT NULL, "label" text NOT NULL,
          "billingAccountId" text, "isDeleted" boolean NOT NULL DEFAULT false,
          "updatedAt" timestamp NOT NULL DEFAULT now()
        );
        CREATE TABLE "customers" (
          "id" text PRIMARY KEY, "organizationId" text NOT NULL,
          "stripeCustomerId" text, "billingAccountId" text,
          "isDeleted" boolean NOT NULL DEFAULT false
        );
        CREATE TABLE "organization_settings" (
          "organizationId" text PRIMARY KEY, "subscriptionTier" text
        );
        CREATE TABLE "subscriptions" (
          "id" text PRIMARY KEY, "organizationId" text NOT NULL,
          "billingAccountId" text, "isDeleted" boolean NOT NULL DEFAULT false
        );
        CREATE TABLE "credit_balances" (
          "id" text PRIMARY KEY, "organizationId" text UNIQUE NOT NULL,
          "balance" double precision NOT NULL DEFAULT 0,
          "isDeleted" boolean NOT NULL DEFAULT false
        );
        CREATE TABLE "credit_transactions" (
          "id" text PRIMARY KEY, "organizationId" text NOT NULL,
          "billingAccountId" text, "isDeleted" boolean NOT NULL DEFAULT false,
          "createdAt" timestamp NOT NULL DEFAULT now()
        );
        INSERT INTO "users" VALUES ('user_1');
        INSERT INTO "organizations" ("id", "userId", "label") VALUES
          ('org_duplicate', 'user_1', 'Duplicate'),
          ('org_shared_1', 'user_1', 'Shared 1'),
          ('org_shared_2', 'user_1', 'Shared 2'),
          ('org_unique', 'user_1', 'Unique');
        INSERT INTO "customers" VALUES
          ('c_dup_1', 'org_duplicate', 'cus_dup_1', NULL, false),
          ('c_dup_2', 'org_duplicate', 'cus_dup_2', NULL, false),
          ('c_shared_1', 'org_shared_1', 'cus_shared', NULL, false),
          ('c_shared_2', 'org_shared_2', 'cus_shared', NULL, false),
          ('c_unique', 'org_unique', 'cus_unique', NULL, false);
      `);

      await client.query(migrationSource);

      const result = await client.query<{
        id: string;
        stripeCustomerId: string | null;
      }>(`
        SELECT "id", "stripeCustomerId"
        FROM "billing_accounts"
        ORDER BY "id"
      `);
      expect(result.rows).toEqual([
        { id: 'ba_org_duplicate', stripeCustomerId: null },
        { id: 'ba_org_shared_1', stripeCustomerId: null },
        { id: 'ba_org_shared_2', stripeCustomerId: null },
        { id: 'ba_org_unique', stripeCustomerId: 'cus_unique' },
      ]);
      await client.query('COMMIT');
    } finally {
      await client.query('ROLLBACK');
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
