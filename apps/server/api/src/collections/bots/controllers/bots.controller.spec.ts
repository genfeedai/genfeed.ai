import { BotsController } from '@api/collections/bots/controllers/bots.controller';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { BotPlatform, BotStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('BotsController', () => {
  let controller: BotsController;
  let _service: BotsService;
  let livestreamService: {
    getOrCreateSession: ReturnType<typeof vi.fn>;
    ingestTranscriptChunk: ReturnType<typeof vi.fn>;
    pauseSession: ReturnType<typeof vi.fn>;
    resumeSession: ReturnType<typeof vi.fn>;
    sendNow: ReturnType<typeof vi.fn>;
    setManualOverride: ReturnType<typeof vi.fn>;
    startSession: ReturnType<typeof vi.fn>;
    stopSession: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
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
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const mockService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
      toggleStatus: vi.fn(),
    };
    livestreamService = {
      getOrCreateSession: vi.fn(),
      ingestTranscriptChunk: vi.fn(),
      pauseSession: vi.fn(),
      resumeSession: vi.fn(),
      sendNow: vi.fn(),
      setManualOverride: vi.fn(),
      startSession: vi.fn(),
      stopSession: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BotsController],
      providers: [
        {
          provide: BotsService,
          useValue: mockService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: BotsLivestreamService,
          useValue: livestreamService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BotsController>(BotsController);
    _service = module.get<BotsService>(BotsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with organization scope', () => {
      const query = {
        organization: '507f1f77bcf86cd799439012',
        scope: 'organization',
      };

      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline).toHaveLength(2);
      expect(pipeline[0]).toEqual({
        $match: {
          isDeleted: false,
          organization: '507f1f77bcf86cd799439012',
        },
      });
      expect(pipeline[1]).toEqual({
        $sort: { createdAt: -1 },
      });
    });

    it('should build pipeline with brand scope', () => {
      const query = {
        brand: '507f1f77bcf86cd799439013',
        scope: 'brand',
      };

      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline[0]).toEqual({
        $match: {
          brand: '507f1f77bcf86cd799439013',
          isDeleted: false,
        },
      });
    });

    it('should build pipeline with user scope', () => {
      const query = {
        scope: 'user',
        user: '507f1f77bcf86cd799439014',
      };

      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline[0]).toEqual({
        $match: {
          isDeleted: false,
          user: '507f1f77bcf86cd799439014',
        },
      });
    });

    it('should build pipeline with platform filter', () => {
      const query = {
        platform: BotPlatform.TWITTER,
      };

      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline[0]).toEqual({
        $match: {
          isDeleted: false,
          platforms: { $in: ['twitter'] },
          user: '507f1f77bcf86cd799439014',
        },
      });
    });

    it('should build pipeline with status filter', () => {
      const query = {
        status: [BotStatus.ACTIVE],
      };

      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline[0]).toEqual({
        $match: {
          isDeleted: false,
          status: BotStatus.ACTIVE,
          user: '507f1f77bcf86cd799439014',
        },
      });
    });

    it('should build pipeline with category filter', () => {
      const query = {
        category: 'social',
      };

      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline[0]).toEqual({
        $match: {
          category: 'social',
          isDeleted: false,
          user: '507f1f77bcf86cd799439014',
        },
      });
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true for user-owned entity', () => {
      const entity = {
        user: { _id: '507f1f77bcf86cd799439014' },
      };

      const result = controller.canUserModifyEntity(mockUser, entity);

      expect(result).toBe(true);
    });

    it('should return true for brand-owned entity', () => {
      const entity = {
        brand: { _id: '507f1f77bcf86cd799439013' },
      };

      const result = controller.canUserModifyEntity(mockUser, entity);

      expect(result).toBe(true);
    });

    it('should return true for organization-owned entity', () => {
      const entity = {
        organization: { _id: '507f1f77bcf86cd799439012' },
      };

      const result = controller.canUserModifyEntity(mockUser, entity);

      expect(result).toBe(true);
    });

    it('should return true for super admin', () => {
      const superAdminUser = {
        ...mockUser,
        publicMetadata: {
          ...mockUser.publicMetadata,
          isSuperAdmin: true,
        },
      };

      const entity = {
        user: { _id: 'different_user_id' },
      };

      const result = controller.canUserModifyEntity(superAdminUser, entity);

      expect(result).toBe(true);
    });

    it('should return false for unauthorized entity', () => {
      const entity = {
        user: { _id: 'different_user_id' },
      };

      const result = controller.canUserModifyEntity(mockUser, entity);

      expect(result).toBe(false);
    });
  });

  describe('livestream session endpoints', () => {
    const mockBot = {
      _id: '507f1f77bcf86cd799439011',
      brand: { _id: '507f1f77bcf86cd799439013' },
      organization: { _id: '507f1f77bcf86cd799439012' },
      user: { _id: '507f1f77bcf86cd799439014' },
    };

    beforeEach(() => {
      _service.findOne = vi.fn().mockResolvedValue(mockBot);
    });

    it('starts a livestream session for an owned bot', async () => {
      livestreamService.startSession.mockResolvedValue({
        _id: 'session-1',
        status: 'active',
      });

      const result = await controller.startLivestreamSession(
        { headers: {}, query: {} } as any,
        mockUser as any,
        mockBot._id.toString(),
      );

      expect(livestreamService.startSession).toHaveBeenCalledWith(mockBot);
      expect(result.data.id).toBe('session-1');
    });

    it('forwards transcript ingestion to the livestream service', async () => {
      livestreamService.ingestTranscriptChunk.mockResolvedValue({
        _id: 'session-1',
        status: 'active',
      });

      await controller.ingestLivestreamTranscript(
        { headers: {}, query: {} } as any,
        mockUser as any,
        mockBot._id.toString(),
        {
          confidence: 0.7,
          text: 'We are talking about YouTube live automation.',
        },
      );

      expect(livestreamService.ingestTranscriptChunk).toHaveBeenCalledWith(
        mockBot,
        {
          confidence: 0.7,
          text: 'We are talking about YouTube live automation.',
        },
      );
    });
  });
});
