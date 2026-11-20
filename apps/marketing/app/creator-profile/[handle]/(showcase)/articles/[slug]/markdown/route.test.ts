import type { Article } from '@models/content/article.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPublicArticleBySlug = vi.fn<() => Promise<Article | null>>();

vi.mock('@services/core/logger.service', () => ({
  logger: { warn: vi.fn() },
}));

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      findPublicProfileBySlug: vi.fn(async () => null),
      getPublicArticleBySlug,
    }),
  },
}));

vi.mock('../../../creator-loader', () => ({
  getPublicBrandBySlug: vi.fn(async () => ({ label: 'Shayla Monroe' })),
}));

const route = await import('./route');

function article(overrides: Partial<Article> = {}): Article {
  return {
    brand: { slug: 'shayla' },
    content: '<h2>Why</h2><p>Because.</p>',
    createdAt: '2026-11-01T00:00:00.000Z',
    id: 'article-1',
    label: 'Shipping faster',
    publishedAt: '2026-11-18T09:00:00.000Z',
    slug: 'shipping-faster',
    summary: 'A short summary.',
    tags: [{ label: 'growth' }],
    updatedAt: '2026-11-19T09:00:00.000Z',
    ...overrides,
  } as Article;
}

function call(handle: string, slug: string): Promise<Response> {
  return route.GET(new Request('https://genfeed.ai/'), {
    params: Promise.resolve({ handle, slug }),
  });
}

describe('GET article markdown', () => {
  beforeEach(() => {
    getPublicArticleBySlug.mockReset();
  });

  it('serves the article as Markdown with the brief and cache headers', async () => {
    getPublicArticleBySlug.mockResolvedValue(article());

    const response = await call('shayla', 'shipping-faster');
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/markdown; charset=utf-8',
    );
    expect(response.headers.get('Vary')).toBe('Accept');
    expect(response.headers.get('Link')).toBe(
      '<https://genfeed.ai/@shayla/articles/shipping-faster>; rel="canonical"',
    );
    expect(text).toContain('# Shipping faster');
    expect(text).toContain(
      '- **Canonical URL:** https://genfeed.ai/@shayla/articles/shipping-faster',
    );
    expect(text).toContain('- **Topics:** growth');
    expect(text).toContain('## Why\n\nBecause.');
  });

  it('is a 404, not an empty page, for an article under another creator', async () => {
    getPublicArticleBySlug.mockResolvedValue(article());

    const response = await call('someone-else', 'shipping-faster');

    expect(response.status).toBe(404);
  });

  it('is a 404 for a missing article', async () => {
    getPublicArticleBySlug.mockResolvedValue(null);

    expect((await call('shayla', 'nope')).status).toBe(404);
  });
});
