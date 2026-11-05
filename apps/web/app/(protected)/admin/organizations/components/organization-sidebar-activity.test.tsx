import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { render as renderView, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationSidebarActivity from './organization-sidebar-activity';

const mocks = vi.hoisted(() => ({
  getBrandsWithStats: vi.fn(),
  getTimeSeries: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const stableDateRange = {
  endDate: new Date('2026-03-12T12:00:00.000Z'),
  startDate: new Date('2026-03-01T12:00:00.000Z'),
};

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({ dateRange: stableDateRange }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

const getAnalyticsServiceMock = async () => ({
  getBrandsWithStats: mocks.getBrandsWithStats,
  getTimeSeries: mocks.getTimeSeries,
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getAnalyticsServiceMock,
}));

function metrics(likes: number) {
  return { comments: 0, likes, saves: 0, shares: 0, views: likes * 10 };
}

function brandRow(id: string, name: string, totalEngagement: number) {
  return {
    activePlatforms: [],
    avgEngagementRate: 0,
    growth: 0,
    id,
    name,
    organizationId: 'org-1',
    organizationName: 'Acme Inc',
    totalEngagement,
    totalPosts: 1,
    totalViews: 0,
  };
}

const queryClient = createTestQueryClient();

function render(ui: ReactNode) {
  return renderView(ui, { wrapper: queryClientWrapper(queryClient) });
}

describe('OrganizationSidebarActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    mocks.getTimeSeries.mockResolvedValue([
      { date: '2026-03-01', instagram: metrics(30) },
      { date: '2026-03-02', instagram: metrics(50), tiktok: metrics(10) },
    ]);
    mocks.getBrandsWithStats.mockResolvedValue({
      data: [brandRow('brand-1', 'Acme', 750), brandRow('brand-2', 'Beta', 0)],
      pagination: { limit: 5, page: 1, total: 3, totalPages: 1 },
      totals: {
        growth: 0,
        totalEngagement: 1000,
        totalPosts: 3,
        totalViews: 0,
      },
    });
  });

  it("charts the organization's engagement and ranks its brands by share", async () => {
    render(<OrganizationSidebarActivity organizationId="org-1" />);

    expect(
      await screen.findByRole('img', { name: 'Engagement per day' }),
    ).toBeInTheDocument();

    const brands = screen.getByRole('heading', { name: 'Brands' })
      .parentElement as HTMLElement;
    expect(
      await within(brands).findByRole('progressbar', { name: 'Acme' }),
    ).toHaveAttribute('aria-valuenow', '75');
    expect(within(brands).getByText('750')).toBeInTheDocument();
    expect(within(brands).queryByText('Beta')).not.toBeInTheDocument();
  });

  it('reads the page date range for this organization only', async () => {
    render(<OrganizationSidebarActivity organizationId="org-1" />);

    await screen.findByRole('progressbar', { name: 'Acme' });
    expect(mocks.getTimeSeries).toHaveBeenCalledWith({
      endDate: '2026-03-12',
      organizationId: 'org-1',
      startDate: '2026-03-01',
    });
  });

  it('says so when the range has no engagement', async () => {
    mocks.getTimeSeries.mockResolvedValue([]);
    mocks.getBrandsWithStats.mockResolvedValue({
      data: [brandRow('brand-1', 'Acme', 0)],
      pagination: { limit: 5, page: 1, total: 1, totalPages: 1 },
      totals: { growth: 0, totalEngagement: 0, totalPosts: 0, totalViews: 0 },
    });

    render(<OrganizationSidebarActivity organizationId="org-1" />);

    expect(
      await screen.findByText('No engagement in this period'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('No brand engagement in this period'),
    ).toBeInTheDocument();
  });

  it('falls back to empty sections when the requests fail', async () => {
    mocks.getTimeSeries.mockRejectedValue(new Error('boom'));
    mocks.getBrandsWithStats.mockRejectedValue(new Error('boom'));

    render(<OrganizationSidebarActivity organizationId="org-1" />);

    expect(
      await screen.findByText('No engagement in this period'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('No brand engagement in this period'),
    ).toBeInTheDocument();
  });
});
