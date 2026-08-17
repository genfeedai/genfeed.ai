import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { AgentCampaignsController } from '@api/collections/agent-campaigns/controllers/agent-campaigns.controller';
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

const brandId = testId('brand');
const organizationId = testId('org');
const metadataUserId = testId('user');

describe('AgentCampaignsController', () => {
  let controller: AgentCampaignsController;
  let mockExecutionService: {
    execute: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
  };
  let mockUsersService: {
    findOne: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId: metadataUserId,
  };

  beforeEach(async () => {
    const mockService = {
      create: vi.fn(),
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
    const mockReq = { headers: {}, url: '/agent-campaigns/campaign-1' } as any;

    it('routes status=active through executionService.execute using the canonical user id from public metadata', async () => {
      mockExecutionService.execute.mockResolvedValue({
        id: 'campaign-1',
      });

      await controller.patch(mockReq, mockUser as any, 'campaign-1', {
        status: 'active',
      } as any);

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
      };

      mockExecutionService.execute.mockResolvedValue({
        id: 'campaign-2',
      });

      await controller.patch(
        mockReq,
        userWithoutMetadataId as any,
        'campaign-2',
        { status: 'active' } as any,
      );

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

      await controller.patch(mockReq, mockUser as any, 'campaign-1', {
        status: 'paused',
      } as any);

      expect(mockExecutionService.pause).toHaveBeenCalledWith(
        'campaign-1',
        organizationId,
      );
    });
  });

  describe('buildFindAllQuery', () => {
    it('should build query with organization and brand filters', () => {
      const inputQuery = {};
      const query = controller.buildFindAllQuery(
        mockUser as any,
        inputQuery as any,
      );

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
      const inputQuery = { status: 'active' };
      const query = controller.buildFindAllQuery(
        mockUser as any,
        inputQuery as any,
      );

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

    it('should omit the brand filter when no brand is selected', () => {
      const userWithoutBrand = {
        ...mockUser,
        ...mockUser,
        brandId: undefined,
      };
      const query = controller.buildFindAllQuery(
        userWithoutBrand as any,
        {} as any,
      );

      expect(query).toEqual({
        orderBy: { createdAt: -1 },
        where: {
          isDeleted: false,
          organizationId: organizationId,
        },
      });
    });

    it('should respect isDeleted query param', () => {
      const inputQuery = { isDeleted: true };
      const query = controller.buildFindAllQuery(
        mockUser as any,
        inputQuery as any,
      );

      expect((query as any).where.isDeleted).toBe(true);
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true when entity organizationId matches user organization', () => {
      const entity = { organizationId: organizationId };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(true);
    });

    it('should return true for super admin', () => {
      const superAdmin = {
        ...mockUser,
        ...mockUser,
        isSuperAdmin: true,
      };
      const entity = { organizationId: 'different_org_id' };
      expect(
        controller.canUserModifyEntity(superAdmin as any, entity as any),
      ).toBe(true);
    });

    it('should return false when organizationId does not match', () => {
      const entity = { organizationId: 'different_org_id' };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(false);
    });

    it('should deny access when only the unpopulated relation alias is present', () => {
      // A Prisma row without an explicit include carries no `organization`
      // relation; reading the alias used to yield undefined on both sides and
      // wave the request through.
      const entity = { organization: { id: organizationId } };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(false);
    });
  });
});
