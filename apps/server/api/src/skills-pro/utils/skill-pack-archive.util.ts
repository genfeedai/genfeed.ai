import { parseSkillPackageArchive } from '@api/collections/skills/utils/skill-package-archive.util';

export interface SkillsProPackMetadata {
  category?: string;
  description: string;
  name: string;
  tags: string[];
  version: string;
}

export interface ParsedSkillsProPack {
  files: Array<{ content: string; path: string }>;
  instructions: string;
  metadata: SkillsProPackMetadata;
}

function parseMetadata(content: string): SkillsProPackMetadata {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new Error('Skills Pro pack metadata.json is invalid JSON');
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Skills Pro pack metadata.json must be an object');
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== 'string' ||
    !record.name.trim() ||
    typeof record.description !== 'string' ||
    typeof record.version !== 'string' ||
    !record.version.trim()
  ) {
    throw new Error('Skills Pro pack metadata is missing required fields');
  }

  return {
    category: typeof record.category === 'string' ? record.category : undefined,
    description: record.description,
    name: record.name,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    version: record.version,
  };
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

export function parseSkillsProPack(archive: Buffer): ParsedSkillsProPack {
  const { files } = parseSkillPackageArchive(archive);
  const metadataFile = files.find((file) => file.path === 'metadata.json');
  const skillFile = files.find((file) => file.path === 'SKILL.md');

  if (!metadataFile || !skillFile) {
    throw new Error('Skills Pro pack must contain metadata.json and SKILL.md');
  }

  const references = files
    .filter((file) => file.path !== 'SKILL.md')
    .filter((file) => file.path.endsWith('.md'))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `## Pack file: ${file.path}\n\n${file.content.trim()}`);
  const primaryInstructions = stripFrontmatter(skillFile.content);

  return {
    files,
    instructions: [primaryInstructions, ...references]
      .filter(Boolean)
      .join('\n\n'),
    metadata: parseMetadata(metadataFile.content),
  };
}
