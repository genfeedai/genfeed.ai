import type { Article } from '@models/content/article.model';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicArticles = vi.fn<() => Promise<Article[]>>();
const getPublicArticleBySlug = vi.fn<() => Promise<Article | null>>();

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({ findPublicArticles, getPublicArticleBySlug }),
  },
}));

const {
  default: ArticleDetailRoute,
  generateMetadata,
  generateStaticParams,
} = await import('./page');
const { getPublicArticleBySlugCached } = await import('./article-loader');

function article(overrides: Partial<Article> = {}): Article {
  return {
    author: 'Ada Lovelace',
    bannerUrl: 'https://cdn.genfeed.ai/banner.jpg',
    content: '<p>body</p>',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'article-1',
    label: 'How agents ship content',
    publishedAt: '2026-01-02T00:00:00.000Z',
    readingTime: 4,
    slug: 'how-agents-ship-content',
    summary: 'A short summary.',
    tags: [{ label: 'agents' }],
    updatedAt: '2026-01-03T00:00:00.000Z',
    wordCount: 900,
    ...overrides,
  } as Article;
}

function readJsonLdScripts(element: ReactNode): unknown[] {
  if (!isValidElement(element)) {
    throw new Error('Expected the route to return a React element');
  }
  const fragment = element as ReactElement<{ children?: ReactNode }>;
  return Children.toArray(fragment.props.children)
    .filter(
      (child): child is ReactElement<{ children?: ReactNode; type?: string }> =>
        isValidElement(child) && child.props.type === 'application/ld+json',
    )
    .map((script) => JSON.parse(String(script.props.children)));
}

beforeEach(() => {
  findPublicArticles.mockReset();
  getPublicArticleBySlug.mockReset();
});

describe('getPublicArticleBySlugCached', () => {
  it('delegates to the public service', async () => {
    getPublicArticleBySlug.mockResolvedValue(article());

    await expect(getPublicArticleBySlugCached('a-slug')).resolves.toMatchObject(
      { id: 'article-1' },
    );
    expect(getPublicArticleBySlug).toHaveBeenCalledWith('a-slug', undefined);
  });
});

describe('generateStaticParams', () => {
  it('keeps only articles that carry a slug', async () => {
    findPublicArticles.mockResolvedValue([
      article({ slug: 'one' }),
      article({ slug: undefined }),
      article({ slug: 'two' }),
    ]);

    await expect(generateStaticParams()).resolves.toEqual([
      { slug: 'one' },
      { slug: 'two' },
    ]);
  });

  it('degrades to an empty list when the API fails', async () => {
    findPublicArticles.mockRejectedValue(new Error('offline'));

    await expect(generateStaticParams()).resolves.toEqual([]);
  });
});

describe('generateMetadata', () => {
  it('builds article metadata from label, summary and banner', async () => {
    getPublicArticleBySlug.mockResolvedValue(article());

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'article-meta' }),
    });

    expect(String(meta.title)).toContain('How agents ship content');
    expect(meta.description).toBe('A short summary.');
    expect(meta.alternates?.canonical).toContain('/articles/article-meta');
    expect(meta.openGraph?.type).toBe('article');
    expect(meta.twitter?.creator).toBe('@genfeedai');
  });

  it('falls back to placeholder copy when label and summary are blank', async () => {
    getPublicArticleBySlug.mockResolvedValue(
      article({
        bannerUrl: undefined,
        createdAt: undefined,
        label: '   ',
        summary: '',
        updatedAt: undefined,
      }),
    );

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'blank' }),
    });

    expect(meta.description).toBe('Article');
    expect(String(meta.title)).toContain('Article |');
  });

  it('reports "Article not found" when the API has nothing', async () => {
    getPublicArticleBySlug.mockResolvedValue(null);

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'missing' }),
    });

    expect(meta.title).toBe('Article not found');
    expect(meta.alternates).toBeUndefined();
  });

  it('treats the sentinel "undefined" id as not found', async () => {
    getPublicArticleBySlug.mockResolvedValue(article({ id: 'undefined' }));

    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'sentinel' }),
    });

    expect(meta.title).toBe('Article not found');
  });
});

describe('ArticleDetailRoute', () => {
  it('renders article and breadcrumb JSON-LD for a published article', async () => {
    getPublicArticleBySlug.mockResolvedValue(article());

    const element = await ArticleDetailRoute({
      params: Promise.resolve({ slug: 'route-published' }),
      searchParams: Promise.resolve({}),
    });

    const [articleJsonLd, breadcrumbJsonLd] = readJsonLdScripts(element) as [
      { headline: string; keywords?: string; author: unknown },
      { itemListElement: Array<{ name: string }> },
    ];

    expect(articleJsonLd.headline).toBe('How agents ship content');
    expect(articleJsonLd.keywords).toBe('agents');
    expect(articleJsonLd.author).toMatchObject({ name: 'Ada Lovelace' });
    expect(breadcrumbJsonLd.itemListElement.map((item) => item.name)).toEqual([
      'Home',
      'Articles',
      'How agents ship content',
    ]);
  });

  it('attributes an authorless article to Genfeed and defaults the headline', async () => {
    getPublicArticleBySlug.mockResolvedValue(
      article({
        author: '  ',
        bannerUrl: undefined,
        content: undefined,
        label: '',
        summary: undefined,
        tags: undefined,
        wordCount: 0,
      }),
    );

    const element = await ArticleDetailRoute({
      params: Promise.resolve({ slug: 'route-anonymous' }),
      searchParams: Promise.resolve({}),
    });

    const [articleJsonLd] = readJsonLdScripts(element) as [
      { author: { name: string }; headline: string; wordCount?: number },
    ];

    expect(articleJsonLd.author).toMatchObject({ name: 'Genfeed' });
    expect(articleJsonLd.headline).toBe('Article');
    expect(articleJsonLd.wordCount).toBeUndefined();
  });

  it('passes the preview token through and flags an unpublished article', async () => {
    getPublicArticleBySlug.mockResolvedValue(article({ publishedAt: null }));

    const element = (await ArticleDetailRoute({
      params: Promise.resolve({ slug: 'route-preview' }),
      searchParams: Promise.resolve({ previewToken: 'token-123' }),
    })) as ReactElement<{ children?: ReactNode }>;

    expect(getPublicArticleBySlug).toHaveBeenCalledWith(
      'route-preview',
      'token-123',
    );

    const detail = Children.toArray(element.props.children).at(
      -1,
    ) as ReactElement<{ isPreview: boolean }>;
    expect(detail.props.isPreview).toBe(true);
  });

  it('answers with a 404 when the article is missing', async () => {
    getPublicArticleBySlug.mockResolvedValue(null);

    await expect(
      ArticleDetailRoute({
        params: Promise.resolve({ slug: 'gone' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow();
  });

  it('answers with a 404 for the sentinel "undefined" id', async () => {
    getPublicArticleBySlug.mockResolvedValue(article({ id: 'undefined' }));

    await expect(
      ArticleDetailRoute({
        params: Promise.resolve({ slug: 'sentinel' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow();
  });
});
