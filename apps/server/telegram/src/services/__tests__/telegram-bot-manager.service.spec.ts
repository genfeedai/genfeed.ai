import { OrgIntegration, REDIS_EVENTS } from '@genfeedai/integrations';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@telegram/config/config.service';
import { TelegramBotManager } from '@telegram/services/telegram-bot-manager.service';
import { of, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

// Mock Grammy Bot
const { mockBot } = vi.hoisted(() => ({
  mockBot: {
    api: {
      getFile: vi.fn(),
      token: 'test-token',
    },
    catch: vi.fn(),
    command: vi.fn(),
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    use: vi.fn(),
  },
}));

vi.mock('grammy', () => ({
  Bot: vi.fn(function () {
    return mockBot;
  }),
  InlineKeyboard: vi.fn(function () {
    return {
      row: vi.fn().mockReturnThis(),
      text: vi.fn().mockReturnThis(),
    };
  }),
}));

describe('TelegramBotManager', () => {
  let service: TelegramBotManager;
  let _configService: Mocked<ConfigService>;
  let httpService: Mocked<HttpService>;
  let redisService: Mocked<RedisService>;

  const mockIntegration: OrgIntegration = {
    botToken: 'bot-token-123',
    config: {
      allowedUserIds: ['123456', '789012'],
      defaultWorkflow: 'wf-image-gen',
      webhookMode: false,
    },
    createdAt: new Date('2024-01-01'),
    id: 'telegram-integration-1',
    orgId: 'org-123',
    platform: 'telegram',
    status: 'active',
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const mockConfigService = {
      API_KEY: 'test-key',
      API_URL: 'http://localhost:3000',
      get: vi.fn(),
    };

    const mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const mockRedisService = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotManager,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<TelegramBotManager>(TelegramBotManager);
    _configService = module.get(ConfigService);
    httpService = module.get(HttpService);
    redisService = module.get(RedisService);

    // Mock logger to avoid console noise
    vi.spyOn(service.logger, 'log').mockImplementation();
    vi.spyOn(service.logger, 'warn').mockImplementation();
    vi.spyOn(service.logger, 'error').mockImplementation();
    vi.spyOn(service.logger, 'debug').mockImplementation();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockBot.start.mockClear();
    mockBot.stop.mockClear();
    mockBot.use.mockClear();
    mockBot.command.mockClear();
    mockBot.on.mockClear();
    mockBot.catch.mockClear();
  });

  describe('initialize', () => {
    it('should initialize with active integrations', async () => {
      const mockIntegrations = [mockIntegration];
      httpService.get.mockReturnValue(of({ data: mockIntegrations }) as any);
      mockBot.start.mockResolvedValue(undefined);

      await service.initialize();

      expect(redisService.subscribe).toHaveBeenCalledTimes(3);
      expect(redisService.subscribe).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_CREATED,
        expect.any(Function),
      );
      expect(redisService.subscribe).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_UPDATED,
        expect.any(Function),
      );
      expect(redisService.subscribe).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_DELETED,
        expect.any(Function),
      );
      expect(httpService.get).toHaveBeenCalledWith(
        'http://localhost:3000/v1/internal/integrations/telegram',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-key' },
        }),
      );
      expect(mockBot.start).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(1);
      expect(service.logger.log).toHaveBeenCalledWith(
        'Telegram Bot Manager initialized with 1 bots',
      );
    });

    it('should handle initialization with no integrations', async () => {
      httpService.get.mockReturnValue(of({ data: [] }) as any);

      await service.initialize();

      expect(service.getActiveCount()).toBe(0);
      expect(service.logger.log).toHaveBeenCalledWith(
        'Telegram Bot Manager initialized with 0 bots',
      );
    });

    it('should handle API errors during initialization', async () => {
      const error = new Error('API Error');
      httpService.get.mockReturnValue(throwError(() => error));

      // fetchActiveIntegrations catches the error and returns [],
      // so initialize completes successfully with 0 bots
      await service.initialize();

      expect(service.logger.error).toHaveBeenCalledWith(
        'Failed to fetch integrations:',
        error,
      );
      expect(service.logger.log).toHaveBeenCalledWith(
        'Telegram Bot Manager initialized with 0 bots',
      );
    });
  });

  describe('shutdown', () => {
    it('should shutdown all bots and clear state', async () => {
      // Setup a bot first
      httpService.get.mockReturnValue(of({ data: [mockIntegration] }) as any);
      mockBot.start.mockResolvedValue(undefined);
      mockBot.stop.mockResolvedValue(undefined);

      await service.initialize();
      expect(service.getActiveCount()).toBe(1);

      await service.shutdown();

      expect(redisService.unsubscribe).toHaveBeenCalledTimes(3);
      expect(mockBot.stop).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
      expect(service.logger.log).toHaveBeenCalledWith(
        'Shutting down Telegram Bot Manager',
      );
    });

    it('should handle shutdown gracefully when no bots exist', async () => {
      await service.shutdown();

      expect(redisService.unsubscribe).not.toHaveBeenCalled();
      expect(mockBot.stop).not.toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('createBotInstance', () => {
    it('should create and start a bot instance', async () => {
      mockBot.start.mockResolvedValue(undefined);

      const instance = await service.createBotInstance(mockIntegration);

      expect(instance.id).toBe('telegram-integration-1');
      expect(instance.orgId).toBe('org-123');
      expect(instance.bot).toBe(mockBot);
      expect(instance.integration).toBe(mockIntegration);

      expect(mockBot.start).toHaveBeenCalled();
      expect(mockBot.use).toHaveBeenCalled(); // Auth middleware
      expect(mockBot.command).toHaveBeenCalledWith(
        'start',
        expect.any(Function),
      );
      expect(mockBot.command).toHaveBeenCalledWith(
        'workflows',
        expect.any(Function),
      );
      expect(mockBot.command).toHaveBeenCalledWith(
        'status',
        expect.any(Function),
      );
      expect(mockBot.command).toHaveBeenCalledWith(
        'cancel',
        expect.any(Function),
      );
      expect(mockBot.command).toHaveBeenCalledWith(
        'settings',
        expect.any(Function),
      );
      expect(mockBot.on).toHaveBeenCalledWith(
        'callback_query:data',
        expect.any(Function),
      );
      expect(mockBot.on).toHaveBeenCalledWith(
        'message:text',
        expect.any(Function),
      );
      expect(mockBot.on).toHaveBeenCalledWith(
        'message:photo',
        expect.any(Function),
      );
      expect(mockBot.catch).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle bot start failures gracefully', async () => {
      const error = new Error('Bot start failed');
      mockBot.start.mockRejectedValue(error);

      // createBotInstance uses void bot.start().catch() (fire-and-forget),
      // so it resolves successfully even if start fails
      const instance = await service.createBotInstance(mockIntegration);

      expect(instance.id).toBe('telegram-integration-1');
      expect(mockBot.start).toHaveBeenCalled();
    });
  });

  describe('destroyBotInstance', () => {
    it('should stop the bot instance', async () => {
      const botInstance = {
        bot: mockBot,
        id: 'test-bot',
        integration: mockIntegration,
        orgId: 'org-123',
      } as any;

      mockBot.stop.mockResolvedValue(undefined);

      await service.destroyBotInstance(botInstance);

      expect(mockBot.stop).toHaveBeenCalled();
    });

    it('should handle bot stop errors gracefully', async () => {
      const botInstance = {
        bot: mockBot,
        id: 'test-bot',
        integration: mockIntegration,
        orgId: 'org-123',
      } as any;

      const error = new Error('Stop failed');
      mockBot.stop.mockRejectedValue(error);

      // Should not throw, just log warning
      await service.destroyBotInstance(botInstance);

      expect(service.logger.error).toHaveBeenCalledWith(
        'Error stopping bot test-bot',
        error,
      );
    });
  });

  describe('addIntegration', () => {
    it('should add a new integration successfully', async () => {
      mockBot.start.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);

      expect(service.getActiveCount()).toBe(1);
      expect(service.logger.log).toHaveBeenCalledWith(
        'Adding integration telegram-integration-1 for org org-123',
      );
    });

    it('should update existing integration when adding duplicate', async () => {
      mockBot.start.mockResolvedValue(undefined);
      mockBot.stop.mockResolvedValue(undefined);

      // Add first time
      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      // Add again (should update)
      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      expect(service.logger.warn).toHaveBeenCalledWith(
        'Integration telegram-integration-1 already exists, updating instead',
      );
      expect(mockBot.stop).toHaveBeenCalled();
      expect(mockBot.start).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateIntegration', () => {
    it('should update an existing integration', async () => {
      mockBot.start.mockResolvedValue(undefined);
      mockBot.stop.mockResolvedValue(undefined);

      // Add integration first
      await service.addIntegration(mockIntegration);

      // Update it
      const updatedIntegration = {
        ...mockIntegration,
        config: { ...mockIntegration.config, defaultWorkflow: 'new-workflow' },
      };

      await service.updateIntegration(updatedIntegration);

      expect(mockBot.stop).toHaveBeenCalled();
      expect(mockBot.start).toHaveBeenCalledTimes(2);
      expect(service.getActiveCount()).toBe(1);
    });
  });

  describe('removeIntegration', () => {
    it('should remove an existing integration', async () => {
      mockBot.start.mockResolvedValue(undefined);
      mockBot.stop.mockResolvedValue(undefined);

      // Add integration first
      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      // Remove it
      await service.removeIntegration(mockIntegration.id);

      expect(mockBot.stop).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
    });

    it('should handle removal of non-existent integration', async () => {
      await service.removeIntegration('non-existent-id');

      expect(service.logger.warn).toHaveBeenCalledWith(
        'Integration non-existent-id not found',
      );
      expect(mockBot.stop).not.toHaveBeenCalled();
    });
  });

  describe('fetchAndAddIntegration', () => {
    it('should fetch integration and add it', async () => {
      mockBot.start.mockResolvedValue(undefined);
      httpService.get.mockReturnValue(of({ data: mockIntegration }) as any);

      await service.fetchAndAddIntegration('test-id');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/internal/integrations/telegram/test-id'),
        expect.any(Object),
      );
      expect(service.getActiveCount()).toBe(1);
    });

    it('should handle fetch errors gracefully', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Fetch failed')),
      );

      await service.fetchAndAddIntegration('test-id');

      expect(service.logger.error).toHaveBeenCalledWith(
        'Failed to fetch and add integration test-id:',
        expect.any(Error),
      );
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('fetchAndUpdateIntegration', () => {
    it('should fetch integration and update it', async () => {
      mockBot.start.mockResolvedValue(undefined);
      mockBot.stop.mockResolvedValue(undefined);

      // Add initial integration
      await service.addIntegration(mockIntegration);

      httpService.get.mockReturnValue(of({ data: mockIntegration }) as any);

      await service.fetchAndUpdateIntegration('test-id');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/internal/integrations/telegram/test-id'),
        expect.any(Object),
      );
    });

    it('should handle fetch errors gracefully', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Fetch failed')),
      );

      await service.fetchAndUpdateIntegration('test-id');

      expect(service.logger.error).toHaveBeenCalledWith(
        'Failed to fetch and update integration test-id:',
        expect.any(Error),
      );
    });
  });

  describe('fetchActiveIntegrations', () => {
    it('should fetch integrations from API', async () => {
      const mockIntegrations = [mockIntegration];
      httpService.get.mockReturnValue(of({ data: mockIntegrations }) as any);

      const result = await service.fetchActiveIntegrations();

      expect(httpService.get).toHaveBeenCalledWith(
        'http://localhost:3000/v1/internal/integrations/telegram',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-key' },
        }),
      );
      expect(result).toEqual(mockIntegrations);
    });

    it('should handle API errors', async () => {
      const error = new Error('Fetch error');
      httpService.get.mockReturnValue(throwError(() => error));

      const result = await service.fetchActiveIntegrations();

      expect(service.logger.error).toHaveBeenCalledWith(
        'Failed to fetch integrations:',
        error,
      );
      expect(result).toEqual([]);
    });
  });

  describe('fetchOrgWorkflows', () => {
    it('should fetch workflows for an organization', async () => {
      const mockWorkflows = [
        {
          description: 'Generate images',
          id: 'wf-1',
          name: 'Image Generation',
        },
        {
          description: 'Generate videos',
          id: 'wf-2',
          name: 'Video Generation',
        },
      ];

      httpService.get.mockReturnValue(of({ data: mockWorkflows }) as any);

      const result = await service.fetchOrgWorkflows('org-123');

      expect(httpService.get).toHaveBeenCalledWith(
        'http://localhost:3000/v1/orgs/org-123/workflows',
      );
      expect(result).toEqual(mockWorkflows);
    });

    it('should handle workflow fetch errors', async () => {
      const error = new Error('Workflows fetch error');
      httpService.get.mockReturnValue(throwError(() => error));

      const result = await service.fetchOrgWorkflows('org-123');

      expect(service.logger.error).toHaveBeenCalledWith(
        'Failed to fetch workflows:',
        error,
      );
      expect(result).toEqual([]);
    });
  });

  describe('Redis hot reload', () => {
    it('should hot-add integration for telegram platform events', async () => {
      const handlers = new Map<string, (message: unknown) => void>();

      redisService.subscribe.mockImplementation(
        (channel: string, handler?: (message: unknown) => void) => {
          if (handler) {
            handlers.set(channel, handler);
          }
        },
      );

      httpService.get.mockImplementation((url: string) => {
        if (url.endsWith('/v1/internal/integrations/telegram')) {
          return of({ data: [] }) as any;
        }

        if (
          url.endsWith(
            '/v1/internal/integrations/telegram/telegram-integration-1',
          )
        ) {
          return of({ data: mockIntegration }) as any;
        }

        return of({ data: [] }) as any;
      });

      mockBot.start.mockResolvedValue(undefined);

      await service.initialize();

      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        integrationId: 'telegram-integration-1',
        orgId: 'org-123',
        platform: 'telegram',
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(service.getActiveCount()).toBe(1);
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining(
          '/v1/internal/integrations/telegram/telegram-integration-1',
        ),
        expect.any(Object),
      );
    });

    it('should ignore Redis events for other platforms', async () => {
      const handlers = new Map<string, (message: unknown) => void>();

      redisService.subscribe.mockImplementation(
        (channel: string, handler?: (message: unknown) => void) => {
          if (handler) {
            handlers.set(channel, handler);
          }
        },
      );

      httpService.get.mockReturnValue(of({ data: [] }) as any);
      mockBot.start.mockResolvedValue(undefined);

      await service.initialize();

      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        integrationId: 'discord-integration-1',
        orgId: 'org-999',
        platform: 'discord',
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(service.getActiveCount()).toBe(0);
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('end-to-end integration flow', () => {
    const createContext = (overrides: Record<string, unknown> = {}) =>
      ({
        answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
        api: {
          editMessageText: vi.fn().mockResolvedValue(undefined),
        },
        callbackQuery: undefined,
        chat: { id: 4242 },
        from: { id: 1111, username: 'tester' },
        message: undefined,
        reply: vi.fn().mockResolvedValue({ message_id: 99 }),
        replyWithPhoto: vi.fn().mockResolvedValue(undefined),
        replyWithVideo: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      }) as any;

    it('should process hot-add to workflow execution and send generated media', async () => {
      const handlers = new Map<string, (message: unknown) => void>();

      redisService.subscribe.mockImplementation(
        (channel: string, handler?: (message: unknown) => void) => {
          if (handler) {
            handlers.set(channel, handler);
          }
        },
      );

      const integrationFromApi = {
        _id: 'telegram-integration-1',
        botToken: 'bot-token-123',
        config: {},
        createdAt: new Date('2024-01-01').toISOString(),
        organization: 'org-123',
        platform: 'telegram',
        status: 'active',
        updatedAt: new Date('2024-01-01').toISOString(),
      };

      const workflowDefinition = {
        description: 'Generate media from prompt',
        id: 'wf-1',
        name: 'Generator',
        nodes: {
          promptNode: {
            data: {
              inputType: 'text',
              label: 'Prompt',
              required: true,
            },
            type: 'input',
          },
        },
      };

      httpService.get.mockImplementation((url: string) => {
        if (url.endsWith('/v1/internal/integrations/telegram')) {
          return of({ data: [] }) as any;
        }

        if (
          url.endsWith(
            '/v1/internal/integrations/telegram/telegram-integration-1',
          )
        ) {
          return of({ data: integrationFromApi }) as any;
        }

        if (url.endsWith('/v1/orgs/org-123/workflows')) {
          return of({ data: [workflowDefinition] }) as any;
        }

        if (url.endsWith('/v1/orgs/org-123/workflows/wf-1')) {
          return of({ data: workflowDefinition }) as any;
        }

        return of({ data: [] }) as any;
      });

      httpService.post.mockImplementation((url: string) => {
        if (url.endsWith('/v1/internal/orgs/org-123/workflow-executions')) {
          return of({
            data: {
              data: {
                attributes: {
                  nodeResults: [],
                  status: 'running',
                },
                id: 'exec-123',
              },
            },
          }) as any;
        }

        return throwError(() => new Error(`Unexpected URL: ${url}`));
      });
      httpService.get.mockImplementation((url: string) => {
        if (url.endsWith('/v1/internal/integrations/telegram')) {
          return of({ data: [] }) as any;
        }

        if (
          url.endsWith(
            '/v1/internal/integrations/telegram/telegram-integration-1',
          )
        ) {
          return of({ data: integrationFromApi }) as any;
        }

        if (url.endsWith('/v1/orgs/org-123/workflows')) {
          return of({ data: [workflowDefinition] }) as any;
        }

        if (url.endsWith('/v1/orgs/org-123/workflows/wf-1')) {
          return of({ data: workflowDefinition }) as any;
        }

        if (
          url.endsWith('/v1/internal/orgs/org-123/workflow-executions/exec-123')
        ) {
          return of({
            data: {
              data: {
                attributes: {
                  nodeResults: [
                    {
                      output: {
                        caption: 'Generated image',
                        imageUrl: 'https://cdn.genfeed.ai/generated/image.png',
                      },
                      status: 'completed',
                    },
                  ],
                  status: 'completed',
                },
                id: 'exec-123',
              },
            },
          }) as any;
        }

        return of({ data: [] }) as any;
      });
      mockBot.start.mockResolvedValue(undefined);

      await service.initialize();

      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        integrationId: 'telegram-integration-1',
        orgId: 'org-123',
        platform: 'telegram',
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      const workflowsCommandHandler = mockBot.command.mock.calls.find(
        ([command]) => command === 'workflows',
      )?.[1];
      const textMessageHandler = mockBot.on.mock.calls.find(
        ([event]) => event === 'message:text',
      )?.[1];

      expect(workflowsCommandHandler).toBeTypeOf('function');
      expect(textMessageHandler).toBeTypeOf('function');

      const workflowsCtx = createContext();
      await workflowsCommandHandler?.(workflowsCtx);

      const selectWorkflowCtx = createContext({
        callbackQuery: { data: 'wf:wf-1' },
      });
      await service.selectWorkflow(
        selectWorkflowCtx,
        '4242',
        'org-123',
        'wf-1',
      );

      const promptInputCtx = createContext({
        message: { text: 'cinematic city skyline at dusk' },
      });
      await textMessageHandler?.(promptInputCtx);

      const runWorkflowCtx = createContext({
        callbackQuery: { data: 'confirm:run' },
      });

      await service.handleRun(runWorkflowCtx, '4242', 'org-123');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:3000/v1/internal/orgs/org-123/workflow-executions',
        {
          inputValues: {
            promptNode: 'cinematic city skyline at dusk',
          },
          metadata: undefined,
          workflow: 'wf-1',
        },
        {
          headers: { Authorization: 'Bearer test-key' },
        },
      );
      expect(runWorkflowCtx.replyWithPhoto).toHaveBeenCalledWith(
        'https://cdn.genfeed.ai/generated/image.png',
        {
          caption: 'Generated image',
        },
      );
    });
  });

  describe('Session management', () => {
    it('should manage sessions correctly', () => {
      const chatId = '123456789';
      const session = {
        collectedInputs: new Map(),
        currentInputIndex: 0,
        orgId: 'org-123',
        requiredInputs: [],
        startedAt: Date.now(),
        state: 'selecting' as const,
      };

      // Initially no session
      expect(service.getSession(chatId)).toBeUndefined();

      // Set session
      service.setSession(chatId, session);
      expect(service.getSession(chatId)).toEqual(session);

      // Delete session
      service.deleteSession(chatId);
      expect(service.getSession(chatId)).toBeUndefined();
    });
  });

  describe('formatDuration', () => {
    it('should format duration correctly', () => {
      expect(service.formatDuration(1000)).toBe('1s');
      expect(service.formatDuration(65000)).toBe('1m 5s');
      expect(service.formatDuration(3665000)).toBe('1h 1m');
      expect(service.formatDuration(500)).toBe('0s');
    });
  });
});
