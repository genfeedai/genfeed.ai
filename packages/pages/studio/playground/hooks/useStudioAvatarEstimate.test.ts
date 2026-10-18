import {
  AgentGenerationQuoteUnavailableReason,
  type HeyGenAvatarVideoRequest,
} from '@genfeedai/contracts/interfaces';
import { useStudioAvatarEstimate } from '@pages/studio/playground/hooks/useStudioAvatarEstimate';
import { STUDIO_ESTIMATE_DEBOUNCE_MS } from '@pages/studio/playground/hooks/useStudioGenerationEstimate';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuote = vi.fn();
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
  return {
    billingMode: 'platform',
    credits,
    estimatedSeconds: 4,
    modelKey: 'heygen/avatar',
  };
}

describe('useStudioAvatarEstimate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuote.mockReset();
    authState.orgId = 'org-a';
    authState.userId = 'user-1';
    authState.sessionId = 'session-a';
    authState.apiEndpoint = 'https://api.example.test';
    authState.getToken.mockReset().mockResolvedValue('stub-token');
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
  it.each(['session', 'api'] as const)(
    'hides a cached quote when %s identity changes',
    async (identity) => {
      mockQuote.mockResolvedValue(quoted(12));
      const { result, rerender } = renderHook(() =>
        useStudioAvatarEstimate(photoAvatar),
      );
      await settle();
      expect(result.current.status).toBe('estimated');
      if (identity === 'session') authState.sessionId = 'session-b';
      else authState.apiEndpoint = 'https://other-api.example.test';
      rerender();
      expect(result.current).toEqual({ credits: null, status: 'loading' });
      await settle();
      expect(mockQuote).toHaveBeenCalledTimes(2);
    },
  );

  it('does not revive a cached quote after an owner round trip', async () => {
    mockQuote
      .mockResolvedValueOnce(quoted(12))
      .mockResolvedValueOnce(quoted(30));
    const { result, rerender } = renderHook(() =>
      useStudioAvatarEstimate(photoAvatar),
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
      mockQuote.mockResolvedValue(quoted(12));
      const { rerender, unmount } = renderHook(() =>
        useStudioAvatarEstimate(photoAvatar),
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
      expect(mockQuote).not.toHaveBeenCalled();
    },
  );

  it.each(['success', 'failure'] as const)(
    'ignores late old-owner quote %s',
    async (outcome) => {
      const old = deferred<ReturnType<typeof quoted>>();
      mockQuote
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(quoted(30));
      const { result, rerender } = renderHook(() =>
        useStudioAvatarEstimate(photoAvatar),
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
    mockQuote.mockResolvedValue(quoted(12));
    const { result, rerender } = renderHook(() =>
      useStudioAvatarEstimate(photoAvatar),
    );
    await settle();
    const cached = result.current;
    rerender();
    await settle();
    expect(result.current).toEqual(cached);
    expect(mockQuote).toHaveBeenCalledTimes(1);
  });
});
