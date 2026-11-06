import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { CampaignTargetStatus } from '@genfeedai/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOutreachCampaignDetail } from './useOutreachCampaignDetail';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  campaignId: 'campaign-1',
  getTargets: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams() as URLSearchParams,
  start: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org-1' }),
}));

const outreachCampaignsServiceMock = {
  findOne: mocks.findOne,
  getTargets: mocks.getTargets,
  start: mocks.start,
};
// A stable resolver, like the real `useCallback`-memoized one: a fresh
// closure per render invalidates every consumer `useCallback` that depends
// on it (`loadCampaign`, `handleStartCampaign`, …), which re-fires their
// effects on every commit and hangs the test in an infinite render loop.
const resolveOutreachCampaignsService = async () =>
  outreachCampaignsServiceMock;

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => resolveOutreachCampaignsService,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));

vi.mock('@services/automation/outreach-campaigns.service', () => ({
  OutreachCampaignsService: { getInstance: vi.fn() },
}));

const notificationsServiceMock = {
  error: mocks.notificationsError,
  success: mocks.notificationsSuccess,
};
// Same stability concern as the service resolver above: `notificationsService`
// sits in `loadCampaign`'s dependency array, so a new object per call
// re-fires the load effect on every render.
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notificationsServiceMock },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: mocks.campaignId }),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function renderDetail(client = createTestQueryClient()) {
  return renderHook(() => useOutreachCampaignDetail(), {
    wrapper: queryClientWrapper(client),
  });
}

describe('useOutreachCampaignDetail — start-campaign reentrancy guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOne.mockResolvedValue({
      campaignType: 'manual',
      id: 'campaign-1',
      label: 'Sequence',
      platform: 'twitter',
      status: 'draft',
    });
    mocks.getTargets.mockResolvedValue({
      page: 1,
      pageSize: 15,
      statusCounts: {},
      targets: [],
      total: 0,
      totalPages: 1,
    });
  });

  it('guards against a duplicate paid start from two rapid calls', async () => {
    let resolveStart: (() => void) | undefined;
    mocks.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = () =>
            resolve({
              campaignType: 'manual',
              id: 'campaign-1',
              status: 'active',
            });
        }),
    );

    const { result } = renderDetail();

    await waitFor(() => expect(result.current.campaign).not.toBeNull());

    try {
      // Two calls in the same tick, before the first `await` inside
      // `handleStartCampaign` can flip `isStartingCampaign` via a render —
      // the reentrancy guard must be the ref, not the state, to catch this.
      act(() => {
        result.current.handleStartCampaign();
        result.current.handleStartCampaign();
      });

      await waitFor(() => expect(mocks.start).toHaveBeenCalled());
      expect(mocks.start).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        resolveStart?.();
        await Promise.resolve();
      });
    }
  });

  it('reports isStartingCampaign true only while the call is in flight', async () => {
    let resolveStart: (() => void) | undefined;
    mocks.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = () =>
            resolve({
              campaignType: 'manual',
              id: 'campaign-1',
              status: 'active',
            });
        }),
    );

    const { result } = renderDetail();
    await waitFor(() => expect(result.current.campaign).not.toBeNull());

    expect(result.current.isStartingCampaign).toBe(false);

    try {
      act(() => {
        result.current.handleStartCampaign();
      });

      await waitFor(() => expect(result.current.isStartingCampaign).toBe(true));
    } finally {
      await act(async () => {
        resolveStart?.();
        await Promise.resolve();
      });
    }

    await waitFor(() => expect(result.current.isStartingCampaign).toBe(false));
  });
});

