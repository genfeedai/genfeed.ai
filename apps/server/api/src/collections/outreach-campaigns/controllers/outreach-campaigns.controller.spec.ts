import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import type { OutreachCampaignDocument } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignStatus } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

const organizationId = testId('org');
const otherOrganizationId = testId('org', 2);
const brandId = testId('brand');
const userId = testId('user');

describe('OutreachCampaignsController', () => {
  let controller: OutreachCampaignsController;

  const mockUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
  } as unknown as User;

  const mockOutreachCampaignsService = {
    complete: vi.fn(),
    createScoped: vi.fn(),
    findOne: vi.fn(),
    findOneById: vi.fn(),
    patch: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    start: vi.fn(),
  };

  const mockCampaignTargetsService = {
    getTargetStats: vi.fn(),
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
        {
          provide: CampaignTargetsService,
          useValue: mockCampaignTargetsService,
        },
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
        organizationId,
      } as unknown as OutreachCampaignDocument;
      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(true);
    });

    it('should return false when organizationId belongs to another tenant', () => {
      const entity = {
        organizationId: otherOrganizationId,
      } as unknown as OutreachCampaignDocument;
      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });

    it('should deny access when only the unpopulated relation alias is present', () => {
      // A Prisma row without an explicit include carries no `organization`
      // relation; reading the alias yielded undefined and skipped the check.
      const entity = {
        organization: { id: organizationId },
      } as unknown as OutreachCampaignDocument;
      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });

    it('should return true for super admin regardless of tenant', () => {
      const superAdmin = {
        ...mockUser,
        ...mockUser,
        isSuperAdmin: true,
      } as unknown as User;
      const entity = {
        organizationId: otherOrganizationId,
      } as unknown as OutreachCampaignDocument;
      expect(controller.canUserModifyEntity(superAdmin, entity)).toBe(true);
    });
  });

  describe('buildFindAllQuery', () => {
    it('binds members to the session organization', () => {
      expect(controller.buildFindAllQuery(mockUser, {} as never)).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId,
            organizationId,
          }),
        }),
      );
    });

    it('rejects a member organization filter outside the session org', () => {
      const call = () =>
        controller.buildFindAllQuery(mockUser, {
          organizationId: otherOrganizationId,
        } as never);

      expect(call).toThrow(ForbiddenException);
      try {
        call();
        expect.unreachable('expected a ForbiddenException');
      } catch (error) {
        expect((error as ForbiddenException).getResponse()).toEqual({
          detail: 'Access denied to this organization',
          title: 'Forbidden',
        });
      }
    });

    it('ignores deleted-row filters from the client', () => {
      expect(
        controller.buildFindAllQuery(mockUser, {
          isDeleted: true,
        } as never),
      ).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            organizationId,
          }),
        }),
      );
    });
  });

  describe('buildFindOneQuery', () => {
    it('binds detail reads to the session organization', () => {
      expect(controller.buildFindOneQuery(mockUser, 'campaign_1')).toEqual({
        id: 'campaign_1',
        isDeleted: false,
        organizationId,
      });
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
        mockUser.organizationId,
        mockUser.brandId,
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

    it('patches non-status fields with authenticated organization context', async () => {
      mockOutreachCampaignsService.patch.mockResolvedValue({
        id: 'campaign_1',
        label: 'Renamed campaign',
      });

      await controller.patchCampaign(
        {} as never,
        'campaign_1',
        mockUser as never,
        { label: 'Renamed campaign' },
      );

      expect(mockOutreachCampaignsService.patch).toHaveBeenCalledWith(
        'campaign_1',
        { label: 'Renamed campaign' },
        mockUser.organizationId,
        mockUser.brandId,
      );
    });
  });
});
