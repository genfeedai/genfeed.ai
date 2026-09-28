import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDeferredIsSignedIn } from './use-deferred-is-signed-in';

const getSession = vi.fn();

vi.mock('@genfeedai/auth-client', () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

function runIdleImmediately() {
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((callback: () => void) => {
      callback();
      return 1;
    }),
  );
  vi.stubGlobal('cancelIdleCallback', vi.fn());
}

afterEach(() => {
  vi.unstubAllGlobals();
  getSession.mockReset();
});

describe('useDeferredIsSignedIn', () => {
  it('starts signed out and flips once the idle session check finds a session', async () => {
    runIdleImmediately();
    getSession.mockResolvedValue({ data: { session: { id: 's1' } } });

    const { result, unmount } = renderHook(() => useDeferredIsSignedIn());

    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(getSession).toHaveBeenCalledWith({
      fetchOptions: { signal: expect.any(AbortSignal) },
    });
    unmount();
  });

  it('stays signed out when there is no session or the check fails', async () => {
    runIdleImmediately();
    getSession.mockRejectedValue(new Error('network'));

    const { result, unmount } = renderHook(() => useDeferredIsSignedIn());

    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(result.current).toBe(false);
    unmount();
  });

  it('waits for idle instead of checking during hydration', () => {
    const requestIdle = vi.fn(() => 7);
    const cancelIdle = vi.fn();
    vi.stubGlobal('requestIdleCallback', requestIdle);
    vi.stubGlobal('cancelIdleCallback', cancelIdle);

    const { unmount } = renderHook(() => useDeferredIsSignedIn());

    expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 3000,
    });
    expect(getSession).not.toHaveBeenCalled();

    unmount();
    expect(cancelIdle).toHaveBeenCalledWith(7);
  });

  it('picks up a sign-in from another tab when the page is shown again', async () => {
    runIdleImmediately();
    getSession.mockResolvedValue({ data: null });

    const { result, unmount } = renderHook(() => useDeferredIsSignedIn());
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);

    getSession.mockResolvedValue({ data: { session: { id: 's1' } } });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(result.current).toBe(true));

    unmount();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(getSession).toHaveBeenCalledTimes(2);
  });
});
