import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_MAX_LENGTH,
  DOCS_ORIGIN,
  deriveDescription,
  FALLBACK_DESCRIPTION,
  listContentRoutes,
  resolveDescription,
  toCanonicalUrl,
  toContentFile,
  toRoutePath,
} from '../lib/page-metadata';

const CONTENT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../content',
);

describe('route mapping', () => {
  it('maps the catch-all segments to a path and a canonical URL', () => {
    expect(toRoutePath(undefined)).toBe('/');
    expect(toRoutePath([])).toBe('/');
    expect(toRoutePath(['core', 'installation'])).toBe('/core/installation');

    expect(toCanonicalUrl(undefined)).toBe(`${DOCS_ORIGIN}/`);
    expect(toCanonicalUrl(['faq'])).toBe(`${DOCS_ORIGIN}/faq`);
  });

  it('resolves both <name>.mdx and <name>/index.mdx', () => {
    expect(toContentFile(['faq'], CONTENT_DIR)).toBe(
      path.join(CONTENT_DIR, 'faq.mdx'),
    );
    expect(toContentFile(['core'], CONTENT_DIR)).toBe(
      path.join(CONTENT_DIR, 'core/index.mdx'),
    );
    expect(toContentFile([], CONTENT_DIR)).toBe(
      path.join(CONTENT_DIR, 'index.mdx'),
    );
    expect(toContentFile(['nope'], CONTENT_DIR)).toBeNull();
  });
});

describe('description derivation', () => {
  it('skips frontmatter, imports, headings, tables and code', () => {
    const source = [
      '---',
      'sidebarTitle: Install',
      '---',
      '',
      "import { Callout } from 'nextra/components'",
      '',
      '# Installation',
      '',
      '| Surface | Status |',
      '| --- | --- |',
      '',
      '```bash',
      'bun install',
      '```',
      '',
      'Install Genfeed locally with Bun, then run the API and the app together so every generation path works end to end.',
    ].join('\n');

    expect(deriveDescription(source)).toBe(
      'Install Genfeed locally with Bun, then run the API and the app together so every generation path works end to end.',
    );
  });

  it('joins paragraphs until the description is long enough to be useful', () => {
    const source =
      '# Genfeed\n\nOpen-source AI OS.\n\nIt combines workflows, generation, and publishing in one place for teams that ship content every day.';

    const derived = deriveDescription(source);

    expect(derived).toContain('Open-source AI OS.');
    expect(derived).toContain('It combines workflows');
  });

  it('strips inline markdown and truncates on a word boundary', () => {
    const source = `Read the **[installation guide](/core/installation)** first. ${'detail '.repeat(40)}`;

    const derived = deriveDescription(source) ?? '';

    expect(derived.startsWith('Read the installation guide first.')).toBe(true);
    expect(derived.length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
    expect(derived.endsWith('…')).toBe(true);
    expect(derived).not.toContain('deta…');
  });

  it('returns null when a page has no prose at all', () => {
    expect(deriveDescription('# Title only\n\n## Another heading')).toBeNull();
  });
});

describe('resolveDescription', () => {
  it('prefers hand-written frontmatter over derived prose', () => {
    expect(
      resolveDescription(['faq'], CONTENT_DIR, '  Hand-written copy.  '),
    ).toBe('Hand-written copy.');
  });

  it('falls back to the site description for an unknown route', () => {
    expect(resolveDescription(['nope'], CONTENT_DIR)).toBe(
      FALLBACK_DESCRIPTION,
    );
  });

  it('gives every published route a distinct, in-window description', () => {
    // Regression guard: the 5 Aug 2026 audit saw all 51 docs pages sharing one
    // 45-character description and no canonical tag.
    const routes = listContentRoutes(CONTENT_DIR);
    const descriptions = routes.map(({ route }) =>
      resolveDescription(
        route === '/' ? [] : route.slice(1).split('/'),
        CONTENT_DIR,
      ),
    );

    expect(routes.length).toBeGreaterThan(40);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const description of descriptions) {
      expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
      expect(description).not.toBe(
        'Generate AI-powered content for your business',
      );
    }
  });
});

describe('listContentRoutes', () => {
  it('maps index files to their directory and covers every MDX file', () => {
    const routes = listContentRoutes(CONTENT_DIR);
    const paths = routes.map((entry) => entry.route);
    const mdxCount = fs
      .readdirSync(CONTENT_DIR, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mdx')).length;

    expect(routes).toHaveLength(mdxCount);
    expect(paths).toContain('/');
    expect(paths).toContain('/core');
    expect(paths).toContain('/core/installation');
    expect(paths).toContain('/guides/publishing/social-media/instagram');
  });
});
