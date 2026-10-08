import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationPath = join(
  prismaDir,
  'migrations/20261008143000_studio_draft_image_edit/migration.sql',
);
const migrationSource = readFileSync(
  existsSync(migrationPath)
    ? migrationPath
    : join(
        prismaDir,
        'migrations/20260928154500_studio_generate_drafts/migration.sql',
      ),
  'utf8',
);
const preferenceMigrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261008120000_advanced_mode_user_only/migration.sql',
  ),
  'utf8',
);
const originalMigrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260928154500_studio_generate_drafts/migration.sql',
  ),
  'utf8',
);
const dtoSource = readFileSync(
  join(
    prismaDir,
    '../../../apps/server/api/src/collections/studio-generate-drafts/dto/upsert-studio-generate-draft.dto.ts',
  ),
  'utf8',
);
const draftTypes = [
  ...(
    dtoSource.match(/STUDIO_GENERATE_DRAFT_TYPES = \[([\s\S]*?)\]/)?.[1] ?? ''
  ).matchAll(/'([^']+)'/g),
].map((match) => match[1]);

describe('Studio draft persistence migrations', () => {
  it('permits every API draft type without removing the existing types', () => {
    expect(draftTypes).toContain('image-edit');
    for (const type of draftTypes)
      expect(migrationSource).toContain(`'${type}'`);
    expect(migrationSource).toContain('studio_generate_drafts_type_check');
    expect(migrationSource).not.toMatch(/DROP TABLE|DELETE FROM/i);
  });

  it('preserves personal preferences and the column selected by serving clients', () => {
    expect(preferenceMigrationSource).toContain(
      'ALTER COLUMN "isAdvancedMode" SET DEFAULT false',
    );
    expect(preferenceMigrationSource).not.toMatch(
      /DROP COLUMN|UPDATE "settings"/i,
    );
  });
});

const databaseUrl = process.env.STUDIO_DRAFT_MIGRATION_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('Studio draft constraint expansion on PostgreSQL', () => {
  it('autosaves an image-edit draft in place, keeps settings, and rejects unknown types', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const originalCheck = originalMigrationSource.match(
        /CHECK \("type" IN \([^;]+?\)\)/,
      )?.[0];
      if (!originalCheck)
        throw new Error('Original Studio draft constraint missing');
      await client.query(`CREATE TEMP TABLE "studio_generate_drafts" (
        "id" text PRIMARY KEY, "type" text NOT NULL, "prompt" text NOT NULL,
        "settingsByType" jsonb NOT NULL,
        CONSTRAINT "studio_generate_drafts_type_check" ${originalCheck}
      ) ON COMMIT DROP`);
      await client.query(`INSERT INTO "studio_generate_drafts" VALUES
        ('saved-draft', 'image', 'Keep this prompt', '{"image-edit":{"editSize":"1024x1024"}}')`);
      await client.query('SAVEPOINT before_edit');
      await expect(
        client.query(
          `UPDATE "studio_generate_drafts" SET "type" = 'image-edit'`,
        ),
      ).rejects.toThrow(/studio_generate_drafts_type_check/);
      await client.query('ROLLBACK TO SAVEPOINT before_edit');
      await client.query(migrationSource);
      for (const type of draftTypes) {
        await client.query(
          'UPDATE "studio_generate_drafts" SET "type" = $1 WHERE "id" = $2',
          [type, 'saved-draft'],
        );
      }
      await client.query(
        `UPDATE "studio_generate_drafts" SET "type" = 'image-edit' WHERE "id" = 'saved-draft'`,
      );
      const saved = await client.query(
        'SELECT * FROM "studio_generate_drafts"',
      );
      expect(saved.rows).toEqual([
        {
          id: 'saved-draft',
          type: 'image-edit',
          prompt: 'Keep this prompt',
          settingsByType: { 'image-edit': { editSize: '1024x1024' } },
        },
      ]);
      await client.query('SAVEPOINT before_unknown');
      await expect(
        client.query(`UPDATE "studio_generate_drafts" SET "type" = 'unknown'`),
      ).rejects.toThrow(/studio_generate_drafts_type_check/);
      await client.query('ROLLBACK TO SAVEPOINT before_unknown');
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
});
