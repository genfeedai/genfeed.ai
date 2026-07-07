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
    getPaginationDefaults: vi.fn(
      (query: { limit?: number; page?: number }) => ({
        limit: query?.limit ?? 10,
        page: query?.page ?? 1,
      }),
    ),
    parseStatusFilter: vi.fn((val: unknown) => {
      if (Array.isArray(val)) {
        const values = val.map((entry) => String(entry).trim()).filter(Boolean);
        return values.length
          ? { in: values }
          : { in: ['draft', 'uploaded', 'completed'] };
      }
      return val ?? { in: ['draft', 'uploaded', 'completed'] };
    }),
  },
}));

vi.mock('@api/helpers/utils/collection-filter/collection-filter.util', () => ({
  CollectionFilterUtil: {
    buildBrandFilter: vi.fn((brand: unknown) => brand ?? { not: null }),
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
    metadata: { label: 'Test image' },
  };

  beforeEach(async () => {
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
        training: { not: false },
        user: mockUser.publicMetadata.user,
      });
      expect(userBranch).not.toHaveProperty('isDefault');

      const defaultBranch = orBranches[1].AND[0];
      expect(defaultBranch).toMatchObject({ isDefault: true });
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
    it('should build a Prisma AND query for the image list', async () => {
      const query = { limit: 10, page: 1 } as unknown as ImagesQueryDto;

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toBeDefined();
      const aggregate = imagesService.findAll.mock.calls[0][0] as {
        where: { AND?: unknown[] };
      };
      expect(aggregate.where.AND).toBeDefined();
    });

    it('should accept the studio image list query shape', async () => {
      const query = {
        brand: '507f1f77bcf86cd799439012',
        limit: 24,
        page: 1,
        sort: 'createdAt: -1',
        status: ['generated', 'processing', 'validated'],
      } as unknown as ImagesQueryDto;

      await controller.findAll(mockRequest, mockUser, query);

      const aggregate = imagesService.findAll.mock.calls[0][0] as {
        where: {
          AND: Array<{
            OR: Array<{ AND: Array<Record<string, unknown>> }>;
          }>;
        };
      };
      const options = imagesService.findAll.mock.calls[0][1] as {
        limit: number;
        page: number;
      };
      const userBranch = aggregate.where.AND[0].OR[0].AND[0];
      const defaultBranch = aggregate.where.AND[0].OR[1].AND[0];

      expect(options).toMatchObject({ limit: 24, page: 1 });
      expect(userBranch).toMatchObject({
        brand: '507f1f77bcf86cd799439012',
        status: { in: ['generated', 'processing', 'validated'] },
      });
      expect(defaultBranch).toMatchObject({
        brand: '507f1f77bcf86cd799439012',
        isDefault: true,
        status: { in: ['generated', 'processing', 'validated'] },
      });
    });
  });
});
