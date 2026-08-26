import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';

describe('SharedService', () => {
  let service: SharedService;
  let ingredientsService: Pick<
    IngredientsService,
    'create' | 'findOne' | 'patch'
  >;
  let metadataService: Pick<MetadataService, 'create' | 'patch'>;
  let promptsService: Pick<PromptsService, 'patch'>;

  const owner = {
    brandId: '550e8400-e29b-41d4-a716-446655440003',
    organizationId: '550e8400-e29b-41d4-a716-446655440002',
    userId: '550e8400-e29b-41d4-a716-446655440001',
  };
  const mockUser = {
    brandId: owner.brandId,
    organizationId: owner.organizationId,
    userId: owner.userId,
  } as unknown as User;
  const mockMetadata = { id: '550e8400-e29b-41d4-a716-446655440004' };
  const mockIngredient = {
    id: '550e8400-e29b-41d4-a716-446655440005',
    metadataId: mockMetadata.id,
    status: IngredientStatus.PROCESSING,
    version: 1,
  };

  beforeEach(async () => {
    ingredientsService = {
      create: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
    } as unknown as typeof ingredientsService;
    metadataService = {
      create: vi.fn(),
      patch: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof metadataService;
    promptsService = {
      patch: vi.fn(),
    } as unknown as typeof promptsService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharedService,
        {
          provide: ModuleRef,
          useValue: {
            get: vi.fn((token) => {
              if (token === MetadataService) return metadataService;
              if (token === IngredientsService) return ingredientsService;
              if (token === PromptsService) return promptsService;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(SharedService);
    vi.mocked(metadataService.create).mockResolvedValue(mockMetadata as never);
    vi.mocked(ingredientsService.create).mockResolvedValue(
      mockIngredient as never,
    );
  });

  describe('createMediaDocuments', () => {
    it('persists a canonical metadata and ingredient pair', async () => {
      const promptId = '550e8400-e29b-41d4-a716-446655440006';
      const sourceIds = [
        '550e8400-e29b-41d4-a716-446655440007',
        '550e8400-e29b-41d4-a716-446655440008',
      ];

      const result = await service.createMediaDocuments(mockUser, {
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPG,
        generationPrompt: 'A boxer in a dark arena',
        generationSeed: 42,
        model: 'black-forest-labs/flux-schnell',
        promptId,
        sourceIds,
      });

      expect(metadataService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          extension: MetadataExtension.JPG,
          label: 'A boxer in a dark arena',
          model: 'black-forest-labs/flux-schnell',
          promptId,
          seed: 42,
        }),
      );
      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: owner.brandId,
          generationPrompt: 'A boxer in a dark arena',
          generationSeed: 42,
          metadataId: mockMetadata.id,
          modelUsed: 'black-forest-labs/flux-schnell',
          organizationId: owner.organizationId,
          promptId,
          sources: sourceIds,
          userId: owner.userId,
        }),
      );
      expect(result).toEqual({
        ingredientData: mockIngredient,
        metadataData: mockMetadata,
      });
    });

    it('persists redacted generation-brief compiler identity on the ingredient', async () => {
      await service.createMediaDocuments(mockUser, {
        category: IngredientCategory.IMAGE,
        generationSource:
          'generation-brief:v1:flux-schnell-capability@1:flux-schnell-image-compiler@1',
        providerData: {
          compilerId: 'flux-schnell-image-compiler',
          status: 'compiled',
        },
      });

      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          generationSource:
            'generation-brief:v1:flux-schnell-capability@1:flux-schnell-image-compiler@1',
          providerData: {
            compilerId: 'flux-schnell-image-compiler',
            status: 'compiled',
          },
        }),
      );
    });

    it('persists the confirmed agent action identity on the ingredient', async () => {
      await service.createMediaDocuments(mockUser, {
        category: IngredientCategory.IMAGE,
        sourceActionId: 'generation-card-1',
      });

      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceActionId: 'generation-card-1' }),
      );
    });

    it('derives a compact metadata label from a multiline prompt', async () => {
      await service.createMediaDocuments(mockUser, {
        category: IngredientCategory.IMAGE,
        generationPrompt: 'SCENE:\nA boxer in a dark arena',
      });

      expect(metadataService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          extension: MetadataExtension.JPEG,
          label: 'SCENE: A boxer in a dark arena',
        }),
      );
    });

    it('increments the version from the canonical parent row', async () => {
      const parentId = '550e8400-e29b-41d4-a716-446655440009';
      vi.mocked(ingredientsService.findOne).mockResolvedValue({
        id: parentId,
        version: 5,
      } as never);

      await service.createMediaDocuments(mockUser, {
        category: IngredientCategory.VIDEO,
        parentId,
      });

      expect(ingredientsService.findOne).toHaveBeenCalledWith({ id: parentId });
      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentId, version: 6 }),
      );
    });

    it('rejects malformed canonical relation IDs before writing', async () => {
      await expect(
        service.createMediaDocuments(mockUser, {
          category: IngredientCategory.IMAGE,
          promptId: 'not-an-id',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(metadataService.create).not.toHaveBeenCalled();
      expect(ingredientsService.create).not.toHaveBeenCalled();
    });

    it('soft-deletes metadata when ingredient persistence fails', async () => {
      vi.mocked(ingredientsService.create).mockRejectedValue(
        new Error('Ingredient create failed'),
      );

      await expect(
        service.createMediaDocuments(mockUser, {
          category: IngredientCategory.IMAGE,
        }),
      ).rejects.toThrow('Ingredient create failed');

      expect(metadataService.patch).toHaveBeenCalledWith(mockMetadata.id, {
        isDeleted: true,
      });
    });
  });

  describe('createMediaDocumentsInternal', () => {
    it('requires and persists explicit canonical ownership IDs', async () => {
      await service.createMediaDocumentsInternal({
        brandId: owner.brandId,
        category: IngredientCategory.VOICE,
        organizationId: owner.organizationId,
        userId: owner.userId,
      });

      expect(metadataService.create).toHaveBeenCalledWith(
        expect.objectContaining({ extension: MetadataExtension.MP3 }),
      );
      expect(ingredientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...owner,
          isDefault: false,
          metadataId: mockMetadata.id,
          status: IngredientStatus.PROCESSING,
          version: 1,
        }),
      );
    });
  });

  describe('updateDocuments', () => {
    it('completes both documents and links the prompt bidirectionally', async () => {
      const promptId = '550e8400-e29b-41d4-a716-446655440006';
      const metadata = new MetadataEntity({ id: mockMetadata.id });
      const ingredient = new IngredientEntity({ id: mockIngredient.id });

      await service.updateDocuments(
        metadata,
        ingredient,
        'https://cdn.example/media.jpg',
        ` ${promptId} `,
      );

      expect(metadataService.patch).toHaveBeenCalledWith(metadata.id, {
        promptId,
        result: 'https://cdn.example/media.jpg',
      });
      expect(ingredientsService.patch).toHaveBeenCalledWith(ingredient.id, {
        promptId,
        status: IngredientStatus.GENERATED,
      });
      expect(promptsService.patch).toHaveBeenCalledWith(promptId, {
        ingredientId: ingredient.id,
      });
    });

    it('rejects a malformed prompt ID', async () => {
      await expect(
        service.updateDocuments(
          new MetadataEntity({ id: mockMetadata.id }),
          new IngredientEntity({ id: mockIngredient.id }),
          'result',
          'not-an-id',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(metadataService.patch).not.toHaveBeenCalled();
      expect(ingredientsService.patch).not.toHaveBeenCalled();
      expect(promptsService.patch).not.toHaveBeenCalled();
    });
  });
});
