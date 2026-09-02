import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Bot } from 'grammy';

// Mock grammy
vi.mock('grammy', () => ({
  Bot: vi.fn().mockImplementation(function Bot() {
    return {
      command: vi.fn(),
      handleUpdate: vi.fn(),
      on: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      token: 'test-token',
      use: vi.fn(),
    };
  }),
  InlineKeyboard: vi.fn().mockImplementation(() => ({
    row: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
  })),
  InputFile: vi.fn(),
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
  let mockSystemWorkflowRunner: {
    registerWorkflow: ReturnType<typeof vi.fn>;
    runWorkflow: ReturnType<typeof vi.fn>;
  };
  let mockPrisma: { brand: { findFirst: ReturnType<typeof vi.fn> } };

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

    mockSystemWorkflowRunner = {
      registerWorkflow: vi.fn(),
      runWorkflow: vi.fn(),
    };
    mockPrisma = { brand: { findFirst: vi.fn() } };

    service = new TelegramBotService(
      mockConfigService,
      mockLoggerService,
      mockSystemWorkflowRunner as unknown as SystemWorkflowRunnerService,
      mockPrisma as unknown as PrismaService,
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
        allowedUsers: 0,
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

      await service.onModuleInit();

      expect(service.getStatus().workflowsLoaded).toBe(0);
      expect(Bot).not.toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'TelegramBotService: polling disabled for local development',
      );
    });

    it('registers audio and video workflow input handlers', async () => {
      await service.onModuleInit();

      expect(mockSystemWorkflowRunner.registerWorkflow).toHaveBeenCalled();

      const botInstance = vi.mocked(Bot).mock.results.at(-1)?.value as
        | { on: ReturnType<typeof vi.fn> }
        | undefined;

      expect(botInstance?.on).toHaveBeenCalledWith(
        'message:audio',
        expect.any(Function),
      );
      expect(botInstance?.on).toHaveBeenCalledWith(
        'message:voice',
        expect.any(Function),
      );
      expect(botInstance?.on).toHaveBeenCalledWith(
        'message:video',
        expect.any(Function),
      );
      expect(botInstance?.on).toHaveBeenCalledWith(
        'message:document',
        expect.any(Function),
      );
    });
  });
});
