import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Article } from '@models/content/article.model';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicArticlesPage =
  vi.fn<
    (query: {
      page: number;
      limit: number;
    }) => Promise<IPaginatedResponse<Article>>
  >();

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({ findPublicArticlesPage }) },
}));

const { default: ArticlesPage, generateMetadata } = await import('./page');
const { getPublicArticlesPageCached } = await import('./articles-loader');

const EMPTY_PARENT = Promise.resolve({}) as unknown as Parameters<
  typeof generateMetadata
>[1];

const ARTICLES_PAGE = {
  hasNext: false,
  hasPrevious: false,
  items: [{ id: 'a1', label: 'One' }],
  page: 1,
  pageSize: 12,
  total: 1,
  totalPages: 1,
} as unknown as IPaginatedResponse<Article>;

beforeEach(() => {
  findPublicArticlesPage.mockReset();
  findPublicArticlesPage.mockResolvedValue(ARTICLES_PAGE);
});

describe('getPublicArticlesPageCached', () => {
  it('requests the newest-first page from the public service', async () => {
    await expect(getPublicArticlesPageCached(3)).resolves.toBe(ARTICLES_PAGE);
    expect(findPublicArticlesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 3,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
      }),
    );
  });
});

describe('generateMetadata', () => {
  it('canonicalises /articles and assigns its dedicated image', async () => {
    const parent = Promise.resolve({
      openGraph: { images: [{ url: 'https://cdn.genfeed.ai/og.png' }] },
    }) as unknown as Parameters<typeof generateMetadata>[1];

    const meta = await generateMetadata(undefined, parent);

    expect(meta.alternates?.canonical).toMatch(/\/articles$/);
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: 'https://genfeed.ai/og/articles',
        width: 1200,
        height: 630,
        type: 'image/png',
      }),
    ]);
    expect(meta.twitter?.card).toBe('summary_large_image');
  });

  it('assigns its dedicated image without parent images', async () => {
    const meta = await generateMetadata(undefined, EMPTY_PARENT);

    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: 'https://genfeed.ai/og/articles',
        width: 1200,
        height: 630,
        type: 'image/png',
      }),
    ]);
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
    expect(findPublicArticlesPage).toHaveBeenCalledWith(
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

    expect(findPublicArticlesPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: expected }),
    );
  });
});
