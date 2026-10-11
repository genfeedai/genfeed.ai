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

  it('soft-deletes older duplicate seeds before grandfathering actors', () => {
    const dedupe = statements.indexOf('"isDeleted" = true');
    const grandfather = statements.indexOf('jsonb_build_object');
    expect(dedupe).toBeGreaterThan(-1);
    expect(grandfather).toBeGreaterThan(dedupe);
    expect(statements).toContain(
      `w."metadata"->>'sourceType' = 'seeded-template'`,
    );
    expect(statements).toContain(
      'PARTITION BY s."organizationId", s."templateId", s."brandScope"',
    );
    expect(statements).toContain(
      'ORDER BY s."isPinned" DESC, s."createdAt" ASC, s."id" ASC',
    );
    expect(statements).toMatch(
      /"isScheduleEnabled" = false,\s+"scheduleInitiatingActor" = NULL/,
    );
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
