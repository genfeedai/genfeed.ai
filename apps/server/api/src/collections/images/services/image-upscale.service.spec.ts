import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';
import { ImageUpscaleService } from '@api/collections/images/services/image-upscale.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ImageFormat,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  TransformationCategory,
  UpscaleFactor,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

describe('ImageUpscaleService', () => {
  const imageId = testId('image');
  const upscaledImageId = testId('upscaled');
  const metadataId = testId('metadata');
  const activityId = testId('activity');
  const generationId = 'replicate-generation-id';
  const callerModel = 'caller-selected-upscale-model';
  const routedModel = 'router-default-upscale-model';
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
    id: upscaledImageId,
    status: IngredientStatus.PROCESSING,
  };
  const request = {
    selectedModel: { category: ModelCategory.IMAGE },
  } as unknown as Request;
  const body: ImageEditDto = {
    enhanceModel: 'Standard V2',
    faceEnhancement: false,
    faceEnhancementCreativity: 0.25,
    faceEnhancementStrength: 0.6,
    model: callerModel,
    outputFormat: ImageFormat.PNG,
    subjectDetection: 'All',
    upscaleFactor: UpscaleFactor._2X,
  };

  let service: ImageUpscaleService;
  let activitiesService: { create: ReturnType<typeof vi.fn> };
  let failedGenerationService: {
    handleFailedImageGeneration: ReturnType<typeof vi.fn>;
  };
  let imagesService: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let promptBuilderService: { buildPrompt: ReturnType<typeof vi.fn> };
  let replicateService: { runModel: ReturnType<typeof vi.fn> };
  let routerService: { getDefaultModel: ReturnType<typeof vi.fn> };
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
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };
    metadataService = { patch: vi.fn() };
    promptBuilderService = {
      buildPrompt: vi.fn().mockResolvedValue({
        input: { prompt: 'provider input' },
      }),
    };
    replicateService = {
      runModel: vi.fn().mockResolvedValue(generationId),
    };
    routerService = {
      getDefaultModel: vi.fn().mockResolvedValue(routedModel),
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

    service = new ImageUpscaleService(
      activitiesService as unknown as ActivitiesService,
      {
        ingredientsEndpoint: 'https://api.example.com/ingredients',
      } as ConfigService,
      failedGenerationService as unknown as FailedGenerationService,
      imagesService as unknown as ImagesService,
      loggerService as unknown as LoggerService,
      metadataService as unknown as MetadataService,
      promptBuilderService as unknown as PromptBuilderService,
      replicateService as unknown as ReplicateService,
      routerService as unknown as RouterService,
      sharedService as unknown as SharedService,
      websocketService as unknown as NotificationsPublisherService,
    );
  });

  it('preserves caller-model upscale orchestration and returns the processing ingredient', async () => {
    await expect(
      service.upscaleImage(request, imageId, user, body),
    ).resolves.toBe(ingredientData);

    expect(loggerService.log).toHaveBeenCalledWith(
      'ImagesTransformationsController upscaleImage',
      { body, params: { imageId } },
    );
    expect(imagesService.findOne).toHaveBeenCalledWith(
      {
        OR: [{ userId: user.userId }, { organizationId: user.organizationId }],
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
        id: imageId,
      },
      [PopulatePatterns.metadataFull],
    );
    expect(routerService.getDefaultModel).not.toHaveBeenCalled();
    expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(user, {
      brandId: parent.brandId,
      category: CategoryPrismaUtil.toIngredientCategory(
        IngredientCategory.IMAGE,
      ),
      extension: body.outputFormat,
      model: callerModel,
      organizationId: parent.organizationId,
      parentId: parent.id,
      status: IngredientStatus.PROCESSING,
      transformations: [TransformationCategory.UPSCALED],
    });
    expect(activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: parent.brandId,
        entityId: upscaledImageId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_UPSCALE_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.IMAGE_UPSCALE,
        userId: user.userId,
        value: JSON.stringify({
          ingredientId: upscaledImageId,
          model: callerModel,
          sourceId: imageId,
          type: 'transformation',
        }),
      }),
    );
    expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith({
      activityId,
      label: 'Image Upscale',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: upscaledImageId,
      userId: user.id,
    });
    expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      {
        enhance_model: body.enhanceModel,
        face_enhancement: false,
        face_enhancement_creativity: body.faceEnhancementCreativity,
        face_enhancement_strength: body.faceEnhancementStrength,
        modelCategory: ModelCategory.IMAGE,
        output_format: body.outputFormat,
        prompt: '',
        references: [`https://api.example.com/ingredients/images/${imageId}`],
        subject_detection: body.subjectDetection,
        upscale_factor: body.upscaleFactor,
      },
      user.organizationId,
    );
    expect(replicateService.runModel).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      { prompt: 'provider input' },
    );
    expect(metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({ externalId: generationId }),
    );
    expect(
      failedGenerationService.handleFailedImageGeneration,
    ).not.toHaveBeenCalled();
  });

  it('uses the router model and preserves legacy truthiness defaults', async () => {
    const defaultedBody = {
      enhanceModel: '',
      faceEnhancementCreativity: 0,
      faceEnhancementStrength: 0,
      subjectDetection: '',
    } as unknown as ImageEditDto;

    await expect(
      service.upscaleImage({} as Request, imageId, user, defaultedBody),
    ).resolves.toBe(ingredientData);

    expect(routerService.getDefaultModel).toHaveBeenCalledWith(
      ModelCategory.IMAGE_UPSCALE,
    );
    expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        extension: MetadataExtension.JPG,
        model: routedModel,
      }),
    );
    expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      {
        enhance_model: 'Low Resolution V2',
        face_enhancement: true,
        face_enhancement_creativity: 0.5,
        face_enhancement_strength: 0.8,
        modelCategory: ModelCategory.IMAGE_UPSCALE,
        output_format: 'jpg',
        prompt: '',
        references: [`https://api.example.com/ingredients/images/${imageId}`],
        subject_detection: 'Foreground',
        upscale_factor: '4x',
      },
      user.organizationId,
    );
  });

  it('uses the canonical session id fallback and preserves the exact 400 response', async () => {
    const legacyUser = { ...user, userId: undefined } as unknown as User;
    imagesService.findOne.mockResolvedValue(null);

    await expect(
      service.upscaleImage(request, imageId, legacyUser, body),
    ).rejects.toMatchObject({
      response: {
        detail: 'Parent image is required',
        title: 'Invalid parent ingredient',
      },
      status: HttpStatus.BAD_REQUEST,
    });
    expect(imagesService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        OR: [
          { userId: legacyUser.id },
          { organizationId: legacyUser.organizationId },
        ],
      }),
      [PopulatePatterns.metadataFull],
    );
    expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
  });

  it('marks a generation that fails to start and still returns the processing ingredient', async () => {
    replicateService.runModel.mockResolvedValue(null);

    await expect(
      service.upscaleImage(request, imageId, user, body),
    ).resolves.toBe(ingredientData);

    expect(metadataService.patch).not.toHaveBeenCalled();
    expect(
      failedGenerationService.handleFailedImageGeneration,
    ).toHaveBeenCalledWith(
      imagesService,
      upscaledImageId,
      `/images/${upscaledImageId}`,
      user,
      getUserRoomName(user.id),
    );
  });

  it('logs provider errors, records the failed generation, and returns the processing ingredient', async () => {
    const error = new Error('provider failed');
    promptBuilderService.buildPrompt.mockRejectedValue(error);

    await expect(
      service.upscaleImage(request, imageId, user, body),
    ).resolves.toBe(ingredientData);

    expect(loggerService.error).toHaveBeenCalledWith(
      'ImagesTransformationsController upscaleImage failed',
      error,
    );
    expect(
      failedGenerationService.handleFailedImageGeneration,
    ).toHaveBeenCalledWith(
      imagesService,
      upscaledImageId,
      `/images/${upscaledImageId}`,
      user,
      getUserRoomName(user.id),
      'provider failed',
    );
    expect(replicateService.runModel).not.toHaveBeenCalled();
  });
});
