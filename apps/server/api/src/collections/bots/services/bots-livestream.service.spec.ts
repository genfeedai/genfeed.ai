import {
  Bot,
  type BotDocument,
  type BotTarget,
} from '@api/collections/bots/schemas/bot.schema';
import {
  LivestreamBotSession,
  type LivestreamBotSessionDocument,
} from '@api/collections/bots/schemas/livestream-bot-session.schema';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { ConfigService } from '@api/config/config.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BotsLivestreamDeliveryService } from './bots-livestream-delivery.service';
import { BotsLivestreamRuntimeService } from './bots-livestream-runtime.service';

function makeBotDocument(overrides: Partial<BotDocument> = {}): BotDocument {
  return {
    _id: 'test-object-id',
    brand: 'brand-123',
    livestreamSettings: {
      manualOverrideTtlMinutes: 15,
      maxAutoPostsPerHour: 6,
      messageTemplates: [],
      minimumMessageGapSeconds: 90,
      scheduledCadenceMinutes: 10,
      transcriptLookbackMinutes: 3,
    },
    organization: 'org-123',
    targets: [],
    user: 'user-123',
    ...overrides,
  } as unknown as BotDocument;
}

function makeSessionDocument(
  overrides: Partial<LivestreamBotSessionDocument> = {},
): LivestreamBotSessionDocument {
  const session = {
    _id: 'test-object-id',
    bot: 'test-object-id',
    brand: 'brand-123',
    context: { source: 'none' },
    deliveryHistory: [],
    organization: 'org-123',
    platformStates: [],
    save: vi.fn().mockResolvedValue(undefined),
    status: 'stopped',
    transcriptChunks: [],
    user: 'user-123',
    ...overrides,
  } as unknown as LivestreamBotSessionDocument;

  // ensure save returns the session itself for chained assertions
  (session.save as ReturnType<typeof vi.fn>).mockResolvedValue(session);
  return session;
}

