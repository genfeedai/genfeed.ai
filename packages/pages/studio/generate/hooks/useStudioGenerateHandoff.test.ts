import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  notificationsInfo: vi.fn(),
  searchParamsString: 'handoff=handoff-1',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.searchParamsString),
}));

// `useAuthedService` returns a `useCallback`-stable resolver; minting a new
// async function per render would re-fire the consume effect on every commit
// (see the identical comment in useStudioRemixRun.test.ts).
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const service = { consume: mocks.consume };
  const resolveService = async () => service;
  return { useAuthedService: () => resolveService };
});

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ info: mocks.notificationsInfo }),
  },
}));

import { useStudioGenerateHandoff } from './useStudioGenerateHandoff';

const payload: AgentStudioHandoffPayload = {
  aspectRatio: '1:1',
  brandId: 'brand-1',
  modelKey: 'provider/model-x',
  outputs: 2,
  prompt: 'A futuristic city at sunset',
  type: 'image',
};

describe('useStudioGenerateHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParamsString = 'handoff=handoff-1';
  });

  it('consumes the handoff id from the URL through the Studio-native service and returns its payload', async () => {
    mocks.consume.mockResolvedValue(payload);

    const { result } = renderHook(() => useStudioGenerateHandoff());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.payload).toEqual(payload);
    expect(mocks.consume).toHaveBeenCalledWith('handoff-1', expect.anything());
    expect(mocks.notificationsInfo).not.toHaveBeenCalled();
  });

  it('falls back to null with a notice for an expired or foreign handoff', async () => {
    mocks.consume.mockResolvedValue(null);

    const { result } = renderHook(() => useStudioGenerateHandoff());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.payload).toBeNull();
    expect(mocks.notificationsInfo).toHaveBeenCalledTimes(1);
  });

  it('falls back to null with a notice when the request itself fails', async () => {
    mocks.consume.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useStudioGenerateHandoff());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.payload).toBeNull();
    expect(mocks.notificationsInfo).toHaveBeenCalledTimes(1);
  });

  it('never calls the service when the URL has no handoff id', async () => {
    mocks.searchParamsString = '';

    const { result } = renderHook(() => useStudioGenerateHandoff());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.payload).toBeNull();
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('consumes the same id only once even if the hook re-renders', async () => {
    mocks.consume.mockResolvedValue(payload);

    const { rerender } = renderHook(() => useStudioGenerateHandoff());
    await waitFor(() => expect(mocks.consume).toHaveBeenCalledTimes(1));

    rerender();
    rerender();

    expect(mocks.consume).toHaveBeenCalledTimes(1);
  });

  it('does not show a fallback notice or latch the retry guard for an aborted attempt', async () => {
    // Unmounting mid-flight (a StrictMode double-effect or a dependency
    // identity change works the same way) aborts the in-flight call — that
    // must be silent, not treated as "handoff unavailable". Marking the
    // guard only after a real resolution (not before the call, as the
    // original bug did) means an aborted attempt never blocks a genuine
    // retry either.
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    mocks.consume.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );

    const { unmount } = renderHook(() => useStudioGenerateHandoff());
    // `getHandoffService()` resolves on a microtask before `consume()` is
    // called, so the call hasn't landed yet immediately after render.
    await waitFor(() => expect(mocks.consume).toHaveBeenCalledTimes(1));

    unmount();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    rejectFirst?.(abortError);
    await Promise.resolve();

    expect(mocks.notificationsInfo).not.toHaveBeenCalled();
  });
});
