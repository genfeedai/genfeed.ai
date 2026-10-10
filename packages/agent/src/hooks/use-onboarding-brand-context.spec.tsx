import { useOnboardingBrandContext } from '@genfeedai/agent/hooks/use-onboarding-brand-context';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function createApi(score: number) {
  const getBrandCompleteness = vi.fn().mockResolvedValue({
    incompleteFieldKeys: [],
    interviewableGapCount: 0,
    onboardingAnswers: {
      fields: {
        goals: { status: 'answered', updatedAt: '2026-10-10T00:00:00Z' },
      },
      hasScannedWebsite: true,
    },
    overallScore: score,
  });
  return {
    apiService: { getBrandCompleteness } as unknown as AgentApiService,
    getBrandCompleteness,
  };
}

describe('useOnboardingBrandContext', () => {
  it('loads the score for the onboarding brand and refetches after each turn change', async () => {
    const { apiService, getBrandCompleteness } = createApi(40);
    const { result, rerender } = renderHook(
      ({ refreshKey }) =>
        useOnboardingBrandContext({
          apiService,
          brandId: 'brand-1',
          isEnabled: true,
          refreshKey,
        }),
      { initialProps: { refreshKey: '1' } },
    );

    await waitFor(() => expect(result.current?.score).toBe(40));
    expect(result.current?.creditsEarned).toBe(5);
    expect(getBrandCompleteness).toHaveBeenCalledWith(
      'brand-1',
      expect.any(AbortSignal),
    );

    getBrandCompleteness.mockResolvedValueOnce({
      incompleteFieldKeys: [],
      interviewableGapCount: 0,
      onboardingAnswers: { fields: {}, hasScannedWebsite: true },
      overallScore: 55,
    });
    rerender({ refreshKey: '2' });
    await waitFor(() => expect(result.current?.score).toBe(55));
    expect(getBrandCompleteness).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight request when the turn changes again', async () => {
    const { apiService, getBrandCompleteness } = createApi(10);
    const { rerender } = renderHook(
      ({ refreshKey }) =>
        useOnboardingBrandContext({
          apiService,
          brandId: 'brand-1',
          isEnabled: true,
          refreshKey,
        }),
      { initialProps: { refreshKey: '1' } },
    );
    const firstSignal = getBrandCompleteness.mock.calls[0]?.[1] as AbortSignal;
    rerender({ refreshKey: '2' });
    expect(firstSignal.aborted).toBe(true);
  });

  it('stays off outside onboarding or without a brand', () => {
    const { apiService, getBrandCompleteness } = createApi(10);
    const { result } = renderHook(() =>
      useOnboardingBrandContext({
        apiService,
        brandId: undefined,
        isEnabled: true,
        refreshKey: '1',
      }),
    );
    const { result: disabled } = renderHook(() =>
      useOnboardingBrandContext({
        apiService,
        brandId: 'brand-1',
        isEnabled: false,
        refreshKey: '1',
      }),
    );
    expect(result.current).toBeNull();
    expect(disabled.current).toBeNull();
    expect(getBrandCompleteness).not.toHaveBeenCalled();
  });
});