describe('useOutreachCampaignDetail — paginated targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams('page=3');
    mocks.findOne.mockResolvedValue({
      campaignType: 'manual',
      id: 'campaign-1',
      label: 'Sequence',
      platform: 'twitter',
      status: 'draft',
    });
    mocks.getTargets.mockResolvedValue({
      page: 3,
      pageSize: 15,
      statusCounts: { FAILED: 2, PENDING: 30, REPLIED: 8 },
      targets: [{ id: 'target-31' }],
      total: 40,
      totalPages: 3,
    });
  });

  afterEach(() => {
    mocks.searchParams = new URLSearchParams();
  });

  it('requests only the page in the URL', async () => {
    const { result } = renderDetail();

    await waitFor(() => expect(result.current.campaign).not.toBeNull());

    expect(mocks.getTargets).toHaveBeenCalledWith(
      'campaign-1',
      { limit: 15, page: 3 },
      expect.any(AbortSignal),
    );
    expect(result.current.targets).toEqual([{ id: 'target-31' }]);
  });

  it('derives the KPIs from the campaign-wide counts, not the loaded page', async () => {
    const { result } = renderDetail();

    await waitFor(() => expect(result.current.campaign).not.toBeNull());

    expect(result.current.targetStats).toEqual({
      failed: 2,
      pending: 30,
      processing: 0,
      replied: 8,
      scheduled: 0,
      sent: 0,
      skipped: 0,
      total: 40,
    });
  });
  it('keeps server target totals with the targets and status counts', async () => {
    mocks.getTargets.mockResolvedValue({
      page: 2,
      pageSize: 15,
      targets: [],
      total: 61,
      totalPages: 5,
      statusCounts: { [CampaignTargetStatus.PENDING]: 61 },
    });
    const { result } = renderDetail();
    expect(result.current.pageTotals).toEqual({ totalDocs: 0, totalPages: 1 });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pageTotals).toEqual({ totalDocs: 61, totalPages: 5 });
    expect(result.current.targetStats.pending).toBe(61);
  });
});

describe('useOutreachCampaignDetail — cached campaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaignId = 'campaign-1';
    mocks.findOne.mockResolvedValue({
      campaignType: 'manual',
      id: 'campaign-1',
      label: 'Sequence',
      platform: 'twitter',
      status: 'draft',
    });
    mocks.getTargets.mockResolvedValue({
      page: 1,
      pageSize: 15,
      statusCounts: { [CampaignTargetStatus.PENDING]: 1 },
      targets: [{ id: 'target-1' }],
      total: 1,
      totalPages: 1,
    });
  });

  it('paints the campaign and its targets at once when coming back', async () => {
    const client = createTestQueryClient();
    const firstVisit = renderDetail(client);
    await waitFor(() =>
      expect(firstVisit.result.current.isLoading).toBe(false),
    );
    firstVisit.unmount();

    mocks.findOne.mockReturnValue(new Promise(() => {}));
    mocks.getTargets.mockReturnValue(new Promise(() => {}));
    const { result } = renderDetail(client);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.campaign?.label).toBe('Sequence');
    expect(result.current.targets).toEqual([{ id: 'target-1' }]);
    expect(result.current.targetStats.pending).toBe(1);
  });

  it('never shows one campaign under another campaign id', async () => {
    const client = createTestQueryClient();
    const firstVisit = renderDetail(client);
    await waitFor(() =>
      expect(firstVisit.result.current.isLoading).toBe(false),
    );
    firstVisit.unmount();

    mocks.campaignId = 'campaign-2';
    mocks.findOne.mockReturnValue(new Promise(() => {}));
    mocks.getTargets.mockReturnValue(new Promise(() => {}));
    const { result } = renderDetail(client);

    expect(result.current.isLoading).toBe(true);
    expect(result.current.campaign).toBeNull();
    expect(result.current.targets).toEqual([]);
  });

  it('keeps the campaign on screen when a background refresh fails', async () => {
    const { result } = renderDetail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mocks.findOne.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await result.current.loadCampaign();
    });

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(result.current.campaign?.label).toBe('Sequence');
  });

  it('shows the started campaign status from the start response', async () => {
    mocks.start.mockResolvedValue({
      campaignType: 'manual',
      id: 'campaign-1',
      label: 'Sequence',
      status: 'active',
    });
    const { result } = renderDetail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleStartCampaign();
    });

    await waitFor(() => expect(result.current.campaign?.status).toBe('active'));
  });
});
