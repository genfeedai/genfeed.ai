import type { Article } from '@models/content/article.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAllPublicArticles = vi.fn<() => Promise<Article[]>>();

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({ findAllPublicArticles }) },
}));

const route = await import('./route');

function article(slug: string, overrides: Partial<Article> = {}): Article {
  return {
    brand: { slug: 'shayla' },
    label: `Title ${slug}`,
    publishedAt: '2026-11-18T09:00:00.000Z',
    slug,
    summary: `About ${slug}.`,
    ...overrides,
  } as Article;
}

describe('GET /llms-articles.txt', () => {
  beforeEach(() => {
    findAllPublicArticles.mockReset();
  });

  it('links each public article to its Markdown copy under its creator handle', async () => {
    findAllPublicArticles.mockResolvedValue([
      article('first'),
      article('second', { brand: undefined }),
      article('', { label: 'No slug' }),
    ]);

    const response = await route.GET();
    const text = await response.text();

    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(text).toContain(
      '- [Title first](https://genfeed.ai/@shayla/articles/first.md): 2026-11-18 · About first.',
    );
    expect(text).toContain(
      '- [Title second](https://genfeed.ai/@genfeedai/articles/second.md)',
    );
    expect(text).not.toContain('No slug');
  });

  it('serves an empty index instead of an error when the list cannot load', async () => {
    findAllPublicArticles.mockRejectedValue(new Error('api down'));

    const response = await route.GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('_No public articles yet._');
  });
});
