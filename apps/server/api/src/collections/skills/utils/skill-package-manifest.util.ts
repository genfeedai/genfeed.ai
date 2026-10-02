import {
  MAX_REQUESTED_SKILL_SLUG_LENGTH,
  REQUESTED_SKILL_SLUG_PATTERN,
} from '@api/collections/skills/utils/requested-skill-slugs.util';
import {
  parseSkillPackageArchive,
  SKILL_PACKAGE_LIMITS,
  type SkillPackageFile,
  validateSkillPackageFiles,
} from '@api/collections/skills/utils/skill-package-archive.util';
import { BadRequestException } from '@nestjs/common';
import { maxLength } from 'class-validator';
import {
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
} from 'yaml';

const MAX_BASE64_CHARACTERS = 1_333_336;
const MAX_FRONTMATTER_BYTES = 16_000;
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface SkillPackageMetadata {
  name: string;
  description: string;
  version?: string;
}

export interface ParsedSkillPackageManifest {
  slug: string;
  metadata: SkillPackageMetadata;
  instructions: string;
  files: SkillPackageFile[];
  packageChecksum: string;
  archiveSha256?: string;
  sourceUrl?: string;
}

function invalid(reason: string): never {
  throw new BadRequestException(`Invalid skill package: ${reason}`);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(label);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    invalid('unknown fields');
}
function hasControls(value: string): boolean {
  return [...value].some(
    (char) =>
      char.charCodeAt(0) < 32 ||
      (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159),
  );
}
function boundedText(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || !maxLength(value, max))
    invalid(label);
  return value;
}
function sourceUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const text = boundedText(value, 2000, 'source URL');
  if (
    text !== text.trim() ||
    hasControls(text) ||
    Buffer.byteLength(text, 'utf8') > 2000
  )
    invalid('source URL');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    invalid('source URL');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    /^https?:\/*([^/?#]*)/i.exec(text.replaceAll('\\', '/'))?.[1].includes('@')
  )
    invalid('source URL');
  return text;
}

/** Check AST before materializing any YAML into JavaScript. */
function assertAst(root: unknown): void {
  let count = 0;
  function walk(node: unknown, depth: number): void {
    if (node === null || node === undefined) return;
    count++;
    if (count > 256 || isAlias(node)) invalid('YAML node or alias limit');
    if (isNode(node) && (node.tag || ('anchor' in node && node.anchor)))
      invalid('YAML tag or anchor');
    if (isPair(node)) {
      if (
        !isScalar(node.key) ||
        typeof node.key.value !== 'string' ||
        PROTOTYPE_KEYS.has(node.key.value)
      )
        invalid('YAML mapping key');
      walk(node.key, depth);
      walk(node.value, depth + 1);
    } else if (isMap(node) || isSeq(node)) {
      if (depth > 4) invalid('YAML nesting limit');
      for (const item of node.items)
        walk(item, isPair(item) ? depth : depth + 1);
    } else if (!isScalar(node)) invalid('YAML node');
  }
  walk(root, 1);
}

function frontmatter(content: string): {
  metadata: SkillPackageMetadata;
  body: string;
} {
  const opening = /^(?:\ufeff)?---\r?\n/.exec(content);
  if (!opening) invalid('root SKILL.md frontmatter');
  const remaining = content.slice(opening[0].length);
  const closing = /(?:^|\n)---(?:\r?\n|$)/.exec(remaining);
  if (!closing || closing.index === undefined)
    invalid('frontmatter closing delimiter');
  const payloadEnd = closing.index + (closing[0].startsWith('\n') ? 1 : 0);
  const yaml = remaining.slice(0, payloadEnd);
  if (Buffer.byteLength(yaml, 'utf8') > MAX_FRONTMATTER_BYTES)
    invalid('frontmatter size');
  const document = parseDocument(yaml, {
    schema: 'core',
    uniqueKeys: true,
    customTags: [],
    strict: true,
    version: '1.2',
  });
  if (
    document.errors.length ||
    document.warnings.length ||
    !isMap(document.contents)
  )
    invalid('YAML document');
  assertAst(document.contents);
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  const fields = record(value, 'frontmatter mapping');
  const name = boundedText(fields.name, 140, 'name');
  const description = boundedText(fields.description, 2000, 'description');
  let version: string | undefined;
  if (Object.hasOwn(fields, 'metadata')) {
    const metadata = record(fields.metadata, 'metadata mapping');
    if (Object.hasOwn(metadata, 'version')) {
      version = boundedText(metadata.version, 128, 'version');
      if (hasControls(version)) invalid('version controls');
    }
  }
  const body = remaining.slice(closing.index + closing[0].length).trim();
  if (!body) invalid('empty primary instructions');
  return {
    body,
    metadata: {
      name,
      description,
      ...(version === undefined ? {} : { version }),
    },
  };
}

