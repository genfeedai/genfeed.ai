import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Article } from '@models/content/article.model';
import type { Post } from '@models/content/post.model';
import type { Brand } from '@models/organization/brand.model';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicProfileBySlug = vi.fn<() => Promise<Brand | null>>();
const findPublicArticlesPage =
  vi.fn<() => Promise<IPaginatedResponse<Article>>>();
const findPublicPostsPage = vi.fn<() => Promise<IPaginatedResponse<Post>>>();
const findPublicVideosPage = vi.fn();
const findPublicImagesPage = vi.fn();
const findPublicReferralCode = vi.fn<() => Promise<string | null>>();

vi.mock('@public/models/models-loader', () => ({
  getPublicModels: async () => null,
}));

vi.mock('@data/public-views', () => ({
  trackPublicView: async () => null,
}));

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      findPublicArticlesPage,
      findPublicImagesPage,
      findPublicPostsPage,
      findPublicProfileBySlug,
      findPublicReferralCode,
      findPublicVideosPage,
    }),
  },
}));

const infoSpy = vi.fn();
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: infoSpy, warn: vi.fn() },
}));

const { default: CreatorProfilePage, generateMetadata } = await import(
  './page'
);
const { generateMetadata: generateArticlesMetadata } = await import(
  './articles/page'
);
const {
  getPublicReferralCodeBySlug,
  getCreatorPlatformPosts,
  getCreatorProfileData,
  getPublicBrandBySlug,
  resolveCreatorPlatform,
} = await import('./creator-loader');
const { CreatorOverview, CreatorTab } = await import('./creator-view');

function page<T>(items: T[], total = items.length): IPaginatedResponse<T> {
  return {
    hasNext: false,
    hasPrevious: false,
    items,
    page: 1,
    pageSize: 6,
    total,
    totalPages: 1,
  };
}

const EMPTY = page([]);
const ARTICLE = {
  id: 'a1',
  label: 'Launch week',
  publishedAt: '2026-11-01T00:00:00.000Z',
  slug: 'launch-week',
  summary: 'What shipped.',
} as Article;
const POST = {
  createdAt: '2026-11-02T00:00:00.000Z',
  description: 'Shipping the creator profile today.',
  id: 'p1',
  platform: 'twitter',
} as Post;

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    bannerUrl: 'https://cdn.genfeed.ai/banner.jpg',
    createdAt: '2025-07-14T00:00:00.000Z',
    description: 'We make things.',
    id: 'brand-1',
    label: 'Acme Studio',
    links: [],
    slug: 'acme',
    twitterHandle: 'acme',
    ...overrides,
  } as Brand;
}

beforeEach(() => {
  vi.clearAllMocks();
  findPublicProfileBySlug.mockResolvedValue(brand());
  findPublicArticlesPage.mockResolvedValue(page([ARTICLE], 12));
  findPublicPostsPage.mockResolvedValue(page([POST], 3));
  findPublicVideosPage.mockResolvedValue(EMPTY);
  findPublicImagesPage.mockResolvedValue(EMPTY);
  findPublicReferralCode.mockResolvedValue('owner2345xyz');
});

describe('getPublicBrandBySlug', () => {
  it('throws on a service failure instead of returning null', async () => {
    findPublicProfileBySlug.mockRejectedValue(new Error('offline'));

    await expect(getPublicBrandBySlug('loader-fail')).rejects.toThrow(
      'offline',
    );
  });
});

describe('getPublicReferralCodeBySlug', () => {
  it('answers the owner code for a public handle', async () => {
    expect(await getPublicReferralCodeBySlug('code-ok')).toBe('owner2345xyz');
  });

  it('answers null for an unknown handle and for an outage', async () => {
    findPublicProfileBySlug.mockResolvedValueOnce(null);
    expect(await getPublicReferralCodeBySlug('code-unknown')).toBeNull();

    findPublicProfileBySlug.mockRejectedValueOnce(new Error('offline'));
    expect(await getPublicReferralCodeBySlug('code-offline')).toBeNull();
  });
});

