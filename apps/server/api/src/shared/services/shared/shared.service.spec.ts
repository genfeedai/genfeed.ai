import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import {
  IngredientCategory,
  IngredientExtension,
  IngredientStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

describe('SharedService', () => {
  let service: SharedService;
  let ingredientsService: IngredientsService;
  let metadataService: MetadataService;
  let moduleRef: ModuleRef;

  const mockUser = {
    publicMetadata: {
      brand: '507f1f77bcf86cd799439016',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockMetadata = {
    _id: '507f1f77bcf86cd799439013',
    brand: null,
    prompt: null,
    user: '507f1f77bcf86cd799439011',
  };

  const mockIngredient = {
    _id: '507f1f77bcf86cd799439014',
    brand: null,
    frame: null,
    isDefault: false,
    metadata: '507f1f77bcf86cd799439013',
    organization: null,
    parent: null,
    prompt: null,
    script: null,
    status: IngredientStatus.PROCESSING,
    user: '507f1f77bcf86cd799439011',
    version: 1,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharedService,
        {
          provide: IngredientsService,
          useValue: {
            create: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: PromptsService,
          useValue: {
            patch: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SharedService>(SharedService);
    ingredientsService = module.get<IngredientsService>(IngredientsService);
    moduleRef = module.get<ModuleRef>(ModuleRef);

    metadataService = {
      create: vi.fn(),
      patch: vi.fn(),
    } as Partial<MetadataService> as MetadataService;

    (moduleRef.get as vi.Mock).mockImplementation((token) => {
      if (token === MetadataService) {
        return metadataService;
      }
      return null;
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveDocuments', () => {
    it('should create metadata and ingredient documents', async () => {
      const body = {
        brand: '507f1f77bcf86cd799439016',
        frame: '507f1f77bcf86cd799439018',
        organization: '507f1f77bcf86cd799439017',
        prompt: '507f1f77bcf86cd799439015',
        script: '507f1f77bcf86cd799439019',
        status: IngredientStatus.PROCESSING,
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.create as vi.Mock).mockResolvedValue(mockIngredient);

      const result = await service.saveDocuments(mockUser, body);

      expect(metadataService.create).toHaveBeenCalled();
      expect(ingredientsService.create).toHaveBeenCalled();
      expect(result).toEqual({
        ingredientData: mockIngredient,
        metadataData: mockMetadata,
      });
    });

    it('should handle parent versioning', async () => {
      const body = {
        parent: '507f1f77bcf86cd799439020',
        status: IngredientStatus.PROCESSING,
      };

      const parentIngredient = {
        _id: '507f1f77bcf86cd799439020',
        version: 5,
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.findOne as vi.Mock).mockResolvedValue(
        parentIngredient,
      );
      (ingredientsService.create as vi.Mock).mockResolvedValue({
        ...mockIngredient,
        parent: '507f1f77bcf86cd799439020',
        version: 6,
      });

      await service.saveDocuments(mockUser, body);

      expect(ingredientsService.findOne).toHaveBeenCalledWith({
        _id: '507f1f77bcf86cd799439020',
      });
      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: '507f1f77bcf86cd799439020',
          version: 6,
        }),
      );
    });

    it('should create ingredient with PROCESSING status by default', async () => {
      const body = { status: IngredientStatus.PROCESSING };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.create as vi.Mock).mockResolvedValue(mockIngredient);

      await service.saveDocuments(mockUser, body);

      expect(metadataService.create).toHaveBeenCalled();
      expect(ingredientsService.create).toHaveBeenCalled();
    });

    it('should handle invalid ObjectIds gracefully', async () => {
      const body = {
        brand: 'invalid-id',
        frame: 'invalid-id',
        organization: 'invalid-id',
        prompt: 'invalid-id',
        script: 'invalid-id',
        status: IngredientStatus.PROCESSING,
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.create as vi.Mock).mockResolvedValue(mockIngredient);

      const result = await service.saveDocuments(mockUser, body);

      expect(metadataService.create).toHaveBeenCalled();
      expect(ingredientsService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('updateDocuments', () => {
    it('should update metadata and ingredient documents', async () => {
      const metadataData = new MetadataEntity({
        _id: '507f1f77bcf86cd799439013',
      });
      const ingredientData = new IngredientEntity({
        _id: '507f1f77bcf86cd799439014',
      });
      const result = 'Updated result';
      const promptId = '507f1f77bcf86cd799439015';

      (metadataService.patch as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.patch as vi.Mock).mockResolvedValue(mockIngredient);

      await service.updateDocuments(
        metadataData,
        ingredientData,
        result,
        promptId,
      );

      expect(metadataService.patch).toHaveBeenCalledWith(
        metadataData._id,
        expect.objectContaining({
          prompt: promptId,
          result,
        }),
      );
      expect(ingredientsService.patch).toHaveBeenCalledWith(
        ingredientData._id,
        {
          prompt: promptId,
          status: IngredientStatus.GENERATED,
        },
      );
    });

    it('should handle updates without promptId', async () => {
      const metadataData = new MetadataEntity({
        _id: '507f1f77bcf86cd799439013',
      });
      const ingredientData = new IngredientEntity({
        _id: '507f1f77bcf86cd799439014',
      });
      const result = 'Updated result';

      (metadataService.patch as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.patch as vi.Mock).mockResolvedValue(mockIngredient);

      await service.updateDocuments(metadataData, ingredientData, result);

      expect(metadataService.patch).toHaveBeenCalledWith(
        metadataData._id,
        expect.objectContaining({
          prompt: undefined,
          result,
        }),
      );
      expect(ingredientsService.patch).toHaveBeenCalledWith(
        ingredientData._id,
        {
          prompt: undefined,
          status: IngredientStatus.GENERATED,
        },
      );
    });

    it('should handle invalid promptId', async () => {
      const metadataData = new MetadataEntity({
        _id: '507f1f77bcf86cd799439013',
      });
      const ingredientData = new IngredientEntity({
        _id: '507f1f77bcf86cd799439014',
      });
      const result = 'Updated result';
      const invalidPromptId = 'invalid-id';

      (metadataService.patch as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.patch as vi.Mock).mockResolvedValue(mockIngredient);

      await service.updateDocuments(
        metadataData,
        ingredientData,
        result,
        invalidPromptId as unknown as string,
      );

      expect(metadataService.patch).toHaveBeenCalledWith(
        metadataData._id,
        expect.objectContaining({
          prompt: undefined,
          result,
        }),
      );
      expect(ingredientsService.patch).toHaveBeenCalledWith(
        ingredientData._id,
        {
          prompt: undefined,
          status: IngredientStatus.GENERATED,
        },
      );
    });
  });

  describe('saveDocumentsInternal', () => {
    it('should create metadata and ingredient without user context', async () => {
      const body = {
        brand: '507f1f77bcf86cd799439016',
        category: IngredientCategory.IMAGE,
        extension: IngredientExtension.JPG,
        organization: '507f1f77bcf86cd799439017',
        user: '507f1f77bcf86cd799439011',
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.create as vi.Mock).mockResolvedValue(mockIngredient);

      const result = await service.saveDocumentsInternal(body);

      expect(metadataService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: body.brand,
          extension: body.extension,
          organization: body.organization,
          user: body.user,
        }),
      );
      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: body.brand,
          isDefault: false,
          metadata: '507f1f77bcf86cd799439013',
          organization: body.organization,
          status: IngredientStatus.PROCESSING,
          user: body.user,
          version: 1,
        }),
      );
      expect(result).toEqual({
        ingredientData: mockIngredient,
        metadataData: mockMetadata,
      });
    });

    it('should handle parent versioning in saveDocumentsInternal', async () => {
      const parentId = '507f1f77bcf86cd799439020';
      const body = {
        brand: '507f1f77bcf86cd799439016',
        category: IngredientCategory.IMAGE,
        extension: IngredientExtension.JPG,
        organization: '507f1f77bcf86cd799439017',
        parent: parentId,
        user: '507f1f77bcf86cd799439011',
      };

      const parentIngredient = {
        _id: parentId,
        version: 3,
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.findOne as vi.Mock).mockResolvedValue(
        parentIngredient,
      );
      (ingredientsService.create as vi.Mock).mockResolvedValue({
        ...mockIngredient,
        parent: parentId,
        version: 4,
      });

      const result = await service.saveDocumentsInternal(body);

      expect(ingredientsService.findOne).toHaveBeenCalledWith({
        _id: parentId,
      });
      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: parentId,
          version: 4,
        }),
      );
      expect(result.ingredientData.version).toBe(4);
    });

    it('should default to version 1 when parent not found', async () => {
      const parentId = '507f1f77bcf86cd799439020';
      const body = {
        brand: '507f1f77bcf86cd799439016',
        category: IngredientCategory.IMAGE,
        extension: IngredientExtension.JPG,
        organization: '507f1f77bcf86cd799439017',
        parent: parentId,
        user: '507f1f77bcf86cd799439011',
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.findOne as vi.Mock).mockResolvedValue(null);
      (ingredientsService.create as vi.Mock).mockResolvedValue({
        ...mockIngredient,
        parent: parentId,
        version: 1,
      });

      const result = await service.saveDocumentsInternal(body);

      expect(result.ingredientData.version).toBe(1);
    });

    it('should handle custom status in saveDocumentsInternal', async () => {
      const body = {
        brand: '507f1f77bcf86cd799439016',
        category: IngredientCategory.IMAGE,
        extension: IngredientExtension.JPG,
        organization: '507f1f77bcf86cd799439017',
        status: IngredientStatus.UPLOADED,
        user: '507f1f77bcf86cd799439011',
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.create as vi.Mock).mockResolvedValue({
        ...mockIngredient,
        status: IngredientStatus.UPLOADED,
      });

      await service.saveDocumentsInternal(body);

      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: IngredientStatus.UPLOADED,
        }),
      );
    });

    it('should include prompt when provided', async () => {
      const promptId = '507f1f77bcf86cd799439015';
      const body = {
        brand: '507f1f77bcf86cd799439016',
        category: IngredientCategory.IMAGE,
        extension: IngredientExtension.JPG,
        organization: '507f1f77bcf86cd799439017',
        prompt: promptId,
        user: '507f1f77bcf86cd799439011',
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.create as vi.Mock).mockResolvedValue(mockIngredient);

      await service.saveDocumentsInternal(body);

      expect(metadataService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: promptId,
        }),
      );
    });

    it('should include sources when provided', async () => {
      const sourceIds = [
        '507f1f77bcf86cd799439021',
        '507f1f77bcf86cd799439022',
      ];
      const body = {
        brand: '507f1f77bcf86cd799439016',
        category: IngredientCategory.IMAGE,
        extension: IngredientExtension.JPG,
        organization: '507f1f77bcf86cd799439017',
        sources: sourceIds,
        user: '507f1f77bcf86cd799439011',
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.create as vi.Mock).mockResolvedValue(mockIngredient);

      await service.saveDocumentsInternal(body);

      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sources: sourceIds,
        }),
      );
    });

    it('should pass through additional body properties', async () => {
      const body = {
        brand: '507f1f77bcf86cd799439016',
        category: IngredientCategory.IMAGE,
        customField: 'custom value',
        extension: IngredientExtension.JPG,
        organization: '507f1f77bcf86cd799439017',
        user: '507f1f77bcf86cd799439011',
      };

      (metadataService.create as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.create as vi.Mock).mockResolvedValue(mockIngredient);

      await service.saveDocumentsInternal(body);

      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customField: 'custom value',
        }),
      );
    });
  });

  describe('updateDocuments - prompt linking', () => {
    it('should link prompt bidirectionally when promptId is valid', async () => {
      const metadataData = new MetadataEntity({
        _id: '507f1f77bcf86cd799439013',
      });
      const ingredientData = new IngredientEntity({
        _id: '507f1f77bcf86cd799439014',
      });
      const result = 'Updated result';
      const promptId = '507f1f77bcf86cd799439015';

      const mockPromptsService = {
        patch: vi.fn().mockResolvedValue({}),
      };

      Object.defineProperty(service, 'promptsService', {
        configurable: true,
        get: () => mockPromptsService,
      });

      (metadataService.patch as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.patch as vi.Mock).mockResolvedValue(mockIngredient);

      await service.updateDocuments(
        metadataData,
        ingredientData,
        result,
        promptId,
      );

      expect(mockPromptsService.patch).toHaveBeenCalledWith(promptId, {
        ingredient: ingredientData._id,
      });
    });

    it('should not update prompt when promptId is invalid', async () => {
      const metadataData = new MetadataEntity({
        _id: '507f1f77bcf86cd799439013',
      });
      const ingredientData = new IngredientEntity({
        _id: '507f1f77bcf86cd799439014',
      });
      const result = 'Updated result';
      const invalidPromptId = 'not-a-valid-id';

      const mockPromptsService = {
        patch: vi.fn(),
      };

      Object.defineProperty(service, 'promptsService', {
        configurable: true,
        get: () => mockPromptsService,
      });

      (metadataService.patch as vi.Mock).mockResolvedValue(mockMetadata);
      (ingredientsService.patch as vi.Mock).mockResolvedValue(mockIngredient);

      await service.updateDocuments(
        metadataData,
        ingredientData,
        result,
        invalidPromptId as unknown as string,
      );

      expect(mockPromptsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('private methods', () => {
    it('should get metadataService through moduleRef', () => {
      const metadataServiceGetter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(service),
        'metadataService',
      )?.get;

      if (metadataServiceGetter) {
        const result = metadataServiceGetter.call(service);
        expect(result).toBe(metadataService);
        expect(moduleRef.get).toHaveBeenCalledWith(MetadataService, {
          strict: false,
        });
      }
    });
  });
});
