import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOutreachCampaignDetail } from './useOutreachCampaignDetail';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  getTargets: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  push: vi.fn(),
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
  useParams: () => ({ id: 'campaign-1' }),
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

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
    mocks.getTargets.mockResolvedValue([]);
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

    const { result } = renderHook(() => useOutreachCampaignDetail());

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

    const { result } = renderHook(() => useOutreachCampaignDetail());
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