/** Validates a private import envelope without fetching, executing or persisting. */
export function parseSkillPackageManifest(
  input: unknown,
): ParsedSkillPackageManifest {
  try {
    const envelope = record(input, 'request envelope');
    exactKeys(envelope, [
      'slug',
      'sourceUrl',
      'expectedPackageChecksum',
      'package',
    ]);
    if (
      !Object.hasOwn(envelope, 'slug') ||
      !Object.hasOwn(envelope, 'package') ||
      typeof envelope.slug !== 'string' ||
      envelope.slug.length > MAX_REQUESTED_SKILL_SLUG_LENGTH ||
      !REQUESTED_SKILL_SLUG_PATTERN.test(envelope.slug)
    )
      invalid('slug');
    const provenance = sourceUrl(
      Object.hasOwn(envelope, 'sourceUrl') ? envelope.sourceUrl : undefined,
    );
    const payload = record(envelope.package, 'package envelope');
    if (!Object.hasOwn(payload, 'format')) invalid('package format');
    let archiveSha256: string | undefined;
    let validated: ReturnType<typeof validateSkillPackageFiles>;
    if (payload.format === 'files') {
      if (!Object.hasOwn(payload, 'files')) invalid('files required');
      exactKeys(payload, ['format', 'files']);
      validated = validateSkillPackageFiles(payload.files);
    } else if (payload.format === 'zip') {
      if (!Object.hasOwn(payload, 'archiveBase64')) invalid('ZIP required');
      exactKeys(payload, ['format', 'archiveBase64']);
      const encoded = payload.archiveBase64;
      if (
        typeof encoded !== 'string' ||
        !encoded ||
        encoded.length > MAX_BASE64_CHARACTERS ||
        encoded.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
      )
        invalid('ZIP base64');
      const bytes = Buffer.from(encoded, 'base64');
      if (
        bytes.length > SKILL_PACKAGE_LIMITS.archiveBytes ||
        bytes.toString('base64') !== encoded
      )
        invalid('ZIP base64');
      const archive = parseSkillPackageArchive(bytes);
      archiveSha256 = archive.archiveSha256;
      validated = archive;
    } else invalid('package format');
    if (
      Object.hasOwn(envelope, 'expectedPackageChecksum') &&
      envelope.expectedPackageChecksum !== undefined
    ) {
      const expected = envelope.expectedPackageChecksum;
      if (
        typeof expected !== 'string' ||
        !/^(?:sha256:)?[a-fA-F0-9]{64}$/.test(expected) ||
        expected.replace(/^sha256:/, '').toLowerCase() !==
          validated.packageChecksum
      )
        invalid('package checksum');
    }
    const skill = validated.files.find((file) => file.path === 'SKILL.md');
    if (!skill) invalid('root SKILL.md required');
    const parsed = frontmatter(skill.content);
    const references = validated.files
      .filter((file) => file.path !== 'SKILL.md' && file.path.endsWith('.md'))
      .map((file) => `## Pack file: ${file.path}\n\n${file.content.trim()}`);
    return {
      slug: envelope.slug.toLowerCase(),
      metadata: parsed.metadata,
      instructions: [parsed.body, ...references].join('\n\n'),
      ...validated,
      ...(archiveSha256 ? { archiveSha256 } : {}),
      ...(provenance === undefined ? {} : { sourceUrl: provenance }),
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    invalid('malformed package');
  }
}
