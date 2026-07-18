import type { ImageGenerationContext } from '@api/collections/images/services/image-generation.types';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ImageGenerationProviderDispatchService', () => {
  const activitiesService = {
    create: vi.fn().mockResolvedValue({ id: 'activity-1' }),
  };
  const comfyUIService = {
    generateImage: vi.fn(),
  };
  const failedGenerationService = {
    handleFailedImageGeneration: vi.fn(),
  };
  const filesClientService = {
    uploadToS3: vi.fn(),
  };
  const falService = {
    generateImage: vi.fn(),
  };
  const imagesService = {
    patch: vi.fn(),
  };
  const klingAIService = {
    queueGenerateImage: vi.fn(),
  };
  const leonardoaiService = {
    generateImage: vi.fn(),
  };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;
  const metadataService = {
    patch: vi.fn(),
  };
  const promptBuilderService = {
    buildPrompt: vi.fn(),
  };
  const replicateService = {
    generateTextToImage: vi.fn(),
  };
  const sharedService = {
    saveDocuments: vi.fn(),
  };
  const websocketService = {
    publishBackgroundTaskUpdate: vi.fn(),
    publishVideoComplete: vi.fn(),
  };

  const service = new ImageGenerationProviderDispatchService(
    activitiesService as never,
    comfyUIService as never,
    failedGenerationService as never,
    filesClientService as never,
    falService as never,
    imagesService as never,
    klingAIService as never,
    leonardoaiService as never,
    loggerService,
    metadataService as never,
    promptBuilderService as never,
    replicateService as never,
    sharedService as never,
    websocketService as never,
  );

  const buildContext = (
    overrides: Partial<ImageGenerationContext> = {},
  ): ImageGenerationContext =>
    ({
      brand: { id: 'brand-1' },
      brandPromptBranding: {},
      createImageDto: {
        height: 1080,
        model: MODEL_KEYS.KLINGAI_V2,
        prompt: 'A cinematic sunrise',
        seed: 42,
        width: 1920,
      },
      height: 1080,
      ingredientData: { id: 'ingredient-1', parent: 'parent-1' },
      metadataData: { id: 'metadata-1' },
      model: MODEL_KEYS.KLINGAI_V2,
      outputs: 1,
      pendingIngredientIds: ['ingredient-1'],
      promptBuilderBrand: { label: 'Brand' },
      promptData: { id: 'prompt-1', original: 'A cinematic sunrise' },
      publicMetadata: {
        brand: 'brand-1',
        organization: 'organization-1',
        user: 'user-1',
      },
      referenceImageUrl: 'https://cdn.example.com/reference.png',
      referenceImageUrls: ['https://cdn.example.com/reference.png'],
      request: {},
      style: 'cinematic',
      user: { id: 'user-1' },
      waitForCompletion: false,
      websocketUrl: '/images/ingredient-1',
      width: 1920,
      ...overrides,
    }) as unknown as ImageGenerationContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes KlingAI with the existing request and metadata normalization', async () => {
    klingAIService.queueGenerateImage.mockResolvedValue('kling-job-1');
    const context = buildContext();

    const plan = await service.dispatch(context, 'klingai');
    await plan?.generationPromise;

    expect(klingAIService.queueGenerateImage).toHaveBeenCalledWith(
      'A cinematic sunrise',
      expect.objectContaining({
        height: 1080,
        model: MODEL_KEYS.KLINGAI_V2,
        reference: 'https://cdn.example.com/reference.png',
        style: 'cinematic',
        width: 1920,
      }),
    );
    expect(metadataService.patch).toHaveBeenCalledWith(
      'metadata-1',
      expect.objectContaining({
        externalId: 'kling-job-1',
        prompt: 'prompt-1',
      }),
    );
    expect(plan?.kind).toBe('poll-single');
  });

  it('uploads and completes GenfeedAI output inline', async () => {
    const imageBuffer = Buffer.from('image');
    comfyUIService.generateImage.mockResolvedValue({ imageBuffer });
    filesClientService.uploadToS3.mockResolvedValue({
      height: 1080,
      publicUrl: 'https://cdn.example.com/generated.png',
      s3Key: 'images/generated.png',
      size: imageBuffer.length,
      width: 1920,
    });
    const context = buildContext({
      model: MODEL_KEYS.GENFEED_AI_FLUX_DEV,
    });

    const plan = await service.dispatch(context, 'genfeedai');
    await plan?.generationPromise;

    expect(comfyUIService.generateImage).toHaveBeenCalledWith(
      MODEL_KEYS.GENFEED_AI_FLUX_DEV,
      {
        faceImage: 'https://cdn.example.com/reference.png',
        height: 1080,
        prompt: 'A cinematic sunrise',
        seed: 42,
        width: 1920,
      },
    );
    expect(imagesService.patch).toHaveBeenCalledWith(
      'ingredient-1',
      expect.objectContaining({
        cdnUrl: 'https://cdn.example.com/generated.png',
        s3Key: 'images/generated.png',
        status: IngredientStatus.GENERATED,
      }),
    );
    expect(websocketService.publishVideoComplete).toHaveBeenCalled();
    expect(plan?.kind).toBe('inline');
  });

  it('fans out Fal outputs and tracks each placeholder', async () => {
    falService.generateImage
      .mockResolvedValueOnce({ url: 'https://fal.example.com/primary.png' })
      .mockResolvedValueOnce({ url: 'https://fal.example.com/second.png' });
    sharedService.saveDocuments.mockResolvedValue({
      ingredientData: { id: 'ingredient-2', parent: 'parent-1' },
      metadataData: { id: 'metadata-2' },
    });
    const context = buildContext({
      model: MODEL_KEYS.FAL_NANO_BANANA_2,
      outputs: 2,
    });

    const plan = await service.dispatch(context, 'fal');
    await plan?.generationPromise;

    expect(falService.generateImage).toHaveBeenCalledTimes(2);
    expect(falService.generateImage).toHaveBeenCalledWith(
      MODEL_KEYS.FAL_NANO_BANANA_2,
      {
        image_size: { height: 1080, width: 1920 },
        image_url: 'https://cdn.example.com/reference.png',
        prompt: 'A cinematic sunrise',
        seed: 42,
      },
    );
    expect(context.pendingIngredientIds).toEqual([
      'ingredient-1',
      'ingredient-2',
    ]);
    expect(activitiesService.create).toHaveBeenCalledTimes(1);
    expect(plan?.kind).toBe('background-only');
  });

  it('normalizes batch Replicate outputs into indexed placeholders', async () => {
    const model = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_LITE;
    promptBuilderService.buildPrompt.mockResolvedValue({
      input: { prompt: 'provider prompt' },
    });
    replicateService.generateTextToImage.mockResolvedValue('replicate-job');
    sharedService.saveDocuments
      .mockResolvedValueOnce({
        ingredientData: { id: 'ingredient-2', parent: 'parent-1' },
        metadataData: { id: 'metadata-2' },
      })
      .mockResolvedValueOnce({
        ingredientData: { id: 'ingredient-3', parent: 'parent-1' },
        metadataData: { id: 'metadata-3' },
      });
    const context = buildContext({ model, outputs: 3 });

    const plan = await service.dispatch(context, 'replicate');
    await plan?.generationPromise;

    expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
      model,
      expect.objectContaining({ outputs: 3 }),
      'organization-1',
    );
    expect(replicateService.generateTextToImage).toHaveBeenCalledTimes(1);
    expect(metadataService.patch.mock.calls).toEqual(
      expect.arrayContaining([
        [
          'metadata-1',
          expect.objectContaining({ externalId: 'replicate-job_0' }),
        ],
        [
          'metadata-2',
          expect.objectContaining({ externalId: 'replicate-job_1' }),
        ],
        [
          'metadata-3',
          expect.objectContaining({ externalId: 'replicate-job_2' }),
        ],
      ]),
    );
    expect(plan?.pollIds).toEqual([
      'ingredient-1',
      'ingredient-2',
      'ingredient-3',
    ]);
  });
});
