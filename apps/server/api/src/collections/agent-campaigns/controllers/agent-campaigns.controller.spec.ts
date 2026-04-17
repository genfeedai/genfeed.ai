import { AgentCampaignsController } from '@api/collections/agent-campaigns/controllers/agent-campaigns.controller';
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

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
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439014',
    },
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
      .overrideGuard(ClerkGuard)
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

  describe('executeCampaign', () => {
    it('uses the Mongo user id from public metadata when executing', async () => {
      mockUsersService.findOne.mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
      });
      mockExecutionService.execute.mockResolvedValue({
        _id: 'campaign-1',
      });

      await controller.executeCampaign('campaign-1', mockUser as any);

      expect(mockExecutionService.execute).toHaveBeenCalledWith(
        'campaign-1',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439014',
      );
      expect(mockUsersService.findOne).toHaveBeenCalledWith(
        {
          _id: '507f1f77bcf86cd799439014',
          clerkId: 'user_123',
        },
        [],
      );
    });

    it('falls back to lookup by clerk id when metadata user id is unavailable', async () => {
      const userWithoutMongoMetadata = {
        ...mockUser,
        publicMetadata: {
          ...mockUser.publicMetadata,
          user: undefined,
        },
      };

      mockUsersService.findOne.mockResolvedValueOnce({
        _id: '507f1f77bcf86cd799439099',
      });
      mockExecutionService.execute.mockResolvedValue({
        _id: 'campaign-2',
      });

      await controller.executeCampaign(
        'campaign-2',
        userWithoutMongoMetadata as any,
      );

      expect(mockExecutionService.execute).toHaveBeenCalledWith(
        'campaign-2',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439099',
      );
      expect(mockUsersService.findOne).toHaveBeenCalledWith(
        { clerkId: 'user_123' },
        [],
      );
    });
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with organization and brand filters', () => {
      const query = {};
      const pipeline = controller.buildFindAllPipeline(
        mockUser as any,
        query as any,
      );

      expect(pipeline).toHaveLength(2);
      expect(pipeline[0]).toEqual({
        $match: {
          brand: '507f1f77bcf86cd799439013',
          isDeleted: false,
          organization: '507f1f77bcf86cd799439012',
        },
      });
    });

    it('should include status filter when provided', () => {
      const query = { status: 'active' };
      const pipeline = controller.buildFindAllPipeline(
        mockUser as any,
        query as any,
      );

      expect(pipeline[0]).toEqual({
        $match: {
          brand: '507f1f77bcf86cd799439013',
          isDeleted: false,
          organization: '507f1f77bcf86cd799439012',
          status: 'active',
        },
      });
    });

    it('should omit the brand filter when no brand is selected', () => {
      const userWithoutBrand = {
        ...mockUser,
        publicMetadata: {
          ...mockUser.publicMetadata,
          brand: undefined,
        },
      };
      const pipeline = controller.buildFindAllPipeline(
        userWithoutBrand as any,
        {} as any,
      );

      expect(pipeline[0]).toEqual({
        $match: {
          isDeleted: false,
          organization: '507f1f77bcf86cd799439012',
        },
      });
    });

    it('should respect isDeleted query param', () => {
      const query = { isDeleted: true };
      const pipeline = controller.buildFindAllPipeline(
        mockUser as any,
        query as any,
      );

      expect((pipeline[0] as any).$match.isDeleted).toBe(true);
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true when entity organization matches user organization', () => {
      const entity = {
        organization: { _id: '507f1f77bcf86cd799439012' },
      };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(true);
    });

    it('should return true for super admin', () => {
      const superAdmin = {
        ...mockUser,
        publicMetadata: { ...mockUser.publicMetadata, isSuperAdmin: true },
      };
      const entity = { organization: { _id: 'different_org_id' } };
      expect(
        controller.canUserModifyEntity(superAdmin as any, entity as any),
      ).toBe(true);
    });

    it('should return false when organization does not match', () => {
      const entity = { organization: { _id: 'different_org_id' } };
      expect(
        controller.canUserModifyEntity(mockUser as any, entity as any),
      ).toBe(false);
    });
  });
});
