import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApifyPinterestPin } from '../../interfaces/apify.interfaces';
import { ApifyBaseService } from './apify-base.service';
import { ApifyPinterestService } from './apify-pinterest.service';

vi.mock('./apify-base.service');

const makePinterestPin = (
  overrides: {
    commentCount?: number;
    description?: string;
    id?: string;
    imageUrl?: string;
    isPromoted?: boolean;
    repinCount?: number;
    title?: string;
    url?: string;
  } = {},
): ApifyPinterestPin => {
  const values = {
    commentCount: 10,
    description: 'A beautiful pin about travel',
    imageUrl: 'https://i.pinimg.com/test.jpg',
    repinCount: 500,
    title: 'Trending Travel Pin',
    url: 'https://www.pinterest.com/pin/123/',
    ...overrides,
  };
  return {
    id: values.id ?? '123',
    media: { images: { large: { url: values.imageUrl } } },
    pin: {
      comment_count: values.commentCount,
      description: values.description,
      is_promoted: values.isPromoted ?? false,
      repin_count: values.repinCount,
      title: values.title,
    },
    title: values.title,
    url: values.url,
  };
};

describe('ApifyPinterestService', () => {
  let service: ApifyPinterestService;

  const mockBaseService = {
    ACTORS: {
      PINTEREST_SCRAPER: 'fatihtahta/pinterest-scraper-search',
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
        makePinterestPin({ id: '456', title: 'Another Pin' }),
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
        'fatihtahta/pinterest-scraper-search',
        expect.objectContaining({ limit: 7, type: 'all-pins' }),
      );
    });

    it('should respect custom limit in options', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getPinterestTrends({ limit: 10 });

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'fatihtahta/pinterest-scraper-search',
        expect.objectContaining({ limit: 4 }),
      );
    });

    it('should pass correct search terms', async () => {
      mockBaseService.runActor.mockResolvedValue([]);

      await service.getPinterestTrends();

      expect(mockBaseService.runActor).toHaveBeenCalledWith(
        'fatihtahta/pinterest-scraper-search',
        expect.objectContaining({
          queries: ['trending', 'viral', 'popular'],
        }),
      );
    });

    it('caps output to the requested total and drops promoted and repeated pins', async () => {
      mockBaseService.runActor.mockResolvedValue([
        { ...makePinterestPin({ isPromoted: true, title: 'Ad' }), id: 'ad' },
        { ...makePinterestPin({ title: 'One' }), id: 'one' },
        { ...makePinterestPin({ title: 'One again' }), id: 'one' },
        { ...makePinterestPin({ title: 'Two' }), id: 'two' },
        { ...makePinterestPin({ title: 'Three' }), id: 'three' },
      ]);

      const result = await service.getPinterestTrends({ limit: 2 });

      expect(result.map((trend) => trend.topic)).toEqual(['One', 'Two']);
    });

    it('rethrows provider failures instead of returning an empty list', async () => {
      mockBaseService.runActor.mockRejectedValue(new Error('API error'));

      await expect(service.getPinterestTrends()).rejects.toThrow('API error');
      expect(mockBaseService.loggerService.error).toHaveBeenCalled();
    });

    it('should normalize metadata correctly', async () => {
      const pin = makePinterestPin({
        commentCount: 25,
        imageUrl: 'https://i.pinimg.com/thumb.jpg',
        repinCount: 300,
        url: 'https://www.pinterest.com/pin/456/',
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
        urls: ['https://www.pinterest.com/pin/456/'],
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

    it('should handle pins with no url', async () => {
      const pin = makePinterestPin({ url: undefined });
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