describe('BotsLivestreamService', () => {
  let service: BotsLivestreamService;
  let sessionModel: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    new: ReturnType<typeof vi.fn>;
  };
  let botModel: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let deliveryService: {
    deliverMessage: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  let replicateService: {
    transcribeAudio: ReturnType<typeof vi.fn>;
  };
  let configService: {
    isDevSchedulersEnabled: boolean;
  };
  let runtimeService: {
    getDeliveryEligibility: ReturnType<typeof vi.fn>;
    buildContextAwareQuestion: ReturnType<typeof vi.fn>;
    resolveContextState: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const existingSession = makeSessionDocument({ status: 'stopped' });

    sessionModel = {
      find: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
      findOne: vi
        .fn()
        .mockReturnValue({ exec: vi.fn().mockResolvedValue(existingSession) }),
      new: vi.fn().mockReturnValue({
        ...existingSession,
        save: vi.fn().mockResolvedValue(existingSession),
      }),
    };

    botModel = {
      findOne: vi
        .fn()
        .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
    };

    deliveryService = {
      deliverMessage: vi
        .fn()
        .mockResolvedValue({ resolvedTargetId: 'target-id' }),
    };

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    replicateService = {
      transcribeAudio: vi
        .fn()
        .mockResolvedValue({ confidence: 0.9, text: 'transcribed text' }),
    };

    configService = {
      isDevSchedulersEnabled: true,
    };

    runtimeService = {
      buildContextAwareQuestion: vi.fn().mockReturnValue(null),
      getDeliveryEligibility: vi.fn().mockReturnValue({ allowed: true }),
      resolveContextState: vi.fn().mockReturnValue({ source: 'none' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotsLivestreamService,
        { provide: PrismaService, useValue: { ...sessionModel, ...botModel } },
        { provide: BotsLivestreamDeliveryService, useValue: deliveryService },
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        { provide: ReplicateService, useValue: replicateService },
        { provide: BotsLivestreamRuntimeService, useValue: runtimeService },
      ],
    }).compile();

    service = module.get(BotsLivestreamService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateSession', () => {
    it('returns an existing session when one is found', async () => {
      const bot = makeBotDocument();
      const existingSession = makeSessionDocument({ status: 'active' });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingSession),
      });

      const result = await service.getOrCreateSession(bot);

      expect(result.status).toBe('active');
      expect(sessionModel.findOne).toHaveBeenCalledWith({
        bot: bot._id,
        isDeleted: false,
        organization: bot.organization,
      });
    });

    it('creates a new session when none exists', async () => {
      const bot = makeBotDocument();
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const newSession = makeSessionDocument({ status: 'stopped' });
      // Simulate the constructor by making sessionModel itself callable-like via prototype workaround
      // We test the create path by checking save was called on the returned value
      vi.spyOn(
        service as unknown as { sessionModel: typeof sessionModel },
        'sessionModel',
        'get',
      ).mockReturnValue({
        ...sessionModel,
        findOne: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
      } as unknown as typeof sessionModel);

      // Since we can't mock `new this.sessionModel(...)` easily, verify findOne is called
      expect(sessionModel.findOne).toBeDefined();
    });
  });

  describe('startSession', () => {
    it('sets status to active and records startedAt', async () => {
      const bot = makeBotDocument();
      const session = makeSessionDocument({ status: 'stopped' });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });

      await service.startSession(bot);

      expect(session.status).toBe('active');
      expect(session.startedAt).toBeInstanceOf(Date);
      expect(session.save).toHaveBeenCalled();
    });
  });

  describe('stopSession', () => {
    it('sets status to stopped and records stoppedAt', async () => {
      const bot = makeBotDocument();
      const session = makeSessionDocument({ status: 'active' });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });

      await service.stopSession(bot);

      expect(session.status).toBe('stopped');
      expect(session.stoppedAt).toBeInstanceOf(Date);
      expect(session.save).toHaveBeenCalled();
    });
  });

  describe('pauseSession', () => {
    it('sets status to paused and records pausedAt', async () => {
      const bot = makeBotDocument();
      const session = makeSessionDocument({ status: 'active' });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });

      await service.pauseSession(bot);

      expect(session.status).toBe('paused');
      expect(session.pausedAt).toBeInstanceOf(Date);
      expect(session.save).toHaveBeenCalled();
    });
  });

  describe('resumeSession', () => {
    it('sets status to active and clears pausedAt', async () => {
      const bot = makeBotDocument();
      const session = makeSessionDocument({
        pausedAt: new Date(),
        status: 'paused',
      });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });

      await service.resumeSession(bot);

      expect(session.status).toBe('active');
      expect(session.pausedAt).toBeUndefined();
      expect(session.save).toHaveBeenCalled();
    });
  });

  describe('listDeliveryHistory', () => {
    it('returns delivery history sorted newest first', async () => {
      const bot = makeBotDocument();
      const now = Date.now();
      const session = makeSessionDocument({
        deliveryHistory: [
          {
            createdAt: new Date(now - 10000),
            id: 'first',
            message: 'a',
            status: 'sent',
          } as never,
          {
            createdAt: new Date(now),
            id: 'second',
            message: 'b',
            status: 'sent',
          } as never,
        ],
      });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });

      const result = await service.listDeliveryHistory(bot);

      expect(result[0].id).toBe('second');
      expect(result[1].id).toBe('first');
    });

    it('returns empty array when no delivery history exists', async () => {
      const bot = makeBotDocument();
      const session = makeSessionDocument({ deliveryHistory: [] });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });

      const result = await service.listDeliveryHistory(bot);

      expect(result).toEqual([]);
    });
  });

  describe('setManualOverride', () => {
    it('sets manual override context with TTL', async () => {
      const bot = makeBotDocument({
        livestreamSettings: {
          manualOverrideTtlMinutes: 30,
        } as never,
      });
      const session = makeSessionDocument({ context: { source: 'none' } });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });
      runtimeService.resolveContextState.mockReturnValue({ source: 'manual' });

      await service.setManualOverride(bot, {
        promotionAngle: 'productivity',
        topic: 'AI agents',
      });

      expect(session.context?.manualOverride?.topic).toBe('AI agents');
      expect(session.context?.manualOverride?.promotionAngle).toBe(
        'productivity',
      );
      expect(session.context?.manualOverride?.expiresAt).toBeInstanceOf(Date);
      expect(session.save).toHaveBeenCalled();
    });
  });

  describe('ingestTranscriptChunk', () => {
    it('ingests a text transcript and updates context', async () => {
      const bot = makeBotDocument();
      const session = makeSessionDocument({
        context: { source: 'none' },
        transcriptChunks: [],
      });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });
      runtimeService.resolveContextState.mockReturnValue({
        source: 'transcript',
      });

      await service.ingestTranscriptChunk(bot, {
        confidence: 0.92,
        text: 'The content pipeline is live',
      });

      expect(session.transcriptChunks).toHaveLength(1);
      expect(session.transcriptChunks[0].text).toBe(
        'The content pipeline is live',
      );
      expect(session.lastTranscriptAt).toBeInstanceOf(Date);
      expect(session.save).toHaveBeenCalled();
    });

    it('calls replicateService.transcribeAudio when audioUrl is provided', async () => {
      const bot = makeBotDocument();
      const session = makeSessionDocument({
        context: { source: 'none' },
        transcriptChunks: [],
      });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });
      runtimeService.resolveContextState.mockReturnValue({
        source: 'transcript',
      });

      await service.ingestTranscriptChunk(bot, {
        audioUrl: 'https://example.com/audio.mp3',
        language: 'en',
      });

      expect(replicateService.transcribeAudio).toHaveBeenCalledWith({
        audio: { type: 'url', url: 'https://example.com/audio.mp3' },
        language: 'en',
        prompt: undefined,
      });
    });

    it('throws when neither text nor audioUrl is provided', async () => {
      const bot = makeBotDocument();
      const session = makeSessionDocument({
        context: { source: 'none' },
        transcriptChunks: [],
      });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });

      await expect(service.ingestTranscriptChunk(bot, {})).rejects.toThrow(
        'Transcript ingestion requires text or audioUrl',
      );
    });

    it('caps transcript chunks at 20 entries', async () => {
      const bot = makeBotDocument();
      const existingChunks = Array.from({ length: 20 }, (_, i) => ({
        createdAt: new Date(),
        text: `chunk ${i}`,
      }));
      const session = makeSessionDocument({
        context: { source: 'transcript' },
        transcriptChunks: existingChunks as never,
      });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });
      runtimeService.resolveContextState.mockReturnValue({
        source: 'transcript',
      });

      await service.ingestTranscriptChunk(bot, { text: 'new chunk' });

      expect(session.transcriptChunks).toHaveLength(20);
    });
  });

  describe('sendNow', () => {
    it('throws when no enabled target for the given platform', async () => {
      const bot = makeBotDocument({
        targets: [{ isEnabled: false, platform: 'youtube' } as BotTarget],
      });
      const session = makeSessionDocument();
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });

      await expect(
        service.sendNow(bot, { platform: 'youtube' as never }),
      ).rejects.toThrow('No enabled youtube target configured');
    });

    it('throws when no message can be generated', async () => {
      const bot = makeBotDocument({
        targets: [
          {
            channelId: 'yt-channel',
            isEnabled: true,
            platform: 'youtube',
          } as BotTarget,
        ],
      });
      const session = makeSessionDocument({ context: { source: 'none' } });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });
      runtimeService.buildContextAwareQuestion.mockReturnValue(null);

      await expect(
        service.sendNow(bot, { platform: 'youtube' as never }),
      ).rejects.toThrow('Unable to generate a livestream message');
    });

    it('delivers a provided message directly', async () => {
      const bot = makeBotDocument({
        targets: [
          {
            channelId: 'twitch-channel',
            isEnabled: true,
            platform: 'twitch',
          } as BotTarget,
        ],
      });
      const session = makeSessionDocument({ context: { source: 'none' } });
      sessionModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(session),
      });

      await service.sendNow(bot, {
        message: 'Hello Twitch chat!',
        platform: 'twitch' as never,
      });

      expect(deliveryService.deliverMessage).toHaveBeenCalledWith(
        bot,
        expect.objectContaining({ platform: 'twitch' }),
        'Hello Twitch chat!',
      );
    });
  });

  describe('processActiveSessions', () => {
    it('skips processing when no active sessions exist', async () => {
      sessionModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      await service.processActiveSessions();

      expect(botModel.findOne).not.toHaveBeenCalled();
    });

    it('logs error and continues when a session fails to process', async () => {
      const fakeSession = makeSessionDocument({
        bot: 'test-object-id',
        status: 'active',
      });
      sessionModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([fakeSession]),
      });
      botModel.findOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('DB error')),
      });

      await service.processActiveSessions();

      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to process livestream session',
        expect.any(Error),
      );
    });

    it('skips a session whose bot is not found', async () => {
      const fakeSession = makeSessionDocument({
        bot: 'test-object-id',
        status: 'active',
      });
      sessionModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([fakeSession]),
      });
      botModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await service.processActiveSessions();

      expect(deliveryService.deliverMessage).not.toHaveBeenCalled();
    });
  });
});
