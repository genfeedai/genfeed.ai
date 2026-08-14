import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PageMapItem } from 'nextra';
import { describe, expect, it } from 'vitest';
import { GET as getRobots } from '../app/robots.txt/route';
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

  it('allows docs crawling and declares the production sitemap', async () => {
    const response = getRobots();
    const body = await response.text();

    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
    expect(body).toContain('Sitemap: https://docs.genfeed.ai/sitemap.xml');
  });

  it('keeps every docs route description unique and within watchdog bounds', () => {
    const mdxFiles = findMdxFiles(contentDirectory);
    const descriptions = mdxFiles.map((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      const description = source.match(/^description: ['"](.+)['"]$/m)?.[1];

      expect(description, filePath).toBeDefined();
      expect(description?.length, filePath).toBeGreaterThanOrEqual(110);
      expect(description?.length, filePath).toBeLessThanOrEqual(160);
      return description;
    });

    // Count is derived from the content tree (#2444): adding a well-described
    // page must not require editing this test. A silent wipe of the tree still
    // fails because every discovered MDX file must carry a unique description.
    expect(mdxFiles.length).toBeGreaterThan(0);
    expect(descriptions.length).toBe(mdxFiles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
