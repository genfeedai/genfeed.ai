vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((name: string, id: string) => {
    throw new HttpException(
      { detail: `${name} ${id} not found`, title: `${name} not found` },
      HttpStatus.NOT_FOUND,
    );
  }),
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => data,
  ),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

vi.mock('@api/helpers/utils/sort/sort.util', () => ({
  handleQuerySort: vi.fn(() => ({ createdAt: -1 })),
}));

vi.mock('@api/helpers/utils/pagination.util', () => ({
  customLabels: {},
}));

vi.mock('@api/helpers/utils/query-defaults/query-defaults.util', () => ({
  QueryDefaultsUtil: {
    getIsDeletedDefault: vi.fn((val: boolean) => val ?? false),
    getPaginationDefaults: vi.fn(() => ({ limit: 10, page: 1 })),
    parseStatusFilter: vi.fn(
      (val: unknown) => val ?? { in: ['draft', 'uploaded', 'completed'] },
    ),
  },
}));

vi.mock('@api/helpers/utils/collection-filter/collection-filter.util', () => ({
  CollectionFilterUtil: {
    buildBrandFilter: vi.fn(() => ({ not: null })),
    buildScopeFilter: vi.fn(() => undefined),
  },
}));

vi.mock('@api/helpers/utils/ingredient-filter/ingredient-filter.util', () => ({
  IngredientFilterUtil: {
    buildFolderFilter: vi.fn(() => ({})),
    buildCharacterFilter: vi.fn((ids: string[]) => ({
      personaId: { in: ids },
    })),
    buildOriginFilter: vi.fn(() => ({})),
    buildParentFilter: vi.fn(() => ({})),
    buildTrainingFilter: vi.fn(() => ({})),
  },
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import type { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientCharacterFilterService } from '@api/collections/ingredients/services/ingredient-character-filter.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { IngredientSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ImagesController', () => {
  let controller: ImagesController;
  let imagesService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  const characterFilterService = {
    buildFilter: vi.fn(),
  };

  const mockRequest = {} as unknown as Request;
  const mockUserId = testId('user');
  const mockUser = {
    id: mockUserId,
    brandId: testId('brand'),
    organizationId: testId('org'),
    userId: mockUserId,
  } as unknown as User;

  const mockImage = {
    category: 'image',
    id: testId('image'),
    metadata: { label: 'Test image' },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    imagesService = {
      findAll: vi.fn().mockResolvedValue({ docs: [mockImage], totalDocs: 1 }),
      findOne: vi.fn().mockResolvedValue(mockImage),
      remove: vi.fn().mockResolvedValue(mockImage),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImagesController],
      providers: [
        { provide: ImagesService, useValue: imagesService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: VotesService, useValue: { findOne: vi.fn() } },
        {
          provide: IngredientCharacterFilterService,
          useValue: characterFilterService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ImagesController>(ImagesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll (latest=true shorthand)', () => {
    const latestQuery = {
      isDeleted: false,
      latest: true,
      limit: 10,
      page: 1,
      pagination: true,
      sort: 'createdAt: -1',
    } as unknown as ImagesQueryDto;

    it('should short-circuit to the latest aggregate', async () => {
      const result = await controller.findAll(
        mockRequest,
        mockUser,
        latestQuery,
      );

      expect(result).toBeDefined();

      const [aggregate, options] = imagesService.findAll.mock.calls[0] as [
        {
          where: {
            AND: Array<{ OR: Array<{ AND: Array<Record<string, unknown>> }> }>;
          };
          orderBy: Record<string, number>;
        },
        { limit: number; pagination: boolean },
      ];

      // Paginated so the 50-row cap actually reaches Prisma as `take`.
      expect(options).toMatchObject({ limit: 10, page: 1, pagination: true });
      expect(aggregate.orderBy).toEqual({ createdAt: -1 });

      // Two OR branches: user-owned (training excluded) + brand defaults.
      const orBranches = aggregate.where.AND[0].OR;
      expect(orBranches).toHaveLength(2);

      const userBranch = orBranches[0].AND[0];
      expect(userBranch).toMatchObject({
        brandId: mockUser.brandId,
        organizationId: mockUser.organizationId,
        trainingId: null,
        userId: mockUser.userId,
      });
      expect(userBranch).not.toHaveProperty('isDefault');

      const defaultBranch = orBranches[1].AND[0];
      expect(defaultBranch).toMatchObject({
        OR: [
          { organizationId: mockUser.organizationId },
          { organizationId: null },
        ],
        brandId: mockUser.brandId,
        isDefault: true,
      });
    });

    it('should cap the latest limit at 50', async () => {
      await controller.findAll(mockRequest, mockUser, {
        ...latestQuery,
        limit: 100,
      } as unknown as ImagesQueryDto);

      const options = imagesService.findAll.mock.calls[0][1] as {
        limit: number;
      };
      expect(options.limit).toBe(50);
    });
  });

  describe('findAll (latest=true with origins)', () => {
    it('keeps the origin filter in the latest aggregate', async () => {
      const originFilter = { origin: { in: ['UPLOADED'] } };
      vi.mocked(IngredientFilterUtil.buildOriginFilter).mockReturnValueOnce(
        originFilter,
      );

      await controller.findAll(mockRequest, mockUser, {
        isDeleted: false,
        latest: true,
        limit: 10,
        origins: ['UPLOADED'],
        page: 1,
      } as unknown as ImagesQueryDto);

      expect(IngredientFilterUtil.buildOriginFilter).toHaveBeenCalledWith([
        'UPLOADED',
      ]);
      const aggregate = imagesService.findAll.mock.calls[0][0] as {
        where: { AND: unknown[] };
      };
      expect(aggregate.where.AND).toContainEqual(originFilter);
    });

    it('does not share a latest-image cache entry between origins', () => {
      const cacheConfig = Reflect.getMetadata(
        'cache',
        ImagesController.prototype.findAll,
      ) as {
        keyGenerator: (request: Record<string, unknown>) => string;
      };
      const buildKey = (origins?: string[]) =>
        cacheConfig.keyGenerator({
          query: { latest: 'true', limit: 10, origins },
          user: {
            brandId: 'brand-a',
            id: mockUser.id,
            organizationId: 'org-a',
          },
        });

      expect(buildKey(['UPLOADED'])).not.toBe(buildKey(['GENERATED']));
      expect(buildKey(['UPLOADED'])).not.toBe(buildKey());
    });
  });

  describe('findAll (standard list)', () => {
    it('partitions the latest-image cache by active organization and brand', () => {
      const cacheConfig = Reflect.getMetadata(
        'cache',
        ImagesController.prototype.findAll,
      ) as {
        keyGenerator: (request: Record<string, unknown>) => string;
      };
      const buildKey = (organizationId: string, brandId: string) =>
        cacheConfig.keyGenerator({
          query: { latest: 'true', limit: 10 },
          user: {
            id: mockUser.id,
            brandId,
            organizationId,
          },
        });

      expect(buildKey('org-a', 'brand-a')).not.toBe(
        buildKey('org-b', 'brand-b'),
      );
    });

    it('should build a Prisma AND query for the image list', async () => {
      const query = { limit: 10, page: 1 } as unknown as ImagesQueryDto;

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toBeDefined();
      const aggregate = imagesService.findAll.mock.calls[0][0] as {
        where: {
          AND?: Array<{
            OR?: Array<{
              AND?: Array<{
                OR?: Array<Record<string, unknown>>;
              }>;
            }>;
          }>;
        };
      };
      expect(aggregate.where.AND).toBeDefined();
      expect(aggregate.where.AND?.[0]?.OR?.[0]?.AND?.[0]).toEqual(
        expect.objectContaining({
          organizationId: mockUser.organizationId,
        }),
      );
      expect(serializeCollection).toHaveBeenCalledWith(
        mockRequest,
        IngredientSerializer,
        expect.objectContaining({ docs: [mockImage] }),
      );
    });
  });

  describe('findAll origin filter', () => {
    it('narrows the whole list, brand-default images included', async () => {
      const originFilter = { origin: { in: ['UPLOADED'] } };
      vi.mocked(IngredientFilterUtil.buildOriginFilter).mockReturnValueOnce(
        originFilter,
      );
      const query = {
        limit: 10,
        origins: ['UPLOADED'],
        page: 1,
      } as unknown as ImagesQueryDto;

      await controller.findAll(mockRequest, mockUser, query);

      expect(IngredientFilterUtil.buildOriginFilter).toHaveBeenCalledWith([
        'UPLOADED',
      ]);
      const aggregate = imagesService.findAll.mock.calls[0][0] as {
        where: { AND: unknown[] };
      };
      // A sibling of the OR (user-owned | brand defaults), not inside one branch.
      expect(aggregate.where.AND).toContainEqual(originFilter);
    });
  });

  describe('findAll character filter', () => {
    it('narrows the whole list to the characters the brand can use', async () => {
      const characterId = testId('character');
      const resolved = { personaId: { in: [characterId] } };
      characterFilterService.buildFilter.mockResolvedValueOnce(resolved);
      const query = {
        characters: [characterId],
        limit: 10,
        page: 1,
      } as unknown as ImagesQueryDto;

      await controller.findAll(mockRequest, mockUser, query);

      expect(characterFilterService.buildFilter).toHaveBeenCalledWith({
        brandId: mockUser.brandId,
        characterIds: [characterId],
        organizationId: mockUser.organizationId,
      });
      const aggregate = imagesService.findAll.mock.calls[0][0] as {
        where: { AND: unknown[] };
      };
      expect(aggregate.where.AND).toContainEqual(resolved);
    });

    it('resolves availability for the active brand, not a brandId override', async () => {
      const otherBrandId = testId('brand', 2);
      characterFilterService.buildFilter.mockResolvedValueOnce({
        personaId: { in: [] },
      });

      await controller.findAll(mockRequest, mockUser, {
        brandId: otherBrandId,
        characters: [testId('character')],
        limit: 10,
        page: 1,
      } as unknown as ImagesQueryDto);

      expect(characterFilterService.buildFilter).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: mockUser.brandId }),
      );
    });

    it('fails closed when the character resolver is not wired', async () => {
      const unwired = new ImagesController(
        imagesService as unknown as ImagesService,
        { log: vi.fn() } as unknown as LoggerService,
        {} as unknown as VotesService,
      );
      const query = {
        characters: [testId('character')],
        limit: 10,
        page: 1,
      } as unknown as ImagesQueryDto;

      await unwired.findAll(mockRequest, mockUser, query);

      const aggregate = imagesService.findAll.mock.calls[0][0] as {
        where: { AND: unknown[] };
      };
      expect(aggregate.where.AND).toContainEqual({ personaId: { in: [] } });
    });

    it('does not resolve characters when none were asked for', async () => {
      await controller.findAll(mockRequest, mockUser, {
        limit: 10,
        page: 1,
      } as unknown as ImagesQueryDto);

      expect(characterFilterService.buildFilter).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('tenant-scopes the lookup and serializes the image contract', async () => {
      await controller.findOne(mockRequest, mockImage.id, mockUser);

      expect(imagesService.findOne).toHaveBeenCalledWith(
        {
          id: mockImage.id,
          isDeleted: false,
          category: 'IMAGE',
          OR: [
            { organizationId: mockUser.organizationId },
            { isDefault: true, organizationId: null },
          ],
        },
        expect.any(Array),
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        IngredientSerializer,
        expect.objectContaining({ id: mockImage.id }),
      );
    });

    it('returns not found when the scoped image lookup misses', async () => {
      imagesService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.findOne(mockRequest, mockImage.id, mockUser),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(serializeSingle).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('preflights tenant ownership and serializes the soft-deleted image', async () => {
      await controller.remove(mockRequest, mockImage.id, mockUser);

      expect(imagesService.findOne).toHaveBeenCalledWith({
        id: mockImage.id,
        organizationId: mockUser.organizationId,
        category: 'IMAGE',
        isDeleted: false,
      });
      expect(imagesService.remove).toHaveBeenCalledWith(mockImage.id);
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        IngredientSerializer,
        mockImage,
      );
    });

    it('does not delete an image outside the caller scope', async () => {
      imagesService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.remove(mockRequest, mockImage.id, mockUser),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(imagesService.remove).not.toHaveBeenCalled();
      expect(serializeSingle).not.toHaveBeenCalled();
    });
  });
});
