import { ArticleStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseApiClient } from './base-api-client';
import { ContentClient } from './content.client';

describe('reviewed article lifecycle', () => {
  const post = vi.fn();
  const get = vi.fn();
  const patch = vi.fn();
  const client = new ContentClient({
    request: async (
      _operation: string,
      call: (http: unknown) => Promise<unknown>,
    ) => call({ post, get, patch }),
    failWithDetail: vi.fn(),
    failWith: vi.fn(),
    logger: { debug: vi.fn() },
  } as unknown as BaseApiClient);
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({
      data: {
        data: {
          id: 'article-1',
          attributes: {
            label: 'Tested guide',
            content: '<p>Full reviewed content</p>',
            status: ArticleStatus.DRAFT,
          },
        },
      },
    });
    patch.mockResolvedValue({
      data: {
        data: {
          id: 'article-1',
          attributes: {
            label: 'Tested guide',
            status: ArticleStatus.PUBLISHED,
          },
        },
      },
    });
    get.mockResolvedValue({
      data: {
        expiresInSeconds: 3600,
        url: 'https://genfeed.ai/articles/tested-guide?previewToken=secret',
      },
    });
  });
  it('imports full reviewed HTML as a draft without the generation endpoint or publication fields', async () => {
    const content = `<p>${'Source-backed content. '.repeat(100)}</p>`;
    const result = await client.createArticleDraft({
      label: 'Tested guide',
      slug: 'tested-guide',
      summary: 'A verified workflow.',
      content,
    });
    expect(post).toHaveBeenCalledWith('/articles', {
      data: {
        type: 'articles',
        attributes: {
          label: 'Tested guide',
          slug: 'tested-guide',
          summary: 'A verified workflow.',
          content,
          status: ArticleStatus.DRAFT,
        },
      },
    });
    expect(result.id).toBe('article-1');
    expect(patch).not.toHaveBeenCalled();
  });
  it('uses the authenticated preview endpoint without logging the bearer URL', async () => {
    const result = await client.getArticlePreview('article-1');
    expect(get).toHaveBeenCalledWith('/articles/article-1/preview-links');
    expect(result.expiresInSeconds).toBe(3600);
  });
  it('publishes separately without rewriting the reviewed content or publication date', async () => {
    await client.publishArticle('article-1');
    expect(patch).toHaveBeenCalledWith('/articles/article-1', {
      data: {
        type: 'articles',
        id: 'article-1',
        attributes: { status: ArticleStatus.PUBLISHED },
      },
    });
    expect(post).not.toHaveBeenCalled();
  });
});
