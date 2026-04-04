import { IngredientsOperationsController } from '@api/collections/ingredients/controllers/ingredients-operations.controller';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
import { IngredientCategory, MetadataExtension } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('IngredientsController (cloneIngredient)', () => {
  let controller: IngredientsOperationsController;
  let service: IngredientsService;
  let filesClientService: FilesClientService;
  let sharedService: SharedService;
  let metadataService: MetadataService;
  let loggerService: LoggerService;

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

  const mockFilesClientService = { uploadToS3: vi.fn() };
  const mockSharedService = { saveDocuments: vi.fn() };

  const mockModuleRef = {
    get: vi.fn((token: unknown) => {
      if (token === FilesClientService) {
        return mockFilesClientService;
      }
      if (token === SharedService) {
        return mockSharedService;
      }
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngredientsOperationsController],
      providers: [
        {
          provide: IngredientsService,
          useValue: { findOne: vi.fn(), patch: vi.fn() },
        },
        {
          provide: MetadataService,
          useValue: { findOne: vi.fn(), patch: vi.fn() },
        },
        { provide: FilesClientService, useValue: mockFilesClientService },
        { provide: SharedService, useValue: mockSharedService },
        {
          provide: ConfigService,
          useValue: { ingredientsEndpoint: 'http://cdn' },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: ModuleRef, useValue: mockModuleRef },
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
    service = module.get<IngredientsService>(IngredientsService);
    filesClientService = module.get<FilesClientService>(FilesClientService);
    sharedService = module.get<SharedService>(SharedService);
    metadataService = module.get<MetadataService>(MetadataService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
    expect(filesClientService).toBeDefined();
    expect(sharedService).toBeDefined();
    expect(metadataService).toBeDefined();
    expect(loggerService).toBeDefined();
  });

  describe('cloneIngredient', () => {
    it('creates a copy and uploads file', async () => {
      const serviceFindOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue({
        _id: '1',
        brand: 'acc',
        category: IngredientCategory.IMAGE,
        metadata: {
          _id: 'meta',
          duration: 0,
          extension: MetadataExtension.JPEG,
          height: 200,
          model: '',
          prompt: 'prompt',
          result: 'url',
          size: 10,
          style: '',
          width: 100,
        },
        organization: 'org',
      });

      const sharedServiceSaveDocumentsSpy = vi
        .spyOn(sharedService, 'saveDocuments')
        .mockResolvedValue({
          ingredientData: { _id: '2' },
          metadataData: { _id: 'meta2' },
        });

      const filesClientServiceUploadToS3Spy = vi
        .spyOn(filesClientService, 'uploadToS3')
        .mockResolvedValue({ duration: 0, height: 200, size: 10, width: 100 });

      const metadataServicePatchSpy = vi
        .spyOn(metadataService, 'patch')
        .mockResolvedValue({});

      const result = await controller.cloneIngredient(
        mockRequest,
        mockUser,
        '507f191e810c19729de860ea',
      );

      expect(serviceFindOneSpy).toHaveBeenCalledWith(
        { _id: '507f191e810c19729de860ea' },
        [PopulatePatterns.metadataFull],
      );

      expect(sharedServiceSaveDocumentsSpy).toHaveBeenCalled();
      expect(result).toBeDefined();

      // Allow async processing to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(filesClientServiceUploadToS3Spy).toHaveBeenCalledWith(
        '2',
        'images',
        {
          type: 'url',
          url: 'http://cdn/images/507f191e810c19729de860ea',
        },
      );

      expect(metadataServicePatchSpy).toHaveBeenCalledWith('meta2', {
        duration: 0,
        hasAudio: undefined,
        height: 200,
        size: 10,
        width: 100,
      });
    });
  });
});
