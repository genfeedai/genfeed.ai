import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { IngredientsRelationshipsController } from '@api/collections/ingredients/controllers/ingredients-relationships.controller';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const ingredientId = testId('ingredient');
const ingredientMetadataId = testId('ingredientmeta');
const organizationId = testId('org');
const postId = testId('post');

describe('IngredientsRelationshipsController', () => {
  let controller: IngredientsRelationshipsController;
  let ingredientsService: IngredientsService;
  let postsService: PostsService;

  const mockRequest = {
    originalUrl: '/api/ingredients',
    params: {},
    query: {},
  } as unknown as Request;

  const mockIngredient = {
    id: ingredientId,
    category: 'image',
    metadata: {
      id: ingredientMetadataId,
      label: 'Test Image',
    },
    organizationId,
  };

  const mockServices = {
    ingredientsService: {
      findAll: vi.fn().mockResolvedValue({
        docs: [mockIngredient],
        limit: 10,
        page: 1,
        pages: 1,
        total: 1,
      }),
      findOne: vi.fn().mockResolvedValue(mockIngredient),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    postsService: {
      findAll: vi.fn().mockResolvedValue({
        docs: [
          {
            id: postId,
            ingredients: [{ id: ingredientId }],
          },
        ],
        limit: 10,
        page: 1,
        pages: 1,
        total: 1,
      }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngredientsRelationshipsController],
      providers: [
        {
          provide: IngredientsService,
          useValue: mockServices.ingredientsService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: PostsService, useValue: mockServices.postsService },
        {
          provide: ModuleRef,
          useValue: {
            get: vi.fn().mockReturnValue(mockServices.postsService),
          },
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IngredientsRelationshipsController>(
      IngredientsRelationshipsController,
    );
    ingredientsService = module.get<IngredientsService>(IngredientsService);
    postsService = module.get<PostsService>(PostsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findChildren', () => {
    it('should return child ingredients', async () => {
      const result = await controller.findChildren(
        mockRequest,
        ingredientId,
        {},
      );

      expect(ingredientsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parentId: ingredientId,
            trainingId: null,
          }),
        }),
        expect.anything(),
      );
      expect(result).toBeDefined();
    });
  });

  describe('findMetadata', () => {
    it('should return ingredient metadata', async () => {
      const result = await controller.findMetadata(mockRequest, ingredientId);

      expect(ingredientsService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findPosts', () => {
    it('should return posts for ingredient', async () => {
      const result = await controller.findPosts(mockRequest, ingredientId, {});

      expect(ingredientsService.findOne).toHaveBeenCalledWith({
        id: ingredientId,
      });
      expect(postsService.findAll).toHaveBeenCalledWith(
        {
          orderBy: { createdAt: -1 },
          where: {
            ingredients: {
              some: { id: ingredientId },
            },
            isDeleted: false,
            organizationId: mockIngredient.organizationId,
          },
        },
        expect.objectContaining({
          limit: 10,
          page: 1,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should scope to an explicit null when the ingredient has no organization', async () => {
      // `normalizeWhere` drops undefined values, so an unscoped read here would
      // list posts across every tenant. The filter must stay present as null.
      mockServices.ingredientsService.findOne.mockResolvedValueOnce({
        id: ingredientId,
        category: 'image',
      });

      await controller.findPosts(mockRequest, ingredientId, {});

      expect(postsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: null }),
        }),
        expect.anything(),
      );
    });
  });
});
