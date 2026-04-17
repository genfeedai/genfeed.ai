import { IngredientsRelationshipsController } from '@api/collections/ingredients/controllers/ingredients-relationships.controller';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

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
    _id: '507f1f77bcf86cd799439014',
    category: 'image',
    metadata: {
      _id: '507f1f77bcf86cd799439015',
      label: 'Test Image',
    },
    organization: '507f1f77bcf86cd799439099',
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
            _id: '507f1f77bcf86cd799439020',
            ingredients: ['507f1f77bcf86cd799439014'],
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
      .overrideGuard(ClerkGuard)
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
        '507f1f77bcf86cd799439014',
        {},
      );

      expect(ingredientsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findMetadata', () => {
    it('should return ingredient metadata', async () => {
      const result = await controller.findMetadata(
        mockRequest,
        '507f1f77bcf86cd799439014',
      );

      expect(ingredientsService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findPosts', () => {
    it('should return posts for ingredient', async () => {
      const result = await controller.findPosts(
        mockRequest,
        '507f1f77bcf86cd799439014',
        {},
      );

      expect(ingredientsService.findOne).toHaveBeenCalledWith({
        _id: '507f1f77bcf86cd799439014',
        isDeleted: false,
      });
      expect(postsService.findAll).toHaveBeenCalledWith(
        [
          {
            $match: {
              ingredients: '507f1f77bcf86cd799439014',
              isDeleted: false,
              organization: mockIngredient.organization,
            },
          },
          {
            $sort: { createdAt: -1 },
          },
        ],
        expect.objectContaining({
          customLabels: expect.objectContaining({
            totalDocs: 'total',
            totalPages: 'pages',
          }),
          limit: expect.any(Number),
          page: 1,
          pagination: true,
        }),
      );
      expect(result).toBeDefined();
    });
  });
});
