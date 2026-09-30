import {
  captureTrendRefreshEvidence,
  recordTrendProviderOutcome,
  withTrendRefreshAttempt,
} from '@api/collections/trends/utils/trend-refresh-evidence.util';

describe('trend refresh evidence', () => {
  it('keeps concurrent provider attempts isolated and never records secrets from thrown errors', async () => {
    const first = captureTrendRefreshEvidence(() =>
      withTrendRefreshAttempt('youtube', 'trends', 'scoped', async () => {
        await Promise.resolve();
        recordTrendProviderOutcome('native_empty');
        return [];
      }),
    );
    const second = captureTrendRefreshEvidence(() =>
      withTrendRefreshAttempt('tiktok', 'sounds', 'global', async () => {
        recordTrendProviderOutcome('fallback_failed', 'provider_failed');
        return 0;
      }),
    );
    const [empty, failed] = await Promise.all([first, second]);
    expect(empty.evidence).toEqual([
      expect.objectContaining({
        platform: 'youtube',
        outcome: 'native_empty',
        lastSuccessfulRefreshAt: expect.any(String),
      }),
    ]);
    expect(failed.evidence).toEqual([
      expect.objectContaining({
        platform: 'tiktok',
        outcome: 'fallback_failed',
        lastSuccessfulRefreshAt: null,
      }),
    ]);
  });

  it('persists unsuccessful evidence when refresh persistence throws after a provider response', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    await expect(
      captureTrendRefreshEvidence(async () => {
        await withTrendRefreshAttempt(
          'youtube',
          'trends',
          'global',
          async () => {
            recordTrendProviderOutcome('native_available');
          },
        );
        throw new Error('database secret');
      }, persist),
    ).rejects.toThrow('database secret');
    expect(persist).toHaveBeenCalledWith([
      expect.objectContaining({
        outcome: 'native_failed',
        reason: 'persistence_failed',
        lastSuccessfulRefreshAt: null,
      }),
    ]);
    expect(JSON.stringify(persist.mock.calls)).not.toContain('database secret');
  });
});
