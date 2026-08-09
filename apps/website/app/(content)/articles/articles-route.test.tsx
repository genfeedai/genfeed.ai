import type { Article } from '@models/content/article.model';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicArticles =
  vi.fn<(query: { page: number; limit: number }) => Promise<Article[]>>();

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({ findPublicArticles }) },
}));

const { default: ArticlesPage, generateMetadata } = await import('./page');
const { getPublicArticlesPageCached } = await import('./articles-loader');

const EMPTY_PARENT = Promise.resolve({}) as unknown as Parameters<
  typeof generateMetadata
>[1];

const ARTICLES = [{ id: 'a1', label: 'One' }] as unknown as Article[];

beforeEach(() => {
  findPublicArticles.mockReset();
  findPublicArticles.mockResolvedValue(ARTICLES);
});

describe('getPublicArticlesPageCached', () => {
  it('requests the newest-first page from the public service', async () => {
    await expect(getPublicArticlesPageCached(3)).resolves.toBe(ARTICLES);
    expect(findPublicArticles).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 3,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
      }),
    );
  });
});

describe('generateMetadata', () => {
  it('canonicalises /articles and reuses parent OpenGraph images', async () => {
    const parent = Promise.resolve({
      openGraph: { images: [{ url: 'https://cdn.genfeed.ai/og.png' }] },
    }) as unknown as Parameters<typeof generateMetadata>[1];

    const meta = await generateMetadata(undefined, parent);

    expect(meta.alternates?.canonical).toMatch(/\/articles$/);
    expect(meta.openGraph?.images).toEqual([
      { url: 'https://cdn.genfeed.ai/og.png' },
    ]);
    expect(meta.twitter?.card).toBe('summary_large_image');
  });

  it('tolerates a parent without OpenGraph images', async () => {
    const meta = await generateMetadata(undefined, EMPTY_PARENT);

    expect(meta.openGraph?.images).toEqual([]);
  });
});

describe('ArticlesPage', () => {
  it('renders CollectionPage JSON-LD and the first page by default', async () => {
    const element = (await ArticlesPage({
      searchParams: Promise.resolve({}),
    })) as ReactElement<{ children?: ReactNode }>;

    const script = Children.toArray(element.props.children).find(
      (child): child is ReactElement<{ children?: ReactNode }> =>
        isValidElement(child),
    );
    const jsonLd = JSON.parse(String(script?.props.children)) as {
      '@type': string;
    };

    expect(jsonLd['@type']).toBe('CollectionPage');
    expect(findPublicArticles).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it.each([
    ['a numeric page', '4', 4],
    ['a non-numeric page', 'abc', 1],
    ['a zero page', '0', 1],
    ['a negative page', '-2', 1],
  ])('resolves %s to page %s', async (_label, raw, expected) => {
    await ArticlesPage({ searchParams: Promise.resolve({ page: raw }) });

    expect(findPublicArticles).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: expected }),
    );
  });
});