describe('getCreatorProfileData', () => {
  it('collects every kind of public work with its total', async () => {
    const data = await getCreatorProfileData('data-ok');

    expect(data?.brand).toMatchObject({ id: 'brand-1' });
    expect(data?.showcase.articles.total).toBe(12);
    expect(data?.showcase.posts.items).toEqual([POST]);
  });

  it('reads a failed listing as empty and keeps the profile', async () => {
    findPublicArticlesPage.mockRejectedValue(new Error('articles down'));

    const data = await getCreatorProfileData('data-partial');

    expect(data?.showcase.articles).toMatchObject({ items: [], total: 0 });
    expect(data?.showcase.posts.total).toBe(3);
  });

  it('is null when no public brand has the handle', async () => {
    findPublicProfileBySlug.mockResolvedValue(null);

    await expect(getCreatorProfileData('data-missing')).resolves.toBeNull();
  });
});

describe('the posts platform filter', () => {
  const socials = [
    {
      handle: 'acme',
      platform: 'instagram',
      url: 'https://instagram.com/acme',
    },
    { handle: 'acme', platform: 'tiktok', url: 'https://tiktok.com/@acme' },
  ] as Brand['socials'];

  it('narrows the posts only to a platform the creator connected', () => {
    const connected = brand({ socials });

    expect(resolveCreatorPlatform('instagram', connected)).toBe('instagram');
    expect(resolveCreatorPlatform('youtube', connected)).toBeNull();
    expect(resolveCreatorPlatform(undefined, connected)).toBeNull();
    expect(resolveCreatorPlatform('instagram', brand())).toBeNull();
  });

  it('lists one platform’s posts for the brand, page by page', async () => {
    const filtered = page([POST], 1);
    findPublicPostsPage.mockResolvedValue(filtered);

    await expect(
      getCreatorPlatformPosts('brand-1', 24, 2, 'instagram'),
    ).resolves.toBe(filtered);
    expect(findPublicPostsPage).toHaveBeenCalledWith({
      brand: 'brand-1',
      limit: 24,
      page: 2,
      platform: 'instagram',
    });
  });

  it('reads a failed filtered listing as an empty page', async () => {
    findPublicPostsPage.mockRejectedValue(new Error('posts down'));

    await expect(
      getCreatorPlatformPosts('brand-1', 24, 1, 'tiktok'),
    ).resolves.toMatchObject({ items: [], total: 0 });
  });
});

