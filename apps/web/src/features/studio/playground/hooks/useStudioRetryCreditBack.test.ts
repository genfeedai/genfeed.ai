import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STUDIO_RETRY_CREDIT_BACK_DEBOUNCE_MS,
  useStudioRetryCreditBack,
} from '@/features/studio/playground/hooks/useStudioRetryCreditBack';

const mockPreview = vi.fn();
const authState = vi.hoisted(() => ({
  getToken: async () => 'stub-token',
  orgId: 'org-a',
  sessionId: 'session-a',
  userId: 'user-1',
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => authState,
}));
vi.mock('@services/billing/credits.service', () => ({
  CreditsService: {
    getInstance: () => ({ previewRetryCreditBack: mockPreview }),
  },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const input = {
  credits: 40,
  modelKey: 'google/imagen-4',
  prompt: 'A red fox in snow',
};

async function settle(): Promise<void> {
  await act(() =>
    vi.advanceTimersByTimeAsync(STUDIO_RETRY_CREDIT_BACK_DEBOUNCE_MS + 1),
  );
}

describe('useStudioRetryCreditBack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPreview.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('shows what the server says the retry earns back, for the settled prompt only', async () => {
    mockPreview.mockResolvedValue({ credits: 10, rate: 0.25 });
    const { result, rerender } = renderHook(
      (props: typeof input) => useStudioRetryCreditBack(props),
      { initialProps: input },
    );
    expect(result.current).toBe(0);

    await settle();
    expect(result.current).toBe(10);
    expect(mockPreview).toHaveBeenCalledWith(
      { credits: 40, modelKey: 'google/imagen-4', prompt: 'A red fox in snow' },
      expect.any(AbortSignal),
    );

    // Typing on never labels the new prompt with the old answer.
    rerender({ ...input, prompt: 'A red fox in snow at dawn' });
    expect(result.current).toBe(0);
  });

  it('asks nothing without a priced quote, a model or a prompt', async () => {
    const { result } = renderHook(() =>
      useStudioRetryCreditBack({ ...input, credits: null }),
    );
    renderHook(() => useStudioRetryCreditBack({ ...input, prompt: '  ' }));
    renderHook(() =>
      useStudioRetryCreditBack({ ...input, modelKey: undefined }),
    );
    await settle();

    expect(result.current).toBe(0);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('shows nothing when the preview fails', async () => {
    mockPreview.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useStudioRetryCreditBack(input));
    await settle();

    expect(result.current).toBe(0);
  });
});
