import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Article } from '@models/content/article.model';
import type { Brand } from '@models/organization/brand.model';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPublicBrands = vi.fn<() => Promise<Brand[]>>();
const findPublicArticlesPage =
  vi.fn<() => Promise<IPaginatedResponse<Article>>>();
const findPublicVideosPage = vi.fn();
const findPublicImagesPage = vi.fn();

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      findPublicArticlesPage,
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
  LazyMasonryImage: () => <span>image tile</span>,
  LazyMasonryVideo: () => <span>video tile</span>,
}));

const { default: CommunityPage } = await import('./page');

function page<T>(items: T[]): IPaginatedResponse<T> {
  return {
    hasNext: false,
    hasPrevious: false,
    items,
    page: 1,
    pageSize: 6,
    total: items.length,
    totalPages: 1,
  };
}

const CREATOR = {
  description: 'Founder of the network.',
  id: 'brand-1',
  label: 'Shayla',
  slug: 'shayla',
} as Brand;

const ARTICLE = {
  brand: { slug: 'shayla' },
  id: 'a1',
  label: 'Building in public',
  publishedAt: '2026-11-01T00:00:00.000Z',
  slug: 'building-in-public',
} as Article;

beforeEach(() => {
  vi.clearAllMocks();
  findPublicBrands.mockResolvedValue([CREATOR]);
  findPublicArticlesPage.mockResolvedValue(page([ARTICLE]));
  findPublicVideosPage.mockResolvedValue(page([]));
  findPublicImagesPage.mockResolvedValue(page([]));
});

async function renderPage(): Promise<void> {
  render((await CommunityPage()) as ReactElement);
}

describe('community page', () => {
  it('links featured creators and their articles to their profiles', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your portfolio lives at genfeed.ai/@you',
      }),
    ).toBeInTheDocument();
    const creators = screen.getByRole('region', { name: 'Featured creators' });
    expect(
      within(creators).getByRole('link', { name: /Shayla/ }),
    ).toHaveAttribute('href', '/@shayla');
    expect(
      screen.getByRole('link', { name: /Building in public/ }),
    ).toHaveAttribute('href', '/@shayla/articles/building-in-public');
    expect(
      screen.getByRole('link', { name: 'See @genfeedai' }),
    ).toHaveAttribute('href', '/@genfeedai');
  });

  it('leads with the video an operator featured, linked to its creator', async () => {
    findPublicVideosPage.mockImplementation(
      async (query?: { isHighlighted?: string }) =>
        page(
          query?.isHighlighted === 'true'
            ? [
                {
                  brand: { id: 'brand-1', slug: 'shayla' },
                  id: 'v1',
                  model: 'flux-video',
                },
              ]
            : [],
        ),
    );

    await renderPage();

    const hero = screen.getByRole('region', { name: 'Made by @shayla' });
    expect(within(hero).getByText('Featured video')).toBeInTheDocument();
    expect(within(hero).getByText('video tile')).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Watch' })).toHaveAttribute(
      'href',
      '/@shayla/videos',
    );
    expect(
      within(hero)
        .getByRole('link', { name: 'Recreate in Genfeed' })
        .getAttribute('href'),
    ).toContain(
      encodeURIComponent(
        'Make a video like the one featured on genfeed.ai/community',
      ).replaceAll('%20', '+'),
    );
  });

  it('features the newest featured work whose creator is still public', async () => {
    // Like the API: the newest featured video is from a creator who went
    // private, so a listing of public creators' work skips it.
    findPublicVideosPage.mockImplementation(
      async (query?: { hasPublicCreator?: string; isHighlighted?: string }) =>
        page(
          query?.isHighlighted !== 'true'
            ? []
            : query.hasPublicCreator === 'true'
              ? [{ brand: { id: 'brand-1', slug: 'shayla' }, id: 'v-older' }]
              : [{ brand: 'brand-9', id: 'v-newest' }],
        ),
    );

    await renderPage();

    expect(
      screen.getByRole('region', { name: 'Made by @shayla' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['nothing is featured', []],
    ['the listing names no public creator', [{ brand: 'brand-9', id: 'v1' }]],
  ])('shows no featured hero when %s', async (_label, featured) => {
    findPublicVideosPage.mockImplementation(
      async (query?: { isHighlighted?: string }) =>
        page(query?.isHighlighted === 'true' ? featured : []),
    );

    await renderPage();

    expect(
      screen.queryByText(/^Featured (video|image)$/),
    ).not.toBeInTheDocument();
  });

  it('still renders the invitation when every listing fails', async () => {
    findPublicBrands.mockRejectedValue(new Error('down'));
    findPublicArticlesPage.mockRejectedValue(new Error('down'));

    await renderPage();

    expect(
      screen.getByRole('link', { name: 'Claim your handle' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Your profile here')).toBeInTheDocument();
    expect(screen.queryByText('Latest articles')).not.toBeInTheDocument();
  });
});
