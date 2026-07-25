import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignDiscoveryService } from '@api/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutreachCampaignsController],
      providers: [
        {
          provide: OutreachCampaignsService,
          useValue: {
            createScoped: vi.fn(),
            findOne: vi.fn(),
            findOneById: vi.fn(),
            patch: vi.fn(),
          },
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
      const entity = { organizationId: '507f1f77bcf86cd799439012' };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(true);
    });

    it('should return false when organizationId belongs to another tenant', () => {
      const entity = { organizationId: '507f1f77bcf86cd799439099' };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(false);
    });

    it('should deny access when only the unpopulated relation alias is present', () => {
      // A Prisma row without an explicit include carries no `organization`
      // relation; reading the alias yielded undefined and skipped the check.
      const entity = { organization: { id: '507f1f77bcf86cd799439012' } };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(false);
    });

    it('should return true for super admin regardless of tenant', () => {
      const superAdmin = {
        ...mockUser,
        publicMetadata: { ...mockUser.publicMetadata, isSuperAdmin: true },
      };
      const entity = { organizationId: '507f1f77bcf86cd799439099' };
      expect(
        controller.canUserModifyEntity(superAdmin as any, entity as any),
      ).toBe(true);
    });
  });
});
