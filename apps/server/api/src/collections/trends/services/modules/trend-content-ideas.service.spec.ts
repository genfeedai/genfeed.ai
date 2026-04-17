import { ModelsService } from '@api/collections/models/services/models.service';
import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { TrendContentIdeasService } from './trend-content-ideas.service';

const makeTrend = (
  platform: string,
  topic: string,
  viralityScore = 80,
): TrendEntity =>
  ({
    _id: new Types.ObjectId(),
    expiresAt: new Date(),
    growthRate: 5,
    isCurrent: true,
    isDeleted: false,
    mentions: 1000,
    metadata: {},
    platform,
    requiresAuth: false,
    topic,
    viralityScore,
  }) as unknown as TrendEntity;

const validIdeasJson = JSON.stringify([
  {
    caption: 'Check this out!',
    contentType: 'video',
    description: 'A great video idea',
    estimatedViews: '10K-50K',
    hashtags: ['#trending'],
    title: 'Video Idea 1',
  },
]);

describe('TrendContentIdeasService', () => {
  let service: TrendContentIdeasService;
  let replicateService: {
    generateTextCompletionSync: ReturnType<typeof vi.fn>;
  };
  let modelsService: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    replicateService = {
      generateTextCompletionSync: vi.fn().mockResolvedValue(validIdeasJson),
    };
    modelsService = {
      findOne: vi.fn().mockResolvedValue({
        cost: 1,
        minCost: 1,
        pricingType: 'fixed',
      }),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendContentIdeasService,
        { provide: ModelsService, useValue: modelsService },
        { provide: ReplicateService, useValue: replicateService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<TrendContentIdeasService>(TrendContentIdeasService);

    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      callback: TimerHandler,
    ) => {
      if (typeof callback === 'function') {
        callback();
      }

      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sanitizeForPrompt', () => {
    it('removes angle brackets', () => {
      expect(service.sanitizeForPrompt('<script>alert(1)</script>')).toBe(
        'scriptalert(1)/script',
      );
    });

    it('collapses 3+ consecutive newlines to 2', () => {
      expect(service.sanitizeForPrompt('a\n\n\n\nb')).toBe('a\n\nb');
    });

    it('truncates strings longer than 2000 characters', () => {
      const long = 'x'.repeat(2500);
      expect(service.sanitizeForPrompt(long)).toHaveLength(2000);
    });

    it('converts numbers to strings', () => {
      expect(service.sanitizeForPrompt(42)).toBe('42');
    });

    it('returns short strings unchanged', () => {
      expect(service.sanitizeForPrompt('hello world')).toBe('hello world');
    });
  });

  describe('parseAIResponse', () => {
    it('parses a valid JSON array from response', () => {
      const ideas = service.parseAIResponse(validIdeasJson, 'tiktok');
      expect(ideas).toHaveLength(1);
      expect(ideas[0].title).toBe('Video Idea 1');
    });

    it('throws when no JSON array found', () => {
      expect(() =>
        service.parseAIResponse('No JSON here at all.', 'tiktok'),
      ).toThrow('No JSON array found in response');
    });

    it('throws before the malformed-JSON graceful catch when no array exists', () => {
      expect(() =>
        service.parseAIResponse('Just some text', 'instagram'),
      ).toThrow('No JSON array found in response');
    });

    it('returns empty array on malformed JSON', () => {
      const result = service.parseAIResponse('[{broken json,,}]', 'twitter');
      expect(result).toEqual([]);
    });

    it('returns empty array when ideas are missing required fields', () => {
      const badIdeas = JSON.stringify([
        { title: 'No description or contentType' },
      ]);
      const result = service.parseAIResponse(badIdeas, 'tiktok');
      expect(result).toEqual([]);
    });
  });

  describe('callWithRetry', () => {
    it('returns the result on first success', async () => {
      const op = vi.fn().mockResolvedValue('done');
      const result = await service.callWithRetry(op, 3, 0);
      expect(result).toBe('done');
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries and succeeds on second attempt', async () => {
      const op = vi
        .fn()
        .mockRejectedValueOnce(new Error('Transient'))
        .mockResolvedValue('ok');

      const result = await service.callWithRetry(op, 3, 0);
      expect(result).toBe('ok');
      expect(op).toHaveBeenCalledTimes(2);
    }, 10000);

    it('throws after all retries are exhausted', async () => {
      const op = vi.fn().mockRejectedValue(new Error('Always fails'));

      await expect(service.callWithRetry(op, 2, 0)).rejects.toThrow(
        'Always fails',
      );
      expect(op).toHaveBeenCalledTimes(2);
    }, 10000);
  });

  describe('generateContentIdeas', () => {
    it('returns a map keyed by platform', async () => {
      const trends = [makeTrend('tiktok', 'dance challenge', 90)];

      const result = await service.generateContentIdeas(trends, 5);

      expect(result).toBeInstanceOf(Map);
      expect(result.has('tiktok')).toBe(true);
    });

    it('groups trends by platform and calls provider once per platform', async () => {
      const trends = [
        makeTrend('tiktok', 'trend-1'),
        makeTrend('tiktok', 'trend-2'),
        makeTrend('instagram', 'reel-trend'),
      ];

      await service.generateContentIdeas(trends, 6);

      // Two platforms → two AI calls
      expect(replicateService.generateTextCompletionSync).toHaveBeenCalledTimes(
        2,
      );
    });

    it('returns empty map and logs error when provider throws', async () => {
      replicateService.generateTextCompletionSync.mockRejectedValue(
        new Error('API down'),
      );

      const result = await service.generateContentIdeas(
        [makeTrend('tiktok', 'test')],
        5,
      );

      // generateContentIdeas catches top-level error → returns partial/empty
      expect(result).toBeInstanceOf(Map);
    });

    it('returns empty map for empty trends input', async () => {
      const result = await service.generateContentIdeas([], 10);
      expect(result.size).toBe(0);
      expect(
        replicateService.generateTextCompletionSync,
      ).not.toHaveBeenCalled();
    });

    it('calls replicate with correct model key', async () => {
      await service.generateContentIdeas([makeTrend('youtube', 'shorts')], 3);

      expect(replicateService.generateTextCompletionSync).toHaveBeenCalledWith(
        DEFAULT_TEXT_MODEL,
        expect.objectContaining({ prompt: expect.any(String) }),
      );
    });
  });
});
