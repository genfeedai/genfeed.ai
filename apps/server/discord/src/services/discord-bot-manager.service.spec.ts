import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('discord.js', () => {
  const mockClient = {
    channels: { fetch: vi.fn() },
    destroy: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue('token'),
    on: vi.fn(),
    once: vi.fn(),
  };
  return {
    ActionRowBuilder: vi.fn().mockImplementation(() => ({
      addComponents: vi.fn().mockReturnThis(),
    })),
    BaseGuildTextChannel: class BaseGuildTextChannel {},
    ButtonBuilder: vi.fn().mockImplementation(() => ({
      setCustomId: vi.fn().mockReturnThis(),
      setLabel: vi.fn().mockReturnThis(),
      setStyle: vi.fn().mockReturnThis(),
    })),
    ButtonStyle: { Danger: 4, Primary: 1, Secondary: 2, Success: 3 },
    Client: vi.fn().mockImplementation(() => mockClient),
    Events: { ClientReady: 'ready' },
    GatewayIntentBits: {
      DirectMessages: 8,
      GuildMessages: 2,
      Guilds: 1,
      MessageContent: 4,
    },
    REST: vi.fn().mockImplementation(() => ({
      put: vi.fn().mockResolvedValue(undefined),
      setToken: vi.fn().mockReturnThis(),
    })),
    Routes: { applicationCommands: vi.fn().mockReturnValue('/commands') },
    SlashCommandBuilder: vi.fn().mockImplementation(() => ({
      setDescription: vi.fn().mockReturnThis(),
      setName: vi.fn().mockReturnThis(),
      toJSON: vi.fn().mockReturnValue({}),
    })),
  };
});

vi.mock('rxjs', () => ({
  firstValueFrom: vi.fn(),
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
    DISCORD_SEND_TO_CHANNEL: 'discord:send-to-channel',
    INTEGRATION_CREATED: 'integration:created',
    INTEGRATION_DELETED: 'integration:deleted',
    INTEGRATION_UPDATED: 'integration:updated',
  },
  VIDEO_MODELS: ['kling', 'runway'],
}));

import { firstValueFrom } from 'rxjs';
import { DiscordBotManager } from './discord-bot-manager.service';

const mockConfigService = {
  API_KEY: 'test-key',
  API_URL: 'http://localhost:3010',
};

const mockHttpService = {
  get: vi.fn(),
  post: vi.fn(),
};

const mockRedisService = {
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
};

function createManager(): DiscordBotManager {
  return new (
    DiscordBotManager as unknown as new (
      ...args: unknown[]
    ) => DiscordBotManager
  )(mockConfigService, mockHttpService, mockRedisService);
}

const mockIntegration = {
  botToken: 'test-token',
  config: { allowedUserIds: [] },
  createdAt: new Date(),
  id: 'int-1',
  orgId: 'org-1',
  platform: 'discord' as const,
  status: 'active' as const,
  updatedAt: new Date(),
};

describe('DiscordBotManager', () => {
  let manager: DiscordBotManager;

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

  it('should fetch active integrations during init', async () => {
    (firstValueFrom as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
    });
    await manager.initialize();
    expect(firstValueFrom).toHaveBeenCalled();
  });

  it('should return 0 active bots initially', () => {
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should create a bot instance with discord client', async () => {
    const instance = await manager.createBotInstance(mockIntegration);
    expect(instance).toHaveProperty('client');
    expect(instance).toHaveProperty('id', 'int-1');
    expect(instance).toHaveProperty('orgId', 'org-1');
  });

  it('should destroy bot instance without throwing', async () => {
    const instance = await manager.createBotInstance(mockIntegration);
    await expect(manager.destroyBotInstance(instance)).resolves.not.toThrow();
  });

  it('should shutdown and clear bots', async () => {
    await manager.shutdown();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should handle empty integrations array from API', async () => {
    (firstValueFrom as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
    });
    await manager.initialize();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should handle API failure during fetchActiveIntegrations gracefully', async () => {
    (firstValueFrom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ECONNREFUSED'),
    );
    await manager.initialize();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should sendToChannel return null when no bot found', async () => {
    const result = await manager.sendToChannel('unknown-org', 'ch-1', 'hello');
    expect(result).toBeNull();
  });
});
