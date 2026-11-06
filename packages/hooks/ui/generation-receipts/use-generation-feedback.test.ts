import type { BrandedGenerationFeedbackReadV1 } from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import { useGenerationFeedback } from '@hooks/ui/generation-receipts/use-generation-feedback';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const service = {
    getFeedback: vi.fn(),
    rateFeedback: vi.fn(),
    withdrawFeedback: vi.fn(),
  };
  return { getService: vi.fn(async () => service), service };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: async () => 'token',
    orgId: 'org',
    sessionId: 'session',
    userId: 'user',
  }),
}));

function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
}

let activeClient = createClient();
function QueryTestWrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: activeClient }, children);
}
function renderFeedback(
  props: { brandId: string; receiptId: string },
  client = createClient(),
) {
  activeClient = client;
  return renderHook(() => useGenerationFeedback(props), {
    wrapper: QueryTestWrapper,
  });
}

const input = { brandId: 'brand', receiptId: 'receipt' };
function feedback(
  overrides: Partial<BrandedGenerationFeedbackReadV1> = {},
): BrandedGenerationFeedbackReadV1 {
  return {
    id: 'receipt',
    implicit: {
      isDiscarded: false,
      isEdited: false,
      postStatus: 'draft',
      reviewDecision: null,
    },
    ratedAt: null,
    rating: null,
    reasons: [],
    receiptId: 'receipt',
    ...overrides,
  };
}
async function loaded() {
  const view = renderFeedback(input);
  await waitFor(() => expect(view.result.current.feedback).not.toBeNull());
  return view;
}

describe('useGenerationFeedback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getService.mockResolvedValue(mocks.service);
    mocks.service.getFeedback.mockResolvedValue(feedback());
    mocks.service.withdrawFeedback.mockResolvedValue(undefined);
  });

  it('loads the earlier rating with an abort signal', async () => {
    mocks.service.getFeedback.mockResolvedValue(feedback({ rating: 'up' }));
    const { result } = await loaded();
    expect(result.current.feedback?.rating).toBe('up');
    expect(mocks.service.getFeedback).toHaveBeenCalledWith(
      'brand',
      'receipt',
      expect.any(AbortSignal),
    );
  });

  it('still allows a first rating when the earlier one could not be read', async () => {
    mocks.service.getFeedback.mockRejectedValue(new Error('offline'));
    const { result } = await loaded();
    expect(result.current.feedback).toMatchObject({
      rating: null,
      reasons: [],
    });
  });

  it('shows a thumbs up at once and saves it', async () => {
    mocks.service.rateFeedback.mockResolvedValue(feedback({ rating: 'up' }));
    const { result } = await loaded();
    act(() => result.current.rate('up'));
    expect(result.current.feedback?.rating).toBe('up');
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(mocks.service.rateFeedback).toHaveBeenCalledWith(
      'brand',
      'receipt',
      {
        rating: 'up',
        reasons: [],
      },
    );
  });

  it('saves reason chips on a thumbs down and drops them when toggled off', async () => {
    mocks.service.rateFeedback.mockImplementation(
      async (_brand, _receipt, body) =>
        feedback({ rating: body.rating, reasons: body.reasons }),
    );
    const { result } = await loaded();
    act(() => result.current.toggleReason('too_long'));
    expect(mocks.service.rateFeedback).not.toHaveBeenCalled();
    act(() => result.current.rate('down'));
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    act(() => result.current.toggleReason('too_long'));
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.feedback?.reasons).toEqual(['too_long']);
    act(() => result.current.toggleReason('too_long'));
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(mocks.service.rateFeedback).toHaveBeenLastCalledWith(
      'brand',
      'receipt',
      { rating: 'down', reasons: [] },
    );
  });

  it('withdraws the rating when the same thumb is tapped again', async () => {
    mocks.service.getFeedback.mockResolvedValue(
      feedback({ rating: 'down', reasons: ['off_voice'] }),
    );
    const { result } = await loaded();
    act(() => result.current.rate('down'));
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(mocks.service.withdrawFeedback).toHaveBeenCalledWith(
      'brand',
      'receipt',
    );
    expect(result.current.feedback).toMatchObject({
      rating: null,
      reasons: [],
    });
  });

  it('restores the saved rating and reports a failed save', async () => {
    mocks.service.getFeedback.mockResolvedValue(feedback({ rating: 'up' }));
    mocks.service.rateFeedback.mockRejectedValue(new Error('500'));
    const { result } = await loaded();
    act(() => result.current.rate('down'));
    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.feedback?.rating).toBe('up');
    expect(result.current.isSaving).toBe(false);
  });

  it('shows the cached rating at once when the generation is reopened', async () => {
    const client = createClient();
    mocks.service.getFeedback.mockResolvedValue(feedback({ rating: 'up' }));
    const first = renderFeedback(input, client);
    await waitFor(() =>
      expect(first.result.current.feedback?.rating).toBe('up'),
    );
    first.unmount();

    mocks.service.getFeedback.mockReturnValue(new Promise(() => {}));
    const { result } = renderFeedback(input, client);

    expect(result.current.feedback?.rating).toBe('up');
  });

  it('shows a saved change on the next visit', async () => {
    const client = createClient();
    mocks.service.rateFeedback.mockResolvedValue(feedback({ rating: 'down' }));
    const first = renderFeedback(input, client);
    await waitFor(() => expect(first.result.current.feedback).not.toBeNull());
    act(() => first.result.current.rate('down'));
    await waitFor(() => expect(first.result.current.isSaving).toBe(false));
    first.unmount();

    mocks.service.getFeedback.mockReturnValue(new Promise(() => {}));
    const { result } = renderFeedback(input, client);

    expect(result.current.feedback?.rating).toBe('down');
  });

  it('never shows one receipt’s cached rating for another receipt', async () => {
    const client = createClient();
    mocks.service.getFeedback.mockResolvedValue(feedback({ rating: 'up' }));
    const first = renderFeedback(input, client);
    await waitFor(() =>
      expect(first.result.current.feedback?.rating).toBe('up'),
    );
    first.unmount();

    mocks.service.getFeedback.mockReturnValue(new Promise(() => {}));
    const { result } = renderFeedback(
      { brandId: 'brand', receiptId: 'other-receipt' },
      client,
    );

    expect(result.current.feedback).toBeNull();
  });

  it('keeps the cached rating when its background refresh fails', async () => {
    const client = createClient();
    mocks.service.getFeedback.mockResolvedValue(feedback({ rating: 'up' }));
    const first = renderFeedback(input, client);
    await waitFor(() =>
      expect(first.result.current.feedback?.rating).toBe('up'),
    );
    first.unmount();

    mocks.service.getFeedback.mockRejectedValue(new Error('offline'));
    const { result } = renderFeedback(input, client);

    await waitFor(() =>
      expect(
        client.getQueryCache().find({
          exact: false,
          queryKey: ['generation-feedback', 'brand', 'receipt'],
        })?.state.status,
      ).toBe('error'),
    );
    expect(result.current.feedback?.rating).toBe('up');
  });
});
