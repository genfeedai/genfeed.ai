import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import type { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('OptimizersService', () => {
  let service: OptimizersService;
  let mockReplicateService: {
    generateTextCompletionSync: ReturnType<typeof vi.fn>;
  };
  let mockModelsService: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let mockContentScoreModel: ReturnType<typeof vi.fn> &
    Record<string, ReturnType<typeof vi.fn>>;
  let mockOptimizationModel: ReturnType<typeof vi.fn> &
    Record<string, ReturnType<typeof vi.fn>>;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    mockReplicateService = {
      generateTextCompletionSync: vi.fn().mockResolvedValue('{}'),
    };
    mockModelsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };

    const contentScoreModelFn = function (
      this: Record<string, unknown>,
      dto: Record<string, unknown>,
    ) {
      Object.assign(this, dto);
      this._id = { toString: () => 'mock-score-id' };
      this.save = vi.fn().mockResolvedValue(undefined);
      this.toObject = vi.fn().mockReturnValue(dto);
    };
    mockContentScoreModel = contentScoreModelFn as never;

    const optimizationModelFn = function (
      this: Record<string, unknown>,
      dto: Record<string, unknown>,
    ) {
      Object.assign(this, dto);
      this._id = { toString: () => 'mock-opt-id' };
      this.save = vi.fn().mockResolvedValue(undefined);
    };
    (optimizationModelFn as unknown as Record<string, unknown>).find = vi
      .fn()
      .mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        }),
      });
    mockOptimizationModel = optimizationModelFn as never;

    service = new OptimizersService(
      mockContentScoreModel as never,
      mockOptimizationModel as never,
      mockLoggerService as unknown as LoggerService,
      mockModelsService as never,
      mockReplicateService as unknown as ReplicateService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('analyzeContent calls AI and saves score', async () => {
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      JSON.stringify({
        breakdown: {
          clarity: 80,
          engagement: 75,
          platformOptimization: 70,
          readability: 85,
          viralPotential: 60,
        },
        overallScore: 74,
        suggestions: [],
      }),
    );

    const result = await service.analyzeContent(
      {
        content: 'Hello world',
        contentType: 'post',
        platform: 'twitter',
      } as never,
      'org-1',
      'user-1',
    );
    expect(result).toBeDefined();
    expect(mockReplicateService.generateTextCompletionSync).toHaveBeenCalled();
  });

  it('optimizeContent returns original and optimized text', async () => {
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      JSON.stringify({
        changes: [
          {
            field: 'tone',
            optimized: 'Better!',
            original: 'Hello',
            reason: 'more engaging',
          },
        ],
        improvementScore: 20,
        optimized: 'Optimized Hello',
      }),
    );

    const result = await service.optimizeContent(
      { content: 'Hello', contentType: 'post', platform: 'twitter' } as never,
      'org-1',
    );
    expect(result.original).toBe('Hello');
    expect(result.optimized).toBe('Optimized Hello');
    expect(result.improvementScore).toBe(20);
  });

  it('suggestHashtags returns hashtag arrays', async () => {
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      JSON.stringify({
        optimal: ['#best'],
        score: 85,
        suggested: ['#ai', '#tech'],
        trending: ['#trending'],
      }),
    );

    const result = await service.suggestHashtags(
      {
        content: 'AI content',
        count: 5,
        platform: 'instagram',
        strategy: 'balanced',
      } as never,
      'org-1',
    );
    expect(result.suggested).toContain('#ai');
    expect(result.trending).toContain('#trending');
    expect(result.score).toBe(85);
  });

  it('generateVariants returns variants array', async () => {
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      JSON.stringify({
        variants: [
          { content: 'Variant 1', description: 'casual', type: 'tone' },
        ],
      }),
    );

    const result = await service.generateVariants(
      {
        content: 'Hello',
        contentType: 'post',
        count: 1,
        platform: 'twitter',
        variationType: 'tone',
      } as never,
      'org-1',
    );
    expect(result.original).toBe('Hello');
    expect(result.variants).toHaveLength(1);
  });

  it('getOptimizationHistory queries with correct params', async () => {
    await service.getOptimizationHistory('org-1', 'user-1', 10);
    expect(mockOptimizationModel.find).toHaveBeenCalledWith({
      isDeleted: false,
      organization: 'org-1',
      user: 'user-1',
    });
  });

  it('getOptimizationHistory omits user when not provided', async () => {
    await service.getOptimizationHistory('org-1');
    expect(mockOptimizationModel.find).toHaveBeenCalledWith({
      isDeleted: false,
      organization: 'org-1',
    });
  });

  it('getBestPostingTimes returns recommended times', async () => {
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      JSON.stringify({
        recommendedTimes: [
          {
            confidence: 85,
            day: 'Monday',
            reason: 'Peak engagement',
            time: '09:00 AM',
          },
        ],
      }),
    );

    const result = await service.getBestPostingTimes('twitter', 'UTC', 'org-1');
    expect(result.timezone).toBe('UTC');
    expect(result.recommendedTimes).toHaveLength(1);
  });

  it('optimizeContent propagates errors', async () => {
    mockReplicateService.generateTextCompletionSync.mockRejectedValue(
      new Error('API down'),
    );
    await expect(
      service.optimizeContent(
        { content: 'test', contentType: 'post' } as never,
        'org-1',
      ),
    ).rejects.toThrow('API down');
  });
});
