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
    // vitest v4 cannot `new` a vi.fn() whose implementation is an arrow
    // function (arrows have no [[Construct]]). Use normal function expressions
    // so the mocked discord.js classes are constructable — mirrors the pattern
    // in __tests__/discord-bot-manager.service.spec.ts.
    ActionRowBuilder: vi.fn(function () {
      return { addComponents: vi.fn().mockReturnThis() };
    }),
    BaseGuildTextChannel: class BaseGuildTextChannel {},
    ButtonBuilder: vi.fn(function () {
      return {
        setCustomId: vi.fn().mockReturnThis(),
        setLabel: vi.fn().mockReturnThis(),
        setStyle: vi.fn().mockReturnThis(),
      };
    }),
    ButtonStyle: { Danger: 4, Primary: 1, Secondary: 2, Success: 3 },
    Client: vi.fn(function () {
      return mockClient;
    }),
    Events: { ClientReady: 'ready' },
    GatewayIntentBits: {
      DirectMessages: 8,
      GuildMessages: 2,
      Guilds: 1,
      MessageContent: 4,
    },
    REST: vi.fn(function () {
      return {
        put: vi.fn().mockResolvedValue(undefined),
        setToken: vi.fn().mockReturnThis(),
      };
    }),
    Routes: { applicationCommands: vi.fn().mockReturnValue('/commands') },
    SlashCommandBuilder: vi.fn(function () {
      return {
        setDescription: vi.fn().mockReturnThis(),
        setName: vi.fn().mockReturnThis(),
        toJSON: vi.fn().mockReturnValue({}),
      };
    }),
  };
});

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
  BotInternalApiClient: class {
    fetchActiveIntegrations = vi.fn().mockResolvedValue([]);
    fetchIntegration = vi.fn().mockResolvedValue(null);
    fetchOrgWorkflows = vi.fn().mockResolvedValue([]);
    fetchWorkflow = vi.fn().mockResolvedValue(null);
  },
  IMAGE_MODELS: ['flux-pro', 'sdxl'],
  REDIS_EVENTS: {
    DISCORD_SEND_TO_CHANNEL: 'discord:send-to-channel',
    INTEGRATION_CREATED: 'integration:created',
    INTEGRATION_DELETED: 'integration:deleted',
    INTEGRATION_UPDATED: 'integration:updated',
  },
  VIDEO_MODELS: ['kling', 'runway'],
  WorkflowDefinition: {},
  extractWorkflowExecutionSnapshot: vi.fn(),
  extractWorkflowInputs: vi.fn().mockReturnValue([]),
  extractWorkflowOutputsFromExecution: vi.fn().mockReturnValue([]),
  isWorkflowExecutionTerminalStatus: vi.fn().mockReturnValue(false),
}));

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
    await manager.initialize();
    expect(mockRedisService.subscribe).toHaveBeenCalled();
    expect(manager.getActiveCount()).toBe(0);
    expect(
      (
        manager as unknown as Record<string, unknown> & {
          internalApiClient: {
            fetchActiveIntegrations: ReturnType<typeof vi.fn>;
          };
        }
      ).internalApiClient.fetchActiveIntegrations,
    ).toHaveBeenCalled();
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
    (
      manager as unknown as Record<string, unknown> & {
        internalApiClient: {
          fetchActiveIntegrations: ReturnType<typeof vi.fn>;
        };
      }
    ).internalApiClient.fetchActiveIntegrations.mockResolvedValue([]);
    await manager.initialize();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should log and rethrow when fetchActiveIntegrations fails during init', async () => {
    // BotInternalApiClient.fetchActiveIntegrations propagates transport errors
    // (ECONNREFUSED, 401, etc.). initialize() logs the failure and rethrows so
    // the module-init failure is visible rather than silently swallowed.
    const error = new Error('ECONNREFUSED');
    (
      manager as unknown as Record<string, unknown> & {
        internalApiClient: {
          fetchActiveIntegrations: ReturnType<typeof vi.fn>;
        };
      }
    ).internalApiClient.fetchActiveIntegrations.mockRejectedValue(error);

    await expect(manager.initialize()).rejects.toThrow('ECONNREFUSED');

    expect(
      (manager as unknown as { logger: { error: ReturnType<typeof vi.fn> } })
        .logger.error,
    ).toHaveBeenCalledWith('Failed to initialize Discord Bot Manager:', error);
    expect(manager.getActiveCount()).toBe(0);
  });

  it('should sendToChannel return null when no bot found', async () => {
    const result = await manager.sendToChannel('unknown-org', 'ch-1', 'hello');
    expect(result).toBeNull();
  });
});
