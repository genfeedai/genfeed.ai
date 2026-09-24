import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { builtInSkillIdentityForSlug } from '@api/collections/skills/constants/skill-catalog-identity';
import type {
  FirstPartySkillDefinition,
  FirstPartySkillFrontmatter,
  FirstPartySkillMetadata,
} from './first-party-skill.types';
import { inferFirstPartySkillTaxonomy } from './first-party-skill-taxonomy';
import { compileSkill, validateCatalogLock } from './skill-catalog-artifact';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const SKILLS_SENTINEL = join('image-prompt-engineer', 'SKILL.md');

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

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(content: string): FirstPartySkillFrontmatter | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return null;
  }

  const fields: Record<string, string> = {};
  let metadataPrefix = '';

  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.replace(/\t/g, '  ');
    if (!line.trim()) {
      continue;
    }

    const isIndented = line.startsWith('  ');
    if (!isIndented) {
      metadataPrefix = '';
    }

    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    const value = unquote(line.slice(idx + 1).trim());

    if (!isIndented && value.length === 0) {
      metadataPrefix = `${key}.`;
      continue;
    }

    if (isIndented && metadataPrefix) {
      fields[`${metadataPrefix}${key}`] = value;
      continue;
    }

    fields[key] = value;
  }

  if (!fields.name || !fields.description) {
    return null;
  }

  return {
    description: fields.description,
    name: fields.name,
    version: fields['metadata.version'],
  };
}

function parseMetadataJson(skillDir: string): FirstPartySkillMetadata {
  const metadataPath = join(skillDir, 'metadata.json');
  if (!existsSync(metadataPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(metadataPath, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const record = parsed as Record<string, unknown>;
    return {
      description:
        typeof record.description === 'string' ? record.description : undefined,
      name: typeof record.name === 'string' ? record.name : undefined,
      outputs: Array.isArray(record.outputs)
        ? record.outputs.filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : undefined,
      tags: Array.isArray(record.tags)
        ? record.tags.filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : undefined,
      version: typeof record.version === 'string' ? record.version : undefined,
    };
  } catch {
    return {};
  }
}

export function resolveProductSkillsDirectory(
  startDir: string = process.cwd(),
): string | null {
  const startPoints = [startDir];

  try {
    startPoints.push(fileURLToPath(new URL('.', import.meta.url)));
  } catch {
    // bun/cjs fallback — walk from cwd only
  }

  for (const start of startPoints) {
    let current = start;
    for (let depth = 0; depth < 12; depth += 1) {
      const candidate = join(current, 'skills');
      if (existsSync(join(candidate, SKILLS_SENTINEL))) {
        return candidate;
      }

      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return null;
}

export function loadFirstPartySkillDefinitions(
  skillsDir: string | null = resolveProductSkillsDirectory(),
  options: { allowLegacyFixture?: boolean } = {},
): FirstPartySkillDefinition[] {
  if (!skillsDir || !existsSync(skillsDir)) {
    if (options.allowLegacyFixture) return [];
    throw new Error('Product skill catalog directory is missing');
  }

  const lock = options.allowLegacyFixture
    ? undefined
    : validateCatalogLock(skillsDir);
  const definitions: FirstPartySkillDefinition[] = [];

  for (const entry of readdirSync(skillsDir)) {
    const skillDir = join(skillsDir, entry);
    if (!statSync(skillDir).isDirectory()) {
      continue;
    }

    const skillPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      continue;
    }

    const content = readFileSync(skillPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    const metadata = parseMetadataJson(skillDir);
    const slug = basename(skillDir);
    const identity = builtInSkillIdentityForSlug(slug);
    const taxonomy = inferFirstPartySkillTaxonomy(slug, metadata);
    const { instructions } = compileSkill(skillDir);
    const provenance = lock?.skills.find((skill) => skill.slug === slug);

    definitions.push({
      ...identity,
      ...(provenance
        ? {
            catalogOrigin: provenance.ownership,
            sourceRepository: provenance.sourceRepository,
            sourceCommit: provenance.sourceCommit,
            sourcePath: provenance.sourcePath,
            sourcePackageHash: provenance.packageHash,
            instructionsHash: provenance.instructionsHash,
            catalogCompilerVersion: lock?.compilerVersion,
          }
        : {}),
      category: taxonomy.category,
      channels: taxonomy.channels,
      description: metadata.description ?? frontmatter?.description ?? '',
      instructions,
      modalities: taxonomy.modalities,
      name: titleizeSkillSlug(frontmatter?.name ?? slug),
      surfaces: taxonomy.surfaces,
      version: metadata.version ?? frontmatter?.version ?? '1.0.0',
      workflowStage: taxonomy.workflowStage,
    });
  }

  return definitions.sort((left, right) => left.slug.localeCompare(right.slug));
}

export function loadFirstPartySkillIdentities(
  skillsDir: string | null = resolveProductSkillsDirectory(),
) {
  return loadFirstPartySkillDefinitions(skillsDir).map(({ id, slug }) => ({
    id,
    slug,
  }));
}