describe('generateMetadata', () => {
  it('shares the profile card under the @handle URL', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ handle: 'acme' }),
    });

    expect(meta.title).toBe('Acme Studio (@acme) | Genfeed.ai');
    expect(meta.description).toBe('We make things.');
    expect(meta.alternates?.canonical).toBe('https://genfeed.ai/@acme');
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({
        height: 630,
        url: 'https://genfeed.ai/@acme/og',
        width: 1200,
      }),
    ]);
    expect(meta.twitter?.creator).toBe('@acme');
    expect(meta.alternates?.types?.['application/rss+xml']).toBeTruthy();
  });

  it('gives each tab its own title and canonical URL', async () => {
    const meta = await generateArticlesMetadata({
      params: Promise.resolve({ handle: 'acme' }),
      searchParams: Promise.resolve({}),
    });

    expect(meta.title).toBe('Articles by Acme Studio (@acme) | Genfeed.ai');
    expect(meta.alternates?.canonical).toBe(
      'https://genfeed.ai/@acme/articles',
    );
  });

  it('indexes a profile that has published something', async () => {
    findPublicProfileBySlug.mockResolvedValue(brand({ id: 'brand-indexed' }));
    findPublicArticlesPage.mockResolvedValue(page([], 0));
    findPublicPostsPage.mockResolvedValue(page([POST], 1));

    const meta = await generateMetadata({
      params: Promise.resolve({ handle: 'indexed' }),
    });

    expect(meta.robots).toBeUndefined();
  });

  it('keeps a profile with nothing published out of the index but lets crawlers follow its links', async () => {
    findPublicProfileBySlug.mockResolvedValue(brand({ id: 'brand-empty' }));
    findPublicArticlesPage.mockResolvedValue(EMPTY);
    findPublicPostsPage.mockResolvedValue(EMPTY);

    const meta = await generateMetadata({
      params: Promise.resolve({ handle: 'empty' }),
    });

    expect(meta.robots).toEqual({ follow: true, index: false });
    expect(meta.alternates?.canonical).toBe('https://genfeed.ai/@acme');
  });

  it('judges a tab by its own listing, not by the rest of the profile', async () => {
    findPublicProfileBySlug.mockResolvedValue(brand({ id: 'brand-tab' }));
    findPublicArticlesPage.mockResolvedValue(page([], 0));
    findPublicPostsPage.mockResolvedValue(page([POST], 1));

    const articles = await generateArticlesMetadata({
      params: Promise.resolve({ handle: 'tab' }),
      searchParams: Promise.resolve({}),
    });
    const profile = await generateMetadata({
      params: Promise.resolve({ handle: 'tab' }),
    });

    expect(articles.robots).toEqual({ follow: true, index: false });
    expect(profile.robots).toBeUndefined();
  });

  it('keeps a profile indexable when a listing cannot be loaded', async () => {
    findPublicProfileBySlug.mockResolvedValue(brand({ id: 'brand-flaky' }));
    findPublicArticlesPage.mockResolvedValue(EMPTY);
    findPublicPostsPage.mockRejectedValue(new Error('offline'));

    const meta = await generateMetadata({
      params: Promise.resolve({ handle: 'flaky' }),
    });

    expect(meta.robots).toBeUndefined();
  });

  it('keeps an unknown handle out of the index', async () => {
    findPublicProfileBySlug.mockResolvedValue(null);

    const meta = await generateMetadata({
      params: Promise.resolve({ handle: 'meta-unknown' }),
    });

    expect(meta.robots).toEqual({ follow: false, index: false });
    expect(meta.openGraph).toBeUndefined();
  });

  it('degrades to handle-only metadata when the API is unreachable', async () => {
    findPublicProfileBySlug.mockRejectedValue(new Error('unreachable'));

    const meta = await generateMetadata({
      params: Promise.resolve({ handle: 'unreachable' }),
    });

    expect(meta.title).toBe('@unreachable | Genfeed.ai');
    expect(meta.openGraph).toBeUndefined();
    expect(infoSpy).toHaveBeenCalledWith(
      'GET /public/brands/unreachable degraded to fallback metadata',
      expect.objectContaining({ handle: 'unreachable' }),
    );
  });
});

describe('CreatorOverview', () => {
  it('shows the creator beside their articles and posts', async () => {
    render(await CreatorOverview({ handle: 'acme' }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Acme Studio' }),
    ).toBeVisible();
    const tabs = screen.getByRole('navigation', { name: 'Profile sections' });
    expect(
      within(tabs).getByRole('link', { name: 'Overview' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(tabs).getByRole('link', { name: 'Articles 12' }),
    ).toHaveAttribute('href', '/@acme/articles');
    expect(
      within(tabs).queryByRole('link', { name: /Videos/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Launch week/ })).toHaveAttribute(
      'href',
      '/@acme/articles/launch-week',
    );
    expect(
      screen.getByRole('link', { name: /Shipping the creator profile/ }),
    ).toHaveAttribute('href', '/@acme/posts/p1');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible();
  });

  it('shows each count in its tab label only, never as separate text', async () => {
    render(await CreatorOverview({ handle: 'acme' }));

    // 12 articles: the tab link reads "Articles 12", and nothing else on the
    // page repeats the number as "12 articles" or beside a section title.
    expect(screen.queryByText(/\b12\b\s+articles?/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Articles' }),
    ).toBeVisible();
  });

  it('answers with a 404 when the handle is unknown or not public', async () => {
    findPublicProfileBySlug.mockResolvedValue(null);
    const element = (await CreatorProfilePage({
      params: Promise.resolve({ handle: 'route-missing' }),
    })) as ReactElement<{ handle: string }>;

    await expect(
      CreatorOverview({ handle: element.props.handle }),
    ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});

describe('CreatorTab', () => {
  it('lists the work without repeating the total under the tabs', async () => {
    render(await CreatorTab({ handle: 'acme', page: 1, tab: 'articles' }));

    const tabs = screen.getByRole('navigation', { name: 'Profile sections' });
    expect(
      within(tabs).getByRole('link', { name: 'Articles 12' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Launch week/ })).toBeVisible();
    expect(screen.queryByText(/12 articles/i)).not.toBeInTheDocument();
  });
});
