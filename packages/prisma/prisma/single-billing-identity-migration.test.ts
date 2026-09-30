import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
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

  it('dedupes subscriptions before choosing the customer survivor', () => {
    expect(migrationSource.indexOf('WITH ranked_subscriptions')).toBeLessThan(
      migrationSource.indexOf('WITH ranked_customers'),
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

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('single billing identity migration on PostgreSQL', () => {
  it('keeps the Stripe-bound subscription and its customer as a coupled pair', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `billing_migration_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
      await client.query(`
          CREATE TABLE "customers" (
            "id" text PRIMARY KEY,
            "organizationId" text NOT NULL,
            "stripeCustomerId" text,
            "isDeleted" boolean NOT NULL DEFAULT false,
            "updatedAt" timestamp NOT NULL
          );
          CREATE TABLE "subscriptions" (
            "id" text PRIMARY KEY,
            "organizationId" text NOT NULL,
            "customerId" text,
            "stripeSubscriptionId" text,
            "isDeleted" boolean NOT NULL DEFAULT false,
            "updatedAt" timestamp NOT NULL
          );
          CREATE TABLE "users" (
            "id" text PRIMARY KEY,
            "stripeCustomerId" text
          );

          INSERT INTO "customers" VALUES
            ('customer_stripe_bound', 'org_1', 'cus_bound', false, '2026-08-10'),
            ('customer_newer', 'org_1', 'cus_newer', false, '2026-08-11');
          INSERT INTO "subscriptions" VALUES
            ('subscription_stripe_bound', 'org_1', 'customer_stripe_bound', 'sub_live', false, '2026-08-10'),
            ('subscription_newer', 'org_1', 'customer_newer', NULL, false, '2026-08-11');
          INSERT INTO "users" VALUES ('user_1', 'cus_bound');
      `);

      await client.query(migrationSource);

      const subscriptions = await client.query<{
        customerId: string;
        id: string;
        isDeleted: boolean;
      }>(`
          SELECT "id", "customerId", "isDeleted"
          FROM "subscriptions"
          ORDER BY "id"
      `);
      const customers = await client.query<{
        id: string;
        isDeleted: boolean;
        stripeCustomerId: string | null;
      }>(`
          SELECT "id", "stripeCustomerId", "isDeleted"
          FROM "customers"
          ORDER BY "id"
      `);

      expect(subscriptions.rows).toEqual([
        {
          customerId: 'customer_newer',
          id: 'subscription_newer',
          isDeleted: true,
        },
        {
          customerId: 'customer_stripe_bound',
          id: 'subscription_stripe_bound',
          isDeleted: false,
        },
      ]);
      expect(customers.rows).toEqual([
        {
          id: 'customer_newer',
          isDeleted: true,
          stripeCustomerId: 'cus_newer',
        },
        {
          id: 'customer_stripe_bound',
          isDeleted: false,
          stripeCustomerId: 'cus_bound',
        },
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
