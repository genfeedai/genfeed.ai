import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PageMapItem } from 'nextra';
import { describe, expect, it } from 'vitest';
import { GET as getRobots } from '../app/robots.txt/route';
import {
  createDocsSitemap,
  DOCS_DEFAULT_TITLE,
  DOCS_DESCRIPTION,
  DOCS_ORIGIN,
  DOCS_SITE_NAME,
  DOCS_SOCIAL_CARD_URL,
  DOCS_TITLE_SUFFIX,
  DOCS_TITLE_TEMPLATE,
  getCanonicalUrl,
  withPageSeoMetadata,
} from '../app/seo';

const contentDirectory = fileURLToPath(new URL('../content', import.meta.url));
const layoutPath = fileURLToPath(new URL('../app/layout.tsx', import.meta.url));
const catchAllPagePath = fileURLToPath(
  new URL('../app/[[...mdxPath]]/page.tsx', import.meta.url),
);

// Ahrefs site-audit thresholds, calibrated against the 2026-08-19 crawl of
// docs.genfeed.ai: a rendered <title> shorter than 15 characters is "Title too
// short", longer than 63 is "Title too long".
const TITLE_MIN_LENGTH = 15;
const TITLE_MAX_LENGTH = 63;

function readRenderedTitle(filePath: string): string {
  const source = fs.readFileSync(filePath, 'utf8');
  const frontmatterTitle = source.match(/^title:\s*['"]?(.+?)['"]?\s*$/m)?.[1];
  const firstHeading = source.match(/^# (.+)$/m)?.[1];
  const title = frontmatterTitle ?? firstHeading;

  expect(title, filePath).toBeDefined();
  return title as string;
}
const apiReferencePath = path.join(
  contentDirectory,
  'api-reference',
  'reference.mdx',
);

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

    const metadata = withPageSeoMetadata(
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

  it('gives the interactive API reference exactly one server-rendered H1', () => {
    const source = fs.readFileSync(apiReferencePath, 'utf8');

    // SwaggerUI is `ssr: false`, so its own heading never reaches a crawler and
    // the route shipped no H1 at all (2026-08-19 audit). The MDX heading is the
    // only server-rendered one; Swagger renders its API title as an h2 below.
    expect(source).toContain('<SwaggerUI />');
    expect(source.match(/^# /gm) ?? []).toHaveLength(1);
    expect(source).toContain('# API Reference');
  });

  it('builds a complete Open Graph card for every docs route', () => {
    const metadata = withPageSeoMetadata(
      { description: 'Route-specific description', title: 'Brands' },
      ['cloud', 'brands'],
    );

    expect(metadata.openGraph).toEqual({
      description: 'Route-specific description',
      images: [DOCS_SOCIAL_CARD_URL],
      siteName: DOCS_SITE_NAME,
      title: `Brands${DOCS_TITLE_SUFFIX}`,
      type: 'website',
      url: 'https://docs.genfeed.ai/cloud/brands',
    });
    expect(metadata.twitter).toEqual({
      card: 'summary_large_image',
      description: 'Route-specific description',
      images: [DOCS_SOCIAL_CARD_URL],
      title: `Brands${DOCS_TITLE_SUFFIX}`,
    });
  });

  it('falls back to the docs-wide title and description when a route omits them', () => {
    const metadata = withPageSeoMetadata({}, ['cli']);

    expect(metadata.description).toBe(DOCS_DESCRIPTION);
    expect(metadata.openGraph).toMatchObject({
      description: DOCS_DESCRIPTION,
      title: DOCS_DEFAULT_TITLE,
      url: 'https://docs.genfeed.ai/cli',
    });
  });

  it('wires the page SEO builder into the catch-all route', () => {
    const source = fs.readFileSync(catchAllPagePath, 'utf8');

    expect(source).toContain('withPageSeoMetadata(metadata, params.mdxPath)');
  });

  it('suffixes every rendered title through the layout template', () => {
    const source = fs.readFileSync(layoutPath, 'utf8');

    expect(DOCS_TITLE_TEMPLATE).toBe(`%s${DOCS_TITLE_SUFFIX}`);
    expect(source).toContain(
      'title: { default: DOCS_DEFAULT_TITLE, template: DOCS_TITLE_TEMPLATE }',
    );
  });

  it('keeps every suffixed docs title inside the audit thresholds', () => {
    const mdxFiles = findMdxFiles(contentDirectory);

    expect(mdxFiles.length).toBeGreaterThan(0);

    for (const filePath of mdxFiles) {
      const renderedLength =
        readRenderedTitle(filePath).length + DOCS_TITLE_SUFFIX.length;

      expect(renderedLength, filePath).toBeGreaterThan(TITLE_MIN_LENGTH);
      expect(renderedLength, filePath).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
    }
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
