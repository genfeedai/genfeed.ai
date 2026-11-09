import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Brand } from '@models/organization/brand.model';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicBrands =
  vi.fn<(query: { isHighlighted?: string }) => Promise<Brand[]>>();
const findPublicVideosPage = vi.fn();
const findPublicImagesPage = vi.fn();

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      findPublicBrands,
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
const NO_HANDLE = { id: 'brand-3', label: 'No handle' } as Brand;

beforeEach(() => {
  vi.clearAllMocks();
  findPublicBrands.mockImplementation(async (query) =>
    query.isHighlighted === 'true' ? [SHAYLA] : [ACME, SHAYLA, NO_HANDLE],
  );
  findPublicVideosPage.mockResolvedValue(emptyPage());
  findPublicImagesPage.mockResolvedValue(emptyPage());
});

describe('community creators page', () => {
  it('lists every public creator once, highlighted creators first', async () => {
    render((await CommunityCreatorsPage()) as ReactElement);

    const names = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(names).toEqual(['Shayla', 'Acme']);
    expect(
      within(screen.getByRole('navigation', { name: 'Community' })).getByRole(
        'link',
        { name: 'Creators' },
      ),
    ).toHaveAttribute('aria-current', 'page');
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
      brandId: brand.id,
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
  it('orders videos from every creator by views, naming who made each', async () => {
    findPublicVideosPage.mockImplementation(async ({ brand }) =>
      brand === SHAYLA.id
        ? videosOf(SHAYLA, [
            { createdAt: '2026-11-01', id: 'video-a', viewCount: 5 },
          ])
        : videosOf(ACME, [
            { createdAt: '2026-11-08', id: 'video-b', viewCount: 40 },
            { createdAt: '2026-11-09', id: 'video-c', viewCount: 5 },
          ]),
    );

    await renderVideos('views');

    expect(findPublicVideosPage).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'views' }),
    );
    expect(
      screen
        .getAllByRole('link', { name: /^@/ })
        .map((link) => link.textContent),
    ).toEqual(['@acme', '@acme', '@shayla']);
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
