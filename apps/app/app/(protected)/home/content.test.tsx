// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { ActivityKey } from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import type { OverviewBootstrapPayload } from '@services/auth/auth.service';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ReviewInboxItem =
  OverviewBootstrapPayload['reviewInbox']['recentItems'][number];

const mocks = vi.hoisted(() => ({
  activities: [] as IActivity[],
  activityIsError: false,
  accessState: { organizationId: 'org_1' } as {
    organizationId?: string;
  } | null,
  activityRefresh: vi.fn(async () => undefined),
  batchItemAction: vi.fn(async () => ({})),
  cancelExecution: vi.fn(async () => undefined),
  executionsRefresh: vi.fn(async () => undefined),
  brandRefresh: vi.fn(async () => undefined),
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
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
  overviewIsLoading: false,
  reviewInboxRecentItems: [] as ReviewInboxItem[],
  translate: vi.fn((id: string, params?: Record<string, string>) =>
    params ? `catalog:${id}:${params.subject}` : `catalog:${id}`,
  ),
  // `null` keeps the upcoming-schedule fetch pending so synchronous tests see
  // a stable loading panel with no post-test state updates.
  upcomingReleases: null as unknown[] | null,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brandState,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token-1'),
}));

vi.mock('@services/content/release-groups.service', () => ({
  ReleaseGroupsService: {
    getInstance: () => ({
      findAll: () =>
        mocks.upcomingReleases === null
          ? new Promise(() => {})
          : Promise.resolve(mocks.upcomingReleases),
    }),
  },
}));

vi.mock('@services/batch/batches.service', () => ({
  BatchesService: {
    getInstance: () => ({ itemAction: mocks.batchItemAction }),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mocks.notificationsError }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@providers/access-state/access-state.provider', () => ({
  useAccessState: () => ({ accessState: mocks.accessState }),
}));

