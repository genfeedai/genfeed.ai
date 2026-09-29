import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/integrations', () => ({
  BaseBotManager: class {
    protected readonly logger: unknown;
    protected bots = new Map();
    constructor(logger: unknown) {
      this.logger = logger;
    }
    protected sanitizeErrorForLog(error: unknown) {
      return {
        message: error instanceof Error ? error.message : String(error),
      };
    }
    protected getActiveCount() {
      return this.bots.size;
    }
    protected async addIntegration(_: unknown) {}
    protected async updateIntegration(_: unknown) {}
    protected async removeIntegration(_: unknown) {}
    protected async handleRedisEvent(
      _event: unknown,
      _data: unknown,
    ): Promise<void> {}
  },
  BotInternalApiClient: class {
    fetchActiveIntegrations = vi.fn().mockResolvedValue([]);
    fetchIntegration = vi.fn().mockResolvedValue(null);
    fetchOrgWorkflows = vi.fn().mockResolvedValue([]);
    fetchWorkflow = vi.fn().mockResolvedValue(null);
  },
  IMAGE_MODELS: ['flux-pro', 'sdxl'],
  IntegrationEvent: {},
  OrgIntegration: {},
  REDIS_EVENTS: {
    INTEGRATION_CREATED: 'integration:created',
    INTEGRATION_DELETED: 'integration:deleted',
    INTEGRATION_UPDATED: 'integration:updated',
  },
  UserSettings: {},
  VIDEO_MODELS: ['runway', 'kling'],
  WorkflowDefinition: {},
  WorkflowInput: {},
  WorkflowSession: {},
  extractWorkflowExecutionSnapshot: vi.fn(),
  extractWorkflowInputs: vi.fn().mockReturnValue([]),
  extractWorkflowOutputsFromExecution: vi.fn().mockReturnValue([]),
  isBotOpenToAllUsers: vi.fn(
    (config: { allowedUserIds?: string[]; isOpenToAllUsers?: boolean }) =>
      (config.allowedUserIds?.length ?? 0) === 0 &&
      config.isOpenToAllUsers === true,
  ),
  isBotUserAuthorized: vi.fn(
    (
      config: {
        allowedUserIds?: string[];
        isOpenToAllUsers?: boolean;
      },
      userId?: string | null,
    ) => {
      const normalizedUserId = userId?.trim();
      if (!normalizedUserId) return false;
      const allowedUserIds = config.allowedUserIds ?? [];
      return allowedUserIds.length > 0
        ? allowedUserIds.includes(normalizedUserId)
        : config.isOpenToAllUsers === true;
    },
  ),
  isWorkflowExecutionTerminalStatus: vi.fn().mockReturnValue(false),
}));

vi.mock('@slack/bolt', () => ({
  App: class MockSlackApp {
    action = vi.fn();
    command = vi.fn();
    event = vi.fn();
    message = vi.fn();
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    use = vi.fn();
  },
}));

vi.mock('rxjs', () => ({
  firstValueFrom: vi.fn(),
}));

import type { OrgIntegration } from '@genfeedai/integrations';
import { LoggerService } from '@libs/logger/logger.service';
import { SlackBotManager } from '@slack/services/slack-bot-manager.service';
import { firstValueFrom } from 'rxjs';

const mockFirstValueFrom = vi.mocked(firstValueFrom);

describe('SlackBotManager', () => {
  let service: SlackBotManager;
  let mockConfigService: { API_URL: string; API_KEY: string };
  let mockHttpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let mockRedisService: {
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };
  let mockLoggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const makeIntegration = (
    overrides: Partial<OrgIntegration> = {},
  ): OrgIntegration => ({
    botToken: 'mock-test-bot-token',
    config: { allowedUserIds: [], appToken: 'mock-test-app-token' },
    createdAt: new Date(),
    id: 'integration-1',
    orgId: 'org-1',
    platform: 'SLACK' as const,
    status: 'ACTIVE' as const,
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    mockConfigService = {
      API_KEY: 'test-api-key',
      API_URL: 'http://localhost:3010',
    };

    mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    mockRedisService = {
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };
    mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new SlackBotManager(
      mockConfigService as unknown as ConstructorParameters<
        typeof SlackBotManager
      >[0],
      mockHttpService as unknown as ConstructorParameters<
        typeof SlackBotManager
      >[1],
      mockRedisService as unknown as ConstructorParameters<
        typeof SlackBotManager
      >[2],
      mockLoggerService as unknown as LoggerService,
    );
  });

  describe('initialize', () => {
    it('should not resubscribe to Redis on second initialize call', async () => {
      mockFirstValueFrom.mockResolvedValue({ data: [] });

      await service.initialize();
      await service.initialize();

      // Should only subscribe 3 times (not 6) due to redisSubscribed flag
      expect(mockRedisService.subscribe).toHaveBeenCalledTimes(3);
    });
  });

  describe('shutdown', () => {
    it('should clear sessions and userSettings maps', async () => {
      mockFirstValueFrom.mockResolvedValue({ data: [] });
      await service.initialize();

      await service.shutdown();

      expect(service['sessions'].size).toBe(0);
      expect(service['userSettings'].size).toBe(0);
    });
  });

  describe('createBotInstance', () => {
    it('should create and start a Slack App instance', async () => {
      const integration = makeIntegration();

      const botInstance = await service.createBotInstance(integration);

      expect(botInstance.id).toBe('integration-1');
      expect(botInstance.orgId).toBe('org-1');
      expect(botInstance.app.start).toHaveBeenCalled();
    });
  });

  describe('lifecycle hooks', () => {
    it('onModuleInit should call initialize', async () => {
      const initSpy = vi.spyOn(service, 'initialize').mockResolvedValue();

      await service.onModuleInit();

      expect(initSpy).toHaveBeenCalled();
    });

    it('onModuleDestroy should call shutdown', async () => {
      const shutdownSpy = vi.spyOn(service, 'shutdown').mockResolvedValue();

      await service.onModuleDestroy();

      expect(shutdownSpy).toHaveBeenCalled();
    });
  });
});
