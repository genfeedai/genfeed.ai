import { AdPerformance } from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { ContentPerformance } from '@api/collections/content-performance/schemas/content-performance.schema';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PatternExtractionProcessor } from '@api/queues/pattern-extraction/pattern-extraction.processor';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';

const makeLeanExec = (data: unknown[]) => ({
  exec: vi.fn().mockResolvedValue(data),
  lean: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
});

const makeJob = (platform = 'tiktok'): Partial<Job> => ({
  data: { platform },
  updateProgress: vi.fn().mockResolvedValue(undefined),
});

describe('PatternExtractionProcessor', () => {
  let processor: PatternExtractionProcessor;
  let adPerformanceModel: { find: ReturnType<typeof vi.fn> };
  let contentPerformanceModel: { find: ReturnType<typeof vi.fn> };
  let creativePatternsService: vi.Mocked<
    Pick<CreativePatternsService, 'upsertPattern'>
  >;
  let logger: vi.Mocked<Pick<LoggerService, 'log' | 'error'>>;

  beforeEach(async () => {
    adPerformanceModel = { find: vi.fn().mockReturnValue(makeLeanExec([])) };
    contentPerformanceModel = {
      find: vi.fn().mockReturnValue(makeLeanExec([])),
    };
    creativePatternsService = {
      upsertPattern: vi.fn().mockResolvedValue(undefined),
    };
    logger = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatternExtractionProcessor,
        {
          provide: getModelToken(AdPerformance.name, DB_CONNECTIONS.CLOUD),
          useValue: adPerformanceModel,
        },
        {
          provide: getModelToken(ContentPerformance.name, DB_CONNECTIONS.CLOUD),
          useValue: contentPerformanceModel,
        },
        { provide: CreativePatternsService, useValue: creativePatternsService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    processor = module.get<PatternExtractionProcessor>(
      PatternExtractionProcessor,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('processes job with empty data without throwing', async () => {
    await expect(processor.process(makeJob() as Job)).resolves.toBeUndefined();
  });

  it('calls updateProgress(100) on success', async () => {
    const job = makeJob();
    await processor.process(job as Job);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('uses empty filter when platform is "all"', async () => {
    await processor.process(makeJob('all') as Job);
    expect(adPerformanceModel.find).toHaveBeenCalledWith(
      expect.not.objectContaining({ adPlatform: expect.anything() }),
    );
  });

  it('filters by platform when platform is specific', async () => {
    await processor.process(makeJob('tiktok') as Job);
    expect(adPerformanceModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ adPlatform: 'tiktok' }),
    );
  });

  it('upserts public pattern when 5+ distinct orgs produce same classified type', async () => {
    const orgIds = Array.from({ length: 5 }, () =>
      '507f191e810c19729de860ee'.toString(),
    );
    const adRecords = orgIds.map((id) => ({
      adPlatform: 'tiktok',
      headlineText: 'How to grow fast?',
      industry: 'tech',
      isDeleted: false,
      organization: id,
      performanceScore: 90,
    }));

    adPerformanceModel.find = vi.fn().mockReturnValue(makeLeanExec(adRecords));

    await processor.process(makeJob('tiktok') as Job);

    expect(creativePatternsService.upsertPattern).toHaveBeenCalledWith(
      expect.objectContaining({ patternType: 'hook_formula', scope: 'public' }),
    );
  });

  it('upserts private pattern for single-org data', async () => {
    const singleOrg = '507f191e810c19729de860ee'.toString();
    const adRecords = [
      {
        adPlatform: 'instagram',
        headlineText: '10x your revenue!',
        industry: 'ecommerce',
        isDeleted: false,
        organization: singleOrg,
        performanceScore: 95,
      },
    ];
    adPerformanceModel.find = vi.fn().mockReturnValue(makeLeanExec(adRecords));

    await processor.process(makeJob('instagram') as Job);

    expect(creativePatternsService.upsertPattern).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'private' }),
    );
  });

  it('does NOT upsert pattern when distinct org count is between 2 and 4', async () => {
    const orgIds = Array.from({ length: 3 }, () =>
      '507f191e810c19729de860ee'.toString(),
    );
    const adRecords = orgIds.map((id) => ({
      adPlatform: 'facebook',
      ctaText: 'Buy Now',
      industry: 'retail',
      isDeleted: false,
      organization: id,
      performanceScore: 85,
    }));
    adPerformanceModel.find = vi.fn().mockReturnValue(makeLeanExec(adRecords));

    await processor.process(makeJob('facebook') as Job);

    expect(creativePatternsService.upsertPattern).not.toHaveBeenCalled();
  });

  it('logs error but does not rethrow when upsertPattern fails for a single pattern', async () => {
    const orgIds = Array.from({ length: 5 }, () =>
      '507f191e810c19729de860ee'.toString(),
    );
    const adRecords = orgIds.map((id) => ({
      adPlatform: 'tiktok',
      ctaText: 'Get it free!',
      isDeleted: false,
      organization: id,
      performanceScore: 88,
    }));
    adPerformanceModel.find = vi.fn().mockReturnValue(makeLeanExec(adRecords));
    creativePatternsService.upsertPattern.mockRejectedValue(
      new Error('DB write fail'),
    );

    await expect(
      processor.process(makeJob('tiktok') as Job),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('rethrows when top-level query fails', async () => {
    adPerformanceModel.find = vi.fn().mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('connection lost')),
      lean: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
    });

    await expect(processor.process(makeJob() as Job)).rejects.toThrow(
      'connection lost',
    );
  });
});
