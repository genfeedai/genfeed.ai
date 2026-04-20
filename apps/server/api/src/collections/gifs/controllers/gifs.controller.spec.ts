vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    brand: '507f1f77bcf86cd799439012',
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439013',
  })),
}));

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
      (val: unknown) => val ?? { $in: ['draft', 'uploaded', 'completed'] },
    ),
  },
}));

vi.mock('@api/helpers/utils/collection-filter/collection-filter.util', () => ({
  CollectionFilterUtil: {
    buildBrandFilter: vi.fn(() => ({ $ne: null })),
    buildScopeFilter: vi.fn(() => ({ $ne: null })),
  },
}));

vi.mock('@api/helpers/utils/ingredient-filter/ingredient-filter.util', () => ({
  IngredientFilterUtil: {
    buildFolderFilter: vi.fn(() => ({})),
    buildFormatFilterStage: vi.fn(() => []),
    buildMetadataLookup: vi.fn(() => []),
    buildParentFilter: vi.fn(() => ({})),
    buildPromptLookup: vi.fn(() => []),
  },
}));

import { GifsController } from '@api/collections/gifs/controllers/gifs.controller';
import { GifsService } from '@api/collections/gifs/services/gifs.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { User } from '@clerk/backend';
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
  const mockUser = { id: 'clerk_user_1' } as unknown as User;
  const gifId = '507f191e810c19729de860ee'.toString();

  const mockGif = {
    _id: gifId,
    category: 'gif',
    hasVoted: false,
    metadata: { label: 'Test GIF' },
    scope: 'private',
  };

  beforeEach(async () => {
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
      .overrideGuard(ClerkGuard)
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

  describe('findLatest', () => {
    it('should return latest gifs', async () => {
      const result = await controller.findLatest(mockRequest, mockUser, 10);
      expect(gifsService.findAll).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ pagination: false }),
      );
      expect(result).toBeDefined();
    });

    it('should cap limit at 50', async () => {
      await controller.findLatest(mockRequest, mockUser, 100);
      const pipeline = gifsService.findAll.mock.calls[0][0] as Array<{
        $limit?: number;
      }>;
      const limitStage = pipeline.find((s) => '$limit' in s);
      expect(limitStage?.$limit).toBeLessThanOrEqual(50);
    });

    it('should use default limit of 10', async () => {
      await controller.findLatest(mockRequest, mockUser);
      const pipeline = gifsService.findAll.mock.calls[0][0] as Array<{
        $limit?: number;
      }>;
      const limitStage = pipeline.find((s) => '$limit' in s);
      expect(limitStage?.$limit).toBe(10);
    });
  });

  describe('findAll', () => {
    it('should return paginated gifs', async () => {
      const query = {} as Parameters<typeof controller.findAll>[2];
      const result = await controller.findAll(mockRequest, mockUser, query);
      expect(gifsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should apply search filter when search query provided', async () => {
      const query = { search: 'dancing' } as Parameters<
        typeof controller.findAll
      >[2];
      await controller.findAll(mockRequest, mockUser, query);
      const pipeline = gifsService.findAll.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      const matchStages = pipeline.filter((s) => '$match' in s);
      // Should have at least 2 match stages (main filter + search)
      expect(matchStages.length).toBeGreaterThanOrEqual(2);
    });

    it('should include tags lookup in pipeline', async () => {
      const query = {} as Parameters<typeof controller.findAll>[2];
      await controller.findAll(mockRequest, mockUser, query);
      const pipeline = gifsService.findAll.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      const lookupStages = pipeline.filter(
        (s) =>
          '$lookup' in s &&
          (s.$lookup as Record<string, string>).from === 'tags',
      );
      expect(lookupStages.length).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a single gif', async () => {
      const result = await controller.findOne(mockRequest, gifId, mockUser);
      expect(gifsService.findOne).toHaveBeenCalledWith(
        { _id: gifId },
        expect.any(Array),
      );
      expect(result).toEqual(expect.objectContaining({ _id: gifId }));
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
          entity: expect.any(String),
          entityModel: 'Ingredient',
        }),
      );
    });

    it('should set hasVoted to true when vote exists', async () => {
      votesService.findOne.mockResolvedValueOnce({
        _id: '507f191e810c19729de860ee',
      });
      const result = await controller.findOne(mockRequest, gifId, mockUser);
      expect(result.hasVoted).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove a gif and return it', async () => {
      const result = await controller.remove(mockRequest, gifId);
      expect(gifsService.remove).toHaveBeenCalledWith(gifId);
      expect(result).toEqual(expect.objectContaining({ _id: gifId }));
    });

    it('should throw NOT_FOUND when gif to remove does not exist', async () => {
      gifsService.remove.mockResolvedValueOnce(null);
      await expect(
        controller.remove(mockRequest, 'nonexistent'),
      ).rejects.toThrow(HttpException);
    });
  });
});
