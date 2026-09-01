import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ImageGenerationAdmissionService } from '@api/collections/images/services/image-generation-admission.service';
import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { FalImageGenerationProviderAdapter } from '@api/collections/images/services/providers/fal-image-generation-provider.adapter';
import { GenfeedAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/genfeedai-image-generation-provider.adapter';
import { HiggsFieldImageGenerationProviderAdapter } from '@api/collections/images/services/providers/higgsfield-image-generation-provider.adapter';
import { KlingAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/klingai-image-generation-provider.adapter';
import { LeonardoImageGenerationProviderAdapter } from '@api/collections/images/services/providers/leonardo-image-generation-provider.adapter';
import { ReplicateImageGenerationProviderAdapter } from '@api/collections/images/services/providers/replicate-image-generation-provider.adapter';
import { SdxlImageGenerationProviderAdapter } from '@api/collections/images/services/providers/sdxl-image-generation-provider.adapter';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  IngredientStatus,
  ModelCategory,
  ModelProvider,
  PromptStatus,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for the three #859 hardening fixes carried into
 * {@link ImageGenerationService} by the #778 refactor (mirror of the videos set
 * in #853):
 *  - F1: the deferred credit authorization scales with the real number of
 *    billable provider calls (Fal + non-batch Replicate fan out; batch Replicate
 *    and single-output providers do not).
 *  - F2: a failed fan-out output is attributed to that specific output, never to
 *    the primary.
 *  - F3: non-batch Replicate requests exactly one output per call.
 */

const ORG = 'org-1';
const FOREIGN_ORG = 'org-foreign';
const RESOLVED_BRAND = 'brand-resolved';
const REFERENCE_CDN = 'https://cdn.genfeed.ai';
const REFERENCE_INGREDIENTS_ENDPOINT = `${REFERENCE_CDN}/ingredients`;

// REPLICATE_BYTEDANCE_SEEDREAM_5_LITE / _4_5 and REPLICATE_FAST_FLUX_TRAINER are
// the batch-capable IMAGE models in MODEL_OUTPUT_CAPABILITIES; everything else is
// non-batch. Use the `seedream-5-lite` key (no dot) so the provider registry's
// owner/model matcher resolves it to the Replicate adapter.
const BATCH_MODEL = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_LITE;
// Recraft V4 now compiles through the remaining-family brief. Fan-out
// arithmetic still uses this non-batch Replicate key; exemption coverage
// uses an enumerated non-generative transform.
const NON_BATCH_REPLICATE_MODEL = MODEL_KEYS.REPLICATE_RECRAFT_AI_RECRAFT_V4;
const NON_GENERATIVE_EXEMPT_MODEL = MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE;
const FAL_MODEL = MODEL_KEYS.FAL_NANO_BANANA_2;
const SINGLE_OUTPUT_MODEL = MODEL_KEYS.LEONARDOAI;

const buildUser = (organizationId: string = ORG): User =>
  ({
    id: 'auth-user-1',
    brandId: 'brand-from-token',
    organizationId,
    userId: 'user-1',
  }) as unknown as User;

const buildRequest = (
  overrides: Record<string, unknown> = {},
): ExpressRequest =>
  ({
    originalUrl: '/api/images',
    params: {},
    query: {},
    ...overrides,
  }) as unknown as ExpressRequest;

const baseDto = (overrides: Partial<CreateImageDto> = {}): CreateImageDto =>
  ({
    height: 1080,
    model: NON_BATCH_REPLICATE_MODEL,
    text: 'a sunset over the ocean',
    width: 1920,
    ...overrides,
  }) as CreateImageDto;

const createService = () => {
  let savedDocCount = 0;
  const sharedService = {
    createMediaDocuments: vi.fn().mockImplementation(() => {
      const n = savedDocCount++;
      return Promise.resolve({
        ingredientData: {
          id: `ing-${n}`,
          toString: () => `ing-${n}`,
        },
        metadataData: { id: `meta-${n}` },
      });
    }),
  };

  const brandsService = {
    findOne: vi.fn().mockResolvedValue({
      id: RESOLVED_BRAND,
      description: 'desc',
      label: 'Brand',
      organizationId: ORG,
      primaryColor: '#fff',
      secondaryColor: '#000',
      text: 'text',
    }),
  };
  const organizationSettingsService = {
    findOne: vi.fn().mockResolvedValue(null),
  };
  const modelRegistrationService = {
    validateModelForOrg: vi
      .fn<
        (
          model: string,
          organizationId: string,
        ) => Promise<{ endpoint: string; provider: ModelProvider } | undefined>
      >()
      .mockResolvedValue(undefined),
  };
  const modelsService = {
    findOne: vi.fn().mockResolvedValue({ cost: 10 }),
  };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000),
  };
  const promptsService = {
    create: vi.fn().mockResolvedValue({ id: 'prompt-doc', original: 'built' }),
    findOne: vi.fn().mockResolvedValue(null),
    patch: vi.fn().mockResolvedValue({ id: 'prompt-doc', original: 'built' }),
  };
  const promptBuilderService = {
    buildPrompt: vi.fn().mockResolvedValue({
      input: { prompt: 'built-prompt' },
      templateUsed: 'template',
      templateVersion: '1.0.0',
    }),
  };
  const comfyUIService = { generateImage: vi.fn() };
  const klingAIService = { queueGenerateImage: vi.fn() };
  const leonardoaiService = {
    generateImage: vi.fn().mockResolvedValue('leo-gen'),
  };
  const falService = {
    generateImage: vi.fn().mockResolvedValue({ url: 'https://fal/0.png' }),
  };
  const higgsFieldService = {
    generateTextToImage: vi.fn(),
    waitForImageCompletion: vi.fn(),
  };
  const replicateService = {
    cancelPrediction: vi.fn().mockResolvedValue(undefined),
    generateTextToImage: vi.fn().mockResolvedValue('rep-gen'),
    getPrediction: vi.fn().mockResolvedValue({
      output: ['https://replicate/generated.png'],
      status: 'succeeded',
    }),
  };
  const metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
  const imagesService = {
    findOne: vi.fn().mockResolvedValue({
      id: 'ing-0',
      status: IngredientStatus.PROCESSING,
    }),
    patch: vi.fn().mockResolvedValue(undefined),
  };
  const activitiesService = {
    create: vi.fn().mockResolvedValue({ id: { toString: () => 'act' } }),
  };
  const websocketService = {
    publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
    publishVideoComplete: vi.fn().mockResolvedValue(undefined),
  };
  const failedGenerationService = {
    handleFailedImageGeneration: vi.fn().mockResolvedValue(undefined),
  };
  const routerService = {
    getDefaultModel: vi.fn().mockResolvedValue(NON_BATCH_REPLICATE_MODEL),
    // Stands in for the registry policy: the first candidate the registry
    // carries wins, otherwise the category default (#2422 Phase C).
    resolveModelKey: vi
      .fn()
      .mockImplementation(
        ({ candidates }: { candidates?: Array<string | null | undefined> }) => {
          const key = candidates?.find((candidate): candidate is string =>
            Boolean(candidate),
          );

          return Promise.resolve(
            key
              ? { key, source: 'candidate' }
              : { key: NON_BATCH_REPLICATE_MODEL, source: 'registry-default' },
          );
        },
      ),
    selectModel: vi.fn(),
  };
  const pollingService = {
    waitForMultipleIngredientsCompletion: vi
      .fn()
      .mockResolvedValue([{ id: 'ing-0', status: 'completed' }]),
    waitForIngredientCompletion: vi
      .fn()
      .mockResolvedValue({ id: 'ing-0', status: 'completed' }),
  };
  const filesClientService = {
    uploadToS3: vi.fn().mockResolvedValue({
      height: 1080,
      publicUrl: 'https://cdn/generated.png',
      s3Key: 'images/generated.png',
      size: 1024,
      width: 1920,
    }),
  };
  const assetsService = {
    findOne: vi.fn().mockResolvedValue(null),
  };
  const ingredientsService = {
    findOne: vi.fn().mockResolvedValue(null),
  };
  const configService = {
    cdnUrl: REFERENCE_CDN,
    ingredientsEndpoint: REFERENCE_INGREDIENTS_ENDPOINT,
  };
  const loggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

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
  const providerDispatchService = new ImageGenerationProviderDispatchService(
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
  const creditsService = new ImageGenerationCreditsService(
    creditsUtilsService as never,
    modelsService as never,
    providerRegistry,
    {
      isByokActiveForProvider: vi.fn().mockResolvedValue(false),
      isByokBillingInGoodStanding: vi.fn().mockResolvedValue(true),
    } as never,
  );
  const admissionService = new ImageGenerationAdmissionService(
    creditsService,
    imagesService as never,
  );

  const service = new ImageGenerationService(
    configService as never,
    assetsService as never,
    brandsService as never,
    admissionService,
    pollingService as never,
    providerDispatchService,
    imagesService as never,
    ingredientsService as never,
    organizationSettingsService as never,
    loggerService,
    modelRegistrationService as never,
    promptBuilderService as never,
    promptsService as never,
    routerService as never,
    sharedService as never,
    {
      bindCancelOnAbort: vi.fn(),
      cancelProcessingIngredient: vi.fn(),
    } as never,
  );

  return {
    creditsUtilsService,
    failedGenerationService,
    falService,
    ingredientsService,
    imagesService,
    loggerService,
    metadataService,
    modelRegistrationService,
    promptBuilderService,
    promptsService,
    replicateService,
    routerService,
    service,
    sharedService,
  };
};

function mockTenantIngredients(
  ingredientsService: { findOne: ReturnType<typeof vi.fn> },
  rows: Array<{ id: string; isDeleted?: boolean; organizationId: string }>,
) {
  ingredientsService.findOne.mockImplementation(
    (query: { id?: string; isDeleted?: boolean; organizationId?: string }) => {
      const row = rows.find((candidate) => candidate.id === query.id);
      if (!row) {
        return Promise.resolve(null);
      }
      if (
        query.organizationId !== undefined &&
        row.organizationId !== query.organizationId
      ) {
        return Promise.resolve(null);
      }
      if (query.isDeleted === false && row.isDeleted === true) {
        return Promise.resolve(null);
      }
      return Promise.resolve({ id: row.id });
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImageGenerationService', () => {
  it('returns the accepted source-action asset without dispatching the provider again', async () => {
    const { imagesService, replicateService, service, sharedService } =
      createService();
    imagesService.findOne.mockResolvedValue({
      id: 'ing-accepted',
      metadata: { externalId: 'provider-job-1' },
      organizationId: 'org-1',
      status: IngredientStatus.PROCESSING,
    });

    const response = await service.generateImage(
      buildUser(),
      baseDto({
        sourceActionId: 'generation-card-1',
        waitForCompletion: false,
      }),
      buildRequest(),
    );

    expect(response).toMatchObject({ data: { id: 'ing-accepted' } });
    expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
    expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
  });

  it('re-dispatches a source-action placeholder that never reached a provider', async () => {
    const { imagesService, replicateService, service, sharedService } =
      createService();
    imagesService.findOne.mockResolvedValue({
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
      id: 'ing-orphaned',
      metadata: { externalId: null },
      organizationId: 'org-1',
      status: IngredientStatus.PROCESSING,
    });

    await service.generateImage(
      buildUser(),
      baseDto({
        sourceActionId: 'generation-card-orphaned',
        waitForCompletion: false,
      }),
      buildRequest(),
    );

    expect(imagesService.patch).toHaveBeenCalledWith('ing-orphaned', {
      status: IngredientStatus.FAILED,
    });
    expect(sharedService.createMediaDocuments).toHaveBeenCalled();
    expect(replicateService.generateTextToImage).toHaveBeenCalled();
  });

  it('reuses a fresh source-action placeholder while provider dispatch may still be in flight', async () => {
    const { imagesService, replicateService, service, sharedService } =
      createService();
    imagesService.findOne.mockResolvedValue({
      createdAt: new Date(),
      id: 'ing-in-flight',
      metadata: { externalId: null },
      organizationId: 'org-1',
      status: IngredientStatus.PROCESSING,
    });

    const response = await service.generateImage(
      buildUser(),
      baseDto({
        sourceActionId: 'generation-card-in-flight',
        waitForCompletion: false,
      }),
      buildRequest(),
    );

    expect(response).toMatchObject({ data: { id: 'ing-in-flight' } });
    expect(imagesService.patch).not.toHaveBeenCalled();
    expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
    expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
  });

  it('awaits durable placeholder linkage before provider dispatch', async () => {
    const { replicateService, service, sharedService } = createService();
    const order: string[] = [];
    sharedService.createMediaDocuments.mockImplementation(async () => {
      order.push('placeholder');
      return {
        ingredientData: { id: 'ing-linked' },
        metadataData: { id: 'meta-linked' },
      };
    });
    replicateService.generateTextToImage.mockImplementation(async () => {
      order.push('provider');
      return 'rep-gen';
    });

    await service.generateImage(
      buildUser(),
      baseDto({ waitForCompletion: true }),
      buildRequest(),
      async (ingredientId) => {
        order.push(`linked:${ingredientId}`);
      },
    );

    expect(order.slice(0, 3)).toEqual([
      'placeholder',
      'linked:ing-linked',
      'provider',
    ]);
  });

  it('fails the placeholder and skips provider dispatch when linkage rejects', async () => {
    const { failedGenerationService, replicateService, service } =
      createService();

    await expect(
      service.generateImage(
        buildUser(),
        baseDto(),
        buildRequest(),
        async () => {
          throw new Error('run linkage failed');
        },
      ),
    ).rejects.toThrow('run linkage failed');

    expect(
      failedGenerationService.handleFailedImageGeneration,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'ing-0',
      '/images/ing-0',
      expect.objectContaining({ organizationId: ORG }),
      expect.any(String),
      'run linkage failed',
    );
    expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
  });

  describe('prompt persistence', () => {
    it('reuses a submitted prompt document instead of creating a duplicate', async () => {
      const promptId = testId('prompt');
      const { service, promptsService } = createService();
      promptsService.findOne.mockResolvedValue({
        id: promptId,
        original: 'a sunset over the ocean',
      });
      promptsService.patch.mockResolvedValue({
        id: promptId,
        original: 'a sunset over the ocean',
      });

      await service.generateImage(
        buildUser(),
        baseDto({
          promptId,
          text: 'a sunset over the ocean',
        }),
        buildRequest(),
      );

      expect(promptsService.create).not.toHaveBeenCalled();
      expect(promptsService.patch).toHaveBeenCalledWith(
        promptId,
        expect.objectContaining({ status: PromptStatus.PROCESSING }),
      );
    });
  });

  describe('registry-backed model resolution (#2422 Phase C)', () => {
    it('asks the router policy for the model, candidates in precedence order', async () => {
      const { service, routerService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({ model: FAL_MODEL }),
        buildRequest(),
      );

      expect(routerService.resolveModelKey).toHaveBeenCalledWith({
        candidates: [FAL_MODEL, undefined, undefined],
        category: ModelCategory.IMAGE,
        organizationId: ORG,
      });
    });

    it('generates with the registry answer when the requested key is not routable', async () => {
      const { service, routerService, modelRegistrationService, falService } =
        createService();

      routerService.resolveModelKey.mockResolvedValue({
        key: FAL_MODEL,
        source: 'registry-default',
      });

      await service.generateImage(
        buildUser(),
        baseDto({ model: 'retired/model' }),
        buildRequest(),
      );

      expect(modelRegistrationService.validateModelForOrg).toHaveBeenCalledWith(
        FAL_MODEL,
        ORG,
      );
      expect(falService.generateImage).toHaveBeenCalled();
    });

    it('dispatches a Fal partner selection key to its exact registered endpoint', async () => {
      const {
        service,
        modelRegistrationService,
        falService,
        replicateService,
      } = createService();
      const selectionKey = 'fal/google/nano-banana-2-lite';
      const endpoint = 'google/nano-banana-2-lite';
      modelRegistrationService.validateModelForOrg.mockResolvedValue({
        endpoint,
        provider: ModelProvider.FAL,
      });

      await service.generateImage(
        buildUser(),
        baseDto({ model: selectionKey }),
        buildRequest(),
      );

      expect(falService.generateImage).toHaveBeenCalledWith(
        endpoint,
        expect.any(Object),
      );
      expect(replicateService.generateTextToImage).not.toHaveBeenCalled();
    });

    it('logs an error when the registry had nothing and the constant was used', async () => {
      const { service, routerService, loggerService } = createService();

      routerService.resolveModelKey.mockResolvedValue({
        key: NON_BATCH_REPLICATE_MODEL,
        source: 'fallback-constant',
      });

      await service.generateImage(buildUser(), baseDto(), buildRequest());

      expect(loggerService.error).toHaveBeenCalledWith(
        'Image model resolved from constant fallback',
        expect.objectContaining({ model: NON_BATCH_REPLICATE_MODEL }),
      );
    });

    it('leaves auto-select on the scoring path', async () => {
      const { service, routerService } = createService();

      routerService.selectModel.mockResolvedValue({
        reason: 'best match',
        selectedModel: FAL_MODEL,
      });

      await service.generateImage(
        buildUser(),
        baseDto({ autoSelectModel: true }),
        buildRequest(),
      );

      expect(routerService.selectModel).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ModelCategory.IMAGE,
          organizationId: ORG,
        }),
      );
      expect(routerService.resolveModelKey).not.toHaveBeenCalled();
    });
  });

  describe('deferred credit authorization (multi-output, F1)', () => {
    it('multiplies the authorized amount by outputs for Fal (always fans out)', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({ model: FAL_MODEL, outputs: 2 }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      // base 10 x 2 fan-out outputs = 20
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 20);
    });

    it('multiplies the authorized amount by outputs for non-batch Replicate', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({ model: NON_BATCH_REPLICATE_MODEL, outputs: 3 }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      // base 10 x 3 separate provider calls = 30
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 30);
    });

    it('does not multiply for batch-capable Replicate models', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({ model: BATCH_MODEL, outputs: 3 }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      // batch model yields all outputs from a single call -> single base cost
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 10);
    });

    it('does not multiply for single-output providers (e.g. Leonardo)', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({ model: SINGLE_OUTPUT_MODEL, outputs: 4 }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      // single-output providers ignore `outputs` -> never over-charge by N
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 10);
    });
  });

  describe('non-batch Replicate outputs (F3)', () => {
    it('requests exactly one output per call for non-batch models', async () => {
      const { service, replicateService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({
          model: NON_BATCH_REPLICATE_MODEL,
          outputs: 3,
          waitForCompletion: true,
        }),
        buildRequest(),
      );

      expect(replicateService.generateTextToImage).toHaveBeenCalledTimes(3);
    });

    it('requests all outputs in a single call for batch-capable models', async () => {
      const {
        service,
        promptBuilderService,
        replicateService,
        metadataService,
      } = createService();
      replicateService.generateTextToImage.mockResolvedValue('rep');
      replicateService.getPrediction.mockResolvedValue({
        output: [
          'https://replicate/generated-0.png',
          'https://replicate/generated-1.png',
          'https://replicate/generated-2.png',
        ],
        status: 'succeeded',
      });

      await service.generateImage(
        buildUser(),
        baseDto({ model: BATCH_MODEL, outputs: 3, waitForCompletion: true }),
        buildRequest(),
      );

      // SeeDream 5 Lite compiles a brief, so the legacy prompt-builder path is
      // skipped. Batch size still has to ride on the provider payload.
      expect(promptBuilderService.buildPrompt).not.toHaveBeenCalled();
      expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
        BATCH_MODEL,
        expect.objectContaining({
          max_images: 3,
          sequential_image_generation: 'auto',
        }),
      );
      // Batch model -> one provider call, indexed external ids on each placeholder.
      expect(replicateService.generateTextToImage).toHaveBeenCalledTimes(1);
      const externalIds = metadataService.patch.mock.calls.map(
        ([, entity]) => (entity as { externalId?: string }).externalId,
      );
      expect(externalIds).toContain('rep_0');
      expect(externalIds).toContain('rep_1');
      expect(externalIds).toContain('rep_2');
    });
  });

  describe('fan-out failure attribution (F2)', () => {
    it('marks the specific failed additional output, not the primary', async () => {
      const { service, replicateService, failedGenerationService } =
        createService();
      // Primary call succeeds (ing-0); the additional output's call fails (ing-1).
      replicateService.generateTextToImage
        .mockResolvedValueOnce('rep-gen-0')
        .mockRejectedValueOnce(new Error('boom'));

      const error = await service
        .generateImage(
          buildUser(),
          baseDto({
            model: NON_BATCH_REPLICATE_MODEL,
            outputs: 2,
            waitForCompletion: true,
          }),
          buildRequest(),
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);

      const markedIds =
        failedGenerationService.handleFailedImageGeneration.mock.calls.map(
          (call) => call[1],
        );
      // The failed additional output (ing-1) is marked; the primary (ing-0) is not.
      expect(markedIds).toContain('ing-1');
      expect(markedIds).not.toContain('ing-0');

      // The websocket path targets the failed output, not the primary.
      const markedWsPaths =
        failedGenerationService.handleFailedImageGeneration.mock.calls.map(
          (call) => call[2],
        );
      expect(markedWsPaths).toContain('/images/ing-1');
    });

    it('marks the specific failed Fal additional output, not the primary', async () => {
      const { service, falService, failedGenerationService } = createService();
      // Primary output succeeds (ing-0); the additional output fails (ing-1).
      falService.generateImage
        .mockResolvedValueOnce({ url: 'https://fal/0.png' })
        .mockRejectedValueOnce(new Error('boom'));

      // Fal is background-only: generateImage returns the placeholder
      // immediately, so the fan-out failure is attributed asynchronously.
      await service.generateImage(
        buildUser(),
        baseDto({ model: FAL_MODEL, outputs: 2 }),
        buildRequest(),
      );

      await vi.waitFor(() => {
        expect(
          failedGenerationService.handleFailedImageGeneration,
        ).toHaveBeenCalled();
      });

      const markedIds =
        failedGenerationService.handleFailedImageGeneration.mock.calls.map(
          (call) => call[1],
        );
      // The failed additional output (ing-1) is marked; the already-succeeded
      // primary (ing-0) is not.
      expect(markedIds).toContain('ing-1');
      expect(markedIds).not.toContain('ing-0');
    });
  });

  describe('generation brief compilation', () => {
    const fluxSchnell = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL;
    // #3467 onboarded Imagen (and 15 other families) onto model-aware brief
    // compilation; these assert a second, independently-registered compiler
    // behaves the same as FLUX Schnell (evidence persistence, redaction,
    // unchanged credit fan-out) so the coverage isn't FLUX-Schnell-only.
    const imagen4 = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;

    it('compiles FLUX Schnell from the versioned brief and persists redacted evidence', async () => {
      const { service, promptBuilderService, replicateService, sharedService } =
        createService();

      await service.generateImage(
        buildUser(),
        baseDto({
          height: 1080,
          model: fluxSchnell,
          text: 'a sunset over the ocean',
          width: 1920,
        }),
        buildRequest(),
      );

      expect(promptBuilderService.buildPrompt).not.toHaveBeenCalled();
      expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
        fluxSchnell,
        {
          aspect_ratio: '16:9',
          disable_safety_checker: false,
          go_fast: true,
          num_inference_steps: 4,
          num_outputs: 1,
          output_format: 'jpg',
          output_quality: 80,
          prompt: 'a sunset over the ocean',
        },
      );

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          generationSource:
            'generation-brief:v1:flux-schnell-capability@1:flux-schnell-image-compiler@1',
          providerData: expect.objectContaining({
            compilerId: 'flux-schnell-image-compiler',
            modelKey: fluxSchnell,
            profileId: 'flux-schnell-capability',
            status: 'compiled',
          }),
        }),
      );
      const providerData =
        sharedService.createMediaDocuments.mock.calls[0]?.[1]?.providerData;
      expect(providerData).not.toHaveProperty('prompt');
      expect(JSON.stringify(providerData)).not.toContain(
        'a sunset over the ocean',
      );
    });

    it('keeps non-batch FLUX Schnell credit fan-out unchanged', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({ model: fluxSchnell, outputs: 2 }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 20);
    });

    it('compiles Recraft V4 from the remaining-family brief', async () => {
      const { service, promptBuilderService, sharedService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({ model: NON_BATCH_REPLICATE_MODEL }),
        buildRequest(),
      );

      expect(promptBuilderService.buildPrompt).not.toHaveBeenCalled();
      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          generationSource: expect.stringMatching(/^generation-brief:/),
          providerData: expect.objectContaining({
            modelKey: NON_BATCH_REPLICATE_MODEL,
            status: 'compiled',
            surface: 'studio',
          }),
        }),
      );
    });

    it('exempts enumerated non-generative image transforms', async () => {
      const { service, promptBuilderService, sharedService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({ model: NON_GENERATIVE_EXEMPT_MODEL }),
        buildRequest(),
      );

      expect(promptBuilderService.buildPrompt).toHaveBeenCalled();
      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          generationSource:
            'generation-brief-exemption:non_generative_transform',
          providerData: expect.objectContaining({
            compilerId: null,
            modelKey: NON_GENERATIVE_EXEMPT_MODEL,
            reason: 'non_generative_transform',
            status: 'exempted',
            surface: 'studio',
          }),
        }),
      );
    });

    it('compiles Imagen 4 from the versioned brief and persists redacted evidence', async () => {
      const { service, promptBuilderService, replicateService, sharedService } =
        createService();

      await service.generateImage(
        buildUser(),
        baseDto({
          height: 1080,
          model: imagen4,
          text: 'a sunset over the ocean',
          width: 1920,
        }),
        buildRequest(),
      );

      expect(promptBuilderService.buildPrompt).not.toHaveBeenCalled();
      expect(replicateService.generateTextToImage).toHaveBeenCalledWith(
        imagen4,
        {
          aspect_ratio: '16:9',
          output_format: 'jpg',
          prompt: 'a sunset over the ocean',
          safety_filter_level: 'block_only_high',
        },
      );

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          generationSource:
            'generation-brief:v1:imagen-4-capability@1:imagen-image-compiler@1',
          providerData: expect.objectContaining({
            compilerId: 'imagen-image-compiler',
            modelKey: imagen4,
            profileId: 'imagen-4-capability',
            status: 'compiled',
            surface: 'studio',
          }),
        }),
      );
      const providerData =
        sharedService.createMediaDocuments.mock.calls[0]?.[1]?.providerData;
      expect(providerData).not.toHaveProperty('prompt');
      expect(JSON.stringify(providerData)).not.toContain(
        'a sunset over the ocean',
      );
    });

    it('keeps non-batch Imagen 4 credit fan-out unchanged', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateImage(
        buildUser(),
        baseDto({ model: imagen4, outputs: 2 }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 20);
    });
  });

  describe('reference image tenant isolation (#3501)', () => {
    const sameTenantId = testId('reference', 1);
    const foreignId = testId('reference', 2);
    const deletedId = testId('reference', 3);
    const sameTenantUrl = `${REFERENCE_INGREDIENTS_ENDPOINT}/images/${sameTenantId}`;

    it('dispatches a same-tenant reference URL to the provider', async () => {
      const { service, falService, ingredientsService } = createService();
      mockTenantIngredients(ingredientsService, [
        { id: sameTenantId, organizationId: ORG },
        { id: foreignId, organizationId: FOREIGN_ORG },
        { id: deletedId, isDeleted: true, organizationId: ORG },
      ]);

      await service.generateImage(
        buildUser(),
        baseDto({ model: FAL_MODEL, references: [sameTenantId] }),
        buildRequest(),
      );

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sameTenantId,
          isDeleted: false,
          organizationId: ORG,
        }),
      );
      expect(falService.generateImage).toHaveBeenCalled();
      expect(JSON.stringify(falService.generateImage.mock.calls)).toContain(
        sameTenantUrl,
      );
    });

    it('does not dispatch a foreign-organization reference id to the provider', async () => {
      const { service, falService, ingredientsService } = createService();
      mockTenantIngredients(ingredientsService, [
        { id: sameTenantId, organizationId: ORG },
        { id: foreignId, organizationId: FOREIGN_ORG },
      ]);

      await service.generateImage(
        buildUser(),
        baseDto({ model: FAL_MODEL, references: [foreignId] }),
        buildRequest(),
      );

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: foreignId,
          isDeleted: false,
          organizationId: ORG,
        }),
      );
      expect(falService.generateImage).toHaveBeenCalled();
      expect(JSON.stringify(falService.generateImage.mock.calls)).not.toContain(
        foreignId,
      );
    });

    it('does not dispatch a soft-deleted same-tenant reference id', async () => {
      const { service, falService, ingredientsService } = createService();
      mockTenantIngredients(ingredientsService, [
        { id: deletedId, isDeleted: true, organizationId: ORG },
      ]);

      await service.generateImage(
        buildUser(),
        baseDto({ model: FAL_MODEL, references: [deletedId] }),
        buildRequest(),
      );

      expect(falService.generateImage).toHaveBeenCalled();
      expect(JSON.stringify(falService.generateImage.mock.calls)).not.toContain(
        deletedId,
      );
    });
  });
});
