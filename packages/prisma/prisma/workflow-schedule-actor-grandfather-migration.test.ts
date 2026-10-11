import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const FOLDER = '20261011130000_workflow_schedule_actor_grandfather';
const migration = readFileSync(
  join(prismaDir, `migrations/${FOLDER}/migration.sql`),
  'utf8',
);
const statements = migration.replace(/^\s*--.*$/gm, '');

describe('workflow schedule actor grandfather migration (#6706)', () => {
  it('applies after the columns it reads and both 20261011120000 migrations', () => {
    const folders = readdirSync(join(prismaDir, 'migrations'));
    for (const earlier of [
      '20261009020000_workflow_schedule_initiating_actor',
      '20261011120000_workflow_platform_seed_key',
      '20261011120000_defer_org_scoped_foreign_keys',
    ]) {
      expect(folders).toContain(earlier);
      expect(FOLDER > earlier).toBe(true);
    }
  });

  it('is data only: no schema change, no dynamic SQL', () => {
    expect(statements).not.toMatch(
      /\b(CREATE|ALTER|DROP|TRUNCATE|DELETE\s+FROM)\b/i,
    );
    expect(statements).not.toMatch(/\bEXECUTE\b/i);
  });

  it('never deletes, disables or otherwise changes a workflow beyond its actor', () => {
    expect(statements.match(/\bUPDATE\b/gi)).toHaveLength(1);
    expect(statements).not.toMatch(/\bDELETE\b/i);
    const setClause = statements.match(/\bSET\b([\s\S]*?)\bWHERE\b/i)?.[1];
    expect(setClause).toBeDefined();
    expect(setClause).not.toContain('isDeleted');
    expect(setClause).not.toContain('isScheduleEnabled');
    expect(setClause).not.toContain('platformSeedKey');
    // No duplicate cleanup of any kind: no ranking and no seeded-template grouping.
    expect(statements).not.toMatch(/ROW_NUMBER|PARTITION BY|seeded-template/i);
  });

  it('never marks a row as a platform seed or touches an existing actor', () => {
    expect(statements).not.toMatch(/SET[^;]*"platformSeedKey"\s*=/i);
    expect(statements).toContain('w."platformSeedKey" IS NULL');
    expect(statements).toContain('w."scheduleInitiatingActor" IS NULL');
  });

  it('binds only enabled, active, scheduled rows whose owner is a live member', () => {
    for (const condition of [
      'w."isDeleted" = false',
      'w."isScheduleEnabled" = true',
      `w."status" = 'active'`,
      'w."schedule" IS NOT NULL',
      'm."userId" = w."userId"',
      'm."organizationId" = w."organizationId"',
      'm."isActive" = true',
      'm."isDeleted" = false',
      'o."isDeleted" = false',
      'r."isDeleted" = false',
    ]) {
      expect(statements).toContain(condition);
    }
  });

  it('writes the session-user actor shape and nothing else', () => {
    expect(statements).toContain(`'isApiKey', false`);
    expect(statements).toContain(`'organizationId', w."organizationId"`);
    expect(statements).toContain(`'scopes', '[]'::jsonb`);
    expect(statements).toContain(`'userId', w."userId"`);
    expect(statements).not.toContain('apiKeyId');
  });
});
