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
  handleQuerySort: vi.fn((sort?: string) =>
    sort ? { createdAt: -1 } : { createdAt: -1 },
  ),
}));

vi.mock('@api/helpers/utils/pagination.util', () => ({
  customLabels: {},
}));

vi.mock('@api/helpers/utils/query-defaults/query-defaults.util', () => ({
  QueryDefaultsUtil: {
    getIsDeletedDefault: vi.fn((val: boolean) => val ?? false),
    getPaginationDefaults: vi.fn(
      (query: { limit?: number; page?: number }) => ({
        limit: query?.limit ?? 10,
        page: query?.page ?? 1,
        pagination: true,
      }),
    ),
    parseStatusFilter: vi.fn(
      (val: unknown) => val ?? { in: ['draft', 'uploaded', 'completed'] },
    ),
  },
}));

vi.mock('@api/helpers/utils/collection-filter/collection-filter.util', () => ({
  CollectionFilterUtil: {
    buildBrandFilter: vi.fn(() => ({ not: null })),
    buildScopeFilter: vi.fn(() => ({ not: null })),
  },
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GifsController } from '@api/collections/gifs/controllers/gifs.controller';
import { GifsService } from '@api/collections/gifs/services/gifs.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('GifsController', () => {
  let controller: GifsController;
  let gifsService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let votesService: { findOne: ReturnType<typeof vi.fn> };

  const mockRequest = {} as unknown as Request;
  const mockUser = {
    id: 'authProvider_user_1',
    brandId: 'cmbrand000000000000000001',
    organizationId: 'cmorganization000000000000001',
    userId: 'cmuser0000000000000000001',
  } as unknown as User;
  const gifId = 'cmgif000000000000000000001';

  const mockGif = {
    category: 'gif',
    hasVoted: false,
    id: gifId,
    metadata: { label: 'Test GIF' },
    scope: 'private',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    gifsService = {
      findAll: vi.fn().mockResolvedValue({
        docs: [mockGif],
        totalDocs: 1,
      }),
      findOne: vi.fn().mockResolvedValue(mockGif),
      remove: vi.fn().mockResolvedValue(mockGif),
    };

    votesService = {
      findOne: vi.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GifsController],
      providers: [
        { provide: GifsService, useValue: gifsService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: VotesService, useValue: votesService },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<GifsController>(GifsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated gifs', async () => {
      const query = {} as Parameters<typeof controller.findAll>[2];
      const result = await controller.findAll(mockRequest, mockUser, query);
      expect(gifsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(serializeCollection).toHaveBeenCalledWith(
        mockRequest,
        IngredientSerializer,
        expect.objectContaining({ docs: [mockGif] }),
      );
    });

    it('should support collapsed "latest" queries via sort/limit params while staying paginated', async () => {
      const query = {
        limit: 10,
        sort: 'createdAt: -1',
      } as unknown as Parameters<typeof controller.findAll>[2];
      await controller.findAll(mockRequest, mockUser, query);
      expect(gifsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: -1 },
          where: expect.any(Object),
        }),
        expect.objectContaining({ limit: 10, pagination: true }),
      );
    });

    it('should apply search filter when search query provided', async () => {
      const query = { search: 'dancing' } as Parameters<
        typeof controller.findAll
      >[2];
      await controller.findAll(mockRequest, mockUser, query);
      const findAllQuery = gifsService.findAll.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(findAllQuery.where.AND).toBeDefined();
    });

    it('should build a Prisma query for gif listing', async () => {
      const query = {} as Parameters<typeof controller.findAll>[2];
      await controller.findAll(mockRequest, mockUser, query);
      const findAllQuery = gifsService.findAll.mock.calls[0][0] as {
        orderBy?: Record<string, unknown>;
        where?: Record<string, unknown>;
      };
      expect(findAllQuery).toMatchObject({
        orderBy: { createdAt: -1 },
        where: expect.any(Object),
      });
      expect(findAllQuery.where).toEqual(
        expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  AND: expect.arrayContaining([
                    expect.objectContaining({
                      OR: [
                        {
                          organizationId: mockUser.organizationId,
                        },
                        { organizationId: null },
                      ],
                      isDefault: true,
                    }),
                  ]),
                }),
              ]),
            }),
          ]),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a single gif', async () => {
      const result = await controller.findOne(mockRequest, gifId, mockUser);
      expect(gifsService.findOne).toHaveBeenCalledWith(
        {
          id: gifId,
          category: 'GIF',
          OR: [
            { organizationId: mockUser.organizationId },
            { isDefault: true, organizationId: null },
          ],
        },
        expect.any(Array),
      );
      expect(result).toEqual(expect.objectContaining({ id: gifId }));
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        IngredientSerializer,
        expect.objectContaining({ id: gifId }),
      );
    });

    it('should throw NOT_FOUND when gif does not exist', async () => {
      gifsService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.findOne(mockRequest, 'nonexistent', mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should check if user has voted', async () => {
      await controller.findOne(mockRequest, gifId, mockUser);
      expect(votesService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: gifId,
          entityModel: 'Ingredient',
          userId: mockUser.userId,
        }),
      );
    });

    it('should set hasVoted to true when vote exists', async () => {
      votesService.findOne.mockResolvedValueOnce({
        id: 'cmvote00000000000000000001',
      });
      const result = await controller.findOne(mockRequest, gifId, mockUser);
      expect(result.hasVoted).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove a gif and return it', async () => {
      const result = await controller.remove(mockRequest, gifId, mockUser);
      expect(gifsService.findOne).toHaveBeenCalledWith({
        id: gifId,
        organizationId: mockUser.organizationId,
        category: 'GIF',
        isDeleted: false,
      });
      expect(gifsService.remove).toHaveBeenCalledWith(mockGif.id);
      expect(result).toEqual(expect.objectContaining({ id: gifId }));
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        IngredientSerializer,
        mockGif,
      );
    });

    it('should reject gifs outside the caller scope before removal', async () => {
      gifsService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.remove(mockRequest, 'nonexistent', mockUser),
      ).rejects.toThrow(HttpException);
      expect(gifsService.remove).not.toHaveBeenCalled();
      expect(serializeSingle).not.toHaveBeenCalled();
    });
  });
});
