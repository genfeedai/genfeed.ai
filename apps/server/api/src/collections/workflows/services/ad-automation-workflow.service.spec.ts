import { AdAutomationWorkflowService } from '@api/collections/workflows/services/ad-automation-workflow.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted:${value}`),
  },
}));

describe('AdAutomationWorkflowService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const queueService = { add: vi.fn() };
  const cacheService = { acquireLock: vi.fn() };
  const credentialsService = { findAll: vi.fn() };
  const adPerformanceService = { findLatestSyncDateForCredential: vi.fn() };
  const optimizationConfigService = { findByOrganization: vi.fn() };
  const metaAdsService = { getAdAccounts: vi.fn() };
  const googleAdsService = { listAccessibleCustomers: vi.fn() };
  const tikTokAdsService = { getAdAccounts: vi.fn() };

  let service: AdAutomationWorkflowService;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    cacheService.acquireLock.mockResolvedValue(true);
    queueService.add.mockResolvedValue({ id: 'job-1' });
    adPerformanceService.findLatestSyncDateForCredential.mockResolvedValue(
      new Date('2026-06-01T00:00:00.000Z'),
    );

    service = new AdAutomationWorkflowService(
      logger as never,
      queueService as never,
      cacheService as never,
      credentialsService as never,
      adPerformanceService as never,
      optimizationConfigService as never,
      metaAdsService as never,
      googleAdsService as never,
      tikTokAdsService as never,
    );
  });

  it('skips ad optimization when the daily org lock already exists', async () => {
    cacheService.acquireLock.mockResolvedValue(false);

    const result = await service.runAdOptimization('org-1');

    expect(result).toMatchObject({
      action: 'adOptimization',
      enqueued: 0,
      organizationId: 'org-1',
      reason: 'daily_ad_optimization_already_enqueued',
      status: 'skipped',
    });
    expect(queueService.add).not.toHaveBeenCalled();
  });

  it('enqueues one ad optimization job for an enabled org config', async () => {
    optimizationConfigService.findByOrganization.mockResolvedValue({
      _id: 'config-1',
      isEnabled: true,
    });

    const result = await service.runAdOptimization('org-1');

    expect(queueService.add).toHaveBeenCalledWith(
      'ad-optimization',
      expect.objectContaining({
        configId: 'config-1',
        organizationId: 'org-1',
        runId: expect.any(String),
      }),
      expect.objectContaining({ attempts: 3, delay: 0 }),
    );
    expect(result).toMatchObject({
      action: 'adOptimization',
      enqueued: 1,
      organizationId: 'org-1',
      status: 'enqueued',
    });
  });

  it('enqueues Meta ad sync jobs for connected Facebook credentials', async () => {
    credentialsService.findAll.mockResolvedValue({
      docs: [
        {
          _id: 'cred-1',
          accessToken: 'meta-token',
          brandId: 'brand-1',
        },
      ],
    });
    metaAdsService.getAdAccounts.mockResolvedValue([{ id: 'act-1' }]);

    const result = await service.runMetaAdSync('org-1');

    expect(credentialsService.findAll).toHaveBeenCalledWith(
      {
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: CredentialPlatform.FACEBOOK,
        }),
      },
      { limit: 500, pagination: false },
    );
    expect(queueService.add).toHaveBeenCalledWith(
      'ad-sync-meta',
      {
        accessToken: 'decrypted:meta-token',
        adAccountIds: ['act-1'],
        brandId: 'brand-1',
        credentialId: 'cred-1',
        lastSyncDate: '2026-06-01T00:00:00.000Z',
        organizationId: 'org-1',
      },
      expect.objectContaining({ attempts: 3, delay: 0 }),
    );
    expect(result.enqueued).toBe(1);
  });

  it('enqueues Google Ads sync jobs from accessible customers', async () => {
    credentialsService.findAll.mockResolvedValue({
      docs: [
        {
          _id: 'cred-1',
          accessToken: 'google-token',
          brandId: 'brand-1',
          refreshToken: 'refresh-token',
        },
      ],
    });
    googleAdsService.listAccessibleCustomers.mockResolvedValue([
      { id: 'customer-1' },
    ]);

    const result = await service.runGoogleAdSync('org-1');

    expect(credentialsService.findAll).toHaveBeenCalledWith(
      {
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: CredentialPlatform.GOOGLE_ADS,
        }),
      },
      { limit: 500, pagination: false },
    );
    expect(queueService.add).toHaveBeenCalledWith(
      'ad-sync-google',
      expect.objectContaining({
        accessToken: 'decrypted:google-token',
        brandId: 'brand-1',
        credentialId: 'cred-1',
        customerIds: ['customer-1'],
        organizationId: 'org-1',
        refreshToken: 'decrypted:refresh-token',
      }),
      expect.objectContaining({ attempts: 3, delay: 0 }),
    );
    expect(result.enqueued).toBe(1);
  });

  it('enqueues TikTok Ads sync jobs from advertiser accounts', async () => {
    credentialsService.findAll.mockResolvedValue({
      docs: [
        {
          _id: 'cred-1',
          accessToken: 'tiktok-token',
          brandId: 'brand-1',
        },
      ],
    });
    tikTokAdsService.getAdAccounts.mockResolvedValue([
      { advertiserId: 'advertiser-1' },
    ]);

    const result = await service.runTikTokAdSync('org-1');

    expect(credentialsService.findAll).toHaveBeenCalledWith(
      {
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: CredentialPlatform.TIKTOK,
        }),
      },
      { limit: 500, pagination: false },
    );
    expect(queueService.add).toHaveBeenCalledWith(
      'ad-sync-tiktok',
      expect.objectContaining({
        accessToken: 'decrypted:tiktok-token',
        advertiserIds: ['advertiser-1'],
        brandId: 'brand-1',
        credentialId: 'cred-1',
        organizationId: 'org-1',
      }),
      expect.objectContaining({ attempts: 3, delay: 0 }),
    );
    expect(result.enqueued).toBe(1);
  });
});
