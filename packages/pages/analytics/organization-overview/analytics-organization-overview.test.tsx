import '@testing-library/jest-dom/vitest';
import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';
import type { IBrandWithStats } from '@services/analytics/analytics.service';
import { render, screen, waitFor } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const pushMock = vi.fn();
const getBrandsWithStatsMock = vi.fn();
const getPlatformComparisonMock = vi.fn();
let contextBrandId: string | null = null;

let analyticsResult: {
  analytics: IAnalytics | null;
  isLoading: boolean;
} = {
  analytics: null,
  isLoading: false,
};

const analyticsFixture = {
  totalBrands: 3,
  totalPosts: 42,
  totalUsers: 7,
  totalViews: 1800,
  viewsGrowth: 12,
} as unknown as IAnalytics;

const brandFixture = {
  activePlatforms: ['twitter'],
  avgEngagementRate: 4.2,
  growth: 5,
  id: 'brand-1',
  logo: '',
  name: 'Acme',
  organizationName: 'Acme Inc',
  totalEngagement: 900,
  totalPosts: 12,
  totalViews: 4200,
} as unknown as IBrandWithStats;

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt || ''} />
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="analytics-chart" />,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: pushMock }),
}));

// A fresh `dateRange` per render would retrigger the fetch effects forever.
const stableDateRange = {
  endDate: new Date('2026-03-12T00:00:00.000Z'),
  startDate: new Date('2026-03-01T00:00:00.000Z'),
};

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({
    brandId: contextBrandId,
    dateRange: stableDateRange,
    refreshTrigger: 0,
  }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isCollectionFetchReady: () => true,
  useCollectionScope: () => ({
    brandId: undefined,
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'org',
  }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock('@hooks/data/analytics/use-analytics/use-analytics', () => ({
  useAnalytics: () => analyticsResult,
}));

const getAnalyticsServiceMock = async () => ({
  getBrandsWithStats: getBrandsWithStatsMock,
  getPlatformComparison: getPlatformComparisonMock,
  getTopAccounts: async () => [],
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getAnalyticsServiceMock,
}));

describe('AnalyticsOrganizationOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsResult = { analytics: analyticsFixture, isLoading: false };
    getBrandsWithStatsMock.mockResolvedValue({ data: [brandFixture] });
    getPlatformComparisonMock.mockResolvedValue({});
    contextBrandId = null;
  });

  it('omits an empty brand ID for organization-wide platform comparison', async () => {
    contextBrandId = '';
    render(<AnalyticsOrganizationOverview />);
    await waitFor(() => {
      expect(getPlatformComparisonMock).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: undefined }),
      );
    });
  });

  it('renders the four-card organization metric strip without a redundant page title', async () => {
    render(<AnalyticsOrganizationOverview />);

    expect(screen.queryByText('Organization Metrics')).not.toBeInTheDocument();
    expect(screen.getByText('Total Brands')).toBeInTheDocument();
    expect(screen.getByText('Total Posts')).toBeInTheDocument();
    expect(screen.getByText('Total Views')).toBeInTheDocument();
    expect(screen.getByText('Total Members')).toBeInTheDocument();
    expect(screen.queryByText('Total Engagement')).not.toBeInTheDocument();
    expect(screen.queryByText('Engagement Rate')).not.toBeInTheDocument();
  });

  it('labels the metric strip for assistive technology', () => {
    render(<AnalyticsOrganizationOverview />);

    expect(
      screen.getByRole('region', { name: 'Organization metrics' }),
    ).toBeInTheDocument();
  });

  it('renders the view growth accent when growth is known', () => {
    render(<AnalyticsOrganizationOverview />);

    expect(screen.getByText('+12% from last period')).toBeInTheDocument();
  });

  it('falls back to a neutral accent when growth is unknown', () => {
    analyticsResult = {
      analytics: { ...analyticsFixture, viewsGrowth: null } as IAnalytics,
      isLoading: false,
    };

    render(<AnalyticsOrganizationOverview />);

    expect(screen.getByText('Total views')).toBeInTheDocument();
  });

  it('offers a first-brand next step when the organization has no activity', () => {
    analyticsResult = {
      analytics: {
        totalBrands: 0,
        totalPosts: 0,
        totalUsers: 0,
        totalViews: 0,
      } as unknown as IAnalytics,
      isLoading: false,
    };

    render(<AnalyticsOrganizationOverview />);

    expect(
      screen.getByText('No organization activity yet'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Organization metrics' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the metric strip while analytics are still loading', () => {
    analyticsResult = { analytics: null, isLoading: true };

    render(<AnalyticsOrganizationOverview />);

    expect(
      screen.getByRole('region', { name: 'Organization metrics' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No organization activity yet'),
    ).not.toBeInTheDocument();
  });

  it('lists the organization brands returned by the analytics service', async () => {
    render(<AnalyticsOrganizationOverview />);

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });

    const heading = screen.getByRole('heading', { name: 'All Brands (3)' });
    const surface = heading
      .closest('section')
      ?.querySelector('[data-slot="workspace-surface-body"]');
    const tableFrame = screen.getByRole('table').closest('div.relative');

    expect(surface).toHaveClass('border', 'border-border', 'rounded-card');
    expect(tableFrame).toHaveClass('border-0', 'rounded-none');
  });
});
