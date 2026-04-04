import { OrgIntegration, REDIS_EVENTS } from '@genfeedai/integrations';
import { ConfigService } from '@discord/config/config.service';
import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

// Hoist mocks
const { mockClient, mockRest } = vi.hoisted(() => ({
  mockClient: {
    destroy: vi.fn(),
    login: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    user: { id: '123456789', tag: 'TestBot#1234', username: 'TestBot' },
  },
  mockRest: {
    put: vi.fn().mockResolvedValue([]),
    setToken: vi.fn().mockReturnThis(),
  },
}));

vi.mock('discord.js', () => ({
  ActionRowBuilder: vi.fn(function () {
    return { addComponents: vi.fn().mockReturnThis() };
  }),
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
  Events: { ClientReady: 'clientReady' },
  GatewayIntentBits: {
    DirectMessages: 4,
    GuildMessages: 2,
    Guilds: 1,
    MessageContent: 3,
  },
  REST: vi.fn(function () {
    return mockRest;
  }),
  Routes: { applicationCommands: vi.fn().mockReturnValue('/commands') },
  SlashCommandBuilder: vi.fn(function () {
    return {
      setDescription: vi.fn().mockReturnThis(),
      setName: vi.fn().mockReturnThis(),
      toJSON: vi.fn().mockReturnValue({}),
    };
  }),
}));

