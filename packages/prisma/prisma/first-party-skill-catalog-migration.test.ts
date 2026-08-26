import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const repoRoot = join(prismaDir, '../../..');
const skillsDir = join(repoRoot, 'skills');
const builtInSkillIdPrefix = 'cskillbuiltin';
const originalFiveIds = [
  `${builtInSkillIdPrefix}contentgeo`,
  `${builtInSkillIdPrefix}contentwrite`,
  `${builtInSkillIdPrefix}imagegenerate`,
  `${builtInSkillIdPrefix}trenddiscover`,
  `${builtInSkillIdPrefix}trendremix`,
];
const originalMigration = readFileSync(
  join(
    prismaDir,
    'migrations/20260821010000_harden_skill_catalog/migration.sql',
  ),
  'utf8',
);
const firstPartyMigration = readFileSync(
  join(
    prismaDir,
    'migrations/20260824120000_provision_first_party_skill_catalog/migration.sql',
  ),
  'utf8',
);

function compactBuiltInSkillId(slug: string): string {
  return `cskillbuiltin${slug.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

function listFirstPartySlugs(): string[] {
  return readdirSync(skillsDir)
    .filter((entry) => {
      const skillDir = join(skillsDir, entry);
      return (
        statSync(skillDir).isDirectory() &&
        existsSync(join(skillDir, 'SKILL.md'))
      );
    })
    .sort();
}

describe('first-party skill catalog migration', () => {
  it('does not rename or recreate the original five handler identities', () => {
    for (const id of originalFiveIds) {
      expect(originalMigration).toContain(`'${id}'`);
      expect(firstPartyMigration).not.toContain(`'${id}'`);
    }
    expect(firstPartyMigration).not.toContain("'content-writing'");
    expect(firstPartyMigration).not.toContain("'image-generation'");
  });

  it('inserts a catalog-global stub for every first-party SKILL.md except the original five', () => {
    const slugs = listFirstPartySlugs();

    for (const slug of slugs) {
      if (slug === 'content-geo-optimizer') {
        expect(firstPartyMigration).not.toContain(`'slug', '${slug}'`);
        continue;
      }

      expect(firstPartyMigration).toContain(`'slug', '${slug}'`);
      expect(firstPartyMigration).toContain(`'${compactBuiltInSkillId(slug)}'`);
    }
  });

  it('quarantines organization-owned collisions and is idempotent', () => {
    expect(firstPartyMigration).toContain('WHERE "organizationId" IS NOT NULL');
    expect(firstPartyMigration).toContain('ON CONFLICT ("id") DO NOTHING');
    expect(firstPartyMigration).toContain("'image-prompt-engineer'");
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

type CatalogSkillRow = {
  category: string;
  createdAt: Date;
  id: string;
  isBuiltIn: boolean;
  isDeleted: boolean;
  isEnabled: boolean;
  label: string | null;
  name: string;
  organizationId: string | null;
  slug: string;
  source: string;
  status: string;
  updatedAt: Date;
  version: string;
  workflowStage: string;
};

type FixtureSkillRow = {
  config: Record<string, unknown>;
  createdAt: string;
  id: string;
  isDeleted: boolean;
  label: string | null;
  updatedAt: string;
};

describePostgres('first-party skill catalog migration on PostgreSQL', () => {
  it('provisions cinematic prompting idempotently and isolates tenant collisions', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `first_party_skill_catalog_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
      await client.query(`
        CREATE TABLE "skills" (
          "id" text PRIMARY KEY,
          "organizationId" text,
          "label" text,
          "config" jsonb NOT NULL DEFAULT '{}',
          "isDeleted" boolean NOT NULL DEFAULT false,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now()
        );

        INSERT INTO "skills"
          ("id", "organizationId", "label", "config", "isDeleted", "createdAt", "updatedAt")
        VALUES
          (
            'org_collision',
            'org_1',
            'Tenant Cinematic Prompting',
            '{"fixture":"collision","slug":"cinematic-prompting"}'::jsonb,
            false,
            '2026-01-01 00:00:00',
            '2026-01-01 00:00:00'
          ),
          (
            'org_unrelated',
            'org_1',
            'Unrelated Tenant Skill',
            '{"fixture":"unrelated","slug":"custom-storyboarding"}'::jsonb,
            false,
            '2026-01-02 00:00:00',
            '2026-01-02 00:00:00'
          );
      `);

      const fixtureRowsBefore = await client.query<FixtureSkillRow>(`
        SELECT
          "id",
          "label",
          "config",
          "isDeleted",
          "createdAt"::text AS "createdAt",
          "updatedAt"::text AS "updatedAt"
        FROM "skills"
        ORDER BY "id"
      `);

      await client.query(firstPartyMigration);

      const firstCatalogRows = await client.query<CatalogSkillRow>(`
        SELECT
          "id",
          "organizationId",
          "label",
          "isDeleted",
          "createdAt",
          "updatedAt",
          "config"->>'category' AS "category",
          ("config"->>'isBuiltIn')::boolean AS "isBuiltIn",
          ("config"->>'isEnabled')::boolean AS "isEnabled",
          "config"->>'name' AS "name",
          "config"->>'slug' AS "slug",
          "config"->>'source' AS "source",
          "config"->>'status' AS "status",
          "config"->>'version' AS "version",
          "config"->>'workflowStage' AS "workflowStage"
        FROM "skills"
        WHERE "organizationId" IS NULL
          AND "isDeleted" = false
          AND "config"->>'slug' = 'cinematic-prompting'
        ORDER BY "id"
      `);

      expect(firstCatalogRows.rows).toEqual([
        {
          category: 'writing',
          createdAt: expect.any(Date),
          id: 'cskillbuiltincinematicprompting',
          isBuiltIn: true,
          isDeleted: false,
          isEnabled: true,
          label: 'Cinematic Prompting',
          name: 'Cinematic Prompting',
          organizationId: null,
          slug: 'cinematic-prompting',
          source: 'built_in',
          status: 'published',
          updatedAt: expect.any(Date),
          version: '1.0.0',
          workflowStage: 'creation',
        },
      ]);

      await client.query(firstPartyMigration);

      const secondCatalogRows = await client.query<CatalogSkillRow>(`
        SELECT
          "id",
          "organizationId",
          "label",
          "isDeleted",
          "createdAt",
          "updatedAt",
          "config"->>'category' AS "category",
          ("config"->>'isBuiltIn')::boolean AS "isBuiltIn",
          ("config"->>'isEnabled')::boolean AS "isEnabled",
          "config"->>'name' AS "name",
          "config"->>'slug' AS "slug",
          "config"->>'source' AS "source",
          "config"->>'status' AS "status",
          "config"->>'version' AS "version",
          "config"->>'workflowStage' AS "workflowStage"
        FROM "skills"
        WHERE "organizationId" IS NULL
          AND "isDeleted" = false
          AND "config"->>'slug' = 'cinematic-prompting'
        ORDER BY "id"
      `);
      const fixtureRowsAfter = await client.query<FixtureSkillRow>(`
        SELECT
          "id",
          "label",
          "config",
          "isDeleted",
          "createdAt"::text AS "createdAt",
          "updatedAt"::text AS "updatedAt"
        FROM "skills"
        WHERE "id" IN ('org_collision', 'org_unrelated')
        ORDER BY "id"
      `);

      expect(secondCatalogRows.rows).toEqual(firstCatalogRows.rows);

      const collisionAfter = fixtureRowsAfter.rows.find(
        (row) => row.id === 'org_collision',
      );
      expect(collisionAfter).toMatchObject({
        config: { fixture: 'collision', slug: 'cinematic-prompting' },
        createdAt: '2026-01-01 00:00:00',
        id: 'org_collision',
        isDeleted: true,
        label: 'Tenant Cinematic Prompting',
      });
      expect(collisionAfter?.updatedAt).not.toBe('2026-01-01 00:00:00');

      expect(
        fixtureRowsAfter.rows.find((row) => row.id === 'org_unrelated'),
      ).toEqual(
        fixtureRowsBefore.rows.find((row) => row.id === 'org_unrelated'),
      );

      await client.query('COMMIT');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
