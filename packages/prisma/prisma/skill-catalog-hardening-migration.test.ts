import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260821010000_harden_skill_catalog/migration.sql',
  ),
  'utf8',
);
const contentWritingBuiltInSkillId = ['cskillbuiltin', 'contentwrite'].join('');

describe('skill catalog hardening migration', () => {
  it('quarantines untrusted null-owned skills', () => {
    expect(migration).toContain('WHERE "organizationId" IS NULL');
    expect(migration).toContain('historical global row');
    expect(migration).toContain('AND "isDeleted" = false;');
  });

  it('quarantines organization-owned collisions with static handler slugs', () => {
    expect(migration).toContain('WHERE "organizationId" IS NOT NULL');
    expect(migration).toContain("'content-writing'");
  });

  it.each([
    'content-geo-optimizer',
    'content-writing',
    'image-generation',
    'trend-discovery',
    'trend-remix',
  ])('seeds the executable built-in skill %s', (slug) => {
    expect(migration).toContain(`'slug', '${slug}'`);
  });

  it('reconciles legacy brand enabledSkills against tenant-safe catalog rows', () => {
    expect(migration).toContain('normalized_brand_skills');
    expect(migration).toContain(
      'skill."organizationId" = brand."organizationId"',
    );
    expect(migration).toContain('skill."organizationId" IS NULL');
    expect(migration).toContain(
      `skill."id" = '${contentWritingBuiltInSkillId}'`,
    );
    expect(migration).toContain("'{enabledSkills}'");
    expect(migration).toContain("jsonb_typeof(raw_entry.value) = 'string'");
    expect(migration).toContain("!~ '^[[:space:]]*$'");
    expect(migration).toContain(
      "skill.\"config\"->'isEnabled' = 'true'::jsonb",
    );
    expect(migration).toContain(
      "skill.\"config\"->>'status' IS DISTINCT FROM 'disabled'",
    );
    expect(migration).toContain('LIMIT 100');
  });
});
