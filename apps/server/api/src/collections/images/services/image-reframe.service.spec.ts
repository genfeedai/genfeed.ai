import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageReframeService } from '@api/collections/images/services/image-reframe.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  PromptCategory,
  PromptStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

describe('ImageReframeService', () => {
  const imageId = testId('image');
  const reframedImageId = testId('reframed');
  const metadataId = testId('metadata');
  const promptId = testId('prompt');
  const activityId = testId('activity');
  const generationId = 'replicate-generation-id';
  const user = {
    brandId: testId('user-brand'),
    id: testId('session-user'),
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;
  const parent = {
    brandId: testId('parent-brand'),
    id: imageId,
    organizationId: testId('parent-org'),
  };
  const ingredientData = {
    brand: {
      description: 'Trusted brand context',
      label: 'Acme',
    },
    id: reframedImageId,
    status: IngredientStatus.PROCESSING,
  };
  const promptData = {
    id: promptId,
    original: 'Reframe to a wide product shot',
  };
  const request = {
    selectedModel: { category: ModelCategory.IMAGE },
  } as unknown as Request;
  const body: CreateImageDto = {
    format: 'landscape',
    height: 1080,
    negativePrompt: 'blur',
    references: [testId('reference')],
    seed: 42,
    style: 'editorial',
    tags: [testId('tag')],
    text: promptData.original,
    width: 1920,
  };

  let service: ImageReframeService;
  let activitiesService: { create: ReturnType<typeof vi.fn> };
  let failedGenerationService: {
    handleFailedImageGeneration: ReturnType<typeof vi.fn>;
  };
  let imagesService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let promptsService: { create: ReturnType<typeof vi.fn> };
  let promptBuilderService: { buildPrompt: ReturnType<typeof vi.fn> };
  let replicateService: { generateTextToImage: ReturnType<typeof vi.fn> };
  let sharedService: { createMediaDocuments: ReturnType<typeof vi.fn> };
  let websocketService: {
    publishBackgroundTaskUpdate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    activitiesService = {
      create: vi.fn().mockResolvedValue({ id: activityId }),
    };
    failedGenerationService = {
      handleFailedImageGeneration: vi.fn(),
    };
    imagesService = {
      findOne: vi.fn().mockResolvedValue(parent),
      patch: vi.fn(),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };
    metadataService = { patch: vi.fn() };
    promptsService = {
      create: vi
        .fn()
        .mockImplementation((prompt: { original: string }) =>
          Promise.resolve({ id: promptId, original: prompt.original }),
        ),
    };
    promptBuilderService = {
      buildPrompt: vi.fn().mockResolvedValue({
        input: { prompt: 'provider prompt' },
      }),
    };
    replicateService = {
      generateTextToImage: vi.fn().mockResolvedValue(generationId),
    };
    sharedService = {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData,
        metadataData: { id: metadataId },
      }),
    };
    websocketService = {
      publishBackgroundTaskUpdate: vi.fn(),
    };

    service = new ImageReframeService(
      activitiesService as unknown as ActivitiesService,
      {
        ingredientsEndpoint: 'https://api.example.com/ingredients',
      } as ConfigService,
      failedGenerationService as unknown as FailedGenerationService,
      imagesService as unknown as ImagesService,
      loggerService as unknown as LoggerService,
      metadataService as unknown as MetadataService,
      promptsService as unknown as PromptsService,
      promptBuilderService as unknown as PromptBuilderService,
      replicateService as unknown as ReplicateService,
      sharedService as unknown as SharedService,
      websocketService as unknown as NotificationsPublisherService,
    );
  });

  it('preserves the authorized reframe orchestration and returns the processing ingredient', async () => {
    await expect(
      service.reframeImage(request, imageId, user, body),
    ).resolves.toBe(ingredientData);

    expect(loggerService.log).toHaveBeenCalledWith(
      'ImagesTransformationsController reframeImage',
      { body, params: { imageId } },
    );
    expect(imagesService.findOne).toHaveBeenCalledWith(
      {
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
        id: imageId,
        userId: user.userId,
      },
      [PopulatePatterns.metadataFull],
    );
    expect(promptsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: parent.brandId,
        category: PromptCategory.MODELS_PROMPT_IMAGE,
        model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        organizationId: user.organizationId,
        original: body.text,
        status: PromptStatus.PROCESSING,
        userId: user.userId,
      }),
    );
    expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(user, {
      brandId: parent.brandId,
      category: CategoryPrismaUtil.toIngredientCategory(
        IngredientCategory.IMAGE,
      ),
      extension: MetadataExtension.JPEG,
      generationPrompt: promptData.original,
      generationSeed: body.seed,
      height: body.height,
      model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
      negativePrompt: body.negativePrompt,
      organizationId: parent.organizationId,
      parentId: parent.id,
      promptId,
      scope: body.scope,
      sourceIds: body.references,
      status: IngredientStatus.PROCESSING,
      tagIds: body.tags,
      transformations: [TransformationCategory.REFRAMED],
      width: body.width,
    });
    expect(imagesService.patch).toHaveBeenCalledWith(reframedImageId, {
      promptId,
    });
    expect(activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: parent.brandId,
        entityId: reframedImageId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_REFRAME_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.IMAGE_REFRAME,
        userId: user.userId,
        value: JSON.stringify({
          ingredientId: reframedImageId,
          model: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
          sourceId: imageId,
          type: 'transformation',
        }),
      }),
    );
    expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith({
      activityId,
      label: 'Image Reframe',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: reframedImageId,
      userId: user.id,
    });
    expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
      {
        brand: {
          description: ingredientData.brand.description,
          label: ingredientData.brand.label,
        },
        height: body.height,
        modelCategory: ModelCategory.IMAGE,
        prompt: promptData.original,
        references: [`https://api.example.com/ingredients/images/${imageId}`],
        style: body.style,
        tags: body.tags,
        width: body.width,
      },
      user.organizationId,
    );
    expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
      { prompt: 'provider prompt' },
    );
    expect(metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({ externalId: generationId, promptId }),
    );
    expect(
      failedGenerationService.handleFailedImageGeneration,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['square', undefined, undefined, 1080, 1080],
    ['portrait', undefined, undefined, 1080, 1920],
    ['landscape', undefined, undefined, 1920, 1080],
    ['square', 640, undefined, 1080, 1080],
  ])(
    'preserves %s dimension defaults from width %s and height %s',
    async (format, width, height, expectedWidth, expectedHeight) => {
      await service.reframeImage(request, imageId, user, {
        format,
        height,
        text: '',
        width,
      });

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          generationPrompt: `Reframe image to ${format} format`,
          height: expectedHeight,
          width: expectedWidth,
        }),
      );
      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        expect.objectContaining({
          height: expectedHeight,
          modelCategory: ModelCategory.IMAGE,
          width: expectedWidth,
        }),
        user.organizationId,
      );
    },
  );

  it('uses the canonical session id fallback and preserves the not-found response', async () => {
    const legacyUser = { ...user, userId: undefined } as unknown as User;
    imagesService.findOne.mockResolvedValue(null);

    await expect(
      service.reframeImage(request, imageId, legacyUser, body),
    ).rejects.toMatchObject({
      response: {
        detail: 'Parent image not found',
        title: 'Invalid parent ingredient',
      },
      status: HttpStatus.NOT_FOUND,
    });
    expect(imagesService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId: legacyUser.id }),
      [PopulatePatterns.metadataFull],
    );
    expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
  });

  it('marks a generation that fails to start and still returns the processing ingredient', async () => {
    replicateService.generateTextToImage.mockResolvedValue(null);

    await expect(
      service.reframeImage({} as Request, imageId, user, body),
    ).resolves.toBe(ingredientData);

    expect(metadataService.patch).not.toHaveBeenCalled();
    expect(
      failedGenerationService.handleFailedImageGeneration,
    ).toHaveBeenCalledWith(
      imagesService,
      reframedImageId,
      WebSocketPaths.image(reframedImageId),
      user,
      getUserRoomName(user.id),
    );
    expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
      expect.objectContaining({ modelCategory: ModelCategory.IMAGE_EDIT }),
      user.organizationId,
    );
  });

  it('logs provider errors, records the failed generation, and returns the processing ingredient', async () => {
    const error = new Error('provider failed');
    promptBuilderService.buildPrompt.mockRejectedValue(error);

    await expect(
      service.reframeImage(request, imageId, user, body),
    ).resolves.toBe(ingredientData);

    expect(loggerService.error).toHaveBeenCalledWith(
      'ReplicateService reframeImage failed',
      error,
    );
    expect(
      failedGenerationService.handleFailedImageGeneration,
    ).toHaveBeenCalledWith(
      imagesService,
      reframedImageId,
      WebSocketPaths.image(reframedImageId),
      user,
      getUserRoomName(user.id),
      'provider failed',
    );
    expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
  });
});
