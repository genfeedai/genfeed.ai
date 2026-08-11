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

// 54 → 52: #2538 retired core-loop/corpus-health and
// core-loop/prelaunch-corpus-backfill without lowering the floor.
// 52 → 48: #2767 moved the prompting guide, asset prompting guide, prompt
// templates, and launch-day playbook to genfeed.ai/articles — tutorial content
// belongs on the main domain, docs stay product and developer reference.
const MINIMUM_DOCS_PAGES = 48;

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

    // Floor, not an exact count: adding a well-described page must not require
    // editing this test, but pages vanishing silently still trips it. Lower it
    // deliberately in the same PR that removes a page.
    expect(descriptions.length).toBeGreaterThanOrEqual(MINIMUM_DOCS_PAGES);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
