import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/integrations', () => ({
  BaseBotManager: class {
    protected readonly logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    protected bots = new Map();
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
  WorkflowInput: {},
  WorkflowSession: {},
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

  const makeIntegration = (overrides: Record<string, unknown> = {}) => ({
    botToken: 'mock-test-bot-token',
    config: { allowedUserIds: [], appToken: 'mock-test-app-token' },
    createdAt: new Date(),
    id: 'integration-1',
    orgId: 'org-1',
    platform: 'slack' as const,
    status: 'active' as const,
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

    service = new SlackBotManager(
      mockConfigService as any,
      mockHttpService as any,
      mockRedisService as any,
    );
  });

  describe('initialize', () => {
    it('should subscribe to Redis integration events', async () => {
      mockFirstValueFrom.mockResolvedValue({ data: [] } as any);

      await service.initialize();

      expect(mockRedisService.subscribe).toHaveBeenCalledTimes(3);
    });

    it('should log initialization message', async () => {
      mockFirstValueFrom.mockResolvedValue({ data: [] } as any);

      await service.initialize();

      expect((service as any).logger.log).toHaveBeenCalledWith(
        'Initializing Slack Bot Manager',
      );
    });

    it('should handle API errors gracefully without throwing', async () => {
      mockFirstValueFrom.mockRejectedValue(new Error('ECONNREFUSED'));

      // Should not throw — error is caught and logged internally
      await expect(service.initialize()).resolves.toBeUndefined();
    });

    it('should not resubscribe to Redis on second initialize call', async () => {
      mockFirstValueFrom.mockResolvedValue({ data: [] } as any);

      await service.initialize();
      await service.initialize();

      // Should only subscribe 3 times (not 6) due to redisSubscribed flag
      expect(mockRedisService.subscribe).toHaveBeenCalledTimes(3);
    });
  });

  describe('shutdown', () => {
    it('should unsubscribe from Redis events', async () => {
      mockFirstValueFrom.mockResolvedValue({ data: [] } as any);
      await service.initialize();

      await service.shutdown();

      expect(mockRedisService.unsubscribe).toHaveBeenCalledTimes(3);
    });

    it('should clear sessions and userSettings maps', async () => {
      mockFirstValueFrom.mockResolvedValue({ data: [] } as any);
      await service.initialize();

      await service.shutdown();

      expect((service as any).sessions.size).toBe(0);
      expect((service as any).userSettings.size).toBe(0);
    });

    it('should log shutdown message', async () => {
      await service.shutdown();

      expect((service as any).logger.log).toHaveBeenCalledWith(
        'Shutting down Slack Bot Manager',
      );
    });
  });

  describe('createBotInstance', () => {
    it('should create and start a Slack App instance', async () => {
      const integration = makeIntegration();

      const botInstance = await service.createBotInstance(integration as any);

      expect(botInstance.id).toBe('integration-1');
      expect(botInstance.orgId).toBe('org-1');
      expect(botInstance.app.start).toHaveBeenCalled();
    });

    it('should return bot instance with correct integration reference', async () => {
      const integration = makeIntegration({ id: 'my-integration' });

      const botInstance = await service.createBotInstance(integration as any);

      expect(botInstance.integration).toBe(integration);
    });
  });

  describe('destroyBotInstance', () => {
    it('should call stop on the Slack App', async () => {
      const integration = makeIntegration();
      const botInstance = await service.createBotInstance(integration as any);

      await service.destroyBotInstance(botInstance as any);

      expect(botInstance.app.stop).toHaveBeenCalled();
    });

    it('should handle stop errors gracefully', async () => {
      const integration = makeIntegration();
      const botInstance = await service.createBotInstance(integration as any);
      botInstance.app.stop = vi
        .fn()
        .mockRejectedValue(new Error('Stop failed'));

      await expect(
        service.destroyBotInstance(botInstance as any),
      ).resolves.toBeUndefined();

      expect((service as any).logger.error).toHaveBeenCalled();
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
