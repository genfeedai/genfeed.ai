vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { IngredientsOperationsController } from '@api/collections/ingredients/controllers/ingredients-operations.controller';
import { BulkDeleteIngredientsDto } from '@api/collections/ingredients/dto/bulk-delete-ingredients.dto';
import { UpdateTagsDto } from '@api/collections/ingredients/dto/update-tags.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('IngredientsOperationsController', () => {
  let controller: IngredientsOperationsController;
  let ingredientsService: IngredientsService;
  let metadataService: MetadataService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/ingredients',
    params: {},
    query: {},
  } as unknown as Request;

  const mockIngredient = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    brand: new Types.ObjectId('507f1f77bcf86cd799439013'),
    category: 'image',
    metadata: {
      _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
      extension: 'jpg',
      height: 1080,
      width: 1920,
    },
    organization: {
      id: new Types.ObjectId('507f1f77bcf86cd799439012'),
    },
    user: {
      id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    },
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
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439016'),
        },
        metadataData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439017'),
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
      .overrideGuard(ClerkGuard)
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
        '507f1f77bcf86cd799439014',
      );

      expect(ingredientsService.findOne).toHaveBeenCalled();
      expect(mockServices.sharedService.saveDocuments).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('refreshMetadata', () => {
    it('should refresh metadata successfully', async () => {
      const result = await controller.refreshMetadata(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
      );

      expect(ingredientsService.findOne).toHaveBeenCalled();
      expect(
        mockServices.filesClientService.extractMetadataFromUrl,
      ).toHaveBeenCalled();
      expect(metadataService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
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
        '507f1f77bcf86cd799439014',
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
        tags: [
          new Types.ObjectId('507f1f77bcf86cd799439020'),
          new Types.ObjectId('507f1f77bcf86cd799439021'),
        ],
      };

      const result = await controller.updateTags(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
        updateTagsDto,
      );

      expect(ingredientsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple ingredients successfully', async () => {
      const bulkDeleteDto: BulkDeleteIngredientsDto = {
        ids: ['507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015'],
      };

      mockServices.ingredientsService.findOne
        .mockResolvedValueOnce({
          ...mockIngredient,
          user: { id: new Types.ObjectId('507f1f77bcf86cd799439011') },
        })
        .mockResolvedValueOnce({
          ...mockIngredient,
          _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
          user: { id: new Types.ObjectId('507f1f77bcf86cd799439011') },
        });

      const result = await controller.bulkDelete(mockUser, bulkDeleteDto);

      expect(result.deleted.length).toBeGreaterThan(0);
      expect(result.message).toBeDefined();
    });
  });
});
