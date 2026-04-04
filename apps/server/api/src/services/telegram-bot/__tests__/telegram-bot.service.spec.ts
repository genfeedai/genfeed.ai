import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';

// Mock grammy
vi.mock('grammy', () => ({
  Bot: vi.fn().mockImplementation(() => ({
    command: vi.fn(),
    handleUpdate: vi.fn(),
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    token: 'test-token',
    use: vi.fn(),
  })),
  InlineKeyboard: vi.fn().mockImplementation(() => ({
    row: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
  })),
  InputFile: vi.fn(),
}));

// Mock workflow engine
vi.mock('@genfeedai/workflow-engine', () => ({
  createWorkflowEngine: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({
      completedAt: new Date(),
      nodeResults: new Map(),
      runId: 'test-run',
      startedAt: new Date(),
      status: 'completed',
      totalCreditsUsed: 0,
      workflowId: 'test',
    }),
    registerExecutor: vi.fn(),
  }),
  WorkflowEngine: vi.fn(),
}));

describe('TelegramBotService', () => {
  let service: TelegramBotService;
  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
    isDevTelegramPollingEnabled: boolean;
  };
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockReplicateService: {
    runModel: ReturnType<typeof vi.fn>;
    getPrediction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          TELEGRAM_ALLOWED_USER_IDS: '123,456',
          TELEGRAM_BOT_MODE: 'polling',
          TELEGRAM_BOT_TOKEN: 'test-token-123',
        };
        return config[key];
      }),
      isDevTelegramPollingEnabled: true,
    };

    mockLoggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockReplicateService = {
      getPrediction: vi.fn().mockResolvedValue({
        output: 'https://example.com/output.png',
        status: 'succeeded',
      }),
      runModel: vi.fn().mockResolvedValue('pred-123'),
    };

    service = new TelegramBotService(
      mockConfigService,
      mockLoggerService,
      mockReplicateService,
    );
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('getStatus', () => {
    it('should return bot status', () => {
      const status = service.getStatus();
      expect(status).toEqual({
        activeConversations: 0,
        allowedUsers: 'all',
        connectedChats: 0,
        engineReady: false,
        hasDefaultContext: false,
        running: false,
        workflowsLoaded: 0,
      });
    });
  });

  describe('getWorkflows', () => {
    it('should return empty map initially', () => {
      const workflows = service.getWorkflows();
      expect(workflows.size).toBe(0);
    });
  });

  describe('onModuleInit', () => {
    it('should skip initialization when no token is set', async () => {
      mockConfigService.get = vi.fn(() => undefined);
      await service.onModuleInit();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('TELEGRAM_BOT_TOKEN not set'),
      );
    });

    it('should skip heavy initialization when local dev polling is disabled', async () => {
      mockConfigService.isDevTelegramPollingEnabled = false;
      mockConfigService.get = vi.fn((key: string) => {
        const config: Record<string, string> = {
          TELEGRAM_BOT_MODE: 'polling',
          TELEGRAM_BOT_TOKEN: 'test-token-123',
        };
        return config[key];
      });

      const loadWorkflowsSpy = vi.spyOn(service as any, 'loadWorkflows');
      const initializeEngineSpy = vi.spyOn(service as any, 'initializeEngine');
      const startPollingSpy = vi.spyOn(service as any, 'startPolling');

      await service.onModuleInit();

      expect(loadWorkflowsSpy).not.toHaveBeenCalled();
      expect(initializeEngineSpy).not.toHaveBeenCalled();
      expect(startPollingSpy).not.toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'TelegramBotService: polling disabled for local development',
      );
    });
  });

  describe('imageGen fal routing', () => {
    it('should fail fast when fal model is selected but fal is not configured', async () => {
      (service as any).initializeEngine();

      const engine = (service as any).engine as {
        registerExecutor: ReturnType<typeof vi.fn>;
      };
      const imageGenExecutor = engine.registerExecutor.mock.calls.find(
        ([name]) => name === 'imageGen',
      )?.[1] as
        | ((
            node: { id: string; config: Record<string, unknown> },
            inputs: Map<string, unknown>,
            ctx: unknown,
          ) => Promise<unknown>)
        | undefined;

      expect(imageGenExecutor).toBeDefined();

      await expect(
        imageGenExecutor?.(
          { config: { model: 'fal-flux-dev' }, id: 'node-1' },
          new Map<string, unknown>(),
          {},
        ),
      ).rejects.toThrow('fal.ai is not configured');

      expect(mockReplicateService.runModel).not.toHaveBeenCalled();
    });
  });
});
