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

  describe('buildFindAllQuery', () => {
    it('should build a query with default filters', () => {
      const user = createMockUser();
      const inputQuery = {};
      const query = controller.buildFindAllQuery(
        user as never,
        inputQuery as never,
      );

      expect(query).toEqual({
        orderBy: { createdAt: -1 },
        where: {
          OR: expect.arrayContaining([
            expect.objectContaining({
              brand: '507f191e810c19729de860ee',
              category: 'music',
              isDeleted: false,
              user: '507f191e810c19729de860ee',
            }),
            expect.objectContaining({
              category: 'music',
              isDeleted: false,
            }),
          ]),
        },
      });
    });

    it('should include user and default music branches', () => {
      const user = createMockUser();
      const inputQuery = {};
      const query = controller.buildFindAllQuery(
        user as never,
        inputQuery as never,
      );

      expect(query.where.OR).toHaveLength(2);
    });

    it('should not add a required-scope not-null filter to the default music branch', () => {
      const user = createMockUser();
      const inputQuery = {};
      const query = controller.buildFindAllQuery(
        user as never,
        inputQuery as never,
      );

      expect(query.where.OR[1]).toMatchObject({
        isDefault: { not: null },
      });
      expect(query.where.OR[1]).not.toHaveProperty('scope');
    });

    it('should add status filters when provided', () => {
      const user = createMockUser();
      const inputQuery = { status: 'generated' };
      const query = controller.buildFindAllQuery(
        user as never,
        inputQuery as never,
      );

      expect(query.where.OR[0]).toMatchObject({ status: 'generated' });
      expect(query.where.OR[1]).toMatchObject({ status: 'generated' });
    });

    it('should apply custom sort when specified', () => {
      const user = createMockUser();
      const inputQuery = { sort: 'createdAt' };
      const query = controller.buildFindAllQuery(
        user as never,
        inputQuery as never,
      );

      expect(query.orderBy).toEqual({ createdAt: -1 });
    });

    it('should default to createdAt desc sort', () => {
      const user = createMockUser();
      const inputQuery = {};
      const query = controller.buildFindAllQuery(
        user as never,
        inputQuery as never,
      );

      expect(query.orderBy).toEqual({ createdAt: -1 });
    });

    it('should filter by brand when valid ObjectId is provided', () => {
      const brandId = '507f191e810c19729de860ee';
      const user = createMockUser();
      const inputQuery = { brand: brandId };
      const query = controller.buildFindAllQuery(
        user as never,
        inputQuery as never,
      );

      expect(query.where.OR[0]).toMatchObject({ brand: brandId });
      expect(query.where.OR[1]).toMatchObject({ brand: brandId });
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

    it('should exclude training-associated musics using trainingId: null', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      musicsService.findAll.mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 1,
      });

      await controller.findLatest(request as never, user as never, 10);

      const callArgs = musicsService.findAll.mock.calls[0];
      const aggregate = callArgs[0];
      const userBranch = aggregate.where.OR[0];
      expect(userBranch).toHaveProperty('trainingId', null);
      expect(userBranch).not.toHaveProperty('training');
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
      const options = callArgs[1];
      expect(options.limit).toBeLessThanOrEqual(50);
    });
  });
});
