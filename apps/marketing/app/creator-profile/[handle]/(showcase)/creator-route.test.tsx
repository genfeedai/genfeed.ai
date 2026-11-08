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
const { getCreatorProfileData, getPublicBrandBySlug } = await import(
  './creator-loader'
);
const { CreatorOverview } = await import('./creator-view');

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

describe('getCreatorProfileData', () => {
  it('collects every kind of public work with its total', async () => {
    const data = await getCreatorProfileData('data-ok');

    expect(data?.brand).toMatchObject({ id: 'brand-1' });
    expect(data?.referralCode).toBe('owner2345xyz');
    expect(data?.showcase.articles.total).toBe(12);
    expect(data?.showcase.posts.items).toEqual([POST]);
  });

  it('reads a failed listing as empty and keeps the profile', async () => {
    findPublicArticlesPage.mockRejectedValue(new Error('articles down'));
    findPublicReferralCode.mockRejectedValue(new Error('referral down'));

    const data = await getCreatorProfileData('data-partial');

    expect(data?.showcase.articles).toMatchObject({ items: [], total: 0 });
    expect(data?.referralCode).toBeNull();
    expect(data?.showcase.posts.total).toBe(3);
  });

  it('is null when no public brand has the handle', async () => {
    findPublicProfileBySlug.mockResolvedValue(null);

    await expect(getCreatorProfileData('data-missing')).resolves.toBeNull();
  });
});

describe('generateMetadata', () => {
  it('shares the banner under the @handle URL', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ handle: 'acme' }),
    });

    expect(meta.title).toBe('Acme Studio (@acme) | Genfeed.ai');
    expect(meta.description).toBe('We make things.');
    expect(meta.alternates?.canonical).toBe('https://genfeed.ai/@acme');
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({ url: 'https://cdn.genfeed.ai/banner.jpg' }),
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
    expect(within(tabs).getByRole('link', { name: 'All' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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
