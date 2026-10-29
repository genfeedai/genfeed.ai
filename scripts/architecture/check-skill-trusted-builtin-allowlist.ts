/**
 * Guardrail: every first-party skill in `skills/index.json` must be in the SQL
 * allowlist behind system ownership (#8539).
 *
 * `skill_is_trusted_builtin` decides which ownerless skill rows are system
 * skills. A slug added to the catalog but not to the function lands as an
 * ownerless, quarantined stub, and the reference-data sync then dies on "Skill
 * ownership is immutable" (the 0.2.19 hosted deploy failure, fixed by
 * `20261029060000_trust_clip_editor_skill`).
 *
 * The function is redefined by migrations, so the newest definition wins. The
 * allowlist may hold slugs the index does not list (older built-ins that other
 * catalog sources still seed); only a missing index slug fails.
 *
 *   bun run check:skill-trusted-builtin-allowlist
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = 'packages/prisma/prisma/migrations';
const SKILLS_INDEX = 'skills/index.json';
const FUNCTION_DEFINITION =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+skill_is_trusted_builtin\s*\(/iu;
const SLUG_LIST = /\(config->>'slug'\)\s+IN\s*\(([^)]*)\)/iu;

export type TrustedBuiltinAllowlist = {
  migration: string;
  slugs: string[];
};

export type TrustedBuiltinAllowlistViolation = {
  migration: string;
  slug: string;
};

export function parseAllowlistSlugs(sql: string): string[] | null {
  const match = sql.match(SLUG_LIST);
  if (!match) {
    return null;
  }
  return [...match[1].matchAll(/'([^']+)'/gu)].map((slug) => slug[1]);
}

export function readLatestAllowlist(
  rootDir: string = process.cwd(),
): TrustedBuiltinAllowlist {
  const migrationsDir = path.join(rootDir, MIGRATIONS_DIR);
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  for (const migration of migrations) {
    const sql = readFileSync(
      path.join(migrationsDir, migration, 'migration.sql'),
      'utf8',
    );
    if (!FUNCTION_DEFINITION.test(sql)) {
      continue;
    }
    const slugs = parseAllowlistSlugs(sql);
    if (!slugs) {
      throw new Error(
        `${MIGRATIONS_DIR}/${migration} defines skill_is_trusted_builtin but its slug list could not be parsed.`,
      );
    }
    return { migration, slugs };
  }

  throw new Error(
    `No migration under ${MIGRATIONS_DIR} defines skill_is_trusted_builtin.`,
  );
}

export function readIndexSlugs(rootDir: string = process.cwd()): string[] {
  const index = JSON.parse(
    readFileSync(path.join(rootDir, SKILLS_INDEX), 'utf8'),
  ) as { skills: Array<{ slug: string }> };
  return index.skills.map((skill) => skill.slug);
}

export function checkSkillTrustedBuiltinAllowlist(
  rootDir: string = process.cwd(),
): TrustedBuiltinAllowlistViolation[] {
  const { migration, slugs } = readLatestAllowlist(rootDir);
  const allowed = new Set(slugs);
  return readIndexSlugs(rootDir)
    .filter((slug) => !allowed.has(slug))
    .map((slug) => ({ migration, slug }));
}

if (import.meta.main) {
  const violations = checkSkillTrustedBuiltinAllowlist();

  if (violations.length > 0) {
    console.error('First-party skills missing from skill_is_trusted_builtin:');
    for (const { migration, slug } of violations) {
      console.error(
        `- ${slug} is in ${SKILLS_INDEX} but not in the allowlist defined by ${migration}. Add a migration that redefines skill_is_trusted_builtin with it, like 20261029060000_trust_clip_editor_skill.`,
      );
    }
    process.exit(1);
  }

  console.log('Skill trusted-builtin allowlist guard passed.');
}
