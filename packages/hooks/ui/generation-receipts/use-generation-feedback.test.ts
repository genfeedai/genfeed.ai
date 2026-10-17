import type { BrandedGenerationFeedbackReadV1 } from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import { useGenerationFeedback } from '@hooks/ui/generation-receipts/use-generation-feedback';
import { act, renderHook, waitFor } from '@testing-library/react';
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
  const view = renderHook(() => useGenerationFeedback(input));
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
});
