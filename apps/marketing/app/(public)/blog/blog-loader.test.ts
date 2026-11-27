import type { Article } from '@genfeedai/models/content/article.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAllPublicArticles = vi.hoisted(() => vi.fn());

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({ findAllPublicArticles }) },
}));

import { getGenfeedArticlesCached } from './blog-loader';

function article(slug: string, handle: string | undefined): Article {
  return { brand: handle ? { slug: handle } : undefined, slug } as Article;
}

describe('getGenfeedArticlesCached', () => {
  beforeEach(() => {
    findAllPublicArticles.mockReset();
  });

  it("keeps Genfeed's own articles, in the order the API returned them", async () => {
    findAllPublicArticles.mockResolvedValue([
      article('newest', 'genfeedai'),
      article('community-post', 'someone-else'),
      article('older', 'genfeedai'),
      article('no-brand', undefined),
    ]);

    const result = await getGenfeedArticlesCached();

    expect(result.map((item) => item.slug)).toEqual(['newest', 'older']);
    expect(findAllPublicArticles).toHaveBeenCalledWith({
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
  });

  it('reads as empty when the API fails, so the blog still renders', async () => {
    findAllPublicArticles.mockRejectedValue(new Error('API down'));

    await expect(getGenfeedArticlesCached()).resolves.toEqual([]);
  });
});
