vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { ReplyBotConfigsController } from '@api/collections/reply-bot-configs/controllers/reply-bot-configs.controller';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ReplyBotConfigsController', () => {
  let controller: ReplyBotConfigsController;
  let replyBotOrchestratorService: ReplyBotOrchestratorService;

  const mockUser = {
    brandId: 'brand-123',
    id: 'auth-provider-user',
    organizationId: 'org-123',
    userId: 'user-123',
  } as never;

  const mockReplyBotConfigsService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    findOneById: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockReplyBotOrchestratorService = {
    orchestrate: vi.fn(),
    queueOrganizationBots: vi.fn(),
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
          provide: ReplyBotOrchestratorService,
          useValue: mockReplyBotOrchestratorService,
        },
        {
          provide: AuthorReplyLoopService,
          useValue: {},
        },
        {
          provide: ReplyPostWatchService,
          useValue: {},
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
      mockReplyBotOrchestratorService.queueOrganizationBots.mockResolvedValue(
        'job-abc-123',
      );

      const result = await controller.triggerPolling(mockUser, {
        credentialId: 'cred-1',
      });

      expect(
        replyBotOrchestratorService.queueOrganizationBots,
      ).toHaveBeenCalledWith('org-123', 'cred-1');
      expect(result).toEqual({ jobId: 'job-abc-123' });
    });
  });
});
