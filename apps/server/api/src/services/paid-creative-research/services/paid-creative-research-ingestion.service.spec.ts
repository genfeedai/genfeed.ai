import type { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import type { AdWatchedAdvertisersService } from '@api/collections/ad-watched-advertisers/services/ad-watched-advertisers.service';
import type { AutonomousProducerInstallService } from '@api/collections/workflows/autonomous-producers/autonomous-producer-install.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type {
  PaidCreativeProviderAdapter,
  PaidCreativeReadiness,
} from '@api/services/paid-creative-research/interfaces/paid-creative-research.interface';
import type { PaidCreativeProviderRegistry } from '@api/services/paid-creative-research/providers/paid-creative-provider.registry';
import {
  type PaidCreativeIngestionOptions,
  PaidCreativeResearchIngestionService,
} from '@api/services/paid-creative-research/services/paid-creative-research-ingestion.service';
import type { NormalizedPaidCreativeRecord } from '@genfeedai/integrations/ads';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';

const READY: PaidCreativeReadiness = {
  available: true,
  blockers: [],
  documentationUrl: 'https://www.facebook.com/ads/library/',
  status: 'available',
};

const BLOCKED: PaidCreativeReadiness = {
  available: false,
  blockers: ['paid_creative_apify_token_missing'],
  documentationUrl: 'https://www.facebook.com/ads/library/',
  status: 'unavailable',
};

function buildCreative(
  overrides: Partial<NormalizedPaidCreativeRecord> = {},
): NormalizedPaidCreativeRecord {
  return {
    advertiserHandle: 'nike',
    advertiserName: 'Nike',
    creativeMediaUrls: ['https://cdn.example.com/ad-1.mp4'],
    dataConfidence: 'reported',
    externalAdId: 'ad-1',
    granularity: 'creative',
    platform: 'meta',
    provider: 'meta_ads_library',
    usagePolicy: 'remix_allowed',
    ...overrides,
  } as NormalizedPaidCreativeRecord;
}

type Harness = {
  access: { decide: ReturnType<typeof vi.fn> };
  autonomousProducerInstallService: { installOnOptIn: ReturnType<typeof vi.fn> };
  adPerformanceService: {
    markResearchSnapshotStale: ReturnType<typeof vi.fn>;
    replaceResearchSnapshot: ReturnType<typeof vi.fn>;
  };
  adWatchedAdvertisersService: {
    findAllByAccount: ReturnType<typeof vi.fn>;
    claimManualPoll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    recordIngestionResult: ReturnType<typeof vi.fn>;
  };
  adapter: {
    fetchCreatives: ReturnType<typeof vi.fn>;
    getReadiness: ReturnType<typeof vi.fn>;
    provider: string;
  };
  service: PaidCreativeResearchIngestionService;
};

function buildHarness(
  watched: Record<string, unknown>[],
  readiness: PaidCreativeReadiness = READY,
): Harness {
  const adapter = {
    fetchCreatives: vi.fn().mockResolvedValue([buildCreative()]),
    getReadiness: vi.fn().mockReturnValue(readiness),
    provider: 'meta_ads_library',
  };
  const adPerformanceService = {
    markResearchSnapshotStale: vi.fn().mockResolvedValue(1),
    replaceResearchSnapshot: vi
      .fn()
      .mockResolvedValue({ applied: true, recordCount: 1 }),
  };
  const adWatchedAdvertisersService = {
    claimManualPoll: vi.fn().mockResolvedValue(true),
    findAllByAccount: vi.fn().mockResolvedValue(watched),
    findOne: vi.fn().mockResolvedValue(watched[0] ?? null),
    recordIngestionResult: vi.fn().mockResolvedValue(null),
  };
  const autonomousProducerInstallService = {
    installOnOptIn: vi.fn().mockResolvedValue({}),
  };
  const providerRegistry = {
    getReadiness: vi.fn().mockReturnValue([]),
    resolve: vi
      .fn()
      .mockReturnValue(adapter as unknown as PaidCreativeProviderAdapter),
  };
  const access = {
    decide: vi
      .fn()
      .mockResolvedValue({ isAllowed: true, reason: 'active_paid' }),
  };

  return {
    access,
    autonomousProducerInstallService,
    adPerformanceService,
    adWatchedAdvertisersService,
    adapter,
    service: new PaidCreativeResearchIngestionService(
      adPerformanceService as unknown as AdPerformanceService,
      adWatchedAdvertisersService as unknown as AdWatchedAdvertisersService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      providerRegistry as unknown as PaidCreativeProviderRegistry,
      access as never,
      autonomousProducerInstallService as unknown as AutonomousProducerInstallService,
    ),
  };
}

