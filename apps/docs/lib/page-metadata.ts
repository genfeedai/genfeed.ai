/**
 * Per-page SEO metadata for the Nextra docs site.
 *
 * Nextra derives a page's title from its first heading and nothing else, so
 * every route shipped with the same layout-level description and no canonical
 * tag at all. The 5 Aug 2026 site audit saw all 51 docs pages as one duplicated
 * 45-character description — the largest single block of findings on any
 * genfeed.ai host.
 *
 * The description a page gets, in order:
 *   1. `description` in its MDX frontmatter — always wins, hand-written copy.
 *   2. The page's own opening prose, derived here at build time.
 *   3. The site-wide fallback, only if a page has no prose at all.
 *
 * Deriving from real content keeps descriptions unique without asking every
 * contributor to write one, and it cannot go stale the way a hand-maintained
 * table would.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Public origin of the docs site — the origin canonical tags must use. */
export const DOCS_ORIGIN = 'https://docs.genfeed.ai';

/** Keep going past this length so descriptions are not truncated in results. */
export const DESCRIPTION_MIN_LENGTH = 110;

/** Google truncates around here; stay inside it. */
export const DESCRIPTION_MAX_LENGTH = 160;

export const FALLBACK_DESCRIPTION =
  'Documentation for Genfeed.ai — the open-source AI OS for content creation, covering self-hosted Community, hosted Cloud, and the API.';

/** Markdown blocks that are structure, not prose worth describing a page with. */
const NON_PROSE_BLOCK = /^(#{1,6}\s|\||<|:::|>|\s*[-*+]\s|\s*\d+[.)]\s|---$)/;

/** Turn the catch-all route segments into a site-absolute path. */
export function toRoutePath(mdxPath?: readonly string[]): string {
  const segments = (mdxPath ?? []).filter((segment) => segment.length > 0);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

/** Absolute canonical URL for a docs route. */
export function toCanonicalUrl(mdxPath?: readonly string[]): string {
  const route = toRoutePath(mdxPath);
  return route === '/' ? `${DOCS_ORIGIN}/` : `${DOCS_ORIGIN}${route}`;
}

/**
 * Locate the MDX file behind a route. Nextra resolves both `<name>.mdx` and
 * `<name>/index.mdx`, so try each in the same order it does.
 */
export function toContentFile(
  mdxPath: readonly string[] | undefined,
  contentDir: string,
): string | null {
  const segments = (mdxPath ?? []).filter((segment) => segment.length > 0);
  const base = path.join(contentDir, ...segments);
  const candidates =
    segments.length === 0
      ? [path.join(contentDir, 'index.mdx')]
      : [`${base}.mdx`, path.join(base, 'index.mdx')];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export interface ContentRoute {
  /** Site-absolute path, e.g. `/core/installation`. */
  readonly route: string;
  /** Absolute path of the MDX file behind it. */
  readonly file: string;
}

/**
 * Every route the docs site publishes, walked from the content tree. Nextra
 * builds its nav from the same files, so this stays in step with the site
 * without a second list to maintain.
 */
export function listContentRoutes(contentDir: string): ContentRoute[] {
  const routes: ContentRoute[] = [];

  function walk(dir: string, segments: readonly string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, [...segments, entry.name]);
        continue;
      }
      if (!entry.name.endsWith('.mdx')) {
        continue;
      }
      const name = entry.name.slice(0, -'.mdx'.length);
      const parts = name === 'index' ? segments : [...segments, name];
      routes.push({ file: absolute, route: toRoutePath(parts) });
    }
  }

  walk(contentDir, []);
  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

/** Reduce inline Markdown to the words a search engine should read. */
function toPlainText(block: string): string {
  return block
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A bolded pseudo-heading ("**Connection Failed**") or a lead-in to a list
 * ("You will need:") reads as prose once the markdown is stripped, but describes
 * nothing. Sentence punctuation is the tell.
 */
function isLabel(text: string): boolean {
  return text.endsWith(':') || (text.length < 60 && !/[.!?]$/.test(text));
}

/** Cut to the search-result window on a word boundary. */
function truncate(text: string): string {
  if (text.length <= DESCRIPTION_MAX_LENGTH) {
    return text;
  }
  const clipped = text.slice(0, DESCRIPTION_MAX_LENGTH - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  const body = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped;
  return `${body.replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * Build a description from a page's opening prose. Paragraphs are joined until
 * the result clears the minimum, so a page that opens with a one-line summary
 * still gets a full-width description.
 */
export function deriveDescription(source: string): string | null {
  const body = source
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^(?:import|export)\s.*$/gm, '');

  const parts: string[] = [];
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const trimmed = block.trim();
    const text =
      trimmed === '' || NON_PROSE_BLOCK.test(trimmed)
        ? ''
        : toPlainText(trimmed);

    if (text === '' || isLabel(text)) {
      // Skip structure before the intro; stop at the structure after it, so a
      // short intro stays short instead of absorbing text from a later section.
      if (parts.length > 0) {
        break;
      }
      continue;
    }

    parts.push(text);
    if (parts.join(' ').length >= DESCRIPTION_MIN_LENGTH) {
      break;
    }
  }

  const description = parts.join(' ').trim();
  return description === '' ? null : truncate(description);
}

/**
 * Read `description` out of a page's own frontmatter. Nextra normally surfaces
 * this, but reading it here too means the fallback chain holds even if the
 * caller passes nothing — and lets tests assert the real shipped values.
 */
export function readFrontmatterDescription(source: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (block === null) {
    return null;
  }
  const line = /^description:\s*(.+)$/m.exec(block[1] ?? '');
  if (line === null) {
    return null;
  }
  const value = (line[1] ?? '').trim();
  const unquoted = /^(['"])([\s\S]*)\1$/.exec(value);
  const text =
    unquoted === null
      ? value
      : (unquoted[2] ?? '').replace(
          new RegExp(`${unquoted[1]}${unquoted[1]}`, 'g'),
          unquoted[1] ?? '',
        );
  return text.trim() === '' ? null : text.trim();
}

/**
 * Final description for a route: hand-written frontmatter, then derived prose,
 * then the site-wide fallback. `frontmatter` is whatever Nextra already
 * resolved, and wins when present.
 */
export function resolveDescription(
  mdxPath: readonly string[] | undefined,
  contentDir: string,
  frontmatter?: unknown,
): string {
  if (typeof frontmatter === 'string' && frontmatter.trim() !== '') {
    return frontmatter.trim();
  }

  const file = toContentFile(mdxPath, contentDir);
  if (file === null) {
    return FALLBACK_DESCRIPTION;
  }

  try {
    const source = fs.readFileSync(file, 'utf8');
    return (
      readFrontmatterDescription(source) ??
      deriveDescription(source) ??
      FALLBACK_DESCRIPTION
    );
  } catch {
    return FALLBACK_DESCRIPTION;
  }
}
