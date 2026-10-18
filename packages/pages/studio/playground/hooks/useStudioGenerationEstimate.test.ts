import {
  type AgentGenerationQuoteRequest,
  AgentGenerationQuoteUnavailableReason,
} from '@genfeedai/contracts/interfaces';
import {
  STUDIO_ESTIMATE_DEBOUNCE_MS,
  useStudioGenerationEstimate,
} from '@pages/studio/playground/hooks/useStudioGenerationEstimate';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEstimate = vi.fn();
const authState = vi.hoisted(() => ({
  orgId: 'org-a',
  userId: 'user-1',
  sessionId: 'session-a',
  apiEndpoint: 'https://api.example.test',
  getToken: vi.fn(async () => 'stub-token'),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => authState,
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    get apiEndpoint() {
      return authState.apiEndpoint;
    },
  },
}));
vi.mock('@services/ai/router.service', () => ({
  RouterService: {
    getInstance: () => ({ estimateGenerationCredits: mockEstimate }),
  },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const nanoBanana: AgentGenerationQuoteRequest = {
  aspectRatio: '1:1',
  category: 'image',
  modelKey: 'google/nano-banana-2-lite',
  outputs: 1,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function quoted(credits: number) {
  return { credits, isAvailable: true, modelKey: 'google/nano-banana-2-lite' };
}

async function settle(): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS + 1));
}

describe('useStudioGenerationEstimate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockEstimate.mockReset();
    authState.orgId = 'org-a';
    authState.userId = 'user-1';
    authState.sessionId = 'session-a';
    authState.apiEndpoint = 'https://api.example.test';
    authState.getToken.mockReset().mockResolvedValue('stub-token');
  });
  afterEach(() => vi.useRealTimers());

  it('#6197: shows the server admission quote for a model the browser cannot price', async () => {
    // Nano Banana 2 Lite is priced from configured provider USD the public
    // catalog omits; the server charged 12 GEN while Studio showed nothing.
    mockEstimate.mockResolvedValue({
      credits: 12,
      isAvailable: true,
      modelKey: 'google/nano-banana-2-lite',
    });
    const { result } = renderHook(() =>
      useStudioGenerationEstimate(nanoBanana),
    );
    expect(result.current).toEqual({ credits: null, status: 'loading' });

    await act(() =>
      vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS + 1),
    );

    expect(result.current).toEqual({ credits: 12, status: 'estimated' });
    expect(mockEstimate).toHaveBeenCalledWith(
      nanoBanana,
      expect.any(AbortSignal),
    );
  });

  it('surfaces the server reason when it cannot price', async () => {
    mockEstimate.mockResolvedValue({
      credits: null,
      isAvailable: false,
      modelKey: null,
      unavailableReason:
        AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED,
    });
    const { result } = renderHook(() =>
      useStudioGenerationEstimate(nanoBanana),
    );
    await act(() =>
      vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS + 1),
    );
    expect(result.current).toEqual({
      credits: null,
      status: 'unavailable',
      unavailableReason:
        AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED,
    });
  });

  it('reports an ERROR reason when the request fails', async () => {
    mockEstimate.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() =>
      useStudioGenerationEstimate(nanoBanana),
    );
    await act(() =>
      vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS + 1),
    );
    expect(result.current).toMatchObject({
      status: 'unavailable',
      unavailableReason: AgentGenerationQuoteUnavailableReason.ERROR,
    });
  });

  it('debounces, aborts the stale request and drops its answer when a setting changes', async () => {
    let firstSignal: AbortSignal | undefined;
    mockEstimate.mockImplementationOnce(
      (_request: unknown, signal: AbortSignal) => {
        firstSignal = signal;
        return new Promise(() => {});
      },
    );
    mockEstimate.mockResolvedValueOnce({
      credits: 24,
      isAvailable: true,
      modelKey: 'google/nano-banana-2-lite',
    });
    const { result, rerender } = renderHook(
      ({ request }) => useStudioGenerationEstimate(request),
      { initialProps: { request: nanoBanana } },
    );
    await act(() =>
      vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS + 1),
    );
    expect(mockEstimate).toHaveBeenCalledTimes(1);

    rerender({ request: { ...nanoBanana, outputs: 2 } });
    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.status).toBe('loading');
    await act(() =>
      vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS + 1),
    );

    expect(mockEstimate).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ credits: 24, status: 'estimated' });
  });

  it('drops the cached quote and shows loading when the organization changes', async () => {
    mockEstimate.mockResolvedValueOnce({
      credits: 12,
      isAvailable: true,
      modelKey: 'google/nano-banana-2-lite',
    });
    mockEstimate.mockResolvedValueOnce({
      credits: 30,
      isAvailable: true,
      modelKey: 'google/nano-banana-2-lite',
    });
    const { result, rerender } = renderHook(() =>
      useStudioGenerationEstimate(nanoBanana),
    );
    await act(() =>
      vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS + 1),
    );
    expect(result.current).toEqual({ credits: 12, status: 'estimated' });

    authState.orgId = 'org-b';
    rerender();
    expect(result.current).toEqual({ credits: null, status: 'loading' });
    await act(() =>
      vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS + 1),
    );
    expect(result.current).toEqual({ credits: 30, status: 'estimated' });
  });

  it('makes no request without a concrete model', async () => {
    const { result } = renderHook(() => useStudioGenerationEstimate(null));
    await act(() =>
      vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS * 2),
    );
    expect(mockEstimate).not.toHaveBeenCalled();
    expect(result.current.status).toBe('loading');
  });
  it.each(['session', 'api'] as const)(
    'hides a cached quote when %s identity changes',
    async (identity) => {
      mockEstimate.mockResolvedValue(quoted(12));
      const { result, rerender } = renderHook(() =>
        useStudioGenerationEstimate(nanoBanana),
      );
      await settle();
      expect(result.current.status).toBe('estimated');
      if (identity === 'session') authState.sessionId = 'session-b';
      else authState.apiEndpoint = 'https://other-api.example.test';
      rerender();
      expect(result.current).toEqual({ credits: null, status: 'loading' });
      await settle();
      expect(mockEstimate).toHaveBeenCalledTimes(2);
    },
  );

  it('does not revive a cached quote after an owner round trip', async () => {
    mockEstimate
      .mockResolvedValueOnce(quoted(12))
      .mockResolvedValueOnce(quoted(30));
    const { result, rerender } = renderHook(() =>
      useStudioGenerationEstimate(nanoBanana),
    );
    await settle();
    expect(result.current.credits).toBe(12);
    authState.orgId = 'org-b';
    rerender();
    authState.orgId = 'org-a';
    rerender();
    expect(result.current).toEqual({ credits: null, status: 'loading' });
    await settle();
    expect(result.current.credits).toBe(30);
  });

  it.each(['replace', 'unmount'] as const)(
    'does not dispatch after %s during token acquisition',
    async (operation) => {
      const token = deferred<string>();
      authState.getToken.mockReturnValueOnce(token.promise);
      mockEstimate.mockResolvedValue(quoted(12));
      const { rerender, unmount } = renderHook(() =>
        useStudioGenerationEstimate(nanoBanana),
      );
      await settle();
      expect(authState.getToken).toHaveBeenCalledTimes(1);
      if (operation === 'unmount') unmount();
      else {
        authState.sessionId = 'session-b';
        rerender();
      }
      await act(async () => {
        token.resolve('old-token');
        await token.promise;
      });
      expect(mockEstimate).not.toHaveBeenCalled();
    },
  );

  it.each(['success', 'failure'] as const)(
    'ignores late old-owner quote %s',
    async (outcome) => {
      const old = deferred<ReturnType<typeof quoted>>();
      mockEstimate
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(quoted(30));
      const { result, rerender } = renderHook(() =>
        useStudioGenerationEstimate(nanoBanana),
      );
      await settle();
      authState.orgId = 'org-b';
      rerender();
      await settle();
      expect(result.current.credits).toBe(30);
      await act(async () => {
        if (outcome === 'success') old.resolve(quoted(12));
        else old.reject(new Error('Old owner failure'));
      });
      expect(result.current.credits).toBe(30);
      expect(result.current.status).toBe('estimated');
    },
  );

  it('keeps the current-owner equal-request cache', async () => {
    mockEstimate.mockResolvedValue(quoted(12));
    const { result, rerender } = renderHook(() =>
      useStudioGenerationEstimate(nanoBanana),
    );
    await settle();
    const cached = result.current;
    rerender();
    await settle();
    expect(result.current).toEqual(cached);
    expect(mockEstimate).toHaveBeenCalledTimes(1);
  });
});
