import type { ImageGenerationContext } from '@api/collections/images/services/image-generation.types';
import { completeImageGeneration } from '@api/collections/images/services/image-generation-completion.util';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { FalImageGenerationProviderAdapter } from '@api/collections/images/services/providers/fal-image-generation-provider.adapter';
import { GenfeedAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/genfeedai-image-generation-provider.adapter';
import { HiggsFieldImageGenerationProviderAdapter } from '@api/collections/images/services/providers/higgsfield-image-generation-provider.adapter';
import { KlingAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/klingai-image-generation-provider.adapter';
import { LeonardoImageGenerationProviderAdapter } from '@api/collections/images/services/providers/leonardo-image-generation-provider.adapter';
import { ReplicateImageGenerationProviderAdapter } from '@api/collections/images/services/providers/replicate-image-generation-provider.adapter';
import { SdxlImageGenerationProviderAdapter } from '@api/collections/images/services/providers/sdxl-image-generation-provider.adapter';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { ReplicateProviderError } from '@api/services/integrations/replicate/errors/replicate-provider.error';
import {
  AgentFailureReason,
  IngredientStatus,
  ModelProvider,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ImageGenerationProviderDispatchService', () => {
  const activitiesService = {
    record: vi.fn().mockResolvedValue({ id: 'activity-1' }),
  };
  const comfyUIService = {
    generateImage: vi.fn(),
  };
  const failedGenerationService = {
    notifyFailedImageGeneration: vi.fn(),
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
    patchAll: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
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
    new ReplicateImageGenerationProviderAdapter(replicateService as never),
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
  const generationBilling = {
    bindOutput: vi.fn().mockResolvedValue(undefined),
    deferPoolRelease: vi.fn(),
    hasPool: vi.fn().mockReturnValue(false),
    releaseOutput: vi.fn().mockResolvedValue('no-hold'),
    releasePool: vi.fn().mockResolvedValue(undefined),
    rememberAcceptedOutput: vi.fn().mockResolvedValue(undefined),
    settleOutput: vi.fn().mockResolvedValue('no-hold'),
  };
  const service = new ImageGenerationProviderDispatchService(
    activitiesService as never,
    failedGenerationService as never,
    filesClientService as never,
    generationBilling as never,
    generationEventWebhookService as never,
    mediaGenerationCostService as never,
    imagesService as never,
    loggerService,
    metadataService as never,
    providerRegistry,
    sharedService as never,
    websocketService as never,
  );

  it('delegates frozen Crun generation through the existing registry with the original arguments', async () => {
    const result = { data: { id: 'crun-output' } };
    const delegate = vi
      .spyOn(providerRegistry, 'generateCrunQuoted')
      .mockResolvedValueOnce(result as never);
    const user = { userId: 'user', organizationId: 'org' };
    const dto = { model: 'crun/google/nano-banana-pro' };
    const request = { user };
    try {
      await expect(
        service.generateCrunQuoted(
          user as never,
          dto as never,
          request as never,
          false,
        ),
      ).resolves.toBe(result);
      expect(delegate).toHaveBeenCalledWith(user, dto, request, false);
    } finally {
      delegate.mockRestore();
    }
  });
  it('preserves Crun rejection status for missing adapter and unsupported context', () => {
    const user = { userId: 'user', organizationId: 'org' };
    const dto = { model: 'crun/google/nano-banana-pro' };
    const request = {};
    for (const [unsupported, status, code] of [
      [false, 503, 'CRUN_MODEL_UNAVAILABLE'],
      [true, 400, 'CRUN_INVALID_INPUT'],
    ] as const) {
      try {
        service.generateCrunQuoted(
          user as never,
          dto as never,
          request as never,
          unsupported,
        );
        throw new Error('Expected rejection');
      } catch (error: unknown) {
        expect(error).toHaveProperty('status', status);
        expect(error).toHaveProperty('response', { code });
      }
    }
  });
  it('continues settlement failure through ordered cost recording and the completion event', async () => {
    const effects: string[] = [];
    const error = new Error('settlement unavailable');
    generationBilling.settleOutput.mockImplementationOnce(async () => {
      effects.push('settle');
      throw error;
    });
    mediaGenerationCostService.recordGenerationCost.mockImplementationOnce(
      async () => {
        effects.push('cost');
      },
    );
    generationEventWebhookService.emitGenerationCompleted.mockImplementationOnce(
      async () => {
        effects.push('event');
      },
    );
    const context = buildContext();
    const output = {
      storageKey: 'owned/image.png',
      url: 'https://cdn.test/image.png',
      mimeType: 'image/png',
    };
    await completeImageGeneration(
      {
        generationBilling: generationBilling as never,
        loggerService,
        mediaGenerationCostService: mediaGenerationCostService as never,
        generationEventWebhookService: generationEventWebhookService as never,
      },
      context,
      'ingredient-1',
      output,
      { width: 1280, height: 720 },
    );
    expect(effects).toEqual(['settle', 'cost', 'event']);
    expect(loggerService.error).toHaveBeenCalledWith(
      'Image credit settlement failed',
      error,
      { ingredientId: 'ingredient-1' },
    );
    expect(
      generationEventWebhookService.emitGenerationCompleted,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: 'ingredient-1', output }),
    );
  });
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
      providerInput: { prompt: 'provider prompt' },
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
    expect(imagesService.patchAll).toHaveBeenCalledWith(
      {
        id: 'ingredient-1',
        organizationId: 'organization-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      },
      expect.objectContaining({
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

  it.each([
    MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO_LORA,
    MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID_LORA,
  ])(
    'passes the requested LoRA through the %s provider dispatch',
    async (model) => {
      comfyUIService.generateImage.mockResolvedValue({
        imageBuffer: Buffer.from('image'),
      });
      const context = buildContext({
        model,
        createImageDto: {
          text: 'A product portrait',
          model,
          loraPath: 'styles/product.safetensors',
        },
      });
      const plan = await service.dispatch(context);
      await plan?.generationPromise;
      expect(comfyUIService.generateImage).toHaveBeenCalledWith(
        model,
        expect.objectContaining({ loraPath: 'styles/product.safetensors' }),
      );
      expect(plan?.kind).toBe('inline');
    },
  );

  it('records realized provider dimensions instead of requested dimensions', async () => {
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
      failedGenerationService.notifyFailedImageGeneration,
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

  it('preserves completion when failure loses the terminal claim', async () => {
    const failure = new Error('provider rejected');
    comfyUIService.generateImage.mockRejectedValueOnce(failure);
    imagesService.patchAll.mockResolvedValueOnce({ modifiedCount: 0 });
    const plan = await service.dispatch(
      buildContext({ model: MODEL_KEYS.GENFEED_AI_FLUX_DEV }),
    );
    await expect(plan?.generationPromise).rejects.toBe(failure);
    expect(imagesService.patchAll).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'organization-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      }),
      expect.objectContaining({ status: IngredientStatus.FAILED }),
    );
    expect(generationBilling.releaseOutput).not.toHaveBeenCalled();
    expect(
      failedGenerationService.notifyFailedImageGeneration,
    ).not.toHaveBeenCalled();
    expect(
      generationEventWebhookService.emitGenerationFailed,
    ).not.toHaveBeenCalled();
  });

  it('does not publish completion when expiry wins the terminal claim', async () => {
    comfyUIService.generateImage.mockResolvedValueOnce({
      imageBuffer: Buffer.from('image'),
    });
    imagesService.patchAll.mockResolvedValueOnce({ modifiedCount: 0 });
    const plan = await service.dispatch(
      buildContext({ model: MODEL_KEYS.GENFEED_AI_FLUX_DEV }),
    );
    await plan?.generationPromise;
    expect(websocketService.publishVideoComplete).not.toHaveBeenCalled();
    expect(generationBilling.settleOutput).not.toHaveBeenCalled();
    expect(
      generationEventWebhookService.emitGenerationCompleted,
    ).not.toHaveBeenCalled();
  });

  it('recovers a provider ID after metadata failure and keeps its hold', async () => {
    klingAIService.queueGenerateImage.mockResolvedValueOnce('accepted-image');
    metadataService.patch.mockImplementation(async (_id, metadata) => {
      if (metadata.externalId) throw new Error('metadata unavailable');
    });
    const plan = await service.dispatch(buildContext());
    await plan?.generationPromise;
    expect(generationBilling.rememberAcceptedOutput).toHaveBeenCalledWith({
      ingredientId: 'ingredient-1',
      externalId: 'accepted-image',
      organizationId: 'organization-1',
      userId: 'user-1',
    });
    expect(generationBilling.releaseOutput).not.toHaveBeenCalled();
    expect(
      failedGenerationService.notifyFailedImageGeneration,
    ).not.toHaveBeenCalled();
    metadataService.patch.mockReset();
  });

  it.each(['network-outage', 'confirmed-failure'])(
    'uses the second output identity for early acceptance and handles %s after polling',
    async (outcome) => {
      replicateService.generateTextToImage
        .mockReset()
        .mockResolvedValueOnce('first-job')
        .mockResolvedValueOnce('second-job');
      replicateService.getPrediction.mockReset().mockResolvedValueOnce({
        status: 'succeeded',
        output: ['https://provider.example/first.png'],
      });
      if (outcome === 'network-outage')
        replicateService.getPrediction.mockRejectedValueOnce(
          new Error('poll network outage'),
        );
      else
        replicateService.getPrediction.mockResolvedValueOnce({
          status: 'failed',
          error: 'provider confirmed failure',
        });
      sharedService.createMediaDocuments.mockResolvedValueOnce({
        ingredientData: { id: 'ingredient-2' },
        metadataData: { id: 'metadata-2' },
      });
      const identities = new Map<string, string>();
      metadataService.patch.mockImplementation(async (id, metadata) => {
        if (metadata.externalId) identities.set(id, metadata.externalId);
      });
      const context = buildContext({
        model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        outputs: 2,
        request: {
          creditsConfig: {
            amount: 6,
            isByokBypass: true,
            byokApiKeyOverride: 'org-key',
          },
        } as never,
      });
      const plan = await service.dispatch(context);
      await expect(plan?.generationPromise).rejects.toThrow(
        outcome === 'network-outage'
          ? 'poll network outage'
          : 'provider confirmed failure',
      );
      expect(identities.get('metadata-1')).toBe('first-job');
      expect(identities.get('metadata-2')).toBe('second-job');
      expect(
        generationBilling.bindOutput.mock.calls.map(
          ([, output]) => output.ingredientId,
        ),
      ).toEqual(['ingredient-1', 'ingredient-2']);
      if (outcome === 'network-outage') {
        expect(generationBilling.releaseOutput).not.toHaveBeenCalled();
        expect(
          failedGenerationService.notifyFailedImageGeneration,
        ).not.toHaveBeenCalled();
      } else {
        expect(generationBilling.releaseOutput).toHaveBeenCalledExactlyOnceWith(
          'ingredient-2',
          'organization-1',
        );
        expect(imagesService.patchAll).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'ingredient-2',
            status: IngredientStatus.PROCESSING,
            organizationId: 'organization-1',
            isDeleted: false,
          }),
          expect.objectContaining({ status: IngredientStatus.FAILED }),
        );
      }
      metadataService.patch.mockReset();
      replicateService.getPrediction.mockReset().mockResolvedValue({
        status: 'succeeded',
        output: ['https://provider.example/generated.png'],
      });
    },
  );

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
      undefined,
      expect.any(Function),
    );
    expect(context.pendingIngredientIds).toEqual([
      'ingredient-1',
      'ingredient-2',
    ]);
    expect(activitiesService.record).toHaveBeenCalledTimes(1);
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
      undefined,
      expect.any(Function),
    );
    expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
  });

  it('keeps a colliding endpoint on Replicate when its provider is Replicate', async () => {
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
      undefined,
      expect.any(Function),
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
      imageUrls: ['https://higgsfield.example.com/generated.png'],
    });
    const context = buildContext({ model: MODEL_KEYS.HIGGSFIELD_SOUL });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    // Soul 2 has no documented image_reference field. Output count still has
    // to reach the adapter so a batch request is not silently collapsed to 1.
    expect(higgsFieldService.generateTextToImage).toHaveBeenCalledWith({
      aspectRatio: '16:9',
      batchSize: 1,
      onProviderSubmissionStarted: expect.any(Function),
      organizationId: 'organization-1',
      prompt: 'A cinematic sunrise',
    });
    expect(higgsFieldService.waitForImageCompletion).toHaveBeenCalledWith(
      'higgsfield-req-1',
      { organizationId: 'organization-1' },
    );
    expect(imagesService.patchAll).toHaveBeenCalledWith(
      {
        id: 'ingredient-1',
        organizationId: 'organization-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      },
      expect.objectContaining({
        s3Key: 'images/generated.png',
        status: IngredientStatus.GENERATED,
      }),
    );
    expect(plan?.kind).toBe('poll-single');
  });

  it('normalizes batch Replicate outputs into indexed placeholders', async () => {
    const model = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_LITE;
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

    expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
      model,
      context.providerInput,
      undefined,
      expect.any(Function),
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
    expect(imagesService.patchAll).toHaveBeenCalledWith(
      {
        id: 'ingredient-1',
        organizationId: 'organization-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      },
      expect.objectContaining({ status: IngredientStatus.GENERATED }),
    );
  });

  it('reads live admitted edit documents in delayed submission and output callbacks', async () => {
    const model = MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5;
    replicateService.generateTextToImage.mockImplementation(
      async (
        _model: string,
        _input: unknown,
        _apiKey: unknown,
        onSubmission?: () => void,
      ) => {
        expect(
          generationBilling.bindOutput.mock.calls.map(
            (call) => call[1].ingredientId,
          ),
        ).toEqual(['ingredient-1', 'ingredient-2', 'ingredient-3']);
        onSubmission?.();
        return 'replicate-job';
      },
    );
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
    const context = buildContext({
      model,
      outputs: 3,
      editing: {
        sourceIds: ['source'],
        sourceUrls: ['https://cdn.example.com/source.png'],
        size: 'source',
        width: 1920,
        height: 1080,
        recipe: {
          operation: 'image-edit',
          contractVersion: 'ideogram-4-5-edit-2026-10-01',
          model,
          sourceIds: ['source'],
          size: 'source',
          quality: 'medium',
          outputs: 3,
        },
      },
    });

    Object.assign(context.request, { creditsConfig: { amount: 60 } });
    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
      model,
      context.providerInput,
      undefined,
      expect.any(Function),
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
    expect(metadataService.patch).toHaveBeenCalledWith('metadata-1', {
      result: JSON.stringify([
        'https://replicate.example.com/generated-1.png',
        'https://replicate.example.com/generated-2.png',
        'https://replicate.example.com/generated-3.png',
      ]),
    });
    expect(generationBilling.releasePool).toHaveBeenCalledOnce();
    expect(plan?.pollIds).toEqual([
      'ingredient-1',
      'ingredient-2',
      'ingredient-3',
    ]);
    expect(filesClientService.uploadToS3).toHaveBeenCalledTimes(3);
    expect(imagesService.patchAll).toHaveBeenCalledWith(
      {
        id: 'ingredient-1',
        organizationId: 'organization-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      },
      expect.objectContaining({ status: IngredientStatus.GENERATED }),
    );
  });

  it('persists the Replicate job id before local polling so Stop can cancel it', async () => {
    const model = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
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

    expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
      compiledDispatch,
      undefined,
      expect.any(Function),
    );
  });

  it('forwards the resolved BYOK apiKeyOverride from creditsConfig into the Replicate dispatch call (#5294)', async () => {
    const model = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
    replicateService.generateTextToImage.mockResolvedValue(
      'replicate-byok-job',
    );
    replicateService.getPrediction.mockResolvedValue({
      output: ['https://replicate.example.com/generated.png'],
      status: 'succeeded',
    });
    const context = buildContext({
      model,
      request: {
        creditsConfig: {
          byokApiKeyOverride: 'org-replicate-key',
          isByokBypass: true,
          provider: 'replicate',
        },
      } as unknown as ImageGenerationContext['request'],
    });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
      model,
      context.providerInput,
      'org-replicate-key',
      expect.any(Function),
    );
    expect(replicateService.getPrediction).toHaveBeenCalledWith(
      'replicate-byok-job',
      'org-replicate-key',
    );
  });

  it('skips finalize when the ingredient is no longer processing', async () => {
    const model = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
    replicateService.generateTextToImage.mockResolvedValue('replicate-job');
    imagesService.findOne.mockResolvedValue({
      status: IngredientStatus.FAILED,
    });
    const context = buildContext({ model });

    const plan = await service.dispatch(context);
    await plan?.generationPromise;

    expect(filesClientService.uploadToS3).not.toHaveBeenCalled();
  });
  it.each(['placeholder', 'binding'])(
    'records proven non-submission when native batch %s creation fails',
    async (failurePoint) => {
      const quote = quoteModelBillablePricing(
        billableProfile(),
        {
          modelKey: 'test/model',
          provider: 'replicate',
          outputs: 2,
          requests: 1,
        },
        1,
        '2026-09-30T00:00:00.000Z',
      );
      if (quote.status !== 'priced') throw new Error(quote.reason);
      const context = buildContext({
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_LITE,
        outputs: 2,
        request: {
          creditsConfig: {
            modelQuote: quote.snapshot,
            amount: quote.snapshot.credits,
            reservationId: 'hold-1',
            settlement: 'completion',
          },
        } as never,
      });
      const error = new Error('batch preparation failed');
      if (failurePoint === 'placeholder')
        sharedService.createMediaDocuments.mockRejectedValueOnce(error);
      else {
        sharedService.createMediaDocuments.mockResolvedValueOnce({
          ingredientData: { id: 'ingredient-2' },
          metadataData: { id: 'metadata-2' },
        });
        generationBilling.bindOutput
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(error);
      }
      const plan = await service.dispatch(context);
      await expect(plan?.generationPromise).rejects.toBe(error);
      expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
      expect(imagesService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ingredient-1' }),
        expect.objectContaining({
          status: IngredientStatus.FAILED,
          isGenerationFailureConfirmed: true,
        }),
      );
      expect(generationBilling.releaseOutput).toHaveBeenCalledWith(
        'ingredient-1',
        'organization-1',
      );
    },
  );

  it('releases every edit document hold and its pool once when child admission fails', async () => {
    const model = MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5;
    sharedService.createMediaDocuments
      .mockResolvedValueOnce({
        ingredientData: { id: 'ingredient-2' },
        metadataData: { id: 'metadata-2' },
      })
      .mockResolvedValueOnce({
        ingredientData: { id: 'ingredient-3' },
        metadataData: { id: 'metadata-3' },
      });
    const error = new Error('third hold rejected');
    generationBilling.bindOutput
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);
    const context = buildContext({
      model,
      outputs: 3,
      editing: {
        sourceIds: ['source'],
        sourceUrls: ['https://cdn.example.com/source.png'],
        size: 'source',
        width: 1920,
        height: 1080,
        recipe: {
          operation: 'image-edit',
          contractVersion: 'ideogram-4-5-edit-2026-10-01',
          model,
          sourceIds: ['source'],
          size: 'source',
          quality: 'medium',
          outputs: 3,
        },
      },
    });

    Object.assign(context.request, { creditsConfig: { amount: 60 } });

    await expect(service.dispatch(context)).rejects.toBe(error);
    expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
    expect(generationBilling.releaseOutput.mock.calls).toEqual([
      ['ingredient-1', 'organization-1'],
      ['ingredient-2', 'organization-1'],
      ['ingredient-3', 'organization-1'],
    ]);
    expect(generationBilling.releasePool).toHaveBeenCalledOnce();
  });

  it('persists every surplus output URL and stops sequential fanout without charging beyond the quote', async () => {
    replicateService.generateTextToImage.mockResolvedValue('job-surplus');
    const urls = Array.from(
      { length: 4 },
      (_, index) => `https://replicate.delivery/image-${index}.png`,
    );
    replicateService.getPrediction.mockResolvedValue({
      status: 'succeeded',
      output: urls,
    });
    const context = buildContext({
      model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
      outputs: 2,
    });
    const plan = await service.dispatch(context);
    await expect(plan?.generationPromise).rejects.toThrow(
      'cardinality exceeds',
    );
    expect(replicateService.generateTextToImage).toHaveBeenCalledTimes(1);
    expect(metadataService.patch).toHaveBeenCalledWith(
      'metadata-1',
      expect.objectContaining({
        result: JSON.stringify(urls),
        error: expect.stringContaining('recovery'),
      }),
    );
    expect(filesClientService.uploadToS3).not.toHaveBeenCalled();
    expect(generationBilling.releaseOutput).not.toHaveBeenCalled();
  });
  it('records confirmed failure and releases group funding after a Replicate create credit rejection', async () => {
    const quote = quoteModelBillablePricing(
      billableProfile(),
      {
        modelKey: 'test/model',
        provider: 'replicate',
        outputs: 1,
        requests: 1,
      },
      1,
      '2026-09-30T00:00:00.000Z',
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    const error = new ReplicateProviderError(
      AgentFailureReason.INSUFFICIENT_CREDITS,
      'rejected',
      { statusCode: 402, isRetryable: false },
    );
    replicateService.generateTextToImage.mockRejectedValueOnce(error);
    const context = buildContext({
      model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      request: {
        creditsConfig: {
          modelQuote: quote.snapshot,
          amount: quote.snapshot.credits,
          settlement: 'completion',
          reservationId: 'hold-1',
        },
      } as never,
    });
    const plan = await service.dispatch(context);
    await expect(plan?.generationPromise).rejects.toBe(error);
    expect(imagesService.patchAll).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ingredient-1',
        status: IngredientStatus.PROCESSING,
      }),
      expect.objectContaining({
        status: IngredientStatus.FAILED,
        isGenerationFailureConfirmed: true,
      }),
    );
    expect(generationBilling.releaseOutput).toHaveBeenCalledExactlyOnceWith(
      'ingredient-1',
      'organization-1',
    );
  });
  it.each([false, true])(
    'retains group funding only after the image remote submission boundary (%s)',
    async (submitted) => {
      const quote = quoteModelBillablePricing(
        billableProfile(),
        {
          modelKey: 'test/model',
          provider: 'replicate',
          outputs: 1,
          requests: 1,
        },
        1,
        '2026-09-30T00:00:00.000Z',
      );
      if (quote.status !== 'priced') throw new Error(quote.reason);
      const error = new Error(
        submitted
          ? 'ambiguous create network failure'
          : 'local credentials unavailable',
      );
      replicateService.generateTextToImage.mockImplementationOnce(
        async (_model, _input, _key, onSubmissionStarted) => {
          if (submitted) onSubmissionStarted();
          throw error;
        },
      );
      const context = buildContext({
        model: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        request: {
          creditsConfig: {
            modelQuote: quote.snapshot,
            amount: quote.snapshot.credits,
            reservationId: 'hold-1',
            settlement: 'completion',
          },
        } as never,
      });
      const plan = await service.dispatch(context);
      await expect(plan?.generationPromise).rejects.toBe(error);
      if (submitted) {
        expect(generationBilling.releaseOutput).not.toHaveBeenCalled();
        expect(imagesService.patchAll).not.toHaveBeenCalled();
      } else {
        expect(generationBilling.releaseOutput).toHaveBeenCalledExactlyOnceWith(
          'ingredient-1',
          'organization-1',
        );
        expect(imagesService.patchAll).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'ingredient-1' }),
          expect.objectContaining({
            isGenerationFailureConfirmed: true,
            status: IngredientStatus.FAILED,
          }),
        );
      }
    },
  );
});
