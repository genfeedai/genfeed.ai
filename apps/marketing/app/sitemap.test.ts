import { helpArticleSlugs } from '@data/help-articles.data';
import { launchArticleSlugs } from '@data/launch-articles.data';
import type { Article } from '@models/content/article.model';
import type { Brand } from '@models/organization/brand.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAllPublicArticles = vi.fn<() => Promise<Article[]>>();
const findPublicBrands = vi.fn<() => Promise<Brand[]>>();

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({ findAllPublicArticles, findPublicBrands }),
  },
}));

const { default: sitemap, dynamic } = await import('./sitemap');

beforeEach(() => {
  findAllPublicArticles.mockReset();
  findPublicBrands.mockReset();
  findPublicBrands.mockResolvedValue([]);
});

describe('website sitemap', () => {
  it('is generated at request time so newly published articles do not await a deployment', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('keeps every launch article discoverable when the article API is unavailable', async () => {
    findAllPublicArticles.mockRejectedValue(new Error('API unavailable'));

    const routes = await sitemap();
    const urls = new Set(routes.map((route) => route.url));

    for (const slug of launchArticleSlugs) {
      expect(urls.has(`https://genfeed.ai/@genfeedai/articles/${slug}`)).toBe(
        true,
      );
    }
    expect(urls.has('https://genfeed.ai/contact')).toBe(true);
    expect(urls.has('https://genfeed.ai/tools/ai-model-selector')).toBe(true);
  });

  it('keeps every Cloud help article discoverable when the article API is unavailable', async () => {
    findAllPublicArticles.mockRejectedValue(new Error('API unavailable'));

    const routes = await sitemap();
    const urls = new Set(routes.map((route) => route.url));

    expect(helpArticleSlugs.length).toBeGreaterThan(0);
    for (const slug of helpArticleSlugs) {
      expect(urls.has(`https://genfeed.ai/@genfeedai/articles/${slug}`)).toBe(
        true,
      );
    }
  });

  it('lists every agent client and client-channel page', async () => {
    findAllPublicArticles.mockRejectedValue(new Error('API unavailable'));

    const routes = await sitemap();
    const urls = new Set(routes.map((route) => route.url));

    expect(urls.has('https://genfeed.ai/muse')).toBe(true);
    expect(urls.has('https://genfeed.ai/grok-bot')).toBe(true);
    expect(urls.has('https://genfeed.ai/claude-code/linkedin')).toBe(true);
    expect(urls.has('https://genfeed.ai/muse/instagram')).toBe(true);
    expect(urls.has('https://genfeed.ai/claude-code/discord')).toBe(false);
    expect(urls.size).toBe(routes.length);
  });

  it('lists the X landing page and leaves the player card off the sitemap', async () => {
    findAllPublicArticles.mockRejectedValue(new Error('API unavailable'));

    const routes = await sitemap();
    const urls = new Set(routes.map((route) => route.url));

    expect(urls.has('https://genfeed.ai/x')).toBe(true);
    expect(urls.has('https://genfeed.ai/x/card')).toBe(false);
  });

  it('lists the expert landing page', async () => {
    findAllPublicArticles.mockRejectedValue(new Error('API unavailable'));

    const routes = await sitemap();
    const urls = new Set(routes.map((route) => route.url));

    expect(urls.has('https://genfeed.ai/experts')).toBe(true);
  });

  it('keeps the developer landing page discoverable when the article API is unavailable', async () => {
    findAllPublicArticles.mockRejectedValue(new Error('API unavailable'));

    const routes = await sitemap();

    expect(
      routes.find((route) => route.url === 'https://genfeed.ai/developers'),
    ).toMatchObject({ changeFrequency: 'weekly', priority: 0.8 });
  });

  it('lists only public API articles when the article API answers', async () => {
    findAllPublicArticles.mockResolvedValue([
      {
        slug: launchArticleSlugs[0],
        updatedAt: '2026-08-17T00:00:00.000Z',
      },
      {
        brand: { slug: 'shayla' },
        slug: 'newly-published-article',
        updatedAt: '2026-08-17T00:00:00.000Z',
      },
    ] as Article[]);

    const routes = await sitemap();
    const articleUrls = routes
      .map((route) => route.url)
      .filter((url) => url.includes('/articles/'));

    expect(articleUrls).toEqual([
      `https://genfeed.ai/@genfeedai/articles/${launchArticleSlugs[0]}`,
      'https://genfeed.ai/@shayla/articles/newly-published-article',
    ]);
    expect(articleUrls).not.toContain(
      `https://genfeed.ai/@genfeedai/articles/${helpArticleSlugs[0]}`,
    );
    expect(new Set(articleUrls).size).toBe(articleUrls.length);
  });

  it('only dates routes whose real update time is known', async () => {
    findAllPublicArticles.mockResolvedValue([
      { slug: 'dated', updatedAt: '2026-10-01T00:00:00.000Z' },
      { slug: 'undated' },
    ] as Article[]);

    const routes = await sitemap();
    const byUrl = new Map(routes.map((route) => [route.url, route]));

    expect(
      byUrl.get('https://genfeed.ai/@genfeedai/articles/dated')?.lastModified,
    ).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(
      byUrl.get('https://genfeed.ai/@genfeedai/articles/undated'),
    ).not.toHaveProperty('lastModified');
    expect(byUrl.get('https://genfeed.ai/pricing')).not.toHaveProperty(
      'lastModified',
    );
  });

  it('lists the profile of every article author and public creator', async () => {
    findAllPublicArticles.mockResolvedValue([
      { brand: { slug: 'shayla' }, slug: 'hello' },
    ] as Article[]);
    findPublicBrands.mockResolvedValue([
      { id: 'b1', slug: 'acme' },
      { id: 'b2', slug: 'shayla' },
    ] as Brand[]);

    const urls = (await sitemap())
      .map((route) => route.url)
      .filter((url) => /^https:\/\/genfeed\.ai\/@[^/]+$/.test(url));

    expect(urls).toEqual([
      'https://genfeed.ai/@genfeedai',
      'https://genfeed.ai/@shayla',
      'https://genfeed.ai/@acme',
    ]);
  });

  it('keeps article authors listed when the brand list is unavailable', async () => {
    findAllPublicArticles.mockResolvedValue([]);
    findPublicBrands.mockRejectedValue(new Error('API unavailable'));

    const urls = new Set((await sitemap()).map((route) => route.url));

    expect(urls.has('https://genfeed.ai/@genfeedai')).toBe(true);
    expect(urls.has('https://genfeed.ai/community')).toBe(true);
  });
});