vi.mock('@hooks/data/activities/use-activities/use-activities', () => ({
  useActivities: () => ({
    activities: mocks.activities,
    activityStats: { statusCounts: {}, todayCount: 0, total: 0 },
    clearCompletedActivities: vi.fn(),
    error: null,
    filter: '',
    filteredActivities: mocks.activities,
    isError: mocks.activityIsError,
    isLoading: false,
    isRefreshing: false,
    markActivitiesAsRead: vi.fn(),
    refresh: mocks.activityRefresh,
    setFilter: vi.fn(),
    toggleActivityRead: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => mocks.translate,
}));

vi.mock('@hooks/data/overview/use-overview-bootstrap', () => ({
  useOverviewBootstrap: () => ({
    activeRuns: [],
    analytics: { pendingPosts: 0 },
    error: null,
    isError: mocks.overviewIsError,
    isLoading: mocks.overviewIsLoading,
    refresh: mocks.overviewRefresh,
    reviewInbox: {
      approvedCount: 0,
      changesRequestedCount: 0,
      pendingCount: 0,
      readyCount: 0,
      recentItems: mocks.reviewInboxRecentItems,
      rejectedCount: 0,
    },
    runs: [],
    stats: null,
    timeSeriesData: [],
  }),
}));

vi.mock('@hooks/data/workflow-executions/use-workflow-executions', () => ({
  useWorkflowExecutions: () => ({
    cancelExecution: mocks.cancelExecution,
    executions: [],
    isLoading: false,
    refresh: mocks.executionsRefresh,
    stats: {
      active: 0,
      completed: 0,
      failed: 0,
      total: 0,
      totalCredits: 0,
    },
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

function buildReviewItem(id: string): ReviewInboxItem {
  return {
    batchId: 'batch_1',
    createdAt: '2026-08-08T12:00:00.000Z',
    format: 'image',
    id,
    platform: 'instagram',
    postId: `post_${id}`,
    reviewDecision: 'unset',
    status: 'ready',
    summary: `Review ${id}`,
  };
}

describe('OperationalHomeContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activities = [];
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
    mocks.overviewIsLoading = false;
    mocks.reviewInboxRecentItems = [];
    mocks.upcomingReleases = null;
  });

  it('renders the canonical Connect Genfeed state when unconfigured', () => {
    render(<OperationalHomeContent />);

    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Operational home' }),
    ).toHaveClass('sr-only');
    expect(
      screen.getByText(
        /Connect Claude Code, Codex, or another MCP client to unlock live/,
      ),
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

  it('renders missing-organization recovery inside the existing shell landmark', () => {
    mocks.accessState = null;
    mocks.brandState.brands = [];
    mocks.brandState.organizationId = '';
    mocks.brandState.selectedBrand = null;

    render(<OperationalHomeContent />);

    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Operational home needs an organization',
      }),
    ).toBeInTheDocument();
  });

  it('renders all operational control-plane sections when configured', async () => {
    mocks.connectionState = {
      error: null,
      key: { label: 'Verified MCP' },
      refresh: mocks.connectionRefresh,
      status: 'configured',
      verifiedAt: '2026-07-26T11:00:00.000Z',
    };
    mocks.upcomingReleases = [];

    render(<OperationalHomeContent />);

    expect(
      screen.getByTestId('operational-home-connected'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-needs-you'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-publishing'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('operational-home-upcoming')).toBeInTheDocument();
    expect(
      screen.getByTestId('operational-home-credentials'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('operational-home-activity')).toBeInTheDocument();
    expect(screen.queryByText(/Studio/i)).not.toBeInTheDocument();

    // An empty scheduler window settles into the explicit zero state.
    expect(
      await screen.findByText('catalog:home.schedule.empty'),
    ).toBeInTheDocument();
  });

  it('resolves overview activity descriptions through the message catalog', () => {
    mocks.activities = [
      {
        createdAt: '2026-08-08T12:00:00.000Z',
        id: 'activity-1',
        isDeleted: false,
        isRead: false,
        key: ActivityKey.IMAGE_PROCESSING,
        source: 'image-generate',
        updatedAt: '2026-08-08T12:00:00.000Z',
        value: 'image-1',
      } as IActivity,
    ];

    render(<OperationalHomeContent />);

    expect(
      screen.getByText('catalog:activity.lifecycle.processing:image'),
    ).toBeInTheDocument();
    expect(mocks.translate).toHaveBeenCalledWith(
      'activity.lifecycle.processing',
      expect.objectContaining({
        articleSubject: 'an image',
        operation: 'generate',
        subject: 'image',
      }),
    );
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
      screen.getByText(/Connection status unavailable/),
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
      'catalog:home.approvals.open',
      'catalog:home.publishing.open',
      'catalog:home.schedule.open',
      'catalog:home.credentials.manage',
      'catalog:home.activity.open',
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
    for (const button of screen.getAllByRole('button', {
      name: 'catalog:actions.retry',
    })) {
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
      screen.getByTestId('operational-home-needs-you'),
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

    const credentials = screen.getByTestId('operational-home-credentials');
    expect(within(credentials).getByRole('status')).toHaveTextContent(
      'catalog:home.credentials.loading',
    );
    expect(
      within(credentials).getByTestId('list-rows-skeleton'),
    ).toBeInTheDocument();
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
    fireEvent.click(
      screen.getByRole('button', { name: 'catalog:actions.retry' }),
    );
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

    const statusAnnouncements = screen.getAllByRole('status');
    expect(
      statusAnnouncements.some((announcement) =>
        announcement.textContent?.includes('Checking MCP connection state'),
      ),
    ).toBe(true);
    expect(screen.getByTestId('operational-home-sections')).toBeInTheDocument();
  });

  it('shows the needs-you skeleton while overview data is loading', () => {
    mocks.overviewIsLoading = true;

    render(<OperationalHomeContent />);

    expect(
      within(screen.getByTestId('operational-home-needs-you')).getByTestId(
        'list-rows-skeleton',
      ),
    ).toBeInTheDocument();
  });

  it('renders the metric rail chrome with skeleton values while overview data loads', () => {
    mocks.overviewIsLoading = true;

    render(<OperationalHomeContent />);

    const metrics = screen.getByTestId('operational-home-metrics');
    expect(metrics).toHaveTextContent('ready to review');
    expect(metrics).toHaveTextContent('pending posts');
    expect(metrics.querySelectorAll('.animate-pulse')).toHaveLength(2);
  });

  it('keeps decided review items out of the attention queue', () => {
    mocks.reviewInboxRecentItems = [
      {
        ...buildReviewItem('item_1'),
        reviewDecision: 'approved',
        status: 'approved',
      },
    ];

    render(<OperationalHomeContent />);

    const needsYou = screen.getByTestId('operational-home-needs-you');
    expect(
      within(needsYou).queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
    expect(needsYou).toHaveTextContent('catalog:home.approvals.empty');
  });

  it('caps the attention queue at eight rows and links to the rest', () => {
    mocks.reviewInboxRecentItems = Array.from({ length: 9 }, (_, index) =>
      buildReviewItem(`item_${index + 1}`),
    );

    render(<OperationalHomeContent />);

    const needsYou = screen.getByTestId('operational-home-needs-you');
    expect(
      within(needsYou).getAllByTestId('operational-home-needs-you-row'),
    ).toHaveLength(8);
    expect(
      within(needsYou).getByTestId('operational-home-needs-you-overflow'),
    ).toHaveAttribute('href', '/acme/moonrise/publishing/review');
    expect(needsYou).toHaveTextContent('catalog:home.approvals.overflow');
    expect(needsYou).toHaveTextContent('catalog:home.approvals.viewAll');
  });

  it('approves a review item and refreshes the overview on success', async () => {
    mocks.reviewInboxRecentItems = [
      {
        batchId: 'batch_1',
        createdAt: '2026-08-08T12:00:00.000Z',
        format: 'image',
        id: 'item_1',
        platform: 'instagram',
        postId: 'post_1',
        reviewDecision: 'unset',
        status: 'ready',
        summary: 'Product hero shot',
      },
    ];

    render(<OperationalHomeContent />);

    fireEvent.click(
      within(screen.getByTestId('operational-home-needs-you')).getByRole(
        'button',
        { name: 'Approve' },
      ),
    );

    await waitFor(() =>
      expect(mocks.batchItemAction).toHaveBeenCalledWith('batch_1', {
        action: 'approve',
        itemIds: ['item_1'],
      }),
    );
    expect(mocks.overviewRefresh).toHaveBeenCalled();
    expect(mocks.notificationsError).not.toHaveBeenCalled();
  });

  it('surfaces a notification when approving a review item fails', async () => {
    mocks.reviewInboxRecentItems = [
      {
        batchId: 'batch_1',
        createdAt: '2026-08-08T12:00:00.000Z',
        format: 'image',
        id: 'item_1',
        platform: 'instagram',
        postId: 'post_1',
        reviewDecision: 'unset',
        status: 'ready',
        summary: 'Product hero shot',
      },
    ];
    mocks.batchItemAction.mockRejectedValueOnce(new Error('approve failed'));

    render(<OperationalHomeContent />);

    fireEvent.click(
      within(screen.getByTestId('operational-home-needs-you')).getByRole(
        'button',
        { name: 'Approve' },
      ),
    );

    await waitFor(() =>
      expect(mocks.notificationsError).toHaveBeenCalledWith('Approve'),
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Approve review item failed',
      expect.any(Error),
    );
  });
});
