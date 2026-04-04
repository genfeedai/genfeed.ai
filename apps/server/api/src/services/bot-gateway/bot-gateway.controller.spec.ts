import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { DiscordBotAdapter } from '@api/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@api/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@api/services/bot-gateway/adapters/telegram-bot.adapter';
import { BotGatewayController } from '@api/services/bot-gateway/bot-gateway.controller';
import { BotGatewayService } from '@api/services/bot-gateway/bot-gateway.service';
import type { IBotPlatformAdapter, IBotResponse } from '@genfeedai/interfaces';
import { BotInteractionType, BotResponseType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

type MockAdapter = {
  [K in keyof IBotPlatformAdapter]: IBotPlatformAdapter[K] extends (
    ...args: infer A
  ) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : IBotPlatformAdapter[K];
};

const createMockAdapter = (): MockAdapter =>
  ({
    buildImmediateResponse: vi.fn().mockReturnValue({ type: 1 }),
    extractChatId: vi.fn().mockReturnValue('chat-123'),
    getInteractionType: vi.fn(),
    parseMessage: vi.fn(),
    platform: 'discord',
    sendFollowupMedia: vi.fn().mockResolvedValue(undefined),
    sendFollowupMessage: vi.fn().mockResolvedValue(undefined),
    validateSignature: vi.fn().mockResolvedValue(true),
  }) as unknown as MockAdapter;

interface MockBotGatewayService {
  getAdapter: ReturnType<typeof vi.fn>;
  handleInteraction: ReturnType<typeof vi.fn>;
  handlePing: ReturnType<typeof vi.fn>;
}

describe('BotGatewayController', () => {
  let controller: BotGatewayController;
  let botGatewayService: MockBotGatewayService;
  let discordAdapter: MockAdapter;
  let slackAdapter: MockAdapter;
  let telegramAdapter: MockAdapter;

  beforeEach(async () => {
    discordAdapter = createMockAdapter();
    slackAdapter = createMockAdapter();
    telegramAdapter = createMockAdapter();

    const mockService: MockBotGatewayService = {
      getAdapter: vi.fn(),
      handleInteraction: vi.fn(),
      handlePing: vi.fn().mockReturnValue({ type: BotResponseType.PONG }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BotGatewayController],
      providers: [
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: BotGatewayService, useValue: mockService },
        { provide: DiscordBotAdapter, useValue: discordAdapter },
        { provide: SlackBotAdapter, useValue: slackAdapter },
        { provide: TelegramBotAdapter, useValue: telegramAdapter },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BotGatewayController>(BotGatewayController);
    botGatewayService = module.get(BotGatewayService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── Discord ──────────────────────────────────────────────────────────

  describe('handleDiscordInteraction', () => {
    const makeReq = (rawBody?: Buffer) =>
      ({
        rawBody,
      }) as unknown as import('@nestjs/common').RawBodyRequest<Request>;

    it('throws BadRequestException when raw body is missing', async () => {
      await expect(
        controller.handleDiscordInteraction(
          makeReq(undefined),
          {},
          'sig',
          'ts',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when signature headers are missing', async () => {
      await expect(
        controller.handleDiscordInteraction(
          makeReq(Buffer.from('body')),
          {},
          '',
          '',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns 401 when signature validation fails', async () => {
      discordAdapter.validateSignature.mockResolvedValue(false);

      await expect(
        controller.handleDiscordInteraction(
          makeReq(Buffer.from('body')),
          {},
          'bad-sig',
          '12345',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('responds to PING interaction', async () => {
      discordAdapter.validateSignature.mockResolvedValue(true);
      discordAdapter.getInteractionType.mockReturnValue(
        BotInteractionType.PING,
      );

      const result = await controller.handleDiscordInteraction(
        makeReq(Buffer.from('body')),
        { type: 1 },
        'valid-sig',
        '12345',
      );

      expect(botGatewayService.handlePing).toHaveBeenCalledWith('discord');
      expect(result).toEqual({ type: BotResponseType.PONG });
    });

    it('handles APPLICATION_COMMAND with deferred response', async () => {
      discordAdapter.validateSignature.mockResolvedValue(true);
      discordAdapter.getInteractionType.mockReturnValue(
        BotInteractionType.APPLICATION_COMMAND,
      );
      discordAdapter.buildImmediateResponse.mockReturnValue({ type: 5 });

      const deferredResponse: IBotResponse = {
        message: 'Generating...',
        type: 'deferred',
      };
      botGatewayService.handleInteraction.mockResolvedValue(deferredResponse);

      const result = await controller.handleDiscordInteraction(
        makeReq(Buffer.from('body')),
        { type: 2 },
        'valid-sig',
        '12345',
      );

      expect(discordAdapter.buildImmediateResponse).toHaveBeenCalledWith(
        BotResponseType.DEFERRED_CHANNEL_MESSAGE,
      );
      expect(result).toEqual({ type: 5 });
    });

    it('handles APPLICATION_COMMAND with text response', async () => {
      discordAdapter.validateSignature.mockResolvedValue(true);
      discordAdapter.getInteractionType.mockReturnValue(
        BotInteractionType.APPLICATION_COMMAND,
      );
      discordAdapter.buildImmediateResponse.mockReturnValue({
        data: { content: 'Hello' },
        type: 4,
      });

      const textResponse: IBotResponse = {
        message: 'Hello',
        type: 'text',
      };
      botGatewayService.handleInteraction.mockResolvedValue(textResponse);

      const result = await controller.handleDiscordInteraction(
        makeReq(Buffer.from('body')),
        { type: 2 },
        'valid-sig',
        '12345',
      );

      expect(discordAdapter.buildImmediateResponse).toHaveBeenCalledWith(
        BotResponseType.CHANNEL_MESSAGE,
        'Hello',
      );
      expect(result).toEqual({ data: { content: 'Hello' }, type: 4 });
    });

    it('handles APPLICATION_COMMAND with media response', async () => {
      discordAdapter.validateSignature.mockResolvedValue(true);
      discordAdapter.getInteractionType.mockReturnValue(
        BotInteractionType.APPLICATION_COMMAND,
      );

      const mediaResponse: IBotResponse = {
        mediaType: 'image',
        mediaUrl: 'https://cdn.example.com/img.png',
        message: 'Here you go',
        type: 'media',
      };
      botGatewayService.handleInteraction.mockResolvedValue(mediaResponse);

      const result = await controller.handleDiscordInteraction(
        makeReq(Buffer.from('body')),
        { type: 2 },
        'valid-sig',
        '12345',
      );

      expect(result).toEqual({
        data: {
          content: 'Here you go',
          embeds: [{ image: { url: 'https://cdn.example.com/img.png' } }],
        },
        type: BotResponseType.CHANNEL_MESSAGE,
      });
    });

    it('returns unsupported message for unknown interaction type', async () => {
      discordAdapter.validateSignature.mockResolvedValue(true);
      discordAdapter.getInteractionType.mockReturnValue(null);

      const result = await controller.handleDiscordInteraction(
        makeReq(Buffer.from('body')),
        { type: 99 },
        'valid-sig',
        '12345',
      );

      expect(discordAdapter.buildImmediateResponse).toHaveBeenCalledWith(
        BotResponseType.CHANNEL_MESSAGE,
        'Unsupported interaction type',
      );
      expect(result).toBeDefined();
    });
  });

  // ── Telegram ─────────────────────────────────────────────────────────

  describe('handleTelegramEvent', () => {
    const makeReq = (rawBody?: Buffer) =>
      ({
        rawBody,
      }) as unknown as import('@nestjs/common').RawBodyRequest<Request>;

    it('rejects invalid webhook secret', async () => {
      telegramAdapter.validateSignature.mockResolvedValue(false);

      await expect(
        controller.handleTelegramEvent(
          makeReq(Buffer.from('{}')),
          {},
          'bad-token',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('returns ok for non-command interactions', async () => {
      telegramAdapter.validateSignature.mockResolvedValue(true);
      telegramAdapter.getInteractionType.mockReturnValue(null);

      const result = await controller.handleTelegramEvent(
        makeReq(Buffer.from('{}')),
        {},
        'valid-token',
      );

      expect(result).toEqual({ ok: true });
      expect(botGatewayService.handleInteraction).not.toHaveBeenCalled();
    });
  });

  // ── Slack ────────────────────────────────────────────────────────────

  describe('handleSlackEvent', () => {
    const makeReq = (rawBody?: Buffer) =>
      ({
        rawBody,
      }) as unknown as import('@nestjs/common').RawBodyRequest<Request>;

    it('responds to Slack url_verification challenge', async () => {
      const result = await controller.handleSlackEvent(
        makeReq(undefined),
        { challenge: 'abc123', type: 'url_verification' },
        '',
        '',
      );

      expect(result).toEqual({ challenge: 'abc123' });
    });

    it('throws when raw body is missing on non-verification request', async () => {
      await expect(
        controller.handleSlackEvent(
          makeReq(undefined),
          { type: 'event_callback' },
          'sig',
          'ts',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
