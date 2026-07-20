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

vi.mock('@api/helpers/utils/pagination/pagination.util', () => ({
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
    buildParentFilter: vi.fn(() => ({})),
    buildTrainingFilter: vi.fn(() => ({})),
  },
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import type { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { IngredientSerializer } from '@genfeedai/serializers';
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

  const mockRequest = {} as unknown as Request;
  const mockUser = {
    id: 'authProvider_user_1',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439012',
      organization: '507f1f77bcf86cd799439011',
      user: '507f1f77bcf86cd799439013',
    },
  } as unknown as User;

  const mockImage = {
    _id: '507f191e810c19729de860ee',
    category: 'image',
    id: 'canonical-image-id',
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

    it('should short-circuit to the legacy latest aggregate', async () => {
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

      expect(options).toMatchObject({ pagination: false });
      expect(aggregate.orderBy).toEqual({ createdAt: -1 });

      // Two OR branches: user-owned (training excluded) + brand defaults.
      const orBranches = aggregate.where.AND[0].OR;
      expect(orBranches).toHaveLength(2);

      const userBranch = orBranches[0].AND[0];
      expect(userBranch).toMatchObject({
        organizationId: mockUser.publicMetadata.organization,
        training: { not: false },
        user: mockUser.publicMetadata.user,
      });
      expect(userBranch).not.toHaveProperty('isDefault');

      const defaultBranch = orBranches[1].AND[0];
      expect(defaultBranch).toMatchObject({
        OR: [
          { organizationId: mockUser.publicMetadata.organization },
          { organizationId: null },
        ],
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

  describe('findAll (standard list)', () => {
    it('partitions the latest-image cache by active organization and brand', () => {
      const cacheConfig = Reflect.getMetadata(
        'cache',
        ImagesController.prototype.findAll,
      ) as {
        keyGenerator: (request: Record<string, unknown>) => string;
      };
      const buildKey = (organization: string, brand: string) =>
        cacheConfig.keyGenerator({
          query: { latest: 'true', limit: 10 },
          user: {
            id: mockUser.id,
            publicMetadata: { brand, organization },
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
          organizationId: mockUser.publicMetadata.organization,
        }),
      );
      expect(serializeCollection).toHaveBeenCalledWith(
        mockRequest,
        IngredientSerializer,
        expect.objectContaining({ docs: [mockImage] }),
      );
    });
  });

  describe('findOne', () => {
    it('tenant-scopes the lookup and serializes the image contract', async () => {
      await controller.findOne(mockRequest, mockImage._id, mockUser);

      expect(imagesService.findOne).toHaveBeenCalledWith(
        {
          _id: mockImage._id,
          category: 'IMAGE',
          isDeleted: false,
          OR: [
            { organizationId: mockUser.publicMetadata.organization },
            { isDefault: true, organizationId: null },
          ],
        },
        expect.any(Array),
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        IngredientSerializer,
        expect.objectContaining({ _id: mockImage._id }),
      );
    });

    it('returns not found when the scoped image lookup misses', async () => {
      imagesService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.findOne(mockRequest, mockImage._id, mockUser),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(serializeSingle).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('preflights tenant ownership and serializes the soft-deleted image', async () => {
      await controller.remove(mockRequest, mockImage._id, mockUser);

      expect(imagesService.findOne).toHaveBeenCalledWith({
        _id: mockImage._id,
        organizationId: mockUser.publicMetadata.organization,
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
        controller.remove(mockRequest, mockImage._id, mockUser),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(imagesService.remove).not.toHaveBeenCalled();
      expect(serializeSingle).not.toHaveBeenCalled();
    });
  });
});
