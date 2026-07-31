import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import type { OutreachCampaignDocument } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignDiscoveryService } from '@api/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { CampaignStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('OutreachCampaignsController', () => {
  let controller: OutreachCampaignsController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439014',
    },
  } as unknown as User;

  const mockOutreachCampaignsService = {
    complete: vi.fn(),
    createScoped: vi.fn(),
    findOne: vi.fn(),
    findOneById: vi.fn(),
    patch: vi.fn(),
    pause: vi.fn(),
    start: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutreachCampaignsController],
      providers: [
        {
          provide: OutreachCampaignsService,
          useValue: mockOutreachCampaignsService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: CampaignTargetsService, useValue: { create: vi.fn() } },
        { provide: CampaignDiscoveryService, useValue: { discover: vi.fn() } },
        { provide: CampaignExecutorService, useValue: { execute: vi.fn() } },
      ],
    }).compile();

    controller = module.get<OutreachCampaignsController>(
      OutreachCampaignsController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('canUserModifyEntity', () => {
    it('should return true when entity organizationId matches user organization', () => {
      const entity = {
        organizationId: '507f1f77bcf86cd799439012',
      } as unknown as OutreachCampaignDocument;
      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(true);
    });

    it('should return false when organizationId belongs to another tenant', () => {
      const entity = {
        organizationId: '507f1f77bcf86cd799439099',
      } as unknown as OutreachCampaignDocument;
      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });

    it('should deny access when only the unpopulated relation alias is present', () => {
      // A Prisma row without an explicit include carries no `organization`
      // relation; reading the alias yielded undefined and skipped the check.
      const entity = {
        organization: { id: '507f1f77bcf86cd799439012' },
      } as unknown as OutreachCampaignDocument;
      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });

    it('should return true for super admin regardless of tenant', () => {
      const superAdmin = {
        ...mockUser,
        publicMetadata: { ...mockUser.publicMetadata, isSuperAdmin: true },
      } as unknown as User;
      const entity = {
        organizationId: '507f1f77bcf86cd799439099',
      } as unknown as OutreachCampaignDocument;
      expect(controller.canUserModifyEntity(superAdmin, entity)).toBe(true);
    });
  });

  describe('patchCampaign', () => {
    it('preserves status-only transition behavior', async () => {
      mockOutreachCampaignsService.pause.mockResolvedValue({
        id: 'campaign_1',
        status: CampaignStatus.PAUSED,
      });

      await controller.patchCampaign(
        {} as never,
        'campaign_1',
        mockUser as never,
        { status: CampaignStatus.PAUSED },
      );

      expect(mockOutreachCampaignsService.pause).toHaveBeenCalledWith(
        'campaign_1',
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(mockOutreachCampaignsService.patch).not.toHaveBeenCalled();
    });

    it('rejects status transitions mixed with other updates', async () => {
      await expect(
        controller.patchCampaign({} as never, 'campaign_1', mockUser as never, {
          label: 'Renamed campaign',
          status: CampaignStatus.PAUSED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockOutreachCampaignsService.pause).not.toHaveBeenCalled();
      expect(mockOutreachCampaignsService.patch).not.toHaveBeenCalled();
    });
  });
});
