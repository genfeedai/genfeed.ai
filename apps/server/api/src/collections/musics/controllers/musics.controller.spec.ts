vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MusicsController } from '@api/collections/musics/controllers/musics.controller';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { MusicSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';
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
  const request = {} as Request;
  const musicId = '507f191e810c19729de860ea';
  const organizationId = '507f191e810c19729de860eb';
  const brandId = '507f191e810c19729de860ec';
  const userId = '507f191e810c19729de860ed';
  const music = {
    brandId,
    category: 'music',
    id: 'canonical-music-id',
    isDeleted: false,
    mongoId: musicId,
    organizationId,
    userId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
              brandId: '507f191e810c19729de860ee',
              category: 'MUSIC',
              isDeleted: false,
              organizationId: '507f191e810c19729de860ee',
              userId: '507f191e810c19729de860ee',
            }),
            expect.objectContaining({
              category: 'MUSIC',
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

      expect(query.where.OR[0]).toMatchObject({ brandId });
      expect(query.where.OR[1]).toMatchObject({ brandId });
    });
  });

  describe('asset lifecycle contract', () => {
    const user = createMockUser({
      brand: brandId,
      organization: organizationId,
      user: userId,
    }) as User;

    it('lists tenant-owned music and serializes the collection', async () => {
      const collection = { docs: [music], totalDocs: 1 };
      musicsService.findAll.mockResolvedValue(collection);

      await controller.findAll(request, user, {} as never);

      expect(musicsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: expect.arrayContaining([
              expect.objectContaining({
                brandId,
                category: 'MUSIC',
                isDeleted: false,
                organizationId,
                userId,
              }),
            ]),
          },
        }),
        expect.any(Object),
      );
      expect(serializeCollection).toHaveBeenCalledWith(
        request,
        MusicSerializer,
        collection,
      );
    });

    it('tenant-scopes a single music lookup and uses the music serializer', async () => {
      musicsService.findOne.mockResolvedValue(music);

      await controller.findOne(request, user, musicId);

      expect(musicsService.findOne).toHaveBeenCalledWith(
        {
          _id: musicId,
          OR: [{ organizationId }, { isDefault: true, organizationId: null }],
          category: 'MUSIC',
          isDeleted: false,
        },
        expect.any(Array),
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        request,
        MusicSerializer,
        music,
      );
    });

    it('soft-deletes only music owned by the canonical caller', async () => {
      musicsService.findOne.mockResolvedValue(music);
      musicsService.remove.mockResolvedValue({ ...music, isDeleted: true });

      await controller.remove(request, user, musicId);

      expect(musicsService.findOne).toHaveBeenCalledWith({
        _id: musicId,
        OR: [{ organizationId }, { isDefault: true, organizationId: null }],
        category: 'MUSIC',
        isDeleted: false,
      });
      expect(musicsService.remove).toHaveBeenCalledWith(music.id);
      expect(serializeSingle).toHaveBeenCalledWith(
        request,
        MusicSerializer,
        expect.objectContaining({ id: music.id, isDeleted: true }),
      );
    });

    it('rejects another tenant record before deletion', async () => {
      musicsService.findOne.mockResolvedValue({
        ...music,
        organizationId: '507f191e810c19729de860ff',
        userId: '507f191e810c19729de860fe',
      });

      await expect(controller.remove(request, user, musicId)).rejects.toThrow();
      expect(musicsService.remove).not.toHaveBeenCalled();
      expect(serializeSingle).not.toHaveBeenCalled();
    });
  });
});
