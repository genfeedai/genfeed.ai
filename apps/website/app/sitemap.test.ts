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
  });

  it('merges API articles with launch fallbacks without duplicate URLs', async () => {
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

    expect(articleUrls).toContain(
      'https://genfeed.ai/articles/newly-published-article',
    );
    expect(new Set(articleUrls).size).toBe(articleUrls.length);
  });
});
