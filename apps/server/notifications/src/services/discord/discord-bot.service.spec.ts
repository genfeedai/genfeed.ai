import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
import type { Mock, Mocked } from 'vitest';

// Mock discord.js
vi.mock('discord.js', () => {
  const mockWebhookClient = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
  }));

  const mockClient = {
    channels: {
      fetch: vi.fn(),
    },
    destroy: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue('token'),
    on: vi.fn(),
    once: vi.fn(),
    user: { id: 'bot-user-123', tag: 'TestBot#1234' },
  };

  const mockClientConstructor = vi.fn().mockImplementation(() => mockClient);

  return {
    ChannelType: { GuildNews: 5, GuildText: 0 },
    Client: mockClientConstructor,
    Events: { ClientReady: 'clientReady' },
    GatewayIntentBits: { Guilds: 1 },
    NewsChannel: class NewsChannel {},
    PermissionFlagsBits: {
      AttachFiles: BigInt(32768),
      EmbedLinks: BigInt(16384),
      ManageWebhooks: BigInt(536870912),
      SendMessages: BigInt(2048),
      ViewChannel: BigInt(1024),
    },
    TextChannel: class TextChannel {},
    WebhookClient: mockWebhookClient,
  };
});

import { Client, TextChannel } from 'discord.js';

