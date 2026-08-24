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
    'migrations/20260824180000_outreach_campaign_target_ownership/migration.sql',
  ),
  'utf8',
);

describe('outreach campaign target ownership migration (#3405)', () => {
  it('validates existing owner drift before installing the composite relation', () => {
    expect(migrationSource).toContain(
      'campaign_targets contains organization ids that do not match their parent outreach_campaigns',
    );
    expect(migrationSource).not.toMatch(
      /UPDATE "campaign_targets"[\s\S]*SET "organizationId"/,
    );
  });

  it('installs compound campaign ownership and tenant batch indexes', () => {
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "outreach_campaigns_id_organizationId_key"',
    );
    expect(migrationSource).toContain(
      'ADD CONSTRAINT "campaign_targets_campaignId_organizationId_fkey"',
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "campaign_targets_org_campaign_status_deleted_idx"',
    );
    expect(schemaSource).toContain(
      '@@unique([id, organizationId], map: "outreach_campaigns_id_organizationId_key")',
    );
    expect(schemaSource).toContain(
      'fields: [campaignId, organizationId], references: [id, organizationId]',
    );
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('outreach campaign target ownership on PostgreSQL', () => {
  it('rejects target/campaign organization drift and concurrent double claims', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `outreach_own_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}"`);
      await client.query(`
        CREATE TABLE "outreach_campaigns" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "status" text NOT NULL DEFAULT 'draft',
          "isDeleted" boolean NOT NULL DEFAULT false
        );

        CREATE TABLE "campaign_targets" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "campaignId" text NOT NULL,
          "status" text NOT NULL DEFAULT 'PENDING',
          "isDeleted" boolean NOT NULL DEFAULT false
        );

        ALTER TABLE "campaign_targets"
        ADD CONSTRAINT "campaign_targets_campaignId_fkey"
        FOREIGN KEY ("campaignId") REFERENCES "outreach_campaigns"("id");

        INSERT INTO "outreach_campaigns" ("id", "organizationId")
        VALUES ('c1', 'org_1');

        INSERT INTO "campaign_targets" ("id", "organizationId", "campaignId")
        VALUES ('t_drift', 'org_2', 'c1');
      `);

      await expect(client.query(migrationSource)).rejects.toThrow(
        /organization ids that do not match/,
      );

      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}"`);
      await client.query(`
        CREATE TABLE "outreach_campaigns" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "status" text NOT NULL DEFAULT 'draft',
          "isDeleted" boolean NOT NULL DEFAULT false
        );

        CREATE TABLE "campaign_targets" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "campaignId" text NOT NULL,
          "status" text NOT NULL DEFAULT 'PENDING',
          "scheduledAt" timestamp,
          "isDeleted" boolean NOT NULL DEFAULT false
        );

        ALTER TABLE "campaign_targets"
        ADD CONSTRAINT "campaign_targets_campaignId_fkey"
        FOREIGN KEY ("campaignId") REFERENCES "outreach_campaigns"("id");

        INSERT INTO "outreach_campaigns" ("id", "organizationId", "status")
        VALUES ('c1', 'org_1', 'active');

        INSERT INTO "campaign_targets"
          ("id", "organizationId", "campaignId", "status")
        VALUES ('t1', 'org_1', 'c1', 'PENDING');
      `);

      await client.query(migrationSource);

      await expect(
        client.query(`
          INSERT INTO "campaign_targets"
            ("id", "organizationId", "campaignId")
          VALUES ('t_foreign', 'org_2', 'c1')
        `),
      ).rejects.toThrow();

      const firstClaim = await client.query(`
        UPDATE "campaign_targets"
        SET "status" = 'PROCESSING'
        WHERE "id" = 't1'
          AND "organizationId" = 'org_1'
          AND "isDeleted" = false
          AND "status" = 'PENDING'
      `);
      const secondClaim = await client.query(`
        UPDATE "campaign_targets"
        SET "status" = 'PROCESSING'
        WHERE "id" = 't1'
          AND "organizationId" = 'org_1'
          AND "isDeleted" = false
          AND "status" = 'PENDING'
      `);

      expect(firstClaim.rowCount).toBe(1);
      expect(secondClaim.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
