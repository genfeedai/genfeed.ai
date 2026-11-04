import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { IBrandWithStats } from '@services/analytics/analytics.service';
import { render as renderView, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsBrandSummary from '@/features/analytics/brands-list/analytics-brand-summary';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const findBrandAnalyticsTimeSeriesMock = vi.fn();
const findBrandPostsMock = vi.fn();

// `dateRange` and the service getter are effect dependencies, so they must be
// stable across renders or the sidebar refetches forever.
const stableDateRange = {
  endDate: new Date('2026-03-12T00:00:00.000Z'),
  startDate: new Date('2026-03-01T00:00:00.000Z'),
};

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({ dateRange: stableDateRange }),
}));

const getBrandsServiceMock = async () => ({
  findBrandAnalyticsTimeSeries: findBrandAnalyticsTimeSeriesMock,
  findBrandPosts: findBrandPostsMock,
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getBrandsServiceMock,
}));

const brand = {
  activePlatforms: ['instagram', 'tiktok'],
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

function metrics(likes: number) {
  return { comments: 0, likes, saves: 0, shares: 0, views: likes * 10 };
}

/** Every render in a test shares one cache, as the app's provider does. */
const queryClient = createTestQueryClient();

function render(ui: ReactNode) {
  return renderView(ui, { wrapper: queryClientWrapper(queryClient) });
}

describe('AnalyticsBrandSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    findBrandAnalyticsTimeSeriesMock.mockResolvedValue([
      { date: '2026-03-01', instagram: metrics(30), tiktok: metrics(10) },
      { date: '2026-03-02', instagram: metrics(50), tiktok: metrics(10) },
    ]);
    findBrandPostsMock.mockResolvedValue([
      {
        description: '<p>Second best</p>',
        id: 'post-2',
        platform: 'tiktok',
        status: 'public',
        totalViews: 300,
      },
      {
        description: 'Best launch',
        id: 'post-1',
        platform: 'instagram',
        status: 'public',
        totalViews: 900,
      },
      {
        description: 'Still a draft',
        id: 'post-3',
        platform: 'instagram',
        status: 'draft',
        totalViews: 5000,
      },
    ]);
  });

  it('shows the headline numbers from the row straight away', async () => {
    render(<AnalyticsBrandSummary brand={brand} openHref="/brands/brand-1" />);

    expect(
      screen.getByRole('link', { name: 'Open analytics' }),
    ).toHaveAttribute('href', '/brands/brand-1');
    expect(await screen.findByText('4.2K')).toBeInTheDocument();
    expect(await screen.findByText('900')).toBeInTheDocument();
    expect(screen.getByText(/12%/)).toBeInTheDocument();
    expect(screen.getByText('vs last period')).toBeInTheDocument();
  });

  it('charts engagement, ranks platforms and lists the best published posts', async () => {
    render(<AnalyticsBrandSummary brand={brand} openHref="/brands/brand-1" />);

    expect(
      await screen.findByRole('img', { name: 'Engagement per day' }),
    ).toBeInTheDocument();

    const platforms = screen.getByRole('heading', { name: 'Platforms' })
      .parentElement as HTMLElement;
    expect(within(platforms).getByText('80')).toBeInTheDocument();
    expect(within(platforms).getByText('20')).toBeInTheDocument();
    expect(
      within(platforms).getByRole('progressbar', { name: 'Instagram' }),
    ).toHaveAttribute('aria-valuenow', '80');

    const posts = screen.getByRole('heading', { name: 'Top posts' })
      .parentElement as HTMLElement;
    expect(within(posts).getByText('Best launch')).toBeInTheDocument();
    expect(within(posts).getByText('900 views')).toBeInTheDocument();
    expect(within(posts).getByText('Second best')).toBeInTheDocument();
    expect(within(posts).queryByText('Still a draft')).not.toBeInTheDocument();
  });

  it('says so when the range has no activity and no posts', async () => {
    findBrandAnalyticsTimeSeriesMock.mockResolvedValue([]);
    findBrandPostsMock.mockResolvedValue([]);

    render(<AnalyticsBrandSummary brand={brand} openHref="/brands/brand-1" />);

    expect(
      await screen.findByText('No engagement in this period'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No platform activity in this period'),
    ).toBeInTheDocument();
    expect(screen.getByText('No published posts yet')).toBeInTheDocument();
  });

  it('shows what it loaded before when the same row is opened again', async () => {
    const first = render(
      <AnalyticsBrandSummary brand={brand} openHref="/brands/brand-1" />,
    );
    await screen.findByText('Best launch');
    first.unmount();

    render(<AnalyticsBrandSummary brand={brand} openHref="/brands/brand-1" />);

    expect(screen.getByText('Best launch')).toBeInTheDocument();
  });

  it('falls back to empty sections when the requests fail', async () => {
    findBrandAnalyticsTimeSeriesMock.mockRejectedValue(new Error('boom'));
    findBrandPostsMock.mockRejectedValue(new Error('boom'));

    render(<AnalyticsBrandSummary brand={brand} openHref="/brands/brand-1" />);

    expect(
      await screen.findByText('No engagement in this period'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('No published posts yet'),
    ).toBeInTheDocument();
  });
});
