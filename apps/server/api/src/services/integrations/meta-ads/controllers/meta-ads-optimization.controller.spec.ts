vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  extractRequestContext: vi.fn(() => ({
    brandId: '507f1f77bcf86cd799439011',
    organizationId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439013',
  })),
  getPublicMetadata: vi.fn(() => ({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439013',
  })),
}));

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((v: string) => `decrypted_${v}`) },
}));

import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MetaAdsOptimizationController } from '@api/services/integrations/meta-ads/controllers/meta-ads-optimization.controller';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('MetaAdsOptimizationController', () => {
  let controller: MetaAdsOptimizationController;
  let recommendationsService: Record<string, ReturnType<typeof vi.fn>>;
  let configsService: Record<string, ReturnType<typeof vi.fn>>;
  let auditLogsService: Record<string, ReturnType<typeof vi.fn>>;
  let metaAdsService: Record<string, ReturnType<typeof vi.fn>>;
  let credentialsService: Record<string, ReturnType<typeof vi.fn>>;

  const mockUser = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439013',
    },
  } as unknown as User;

  beforeEach(async () => {
    recommendationsService = {
      approve: vi.fn(),
      findById: vi.fn(),
      findByOrganization: vi.fn().mockResolvedValue([]),
      markExecuted: vi.fn(),
      reject: vi.fn(),
    };

    configsService = {
      findByOrganization: vi.fn(),
      upsert: vi.fn(),
    };

    auditLogsService = {
      findByOrganization: vi.fn().mockResolvedValue([]),
    };

    metaAdsService = {
      pauseAd: vi.fn(),
      pauseCampaign: vi.fn(),
      updateAdSet: vi.fn(),
      updateCampaignBudget: vi.fn(),
    };

    credentialsService = {
      findOne: vi.fn().mockResolvedValue({ accessToken: 'enc_tok' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaAdsOptimizationController,
        {
          provide: AdOptimizationRecommendationsService,
          useValue: recommendationsService,
        },
        {
          provide: AdOptimizationConfigsService,
          useValue: configsService,
        },
        {
          provide: AdOptimizationAuditLogsService,
          useValue: auditLogsService,
        },
        { provide: MetaAdsService, useValue: metaAdsService },
        { provide: CredentialsService, useValue: credentialsService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    controller = module.get<MetaAdsOptimizationController>(
      MetaAdsOptimizationController,
    );
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listRecommendations passes filters to service', async () => {
    await controller.listRecommendations(
      mockUser,
      'pending' as never,
      'pause' as never,
      '10',
      '5',
    );
    expect(recommendationsService.findByOrganization).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      {
        limit: 10,
        offset: 5,
        recommendationType: 'pause',
        status: 'pending',
      },
    );
  });

  it('approveRecommendation returns the approved rec', async () => {
    const rec = { id: 'rec-1', status: 'approved' };
    recommendationsService.approve.mockResolvedValue(rec);
    const result = await controller.approveRecommendation(mockUser, 'rec-1');
    expect(result).toEqual(rec);
  });

  it('approveRecommendation throws NotFoundException if not found', async () => {
    recommendationsService.approve.mockResolvedValue(null);
    await expect(
      controller.approveRecommendation(mockUser, 'rec-missing'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejectRecommendation returns the rejected rec', async () => {
    const rec = { id: 'rec-1', status: 'rejected' };
    recommendationsService.reject.mockResolvedValue(rec);
    const result = await controller.rejectRecommendation(mockUser, 'rec-1', {
      reason: 'too expensive',
    });
    expect(result).toEqual(rec);
  });

  it('rejectRecommendation throws NotFoundException if not found', async () => {
    recommendationsService.reject.mockResolvedValue(null);
    await expect(
      controller.rejectRecommendation(mockUser, 'rec-x'),
    ).rejects.toThrow(NotFoundException);
  });

  it('executeRecommendation with pause type calls pauseCampaign', async () => {
    recommendationsService.findById.mockResolvedValue({
      entityId: 'camp-1',
      entityType: 'campaign',
      metrics: { spend: 100 },
      recommendationType: 'pause',
      status: 'approved',
      suggestedAction: {},
    });
    const result = await controller.executeRecommendation(mockUser, 'rec-1');
    expect(result).toEqual({ success: true });
    expect(metaAdsService.pauseCampaign).toHaveBeenCalledWith(
      'decrypted_enc_tok',
      'camp-1',
    );
    expect(recommendationsService.markExecuted).toHaveBeenCalled();
  });

  it('executeRecommendation throws NotFoundException if rec not found', async () => {
    recommendationsService.findById.mockResolvedValue(null);
    await expect(
      controller.executeRecommendation(mockUser, 'nope'),
    ).rejects.toThrow(NotFoundException);
  });

  it('executeRecommendation throws BadRequestException if status is not approved', async () => {
    recommendationsService.findById.mockResolvedValue({
      entityId: 'camp-1',
      entityType: 'campaign',
      metrics: {},
      recommendationType: 'pause',
      status: 'pending',
    });
    await expect(
      controller.executeRecommendation(mockUser, 'rec-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('executeRecommendation with budget_increase calculates new budget', async () => {
    recommendationsService.findById.mockResolvedValue({
      entityId: 'camp-1',
      entityType: 'campaign',
      metrics: { spend: 700 },
      recommendationType: 'budget_increase',
      status: 'approved',
      suggestedAction: { budgetIncreasePct: 20, maxDailyBudget: 500 },
    });
    await controller.executeRecommendation(mockUser, 'rec-1');
    expect(metaAdsService.updateCampaignBudget).toHaveBeenCalled();
  });

  it('executeRecommendation with unknown type throws BadRequestException', async () => {
    recommendationsService.findById.mockResolvedValue({
      entityId: 'camp-1',
      entityType: 'campaign',
      metrics: {},
      recommendationType: 'unknown_type',
      status: 'approved',
      suggestedAction: {},
    });
    await expect(
      controller.executeRecommendation(mockUser, 'rec-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('getConfig returns config or default', async () => {
    configsService.findByOrganization.mockResolvedValue(null);
    const result = await controller.getConfig(mockUser);
    expect(result).toEqual({ isEnabled: false });
  });

  it('updateConfig calls upsert', async () => {
    const config = { isEnabled: true };
    configsService.upsert.mockResolvedValue(config);
    const result = await controller.updateConfig(mockUser, config);
    expect(result).toEqual(config);
  });

  it('listAuditLogs passes pagination', async () => {
    await controller.listAuditLogs(mockUser, '20', '0');
    expect(auditLogsService.findByOrganization).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      { limit: 20, offset: 0 },
    );
  });
});
