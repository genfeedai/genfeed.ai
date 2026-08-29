import type { Article } from '@models/content/article.model';
import { describe, expect, it, vi } from 'vitest';
import { SITE_DIRECTORY } from './sitemap-content';

const findAllPublicArticles = vi.fn<() => Promise<Article[]>>();

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({ findAllPublicArticles }) },
}));

const { default: sitemap } = await import('../../sitemap');

const ORIGIN = 'https://genfeed.ai';

/**
 * Paths the directory deliberately omits, mirroring `ORPHAN_ALLOWLIST` in
 * `apps/website/scripts/check-orphans.ts` plus the destinations that already
 * have a permanent link elsewhere in the chrome (home, the footer bottom bar,
 * and this page itself).
 */
const DIRECTORY_EXEMPT = new Set<string>([
  '/',
  '/dfy',
  '/done-for-you',
  '/fleet',
  '/founder-content',
  '/launch-content',
  '/linkedin-content',
  '/llms-full.txt',
  '/llms.txt',
  '/podcast-to-content',
  '/privacy',
  '/retainer',
  '/sitemap',
  '/terms',
]);

function directoryHrefs(): Set<string> {
  return new Set(
    SITE_DIRECTORY.flatMap((section) => section.links.map((link) => link.href)),
  );
}

async function sitemapPaths(): Promise<string[]> {
  findAllPublicArticles.mockRejectedValue(new Error('API unavailable'));

  const routes = await sitemap();

  return routes.map((route) => route.url.slice(ORIGIN.length) || '/');
}

describe('SITE_DIRECTORY', () => {
  it('lists only destinations the XML sitemap actually publishes', async () => {
    const published = new Set(await sitemapPaths());

    for (const href of directoryHrefs()) {
      expect(
        published.has(href),
        `${href} is missing from app/sitemap.ts`,
      ).toBe(true);
    }
  });

  it('gives every published page an internal link, directly or via its hub', async () => {
    const hrefs = directoryHrefs();
    const unlinked = (await sitemapPaths()).filter((path) => {
      if (DIRECTORY_EXEMPT.has(path) || hrefs.has(path)) {
        return false;
      }

      // Hub pages (/vs, /tools, /use-cases, /integrations, /articles) link
      // their own children, so listing the hub keeps them reachable.
      const hub = path.slice(0, path.lastIndexOf('/'));

      return !hrefs.has(hub);
    });

    expect(unlinked).toEqual([]);
  });

  it('never lists the same destination twice', () => {
    const hrefs = SITE_DIRECTORY.flatMap((section) =>
      section.links.map((link) => link.href),
    );

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
