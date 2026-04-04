vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    brand: 'brand-123',
    organization: 'org-123',
    user: 'user-123',
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { ReplyBotConfigsController } from '@api/collections/reply-bot-configs/controllers/reply-bot-configs.controller';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ReplyBotQueueService } from '@api/queues/reply-bot/reply-bot-queue.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ReplyBotConfigsController', () => {
  let controller: ReplyBotConfigsController;
  let replyBotConfigsService: ReplyBotConfigsService;
  let replyBotQueueService: ReplyBotQueueService;
  let replyBotOrchestratorService: ReplyBotOrchestratorService;

  const mockRequest = {} as never;
  const mockUser = { id: 'user-123' } as never;

  const mockReplyBotConfigsService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    findOneById: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    toggleActive: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockReplyBotQueueService = {
    addJob: vi.fn(),
    getQueueStatus: vi.fn(),
    triggerPolling: vi.fn(),
  };

  const mockReplyBotOrchestratorService = {
    orchestrate: vi.fn(),
    testReplyGeneration: vi.fn(),
  };

  const mockFeatureFlagService = {
    isEnabled: vi.fn(() => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReplyBotConfigsController],
      providers: [
        {
          provide: ReplyBotConfigsService,
          useValue: mockReplyBotConfigsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ReplyBotQueueService,
          useValue: mockReplyBotQueueService,
        },
        {
          provide: ReplyBotOrchestratorService,
          useValue: mockReplyBotOrchestratorService,
        },
        {
          provide: FeatureFlagService,
          useValue: mockFeatureFlagService,
        },
      ],
    })
      .overrideGuard(FeatureFlagGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReplyBotConfigsController>(
      ReplyBotConfigsController,
    );
    replyBotConfigsService = module.get<ReplyBotConfigsService>(
      ReplyBotConfigsService,
    );
    replyBotQueueService =
      module.get<ReplyBotQueueService>(ReplyBotQueueService);
    replyBotOrchestratorService = module.get<ReplyBotOrchestratorService>(
      ReplyBotOrchestratorService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockFeatureFlagService.isEnabled.mockReturnValue(true);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('toggleActive', () => {
    it('should toggle active status and return serialized config', async () => {
      const mockConfig = { _id: 'config-1', isActive: true };
      const mockToggled = { _id: 'config-1', isActive: false };
      mockReplyBotConfigsService.findOneById.mockResolvedValue(mockConfig);
      mockReplyBotConfigsService.toggleActive.mockResolvedValue(mockToggled);

      const result = await controller.toggleActive(
        mockRequest,
        'config-1',
        mockUser,
      );

      expect(replyBotConfigsService.findOneById).toHaveBeenCalledWith(
        'config-1',
        'org-123',
        'brand-123',
      );
      expect(replyBotConfigsService.toggleActive).toHaveBeenCalledWith(
        'config-1',
        'org-123',
        'brand-123',
      );
      expect(result).toEqual(mockToggled);
    });

    it('should throw when config not found', async () => {
      mockReplyBotConfigsService.findOneById.mockResolvedValue(null);

      await expect(
        controller.toggleActive(mockRequest, 'invalid-id', mockUser),
      ).rejects.toThrow('Reply bot config not found');
    });
  });

  describe('testReplyGeneration', () => {
    it('should delegate to orchestrator service and return generated reply', async () => {
      const mockReply = { replyText: 'Hello there!' };
      mockReplyBotOrchestratorService.testReplyGeneration.mockResolvedValue(
        mockReply,
      );

      const body = { author: 'testuser', content: 'Hello world' };
      const result = await controller.testReplyGeneration(
        'config-1',
        mockUser,
        body,
      );

      expect(
        replyBotOrchestratorService.testReplyGeneration,
      ).toHaveBeenCalledWith('config-1', 'org-123', {
        author: 'testuser',
        content: 'Hello world',
      });
      expect(result).toEqual(mockReply);
    });
  });

  describe('triggerPolling', () => {
    it('should trigger polling and return job id', async () => {
      mockReplyBotQueueService.triggerPolling.mockResolvedValue('job-abc-123');

      const result = await controller.triggerPolling(mockUser, {
        credentialId: 'cred-1',
      });

      expect(replyBotQueueService.triggerPolling).toHaveBeenCalledWith(
        'org-123',
        'cred-1',
      );
      expect(result).toEqual({ jobId: 'job-abc-123' });
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue statistics', async () => {
      const mockStatus = {
        active: 2,
        completed: 50,
        failed: 1,
        waiting: 5,
      };
      mockReplyBotQueueService.getQueueStatus.mockResolvedValue(mockStatus);

      const result = await controller.getQueueStatus();

      expect(replyBotQueueService.getQueueStatus).toHaveBeenCalled();
      expect(result).toEqual(mockStatus);
    });
  });
});
