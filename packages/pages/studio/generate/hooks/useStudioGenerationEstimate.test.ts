import {
  type AgentGenerationQuoteRequest,
  AgentGenerationQuoteUnavailableReason,
} from '@genfeedai/contracts/interfaces';
import {
  STUDIO_ESTIMATE_DEBOUNCE_MS,
  useStudioGenerationEstimate,
} from '@pages/studio/generate/hooks/useStudioGenerationEstimate';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEstimate = vi.fn();
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('stub-token'),
}));
const authState = vi.hoisted(() => ({ orgId: 'org-a', userId: 'user-1' }));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => authState,
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

describe('useStudioGenerationEstimate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockEstimate.mockReset();
    authState.orgId = 'org-a';
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
});
