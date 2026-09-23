import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';
import { ApifyAdsService } from './apify-ads.service';
import type { ApifyBaseService } from './apify-base.service';

describe('public archive transports', () => {
  function setup(rows: unknown[] = []) {
    const runActorForOrg = vi
      .fn()
      .mockResolvedValue({ data: rows, source: 'hosted' });
    return {
      runActorForOrg,
      service: new ApifyAdsService(
        { runActorForOrg } as unknown as ApifyBaseService,
        { error: vi.fn() } as unknown as LoggerService,
      ),
    };
  }
  it('queries every country with bounded totals and Meta advertiser page mode', async () => {
    const { service, runActorForOrg } = setup();
    await service.fetchMetaAdLibraryCreatives({
      query: 'coffee',
      limit: 5,
      countries: ['DE', 'FR', 'GB'],
      organizationId: 'org',
    });
    expect(runActorForOrg).toHaveBeenCalledTimes(3);
    expect(runActorForOrg.mock.calls.map((call) => call[2].count)).toEqual([
      2, 2, 1,
    ]);
    expect(runActorForOrg.mock.calls.map((call) => call[2].country)).toEqual([
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
    expect(runActorForOrg.mock.calls[3][2].startUrls[0].url).toContain(
      'view_all_page_id=123',
    );
  });
  it('uses documented Google URLs and TikTok library advertiser input', async () => {
    const { service, runActorForOrg } = setup();
    await service.fetchGoogleAdsTransparencyCreatives({
      query: 'example.com',
      limit: 24,
      organizationId: 'org',
    });
    expect(runActorForOrg.mock.calls[0]).toEqual([
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
    expect(runActorForOrg.mock.calls[1][2]).toMatchObject({
      advertiserName: 'Example Ltd',
      country: 'all',
      maxPages: 2,
      quickSearch: false,
    });
  });
  it('fails nonempty unknown shapes and provider failures instead of reporting empty', async () => {
    const { service, runActorForOrg } = setup([{ unexpected: true }]);
    await expect(
      service.fetchMetaAdLibraryCreatives({
        query: 'coffee',
        limit: 5,
        organizationId: 'org',
      }),
    ).rejects.toThrow();
    runActorForOrg.mockRejectedValue(new Error('secret'));
    await expect(
      service.fetchMetaAdLibraryCreatives({
        query: 'coffee',
        limit: 5,
        organizationId: 'org',
      }),
    ).rejects.toThrow('paid_creative_source_unavailable');
  });
});
