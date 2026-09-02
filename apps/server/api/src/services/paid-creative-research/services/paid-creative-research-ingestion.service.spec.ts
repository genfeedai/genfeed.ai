import type { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import type { AdWatchedAdvertisersService } from '@api/collections/ad-watched-advertisers/services/ad-watched-advertisers.service';
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
  adPerformanceService: {
    markResearchSnapshotStale: ReturnType<typeof vi.fn>;
    replaceResearchSnapshot: ReturnType<typeof vi.fn>;
  };
  adWatchedAdvertisersService: {
    findAllByAccount: ReturnType<typeof vi.fn>;
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
    findAllByAccount: vi.fn().mockResolvedValue(watched),
    recordIngestionResult: vi.fn().mockResolvedValue(null),
  };
  const providerRegistry = {
    getReadiness: vi.fn().mockReturnValue([]),
    resolve: vi
      .fn()
      .mockReturnValue(adapter as unknown as PaidCreativeProviderAdapter),
  };

  return {
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

  it('completes the run when freshness bookkeeping itself fails', async () => {
    const harness = buildHarness([META_ADVERTISER]);
    harness.adWatchedAdvertisersService.recordIngestionResult.mockRejectedValue(
      new Error('write conflict'),
    );

    const [result] = await executeAtomicIngestionBatch(harness, 'org-1');

    expect(result).toMatchObject({ status: 'success' });
  });
});
