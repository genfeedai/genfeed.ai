import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  notifySuccess: vi.fn(),
  refreshScans: vi.fn().mockResolvedValue(undefined),
  refreshTrends: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    refreshTrends: mocks.refreshTrends,
  }),
}));

vi.mock('@genfeedai/services/social/trends.service', () => ({
  TrendsService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notifyError,
      info: mocks.notifyInfo,
      success: mocks.notifySuccess,
    }),
  },
}));

vi.mock('@/features/research/scans/use-research-scans', () => ({
  useResearchScans: () => ({
    refresh: mocks.refreshScans,
    statusFor: () => ({ library: 'trends', remaining: 1 }),
  }),
}));

import { useNicheScan } from './use-niche-scan';

function limitError() {
  return {
    response: {
      data: {
        errors: [
          {
            code: 'research_scan_limit_reached',
            meta: { hasPlan: false, nextAvailableAtMs: 1_800_000_000_000 },
            status: 429,
          },
        ],
      },
    },
  };
}

describe('useNicheScan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshScans.mockResolvedValue(undefined);
  });

  it('refreshes the desk and the counts after a scan starts', async () => {
    mocks.refreshTrends.mockResolvedValue({ count: 3, success: true });
    const refreshDesk = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNicheScan(refreshDesk));

    await act(async () => {
      await result.current.scan();
    });

    expect(mocks.notifySuccess).toHaveBeenCalledWith('started');
    expect(refreshDesk).toHaveBeenCalledTimes(1);
    expect(mocks.refreshScans).toHaveBeenCalledTimes(1);
    expect(result.current.isScanning).toBe(false);
  });

  it('tells the person a refused scan is a limit, and re-reads the counts', async () => {
    mocks.refreshTrends.mockRejectedValue(limitError());
    const refreshDesk = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNicheScan(refreshDesk));

    await act(async () => {
      await result.current.scan();
    });

    expect(mocks.notifyInfo).toHaveBeenCalledWith('limitReached');
    expect(mocks.notifyError).not.toHaveBeenCalled();
    expect(refreshDesk).not.toHaveBeenCalled();
    expect(mocks.refreshScans).toHaveBeenCalledTimes(1);
  });

  it('reports any other failure as an error', async () => {
    mocks.refreshTrends.mockRejectedValue(new Error('scraper down'));
    const { result } = renderHook(() =>
      useNicheScan(vi.fn().mockResolvedValue(undefined)),
    );

    await act(async () => {
      await result.current.scan();
    });

    expect(mocks.notifyError).toHaveBeenCalledWith('scraper down');
    expect(mocks.notifyInfo).not.toHaveBeenCalled();
  });
});
