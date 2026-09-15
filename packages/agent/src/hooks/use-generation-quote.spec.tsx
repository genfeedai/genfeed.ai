import { useGenerationQuote } from '@genfeedai/agent/hooks/use-generation-quote';
import type {
  AgentApiService,
  EstimateGenerationCreditsResult,
} from '@genfeedai/agent/services/agent-api.service';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useGenerationQuote', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const input = { category: 'image' as const, prompt: 'A car' };
  it('starts pending and invalidates immediately through A/B/A edits', async () => {
    const estimateGenerationCredits = vi.fn().mockResolvedValue({
      credits: 0,
      isAvailable: true,
      modelKey: 'concrete',
    });
    const api = { estimateGenerationCredits } as unknown as AgentApiService;
    const { result, rerender } = renderHook(
      ({ fingerprint }) => useGenerationQuote(api, input, fingerprint),
      { initialProps: { fingerprint: 'A' } },
    );
    expect(result.current.isEstimateAvailable).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(401));
    expect(result.current).toMatchObject({
      estimatedCredits: 0,
      isEstimateAvailable: true,
      resolvedModelKey: 'concrete',
    });
    rerender({ fingerprint: 'B' });
    expect(result.current.isEstimateAvailable).toBe(false);
    rerender({ fingerprint: 'A' });
    expect(result.current.isEstimateAvailable).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(401));
    expect(result.current.isEstimateAvailable).toBe(true);
    expect(estimateGenerationCredits).toHaveBeenCalledTimes(2);
  });
  it('aborts superseded requests and ignores their late responses', async () => {
    let oldResolve:
      | ((value: EstimateGenerationCreditsResult) => void)
      | undefined;
    const estimateGenerationCredits = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<EstimateGenerationCreditsResult>((resolve) => {
            oldResolve = resolve;
          }),
      )
      .mockResolvedValue({ credits: 20, isAvailable: true, modelKey: 'new' });
    const api = { estimateGenerationCredits } as unknown as AgentApiService;
    const { result, rerender } = renderHook(
      ({ fingerprint }) => useGenerationQuote(api, input, fingerprint),
      { initialProps: { fingerprint: 'A' } },
    );
    await act(() => vi.advanceTimersByTimeAsync(401));
    rerender({ fingerprint: 'B' });
    expect(estimateGenerationCredits.mock.calls[0][1].aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(401));
    await act(async () =>
      oldResolve?.({ credits: 1, isAvailable: true, modelKey: 'old' }),
    );
    expect(result.current.resolvedModelKey).toBe('new');
  });
  it.each([
    { credits: Number.NaN, isAvailable: true, modelKey: 'model' },
    { credits: 1, isAvailable: true, modelKey: null },
    { credits: null, isAvailable: false, modelKey: null },
  ])('rejects incomplete quotes %j', async (quote) => {
    const api = {
      estimateGenerationCredits: vi.fn().mockResolvedValue(quote),
    } as unknown as AgentApiService;
    const { result } = renderHook(() => useGenerationQuote(api, input, 'A'));
    await act(() => vi.advanceTimersByTimeAsync(401));
    expect(result.current).toMatchObject({
      isEstimateAvailable: false,
      isEstimatePending: false,
      resolvedModelKey: null,
    });
  });
});
