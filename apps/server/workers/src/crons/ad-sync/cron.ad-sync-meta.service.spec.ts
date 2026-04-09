import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { QueueService } from '@api/queues/core/queue.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronAdSyncMetaService } from '@workers/crons/ad-sync/cron.ad-sync-meta.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
  },
}));

describe('CronAdSyncMetaService', () => {
  let adPerformanceService: {
    findLatestSyncDateForCredential: ReturnType<typeof vi.fn>;
  };
  let credentialsService: { findAll: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let metaAdsService: { getAdAccounts: ReturnType<typeof vi.fn> };
  let queueService: { add: ReturnType<typeof vi.fn> };
  let service: CronAdSyncMetaService;

  beforeEach(async () => {
    adPerformanceService = {
      findLatestSyncDateForCredential: vi
        .fn()
        .mockResolvedValue(new Date('2024-01-10T00:00:00.000Z')),
    };
    credentialsService = {
      findAll: vi.fn().mockResolvedValue({
        docs: [
          {
            _id: '507f1f77bcf86cd799439013',
            accessToken: 'encrypted-token',
            brand: { toString: () => '507f1f77bcf86cd799439012' },
            organization: { toString: () => '507f1f77bcf86cd799439011' },
          },
        ],
      }),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    metaAdsService = {
      getAdAccounts: vi.fn().mockResolvedValue([{ id: 'act_123' }]),
    };
    queueService = { add: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronAdSyncMetaService,
        { provide: AdPerformanceService, useValue: adPerformanceService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: loggerService },
        { provide: MetaAdsService, useValue: metaAdsService },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get(CronAdSyncMetaService);
  });

  it('enqueues sync jobs for connected Facebook credentials', async () => {
    await service.syncMetaAds();

    expect(credentialsService.findAll).toHaveBeenCalled();
    expect(metaAdsService.getAdAccounts).toHaveBeenCalled();
    expect(queueService.add).toHaveBeenCalledWith(
      'ad-sync-meta',
      expect.objectContaining({
        adAccountIds: ['act_123'],
        brandId: '507f1f77bcf86cd799439012',
        credentialId: '507f1f77bcf86cd799439013',
        organizationId: '507f1f77bcf86cd799439011',
      }),
      expect.objectContaining({
        attempts: 3,
        backoff: { delay: 5000, type: 'exponential' },
      }),
    );
  });

  it('logs and exits when no connected credentials exist', async () => {
    credentialsService.findAll.mockResolvedValueOnce({ docs: [] });

    await service.syncMetaAds();

    expect(queueService.add).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('no connected Meta credentials found'),
    );
  });
});
