import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CATALOG_COMPILER_VERSION = 'legacy-v1-char-caps';
export const SOURCE_REPOSITORY = 'https://github.com/genfeedai/skills';
export const UPSTREAM_SLUGS = [
  'ad-copy-creator',
  'ad-performance-analyzer',
  'blog-content-creator',
  'competitor-analyzer',
  'content-atomizer',
  'content-seo-optimizer',
  'content-strategist',
  'instagram-content-creator',
  'newsletter-creator',
  'visual-brand-kit',
  'x-content-creator',
  'youtube-content-creator',
];
const APPLICATION_PROCEDURES = new Set([
  'brand-interview',
  'node-creator',
  'workflow-creator',
  'onboarding',
  'scope-validator',
  'openclaw-integration',
  'model-selector',
]);
export const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');
export interface CatalogFile {
  path: string;
  sha256: string;
}
export interface CatalogEntry {
  slug: string;
  ownership: 'upstream' | 'application';
  reason?: string;
  sourceRepository: string;
  sourceCommit?: string;
  sourcePath: string;
  declaredVersion: string;
  files: CatalogFile[];
  packageHash: string;
  instructionsHash: string;
  excludedReferences: { path: string; reason: string }[];
}
export interface CatalogLock {
  schemaVersion: 1;
  compilerVersion: string;
  sourceRepository: string;
  sourceCommit: string;
  sourceCommittedAt: string;
  skills: CatalogEntry[];
}
export function assertSafePath(path: string): void {
  if (
    !path ||
    path
      .split('/')
      .some(
        (part) =>
          !part || part === '.' || part === '..' || part.startsWith('.'),
      ) ||
    path.includes('\\') ||
    [...path].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error(`Unsafe catalog path: ${path}`);
}
export function inventory(directory: string, upstream = false): CatalogFile[] {
  const files: CatalogFile[] = [];
  const seen = new Set<string>();
  function walk(path: string): void {
    const absolute = path ? join(directory, path) : directory;
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink())
      throw new Error(`Catalog symlink rejected: ${absolute}`);
    if (path) {
      assertSafePath(path);
      const key = path.toLowerCase();
      if (seen.has(key)) throw new Error(`Duplicate catalog path: ${path}`);
      seen.add(key);
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort())
        walk(path ? `${path}/${name}` : name);
    } else if (stat.isFile()) {
      if (upstream && (!/\.(md|json)$/.test(path) || stat.mode & 0o111))
        throw new Error(`Unsupported upstream file: ${path}`);
      const contents = readFileSync(absolute);
      if (upstream) {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(contents);
        if (path.endsWith('.json')) JSON.parse(text);
      }
      files.push({ path, sha256: sha256(contents) });
    } else throw new Error(`Unsupported catalog entry: ${absolute}`);
  }
  walk('');
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
export function compileSkill(directory: string, files = inventory(directory)) {
  const content = readFileSync(join(directory, 'SKILL.md'), 'utf8');
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim();
  const sections: string[] = [];
  const excludedReferences: CatalogEntry['excludedReferences'] = [];
  let total = 0;
  let exhausted = false;
  // Match legacy readdir().sort(), including its stop-at-total-cap behavior.
  for (const path of files
    .map((file) => file.path)
    .filter((path) => path.startsWith('references/'))
    .sort()) {
    let reason: string | undefined;
    if (path.split('/').length !== 2) reason = 'nested reference path';
    else if (!path.endsWith('.md')) reason = 'unsupported reference type';
    else if (exhausted) reason = 'total character cap reached';
    else {
      const text = readFileSync(join(directory, path), 'utf8').trim();
      if (!text) reason = 'empty reference';
      else if (text.length > 8000) reason = 'per-file character cap (8000)';
      else if (total + text.length > 16000) {
        exhausted = true;
        reason = 'total character cap (16000)';
      } else {
        sections.push(`## Referenced: ${path.slice(11)}\n\n${text}`);
        total += text.length;
      }
    }
    if (reason) excludedReferences.push({ path, reason });
  }
  return {
    instructions: sections.length
      ? `${body}\n\n${sections.join('\n\n')}`
      : body,
    excludedReferences,
  };
}
export function catalogSlugs(directory: string): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const slug of readdirSync(directory).sort()) {
    const path = join(directory, slug);
    if (lstatSync(path).isSymbolicLink())
      throw new Error(`Catalog symlink rejected: ${path}`);
    if (!lstatSync(path).isDirectory()) continue;
    assertSafePath(slug);
    if (seen.has(slug.toLowerCase()))
      throw new Error(`Duplicate slug: ${slug}`);
    seen.add(slug.toLowerCase());
    if (!existsSync(join(path, 'SKILL.md')))
      throw new Error(`Undeclared catalog directory: ${slug}`);
    slugs.push(slug);
  }
  return slugs;
}
export function createCatalogLock(
  directory: string,
  sourceCommit: string,
  sourceCommittedAt: string,
): CatalogLock {
  return {
    schemaVersion: 1,
    compilerVersion: CATALOG_COMPILER_VERSION,
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit,
    sourceCommittedAt,
    skills: catalogSlugs(directory).map((slug) => {
      const upstream = UPSTREAM_SLUGS.includes(slug);
      const dir = join(directory, slug);
      const files = inventory(dir, upstream);
      const compiled = compileSkill(dir, files);
      const metadata = existsSync(join(dir, 'metadata.json'))
        ? JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8'))
        : {};
      const version = readFileSync(join(dir, 'SKILL.md'), 'utf8').match(
        /^\s+version:\s*["']?([^\s"']+)/m,
      )?.[1];
      return {
        slug,
        ownership: upstream ? 'upstream' : 'application',
        ...(upstream
          ? { sourceCommit }
          : {
              reason: APPLICATION_PROCEDURES.has(slug)
                ? 'Application procedure retained'
                : 'Deferred free content reconciliation',
            }),
        sourceRepository: upstream
          ? SOURCE_REPOSITORY
          : 'https://github.com/genfeedai/genfeed.ai',
        sourcePath: upstream ? slug : `skills/${slug}`,
        declaredVersion: metadata.version ?? version ?? '1.0.0',
        files,
        packageHash: sha256(
          JSON.stringify(files.map((file) => [file.path, file.sha256])),
        ),
        instructionsHash: sha256(compiled.instructions),
        excludedReferences: compiled.excludedReferences,
      };
    }),
  };
}
export function validateCatalogLock(directory: string): CatalogLock {
  const lock = JSON.parse(
    readFileSync(join(directory, 'catalog.lock.json'), 'utf8'),
  ) as CatalogLock;
  if (
    !/^[a-f0-9]{40}$/.test(lock.sourceCommit) ||
    !Number.isFinite(Date.parse(lock.sourceCommittedAt))
  )
    throw new Error('Invalid catalog source pin');
  const expected = createCatalogLock(
    directory,
    lock.sourceCommit,
    lock.sourceCommittedAt,
  );
  if (JSON.stringify(lock) !== JSON.stringify(expected))
    throw new Error(
      'Catalog lock integrity mismatch; run deliberate skills:sync update',
    );
  return lock;
}
