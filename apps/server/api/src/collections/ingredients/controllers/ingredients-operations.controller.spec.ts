vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsOperationsController } from '@api/collections/ingredients/controllers/ingredients-operations.controller';
import { BulkDeleteIngredientsDto } from '@api/collections/ingredients/dto/bulk-delete-ingredients.dto';
import { UpdateTagsDto } from '@api/collections/ingredients/dto/update-tags.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientCategory } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import type { Request } from 'express';

describe('IngredientsOperationsController', () => {
  let controller: IngredientsOperationsController;
  let ingredientsService: IngredientsService;
  let metadataService: MetadataService;

  const mockUser = {
    id: 'user_123',
    brandId: 'c07f1f77bcf86cd799439013',
    organizationId: 'c07f1f77bcf86cd799439012',
    userId: 'c07f1f77bcf86cd799439011',
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/ingredients',
    params: {},
    query: {},
  } as unknown as Request;

  const mockIngredient = {
    id: 'c07f1f77bcf86cd799439014',
    brandId: 'c07f1f77bcf86cd799439013',
    category: 'image',
    metadata: {
      id: 'c07f1f77bcf86cd799439015',
      extension: 'jpg',
      height: 1080,
      width: 1920,
    },
    metadataId: 'c07f1f77bcf86cd799439015',
    organizationId: 'c07f1f77bcf86cd799439012',
    userId: 'c07f1f77bcf86cd799439011',
  };

  const mockServices = {
    configService: {
      ingredientsEndpoint: 'https://api.example.com/ingredients',
    },
    filesClientService: {
      extractMetadataFromUrl: vi.fn().mockResolvedValue({
        duration: null,
        hasAudio: false,
        height: 1080,
        size: 1024 * 1024,
        width: 1920,
      }),
      uploadToS3: vi.fn().mockResolvedValue({
        duration: null,
        hasAudio: false,
        height: 1080,
        size: 1024 * 1024,
        width: 1920,
      }),
    },
    ingredientsService: {
      bulkSoftDeleteScoped: vi
        .fn()
        .mockResolvedValue({ deleted: [], failed: [] }),
      findOne: vi.fn().mockResolvedValue(mockIngredient),
      getKPIMetrics: vi.fn().mockResolvedValue({
        byCategory: {},
        total: 100,
      }),
      patch: vi.fn().mockResolvedValue(mockIngredient),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: {
      findOne: vi.fn().mockResolvedValue(mockIngredient.metadata),
      patch: vi.fn().mockResolvedValue(mockIngredient.metadata),
    },
    sharedService: {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: {
          id: 'c07f1f77bcf86cd799439016',
        },
        metadataData: {
          id: 'c07f1f77bcf86cd799439017',
        },
      }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngredientsOperationsController],
      providers: [
        {
          provide: MembersService,
          useValue: { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: vi.fn().mockImplementation((token: unknown) => {
              if (token === SharedService) return mockServices.sharedService;
              if (token === FilesClientService)
                return mockServices.filesClientService;
              // NotificationsPublisherService fallback
              return {
                publishIngredientStatus: vi.fn().mockResolvedValue(undefined),
              };
            }),
          },
        },
        { provide: ConfigService, useValue: mockServices.configService },
        {
          provide: FilesClientService,
          useValue: mockServices.filesClientService,
        },
        {
          provide: IngredientsService,
          useValue: mockServices.ingredientsService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: MetadataService, useValue: mockServices.metadataService },
        { provide: SharedService, useValue: mockServices.sharedService },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IngredientsOperationsController>(
      IngredientsOperationsController,
    );
    ingredientsService = module.get<IngredientsService>(IngredientsService);
    metadataService = module.get<MetadataService>(MetadataService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAnalytics', () => {
    it('should return analytics data', async () => {
      const result = await controller.getAnalytics(mockUser, 'image');

      expect(ingredientsService.getKPIMetrics).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('cloneIngredient', () => {
    it('should clone an ingredient successfully', async () => {
      const result = await controller.cloneIngredient(
        mockRequest,
        mockUser,
        'c07f1f77bcf86cd799439014',
      );

      expect(ingredientsService.findOne).toHaveBeenCalled();
      expect(
        mockServices.sharedService.createMediaDocuments,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    // Regression: production categories are SCREAMING_SNAKE, but uploads land
    // in lowercase plural folders. The raw `${category}s` interpolation sent
    // the clone to `VIDEOs/` and pulled its source from a key that never
    // existed. The `category: 'image'` fixture above is why this shipped green.
    it('lower-cases a SCREAMING_SNAKE category for the clone source URL and S3 folder', async () => {
      mockServices.ingredientsService.findOne.mockResolvedValueOnce({
        ...mockIngredient,
        category: IngredientCategory.VIDEO,
      });

      await controller.cloneIngredient(
        mockRequest,
        mockUser,
        'c07f1f77bcf86cd799439014',
      );

      await vi.waitFor(() => {
        expect(mockServices.filesClientService.uploadToS3).toHaveBeenCalledWith(
          'c07f1f77bcf86cd799439016',
          'videos',
          expect.objectContaining({
            url: 'https://api.example.com/ingredients/videos/c07f1f77bcf86cd799439014',
          }),
        );
      });
    });
  });

  describe('refreshMetadata', () => {
    it('should refresh metadata successfully', async () => {
      const result = await controller.refreshMetadata(
        mockRequest,
        'c07f1f77bcf86cd799439014',
        mockUser,
      );

      expect(ingredientsService.findOne).toHaveBeenCalled();
      expect(
        mockServices.filesClientService.extractMetadataFromUrl,
      ).toHaveBeenCalled();
      expect(metadataService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    // Regression: same defect on the read path — `VIDEOs/` resolves to nothing,
    // so metadata extraction silently failed for every real ingredient.
    it('lower-cases a SCREAMING_SNAKE category for the metadata source URL', async () => {
      mockServices.ingredientsService.findOne.mockResolvedValueOnce({
        ...mockIngredient,
        category: IngredientCategory.VIDEO,
      });

      await controller.refreshMetadata(
        mockRequest,
        'c07f1f77bcf86cd799439014',
        mockUser,
      );

      expect(
        mockServices.filesClientService.extractMetadataFromUrl,
      ).toHaveBeenCalledWith(
        'https://api.example.com/ingredients/videos/c07f1f77bcf86cd799439014',
      );
    });
  });

  describe('updateMetadata', () => {
    it('should update metadata successfully', async () => {
      const updateDto = {
        description: 'Updated Description',
        label: 'Updated Label',
      };

      const result = await controller.updateMetadata(
        mockRequest,
        'c07f1f77bcf86cd799439014',
        mockUser,
        updateDto,
      );

      expect(metadataService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('updateTags', () => {
    it('should update tags successfully', async () => {
      const updateTagsDto: UpdateTagsDto = {
        tags: ['c07f1f77bcf86cd799439020', 'c07f1f77bcf86cd799439021'],
      };

      const result = await controller.updateTags(
        mockRequest,
        'c07f1f77bcf86cd799439014',
        mockUser,
        updateTagsDto,
      );

      expect(ingredientsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('bulkDelete', () => {
    const bulkDeleteDto: BulkDeleteIngredientsDto = {
      ids: ['c07f1f77bcf86cd799439014', 'c07f1f77bcf86cd799439015'],
    };

    it('should delete multiple ingredients in a single scoped call', async () => {
      mockServices.ingredientsService.bulkSoftDeleteScoped.mockResolvedValueOnce(
        { deleted: bulkDeleteDto.ids, failed: [] },
      );

      const result = await controller.bulkDelete(mockUser, bulkDeleteDto);

      expect(
        mockServices.ingredientsService.bulkSoftDeleteScoped,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockServices.ingredientsService.bulkSoftDeleteScoped,
      ).toHaveBeenCalledWith({
        ids: bulkDeleteDto.ids,
        organizationId: 'c07f1f77bcf86cd799439012',
        userId: 'c07f1f77bcf86cd799439011',
      });
      expect(mockServices.ingredientsService.findOne).not.toHaveBeenCalled();
      expect(result.deleted).toEqual(bulkDeleteDto.ids);
      expect(result.failed).toEqual([]);
      expect(result.message).toBe('Successfully deleted 2 ingredient(s)');
    });

    it('should report inaccessible ingredients as failed', async () => {
      mockServices.ingredientsService.bulkSoftDeleteScoped.mockResolvedValueOnce(
        {
          deleted: ['c07f1f77bcf86cd799439014'],
          failed: ['c07f1f77bcf86cd799439015'],
        },
      );

      const result = await controller.bulkDelete(mockUser, bulkDeleteDto);

      expect(result.deleted).toEqual(['c07f1f77bcf86cd799439014']);
      expect(result.failed).toEqual(['c07f1f77bcf86cd799439015']);
      expect(result.message).toBe(
        'Successfully deleted 1 ingredient(s), failed to delete 1',
      );
      expect(mockServices.loggerService.warn).toHaveBeenCalled();
    });
  });
});
