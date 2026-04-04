/**
 * @fileoverview Tests for DiscordBotAdapter
 */

import { ConfigService } from '@api/config/config.service';
import { DiscordBotAdapter } from '@api/services/bot-gateway/adapters/discord-bot.adapter';
import {
  BotCommandType,
  BotInteractionType,
  BotResponseType,
  CredentialPlatform,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('DiscordBotAdapter', () => {
  let adapter: DiscordBotAdapter;
  let configService: vi.Mocked<ConfigService>;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockApplicationId = 'app-123456';
  const mockToken = 'interaction-token-abc';

  const makeInteraction = (overrides?: Record<string, unknown>) => ({
    application_id: mockApplicationId,
    channel_id: 'channel-789',
    data: {
      name: 'status',
      options: [],
    },
    id: 'interaction-001',
    member: {
      user: {
        id: 'discord-user-999',
        username: 'TestUser',
      },
    },
    token: mockToken,
    type: BotInteractionType.APPLICATION_COMMAND,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordBotAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'DISCORD_PUBLIC_KEY') return 'a'.repeat(64);
              return undefined;
            }),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    adapter = module.get<DiscordBotAdapter>(DiscordBotAdapter);
    configService = module.get(ConfigService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('should have platform set to DISCORD', () => {
    expect(adapter.platform).toBe(CredentialPlatform.DISCORD);
  });

  describe('validateSignature', () => {
    it('should return false when DISCORD_PUBLIC_KEY is not configured', () => {
      configService.get.mockReturnValue(undefined);
      // Recreate adapter without public key
      const adapterWithoutKey = new DiscordBotAdapter(
        { get: vi.fn(() => undefined) } as unknown as ConfigService,
        httpService,
        loggerService,
      );

      const result = adapterWithoutKey.validateSignature(
        'body',
        'sig',
        '12345',
      );

      expect(result).toBe(false);
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should return false when timestamp is missing', () => {
      const result = adapter.validateSignature('body', 'sig');

      expect(result).toBe(false);
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should return false when signature is invalid', () => {
      // Invalid signature hex
      const result = adapter.validateSignature(
        'body',
        'deadbeef'.repeat(8),
        '12345',
      );

      expect(result).toBe(false);
    });

    it('should handle Buffer body type', () => {
      const result = adapter.validateSignature(
        Buffer.from('{"test": true}'),
        'deadbeef'.repeat(8),
        '1234567890',
      );

      // Should not throw, returns boolean
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getInteractionType', () => {
    it('should return interaction type for valid payload', () => {
      const result = adapter.getInteractionType({ type: 1 });
      expect(result).toBe(1);
    });

    it('should return null for null payload', () => {
      const result = adapter.getInteractionType(null);
      expect(result).toBeNull();
    });

    it('should return null when type is not a number', () => {
      const result = adapter.getInteractionType({ type: 'one' });
      expect(result).toBeNull();
    });

    it('should return PING type correctly', () => {
      const result = adapter.getInteractionType({
        type: BotInteractionType.PING,
      });
      expect(result).toBe(BotInteractionType.PING);
    });
  });

  describe('parseMessage', () => {
    it('should return null for non-APPLICATION_COMMAND interactions', () => {
      const result = adapter.parseMessage({ type: BotInteractionType.PING });
      expect(result).toBeNull();
    });

    it('should return null when command name is missing', () => {
      const result = adapter.parseMessage(makeInteraction({ data: {} }));
      expect(result).toBeNull();
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should return null for unknown command names', () => {
      const result = adapter.parseMessage(
        makeInteraction({ data: { name: 'unknown-command' } }),
      );
      expect(result).toBeNull();
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should return null when no user ID is present', () => {
      const result = adapter.parseMessage(
        makeInteraction({ member: undefined, user: undefined }),
      );
      expect(result).toBeNull();
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should parse "status" command correctly', () => {
      const result = adapter.parseMessage(makeInteraction());

      expect(result).toMatchObject({
        applicationId: mockApplicationId,
        command: BotCommandType.STATUS,
        interactionToken: mockToken,
        platform: CredentialPlatform.DISCORD,
        platformUserId: 'discord-user-999',
      });
    });

    it('should parse "prompt-image" command with prompt option', () => {
      const result = adapter.parseMessage(
        makeInteraction({
          data: {
            name: 'prompt-image',
            options: [{ name: 'prompt', value: 'a cat on a surfboard' }],
          },
          user: { id: 'user-dm-1', username: 'DM User' },
        }),
      );

      expect(result).toMatchObject({
        command: BotCommandType.PROMPT_IMAGE,
        platformUserId: 'user-dm-1',
        prompt: 'a cat on a surfboard',
      });
    });

    it('should parse "set-brand" command with brand option', () => {
      const result = adapter.parseMessage(
        makeInteraction({
          data: {
            name: 'set-brand',
            options: [{ name: 'brand', value: 'MyBrand' }],
          },
        }),
      );

      expect(result).toMatchObject({
        brandName: 'MyBrand',
        command: BotCommandType.SET_BRAND,
      });
    });

    it('should prefer user.id over member.user.id', () => {
      const result = adapter.parseMessage(
        makeInteraction({
          member: { user: { id: 'member-id', username: 'Guild User' } },
          user: { id: 'dm-user-id', username: 'DM User' },
        }),
      );

      expect(result?.platformUserId).toBe('dm-user-id');
    });
  });

  describe('buildImmediateResponse', () => {
    it('should return PONG response for PING type', () => {
      const result = adapter.buildImmediateResponse(BotResponseType.PONG);
      expect(result).toEqual({ type: BotResponseType.PONG });
    });

    it('should return DEFERRED_CHANNEL_MESSAGE response', () => {
      const result = adapter.buildImmediateResponse(
        BotResponseType.DEFERRED_CHANNEL_MESSAGE,
      );
      expect(result).toEqual({
        type: BotResponseType.DEFERRED_CHANNEL_MESSAGE,
      });
    });

    it('should return CHANNEL_MESSAGE response with content', () => {
      const result = adapter.buildImmediateResponse(
        BotResponseType.CHANNEL_MESSAGE,
        'Hello!',
      );
      expect(result).toMatchObject({
        data: { content: 'Hello!' },
        type: BotResponseType.CHANNEL_MESSAGE,
      });
    });

    it('should return empty string content when message is not provided', () => {
      const result = adapter.buildImmediateResponse(
        BotResponseType.CHANNEL_MESSAGE,
      );
      expect((result as { data: { content: string } }).data.content).toBe('');
    });
  });

  describe('sendFollowupMessage', () => {
    it('should POST to the Discord webhook URL', async () => {
      httpService.post.mockReturnValue(of({ data: {} }) as never);

      await adapter.sendFollowupMessage(
        mockApplicationId,
        mockToken,
        'Test message',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        `https://discord.com/api/v10/webhooks/${mockApplicationId}/${mockToken}`,
        { content: 'Test message' },
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should throw and log error when POST fails', async () => {
      const error = new Error('Network error');
      httpService.post.mockImplementation(() => {
        throw error;
      });

      await expect(
        adapter.sendFollowupMessage(mockApplicationId, mockToken, 'Test'),
      ).rejects.toThrow('Network error');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('sendFollowupMedia', () => {
    it('should send image embed for type "image"', async () => {
      httpService.post.mockReturnValue(of({ data: {} }) as never);

      await adapter.sendFollowupMedia(
        mockApplicationId,
        mockToken,
        'https://example.com/image.jpg',
        'image',
        'Check this out',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          embeds: [{ image: { url: 'https://example.com/image.jpg' } }],
        }),
        expect.any(Object),
      );
    });

    it('should append video URL to content for type "video"', async () => {
      httpService.post.mockReturnValue(of({ data: {} }) as never);

      await adapter.sendFollowupMedia(
        mockApplicationId,
        mockToken,
        'https://example.com/video.mp4',
        'video',
        'Watch this',
      );

      const postPayload = httpService.post.mock.calls[0][1] as {
        content: string;
      };
      expect(postPayload.content).toContain('https://example.com/video.mp4');
    });

    it('should throw and log error when POST fails', async () => {
      const error = new Error('Webhook down');
      httpService.post.mockImplementation(() => {
        throw error;
      });

      await expect(
        adapter.sendFollowupMedia(mockApplicationId, mockToken, 'url', 'image'),
      ).rejects.toThrow('Webhook down');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
