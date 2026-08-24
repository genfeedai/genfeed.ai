#!/usr/bin/env bun

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

import {
  builtInSkillIdentityForSlug,
  ORIGINAL_BUILT_IN_SKILL_CATALOG,
} from '../apps/server/api/src/collections/skills/constants/skill-catalog-identity';

const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'skills');
const MIGRATION_DIR = join(
  ROOT,
  'packages/prisma/prisma/migrations/20260824120000_provision_first_party_skill_catalog',
);
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const ORIGINAL_SLUGS = new Set(
  ORIGINAL_BUILT_IN_SKILL_CATALOG.map((entry) => entry.slug),
);

interface CatalogStub {
  description: string;
  id: string;
  name: string;
  slug: string;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseDescription(content: string): string {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return '';
  }

  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    if (key !== 'description') {
      continue;
    }
    return unquote(line.slice(idx + 1).trim());
  }

  return '';
}

function titleizeSkillSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((token) => {
      if (token === 'x') {
        return 'X';
      }
      if (token === 'seo' || token === 'geo' || token === 'os') {
        return token.toUpperCase();
      }
      return `${token.charAt(0).toUpperCase()}${token.slice(1)}`;
    })
    .join(' ');
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function loadStubs(): CatalogStub[] {
  if (!existsSync(SKILLS_DIR)) {
    return [];
  }

  const stubs: CatalogStub[] = [];
  for (const entry of readdirSync(SKILLS_DIR)) {
    const skillDir = join(SKILLS_DIR, entry);
    if (!statSync(skillDir).isDirectory()) {
      continue;
    }

    const skillPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      continue;
    }

    const slug = basename(skillDir);
    if (ORIGINAL_SLUGS.has(slug)) {
      continue;
    }

    const identity = builtInSkillIdentityForSlug(slug);
    const description = parseDescription(readFileSync(skillPath, 'utf-8'));
    stubs.push({
      description,
      id: identity.id,
      name: titleizeSkillSlug(slug),
      slug,
    });
  }

  return stubs.sort((left, right) => left.slug.localeCompare(right.slug));
}

function renderInsert(stub: CatalogStub): string {
  return `  (
    ${sqlString(stub.id)},
    NULL,
    ${sqlString(stub.name)},
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', ${sqlString(stub.description)},
      'description', ${sqlString(stub.description)},
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', ${sqlString(stub.name)},
      'requiredProviders', jsonb_build_array(),
      'slug', ${sqlString(stub.slug)},
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )`;
}

const stubs = loadStubs();
const slugsSql = stubs.map((stub) => `    ${sqlString(stub.slug)}`).join(',\n');
const valuesSql = stubs.map((stub) => renderInsert(stub)).join(',\n');

const sql = `-- First-party product skills from skills/*/SKILL.md.
-- Original five handler identities are unchanged; this migration only inserts
-- additional catalog-global rows. Full SKILL.md bodies are applied by
-- SkillCatalogSeedService on API boot and must not be duplicated here.
-- Re-running is idempotent (ON CONFLICT DO NOTHING).

UPDATE "skills"
SET
  "isDeleted" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IS NOT NULL
  AND "isDeleted" = false
  AND COALESCE("config"->>'slug', '') = ANY (ARRAY[
${slugsSql}
  ]::text[]);

INSERT INTO "skills" (
  "id",
  "organizationId",
  "label",
  "config",
  "isDeleted",
  "createdAt",
  "updatedAt"
)
VALUES
${valuesSql}
ON CONFLICT ("id") DO NOTHING;
`;

mkdirSync(MIGRATION_DIR, { recursive: true });
writeFileSync(join(MIGRATION_DIR, 'migration.sql'), sql);

process.stdout.write(
  `Wrote ${stubs.length} first-party skill catalog stubs to ${MIGRATION_DIR}/migration.sql\n`,
);
