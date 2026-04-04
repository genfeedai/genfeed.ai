import { ConfigService } from '@api/config/config.service';
import {
  BotCommandType,
  BotInteractionType,
  BotResponseType,
  CredentialPlatform,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { SlackBotAdapter } from './slack-bot.adapter';

const SIGNING_SECRET = 'test-signing-secret';

describe('SlackBotAdapter', () => {
  let adapter: SlackBotAdapter;
  let configService: vi.Mocked<ConfigService>;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackBotAdapter,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue(SIGNING_SECRET) },
        },
        {
          provide: HttpService,
          useValue: { post: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    adapter = module.get(SlackBotAdapter);
    configService = module.get(ConfigService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('exposes meta platform as SLACK', () => {
    expect(adapter.platform).toBe(CredentialPlatform.SLACK);
  });

  // ── validateSignature ─────────────────────────────────────────────────────

  describe('validateSignature', () => {
    const timestamp = '1531420618';
    const body = 'token=xyzz0WbapA4vBCDEFasx0q6G&...';

    function buildExpectedSig(secret: string, ts: string, b: string) {
      const { createHmac } = require('node:crypto');
      const sigBase = `v0:${ts}:${b}`;
      const hmac = createHmac('sha256', secret);
      hmac.update(sigBase);
      return `v0=${hmac.digest('hex')}`;
    }

    it('returns true for a valid signature', () => {
      const sig = buildExpectedSig(SIGNING_SECRET, timestamp, body);
      expect(adapter.validateSignature(body, sig, timestamp)).toBe(true);
    });

    it('returns false for a tampered body', () => {
      const sig = buildExpectedSig(SIGNING_SECRET, timestamp, body);
      expect(adapter.validateSignature('tampered-body', sig, timestamp)).toBe(
        false,
      );
    });

    it('returns false when signing secret is not configured', () => {
      configService.get.mockReturnValue(undefined as never);
      // Re-create to pick up undefined secret
      const adapterNoSecret = new SlackBotAdapter(
        { get: vi.fn().mockReturnValue(undefined) } as never,
        httpService as never,
        loggerService as never,
      );
      const sig = buildExpectedSig(SIGNING_SECRET, timestamp, body);
      expect(adapterNoSecret.validateSignature(body, sig, timestamp)).toBe(
        false,
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('returns false when timestamp is missing', () => {
      expect(adapter.validateSignature(body, 'v0=whatever', undefined)).toBe(
        false,
      );
      expect(loggerService.warn).toHaveBeenCalled();
    });
  });

  // ── getInteractionType ────────────────────────────────────────────────────

  describe('getInteractionType', () => {
    it('returns PING for url_verification type', () => {
      expect(adapter.getInteractionType({ type: 'url_verification' })).toBe(
        BotInteractionType.PING,
      );
    });

    it('returns APPLICATION_COMMAND for slash command payload', () => {
      expect(adapter.getInteractionType({ command: '/status', text: '' })).toBe(
        BotInteractionType.APPLICATION_COMMAND,
      );
    });

    it('returns null for unknown payload', () => {
      expect(adapter.getInteractionType({ some: 'random' })).toBeNull();
    });
  });

  // ── parseMessage ──────────────────────────────────────────────────────────

  describe('parseMessage', () => {
    const baseCommand = {
      channel_id: 'C123',
      command: '/status',
      response_url: 'https://hooks.slack.com/actions/...',
      team_id: 'T123',
      text: '',
      trigger_id: 'trig1',
      user_id: 'U123',
      user_name: 'alice',
    };

    it('parses /status command', () => {
      const result = adapter.parseMessage(baseCommand);
      expect(result).toMatchObject({
        command: BotCommandType.STATUS,
        platform: CredentialPlatform.SLACK,
        platformUserId: 'U123',
      });
    });

    it('parses /prompt-image command and sets prompt', () => {
      const result = adapter.parseMessage({
        ...baseCommand,
        command: '/prompt-image',
        text: 'a cat on mars',
      });
      expect(result).toMatchObject({
        command: BotCommandType.PROMPT_IMAGE,
        prompt: 'a cat on mars',
      });
    });

    it('parses /set-brand command and sets brandName', () => {
      const result = adapter.parseMessage({
        ...baseCommand,
        command: '/set-brand',
        text: 'MyBrand',
      });
      expect(result).toMatchObject({
        brandName: 'MyBrand',
        command: BotCommandType.SET_BRAND,
      });
    });

    it('returns null for unknown command', () => {
      const result = adapter.parseMessage({
        ...baseCommand,
        command: '/unknown',
      });
      expect(result).toBeNull();
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('returns null when command field is missing', () => {
      const result = adapter.parseMessage({ user_id: 'U1' });
      expect(result).toBeNull();
    });
  });

  // ── buildImmediateResponse ────────────────────────────────────────────────

  describe('buildImmediateResponse', () => {
    it('returns pong response', () => {
      const result = adapter.buildImmediateResponse(BotResponseType.PONG);
      expect(result).toEqual({ type: BotResponseType.PONG });
    });

    it('returns deferred in_channel response', () => {
      const result = adapter.buildImmediateResponse(
        BotResponseType.DEFERRED_CHANNEL_MESSAGE,
      );
      expect(result).toMatchObject({ response_type: 'in_channel' });
    });

    it('returns message response with text blocks', () => {
      const result = adapter.buildImmediateResponse(
        'custom' as BotResponseType,
        'Hello!',
      );
      expect(result).toMatchObject({
        response_type: 'in_channel',
        text: 'Hello!',
      });
    });
  });

  // ── sendFollowupMessage ───────────────────────────────────────────────────

  describe('sendFollowupMessage', () => {
    it('posts message to response URL', async () => {
      httpService.post.mockReturnValue(of({ data: 'ok' }) as never);

      await adapter.sendFollowupMessage(
        'T123',
        'https://hooks.slack.com/r',
        'Done!',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/r',
        expect.objectContaining({ text: 'Done!' }),
        expect.any(Object),
      );
    });

    it('throws when http post fails', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('HTTP error')),
      );

      await expect(
        adapter.sendFollowupMessage('T123', 'https://hooks.slack.com/r', 'Hi'),
      ).rejects.toThrow('HTTP error');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── sendFollowupMedia ─────────────────────────────────────────────────────

  describe('sendFollowupMedia', () => {
    it('sends image blocks for image type', async () => {
      httpService.post.mockReturnValue(of({ data: 'ok' }) as never);

      await adapter.sendFollowupMedia(
        'T123',
        'https://hooks.slack.com/r',
        'https://cdn.example.com/img.jpg',
        'image',
        'My image',
      );

      const payload = httpService.post.mock.calls[0][1] as {
        blocks: Array<{ type: string }>;
      };
      const types = payload.blocks.map((b) => b.type);
      expect(types).toContain('image');
    });

    it('sends link section for video type', async () => {
      httpService.post.mockReturnValue(of({ data: 'ok' }) as never);

      await adapter.sendFollowupMedia(
        'T123',
        'https://hooks.slack.com/r',
        'https://cdn.example.com/vid.mp4',
        'video',
      );

      const payload = httpService.post.mock.calls[0][1] as {
        blocks: Array<{ type: string }>;
      };
      expect(payload.blocks.every((b) => b.type === 'section')).toBe(true);
    });
  });
});
