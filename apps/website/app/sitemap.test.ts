import { helpArticleSlugs } from '@data/help-articles.data';
import { launchArticleSlugs } from '@data/launch-articles.data';
import type { Article } from '@models/content/article.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAllPublicArticles = vi.fn<() => Promise<Article[]>>();

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({ findAllPublicArticles }) },
}));

const { default: sitemap, dynamic } = await import('./sitemap');

beforeEach(() => {
  findAllPublicArticles.mockReset();
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
      expect(urls.has(`https://genfeed.ai/articles/${slug}`)).toBe(true);
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
      expect(urls.has(`https://genfeed.ai/articles/${slug}`)).toBe(true);
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
        slug: 'newly-published-article',
        updatedAt: '2026-08-17T00:00:00.000Z',
      },
    ] as Article[]);

    const routes = await sitemap();
    const articleUrls = routes
      .map((route) => route.url)
      .filter((url) => url.startsWith('https://genfeed.ai/articles/'));

    expect(articleUrls).toEqual([
      `https://genfeed.ai/articles/${launchArticleSlugs[0]}`,
      'https://genfeed.ai/articles/newly-published-article',
    ]);
    expect(articleUrls).not.toContain(
      `https://genfeed.ai/articles/${helpArticleSlugs[0]}`,
    );
    expect(new Set(articleUrls).size).toBe(articleUrls.length);
  });
});
