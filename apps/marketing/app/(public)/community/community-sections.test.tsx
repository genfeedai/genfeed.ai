import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Brand } from '@models/organization/brand.model';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicBrandsPage =
  vi.fn<
    (query: {
      limit: number;
      page: number;
      sortBy?: string;
    }) => Promise<IPaginatedResponse<Brand>>
  >();
const findPublicVideosPage = vi.fn();
const findPublicImagesPage = vi.fn();

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      findPublicBrandsPage,
      findPublicImagesPage,
      findPublicVideosPage,
    }),
  },
}));

vi.mock('@public/models/models-loader', () => ({
  getPublicModels: async () => null,
}));

vi.mock('@web-components/home/_footer', () => ({
  default: () => null,
}));

vi.mock('@ui/lazy/masonry/LazyMasonry', () => ({
  LazyMasonryImage: () => null,
  LazyMasonryVideo: () => null,
}));

const { default: CommunityCreatorsPage } = await import('./creators/page');
const { default: CommunityVideosPage } = await import('./videos/page');

function emptyPage<T>(): IPaginatedResponse<T> {
  return {
    hasNext: false,
    hasPrevious: false,
    items: [],
    page: 1,
    pageSize: 6,
    total: 0,
    totalPages: 1,
  };
}

const SHAYLA = { id: 'brand-1', label: 'Shayla', slug: 'shayla' } as Brand;
const ACME = { id: 'brand-2', label: 'Acme', slug: 'acme' } as Brand;
const NOVA = { id: 'brand-3', label: 'Nova', slug: 'nova' } as Brand;

/**
 * Like the API: highlighted creators first, then the rest, two a page.
 * Shayla is highlighted.
 */
const DIRECTORY = [SHAYLA, ACME, NOVA];
const DIRECTORY_PAGE_SIZE = 2;

beforeEach(() => {
  vi.clearAllMocks();
  findPublicBrandsPage.mockImplementation(async ({ page }) => {
    const totalPages = Math.ceil(DIRECTORY.length / DIRECTORY_PAGE_SIZE);
    return {
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      items: DIRECTORY.slice(
        (page - 1) * DIRECTORY_PAGE_SIZE,
        page * DIRECTORY_PAGE_SIZE,
      ),
      page,
      pageSize: DIRECTORY_PAGE_SIZE,
      total: DIRECTORY.length,
      totalPages,
    };
  });
  findPublicVideosPage.mockResolvedValue(emptyPage());
  findPublicImagesPage.mockResolvedValue(emptyPage());
});

async function renderCreators(page?: string): Promise<void> {
  render(
    (await CommunityCreatorsPage({
      searchParams: Promise.resolve(page ? { page } : {}),
    })) as ReactElement,
  );
}

function creatorNames(): (string | null)[] {
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);
}

describe('community creators page', () => {
  it('lists the first page of creators, highlighted creators first', async () => {
    await renderCreators();

    expect(creatorNames()).toEqual(['Shayla', 'Acme']);
    expect(screen.getByText('3 creators')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute(
      'href',
      '?page=2',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Community' })).getByRole(
        'link',
        { name: 'Creators' },
      ),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('reaches the creators past the first page', async () => {
    await renderCreators('2');

    expect(creatorNames()).toEqual(['Nova']);
  });

  it.each([['abc'], ['0']])('reads page %j as the first page', async (page) => {
    await renderCreators(page);

    expect(creatorNames()).toEqual(['Shayla', 'Acme']);
  });
});

function videosOf(
  brand: Brand,
  videos: { createdAt: string; id: string; viewCount: number }[],
): IPaginatedResponse<unknown> {
  return {
    ...emptyPage(),
    items: videos.map((video) => ({
      ...video,
      brand: { id: brand.id, slug: brand.slug },
      status: 'generated',
    })),
  };
}

async function renderVideos(sort?: string): Promise<void> {
  render(
    (await CommunityVideosPage({
      searchParams: Promise.resolve(sort ? { sort } : {}),
    })) as ReactElement,
  );
}

describe('community videos page', () => {
  it('shows the videos the API ranked across every creator, naming who made each', async () => {
    findPublicVideosPage.mockResolvedValue({
      ...emptyPage(),
      items: [
        ...videosOf(ACME, [
          { createdAt: '2026-11-08', id: 'video-b', viewCount: 40 },
        ]).items,
        ...videosOf(SHAYLA, [
          { createdAt: '2026-11-01', id: 'video-a', viewCount: 5 },
        ]).items,
      ],
    });

    await renderVideos('views');

    expect(findPublicVideosPage).toHaveBeenCalledWith(
      expect.objectContaining({ hasPublicCreator: 'true', sortBy: 'views' }),
    );
    expect(
      screen
        .getAllByRole('link', { name: /^@/ })
        .map((link) => link.textContent),
    ).toEqual(['@acme', '@shayla']);
    expect(screen.getByRole('button', { name: 'Most viewed' })).toBeVisible();
  });

  it('reads an unknown order as newest first', async () => {
    await renderVideos('loudest');

    expect(findPublicVideosPage).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'newest' }),
    );
    expect(screen.getByRole('button', { name: 'Newest' })).toBeVisible();
  });

  it('invites creators to share when there are no public videos', async () => {
    await renderVideos();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Videos' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
});
