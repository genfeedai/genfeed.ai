// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activityIsError: false,
  activityRefresh: vi.fn(async () => undefined),
  brandRefresh: vi.fn(async () => undefined),
  brandState: {
    brands: [
      {
        organization: { id: 'org_1', slug: 'acme' },
        slug: 'moonrise',
      },
    ],
    credentials: [],
    organizationId: 'org_1',
    refreshBrands: vi.fn(async () => undefined),
    selectedBrand: {
      organization: { id: 'org_1', slug: 'acme' },
      slug: 'moonrise',
    },
  },
  connectionRefresh: vi.fn(async () => undefined),
  connectionState: {
    error: null,
    key: null,
    refresh: vi.fn(async () => undefined),
    status: 'unconfigured',
    verifiedAt: null,
  } as {
    error: Error | null;
    key: { label?: string } | null;
    refresh: () => Promise<void>;
    status: 'configured' | 'error' | 'loading' | 'unconfigured';
    verifiedAt: string | null;
  },
  overviewRefresh: vi.fn(async () => undefined),
  overviewIsError: false,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brandState,
}));

vi.mock('@hooks/data/activities/use-activities/use-activities', () => ({
  useActivities: () => ({
    activities: [],
    activityStats: { statusCounts: {}, todayCount: 0, total: 0 },
    clearCompletedActivities: vi.fn(),
    error: null,
    filter: '',
    filteredActivities: [],
    isError: mocks.activityIsError,
    isLoading: false,
    isRefreshing: false,
    markActivitiesAsRead: vi.fn(),
    refresh: mocks.activityRefresh,
    setFilter: vi.fn(),
    toggleActivityRead: vi.fn(),
  }),
}));

vi.mock('@hooks/data/overview/use-overview-bootstrap', () => ({
  useOverviewBootstrap: () => ({
    activeRuns: [],
    analytics: { pendingPosts: 0 },
    error: null,
    isError: mocks.overviewIsError,
    isLoading: false,
    refresh: mocks.overviewRefresh,
    reviewInbox: {
      approvedCount: 0,
      changesRequestedCount: 0,
      pendingCount: 0,
      readyCount: 0,
      recentItems: [],
      rejectedCount: 0,
    },
    runs: [],
    stats: null,
    timeSeriesData: [],
  }),
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ value }: { value?: string | null }) => (
    <span>{value ?? 'unknown'}</span>
  ),
}));

vi.mock('./use-connect-genfeed-status', () => ({
  useConnectGenfeedStatus: () => mocks.connectionState,
}));

const { default: OperationalHomeContent } = await import('./content');

describe('OperationalHomeContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activityIsError = false;
    mocks.brandState.refreshBrands = mocks.brandRefresh;
    mocks.connectionState = {
      error: null,
      key: null,
      refresh: mocks.connectionRefresh,
      status: 'unconfigured',
      verifiedAt: null,
    };
    mocks.overviewIsError = false;
  });

  it('renders the canonical Connect Genfeed state when unconfigured', () => {
    render(<OperationalHomeContent />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Operational home' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Connect an AI client to start operating',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Connect Genfeed/ }),
    ).toHaveAttribute('href', '/acme/~/connect');
    expect(
      screen.getByRole('link', { name: /Manage API keys/ }),
    ).toHaveAttribute('href', '/acme/~/settings/api-keys');
    expect(
      screen.queryByTestId('operational-home-sections'),
    ).not.toBeInTheDocument();
  });

  it('renders all operational control-plane sections when configured', () => {
    mocks.connectionState = {
      error: null,
      key: { label: 'Verified MCP' },
      refresh: mocks.connectionRefresh,
      status: 'configured',
      verifiedAt: '2026-07-26T11:00:00.000Z',
    };

    render(<OperationalHomeContent />);

    expect(
      screen.getByTestId('operational-home-connected'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-approvals'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-publishing'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-credentials'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('operational-home-activity')).toBeInTheDocument();
    expect(screen.queryByText(/Studio/i)).not.toBeInTheDocument();
  });

  it('keeps operational summaries available when status resolution fails', () => {
    mocks.connectionState = {
      error: new Error('network unavailable'),
      key: null,
      refresh: mocks.connectionRefresh,
      status: 'error',
      verifiedAt: null,
    };

    render(<OperationalHomeContent />);

    expect(
      screen.getByRole('heading', {
        name: 'Connection status unavailable',
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('operational-home-sections')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Connect Genfeed' }),
    ).toHaveAttribute('href', '/acme/~/connect');
  });

  it('isolates overview failure from credential and activity summaries', () => {
    mocks.connectionState = {
      error: null,
      key: { label: 'Verified MCP' },
      refresh: mocks.connectionRefresh,
      status: 'configured',
      verifiedAt: '2026-07-26T11:00:00.000Z',
    };
    mocks.overviewIsError = true;

    render(<OperationalHomeContent />);

    expect(
      screen.getByText(/Approval state is temporarily unavailable/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Publishing state could not be loaded/),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-credentials'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('operational-home-activity')).toBeInTheDocument();
  });

  it('isolates activity failure from the other operational summaries', () => {
    mocks.connectionState = {
      error: null,
      key: { label: 'Verified MCP' },
      refresh: mocks.connectionRefresh,
      status: 'configured',
      verifiedAt: '2026-07-26T11:00:00.000Z',
    };
    mocks.activityIsError = true;

    render(<OperationalHomeContent />);

    expect(
      screen.getByText(/Recent activity is temporarily unavailable/),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-approvals'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-publishing'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-credentials'),
    ).toBeInTheDocument();
  });

  it('announces connection-state loading without rendering either state', () => {
    mocks.connectionState = {
      error: null,
      key: null,
      refresh: mocks.connectionRefresh,
      status: 'loading',
      verifiedAt: null,
    };

    render(<OperationalHomeContent />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking MCP connection state',
    );
    expect(
      screen.queryByTestId('operational-home-sections'),
    ).not.toBeInTheDocument();
  });
});
