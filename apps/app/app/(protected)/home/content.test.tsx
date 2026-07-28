// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activityIsError: false,
  accessState: { organizationId: 'org_1' } as {
    organizationId?: string;
  } | null,
  activityRefresh: vi.fn(async () => undefined),
  brandRefresh: vi.fn(async () => undefined),
  brandState: {
    brands: [
      {
        organization: { slug: 'acme' },
        organizationId: 'org_1',
        slug: 'moonrise',
      },
    ],
    credentials: [],
    credentialsError: null,
    credentialsLoading: false,
    organizationId: 'org_1',
    refreshBrands: vi.fn(async () => undefined),
    selectedBrand: {
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'moonrise',
    },
  } as {
    brands: Array<{
      organization?: { slug?: string };
      organizationId?: string;
      slug?: string;
    }>;
    credentials: [];
    credentialsError: Error | null;
    credentialsLoading: boolean;
    organizationId: string;
    refreshBrands: () => Promise<void>;
    selectedBrand: {
      organization?: { slug?: string };
      organizationId?: string;
      slug?: string;
    } | null;
  },
  connectionOrganizationId: '',
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

vi.mock('@providers/access-state/access-state.provider', () => ({
  useAccessState: () => ({ accessState: mocks.accessState }),
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
  useConnectGenfeedStatus: (organizationId: string) => {
    mocks.connectionOrganizationId = organizationId;
    return mocks.connectionState;
  },
}));

const { default: OperationalHomeContent } = await import('./content');

describe('OperationalHomeContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accessState = { organizationId: 'org_1' };
    mocks.activityIsError = false;
    mocks.brandState.brands = [
      {
        organization: { slug: 'acme' },
        organizationId: 'org_1',
        slug: 'moonrise',
      },
    ];
    mocks.brandState.organizationId = 'org_1';
    mocks.brandState.credentialsError = null;
    mocks.brandState.credentialsLoading = false;
    mocks.brandState.refreshBrands = mocks.brandRefresh;
    mocks.brandState.selectedBrand = {
      organization: { slug: 'acme' },
      organizationId: 'org_1',
      slug: 'moonrise',
    };
    mocks.connectionState = {
      error: null,
      key: null,
      refresh: mocks.connectionRefresh,
      status: 'unconfigured',
      verifiedAt: null,
    };
    mocks.connectionOrganizationId = '';
    mocks.overviewIsError = false;
  });

  it('renders the canonical Connect Genfeed state when unconfigured', () => {
    render(<OperationalHomeContent />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Operational home' }),
    ).toHaveClass('sr-only');
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
    const connectionState = screen.getByTestId('operational-home-unconfigured');
    const operationalSections = screen.getByTestId('operational-home-sections');

    expect(
      connectionState.compareDocumentPosition(operationalSections) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  it('uses the access-state organization fallback for connection status', () => {
    mocks.brandState.organizationId = '';

    render(<OperationalHomeContent />);

    expect(mocks.connectionOrganizationId).toBe('org_1');
    expect(
      screen.getByRole('link', { name: /Connect Genfeed/ }),
    ).toHaveAttribute('href', '/acme/~/connect');
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

  it('uses organization-level brand setup actions when no brand is available', () => {
    mocks.brandState.brands = [
      {
        organization: { slug: 'acme' },
        organizationId: 'org_1',
      },
    ];
    mocks.brandState.selectedBrand = mocks.brandState.brands[0] ?? null;
    mocks.connectionState = {
      error: null,
      key: { label: 'Verified MCP' },
      refresh: mocks.connectionRefresh,
      status: 'configured',
      verifiedAt: '2026-07-26T11:00:00.000Z',
    };

    render(<OperationalHomeContent />);

    for (const name of [
      'Open queue',
      'Open publishing',
      'Manage accounts',
      'View activity',
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        '/acme/~/settings/brands',
      );
    }
  });

  it('wires connection and surface retry actions to their refresh handlers', () => {
    mocks.activityIsError = true;
    mocks.overviewIsError = true;
    mocks.connectionState = {
      error: new Error('network unavailable'),
      key: null,
      refresh: mocks.connectionRefresh,
      status: 'error',
      verifiedAt: null,
    };

    render(<OperationalHomeContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry status' }));
    for (const button of screen.getAllByRole('button', { name: 'Retry' })) {
      fireEvent.click(button);
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh credential health' }),
    );

    expect(mocks.connectionRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.overviewRefresh).toHaveBeenCalledTimes(2);
    expect(mocks.activityRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.brandRefresh).toHaveBeenCalledTimes(1);
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

  it('distinguishes credential loading from an empty credential list', () => {
    mocks.brandState.credentialsLoading = true;

    render(<OperationalHomeContent />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading credential health',
    );
    expect(
      screen.queryByText('No publishing credentials are connected yet.'),
    ).not.toBeInTheDocument();
  });

  it('surfaces credential errors with a working retry', () => {
    mocks.brandState.credentialsError = new Error('credentials unavailable');

    render(<OperationalHomeContent />);

    expect(
      screen.getByText(/Credential health is temporarily unavailable/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.brandRefresh).toHaveBeenCalledOnce();
    expect(
      screen.queryByText('No publishing credentials are connected yet.'),
    ).not.toBeInTheDocument();
  });

  it('announces connection-state loading while keeping operations visible', () => {
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
    expect(screen.getByTestId('operational-home-sections')).toBeInTheDocument();
  });
});
