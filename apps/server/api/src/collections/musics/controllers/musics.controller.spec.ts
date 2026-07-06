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

      // Ingredient.isDefault is a non-nullable Boolean column — { not: null } is
      // not a valid Prisma filter shape for it and crashes with
      // PrismaClientValidationError ("Argument `not` is missing"). { equals: true }
      // is both valid and matches this branch's intent (surface default musics).
      expect(query.where.OR[1]).toMatchObject({
        isDefault: { equals: true },
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
});
