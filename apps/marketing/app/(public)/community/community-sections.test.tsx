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

describe('community videos page', () => {
  it('invites creators to share when there are no public videos', async () => {
    render((await CommunityVideosPage()) as ReactElement);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Videos' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
});
