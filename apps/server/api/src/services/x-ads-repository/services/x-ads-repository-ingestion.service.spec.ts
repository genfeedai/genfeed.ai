import { XAdWatchedAdvertisersService } from '@api/collections/x-ad-watched-advertisers/services/x-ad-watched-advertisers.service';
import { XAdsRepositoryExportService } from '@api/services/x-ads-repository/services/x-ads-repository-export.service';
import { XAdsRepositoryIngestionService } from '@api/services/x-ads-repository/services/x-ads-repository-ingestion.service';
import { LoggerService } from '@libs/logger/logger.service';
import { AdPerformanceService } from '@server/collections/ad-performance/services/ad-performance.service';

describe('XAdsRepositoryIngestionService', () => {
  const watchedAdvertisers = [
    {
      advertiserHandle: 'nike',
      brandId: 'brand-1',
      credentialId: null,
      externalAdvertiserId: 'external-1',
      id: 'watched-1',
      organizationId: 'org-1',
    },
    {
      advertiserHandle: 'adidas',
      brandId: 'brand-2',
      credentialId: null,
      externalAdvertiserId: 'external-2',
      id: 'watched-2',
      organizationId: 'org-1',
    },
  ];

  const adPerformanceService = {
    markResearchSnapshotStale: vi.fn().mockResolvedValue(0),
    replaceResearchSnapshot: vi
      .fn()
      .mockResolvedValue({ applied: true, recordCount: 1 }),
  };
  const exportService = {
    getReadiness: vi.fn().mockReturnValue({
      available: false,
      blockers: ['x_ads_repository_contract_fixtures_missing'],
      documentationUrl:
        'https://business.x.com/en/help/ads-policies/product-policies/ads-transparency',
      status: 'unavailable',
    }),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const watchedAdvertisersService = {
    findAllByAccount: vi.fn().mockResolvedValue(watchedAdvertisers),
    recordIngestionResult: vi.fn().mockResolvedValue(watchedAdvertisers[0]),
  };

  let service: XAdsRepositoryIngestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    adPerformanceService.markResearchSnapshotStale.mockResolvedValue(0);
    adPerformanceService.replaceResearchSnapshot.mockResolvedValue({
      applied: true,
      recordCount: 1,
    });
    exportService.getReadiness.mockReturnValue({
      available: false,
      blockers: ['x_ads_repository_contract_fixtures_missing'],
      documentationUrl:
        'https://business.x.com/en/help/ads-policies/product-policies/ads-transparency',
      status: 'unavailable',
    });
    watchedAdvertisersService.findAllByAccount.mockResolvedValue(
      watchedAdvertisers,
    );
    watchedAdvertisersService.recordIngestionResult.mockResolvedValue(
      watchedAdvertisers[0],
    );

    service = new XAdsRepositoryIngestionService(
      adPerformanceService as unknown as AdPerformanceService,
      exportService as unknown as XAdsRepositoryExportService,
      logger as unknown as LoggerService,
      watchedAdvertisersService as unknown as XAdWatchedAdvertisersService,
    );
  });

  it('returns the fail-closed provider readiness contract', () => {
    expect(service.getReadiness()).toMatchObject({
      available: false,
      blockers: ['x_ads_repository_contract_fixtures_missing'],
    });
  });

  it('marks every prior snapshot stale and reports unavailable without making a provider call', async () => {
    const results = await service.ingestForAccount('org-1');

    expect(results).toEqual([
      {
        advertiserId: 'watched-1',
        errorCode: 'x_ads_repository_contract_fixtures_missing',
        recordCount: 0,
        status: 'unavailable',
      },
      {
        advertiserId: 'watched-2',
        errorCode: 'x_ads_repository_contract_fixtures_missing',
        recordCount: 0,
        status: 'unavailable',
      },
    ]);
    expect(
      adPerformanceService.markResearchSnapshotStale,
    ).toHaveBeenCalledTimes(2);
    expect(
      watchedAdvertisersService.recordIngestionResult,
    ).toHaveBeenNthCalledWith(1, 'watched-1', 'org-1', {
      errorCode: 'x_ads_repository_contract_fixtures_missing',
      freshnessState: 'unavailable',
      status: 'unavailable',
    });
  });

  it('isolates status persistence failures so later advertisers still transition', async () => {
    watchedAdvertisersService.recordIngestionResult
      .mockRejectedValueOnce(new Error('status write failed'))
      .mockResolvedValueOnce(watchedAdvertisers[1]);

    const results = await service.ingestForAccount('org-1');

    expect(results).toHaveLength(2);
    expect(
      watchedAdvertisersService.recordIngestionResult,
    ).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('status update failed for advertiser watched-1'),
      expect.any(Error),
    );
  });

  it('propagates a stale-transition failure after isolating later advertisers', async () => {
    adPerformanceService.markResearchSnapshotStale.mockRejectedValueOnce(
      new Error('stale transition failed'),
    );

    await expect(service.ingestForAccount('org-1')).rejects.toThrow(
      'stale transition failed',
    );
    expect(
      adPerformanceService.markResearchSnapshotStale,
    ).toHaveBeenCalledTimes(2);
    expect(
      watchedAdvertisersService.recordIngestionResult,
    ).toHaveBeenCalledTimes(1);
    expect(
      watchedAdvertisersService.recordIngestionResult,
    ).toHaveBeenCalledWith('watched-2', 'org-1', {
      errorCode: 'x_ads_repository_contract_fixtures_missing',
      freshnessState: 'unavailable',
      status: 'unavailable',
    });
  });

  it('persists an authorized normalized snapshot as tenant-owned, fresh, and explicitly unscored', async () => {
    const observedAt = new Date('2026-08-23T10:00:00.000Z');
    const recordCount = await service.applyAuthorizedSnapshot({
      advertiser: watchedAdvertisers[0],
      observedAt,
      organizationId: 'org-1',
      rows: [
        {
          adId: 'ad-1',
          creativeContent: 'Creative disclosure',
          fundingEntity: 'Example funder',
          presentationStartDate: '2026-08-01',
          reachEstimateMax: 200,
          reachEstimateMin: 100,
          targetingCountries: ['MT'],
        },
      ],
      snapshotId: 'snapshot-1',
    });

    expect(recordCount).toBe(1);
    expect(adPerformanceService.replaceResearchSnapshot).toHaveBeenCalledWith({
      expectedBrandId: 'brand-1',
      observedAt,
      organizationId: 'org-1',
      records: [
        expect.objectContaining({
          bodyText: 'Creative disclosure',
          estimatedReach: 150,
          fundingEntity: 'Example funder',
          organizationId: 'org-1',
          performanceScore: null,
          researchFreshnessState: 'fresh',
          researchObservedAt: observedAt,
          researchSnapshotId: 'snapshot-1',
          researchSnapshotKey: 'watched-1',
          researchSource: 'x_ads_repository',
          scope: 'organization',
          targetingCountries: ['MT'],
        }),
      ],
      researchSource: 'x_ads_repository',
      snapshotId: 'snapshot-1',
      snapshotKey: 'watched-1',
    });
    expect(
      watchedAdvertisersService.recordIngestionResult,
    ).not.toHaveBeenCalled();
  });

  it('replaces an authorized empty snapshot so prior rows are tombstoned', async () => {
    const observedAt = new Date('2026-08-23T10:00:00.000Z');
    adPerformanceService.replaceResearchSnapshot.mockResolvedValue({
      applied: true,
      recordCount: 0,
    });

    const recordCount = await service.applyAuthorizedSnapshot({
      advertiser: watchedAdvertisers[0],
      observedAt,
      organizationId: 'org-1',
      rows: [],
      snapshotId: 'snapshot-empty',
    });

    expect(recordCount).toBe(0);
    expect(adPerformanceService.replaceResearchSnapshot).toHaveBeenCalledWith({
      expectedBrandId: 'brand-1',
      observedAt,
      organizationId: 'org-1',
      records: [],
      researchSource: 'x_ads_repository',
      snapshotId: 'snapshot-empty',
      snapshotKey: 'watched-1',
    });
    expect(
      watchedAdvertisersService.recordIngestionResult,
    ).not.toHaveBeenCalled();
  });

  it('does not advance watch freshness for an older snapshot that loses the CAS', async () => {
    const observedAt = new Date('2026-08-23T10:00:00.000Z');
    adPerformanceService.replaceResearchSnapshot.mockResolvedValue({
      applied: false,
      recordCount: 0,
    });

    await expect(
      service.applyAuthorizedSnapshot({
        advertiser: watchedAdvertisers[0],
        observedAt,
        organizationId: 'org-1',
        rows: [],
        snapshotId: 'snapshot-older',
      }),
    ).resolves.toBe(0);

    expect(
      watchedAdvertisersService.recordIngestionResult,
    ).not.toHaveBeenCalled();
  });
});
