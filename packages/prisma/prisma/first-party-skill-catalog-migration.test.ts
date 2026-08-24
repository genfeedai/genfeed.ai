import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const repoRoot = join(prismaDir, '../../..');
const skillsDir = join(repoRoot, 'skills');
const originalFiveIds = [
  'cskillbuiltincontentgeo',
  'cskillbuiltincontentwrite',
  'cskillbuiltinimagegenerate',
  'cskillbuiltintrenddiscover',
  'cskillbuiltintrendremix',
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
