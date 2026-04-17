import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { AdOptimizationProcessor } from '@api/queues/ad-optimization/ad-optimization.processor';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { vi } from 'vitest';

const ORG_ID = '507f191e810c19729de860ee'.toString();
const CONFIG_ID = '507f191e810c19729de860ee'.toString();
const RUN_ID = 'run_001';

function buildJob(data: {
  organizationId: string;
  configId: string;
  runId: string;
}): Job<typeof data> {
  return {
    data,
    updateProgress: vi.fn(),
  } as unknown as Job<typeof data>;
}

const BASE_CONFIG = {
  analysisWindow: 30,
  maxBudgetIncreasePct: 50,
  maxCpm: 10,
  maxDailyBudgetPerCampaign: 1000,
  maxTotalDailySpend: 5000,
  minCtr: 1,
  minImpressions: 100,
  minRoas: 2,
  minSpend: 10,
};

const GOOD_AD_RECORD = {
  campaignName: 'Campaign A',
  clicks: 20,
  externalAdId: 'ad_good',
  impressions: 1000,
  revenue: 100,
  roas: 5,
  spend: 20,
};

const BAD_AD_RECORD = {
  campaignName: 'Campaign B',
  clicks: 1,
  externalAdId: 'ad_bad',
  impressions: 1000,
  revenue: 5,
  roas: 0.5,
  spend: 50,
};

describe('AdOptimizationProcessor', () => {
  let processor: AdOptimizationProcessor;
  let optimizationConfigService: {
    findByOrganization: ReturnType<typeof vi.fn>;
  };
  let adPerformanceService: { findByOrganization: ReturnType<typeof vi.fn> };
  let recommendationService: {
    findExistingPending: ReturnType<typeof vi.fn>;
    createBatch: ReturnType<typeof vi.fn>;
    expireStale: ReturnType<typeof vi.fn>;
  };
  let auditLogService: { create: ReturnType<typeof vi.fn> };
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    optimizationConfigService = {
      findByOrganization: vi.fn().mockResolvedValue(BASE_CONFIG),
    };
    adPerformanceService = {
      findByOrganization: vi.fn().mockResolvedValue([]),
    };
    recommendationService = {
      createBatch: vi.fn().mockResolvedValue(0),
      expireStale: vi.fn().mockResolvedValue(undefined),
      findExistingPending: vi.fn().mockResolvedValue(null),
    };
    auditLogService = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    mockLogger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AdOptimizationProcessor,
        { provide: LoggerService, useValue: mockLogger },
        { provide: AdPerformanceService, useValue: adPerformanceService },
        {
          provide: AdOptimizationConfigsService,
          useValue: optimizationConfigService,
        },
        {
          provide: AdOptimizationRecommendationsService,
          useValue: recommendationService,
        },
        { provide: AdOptimizationAuditLogsService, useValue: auditLogService },
      ],
    }).compile();

    processor = module.get(AdOptimizationProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('returns early and logs when no config found', async () => {
    optimizationConfigService.findByOrganization.mockResolvedValue(null);
    const job = buildJob({
      configId: CONFIG_ID,
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No optimization config'),
    );
    expect(adPerformanceService.findByOrganization).not.toHaveBeenCalled();
    expect(auditLogService.create).not.toHaveBeenCalled();
  });

  it('completes run with no performance data without error', async () => {
    const job = buildJob({
      configId: CONFIG_ID,
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    await processor.process(job);

    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        adsAnalyzed: 0,
        recommendationsGenerated: 0,
        runId: RUN_ID,
      }),
    );
  });

  it('generates pause recommendation for underperforming ad', async () => {
    adPerformanceService.findByOrganization.mockResolvedValue([BAD_AD_RECORD]);
    recommendationService.createBatch.mockResolvedValue(1);

    const job = buildJob({
      configId: CONFIG_ID,
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    await processor.process(job);

    expect(recommendationService.createBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: 'ad_bad',
          recommendationType: 'pause',
        }),
      ]),
    );
    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({ recommendationsGenerated: 1 }),
    );
  });

  it('generates promote + budget_increase recommendations for top performer', async () => {
    // avgRoas = 100/20 = 5; minRoas = 2; 5 > 2*2=4, qualifies
    adPerformanceService.findByOrganization.mockResolvedValue([GOOD_AD_RECORD]);
    recommendationService.createBatch.mockResolvedValue(2);

    const job = buildJob({
      configId: CONFIG_ID,
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    await processor.process(job);

    expect(recommendationService.createBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: 'ad_good',
          recommendationType: 'promote',
        }),
        expect.objectContaining({
          entityId: 'ad_good',
          recommendationType: 'budget_increase',
        }),
      ]),
    );
  });

  it('skips recommendation if existing pending already exists', async () => {
    adPerformanceService.findByOrganization.mockResolvedValue([BAD_AD_RECORD]);
    recommendationService.findExistingPending.mockResolvedValue({
      _id: 'existing',
    });

    const job = buildJob({
      configId: CONFIG_ID,
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    await processor.process(job);

    expect(recommendationService.createBatch).not.toHaveBeenCalled();
  });

  it('calls expireStale after processing', async () => {
    const job = buildJob({
      configId: CONFIG_ID,
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    await processor.process(job);

    expect(recommendationService.expireStale).toHaveBeenCalled();
  });

  it('records error in audit log when createBatch fails', async () => {
    adPerformanceService.findByOrganization.mockResolvedValue([BAD_AD_RECORD]);
    recommendationService.createBatch.mockRejectedValue(
      new Error('DB insert failed'),
    );

    const job = buildJob({
      configId: CONFIG_ID,
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    await processor.process(job);

    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('DB insert failed'),
          }),
        ]),
      }),
    );
  });

  it('throws and writes audit log on top-level error', async () => {
    optimizationConfigService.findByOrganization.mockRejectedValue(
      new Error('config fetch failed'),
    );
    const job = buildJob({
      configId: CONFIG_ID,
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    await expect(processor.process(job)).rejects.toThrow('config fetch failed');

    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        adsAnalyzed: 0,
        errors: expect.arrayContaining([
          expect.objectContaining({ message: 'config fetch failed' }),
        ]),
      }),
    );
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('filters out ads below minSpend / minImpressions thresholds', async () => {
    const lowSpendAd = {
      ...BAD_AD_RECORD,
      externalAdId: 'ad_low',
      impressions: 10,
      spend: 1,
    };
    adPerformanceService.findByOrganization.mockResolvedValue([lowSpendAd]);

    const job = buildJob({
      configId: CONFIG_ID,
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    await processor.process(job);

    expect(recommendationService.createBatch).not.toHaveBeenCalled();
    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({ adsAnalyzed: 0 }),
    );
  });
});
