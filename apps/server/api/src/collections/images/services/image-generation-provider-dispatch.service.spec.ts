import type { ImageGenerationContext } from '@api/collections/images/services/image-generation.types';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { FalImageGenerationProviderAdapter } from '@api/collections/images/services/providers/fal-image-generation-provider.adapter';
import { GenfeedAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/genfeedai-image-generation-provider.adapter';
import { HiggsFieldImageGenerationProviderAdapter } from '@api/collections/images/services/providers/higgsfield-image-generation-provider.adapter';
import { KlingAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/klingai-image-generation-provider.adapter';
import { LeonardoImageGenerationProviderAdapter } from '@api/collections/images/services/providers/leonardo-image-generation-provider.adapter';
import { ReplicateImageGenerationProviderAdapter } from '@api/collections/images/services/providers/replicate-image-generation-provider.adapter';
import { SdxlImageGenerationProviderAdapter } from '@api/collections/images/services/providers/sdxl-image-generation-provider.adapter';
import { IngredientStatus, ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
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
    uploadToS3: vi.fn().mockResolvedValue({
      height: 1080,
      publicUrl: 'https://cdn.example.com/generated.png',
      s3Key: 'images/generated.png',
      size: 1024,
      width: 1920,
    }),
  };
  const falService = {
    generateImage: vi.fn(),
  };
  const imagesService = {
    findOne: vi.fn().mockResolvedValue({ status: IngredientStatus.PROCESSING }),
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
    cancelPrediction: vi.fn().mockResolvedValue(undefined),
    generateTextToImage: vi.fn(),
    getPrediction: vi.fn().mockResolvedValue({
      output: ['https://replicate.example.com/generated.png'],
      status: 'succeeded',
    }),
  };
  const sharedService = {
    createMediaDocuments: vi.fn(),
  };
  const higgsFieldService = {
    generateTextToImage: vi.fn(),
    waitForImageCompletion: vi.fn(),
  };
  const websocketService = {
    publishBackgroundTaskUpdate: vi.fn(),
    publishVideoComplete: vi.fn(),
  };

  const providerRegistry = new ImageGenerationProviderRegistryService(
    new GenfeedAiImageGenerationProviderAdapter(comfyUIService as never),
    new KlingAiImageGenerationProviderAdapter(klingAIService as never),
    new FalImageGenerationProviderAdapter(falService as never),
    new LeonardoImageGenerationProviderAdapter(leonardoaiService as never),
    new ReplicateImageGenerationProviderAdapter(
      promptBuilderService as never,
      replicateService as never,
    ),
    new SdxlImageGenerationProviderAdapter(),
    new HiggsFieldImageGenerationProviderAdapter(higgsFieldService as never),
  );
  const generationEventWebhookService = {
    emitGenerationCompleted: vi.fn().mockResolvedValue(undefined),
    emitGenerationFailed: vi.fn().mockResolvedValue(undefined),
  };
  const mediaGenerationCostService = {
    recordGenerationCost: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ImageGenerationProviderDispatchService(
    activitiesService as never,
    failedGenerationService as never,
    filesClientService as never,
    generationEventWebhookService as never,
    mediaGenerationCostService as never,
    imagesService as never,
    loggerService,
    metadataService as never,
    providerRegistry,
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
      brandId: 'brand-1',
      organizationId: 'organization-1',
      userId: 'user-1',
      referenceImageUrl: 'https://cdn.example.com/reference.png',
      referenceImageUrls: ['https://cdn.example.com/reference.png'],
      request: {},
      style: 'cinematic',
      user: {
        brandId: 'brand-1',
        id: 'auth-provider-user',
        organizationId: 'organization-1',
        userId: 'user-1',
      },
      waitForCompletion: false,
      websocketUrl: '/images/ingredient-1',
      width: 1920,
      abortSignal: new AbortController().signal,
      ...overrides,
    }) as unknown as ImageGenerationContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes KlingAI with the existing request and metadata normalization', async () => {
    klingAIService.queueGenerateImage.mockImplementation(async () => {
      expect(metadataService.patch).toHaveBeenCalledWith(
        'metadata-1',
        expect.objectContaining({ externalProvider: 'klingai' }),
      );
      return 'kling-job-1';
    });
    const context = buildContext();

    const plan = await service.dispatch(context);
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
        promptId: 'prompt-1',
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

    const plan = await service.dispatch(context);
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
    expect(
      generationEventWebhookService.emitGenerationCompleted,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      generationId: 'ingredient-1',
      kind: 'image',
      model: MODEL_KEYS.GENFEED_AI_FLUX_DEV,
      organizationId: 'organization-1',
      output: {
        mimeType: 'image/png',
        storageKey: 'images/generated.png',
        url: 'https://cdn.example.com/generated.png',
      },
    });
    expect(
      mediaGenerationCostService.recordGenerationCost,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      category: 'image',
      height: 1080,
      ingredientId: 'ingredient-1',
      modelKey: MODEL_KEYS.GENFEED_AI_FLUX_DEV,
      organizationId: 'organization-1',
      width: 1920,
    });
    expect(plan?.kind).toBe('inline');
  });

  it('records realized provider dimensions instead of requested dimensions', async () => {
    promptBuilderService.buildPrompt.mockResolvedValue({
      input: { prompt: 'provider prompt' },
    });
    replicateService.generateTextToImage.mockResolvedValue('replicate-job');
    filesClientService.uploadToS3.mockResolvedValueOnce({
      height: 720,
      publicUrl: 'https://cdn.example.com/provider-adjusted.png',
      s3Key: 'images/provider-adjusted.png',
      size: 1024,
      width: 1280,
    });
    const context = buildContext({
      height: 1080,
      model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      width: 1920,
    });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(
      mediaGenerationCostService.recordGenerationCost,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        height: 720,
        ingredientId: 'ingredient-1',
        width: 1280,
      }),
    );
  });

  it('records unknown dimensions when upload metadata omits them', async () => {
    const imageBuffer = Buffer.from('image');
    comfyUIService.generateImage.mockResolvedValueOnce({ imageBuffer });
    filesClientService.uploadToS3.mockResolvedValueOnce({
      publicUrl: 'https://cdn.example.com/generated.png',
      s3Key: 'images/generated.png',
      size: imageBuffer.length,
    });
    const context = buildContext({
      height: 1080,
      model: MODEL_KEYS.GENFEED_AI_FLUX_DEV,
      width: 1920,
    });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(
      mediaGenerationCostService.recordGenerationCost,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        height: null,
        ingredientId: 'ingredient-1',
        width: null,
      }),
    );
  });

  it('emits a generation failure webhook when the provider throws', async () => {
    comfyUIService.generateImage.mockRejectedValueOnce(
      new Error('ComfyUI unreachable'),
    );
    const context = buildContext({ model: MODEL_KEYS.GENFEED_AI_FLUX_DEV });

    const plan = await service.dispatch(context);
    await expect(plan?.generationPromise).rejects.toThrow(
      'ComfyUI unreachable',
    );

    expect(
      failedGenerationService.handleFailedImageGeneration,
    ).toHaveBeenCalled();
    expect(
      generationEventWebhookService.emitGenerationFailed,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      errorMessage: 'ComfyUI unreachable',
      generationId: 'ingredient-1',
      kind: 'image',
      model: MODEL_KEYS.GENFEED_AI_FLUX_DEV,
      organizationId: 'organization-1',
    });
  });

  it('fans out Fal outputs and tracks each placeholder', async () => {
    falService.generateImage
      .mockResolvedValueOnce({ url: 'https://fal.example.com/primary.png' })
      .mockResolvedValueOnce({ url: 'https://fal.example.com/second.png' });
    sharedService.createMediaDocuments.mockResolvedValue({
      ingredientData: { id: 'ingredient-2', parent: 'parent-1' },
      metadataData: { id: 'metadata-2' },
    });
    const context = buildContext({
      model: MODEL_KEYS.FAL_NANO_BANANA_2,
      outputs: 2,
    });

    const plan = await service.dispatch(context);
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

  it('routes a non-prefix Fal partner endpoint by provider identity', async () => {
    falService.generateImage.mockResolvedValueOnce({
      url: 'https://fal.example.com/partner.png',
    });
    const context = buildContext({
      model: 'fal/google/nano-banana-2-lite',
      modelEndpoint: 'google/nano-banana-2-lite',
      modelProvider: ModelProvider.FAL,
    });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(falService.generateImage).toHaveBeenCalledWith(
      'google/nano-banana-2-lite',
      expect.objectContaining({ prompt: 'A cinematic sunrise' }),
    );
    expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
  });

  it('keeps a colliding endpoint on Replicate when its provider is Replicate', async () => {
    promptBuilderService.buildPrompt.mockResolvedValue({
      input: { prompt: 'provider prompt' },
    });
    replicateService.generateTextToImage.mockResolvedValue('replicate-job');
    const context = buildContext({
      model: 'google/nano-banana-2-lite',
      modelEndpoint: 'google/nano-banana-2-lite',
      modelProvider: ModelProvider.REPLICATE,
    });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
      'google/nano-banana-2-lite',
      expect.any(Object),
    );
    expect(falService.generateImage).not.toHaveBeenCalled();
  });

  it('routes Leonardo with its existing request and polling result', async () => {
    leonardoaiService.generateImage.mockResolvedValue('leonardo-job');
    const context = buildContext({ model: MODEL_KEYS.LEONARDOAI });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(leonardoaiService.generateImage).toHaveBeenCalledWith(
      'A cinematic sunrise',
      expect.objectContaining({
        height: 1080,
        style: 'cinematic',
        width: 1920,
      }),
    );
    expect(metadataService.patch).toHaveBeenCalledWith(
      'metadata-1',
      expect.objectContaining({ externalId: 'leonardo-job' }),
    );
    expect(plan?.kind).toBe('poll-single');
  });

  it('keeps the existing SDXL no-external-generation behavior typed', async () => {
    const context = buildContext({ model: MODEL_KEYS.SDXL });

    await expect(service.dispatch(context)).resolves.toBeNull();

    expect(comfyUIService.generateImage).not.toHaveBeenCalled();
    expect(falService.generateImage).not.toHaveBeenCalled();
    expect(klingAIService.queueGenerateImage).not.toHaveBeenCalled();
    expect(leonardoaiService.generateImage).not.toHaveBeenCalled();
    expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
  });

  it('routes Higgsfield Soul with the resolved outputUrls, finalizing like any external-id provider', async () => {
    higgsFieldService.generateTextToImage.mockResolvedValue({
      requestId: 'higgsfield-req-1',
    });
    higgsFieldService.waitForImageCompletion.mockResolvedValue({
      imageUrl: 'https://higgsfield.example.com/generated.png',
    });
    const context = buildContext({ model: MODEL_KEYS.HIGGSFIELD_SOUL });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(higgsFieldService.generateTextToImage).toHaveBeenCalledWith({
      aspectRatio: '16:9',
      organizationId: 'organization-1',
      prompt: 'A cinematic sunrise',
    });
    expect(higgsFieldService.waitForImageCompletion).toHaveBeenCalledWith(
      'higgsfield-req-1',
      { organizationId: 'organization-1' },
    );
    expect(imagesService.patch).toHaveBeenCalledWith(
      'ingredient-1',
      expect.objectContaining({
        cdnUrl: 'https://cdn.example.com/generated.png',
        s3Key: 'images/generated.png',
        status: IngredientStatus.GENERATED,
      }),
    );
    expect(plan?.kind).toBe('poll-single');
  });

  it('normalizes batch Replicate outputs into indexed placeholders', async () => {
    const model = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_LITE;
    promptBuilderService.buildPrompt.mockResolvedValue({
      input: { prompt: 'provider prompt' },
    });
    replicateService.generateTextToImage.mockResolvedValue('replicate-job');
    replicateService.getPrediction.mockResolvedValue({
      output: [
        'https://replicate.example.com/generated-1.png',
        'https://replicate.example.com/generated-2.png',
        'https://replicate.example.com/generated-3.png',
      ],
      status: 'succeeded',
    });
    sharedService.createMediaDocuments
      .mockResolvedValueOnce({
        ingredientData: { id: 'ingredient-2', parent: 'parent-1' },
        metadataData: { id: 'metadata-2' },
      })
      .mockResolvedValueOnce({
        ingredientData: { id: 'ingredient-3', parent: 'parent-1' },
        metadataData: { id: 'metadata-3' },
      });
    const context = buildContext({ model, outputs: 3 });

    const plan = await service.dispatch(context);
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
    expect(filesClientService.uploadToS3).toHaveBeenCalledTimes(3);
    expect(imagesService.patch).toHaveBeenCalledWith(
      'ingredient-1',
      expect.objectContaining({ status: IngredientStatus.GENERATED }),
    );
  });

  it('persists the Replicate job id before local polling so Stop can cancel it', async () => {
    const model = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
    promptBuilderService.buildPrompt.mockResolvedValue({
      input: { prompt: 'provider prompt' },
    });
    replicateService.generateTextToImage.mockResolvedValue('replicate-job');
    replicateService.getPrediction.mockImplementation(async () => {
      expect(metadataService.patch).toHaveBeenCalledWith(
        'metadata-1',
        expect.objectContaining({
          externalId: 'replicate-job',
          externalProvider: 'replicate',
        }),
      );
      return {
        output: ['https://replicate.example.com/generated.png'],
        status: 'succeeded',
      };
    });
    const context = buildContext({ model });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(replicateService.generateTextToImage).toHaveBeenCalledTimes(1);
  });

  it('dispatches FLUX Schnell from the compiled brief instead of rebuilding prompt context', async () => {
    const compiledDispatch = {
      aspect_ratio: '16:9',
      disable_safety_checker: false,
      go_fast: true,
      num_inference_steps: 4,
      num_outputs: 1,
      output_format: 'jpg',
      output_quality: 80,
      prompt: 'a sunset over the ocean',
    };
    replicateService.generateTextToImage.mockResolvedValue('replicate-job');
    const context = buildContext({
      compiledDispatch,
      model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(promptBuilderService.buildPrompt).not.toHaveBeenCalled();
    expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
      compiledDispatch,
    );
  });

  it('skips finalize when the ingredient is no longer processing', async () => {
    const model = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
    promptBuilderService.buildPrompt.mockResolvedValue({
      input: { prompt: 'provider prompt' },
    });
    replicateService.generateTextToImage.mockResolvedValue('replicate-job');
    imagesService.findOne.mockResolvedValue({
      status: IngredientStatus.FAILED,
    });
    const context = buildContext({ model });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(filesClientService.uploadToS3).not.toHaveBeenCalled();
  });
});
