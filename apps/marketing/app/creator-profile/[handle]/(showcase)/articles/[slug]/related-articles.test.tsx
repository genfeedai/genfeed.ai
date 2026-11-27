import type { Article } from '@models/content/article.model';
import { Children, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCreatorArticleListCached = vi.hoisted(() => vi.fn());

vi.mock('./article-loader', () => ({ getCreatorArticleListCached }));

import RelatedArticles from './related-articles';

function articles(count: number): Article[] {
  return Array.from(
    { length: count },
    (_, index) => ({ id: `id-${index}`, slug: `post-${index}` }) as Article,
  );
}

async function relatedSlugs(slug: string): Promise<string[]> {
  const element = (await RelatedArticles({
    brandId: 'brand-1',
    handle: 'genfeedai',
    slug,
  })) as ReactElement<{ children: ReactElement[] }>;
  const grid = Children.toArray(element.props.children).at(-1) as ReactElement<{
    articles: Article[];
  }>;
  return grid.props.articles.map((article) => article.slug);
}

describe('RelatedArticles', () => {
  beforeEach(() => {
    getCreatorArticleListCached.mockReset();
  });

  it('links to the three articles that follow, wrapping at the end', async () => {
    getCreatorArticleListCached.mockResolvedValue(articles(5));

    expect(await relatedSlugs('post-1')).toEqual([
      'post-2',
      'post-3',
      'post-4',
    ]);
    expect(await relatedSlugs('post-4')).toEqual([
      'post-0',
      'post-1',
      'post-2',
    ]);
  });

  it('gives every article three inbound links from the others', async () => {
    getCreatorArticleListCached.mockResolvedValue(articles(9));
    const inbound = new Map<string, number>();

    for (let index = 0; index < 9; index += 1) {
      for (const slug of await relatedSlugs(`post-${index}`)) {
        inbound.set(slug, (inbound.get(slug) ?? 0) + 1);
      }
    }

    expect([...inbound.values()]).toEqual(Array(9).fill(3));
  });

  it('renders nothing for a creator with one article, no brand, or no list', async () => {
    getCreatorArticleListCached.mockResolvedValue(articles(1));
    expect(
      await RelatedArticles({
        brandId: 'brand-1',
        handle: 'a',
        slug: 'post-0',
      }),
    ).toBeNull();

    getCreatorArticleListCached.mockResolvedValue([]);
    expect(
      await RelatedArticles({
        brandId: 'brand-1',
        handle: 'a',
        slug: 'post-0',
      }),
    ).toBeNull();

    expect(
      await RelatedArticles({ brandId: undefined, handle: 'a', slug: 'x' }),
    ).toBeNull();
    expect(getCreatorArticleListCached).toHaveBeenCalledTimes(2);
  });
});
