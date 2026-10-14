import {
  AgentGenerationQuoteUnavailableReason,
  type HeyGenAvatarVideoRequest,
} from '@genfeedai/contracts/interfaces';
import { useStudioAvatarEstimate } from '@pages/studio/playground/hooks/useStudioAvatarEstimate';
import { STUDIO_ESTIMATE_DEBOUNCE_MS } from '@pages/studio/playground/hooks/useStudioGenerationEstimate';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuote = vi.fn();
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('stub-token'),
}));
const authState = vi.hoisted(() => ({ orgId: 'org-a', userId: 'user-1' }));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => authState,
}));
vi.mock('@services/ingredients/heygen.service', () => ({
  HeyGenService: { getInstance: () => ({ quote: mockQuote }) },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const photoAvatar: HeyGenAvatarVideoRequest = {
  autoSelectModel: true,
  photoUrl: 'https://cdn.genfeed.test/portrait.png',
  text: 'Hello from Genfeed',
  useIdentity: true,
  voiceId: 'voice-1',
};

async function settle(): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(STUDIO_ESTIMATE_DEBOUNCE_MS + 1));
}

describe('useStudioAvatarEstimate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuote.mockReset();
    authState.orgId = 'org-a';
  });
  afterEach(() => vi.useRealTimers());

  it('shows the admission quote with the estimated clip length', async () => {
    mockQuote.mockResolvedValue({
      billingMode: 'platform',
      credits: 52,
      estimatedSeconds: 4,
      modelKey: 'heygen/avatar',
    });
    const { result } = renderHook(() => useStudioAvatarEstimate(photoAvatar));
    expect(result.current).toEqual({ credits: null, status: 'loading' });

    await settle();

    expect(result.current).toEqual({
      billingMode: 'platform',
      credits: 52,
      estimatedSeconds: 4,
      status: 'estimated',
    });
    expect(mockQuote).toHaveBeenCalledExactlyOnceWith(
      photoAvatar,
      expect.any(AbortSignal),
    );
  });

  it('carries BYOK through so the summary can say no credits are held', async () => {
    mockQuote.mockResolvedValue({
      billingMode: 'byok',
      credits: 0,
      estimatedSeconds: null,
      modelKey: 'heygen/avatar-iv',
    });
    const { result } = renderHook(() => useStudioAvatarEstimate(photoAvatar));

    await settle();

    expect(result.current).toEqual({
      billingMode: 'byok',
      credits: 0,
      status: 'estimated',
    });
  });

  it('reports missing input, not an error, and never calls the API without a request', async () => {
    const { result } = renderHook(() => useStudioAvatarEstimate(null));

    await settle();

    expect(result.current).toEqual({
      credits: null,
      status: 'unavailable',
      unavailableReason:
        AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
    });
    expect(mockQuote).not.toHaveBeenCalled();
  });

  it('reports a failed price check as a non-blocking ERROR', async () => {
    mockQuote.mockRejectedValue(new Error('Training is incomplete'));
    const { result } = renderHook(() => useStudioAvatarEstimate(photoAvatar));

    await settle();

    expect(result.current).toEqual({
      credits: null,
      status: 'unavailable',
      unavailableReason: AgentGenerationQuoteUnavailableReason.ERROR,
    });
  });

  it('debounces, aborts the stale request and drops its answer when the script changes', async () => {
    let firstSignal: AbortSignal | undefined;
    mockQuote.mockImplementationOnce(
      (_request: unknown, signal: AbortSignal) => {
        firstSignal = signal;
        return new Promise(() => {});
      },
    );
    mockQuote.mockResolvedValueOnce({
      billingMode: 'platform',
      credits: 104,
      estimatedSeconds: 8,
      modelKey: 'heygen/avatar',
    });
    const { result, rerender } = renderHook(
      ({ request }) => useStudioAvatarEstimate(request),
      { initialProps: { request: photoAvatar } },
    );
    await settle();
    expect(firstSignal?.aborted).toBe(false);

    const longer = { ...photoAvatar, text: `${photoAvatar.text} and more` };
    rerender({ request: longer });
    expect(firstSignal?.aborted).toBe(true);
    expect(result.current).toEqual({ credits: null, status: 'loading' });

    await settle();

    expect(mockQuote).toHaveBeenCalledTimes(2);
    expect(mockQuote).toHaveBeenLastCalledWith(longer, expect.any(AbortSignal));
    expect(result.current).toMatchObject({ credits: 104, estimatedSeconds: 8 });
  });

  it('re-quotes when the organization changes instead of showing its price', async () => {
    mockQuote.mockResolvedValue({
      billingMode: 'platform',
      credits: 52,
      estimatedSeconds: 4,
      modelKey: 'heygen/avatar',
    });
    const { result, rerender } = renderHook(() =>
      useStudioAvatarEstimate(photoAvatar),
    );
    await settle();
    expect(result.current.status).toBe('estimated');

    authState.orgId = 'org-b';
    rerender();

    expect(result.current).toEqual({ credits: null, status: 'loading' });
    await settle();
    expect(mockQuote).toHaveBeenCalledTimes(2);
  });
});