describe('DiscordBotManager', () => {
  let service: DiscordBotManager;
  let httpService: HttpService;
  let redisService: RedisService;

  const mockIntegration: OrgIntegration = {
    botToken: 'discord-bot-token-123',
    config: {
      allowedUserIds: ['987654321', '123456789'],
      defaultWorkflow: 'wf-discord-gen',
    },
    createdAt: new Date('2024-01-01'),
    id: 'discord-integration-1',
    orgId: 'org-789',
    platform: 'discord',
    status: 'active',
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const mockConfigService = {
      API_KEY: 'test-key',
      API_URL: 'http://localhost:3001',
      get: vi.fn().mockReturnValue('test-value'),
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
        DiscordBotManager,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<DiscordBotManager>(DiscordBotManager);
    httpService = module.get(HttpService);
    redisService = module.get(RedisService);

    // Mock logger to avoid console noise
    vi.spyOn(service.logger, 'log').mockImplementation();
    vi.spyOn(service.logger, 'warn').mockImplementation();
    vi.spyOn(service.logger, 'error').mockImplementation();
    vi.spyOn(service.logger, 'debug').mockImplementation();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      (httpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        of({ data: [] }),
      );
      await service.initialize();

      expect(service.logger.log).toHaveBeenCalledWith(
        'Discord Bot Manager initialized with 0 bots',
      );
      expect(redisService.subscribe).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_CREATED,
        expect.any(Function),
      );
    });

    it('should subscribe to all three Redis events', async () => {
      (httpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        of({ data: [] }),
      );
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
    });
  });

  describe('shutdown', () => {
    it('should shutdown successfully', async () => {
      await service.shutdown();

      expect(service.logger.log).toHaveBeenCalledWith(
        'Shutting down Discord Bot Manager',
      );
    });

    it('should destroy all active bots', async () => {
      mockClient.login.mockResolvedValue(undefined);
      mockClient.destroy.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      await service.shutdown();

      expect(mockClient.destroy).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('createBotInstance', () => {
    it('should create a Discord client with correct intents', async () => {
      mockClient.login.mockResolvedValue(undefined);

      const instance = await service.createBotInstance(mockIntegration);

      expect(instance).toEqual({
        client: mockClient,
        id: mockIntegration.id,
        integration: mockIntegration,
        orgId: mockIntegration.orgId,
      });

      const { Client } = await import('discord.js');
      expect(Client).toHaveBeenCalledWith({
        intents: [1, 2, 3, 4], // Guilds, GuildMessages, MessageContent, DirectMessages
      });
    });

    it('should register event handlers', async () => {
      mockClient.login.mockResolvedValue(undefined);

      await service.createBotInstance(mockIntegration);

      expect(mockClient.once).toHaveBeenCalledWith(
        'clientReady',
        expect.any(Function),
      );
      expect(mockClient.on).toHaveBeenCalledWith(
        'interactionCreate',
        expect.any(Function),
      );
      expect(mockClient.on).toHaveBeenCalledWith(
        'messageCreate',
        expect.any(Function),
      );
      expect(mockClient.login).toHaveBeenCalledWith('discord-bot-token-123');
    });

    it('should register slash commands on ready event', async () => {
      mockClient.login.mockResolvedValue(undefined);

      mockClient.once.mockImplementation(
        (event: string, callback: (...args: unknown[]) => void) => {
          if (event === 'clientReady') {
            callback({ user: { id: '123456789', tag: 'TestBot#1234' } });
          }
          return mockClient;
        },
      );

      await service.createBotInstance(mockIntegration);

      expect(mockRest.setToken).toHaveBeenCalledWith('discord-bot-token-123');
      expect(mockRest.put).toHaveBeenCalled();
    });

    it('should handle login failure', async () => {
      mockClient.login.mockRejectedValue(new Error('Invalid token'));

      await expect(service.createBotInstance(mockIntegration)).rejects.toThrow(
        'Invalid token',
      );
    });
  });

  describe('destroyBotInstance', () => {
    it('should destroy the Discord client', async () => {
      const mockInstance = {
        client: mockClient,
        id: mockIntegration.id,
        integration: mockIntegration,
        orgId: mockIntegration.orgId,
      };

      mockClient.destroy.mockResolvedValue(undefined);

      await service.destroyBotInstance(mockInstance);

      expect(mockClient.destroy).toHaveBeenCalled();
    });

    it('should handle client destruction failure', async () => {
      const mockInstance = {
        client: mockClient,
        id: mockIntegration.id,
        integration: mockIntegration,
        orgId: mockIntegration.orgId,
      };

      const error = new Error('Destroy failed');
      mockClient.destroy.mockRejectedValue(error);

      await service.destroyBotInstance(mockInstance);

      expect(service.logger.warn).toHaveBeenCalledWith(
        `Error stopping bot ${mockIntegration.id}:`,
        error,
      );
    });
  });

  describe('addIntegration', () => {
    it('should add a new Discord integration successfully', async () => {
      mockClient.login.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);

      expect(service.getActiveCount()).toBe(1);
    });

    it('should update existing integration when adding duplicate', async () => {
      mockClient.login.mockResolvedValue(undefined);
      mockClient.destroy.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);
      expect(mockClient.destroy).toHaveBeenCalled();
    });

    it('should handle creation errors', async () => {
      mockClient.login.mockRejectedValue(
        new Error('Discord client creation failed'),
      );

      await expect(service.addIntegration(mockIntegration)).rejects.toThrow(
        'Discord client creation failed',
      );

      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('updateIntegration', () => {
    it('should update an existing integration', async () => {
      mockClient.login.mockResolvedValue(undefined);
      mockClient.destroy.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);

      const updatedIntegration = {
        ...mockIntegration,
        config: {
          ...mockIntegration.config,
          defaultWorkflow: 'new-discord-workflow',
        },
      };

      await service.updateIntegration(updatedIntegration);

      expect(mockClient.destroy).toHaveBeenCalled();
      expect(mockClient.login).toHaveBeenCalledTimes(2);
      expect(service.getActiveCount()).toBe(1);
    });
  });

  describe('removeIntegration', () => {
    it('should remove an existing integration', async () => {
      mockClient.login.mockResolvedValue(undefined);
      mockClient.destroy.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      await service.removeIntegration(mockIntegration.id);

      expect(mockClient.destroy).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
    });

    it('should handle removal of non-existent integration', async () => {
      await service.removeIntegration('non-existent-discord-id');

      expect(service.logger.warn).toHaveBeenCalledWith(
        'Integration non-existent-discord-id not found',
      );
    });
  });

  describe('getActiveCount', () => {
    it('should return 0 for empty manager', () => {
      expect(service.getActiveCount()).toBe(0);
    });

    it('should return correct count after adding integrations', async () => {
      mockClient.login.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      const secondIntegration = {
        ...mockIntegration,
        botToken: 'another-discord-token',
        id: 'discord-integration-2',
        orgId: 'org-999',
      };
      await service.addIntegration(secondIntegration);
      expect(service.getActiveCount()).toBe(2);
    });
  });

  describe('fetchAndAddIntegration', () => {
    it('should fetch integration and add it', async () => {
      mockClient.login.mockResolvedValue(undefined);
      (httpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        of({ data: mockIntegration }),
      );

      await service.fetchAndAddIntegration('discord-integration-1');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining(
          '/v1/internal/integrations/discord/discord-integration-1',
        ),
        expect.any(Object),
      );
      expect(service.getActiveCount()).toBe(1);
    });
  });

  describe('fetchAndUpdateIntegration', () => {
    it('should fetch integration and update it', async () => {
      mockClient.login.mockResolvedValue(undefined);
      mockClient.destroy.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);
      (httpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        of({ data: mockIntegration }),
      );

      await service.fetchAndUpdateIntegration('discord-integration-1');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining(
          '/v1/internal/integrations/discord/discord-integration-1',
        ),
        expect.any(Object),
      );
      expect(service.getActiveCount()).toBe(1);
    });
  });

  describe('Redis hot reload', () => {
    it('should hot-add integration for Discord events only', async () => {
      const handlers = new Map<string, (message: unknown) => void>();

      (redisService.subscribe as ReturnType<typeof vi.fn>).mockImplementation(
        async (channel: string, handler?: (message: unknown) => void) => {
          if (handler) {
            handlers.set(channel, handler);
          }
        },
      );

      (httpService.get as ReturnType<typeof vi.fn>).mockImplementation(
        (url: string) => {
          if (url.endsWith('/v1/internal/integrations/discord')) {
            return of({ data: [] });
          }
          if (
            url.endsWith(
              '/v1/internal/integrations/discord/discord-integration-1',
            )
          ) {
            return of({ data: mockIntegration });
          }
          return of({ data: [] });
        },
      );

      mockClient.login.mockResolvedValue(undefined);

      await service.initialize();

      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        integrationId: 'discord-integration-1',
        orgId: 'org-789',
        platform: 'discord',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(service.getActiveCount()).toBe(1);
    });

    it('should ignore events for non-discord platforms', async () => {
      const handlers = new Map<string, (message: unknown) => void>();

      (redisService.subscribe as ReturnType<typeof vi.fn>).mockImplementation(
        async (channel: string, handler?: (message: unknown) => void) => {
          if (handler) {
            handlers.set(channel, handler);
          }
        },
      );

      (httpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        of({ data: [] }),
      );

      await service.initialize();

      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        integrationId: 'slack-integration-1',
        orgId: 'org-789',
        platform: 'slack',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('interaction handling', () => {
    let interactionHandler: (interaction: unknown) => Promise<void>;

    beforeEach(async () => {
      mockClient.login.mockResolvedValue(undefined);

      mockClient.on.mockImplementation(
        (event: string, callback: (...args: unknown[]) => void) => {
          if (event === 'interactionCreate') {
            interactionHandler = callback as (
              interaction: unknown,
            ) => Promise<void>;
          }
          return mockClient;
        },
      );

      await service.createBotInstance(mockIntegration);
    });

    it('should reject unauthorized users', async () => {
      const mockInteraction = {
        channelId: 'channel-1',
        commandName: 'workflows',
        isButton: vi.fn().mockReturnValue(false),
        isChatInputCommand: vi.fn().mockReturnValue(true),
        isRepliable: vi.fn().mockReturnValue(true),
        reply: vi.fn(),
        user: { id: 'unauthorized-user' },
      };

      await interactionHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'You are not authorized to use this bot.',
        ephemeral: true,
      });
    });

    it('should handle /status command for idle user', async () => {
      const mockInteraction = {
        channelId: 'channel-1',
        commandName: 'status',
        isButton: vi.fn().mockReturnValue(false),
        isChatInputCommand: vi.fn().mockReturnValue(true),
        isRepliable: vi.fn().mockReturnValue(true),
        reply: vi.fn(),
        user: { id: '123456789' },
      };

      await interactionHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.stringContaining('Idle'),
      );
    });

    it('should handle /cancel command with no active session', async () => {
      const mockInteraction = {
        channelId: 'channel-1',
        commandName: 'cancel',
        isButton: vi.fn().mockReturnValue(false),
        isChatInputCommand: vi.fn().mockReturnValue(true),
        isRepliable: vi.fn().mockReturnValue(true),
        reply: vi.fn(),
        user: { id: '123456789' },
      };

      await interactionHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith('Nothing to cancel.');
    });

    it('should handle /settings command', async () => {
      const mockInteraction = {
        channelId: 'channel-1',
        commandName: 'settings',
        isButton: vi.fn().mockReturnValue(false),
        isChatInputCommand: vi.fn().mockReturnValue(true),
        isRepliable: vi.fn().mockReturnValue(true),
        reply: vi.fn(),
        user: { id: '123456789' },
      };

      await interactionHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.any(Array),
          content: expect.stringContaining('Settings'),
        }),
      );
    });

    it('should handle /workflows command', async () => {
      const mockWorkflows = [
        { description: 'Generate images', id: 'wf-1', name: 'Image Gen' },
        { id: 'wf-2', name: 'Video Gen' },
      ];

      (httpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        of({ data: mockWorkflows }),
      );

      const mockInteraction = {
        channelId: 'channel-1',
        commandName: 'workflows',
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        isButton: vi.fn().mockReturnValue(false),
        isChatInputCommand: vi.fn().mockReturnValue(true),
        isRepliable: vi.fn().mockReturnValue(true),
        user: { id: '123456789' },
      };

      await interactionHandler(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.any(Array),
          content: expect.stringContaining('GenFeed AI Workflows'),
        }),
      );
    });

    it('should handle button interaction for settings', async () => {
      const mockInteraction = {
        channelId: 'channel-1',
        customId: 'cfg:img:flux-dev',
        isButton: vi.fn().mockReturnValue(true),
        isChatInputCommand: vi.fn().mockReturnValue(false),
        isRepliable: vi.fn().mockReturnValue(true),
        reply: vi.fn(),
        user: { id: '123456789' },
      };

      await interactionHandler(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('flux-dev'),
          ephemeral: true,
        }),
      );
    });
  });

  describe('message handling', () => {
    let messageHandler: (message: unknown) => Promise<void>;

    beforeEach(async () => {
      mockClient.login.mockResolvedValue(undefined);

      mockClient.on.mockImplementation(
        (event: string, callback: (...args: unknown[]) => void) => {
          if (event === 'messageCreate') {
            messageHandler = callback as (message: unknown) => Promise<void>;
          }
          return mockClient;
        },
      );

      await service.createBotInstance(mockIntegration);
    });

    it('should ignore bot messages', async () => {
      const mockMessage = {
        attachments: new Map(),
        author: { bot: true, id: '123456789' },
        channelId: 'channel-1',
        content: 'Hello',
      };

      await messageHandler(mockMessage);
      // No error thrown = ignored
    });

    it('should ignore messages from unauthorized users', async () => {
      const mockMessage = {
        attachments: new Map(),
        author: { bot: false, id: 'unauthorized-user' },
        channelId: 'channel-1',
        content: 'Hello',
      };

      await messageHandler(mockMessage);
      // No error thrown = ignored
    });

    it('should ignore messages without active session', async () => {
      const mockMessage = {
        attachments: new Map(),
        author: { bot: false, id: '123456789' },
        channel: { send: vi.fn() },
        channelId: 'channel-1',
        content: 'Hello',
      };

      await messageHandler(mockMessage);

      expect(mockMessage.channel.send).not.toHaveBeenCalled();
    });
  });
});
