import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentCampaignsController } from '@api/collections/agent-campaigns/controllers/agent-campaigns.controller';
import type { AgentCampaignsQueryDto } from '@api/collections/agent-campaigns/dto/agent-campaigns-query.dto';
import type { AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const brandId = testId('brand');
const organizationId = testId('org');
const metadataUserId = testId('user');

describe('AgentCampaignsController', () => {
  let controller: AgentCampaignsController;
  let mockService: {
    create: ReturnType<typeof vi.fn>;
    createFromTemplate: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let mockExecutionService: {
    execute: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
  };
  let mockUsersService: {
    findOne: ReturnType<typeof vi.fn>;
  };

  const mockUser: AuthenticatedUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId: metadataUserId,
  };

  beforeEach(async () => {
    mockService = {
      create: vi.fn(),
      createFromTemplate: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
    };
    mockExecutionService = {
      execute: vi.fn(),
      getStatus: vi.fn(),
      pause: vi.fn(),
    };
    mockUsersService = {
      findOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentCampaignsController],
      providers: [
        { provide: AgentCampaignsService, useValue: mockService },
        { provide: UsersService, useValue: mockUsersService },
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
          provide: AgentCampaignExecutionService,
          useValue: mockExecutionService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AgentCampaignsController>(AgentCampaignsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('patch', () => {
    const mockReq = {
      headers: {},
      url: '/agent-campaigns/campaign-1',
    } as unknown as Request;

    it('routes status=active through executionService.execute using the canonical user id from public metadata', async () => {
      mockExecutionService.execute.mockResolvedValue({
        id: 'campaign-1',
      });

      await controller.patch(mockReq, mockUser, 'campaign-1', {
        status: 'active',
      });

      expect(mockExecutionService.execute).toHaveBeenCalledWith(
        'campaign-1',
        organizationId,
        metadataUserId,
      );
      expect(mockUsersService.findOne).not.toHaveBeenCalled();
    });

    it('falls back to the authenticated user id when metadata user id is unavailable', async () => {
      const userWithoutMetadataId = {
        ...mockUser,
        userId: undefined,
      } as unknown as AuthenticatedUser;

      mockExecutionService.execute.mockResolvedValue({
        id: 'campaign-2',
      });

      await controller.patch(mockReq, userWithoutMetadataId, 'campaign-2', {
        status: 'active',
      });

      expect(mockExecutionService.execute).toHaveBeenCalledWith(
        'campaign-2',
        organizationId,
        'user_123',
      );
      expect(mockUsersService.findOne).not.toHaveBeenCalled();
    });

    it('routes status=paused through executionService.pause', async () => {
      mockExecutionService.pause.mockResolvedValue({
        id: 'campaign-1',
      });

      await controller.patch(mockReq, mockUser, 'campaign-1', {
        status: 'paused',
      });

      expect(mockExecutionService.pause).toHaveBeenCalledWith(
        'campaign-1',
        organizationId,
      );
    });

    it('returns unauthorized instead of 500 when status mutation lacks organization context', async () => {
      const userWithoutOrganization = {
        ...mockUser,
        organizationId: undefined,
      } as unknown as AuthenticatedUser;

      await expect(
        controller.patch(mockReq, userWithoutOrganization, 'campaign-1', {
          status: 'active',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockExecutionService.execute).not.toHaveBeenCalled();
    });
  });

  describe('getCampaignStatus', () => {
    it('returns unauthorized instead of 500 when organization context is missing', async () => {
      const userWithoutOrganization = {
        ...mockUser,
        organizationId: undefined,
      } as unknown as AuthenticatedUser;

      await expect(
        controller.getCampaignStatus('campaign-1', userWithoutOrganization),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockExecutionService.getStatus).not.toHaveBeenCalled();
    });
  });

  describe('buildFindAllQuery', () => {
    const buildQuery = (query: Partial<AgentCampaignsQueryDto> = {}) =>
      controller.buildFindAllQuery(mockUser, query as AgentCampaignsQueryDto);

    it('should build query with organization and brand filters', () => {
      const query = buildQuery();

      expect(query).toEqual({
        orderBy: { createdAt: -1 },
        where: {
          brandId: brandId,
          isDeleted: false,
          organizationId: organizationId,
        },
      });
    });

    it('should include status filter when provided', () => {
      const query = buildQuery({ status: 'active' });

      expect(query).toEqual({
        orderBy: { createdAt: -1 },
        where: {
          brandId: brandId,
          isDeleted: false,
          organizationId: organizationId,
          status: 'active',
        },
      });
    });

    it('uses the requested selected brand while retaining organization scope', () => {
      const selectedBrandId = testId('selected-brand');
      const query = buildQuery({
        brandId: selectedBrandId,
      });

      expect(query.where).toEqual({
        brandId: selectedBrandId,
        isDeleted: false,
        organizationId,
      });
    });

    it('should omit the brand filter when no brand is selected', () => {
      const userWithoutBrand = {
        ...mockUser,
        brandId: undefined,
      } as unknown as AuthenticatedUser;
      const query = controller.buildFindAllQuery(
        userWithoutBrand,
        {} as AgentCampaignsQueryDto,
      );

      expect(query).toEqual({
        orderBy: { createdAt: -1 },
        where: {
          isDeleted: false,
          organizationId: organizationId,
        },
      });
    });

    it('fails closed when the authenticated organization is missing', () => {
      const userWithoutOrganization = {
        ...mockUser,
        organizationId: undefined,
      } as unknown as AuthenticatedUser;

      expect(() =>
        controller.buildFindAllQuery(
          userWithoutOrganization,
          {} as AgentCampaignsQueryDto,
        ),
      ).toThrow('Organization not found');
    });

    it('should respect isDeleted query param', () => {
      const query = buildQuery({ isDeleted: true });

      expect(query.where.isDeleted).toBe(true);
    });
  });

  describe('createFromTemplate', () => {
    it('pins the command to the authenticated organization and user', async () => {
      mockService.createFromTemplate.mockResolvedValue({
        agents: [],
        id: 'program-1',
      });
      const request = {
        headers: {},
        url: '/agent-campaigns/from-template',
      } as unknown as Request;

      await controller.createFromTemplate(request, mockUser, {
        brandId,
        label: 'Creator Studio Program',
        startDate: new Date('2026-08-20'),
        templateId: 'creator-studio',
      });

      expect(mockService.createFromTemplate).toHaveBeenCalledWith({
        brandId,
        label: 'Creator Studio Program',
        organizationId,
        startDate: new Date('2026-08-20'),
        templateId: 'creator-studio',
        userId: metadataUserId,
      });
    });
  });

  describe('create', () => {
    it('returns unauthorized instead of 500 when organization context is missing', async () => {
      const userWithoutOrganization = {
        ...mockUser,
        organizationId: undefined,
      } as unknown as AuthenticatedUser;
      const request = {
        headers: {},
        url: '/agent-campaigns',
      } as unknown as Request;

      await expect(
        controller.create(request, userWithoutOrganization, {
          label: 'Blank Program',
          startDate: new Date('2026-08-20'),
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockService.create).not.toHaveBeenCalled();
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true when entity organizationId matches user organization', () => {
      const entity = { organizationId: organizationId };
      expect(
        controller.canUserModifyEntity(
          mockUser,
          entity as unknown as AgentCampaignDocument,
        ),
      ).toBe(true);
    });

    it('should leave cross-organization super-admin access to the base controller', () => {
      const superAdmin = {
        ...mockUser,
        isSuperAdmin: true,
      };
      const entity = { organizationId: 'different_org_id' };
      expect(
        controller.canUserModifyEntity(
          superAdmin,
          entity as unknown as AgentCampaignDocument,
        ),
      ).toBe(false);
    });

    it('should return false when organizationId does not match', () => {
      const entity = { organizationId: 'different_org_id' };
      expect(
        controller.canUserModifyEntity(
          mockUser,
          entity as unknown as AgentCampaignDocument,
        ),
      ).toBe(false);
    });

    it('should deny access when only the unpopulated relation alias is present', () => {
      // A Prisma row without an explicit include carries no `organization`
      // relation; reading the alias used to yield undefined on both sides and
      // wave the request through.
      const entity = { organization: { id: organizationId } };
      expect(
        controller.canUserModifyEntity(
          mockUser,
          entity as unknown as AgentCampaignDocument,
        ),
      ).toBe(false);
    });
  });

  describe('enrichUpdateDto', () => {
    it('adds trusted organization scope for service updates', async () => {
      await expect(
        controller.enrichUpdateDto({ status: 'completed' }, mockUser),
      ).resolves.toEqual({
        organizationId,
        status: 'completed',
      });
    });
  });
});
