import '@testing-library/jest-dom/vitest';
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
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('range=30d'),
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
    getBrandsWithStatsMock.mockResolvedValue({
      data: [brandFixture, otherBrandFixture],
    });
  });

  it('renders a row per brand returned by the analytics service', async () => {
    render(<AnalyticsBrandsList />);

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });
    expect(screen.getByText('Zenith')).toBeInTheDocument();
  });

  it('summarises the brand count in the container description', async () => {
    render(<AnalyticsBrandsList />);

    await waitFor(() => {
      expect(screen.getByText('2 brands found')).toBeInTheDocument();
    });
  });

  it('filters the rendered brands by the context search term', async () => {
    contextFilters = { query: 'zen' };

    render(<AnalyticsBrandsList />);

    await waitFor(() => {
      expect(screen.getByText('Zenith')).toBeInTheDocument();
    });
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
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
