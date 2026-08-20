import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260812200000_ad_performance_identity/migration.sql',
  ),
  'utf8',
);

const adPerformanceModel = schemaSource.slice(
  schemaSource.indexOf('model AdPerformance {'),
  schemaSource.indexOf('model Trend {'),
);

describe('AdPerformance identity migration (#2511)', () => {
  it('promotes identity scalars and the unique identityKey on AdPerformance only', () => {
    expect(adPerformanceModel).toContain('date                      DateTime?');
    expect(adPerformanceModel).toContain('granularity               String?');
    expect(adPerformanceModel).toContain('externalAccountId         String?');
    expect(adPerformanceModel).toContain('externalCampaignId        String?');
    expect(adPerformanceModel).toContain('externalAdSetId           String?');
    expect(adPerformanceModel).toContain('externalAdId              String?');
    expect(adPerformanceModel).toContain('identityKey               String');
    expect(adPerformanceModel).toContain(
      '@@unique([organizationId, identityKey], map: "ad_performance_organizationId_identityKey_key")',
    );
    expect(
      adPerformanceModel.match(/^\s+identityKey\s+String$/gmu),
    ).toHaveLength(1);
  });

  it('adds a composite list index that can serve org/platform/granularity/date queries', () => {
    expect(adPerformanceModel).toContain(
      '@@index([organizationId, isDeleted, date(sort: Desc)], map: "ad_performance_org_deleted_date_idx")',
    );
    expect(adPerformanceModel).toContain(
      '@@index([organizationId, isDeleted, adPlatform, granularity, date(sort: Desc)], map: "ad_performance_org_deleted_platform_granularity_date_idx")',
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "ad_performance_org_deleted_platform_granularity_date_idx"',
    );
    expect(migrationSource).toContain(
      'ON "ad_performance"("organizationId", "isDeleted", "adPlatform", "granularity", "date" DESC)',
    );
  });

  it('backfills scalars from JSON, including the ad-group alias', () => {
    expect(migrationSource).toContain("NULLIF(\"data\"->>'granularity', '')");
    expect(migrationSource).toContain(
      "NULLIF(\"data\"->>'externalAccountId', '')",
    );
    expect(migrationSource).toContain(
      "NULLIF(\"data\"->>'externalCampaignId', '')",
    );
    expect(migrationSource).toContain(
      "NULLIF(\"data\"->>'externalAdSetId', '')",
    );
    expect(migrationSource).toContain(
      "NULLIF(\"data\"->>'externalAdGroupId', '')",
    );
    expect(migrationSource).toContain("NULLIF(\"data\"->>'externalAdId', '')");
  });

  it('builds identityKey with the v1 pipe-delimited UTC date format', () => {
    expect(migrationSource).toContain("'v1|' ||");
    expect(migrationSource).toContain(
      'to_char("date", \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\')',
    );
  });

  it('dedupes colliding identity keys before enforcing uniqueness', () => {
    expect(migrationSource).toContain(
      'PARTITION BY "organizationId", "identityKey"',
    );
    expect(migrationSource).toContain('|dup:');
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "ad_performance_organizationId_identityKey_key"',
    );
    expect(migrationSource).toContain(
      'ALTER COLUMN "identityKey" SET NOT NULL',
    );
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

type ExplainRow = {
  'QUERY PLAN': unknown;
};

describePostgres('AdPerformance identity backfill on PostgreSQL', () => {
  it('maps JSON identity fields to scalars and a stable identityKey', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `ad_perf_identity_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
      await client.query(`
        CREATE TABLE "ad_performance" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "credentialId" text,
          "adPlatform" text,
          "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
          "isDeleted" boolean NOT NULL DEFAULT false,
          "updatedAt" timestamp NOT NULL
        );

        INSERT INTO "ad_performance" VALUES
          (
            'row-account',
            'org-1',
            'cred-1',
            'meta',
            '{"date":"2026-07-01T00:00:00.000Z","granularity":"account","externalAccountId":"acct-1"}'::jsonb,
            false,
            '2026-08-01'
          ),
          (
            'row-adset-alias',
            'org-1',
            'cred-1',
            'meta',
            '{"date":"2026-07-02","granularity":"adset","externalAccountId":"acct-1","externalAdGroupId":"group-1"}'::jsonb,
            false,
            '2026-08-02'
          ),
          (
            'row-dup-older',
            'org-1',
            'cred-1',
            'meta',
            '{"date":"2026-07-01T00:00:00.000Z","granularity":"account","externalAccountId":"acct-1"}'::jsonb,
            false,
            '2026-07-01'
          ),
          (
            'row-date-only',
            'org-2',
            NULL,
            'google-ads',
            '{"date":"2026-07-03","granularity":"campaign","externalAccountId":"acct-2","externalCampaignId":"camp-2"}'::jsonb,
            false,
            '2026-08-03'
          );
      `);

      await client.query(migrationSource);

      const rows = await client.query<{
        date: Date;
        externalAdSetId: string | null;
        granularity: string | null;
        id: string;
        identityKey: string;
        isDeleted: boolean;
      }>(`
        SELECT "id", "date", "granularity", "externalAdSetId", "identityKey", "isDeleted"
        FROM "ad_performance"
        ORDER BY "id"
      `);

      const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row]));

      expect(byId['row-account']?.identityKey).toBe(
        'v1|meta|2026-07-01T00:00:00.000Z|account|acct-1|||',
      );
      expect(byId['row-account']?.isDeleted).toBe(false);
      expect(byId['row-adset-alias']?.externalAdSetId).toBe('group-1');
      expect(byId['row-adset-alias']?.identityKey).toBe(
        'v1|meta|2026-07-02T00:00:00.000Z|adset|acct-1||group-1|',
      );
      expect(byId['row-dup-older']?.isDeleted).toBe(true);
      expect(byId['row-dup-older']?.identityKey).toBe(
        'v1|meta|2026-07-01T00:00:00.000Z|account|acct-1||||dup:row-dup-older',
      );
      expect(byId['row-date-only']?.identityKey).toBe(
        'v1|google-ads|2026-07-03T00:00:00.000Z|campaign|acct-2|camp-2||',
      );

      await client.query('COMMIT');
    } finally {
      await client.query('ROLLBACK');
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });

  it('uses the unique identity index and the list composite index', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `ad_perf_explain_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}", public`);
      await client.query(`
        CREATE TABLE "ad_performance" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "credentialId" text,
          "adPlatform" text,
          "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
          "isDeleted" boolean NOT NULL DEFAULT false,
          "updatedAt" timestamp NOT NULL
        );
      `);
      await client.query(migrationSource);
      await client.query('SET enable_seqscan = off');

      const upsertPlan = await client.query<ExplainRow>(
        `EXPLAIN (FORMAT JSON, COSTS OFF)
        SELECT "id"
        FROM "ad_performance"
        WHERE "organizationId" = $1 AND "identityKey" = $2`,
        ['org-1', 'v1|meta|2026-07-01T00:00:00.000Z|account|acct-1|||'],
      );
      const listPlan = await client.query<ExplainRow>(
        `EXPLAIN (FORMAT JSON, COSTS OFF)
        SELECT "id"
        FROM "ad_performance"
        WHERE "organizationId" = $1
          AND "isDeleted" = false
          AND "adPlatform" = $2
          AND "granularity" = $3
          AND "date" >= $4
          AND "date" <= $5
        ORDER BY "date" DESC
        LIMIT 50 OFFSET 0`,
        [
          'org-1',
          'meta',
          'account',
          new Date('2026-07-01T00:00:00.000Z'),
          new Date('2026-07-31T00:00:00.000Z'),
        ],
      );

      expect(JSON.stringify(upsertPlan.rows[0]?.['QUERY PLAN'])).toContain(
        'ad_performance_organizationId_identityKey_key',
      );
      expect(JSON.stringify(listPlan.rows[0]?.['QUERY PLAN'])).toContain(
        'ad_performance_org_deleted_platform_granularity_date_idx',
      );
    } finally {
      await client.query('RESET enable_seqscan');
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
