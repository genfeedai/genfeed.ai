import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApifyPinterestPin } from '../../interfaces/apify.interfaces';
import { ApifyBaseService } from './apify-base.service';
import { ApifyPinterestService } from './apify-pinterest.service';

vi.mock('./apify-base.service');

const makePinterestPin = (
  overrides: Partial<ApifyPinterestPin> = {},
): ApifyPinterestPin =>
  ({
    commentCount: 10,
    description: 'A beautiful pin about travel',
    imageUrl: 'https://i.pinimg.com/test.jpg',
    link: 'https://pinterest.com/pin/123',
    repinCount: 500,
    title: 'Trending Travel Pin',
    ...overrides,
  }) as ApifyPinterestPin;

describe('ApifyPinterestService', () => {
  let service: ApifyPinterestService;

  const mockBaseService = {
    ACTORS: {
      PINTEREST_SCRAPER: 'alexey/pinterest-scraper',
    },
    calculateGrowthRate: vi.fn().mockReturnValue(12.5),
    calculateViralityScore: vi.fn().mockReturnValue(85),
    loggerService: {
      error: vi.fn(),
    },
    runActor: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifyPinterestService,
        {
          provide: ApifyBaseService,
          useValue: mockBaseService,
        },
      ],
    }).compile();

    service = module.get<ApifyPinterestService>(ApifyPinterestService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPinterestTrends()', () => {
    it('should return normalized trend data from pinterest pins', async () => {
      const pins = [
        makePinterestPin(),
        makePinterestPin({ title: 'Another Pin' }),
      ];
      mockBaseService.runActor.mockResolvedValue(pins);

      const result = await service.getPinterestTrends();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        growthRate: 12.5,
        mentions: 500,
        platform: 'pinterest',
        topic: 'Trending Travel Pin',
        viralityScore: 85,
      });
    });

    it('should use default limit of 20', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getPinterestTrends();

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'alexey/pinterest-scraper',
        expect.objectContaining({ maxItems: 20 }),
      );
    });

    it('should respect custom limit in options', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getPinterestTrends({ limit: 10 });

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'alexey/pinterest-scraper',
        expect.objectContaining({ maxItems: 10 }),
      );
    });

    it('should pass correct search terms', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getPinterestTrends();

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'alexey/pinterest-scraper',
        expect.objectContaining({
          searchTerms: ['trending', 'viral', 'popular'],
        }),
      );
    });

    it('should return empty array on error', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('API error'));

      const result = await service.getPinterestTrends();

      expect(result).toEqual([]);
      expect(mockBaseService.loggerService.error).toHaveBeenCalled();
    });

    it('should normalize metadata correctly', async () => {
      const pin = makePinterestPin({
        commentCount: 25,
        imageUrl: 'https://i.pinimg.com/thumb.jpg',
        link: 'https://example.com/source',
        repinCount: 300,
      });
      mockBaseService.runActor.mockResolvedValue([pin]);

      const result = await service.getPinterestTrends();

      expect(result[0].metadata).toMatchObject({
        commentCount: 25,
        hashtags: [],
        repinCount: 300,
        source: 'apify',
        thumbnailUrl: 'https://i.pinimg.com/thumb.jpg',
        trendType: 'topic',
        urls: ['https://example.com/source'],
      });
    });

    it('should handle pins with missing title using description fallback', async () => {
      const pin = makePinterestPin({
        description: 'A very long description that should be truncated',
        title: undefined,
      });
      mockBaseService.runActor.mockResolvedValue([pin]);

      const result = await service.getPinterestTrends();

      expect(result[0].topic).toBe(
        'A very long description that should be truncated'.substring(0, 50),
      );
    });

    it('should handle pins with no title or description', async () => {
      const pin = makePinterestPin({
        description: undefined,
        title: undefined,
      });
      mockBaseService.runActor.mockResolvedValue([pin]);

      const result = await service.getPinterestTrends();

      expect(result[0].topic).toBe('Trending Pin');
    });

    it('should handle pins with no link', async () => {
      const pin = makePinterestPin({ link: undefined });
      mockBaseService.runActor.mockResolvedValue([pin]);

      const result = await service.getPinterestTrends();

      expect(result[0].metadata.urls).toEqual([]);
    });

    it('should handle pins with zero repinCount', async () => {
      const pin = makePinterestPin({ repinCount: 0 });
      mockBaseService.runActor.mockResolvedValue([pin]);

      const result = await service.getPinterestTrends();

      expect(result[0].mentions).toBe(0);
      expect(mockBaseService.calculateGrowthRate).toHaveBeenCalledWith(0);
      expect(mockBaseService.calculateViralityScore).toHaveBeenCalledWith(
        0,
        expect.any(Number),
      );
    });
  });
});
