import type { IDesktopSession } from '@genfeedai/desktop-contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncEngine } from './useSyncEngine';

const runSync = vi.hoisted(() => vi.fn());

vi.mock('./thread-sync.service', () => ({
  ThreadSyncService: class {
    run = runSync;
  },
}));

const session = (userId: string): IDesktopSession => ({
  issuedAt: '2026-07-18T00:00:00.000Z',
  token: `token-${userId}`,
  userId,
});

const completedResult = {
  assetUploadCount: 0,
  errors: [],
  pulledCount: 0,
  pulledMetadataCount: 0,
  pushedCount: 0,
  pushedMetadataCount: 0,
};

describe('useSyncEngine', () => {
  beforeEach(() => {
    runSync.mockReset();
    window.genfeedDesktop = {
      sync: {
        onSyncThreadsRequested: vi.fn(() => vi.fn()),
      },
    } as unknown as typeof window.genfeedDesktop;
  });

  it('does not overlap manual sync requests', async () => {
    let resolveRun: ((value: typeof completedResult) => void) | undefined;
    runSync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useSyncEngine({
        apiEndpoint: 'https://api.genfeed.ai/v1',
        hasFullAssetUploadConsent: false,
        localUserId: 'local-user',
        session: session('cloud-user-a'),
      }),
    );

    await waitFor(() => expect(runSync).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.triggerSync();
      result.current.triggerSync();
    });
    expect(runSync).toHaveBeenCalledTimes(1);

    resolveRun?.(completedResult);
    await waitFor(() => expect(result.current.isSyncing).toBe(false));
  });

  it('aborts stale work and starts a new run when the account changes', async () => {
    runSync.mockImplementation(() => new Promise(() => {}));
    const { rerender } = renderHook(
      ({ activeSession }) =>
        useSyncEngine({
          apiEndpoint: 'https://api.genfeed.ai/v1',
          hasFullAssetUploadConsent: false,
          localUserId: 'local-user',
          session: activeSession,
        }),
      {
        initialProps: { activeSession: session('cloud-user-a') },
      },
    );

    await waitFor(() => expect(runSync).toHaveBeenCalledTimes(1));
    const firstSignal = runSync.mock.calls[0]?.[0].signal as AbortSignal;

    rerender({ activeSession: session('cloud-user-b') });

    await waitFor(() => expect(runSync).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    expect(runSync.mock.calls[1]?.[0].session.userId).toBe('cloud-user-b');
  });
});
