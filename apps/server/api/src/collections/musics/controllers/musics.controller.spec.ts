import { MusicsController } from '@api/collections/musics/controllers/musics.controller';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockMusicsService() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
  };
}

function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_test123',
    publicMetadata: {
      brand: '507f191e810c19729de860ee',
      organization: '507f191e810c19729de860ee',
      user: '507f191e810c19729de860ee',
      ...overrides,
    },
  };
}

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn().mockReturnValue('localhost'),
    originalUrl: '/api/musics',
    protocol: 'https',
    ...overrides,
  };
}

describe('MusicsController', () => {
  let controller: MusicsController;
  let musicsService: ReturnType<typeof createMockMusicsService>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    musicsService = createMockMusicsService();
    logger = createMockLogger();
    controller = new MusicsController(
      logger as unknown as LoggerService,
      musicsService as unknown as MusicsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have constructorName set to MusicsController', () => {
    expect(controller.constructorName).toBe('MusicsController');
  });

  describe('buildFindAllPipeline', () => {
    it('should build a pipeline with default filters', () => {
      const user = createMockUser();
      const query = {};
      const pipeline = controller.buildFindAllPipeline(
        user as never,
        query as never,
      );

      expect(Array.isArray(pipeline)).toBe(true);
      expect(pipeline.length).toBeGreaterThanOrEqual(5);
      // Should have $match, $lookup for metadata, $unwind, $lookup for prompt, $unwind, $sort
      expect(pipeline[0]).toHaveProperty('$match');
    });

    it('should include metadata lookup stages', () => {
      const user = createMockUser();
      const query = {};
      const pipeline = controller.buildFindAllPipeline(
        user as never,
        query as never,
      );

      const lookups = pipeline.filter(
        (stage: Record<string, unknown>) => '$lookup' in stage,
      );
      expect(lookups.length).toBeGreaterThanOrEqual(2);
    });

    it('should add search filter when search query is provided', () => {
      const user = createMockUser();
      const query = { search: 'test song' };
      const pipeline = controller.buildFindAllPipeline(
        user as never,
        query as never,
      );

      const matchStages = pipeline.filter(
        (stage: Record<string, unknown>) => '$match' in stage,
      );
      // Should have at least 2 match stages: initial filter + search filter
      expect(matchStages.length).toBeGreaterThanOrEqual(2);
    });

    it('should add metadata filters for format and provider', () => {
      const user = createMockUser();
      const query = { format: 'mp3', provider: 'suno' };
      const pipeline = controller.buildFindAllPipeline(
        user as never,
        query as never,
      );

      const matchStages = pipeline.filter(
        (stage: Record<string, unknown>) => '$match' in stage,
      );
      expect(matchStages.length).toBeGreaterThanOrEqual(2);
    });

    it('should apply custom sort when specified', () => {
      const user = createMockUser();
      const query = { sort: 'createdAt' };
      const pipeline = controller.buildFindAllPipeline(
        user as never,
        query as never,
      );

      const sortStage = pipeline.find(
        (stage: Record<string, unknown>) => '$sort' in stage,
      );
      expect(sortStage).toBeDefined();
    });

    it('should default to createdAt desc sort', () => {
      const user = createMockUser();
      const query = {};
      const pipeline = controller.buildFindAllPipeline(
        user as never,
        query as never,
      );

      const sortStage = pipeline.find(
        (stage: Record<string, unknown>) => '$sort' in stage,
      ) as { $sort: Record<string, number> };
      expect(sortStage?.$sort).toEqual({ createdAt: -1 });
    });

    it('should filter by brand when valid ObjectId is provided', () => {
      const brandId = '507f191e810c19729de860ee';
      const user = createMockUser();
      const query = { brand: brandId };
      const pipeline = controller.buildFindAllPipeline(
        user as never,
        query as never,
      );

      expect(pipeline[0]).toHaveProperty('$match');
    });
  });

  describe('findLatest', () => {
    it('should return serialized latest musics', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      const docs = [
        {
          _id: '507f191e810c19729de860ee',
          category: 'music',
          status: 'generated',
        },
      ];
      musicsService.findAll.mockResolvedValue({
        docs,
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findLatest(
        request as never,
        user as never,
        10,
      );
      expect(result).toBeDefined();
      expect(musicsService.findAll).toHaveBeenCalled();
    });

    it('should cap limit at 50', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      musicsService.findAll.mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 50,
        page: 1,
        totalDocs: 0,
        totalPages: 1,
      });

      await controller.findLatest(request as never, user as never, 100);

      const callArgs = musicsService.findAll.mock.calls[0];
      const pipeline = callArgs[0];
      const limitStage = pipeline.find(
        (stage: Record<string, unknown>) => '$limit' in stage,
      ) as { $limit: number };
      expect(limitStage.$limit).toBeLessThanOrEqual(50);
    });
  });
});