async function executeAtomicIngestionBatch(
  harness: Harness,
  organizationId: string,
  options: PaidCreativeIngestionOptions = {},
) {
  const advertisers = await harness.service.discoverAdvertisers(
    organizationId,
    options,
  );
  const results = [];
  for (const advertiser of advertisers) {
    results.push(
      await harness.service.ingestOne(organizationId, advertiser, options),
    );
  }
  return results;
}

const META_ADVERTISER = {
  advertiserHandle: 'nike',
  brandId: 'brand-1',
  externalAdvertiserId: null,
  id: 'watch-1',
  organizationId: 'org-1',
  platform: 'meta',
};

describe('PaidCreativeResearchIngestionService (#3537)', () => {
  it('does not collect when paid access is missing', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.access.decide.mockResolvedValue({
      isAllowed: false,
      reason: 'research_paid_access_required',
    });

    const results = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(results[0]).toMatchObject({
      errorCode: 'research_paid_access_required',
      status: 'unavailable',
    });
    expect(harness.adapter.fetchCreatives).not.toHaveBeenCalled();
    expect(
      harness.adPerformanceService.markResearchSnapshotStale,
    ).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes one tenant-scoped snapshot per watched advertiser', async () => {
    const harness = buildHarness([META_ADVERTISER]);

    const results = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(results).toEqual([
      {
        advertiserId: 'watch-1',
        platform: 'meta',
        recordCount: 1,
        status: 'success',
      },
    ]);

    const call =
      harness.adPerformanceService.replaceResearchSnapshot.mock.calls[0][0];
    expect(call).toMatchObject({
      expectedBrandId: 'brand-1',
      organizationId: 'org-1',
      researchSource: 'meta_ads_library',
      snapshotKey: 'watch-1',
    });
    expect(call.records[0]).toMatchObject({
      brandId: 'brand-1',
      organizationId: 'org-1',
      researchFreshnessState: 'fresh',
      researchSnapshotKey: 'watch-1',
      researchSource: 'meta_ads_library',
      scope: 'organization',
    });
  });

  it('stamps every snapshot with the paid_creative_reference classification Discovery reads (#3537)', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.adapter.fetchCreatives.mockResolvedValue([
      buildCreative({
        adFormat: 'VIDEO',
        creativeType: 'video',
        presentationStartDate: '2026-08-20T12:00:00.000Z',
      }),
    ]);

    await executeAtomicIngestionBatch(harness, 'org-1');

    const record =
      harness.adPerformanceService.replaceResearchSnapshot.mock.calls[0][0]
        .records[0];
    expect(record.sourceClassification).toMatchObject({
      confidence: 'high',
      freshnessWindowDays: 14,
      intendedUse: 'paid_creative_analysis',
      paidCreative: {
        adFormat: 'VIDEO',
        creativeType: 'video',
        provider: 'meta_ads_library',
      },
      platform: 'meta',
      sourceAuthor: 'nike',
      sourceKind: 'paid_creative_reference',
      sourceLabel: 'Meta Ad Library',
      sourceTimestamp: '2026-08-20T12:00:00.000Z',
      sourceTopic: 'Nike',
    });
  });

  it('advances the watched row bookkeeping on a successful run', async () => {
    const harness = buildHarness([META_ADVERTISER]);

    await executeAtomicIngestionBatch(harness, 'org-1');

    expect(
      harness.adWatchedAdvertisersService.recordIngestionResult,
    ).toHaveBeenCalledWith('watch-1', 'org-1', {
      freshnessState: 'fresh',
      recordCount: 1,
      snapshotId: expect.stringContaining('watch-1:'),
      status: 'success',
    });
  });

  it('reports an archive that genuinely returned nothing as empty, not unavailable', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.adapter.fetchCreatives.mockResolvedValue([]);
    harness.adPerformanceService.replaceResearchSnapshot.mockResolvedValue({
      applied: true,
      recordCount: 0,
    });

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toMatchObject({ recordCount: 0, status: 'success' });
    expect(
      harness.adWatchedAdvertisersService.recordIngestionResult,
    ).toHaveBeenCalledWith(
      'watch-1',
      'org-1',
      expect.objectContaining({ freshnessState: 'empty', status: 'success' }),
    );
  });

  it('stales the previous snapshot instead of writing an empty one when the archive is unreachable', async () => {
    const harness = buildHarness([META_ADVERTISER], BLOCKED);

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toEqual({
      advertiserId: 'watch-1',
      errorCode: 'paid_creative_apify_token_missing',
      platform: 'meta',
      recordCount: 0,
      status: 'unavailable',
    });
    expect(
      harness.adPerformanceService.markResearchSnapshotStale,
    ).toHaveBeenCalledWith('org-1', 'watch-1', 'meta_ads_library');
    expect(
      harness.adPerformanceService.replaceResearchSnapshot,
    ).not.toHaveBeenCalled();
    expect(
      harness.adWatchedAdvertisersService.recordIngestionResult,
    ).toHaveBeenCalledWith('watch-1', 'org-1', {
      errorCode: 'paid_creative_apify_token_missing',
      freshnessState: 'unavailable',
      status: 'unavailable',
    });
  });

  it('does not leak a provider error message into the persisted error code', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.adapter.fetchCreatives.mockRejectedValue(
      new Error('Apify actor run failed: token abc123 rejected'),
    );

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toMatchObject({
      errorCode: 'paid_creative_source_unavailable',
      status: 'unavailable',
    });
    expect(
      harness.adPerformanceService.markResearchSnapshotStale,
    ).toHaveBeenCalledWith('org-1', 'watch-1', 'meta_ads_library');
  });

  it('denies collection instead of masking it as a source outage when the provider signals paid access is required', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.adapter.fetchCreatives.mockRejectedValue(
      new ServiceUnavailableException('research_paid_access_required'),
    );

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toMatchObject({
      errorCode: 'research_paid_access_required',
      status: 'unavailable',
    });
    expect(
      harness.adPerformanceService.markResearchSnapshotStale,
    ).not.toHaveBeenCalled();
    expect(
      harness.adWatchedAdvertisersService.recordIngestionResult,
    ).toHaveBeenCalledWith('watch-1', 'org-1', {
      errorCode: 'research_paid_access_required',
      freshnessState: 'unavailable',
      status: 'unavailable',
    });
  });

  it('denies collection when the provider signals the subscription is unverified', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.adapter.fetchCreatives.mockRejectedValue(
      new ServiceUnavailableException('research_subscription_unverified'),
    );

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toMatchObject({
      errorCode: 'research_subscription_unverified',
      status: 'unavailable',
    });
  });

  it('surfaces an unreconciled collection start as its own error code, not a generic outage (#5212)', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.adapter.fetchCreatives.mockRejectedValue(
      new ServiceUnavailableException('research_collection_start_unreconciled'),
    );

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toMatchObject({
      errorCode: 'research_collection_start_unreconciled',
      status: 'unavailable',
    });
    expect(
      harness.adPerformanceService.markResearchSnapshotStale,
    ).toHaveBeenCalledWith('org-1', 'watch-1', 'meta_ads_library');
  });

  it('reports a failed snapshot write as an error rather than a source outage', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.adPerformanceService.replaceResearchSnapshot.mockRejectedValue(
      new Error('serialization failure'),
    );

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toMatchObject({
      errorCode: 'paid_creative_snapshot_write_failed',
      status: 'error',
    });
  });

  it('skips a row whose platform this build no longer supports without staling another provider', async () => {
    const harness = buildHarness([
      { ...META_ADVERTISER, platform: 'linkedin' },
    ]);

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toEqual({
      advertiserId: 'watch-1',
      errorCode: 'paid_creative_platform_unsupported',
      platform: 'linkedin',
      recordCount: 0,
      status: 'unavailable',
    });
    expect(
      harness.adPerformanceService.markResearchSnapshotStale,
    ).not.toHaveBeenCalled();
  });

  it('keeps one advertiser failure from aborting the rest of the account', async () => {
    const harness = buildHarness([
      META_ADVERTISER,
      { ...META_ADVERTISER, id: 'watch-2' },
    ]);
    harness.adapter.fetchCreatives
      .mockRejectedValueOnce(new Error('archive down'))
      .mockResolvedValueOnce([buildCreative()]);

    const results = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(results.map((result) => result.status)).toEqual([
      'unavailable',
      'success',
    ]);
  });

  it('narrows the watchlist query to the requested brand and platform', async () => {
    const harness = buildHarness([]);

    await executeAtomicIngestionBatch(harness, 'org-1', {
      brandId: 'brand-1',
      platform: 'tiktok',
    });

    expect(
      harness.adWatchedAdvertisersService.findAllByAccount,
    ).toHaveBeenCalledWith('org-1', 'brand-1', 'tiktok');
  });

  describe('pollWatchedAdvertiser', () => {
    it('ingests the advertiser inside the caller organization', async () => {
      const harness = buildHarness([META_ADVERTISER]);

      const result = await harness.service.pollWatchedAdvertiser(
        'org-1',
        'watch-1',
        { brandId: 'brand-1' },
      );

      expect(harness.adWatchedAdvertisersService.findOne).toHaveBeenCalledWith({
        id: 'watch-1',
        isDeleted: false,
        organizationId: 'org-1',
      });
      expect(result).toMatchObject({
        advertiserId: 'watch-1',
        status: 'success',
      });
    });

    it('does not reveal an advertiser that belongs to another brand', async () => {
      const harness = buildHarness([META_ADVERTISER]);

      await expect(
        harness.service.pollWatchedAdvertiser('org-1', 'watch-1', {
          brandId: 'brand-2',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(harness.adapter.fetchCreatives).not.toHaveBeenCalled();
    });

    it('rejects an unknown advertiser', async () => {
      const harness = buildHarness([]);

      await expect(
        harness.service.pollWatchedAdvertiser('org-1', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    describe('daily polling opt-in', () => {
      const principal = {
        isApiKey: false,
        organizationId: 'org-1',
        scopes: [],
        userId: 'user-1',
      };

      it('installs the daily workflow after a successful poll', async () => {
        const harness = buildHarness([META_ADVERTISER]);

        await harness.service.pollWatchedAdvertiser('org-1', 'watch-1', {
          principal,
        });

        expect(
          harness.autonomousProducerInstallService.installOnOptIn,
        ).toHaveBeenCalledWith({
          organizationId: 'org-1',
          principal,
          producer: 'paidCreativeResearch',
        });
      });

      it('does not install when the poll was blocked or the caller is unknown', async () => {
        const blocked = buildHarness([META_ADVERTISER]);
        blocked.access.decide.mockResolvedValue({
          isAllowed: false,
          reason: 'research_paid_access_required',
        });
        await blocked.service.pollWatchedAdvertiser('org-1', 'watch-1', {
          principal,
        });
        const anonymous = buildHarness([META_ADVERTISER]);
        await anonymous.service.pollWatchedAdvertiser('org-1', 'watch-1');

        expect(
          blocked.autonomousProducerInstallService.installOnOptIn,
        ).not.toHaveBeenCalled();
        expect(
          anonymous.autonomousProducerInstallService.installOnOptIn,
        ).not.toHaveBeenCalled();
      });

      it('returns the poll result when the install fails', async () => {
        const harness = buildHarness([META_ADVERTISER]);
        harness.autonomousProducerInstallService.installOnOptIn.mockRejectedValue(
          new Error('install failed'),
        );

        const result = await harness.service.pollWatchedAdvertiser(
          'org-1',
          'watch-1',
          { principal },
        );

        expect(result.status).toBe('success');
      });
    });

    it('claims the poll before fetching and refuses when the claim is lost', async () => {
      const harness = buildHarness([META_ADVERTISER]);
      harness.adWatchedAdvertisersService.claimManualPoll.mockResolvedValue(
        false,
      );

      await expect(
        harness.service.pollWatchedAdvertiser('org-1', 'watch-1'),
      ).rejects.toBeInstanceOf(HttpException);
      expect(harness.adapter.fetchCreatives).not.toHaveBeenCalled();
    });

    it('claims with the cooldown before it fetches', async () => {
      const harness = buildHarness([META_ADVERTISER]);

      await harness.service.pollWatchedAdvertiser('org-1', 'watch-1');

      expect(
        harness.adWatchedAdvertisersService.claimManualPoll,
      ).toHaveBeenCalledWith('watch-1', 'org-1', 10 * 60 * 1000);
      expect(
        harness.adWatchedAdvertisersService.claimManualPoll.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        harness.adapter.fetchCreatives.mock.invocationCallOrder[0],
      );
    });
  });

  it('completes the run when freshness bookkeeping itself fails', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.adWatchedAdvertisersService.recordIngestionResult.mockRejectedValue(
      new Error('write conflict'),
    );

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toMatchObject({ status: 'success' });
  });
});
