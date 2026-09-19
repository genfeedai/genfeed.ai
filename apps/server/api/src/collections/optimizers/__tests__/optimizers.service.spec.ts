import { ModelsService } from '@api/collections/models/services/models.service';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';

type TextCompletion = ReplicateService['generateTextCompletionSync'];

vi.mock('replicate', () => ({
  default: class Replicate {
    predictions = { create: vi.fn() };
    wait = vi.fn();
  },
}));

describe('OptimizersService', () => {
  let service: OptimizersService;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockReplicateService = {
    generateTextCompletionSync: vi.fn().mockResolvedValue('{}'),
  };

  const mockContentScoreModel = vi.fn().mockImplementation((dto) => ({
    ...dto,
    _id: { toString: () => 'mock-id' },
    save: vi.fn().mockResolvedValue({ ...dto, toObject: () => dto }),
    toObject: vi.fn().mockReturnValue(dto),
  }));
  Object.assign(mockContentScoreModel, {
    collection: { name: 'contentscores' },
    find: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockReturnThis(),
    modelName: 'ContentScore',
    sort: vi.fn().mockReturnThis(),
  });

  const mockOptimizationModel = vi.fn().mockImplementation((dto) => ({
    ...dto,
    _id: { toString: () => 'mock-id' },
    save: vi.fn().mockResolvedValue({ ...dto }),
  }));
  Object.assign(mockOptimizationModel, {
    collection: { name: 'optimizations' },
    find: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockReturnThis(),
    modelName: 'Optimization',
    sort: vi.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizersService,
        {
          provide: PrismaService,
          useValue: { ...mockContentScoreModel, ...mockOptimizationModel },
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ReplicateService,
          useValue: mockReplicateService,
        },
      ],
    }).compile();

    service = module.get<OptimizersService>(OptimizersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have analyzeContent method', () => {
    expect(service.analyzeContent).toBeDefined();
  });

  it('should have optimizeContent method', () => {
    expect(service.optimizeContent).toBeDefined();
  });

  it('should have suggestHashtags method', () => {
    expect(service.suggestHashtags).toBeDefined();
  });

  it('should have generateVariants method', () => {
    expect(service.generateVariants).toBeDefined();
  });

  it('should have getBestPostingTimes method', () => {
    expect(service.getBestPostingTimes).toBeDefined();
  });

  it('should have getOptimizationHistory method', () => {
    expect(service.getOptimizationHistory).toBeDefined();
  });
});

/**
 * Exercises the optimizer against the real Replicate structured helper, with
 * only the raw prediction stubbed — the validate/repair/throw contract and the
 * per-attempt billing are what these cover.
 */
describe('OptimizersService structured output', () => {
  const hashtagDto = {
    content: 'Shipping beats planning',
    platform: 'instagram',
  } as never;

  let service: OptimizersService;
  let completion: Mock<TextCompletion>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizersService,
        ReplicateService,
        { provide: PrismaService, useValue: {} },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              key: 'anthropic/claude-4.5-sonnet',
              outputPricePerMillionTokens: 15,
              pricePerMillionTokens: 3,
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('r8-test') },
        },
      ],
    }).compile();

    service = module.get<OptimizersService>(OptimizersService);
    completion = vi.fn<TextCompletion>();
    module.get<ReplicateService>(ReplicateService).generateTextCompletionSync =
      completion;
  });

  it('returns validated hashtag suggestions and bills the call', async () => {
    completion.mockResolvedValue(
      JSON.stringify({
        optimal: ['#ship'],
        score: 82,
        suggested: ['#ship', '#build'],
        trending: ['#build'],
      }),
    );
    const billed: number[] = [];

    const result = await service.suggestHashtags(
      hashtagDto,
      'org-1',
      (amount) => billed.push(amount),
    );

    expect(result).toEqual({
      optimal: ['#ship'],
      score: 82,
      suggested: ['#ship', '#build'],
      trending: ['#build'],
    });
    expect(completion).toHaveBeenCalledTimes(1);
    expect(billed).toHaveLength(1);
  });

  it('carries the JSON schema in the prompt instead of a hand-written shape', async () => {
    completion.mockResolvedValue(
      JSON.stringify({ optimal: [], score: 0, suggested: [], trending: [] }),
    );

    await service.suggestHashtags(hashtagDto, 'org-1');

    const [, input] = completion.mock.calls[0] as [string, { prompt: string }];
    expect(input.prompt).toContain('hashtag_suggestions');
    expect(input.prompt).not.toContain('Return JSON');
  });

  it('repairs once and bills both attempts', async () => {
    completion
      .mockResolvedValueOnce(JSON.stringify({ score: 'high' }))
      .mockResolvedValueOnce(
        JSON.stringify({
          optimal: [],
          score: 40,
          suggested: ['#ship'],
          trending: [],
        }),
      );
    const billed: number[] = [];

    const result = await service.suggestHashtags(
      hashtagDto,
      'org-1',
      (amount) => billed.push(amount),
    );

    expect(result.score).toBe(40);
    expect(completion).toHaveBeenCalledTimes(2);
    expect(billed).toHaveLength(2);
  });

  it('throws the typed error instead of returning an empty suggestion set', async () => {
    completion.mockResolvedValue(JSON.stringify({ score: 'high' }));

    await expect(
      service.suggestHashtags(hashtagDto, 'org-1'),
    ).rejects.toBeInstanceOf(LlmStructuredOutputError);
    expect(completion).toHaveBeenCalledTimes(2);
  });

  it('refuses a posting-time confidence outside the documented band', async () => {
    completion.mockResolvedValue(
      JSON.stringify({
        recommendedTimes: [
          { confidence: 480, day: 'Monday', reason: 'peak', time: '09:00 AM' },
        ],
      }),
    );

    await expect(
      service.getBestPostingTimes('instagram', 'UTC', 'org-1'),
    ).rejects.toBeInstanceOf(LlmStructuredOutputError);
  });
});