describe('DiscordBotService', () => {
  let service: DiscordBotService;
  let mockConfigService: Mocked<ConfigService>;
  let mockLogger: Mocked<LoggerService>;
  let mockClient: any;

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          DISCORD_BOT_TOKEN: 'test-bot-token',
          DISCORD_CHANNEL_ID_POSTS: 'channel-posts-123',
          DISCORD_CHANNEL_ID_STUDIO: 'channel-studio-456',
          DISCORD_CHANNEL_ID_USERS: 'channel-users-789',
        };
        return config[key];
      }),
      isDiscordEnabled: vi.fn().mockReturnValue(true),
      isProduction: false,
    } as unknown as Mocked<ConfigService>;

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    // Reset Client mock
    mockClient = {
      channels: {
        fetch: vi.fn(),
      },
      destroy: vi.fn().mockResolvedValue(undefined),
      login: vi.fn().mockResolvedValue('token'),
      on: vi.fn(),
      once: vi.fn(),
      user: { id: 'bot-user-123', tag: 'TestBot#1234' },
    };

    (Client as Mock).mockImplementation(() => mockClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordBotService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<DiscordBotService>(DiscordBotService);

    vi.clearAllMocks();
    (Client as Mock).mockImplementation(() => mockClient);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should initialize bot when Discord is enabled', async () => {
      await service.onModuleInit();

      expect(Client).toHaveBeenCalledWith({
        intents: [1], // GatewayIntentBits.Guilds
      });
      expect(mockClient.login).toHaveBeenCalledWith('test-bot-token');
    });

    it('should not initialize when Discord is disabled', async () => {
      mockConfigService.isDiscordEnabled.mockReturnValue(false);

      await service.onModuleInit();

      expect(Client).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Discord bot not configured - notifications disabled',
      );
    });

    it('should register ready event handler', async () => {
      await service.onModuleInit();

      expect(mockClient.once).toHaveBeenCalledWith(
        'clientReady',
        expect.any(Function),
      );
    });

    it('should handle initialization errors', async () => {
      mockClient.login.mockRejectedValue(new Error('Login failed'));

      await service.onModuleInit();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize Discord bot',
        expect.any(Error),
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should destroy client on module destroy', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockClient.destroy).toHaveBeenCalled();
    });

    it('should clear webhook cache on destroy', async () => {
      // Simulate ready state
      await service.onModuleInit();
      const readyCallback = mockClient.once.mock.calls[0][1];
      readyCallback();

      await service.onModuleDestroy();

      // No errors should occur
      expect(mockClient.destroy).toHaveBeenCalled();
    });
  });

  describe('botReady', () => {
    it('should return false initially', () => {
      expect(service.botReady).toBe(false);
    });

    it('should return true after ready event', async () => {
      await service.onModuleInit();

      // Simulate ready event
      const readyCallback = mockClient.once.mock.calls[0][1];
      readyCallback();

      expect(service.botReady).toBe(true);
    });
  });

  describe('getOrCreateWebhook', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      // Simulate ready event
      const readyCallback = mockClient.once.mock.calls[0][1];
      readyCallback();
    });

    it('should return null if bot is not ready', async () => {
      // Create new service without init
      const uninitService = new DiscordBotService(
        mockConfigService,
        mockLogger,
      );

      const result = await uninitService.getOrCreateWebhook(
        'channel-123',
        'TestWebhook',
      );

      expect(result).toBeNull();
    });

    it('should return null for non-text channels', async () => {
      mockClient.channels.fetch.mockResolvedValue({
        type: 4, // VoiceChannel
      });

      const result = await service.getOrCreateWebhook('channel-123', 'Test');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('not found or not a text channel'),
      );
    });

    it('should return cached webhook if exists', async () => {
      const mockWebhook = { url: 'https://discord.webhook/123' };
      const mockChannel = Object.create(TextChannel.prototype);
      Object.assign(mockChannel, {
        createWebhook: vi.fn().mockResolvedValue(mockWebhook),
        fetchWebhooks: vi.fn().mockResolvedValue({
          find: vi.fn().mockReturnValue(undefined),
        }),
      });

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // First call - creates webhook
      await service.getOrCreateWebhook('channel-123', 'Test');

      // Second call - should use cache
      await service.getOrCreateWebhook('channel-123', 'Test');

      // Channel should only be fetched once
      expect(mockClient.channels.fetch).toHaveBeenCalledTimes(1);
    });

    it('should create new webhook if none exists', async () => {
      const mockWebhook = { id: 'wh-123', url: 'https://discord.webhook/123' };
      const mockChannel = Object.create(TextChannel.prototype);
      Object.assign(mockChannel, {
        createWebhook: vi.fn().mockResolvedValue(mockWebhook),
        fetchWebhooks: vi.fn().mockResolvedValue({
          find: vi.fn().mockReturnValue(undefined),
        }),
      });

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      const result = await service.getOrCreateWebhook(
        'channel-123',
        'TestHook',
      );

      expect(mockChannel.createWebhook).toHaveBeenCalledWith({
        name: 'TestHook',
        reason: 'Genfeed.ai notification webhook',
      });
      expect(result).not.toBeNull();
    });

    it('should reuse existing webhook owned by bot', async () => {
      const mockWebhook = {
        id: 'wh-existing',
        name: 'ExistingHook',
        owner: { id: 'bot-user-123' },
        url: 'https://discord.webhook/existing',
      };

      const mockChannel = Object.create(TextChannel.prototype);
      Object.assign(mockChannel, {
        createWebhook: vi.fn(),
        fetchWebhooks: vi.fn().mockResolvedValue({
          find: vi.fn().mockReturnValue(mockWebhook),
        }),
      });

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      const result = await service.getOrCreateWebhook(
        'channel-123',
        'ExistingHook',
      );

      expect(mockChannel.createWebhook).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockClient.channels.fetch.mockRejectedValue(new Error('Channel error'));

      const result = await service.getOrCreateWebhook('channel-123', 'Test');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get/create webhook'),
        expect.any(Error),
      );
    });
  });

  describe('clearWebhookCache', () => {
    it('should clear specific webhook from cache', async () => {
      await service.onModuleInit();
      const readyCallback = mockClient.once.mock.calls[0][1];
      readyCallback();

      const mockWebhook = { id: 'wh-123', url: 'https://discord.webhook/123' };
      const mockChannel = Object.create(TextChannel.prototype);
      Object.assign(mockChannel, {
        createWebhook: vi.fn().mockResolvedValue(mockWebhook),
        fetchWebhooks: vi.fn().mockResolvedValue({
          find: vi.fn().mockReturnValue(undefined),
        }),
      });

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // Create webhook
      await service.getOrCreateWebhook('channel-123', 'Test');

      // Clear cache
      service.clearWebhookCache('channel-123', 'Test');

      // Next call should fetch again
      await service.getOrCreateWebhook('channel-123', 'Test');

      expect(mockClient.channels.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPostsWebhook', () => {
    it('should get webhook for posts channel', async () => {
      await service.onModuleInit();
      const readyCallback = mockClient.once.mock.calls[0][1];
      readyCallback();

      const mockWebhook = { id: 'wh-123', url: 'https://discord.webhook/123' };
      const mockChannel = Object.create(TextChannel.prototype);
      Object.assign(mockChannel, {
        createWebhook: vi.fn().mockResolvedValue(mockWebhook),
        fetchWebhooks: vi.fn().mockResolvedValue({
          find: vi.fn().mockReturnValue(undefined),
        }),
      });

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await service.getPostsWebhook();

      expect(mockClient.channels.fetch).toHaveBeenCalledWith(
        'channel-posts-123',
      );
    });
  });

  describe('getIngredientsWebhook', () => {
    it('should get webhook for studio channel', async () => {
      await service.onModuleInit();
      const readyCallback = mockClient.once.mock.calls[0][1];
      readyCallback();

      const mockWebhook = { id: 'wh-123', url: 'https://discord.webhook/123' };
      const mockChannel = Object.create(TextChannel.prototype);
      Object.assign(mockChannel, {
        createWebhook: vi.fn().mockResolvedValue(mockWebhook),
        fetchWebhooks: vi.fn().mockResolvedValue({
          find: vi.fn().mockReturnValue(undefined),
        }),
      });

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await service.getIngredientsWebhook();

      expect(mockClient.channels.fetch).toHaveBeenCalledWith(
        'channel-studio-456',
      );
    });
  });

  describe('getUsersWebhook', () => {
    it('should get webhook for users channel', async () => {
      await service.onModuleInit();
      const readyCallback = mockClient.once.mock.calls[0][1];
      readyCallback();

      const mockWebhook = { id: 'wh-123', url: 'https://discord.webhook/123' };
      const mockChannel = Object.create(TextChannel.prototype);
      Object.assign(mockChannel, {
        createWebhook: vi.fn().mockResolvedValue(mockWebhook),
        fetchWebhooks: vi.fn().mockResolvedValue({
          find: vi.fn().mockReturnValue(undefined),
        }),
      });

      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await service.getUsersWebhook();

      expect(mockClient.channels.fetch).toHaveBeenCalledWith(
        'channel-users-789',
      );
    });
  });

  describe('testChannel', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      const readyCallback = mockClient.once.mock.calls[0][1];
      readyCallback();
    });

    it('should return error if bot not ready', async () => {
      const uninitService = new DiscordBotService(
        mockConfigService,
        mockLogger,
      );

      const result = await uninitService.testChannel('channel-123');

      expect(result).toEqual({
        channelId: 'channel-123',
        error: 'Bot not ready',
        success: false,
      });
    });

    it('should return error if channel not found', async () => {
      mockClient.channels.fetch.mockResolvedValue(null);

      const result = await service.testChannel('channel-123');

      expect(result).toEqual({
        channelId: 'channel-123',
        error: 'Channel not found',
        success: false,
      });
    });

    it('should return channel info on success', async () => {
      mockClient.channels.fetch.mockResolvedValue({
        name: 'test-channel',
        type: 0, // GuildText
      });

      const result = await service.testChannel('channel-123');

      expect(result.success).toBe(true);
      expect(result.channelId).toBe('channel-123');
      expect(result.channelName).toBe('test-channel');
    });

    it('should include bot permissions for guild channels', async () => {
      const mockMember = {};
      const mockPermissions = {
        has: vi.fn().mockReturnValue(true),
      };

      mockClient.channels.fetch.mockResolvedValue({
        guild: {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          },
        },
        name: 'test-channel',
        permissionsFor: vi.fn().mockReturnValue(mockPermissions),
        type: 0,
      });

      const result = await service.testChannel('channel-123');

      expect(result.botPermissions).toBeDefined();
      expect(result.botPermissions?.ViewChannel).toBe(true);
      expect(result.botPermissions?.SendMessages).toBe(true);
      expect(result.botPermissions?.ManageWebhooks).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockClient.channels.fetch.mockRejectedValue(new Error('Fetch error'));

      const result = await service.testChannel('channel-123');

      expect(result).toEqual({
        channelId: 'channel-123',
        error: 'Fetch error',
        success: false,
      });
    });
  });

  describe('getAllConfiguredChannels', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      const readyCallback = mockClient.once.mock.calls[0][1];
      readyCallback();
    });

    it('should return all configured channels', async () => {
      mockClient.channels.fetch.mockResolvedValue({
        name: 'test-channel',
        type: 0,
      });

      const result = await service.getAllConfiguredChannels();

      expect(result.success).toBe(true);
      expect(result.channels).toHaveLength(3);
      expect(result.channels[0].name).toBe('POSTS');
      expect(result.channels[1].name).toBe('STUDIO');
      expect(result.channels[2].name).toBe('USERS');
    });

    it('should test each configured channel', async () => {
      mockClient.channels.fetch.mockResolvedValue({
        name: 'test-channel',
        type: 0,
      });

      await service.getAllConfiguredChannels();

      expect(mockClient.channels.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
