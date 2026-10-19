import '@testing-library/jest-dom/vitest';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import AnalyticsBrandsList from '@pages/analytics/brands-list/analytics-brands-list';
import type { IBrandWithStats } from '@services/analytics/analytics.service';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const setFilterMock = vi.fn();
const setToolbarNodeMock = vi.fn();
const triggerRefreshMock = vi.fn();
const getBrandsWithStatsMock = vi.fn();
const replaceMock = vi.fn();

let searchParamsString = 'range=30d';

let contextFilters: { query?: string; sort?: string } = {};

const brandFixture = {
  activePlatforms: ['twitter'],
  avgEngagementRate: 4.2,
  growth: 12,
  id: 'brand-1',
  logo: '',
  name: 'Acme',
  organizationName: 'Acme Inc',
  totalEngagement: 900,
  totalPosts: 12,
  totalViews: 4200,
} as unknown as IBrandWithStats;

const otherBrandFixture = {
  ...brandFixture,
  growth: -3,
  id: 'brand-2',
  name: 'Zenith',
} as unknown as IBrandWithStats;

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt || ''} />
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

// `dateRange` is a dependency of the fetch effect, so a fresh object per render
// would refetch forever and pin the table in its loading skeleton.
const stableDateRange = {
  endDate: new Date('2026-03-12T00:00:00.000Z'),
  startDate: new Date('2026-03-01T00:00:00.000Z'),
};

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({
    dateRange: stableDateRange,
    filters: contextFilters,
    refreshTrigger: 0,
    setFilter: setFilterMock,
    setToolbarNode: setToolbarNodeMock,
    triggerRefresh: triggerRefreshMock,
  }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isLoaded: true, isSignedIn: true }),
}));

// The fetch effect depends on the service getter's identity, so it must be
// stable across renders or the list refetches forever.
const getAnalyticsServiceMock = async () => ({
  getBrandsWithStats: getBrandsWithStatsMock,
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getAnalyticsServiceMock,
}));

describe('AnalyticsBrandsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contextFilters = {};
    searchParamsString = 'range=30d';
    getBrandsWithStatsMock.mockResolvedValue({
      data: [brandFixture, otherBrandFixture],
      pagination: { limit: 15, page: 1, total: 2, totalPages: 1 },
    });
  });

  it('renders a row per brand returned by the analytics service', async () => {
    render(<AnalyticsBrandsList />);

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });
    expect(screen.getByText('Zenith')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Open Acme analytics' }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'View Brand Details' }),
    ).not.toBeInTheDocument();
  });

  it('summarises the brand count in the container description', async () => {
    render(<AnalyticsBrandsList />);

    await waitFor(() => {
      expect(screen.getByText('2 brands found')).toBeInTheDocument();
    });
  });

  it('pages server-side from the URL and sends the search to the API', async () => {
    contextFilters = { query: 'zen', sort: 'views' };
    searchParamsString = 'range=30d&page=2';
    getBrandsWithStatsMock.mockResolvedValue({
      data: [otherBrandFixture],
      pagination: { limit: 15, page: 2, total: 16, totalPages: 2 },
    });

    render(<AnalyticsBrandsList />);

    await waitFor(() => {
      expect(screen.getByText('Zenith')).toBeInTheDocument();
    });
    expect(getBrandsWithStatsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: ITEMS_PER_PAGE,
        page: 2,
        search: 'zen',
        sort: 'views',
      }),
      expect.any(AbortSignal),
    );
    expect(screen.getByText('16 brands found')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
    // The detail link drops the list page.
    expect(
      screen.getByRole('link', { name: 'Open Zenith analytics' }),
    ).toHaveAttribute('href', '/analytics/brands/brand-2?range=30d');
  });

  it('starts over at page 1 when the URL page is past the last page', async () => {
    searchParamsString = 'range=30d&page=4';
    getBrandsWithStatsMock.mockResolvedValue({
      data: [],
      pagination: { limit: 15, page: 4, total: 3, totalPages: 1 },
    });

    render(<AnalyticsBrandsList />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/?range=30d', {
        scroll: false,
      });
    });
  });

  it('pushes the search term into the analytics filters', async () => {
    render(<AnalyticsBrandsList />);

    render(setToolbarNodeMock.mock.calls.at(-1)?.[0]);
    fireEvent.change(screen.getByLabelText('Search brands'), {
      target: { value: 'acme' },
    });

    expect(setFilterMock).toHaveBeenCalledWith('query', 'acme');
  });

  it('navigates to the brand detail preserving the current query string', async () => {
    render(<AnalyticsBrandsList />);

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('link', { name: 'Open Acme analytics' }),
    ).toHaveAttribute('href', '/analytics/brands/brand-1?range=30d');
  });

  it('honours a custom base path for detail links', async () => {
    render(<AnalyticsBrandsList basePath="/org/analytics" />);

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('link', { name: 'Open Acme analytics' }),
    ).toHaveAttribute('href', '/org/analytics/brands/brand-1?range=30d');
  });

  it('does not call the analytics service while signed out', async () => {
    getBrandsWithStatsMock.mockResolvedValue({ data: [] });

    render(<AnalyticsBrandsList />);

    await waitFor(() => {
      expect(screen.getByText('0 brands found')).toBeInTheDocument();
    });
  });
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
