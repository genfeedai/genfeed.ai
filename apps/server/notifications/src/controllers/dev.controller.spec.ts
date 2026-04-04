import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { DevDiscordController } from '@notifications/controllers/dev.controller';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
import type { Mocked } from 'vitest';

describe('DevDiscordController', () => {
  let controller: DevDiscordController;
  let mockConfigService: Mocked<ConfigService>;
  let mockDiscordBotService: Mocked<DiscordBotService>;

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn(),
      isProduction: false,
    } as unknown as Mocked<ConfigService>;

    mockDiscordBotService = {
      getAllConfiguredChannels: vi.fn(),
      testChannel: vi.fn(),
    } as unknown as Mocked<DiscordBotService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevDiscordController],
      providers: [
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DiscordBotService, useValue: mockDiscordBotService },
      ],
    }).compile();

    controller = module.get<DevDiscordController>(DevDiscordController);

    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('testChannel', () => {
    it('should throw 403 in production', async () => {
      mockConfigService.isProduction = true;

      await expect(
        controller.testChannel({ channelId: 'channel-123' }),
      ).rejects.toThrow(HttpException);

      await expect(
        controller.testChannel({ channelId: 'channel-123' }),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('should throw 400 if channelId is missing', async () => {
      await expect(controller.testChannel({ channelId: '' })).rejects.toThrow(
        HttpException,
      );

      await expect(
        controller.testChannel({ channelId: '' }),
      ).rejects.toMatchObject({
        response: 'channelId is required',
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('should call discordBotService.testChannel in dev mode', async () => {
      const testResult = {
        botPermissions: {
          AttachFiles: true,
          EmbedLinks: true,
          ManageWebhooks: true,
          SendMessages: true,
          ViewChannel: true,
        },
        channelId: 'channel-123',
        channelName: 'test-channel',
        channelType: 'GuildText',
        success: true,
      };

      mockDiscordBotService.testChannel.mockResolvedValue(testResult);

      const result = await controller.testChannel({ channelId: 'channel-123' });

      expect(mockDiscordBotService.testChannel).toHaveBeenCalledWith(
        'channel-123',
      );
      expect(result).toEqual(testResult);
    });

    it('should return error result from testChannel', async () => {
      const errorResult = {
        channelId: 'channel-123',
        error: 'Channel not found',
        success: false,
      };

      mockDiscordBotService.testChannel.mockResolvedValue(errorResult);

      const result = await controller.testChannel({ channelId: 'channel-123' });

      expect(result).toEqual(errorResult);
    });
  });

  describe('getChannels', () => {
    it('should throw 403 in production', async () => {
      mockConfigService.isProduction = true;

      await expect(controller.getChannels()).rejects.toThrow(HttpException);

      await expect(controller.getChannels()).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('should return all configured channels in dev mode', async () => {
      const channelsResult = {
        channels: [
          {
            botPermissions: {
              AttachFiles: true,
              EmbedLinks: true,
              ManageWebhooks: true,
              SendMessages: true,
              ViewChannel: true,
            },
            channelId: 'channel-posts-123',
            channelName: 'posts',
            channelType: 'GuildText',
            name: 'POSTS',
          },
          {
            botPermissions: {
              AttachFiles: true,
              EmbedLinks: true,
              ManageWebhooks: true,
              SendMessages: true,
              ViewChannel: true,
            },
            channelId: 'channel-studio-456',
            channelName: 'studio',
            channelType: 'GuildText',
            name: 'STUDIO',
          },
          {
            botPermissions: {
              AttachFiles: true,
              EmbedLinks: true,
              ManageWebhooks: true,
              SendMessages: true,
              ViewChannel: true,
            },
            channelId: 'channel-users-789',
            channelName: 'users',
            channelType: 'GuildText',
            name: 'USERS',
          },
        ],
        success: true,
      };

      mockDiscordBotService.getAllConfiguredChannels.mockResolvedValue(
        channelsResult,
      );

      const result = await controller.getChannels();

      expect(mockDiscordBotService.getAllConfiguredChannels).toHaveBeenCalled();
      expect(result).toEqual(channelsResult);
    });

    it('should return channel errors when bot is not ready', async () => {
      const channelsResult = {
        channels: [
          {
            channelId: 'channel-posts-123',
            error: 'Bot not ready',
            name: 'POSTS',
            success: false,
          },
          {
            channelId: 'channel-studio-456',
            error: 'Bot not ready',
            name: 'STUDIO',
            success: false,
          },
          {
            channelId: 'channel-users-789',
            error: 'Bot not ready',
            name: 'USERS',
            success: false,
          },
        ],
        success: true,
      };

      mockDiscordBotService.getAllConfiguredChannels.mockResolvedValue(
        channelsResult,
      );

      const result = await controller.getChannels();

      expect(result.channels).toHaveLength(3);
      expect(result.channels[0].error).toBe('Bot not ready');
    });
  });
});
