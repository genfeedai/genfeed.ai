import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('grammy', () => {
  const mockBot = {
    catch: vi.fn(),
    command: vi.fn(),
    on: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    use: vi.fn(),
  };
  return {
    Bot: vi.fn(function () {
      return mockBot;
    }),
    InlineKeyboard: vi.fn().mockImplementation(() => ({
      row: vi.fn().mockReturnThis(),
      text: vi.fn().mockReturnThis(),
    })),
  };
});

vi.mock('rxjs', () => ({
  firstValueFrom: vi.fn(),
}));

vi.mock('@genfeedai/enums', () => ({
  ParseMode: { MARKDOWN: 'Markdown' },
}));

vi.mock('@genfeedai/integrations', () => ({
  BaseBotManager: class {
    protected readonly logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    protected readonly bots = new Map();
    getActiveCount() {
      return this.bots.size;
    }
    async addIntegration(integration: Record<string, unknown>) {
      const instance = await (
        this as Record<string, unknown> & {
          createBotInstance: (i: Record<string, unknown>) => Promise<unknown>;
        }
      ).createBotInstance(integration);
      this.bots.set(integration.id, instance);
    }
    async updateIntegration(integration: Record<string, unknown>) {
      await this.addIntegration(integration);
    }
    async removeIntegration(id: string) {
      const bot = this.bots.get(id);
      if (bot) {
        await (
          this as Record<string, unknown> & {
            destroyBotInstance: (b: unknown) => Promise<void>;
          }
        ).destroyBotInstance(bot);
        this.bots.delete(id);
      }
    }
    async handleRedisEvent() {}
  },
  IMAGE_MODELS: ['flux-pro', 'sdxl'],
  REDIS_EVENTS: {
    INTEGRATION_CREATED: 'integration:created',
    INTEGRATION_DELETED: 'integration:deleted',
    INTEGRATION_UPDATED: 'integration:updated',
  },
  VIDEO_MODELS: ['kling', 'runway'],
}));

import { firstValueFrom } from 'rxjs';
import { TelegramBotManager } from './telegram-bot-manager.service';

const mockConfigService = {
  API_KEY: 'test-key',
  API_URL: 'http://localhost:3001',
};

const mockHttpService = {
  get: vi.fn(),
  post: vi.fn(),
};

const mockRedisService = {
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
};

function createManager(): TelegramBotManager {
  return new (
    TelegramBotManager as unknown as new (
      ...args: unknown[]
    ) => TelegramBotManager
  )(mockConfigService, mockHttpService, mockRedisService);
}

const mockIntegration = {
  botToken: 'test-token',
  config: { allowedUserIds: [] },
  createdAt: new Date(),
  id: 'int-1',
  orgId: 'org-1',
  platform: 'telegram' as const,
  status: 'active' as const,
  updatedAt: new Date(),
};

describe('TelegramBotManager', () => {
  let manager: TelegramBotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    (firstValueFrom as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
    });
    manager = createManager();
  });

  it('should be defined', () => {
    expect(manager).toBeDefined();
  });

  it('should initialize and subscribe to redis events', async () => {
    await manager.initialize();
    expect(mockRedisService.subscribe).toHaveBeenCalled();
  });

  it('should return 0 active bots initially', () => {
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should create a bot instance with grammy Bot', async () => {
    const instance = await manager.createBotInstance(mockIntegration as never);
    expect(instance).toHaveProperty('bot');
    expect(instance).toHaveProperty('id', 'int-1');
    expect(instance).toHaveProperty('orgId', 'org-1');
  });

  it('should destroy bot instance without throwing', async () => {
    const instance = await manager.createBotInstance(mockIntegration as never);
    await expect(
      manager.destroyBotInstance(instance as never),
    ).resolves.not.toThrow();
  });

  it('should shutdown and clear bots', async () => {
    await manager.shutdown();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should handle empty integrations from API', async () => {
    (firstValueFrom as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
    });
    await manager.initialize();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should handle API failure during fetchActiveIntegrations', async () => {
    (firstValueFrom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network error'),
    );
    await manager.initialize();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should unsubscribe from redis on shutdown', async () => {
    await manager.initialize();
    await manager.shutdown();
    expect(mockRedisService.unsubscribe).toHaveBeenCalled();
  });
});
