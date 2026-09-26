import type { ResearchCollectionRunner } from '@api/services/research-access/research-collection-runner.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApifyAdsService } from './apify-ads.service';

/**
 * Every reason runAdsActor's passthrough allowlist is meant to let through
 * unmasked, instead of logging and re-throwing paid_creative_source_unavailable.
 */
const PASSTHROUGH_COLLECTION_ERROR_CODES = [
  'research_paid_access_required',
  'research_subscription_unverified',
  'research_collection_recovery_pending',
  'research_collection_cost_unverified',
  'research_collection_start_unconfirmed',
  'research_collection_start_unreconciled',
] as const;

describe('public archive transports', () => {
  function setup(rows: unknown[] = []) {
    const run = vi.fn().mockResolvedValue(rows);
    return {
      run,
      service: new ApifyAdsService(
        { error: vi.fn() } as unknown as LoggerService,
        { run } as unknown as ResearchCollectionRunner,
      ),
    };
  }
  it('queries every country with bounded totals and Meta advertiser page mode', async () => {
    const { service, run } = setup();
    await service.fetchMetaAdLibraryCreatives({
      query: 'coffee',
      limit: 5,
      countries: ['DE', 'FR', 'GB'],
      organizationId: 'org',
    });
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls.map((call) => call[2].count)).toEqual([2, 2, 1]);
    expect(run.mock.calls.map((call) => call[2].country)).toEqual([
      'DE',
      'FR',
      'GB',
    ]);
    await service.fetchMetaAdLibraryCreatives({
      query: '123',
      mode: 'advertiser',
      limit: 5,
      organizationId: 'org',
    });
    expect(run.mock.calls[3][2].startUrls[0].url).toContain(
      'view_all_page_id=123',
    );
  });
  it('uses documented Google URLs and TikTok library advertiser input', async () => {
    const { service, run } = setup();
    await service.fetchGoogleAdsTransparencyCreatives({
      query: 'example.com',
      limit: 24,
      organizationId: 'org',
    });
    expect(run.mock.calls[0]).toEqual([
      'org',
      'lexis-solutions/google-ads-scraper',
      expect.objectContaining({
        maxItems: 24,
        downloadMedia: false,
        startUrls: [
          {
            url: 'https://adstransparency.google.com/?region=anywhere&domain=example.com',
          },
        ],
      }),
    ]);
    await service.fetchTikTokAdsLibraryCreatives({
      query: 'Example Ltd',
      externalAdvertiserId: '12',
      mode: 'advertiser',
      limit: 24,
      organizationId: 'org',
    });
    expect(run.mock.calls[1][2]).toMatchObject({
      advertiserName: 'Example Ltd',
      country: 'all',
      maxPages: 2,
      quickSearch: false,
    });
  });
  it('requests media filters upstream for Meta and YouTube', async () => {
    const { service, run } = setup();
    await service.fetchMetaAdLibraryCreatives({
      query: 'coffee',
      mediaType: 'image',
      limit: 10,
      organizationId: 'org',
    });
    expect(
      new URL(run.mock.calls[0][2].startUrls[0].url).searchParams.get(
        'media_type',
      ),
    ).toBe('image');
    await service.fetchGoogleAdsTransparencyCreatives({
      query: 'example.com',
      platform: 'youtube',
      mediaType: 'video',
      limit: 10,
      organizationId: 'org',
    });
    const url = new URL(run.mock.calls[1][2].startUrls[0].url);
    expect(url.searchParams.get('format')).toBe('VIDEO');
    expect(url.searchParams.get('platform')).toBe('YOUTUBE');
  });
  it('fails nonempty unknown shapes and provider failures instead of reporting empty', async () => {
    const { service, run } = setup([{ unexpected: true }]);
    await expect(
      service.fetchMetaAdLibraryCreatives({
        query: 'coffee',
        limit: 5,
        organizationId: 'org',
      }),
    ).rejects.toThrow();
    run.mockRejectedValue(new Error('secret'));
    await expect(
      service.fetchMetaAdLibraryCreatives({
        query: 'coffee',
        limit: 5,
        organizationId: 'org',
      }),
    ).rejects.toThrow('paid_creative_source_unavailable');
  });
  it.each(PASSTHROUGH_COLLECTION_ERROR_CODES)(
    'passes through %s instead of masking it as a source outage',
    async (code) => {
      const run = vi
        .fn()
        .mockRejectedValue(new ServiceUnavailableException(code));
      const logger = { error: vi.fn() };
      const service = new ApifyAdsService(
        logger as unknown as LoggerService,
        { run } as unknown as ResearchCollectionRunner,
      );

      await expect(
        service.fetchMetaAdLibraryCreatives({
          query: 'coffee',
          limit: 5,
          organizationId: 'org',
        }),
      ).rejects.toThrow(code);
      expect(logger.error).not.toHaveBeenCalled();
    },
  );
});
