import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PageMapItem } from 'nextra';
import { describe, expect, it } from 'vitest';
import robots from '../app/robots';
import {
  createDocsSitemap,
  DOCS_ORIGIN,
  getCanonicalUrl,
  withCanonicalMetadata,
} from '../app/seo';

const contentDirectory = fileURLToPath(new URL('../content', import.meta.url));

function findMdxFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? findMdxFiles(entryPath)
      : entry.name.endsWith('.mdx')
        ? [entryPath]
        : [];
  });
}

describe('docs SEO metadata', () => {
  it('builds exact self-referencing canonical URLs', () => {
    expect(getCanonicalUrl()).toBe('https://docs.genfeed.ai/');
    expect(getCanonicalUrl(['guides', 'self-host-quickstart'])).toBe(
      'https://docs.genfeed.ai/guides/self-host-quickstart',
    );

    const metadata = withCanonicalMetadata(
      {
        alternates: { languages: { en: '/guides' } },
        description: 'Route-specific description',
      },
      ['guides'],
    );

    expect(metadata.alternates).toEqual({
      canonical: 'https://docs.genfeed.ai/guides',
      languages: { en: '/guides' },
    });
  });

  it('creates an intended-origin sitemap from actual MDX pages', () => {
    const pageMap: PageMapItem[] = [
      { frontMatter: {}, name: 'index', route: '/' },
      {
        children: [
          { frontMatter: {}, name: 'index', route: '/guides' },
          {
            frontMatter: {},
            name: 'quickstart',
            route: '/guides/quickstart',
          },
        ],
        name: 'guides',
        route: '/guides',
      },
      { data: { guides: 'Guides' } },
    ];

    const sitemap = createDocsSitemap(pageMap);

    expect(sitemap.map((entry) => entry.url)).toEqual([
      'https://docs.genfeed.ai/',
      'https://docs.genfeed.ai/guides',
      'https://docs.genfeed.ai/guides/quickstart',
    ]);
    expect(
      sitemap.every((entry) => new URL(entry.url).origin === DOCS_ORIGIN),
    ).toBe(true);
  });

  it('allows docs crawling and declares the production sitemap', () => {
    expect(robots()).toEqual({
      rules: { allow: '/', userAgent: '*' },
      sitemap: 'https://docs.genfeed.ai/sitemap.xml',
    });
  });

  it('keeps every docs route description unique and within watchdog bounds', () => {
    const descriptions = findMdxFiles(contentDirectory).map((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      const description = source.match(/^description: ['"](.+)['"]$/m)?.[1];

      expect(description, filePath).toBeDefined();
      expect(description?.length, filePath).toBeGreaterThanOrEqual(110);
      expect(description?.length, filePath).toBeLessThanOrEqual(160);
      return description;
    });

    // Bump this with every added or removed page. Three docs PRs landing the
    // same day each incremented it against their own base, so the merge train
    // lost a page — the count is deliberately exact so that shows up here
    // rather than as a route quietly dropping out of `findMdxFiles`.
    expect(descriptions).toHaveLength(54);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
