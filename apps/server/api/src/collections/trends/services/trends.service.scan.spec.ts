import { TrendBrandReadService } from '@api/collections/trends/services/modules/trend-brand-read.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { ResearchScanLimitReachedException } from '@api/helpers/exceptions/research-scan-limit/research-scan-limit.exception';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const ORG = 'org-1';
const BRAND = 'brand-1';

const LIMIT_REACHED = new ResearchScanLimitReachedException({
  hasPlan: false,
  library: 'trends',
  limit: { maxScans: 1, windowMs: 7 * 24 * 60 * 60 * 1000 },
  nextAvailableAt: new Date('2026-12-04T10:00:00.000Z'),
});

function serviceFor(
  runScan: (input: unknown, run: () => Promise<unknown>) => Promise<unknown>,
) {
  const analysis = {
    markCurrentTrendsAsHistorical: vi.fn().mockResolvedValue(undefined),
  };
  const fetch = {
    fetchAndCacheTrends: vi.fn().mockResolvedValue([{ id: 'trend-1' }]),
  };
  const preview = {
    invalidateContentCache: vi.fn().mockResolvedValue(undefined),
    precomputeTrendSourcePreview: vi
      .fn()
      .mockImplementation(async (trends: unknown[]) => trends),
    toSyncTrendInput: vi.fn((trend: unknown) => trend),
  };
  const corpus = { syncTrendReferences: vi.fn().mockResolvedValue(undefined) };
  const logger = { warn: vi.fn() };
  const cache = {
    claimOnce: vi.fn().mockResolvedValue('claimed'),
    generateKey: (...parts: string[]) => parts.join(':'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true),
  };
  const niche = { hasSnapshot: vi.fn().mockResolvedValue(false) };
  const service = new TrendsService(
    logger as never,
    {
      findOne: vi.fn().mockResolvedValue({ description: 'AI tools' }),
    } as never,
    {} as never,
    {
      getPreferences: vi.fn().mockResolvedValue({ keywords: ['ai'] }),
    } as never,
    corpus as never,
    fetch as never,
    {} as never,
    analysis as never,
    {
      calculateViralityScore: vi.fn(),
    } as never,
    {} as never,
    {} as never,
    preview as never,
    niche as never,
    {} as never,
    new TrendBrandReadService(cache as never, logger as never, niche as never),
    { runScan } as never,
  );
  return { analysis, fetch, logger, service };
}

describe('TrendsService scans (#11623)', () => {
  it('refreshes inside one trends scan for the brand', async () => {
    const runScan = vi.fn((_input: unknown, run: () => Promise<unknown>) =>
      run(),
    );
    const { analysis, fetch, service } = serviceFor(runScan);

    const refreshed = await service.refreshTrends(ORG, BRAND);

    expect(refreshed).toHaveLength(1);
    expect(runScan).toHaveBeenCalledWith(
      { library: 'trends', organizationId: ORG, subjectKey: BRAND },
      expect.any(Function),
    );
    expect(analysis.markCurrentTrendsAsHistorical).toHaveBeenCalledWith(
      ORG,
      BRAND,
    );
    expect(fetch.fetchAndCacheTrends).toHaveBeenCalledTimes(1);
  });

  it('leaves the current trends alone when the scan is refused', async () => {
    const { analysis, fetch, service } = serviceFor(async () => {
      throw LIMIT_REACHED;
    });

    await expect(service.refreshTrends(ORG, BRAND)).rejects.toBe(LIMIT_REACHED);

    expect(analysis.markCurrentTrendsAsHistorical).not.toHaveBeenCalled();
    expect(fetch.fetchAndCacheTrends).not.toHaveBeenCalled();
  });

  describe('the first read of a brand with no niche videos', () => {
    it.each([
      ['an organization that used its scans', LIMIT_REACHED],
      [
        'an organization without a plan',
        new ServiceUnavailableException('research_paid_access_required'),
      ],
    ])(
      'starts no search for %s and logs no failure',
      async (_name, refusal) => {
        const runScan = vi.fn(async () => {
          throw refusal;
        });
        const { logger, service } = serviceFor(runScan);

        await service.noteBrandRead(ORG, BRAND);
        await new Promise((resolve) => setImmediate(resolve));

        expect(runScan).toHaveBeenCalledWith(
          {
            library: 'trends',
            organizationId: ORG,
            requiresPlan: true,
            subjectKey: BRAND,
          },
          expect.any(Function),
        );
        expect(logger.warn).not.toHaveBeenCalled();
      },
    );

    it('still reports a search that failed for another reason', async () => {
      const { logger, service } = serviceFor(async () => {
        throw new Error('the scraper is down');
      });

      await service.noteBrandRead(ORG, BRAND);
      await new Promise((resolve) => setImmediate(resolve));

      expect(logger.warn).toHaveBeenCalledWith(
        'On-demand brand niche refresh failed',
        { error: 'the scraper is down' },
      );
    });
  });
});
