import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { FalVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/fal-video-generation-provider.adapter';
import { HiggsFieldVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/higgsfield-video-generation-provider.adapter';
import { KlingAiVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/klingai-video-generation-provider.adapter';
import { ReplicateVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/replicate-video-generation-provider.adapter';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import { VideoGenerationCompletionService } from '@api/collections/videos/services/video-generation-completion.service';
import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { VideoGenerationExecutionService } from '@api/collections/videos/services/video-generation-execution.service';
import { VideoGenerationPreparationService } from '@api/collections/videos/services/video-generation-preparation.service';
import { VideoGenerationProviderDispatchService } from '@api/collections/videos/services/video-generation-provider-dispatch.service';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import { assertRedactedVideoGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import {
  IngredientCategory,
  IngredientStatus,
  ModelProvider,
} from '@genfeedai/contracts';
import {
  buildMinimaxH3GenerationSource,
  buildPrunaaiPVideoGenerationSource,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Focused regression tests for the seven CodeRabbit findings tracked in #853.
 * Each finding is exercised through the public generateVideo() entry point with
 * the collaborators mocked, so the new contracts are pinned without standing up
 * the full NestJS module.
 */
describe('VideoGenerationService', () => {
  const ORG = 'org-1';
  const FOREIGN_ORG = 'org-foreign';
  const RESOLVED_BRAND = 'brand-resolved';
  const REFERENCE_CDN = 'https://cdn.genfeed.ai';
  const REFERENCE_INGREDIENTS_ENDPOINT = `${REFERENCE_CDN}/ingredients`;
  const FAL_SELECTION_KEY = 'fal/minimax/h3/text-to-video';
  const FAL_ENDPOINT = 'minimax/h3/text-to-video';
  const BATCH_MODEL = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5;
  const NON_BATCH_MODEL = MODEL_KEYS.KLINGAI_V2;
  const COMPILED_MODEL_MINIMAX = MODEL_KEYS.REPLICATE_MINIMAX_H3;
  const COMPILED_MODEL_PRUNAAI = MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO;
  const promptId = testId('prompt');
  const missingPromptId = testId('prompt', 2);

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
      originalUrl: '/api/videos',
      params: {},
      query: {},
      ...overrides,
    }) as unknown as ExpressRequest;

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
        defaultVideoModel: NON_BATCH_MODEL,
        description: 'desc',
        id: RESOLVED_BRAND,
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
          ) => Promise<
            { endpoint: string; provider: ModelProvider } | undefined
          >
        >()
        .mockResolvedValue(undefined),
    };
    const modelsService = {
      findOne: vi.fn().mockResolvedValue({ cost: 10 }),
    };
    const creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000),
    };
    const promptsService = {
      create: vi.fn().mockResolvedValue({ id: 'prompt-doc' }),
      findOne: vi.fn(),
    };
    const promptBuilderService = {
      buildPrompt: vi.fn().mockResolvedValue({
        input: { prompt: 'built-prompt' },
        templateUsed: 'template',
        templateVersion: '1.0.0',
      }),
    };
    const klingAIService = {
      queueGenerateTextToVideo: vi.fn().mockResolvedValue('kling-gen'),
    };
    const replicateService = {
      generateTextToVideo: vi.fn().mockResolvedValue('replicate-gen'),
    };
    const falService = {
      generateVideo: vi
        .fn()
        .mockResolvedValue({ url: 'https://fal/generated.mp4' }),
    };
    const higgsFieldService = {
      generateImageToVideo: vi.fn(),
      waitForCompletion: vi.fn(),
    };
    const providerDispatchService = new VideoGenerationProviderDispatchService(
      new KlingAiVideoGenerationProviderAdapter(klingAIService as never),
      new FalVideoGenerationProviderAdapter(falService as never),
      new ReplicateVideoGenerationProviderAdapter(replicateService as never),
      new HiggsFieldVideoGenerationProviderAdapter(higgsFieldService as never),
    );
    const metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
    const videosService = {
      findOne: vi.fn(),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    const activitiesService = {
      create: vi.fn().mockResolvedValue({ id: { toString: () => 'act' } }),
    };
    const websocketService = {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
    };
    const cacheService = {
      invalidateByTags: vi.fn().mockResolvedValue(0),
    };
    const failedGenerationService = {
      handleFailedVideoGeneration: vi.fn().mockResolvedValue(undefined),
    };
    const routerService = {
      getDefaultModel: vi.fn().mockResolvedValue(NON_BATCH_MODEL),
      selectModel: vi.fn(),
    };
    const bookmarksService = { addGeneratedIngredient: vi.fn() };
    const videoMusicOrchestrationService = {
      orchestrateVideoWithMusic: vi.fn(),
    };
    const pollingService = {
      waitForMultipleIngredientsCompletion: vi.fn(),
    };
    // Registered-compiler models (MiniMax H3 / PrunaAI P-Video) resolve
    // reference/end-frame ids through this pair before dispatch. Default to a
    // resolvable image ingredient so existing reference-free tests are
    // unaffected; individual brief-compilation tests override these to
    // simulate an unresolvable reference. Tenant-isolation tests override
    // via mockTenantIngredients.
    const assetsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const ingredientsService = {
      findOne: vi
        .fn()
        .mockImplementation(
          ({ category, id }: { category: string; id: string }) =>
            Promise.resolve(
              category === IngredientCategory.IMAGE ? { id } : null,
            ),
        ),
    };
    const configService = {
      cdnUrl: REFERENCE_CDN,
      ingredientsEndpoint: REFERENCE_INGREDIENTS_ENDPOINT,
    };
    const filesClientService = {
      getPresignedDownloadUrl: vi
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(`https://s3.example.com/videos/${id}?signed=true`),
        ),
    };
    const loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const preparationService = new VideoGenerationPreparationService(
      assetsService as never,
      brandsService as never,
      configService as never,
      filesClientService as never,
      ingredientsService as never,
      loggerService,
      modelRegistrationService as never,
      organizationSettingsService as never,
      promptBuilderService as never,
      promptsService as never,
      routerService as never,
      sharedService as never,
    );
    const creditsService = new VideoGenerationCreditsService(
      creditsUtilsService as never,
      modelsService as never,
      {
        isByokActiveForProvider: vi.fn().mockResolvedValue(false),
        isByokBillingInGoodStanding: vi.fn().mockResolvedValue(true),
      } as never,
    );
    const executionService = new VideoGenerationExecutionService(
      activitiesService as never,
      failedGenerationService as never,
      loggerService,
      metadataService as never,
      providerDispatchService,
      sharedService as never,
      videosService as never,
      websocketService as never,
    );
    const completionService = new VideoGenerationCompletionService(
      bookmarksService as never,
      cacheService as never,
      pollingService as never,
      loggerService,
      videoMusicOrchestrationService as never,
      videosService as never,
      {
        bindCancelOnAbort: vi.fn(),
      } as never,
    );
    const service = new VideoGenerationService(
      completionService,
      creditsService,
      executionService,
      preparationService,
      videosService as never,
    );

    return {
      assetsService,
      brandsService,
      cacheService,
      creditsUtilsService,
      failedGenerationService,
      falService,
      filesClientService,
      ingredientsService,
      klingAIService,
      metadataService,
      modelRegistrationService,
      promptBuilderService,
      promptsService,
      replicateService,
      service,
      sharedService,
      videosService,
    };
  };

  function mockTenantIngredients(
    ingredientsService: { findOne: ReturnType<typeof vi.fn> },
    rows: Array<{ id: string; isDeleted?: boolean; organizationId: string }>,
  ) {
    ingredientsService.findOne.mockImplementation(
      (query: {
        id?: string;
        isDeleted?: boolean;
        organizationId?: string;
      }) => {
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

  const baseDto = (overrides: Partial<CreateVideoDto> = {}): CreateVideoDto =>
    ({
      height: 1080,
      model: NON_BATCH_MODEL,
      text: 'a sunset over the ocean',
      width: 1920,
      ...overrides,
    }) as CreateVideoDto;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the accepted source-action asset without dispatching the provider again', async () => {
    const { klingAIService, service, sharedService, videosService } =
      createService();
    videosService.findOne.mockResolvedValue({
      id: 'video-accepted',
      metadata: { externalId: 'provider-job-1' },
      status: IngredientStatus.PROCESSING,
    });

    const response = await service.generateVideo(
      buildUser(),
      baseDto({
        sourceActionId: 'generation-card-1',
        waitForCompletion: false,
      }),
      buildRequest(),
    );

    expect(response).toMatchObject({ data: { id: 'video-accepted' } });
    expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
    expect(klingAIService.queueGenerateTextToVideo).not.toHaveBeenCalled();
  });

  it('re-dispatches a source-action placeholder that never reached a provider', async () => {
    const { klingAIService, service, sharedService, videosService } =
      createService();
    videosService.findOne.mockResolvedValue({
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
      id: 'video-orphaned',
      metadata: { externalId: null },
      status: IngredientStatus.PROCESSING,
    });

    await service.generateVideo(
      buildUser(),
      baseDto({
        sourceActionId: 'generation-card-orphaned',
        waitForCompletion: false,
      }),
      buildRequest(),
    );

    expect(videosService.patch).toHaveBeenCalledWith('video-orphaned', {
      status: IngredientStatus.FAILED,
    });
    expect(sharedService.createMediaDocuments).toHaveBeenCalled();
    expect(klingAIService.queueGenerateTextToVideo).toHaveBeenCalled();
  });

  it('reuses a fresh source-action placeholder while provider dispatch may still be in flight', async () => {
    const { klingAIService, service, sharedService, videosService } =
      createService();
    videosService.findOne.mockResolvedValue({
      createdAt: new Date(),
      id: 'video-in-flight',
      metadata: { externalId: null },
      status: IngredientStatus.PROCESSING,
    });

    const response = await service.generateVideo(
      buildUser(),
      baseDto({
        sourceActionId: 'generation-card-in-flight',
        waitForCompletion: false,
      }),
      buildRequest(),
    );

    expect(response).toMatchObject({ data: { id: 'video-in-flight' } });
    expect(videosService.patch).not.toHaveBeenCalled();
    expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
    expect(klingAIService.queueGenerateTextToVideo).not.toHaveBeenCalled();
  });

  it('awaits durable placeholder linkage before provider dispatch', async () => {
    const { klingAIService, service, sharedService } = createService();
    const order: string[] = [];
    sharedService.createMediaDocuments.mockImplementation(async () => {
      order.push('placeholder');
      return {
        ingredientData: { id: 'ing-linked' },
        metadataData: { id: 'meta-linked' },
      };
    });
    klingAIService.queueGenerateTextToVideo.mockImplementation(async () => {
      order.push('provider');
      return 'kling-gen';
    });

    await service.generateVideo(
      buildUser(),
      baseDto(),
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
    const { failedGenerationService, klingAIService, service } =
      createService();

    await expect(
      service.generateVideo(
        buildUser(),
        baseDto(),
        buildRequest(),
        async () => {
          throw new Error('run linkage failed');
        },
      ),
    ).rejects.toThrow('run linkage failed');

    expect(
      failedGenerationService.handleFailedVideoGeneration,
    ).toHaveBeenCalled();
    expect(klingAIService.queueGenerateTextToVideo).not.toHaveBeenCalled();
  });

  // Finding 1 — org model validation must run even without request context.
  describe('model org validation (finding 1)', () => {
    it('validates the resolved model against the token org when request context is absent', async () => {
      const { service, modelRegistrationService } = createService();

      await service.generateVideo(buildUser(), baseDto(), buildRequest());

      expect(modelRegistrationService.validateModelForOrg).toHaveBeenCalledWith(
        NON_BATCH_MODEL,
        ORG,
      );
    });

    it('skips validation for single-tenant deployments without an organization', async () => {
      const { service, modelRegistrationService } = createService();

      await service.generateVideo(buildUser(''), baseDto(), buildRequest());

      expect(
        modelRegistrationService.validateModelForOrg,
      ).not.toHaveBeenCalled();
    });

    it('dispatches a Fal partner selection key to its exact registered endpoint', async () => {
      const {
        service,
        falService,
        modelRegistrationService,
        replicateService,
      } = createService();
      modelRegistrationService.validateModelForOrg.mockResolvedValue({
        endpoint: FAL_ENDPOINT,
        provider: ModelProvider.FAL,
      });

      await service.generateVideo(
        buildUser(),
        baseDto({ model: FAL_SELECTION_KEY }),
        buildRequest(),
      );

      expect(falService.generateVideo).toHaveBeenCalledWith(
        FAL_ENDPOINT,
        expect.any(Object),
      );
      expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
    });
  });

  // Finding 2 — prompt lookup is org-scoped and fails closed.
  describe('saved-prompt lookup (finding 2)', () => {
    it('scopes the prompt lookup to the caller organization', async () => {
      const { service, promptsService } = createService();
      promptsService.findOne.mockResolvedValue({
        id: 'prompt-id',
        original: 'stored prompt',
      });

      await service.generateVideo(
        buildUser(),
        baseDto({ promptId }),
        buildRequest(),
      );

      expect(promptsService.findOne).toHaveBeenCalledWith({
        id: promptId,
        organizationId: ORG,
      });
    });

    it('throws 404 and does not dispatch when the referenced prompt is missing', async () => {
      const { service, promptsService, klingAIService } = createService();
      promptsService.findOne.mockResolvedValue(null);

      const error = await service
        .generateVideo(
          buildUser(),
          baseDto({ promptId: missingPromptId }),
          buildRequest(),
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(klingAIService.queueGenerateTextToVideo).not.toHaveBeenCalled();
    });

    it('omits the org filter for single-tenant deployments', async () => {
      const { service, promptsService } = createService();
      promptsService.findOne.mockResolvedValue({
        id: 'prompt-id',
        original: 'stored prompt',
      });

      await service.generateVideo(
        buildUser(''),
        baseDto({ promptId }),
        buildRequest(),
      );

      expect(promptsService.findOne).toHaveBeenCalledWith({
        id: promptId,
      });
    });
  });

  // Finding 3 — persist the prompt against the resolved brand.
  it('persists the prompt against the resolved brand id (finding 3)', async () => {
    const { service, promptsService } = createService();

    await service.generateVideo(
      buildUser(),
      baseDto({ brand: 'brand-from-token' }),
      buildRequest(),
    );

    expect(promptsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: RESOLVED_BRAND }),
    );
  });

  // Finding 4 — a single credit calculation feeds authorization and deduction.
  describe('credit accounting (finding 4)', () => {
    it('never deducts directly — deduction is owned by CreditsInterceptor', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateVideo(buildUser(), baseDto(), buildRequest());

      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
    });

    it('authorizes the fully-multiplied amount on the deferred path', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateVideo(
        buildUser(),
        baseDto({
          model: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
          outputs: 2,
          resolution: 'pro',
        }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      // Base 10 × Kling Pro's published 4/3 band, rounded to 14, × two
      // non-batch outputs = 28.
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 28);
    });

    it('does not multiply authorization by outputs for batch-capable models', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateVideo(
        buildUser(),
        baseDto({ model: BATCH_MODEL, outputs: 3, resolution: 'standard' }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 10);
    });

    it('throws 502 and cleans up when the first output never starts (no charge)', async () => {
      const { service, klingAIService, failedGenerationService, cacheService } =
        createService();
      klingAIService.queueGenerateTextToVideo.mockResolvedValue(
        null as unknown as string,
      );

      const error = await service
        .generateVideo(buildUser(), baseDto(), buildRequest())
        .catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      // The single placeholder is torn down and the success-only cache bust
      // (which the CreditsInterceptor keys deduction off) is never reached.
      expect(
        failedGenerationService.handleFailedVideoGeneration,
      ).toHaveBeenCalled();
      expect(cacheService.invalidateByTags).not.toHaveBeenCalled();
    });
  });

  it('persists the selected provider before the external generation call', async () => {
    const { service, klingAIService, metadataService } = createService();
    klingAIService.queueGenerateTextToVideo.mockImplementation(async () => {
      expect(metadataService.patch).toHaveBeenCalledWith(
        'meta-0',
        expect.objectContaining({ externalProvider: 'klingai' }),
      );
      return 'kling-job';
    });

    await service.generateVideo(buildUser(), baseDto(), buildRequest());
  });

  // Finding 5 — every batch placeholder gets its own indexed external id.
  it('patches an indexed external id onto every batch placeholder (finding 5)', async () => {
    const { service, replicateService, metadataService } = createService();
    replicateService.generateTextToVideo.mockResolvedValue('gen');

    await service.generateVideo(
      buildUser(),
      baseDto({ model: BATCH_MODEL, outputs: 3 }),
      buildRequest(),
    );

    const externalIds = metadataService.patch.mock.calls.map(
      ([, entity]) => (entity as { externalId?: string }).externalId,
    );
    expect(externalIds).toContain('gen_0');
    expect(externalIds).toContain('gen_1');
    expect(externalIds).toContain('gen_2');
  });

  // Finding 6 — non-batch outputs are tracked before the call and fail on null.
  describe('non-batch multi-output (finding 6)', () => {
    it('tracks the placeholder before dispatch and cleans it up when the id is null', async () => {
      const { service, klingAIService, failedGenerationService } =
        createService();
      klingAIService.queueGenerateTextToVideo
        .mockResolvedValueOnce('kling-gen-0')
        .mockResolvedValueOnce(null);

      const error = await service
        .generateVideo(buildUser(), baseDto({ outputs: 2 }), buildRequest())
        .catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);

      const cleanedIds =
        failedGenerationService.handleFailedVideoGeneration.mock.calls.map(
          (call) => call[1],
        );
      // Both the first and the additional placeholder are torn down.
      expect(cleanedIds).toContain('ing-0');
      expect(cleanedIds).toContain('ing-1');
    });

    it('persists the real external id for additional non-batch outputs', async () => {
      const { service, klingAIService, metadataService } = createService();
      klingAIService.queueGenerateTextToVideo
        .mockResolvedValueOnce('kling-gen-0')
        .mockResolvedValueOnce('kling-gen-1');

      await service.generateVideo(
        buildUser(),
        baseDto({ outputs: 2 }),
        buildRequest(),
      );

      const externalIds = metadataService.patch.mock.calls.map(
        ([, entity]) => (entity as { externalId?: string }).externalId,
      );
      expect(externalIds).toContain('kling-gen-1');
      expect(externalIds).not.toContain('');
    });

    it('preserves every reference role on additional output lineage', async () => {
      const { ingredientsService, service, sharedService } = createService();
      ingredientsService.findOne.mockImplementation(
        ({ category, id }: { category: string; id: string }) =>
          Promise.resolve(
            category === IngredientCategory.IMAGE || id === 'video-reference-1'
              ? {
                  id,
                  ...(id === 'video-reference-1'
                    ? { metadata: { duration: 5 } }
                    : {}),
                }
              : null,
          ),
      );

      await service.generateVideo(
        buildUser(),
        baseDto({
          endFrame: 'end-frame-1',
          model: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
          outputs: 2,
          references: ['start-frame-1'],
          videoReferences: ['video-reference-1'],
        }),
        buildRequest(),
      );

      expect(sharedService.createMediaDocuments).toHaveBeenCalledTimes(2);
      for (const [, payload] of sharedService.createMediaDocuments.mock.calls) {
        expect(payload.sourceIds).toEqual([
          'start-frame-1',
          'end-frame-1',
          'video-reference-1',
        ]);
      }
    });
  });

  // Finding 7 — bust the shared video cache tag after the write.
  it('invalidates the video cache tag (finding 7)', async () => {
    const { service, cacheService } = createService();

    await service.generateVideo(buildUser(), baseDto(), buildRequest());

    expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['videos']);
  });

  // #3468 — model-aware video briefs: assemble + compile a canonical brief
  // for registered model families before provider dispatch, and persist a
  // redacted evidence/generation-source pair alongside every document.
  describe('video brief compilation (#3468)', () => {
    it('compiles a brief for a registered model family and persists redacted evidence', async () => {
      const { service, sharedService } = createService();

      await service.generateVideo(
        buildUser(),
        baseDto({ model: COMPILED_MODEL_MINIMAX }),
        buildRequest(),
      );

      const [, payload] = sharedService.createMediaDocuments.mock.calls[0];
      expect(payload.generationSource).toBe(buildMinimaxH3GenerationSource());
      expect(payload.providerData).toMatchObject({
        compilerId: 'minimax-h3-compiler',
        mediaKind: 'video',
        modelKey: COMPILED_MODEL_MINIMAX,
        profileId: 'minimax-h3-capability',
        status: 'compiled',
      });
      expect(payload.providerData).not.toHaveProperty('prompt');
      expect(payload.providerData).not.toHaveProperty('dispatch');
      expect(JSON.stringify(payload.providerData)).not.toMatch(/https?:\/\//);
    });

    it('compiles a brief for the PrunaAI P-Video family with its own evidence shape', async () => {
      const { service, sharedService } = createService();

      await service.generateVideo(
        buildUser(),
        baseDto({ model: COMPILED_MODEL_PRUNAAI }),
        buildRequest(),
      );

      const [, payload] = sharedService.createMediaDocuments.mock.calls[0];
      expect(payload.generationSource).toBe(
        buildPrunaaiPVideoGenerationSource(),
      );
      expect(payload.providerData).toMatchObject({
        compilerId: 'prunaai-p-video-compiler',
        mediaKind: 'video',
        modelKey: COMPILED_MODEL_PRUNAAI,
        profileId: 'prunaai-p-video-capability',
        status: 'compiled',
        surface: 'studio',
      });
    });

    it('bypasses brief compilation for a model without a registered compiler', async () => {
      const { service, sharedService } = createService();

      await service.generateVideo(
        buildUser(),
        baseDto({ model: 'unknown-provider/unknown-video' }),
        buildRequest(),
      );

      const [, payload] = sharedService.createMediaDocuments.mock.calls[0];
      expect(payload.generationSource).toBe(
        'generation-brief-exemption:unregistered_model',
      );
      expect(payload.providerData).toMatchObject({
        compilerId: null,
        profileId: null,
        reason: 'unregistered_model',
        status: 'exempted',
        surface: 'studio',
      });
    });

    it('resolves first-frame and last-frame references into the compiled provider dispatch', async () => {
      const { service, replicateService } = createService();

      await service.generateVideo(
        buildUser(),
        baseDto({
          endFrame: 'ref-end',
          model: COMPILED_MODEL_MINIMAX,
          references: ['ref-first'],
        }),
        buildRequest(),
      );

      expect(replicateService.generateTextToVideo).toHaveBeenCalledWith(
        COMPILED_MODEL_MINIMAX,
        expect.objectContaining({
          first_frame_image: `${REFERENCE_INGREDIENTS_ENDPOINT}/images/ref-first`,
          last_frame_image: `${REFERENCE_INGREDIENTS_ENDPOINT}/images/ref-end`,
        }),
      );
    });

    it('dispatches a tenant-scoped video reference through a provider-readable signed URL', async () => {
      const {
        filesClientService,
        ingredientsService,
        replicateService,
        service,
      } = createService();
      ingredientsService.findOne.mockResolvedValue({
        id: 'video-reference-1',
        metadata: { duration: 8 },
      });

      await service.generateVideo(
        buildUser(),
        baseDto({
          model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
          videoReferences: ['video-reference-1'],
        }),
        buildRequest(),
      );

      expect(filesClientService.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'video-reference-1',
        'videos',
      );
      expect(replicateService.generateTextToVideo).toHaveBeenCalledWith(
        MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        expect.objectContaining({
          reference_videos: [
            'https://s3.example.com/videos/video-reference-1?signed=true',
          ],
        }),
      );
    });

    it('records an omitted signal when Guided fidelity cannot honor a constraint', async () => {
      const { service, sharedService } = createService();

      await service.generateVideo(
        buildUser(),
        baseDto({
          blacklist: ['no watermark'],
          isBrandingEnabled: true,
          model: COMPILED_MODEL_MINIMAX,
        }),
        buildRequest(),
      );

      const [, payload] = sharedService.createMediaDocuments.mock.calls[0];
      expect(payload.providerData.fidelityMode).toBe('guided');
      expect(payload.providerData.omittedSignals).toEqual(
        expect.arrayContaining([
          {
            field: 'constraints.avoid',
            reason: 'MiniMax H3 has no native negative-prompt field.',
          },
        ]),
      );
    });

    // A Strict-fidelity brief can only be constructed today by calling the
    // compiler directly (see compile-minimax-h3-generation-brief.spec.ts /
    // compile-prunaai-p-video-generation-brief.spec.ts, both of which assert
    // GenerationBriefCompileError on an unsupported required signal) — no
    // CreateVideoDto field currently drives resolveVideoGenerationFidelityMode
    // to 'strict' (it only ever yields 'off' or 'guided'). That DTO-trigger
    // gap is shared with the parallel image-brief lane (#3467) and is
    // expected to close alongside the cross-surface wiring in #3469. Until
    // then, this test proves the reachable half of the ordering guarantee:
    // a compiled-dispatch reference that cannot be resolved to a source URL
    // blocks inside prepare() — before ensureDeferredCredits() is ever
    // reached — exactly the ordering Strict-fidelity blocking depends on.
    it('blocks before any credit-bearing dispatch when a required reference cannot be resolved', async () => {
      const {
        assetsService,
        creditsUtilsService,
        ingredientsService,
        service,
        sharedService,
      } = createService();
      ingredientsService.findOne.mockResolvedValue(null);
      assetsService.findOne.mockResolvedValue(null);

      const error = await service
        .generateVideo(
          buildUser(),
          baseDto({
            model: COMPILED_MODEL_MINIMAX,
            references: ['ref-missing'],
          }),
          buildRequest(),
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
      expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
    });

    it('does not change credit authorization for a compiled model versus an exempt one', async () => {
      const { service, creditsUtilsService } = createService();

      await service.generateVideo(
        buildUser(),
        baseDto({ model: COMPILED_MODEL_MINIMAX, resolution: '2K' }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      // MiniMax H3's published 2K default keeps the base reservation.
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 10);
    });

    // Security: the persisted snapshot is the only durable record of what was
    // dispatched, so it must independently pass the same redaction assertion
    // the compiler evidence itself is built from — not just the ad hoc
    // pattern checks above. toRedactedVideoGenerationBriefProviderData()
    // already throws before persistence if a forbidden key/value slips
    // through (see redact-generation-brief-evidence.ts); this test proves
    // the exact object handed to createMediaDocuments() still satisfies that
    // assertion end to end, for both the primary and an additional output.
    it('persists a provider-data snapshot that independently satisfies the shared redaction assertion', async () => {
      const { service, sharedService } = createService();

      await service.generateVideo(
        buildUser(),
        baseDto({
          model: COMPILED_MODEL_MINIMAX,
          outputs: 2,
          references: ['ref-first'],
        }),
        buildRequest(),
      );

      for (const call of sharedService.createMediaDocuments.mock.calls) {
        const [, payload] = call;
        expect(() =>
          assertRedactedVideoGenerationBriefEvidence(payload.providerData),
        ).not.toThrow();
      }
    });
  });

  describe('reference image tenant isolation (#3501)', () => {
    const sameTenantId = testId('reference', 1);
    const foreignId = testId('reference', 2);
    const deletedId = testId('reference', 3);
    const sameTenantUrl = `${REFERENCE_INGREDIENTS_ENDPOINT}/images/${sameTenantId}`;

    async function generateFalVideo(
      references: string[],
      rows: Array<{ id: string; isDeleted?: boolean; organizationId: string }>,
    ) {
      const created = createService();
      created.modelRegistrationService.validateModelForOrg.mockResolvedValue({
        endpoint: FAL_ENDPOINT,
        provider: ModelProvider.FAL,
      });
      mockTenantIngredients(created.ingredientsService, rows);
      await created.service.generateVideo(
        buildUser(),
        baseDto({ model: FAL_SELECTION_KEY, references }),
        buildRequest(),
      );
      return created;
    }

    it('dispatches a same-tenant reference URL to the provider', async () => {
      const { falService, ingredientsService, promptBuilderService } =
        await generateFalVideo(
          [sameTenantId],
          [
            { id: sameTenantId, organizationId: ORG },
            { id: foreignId, organizationId: FOREIGN_ORG },
          ],
        );

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sameTenantId,
          isDeleted: false,
          organizationId: ORG,
        }),
      );
      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ references: [sameTenantUrl] }),
        ORG,
      );
      expect(JSON.stringify(falService.generateVideo.mock.calls)).toContain(
        sameTenantUrl,
      );
    });

    it('does not dispatch a foreign-organization reference id to the provider', async () => {
      const { falService, ingredientsService, promptBuilderService } =
        await generateFalVideo(
          [foreignId],
          [
            { id: sameTenantId, organizationId: ORG },
            { id: foreignId, organizationId: FOREIGN_ORG },
          ],
        );

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: foreignId,
          isDeleted: false,
          organizationId: ORG,
        }),
      );
      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ references: [] }),
        ORG,
      );
      expect(falService.generateVideo).toHaveBeenCalled();
      expect(JSON.stringify(falService.generateVideo.mock.calls)).not.toContain(
        foreignId,
      );
    });

    it('does not dispatch a soft-deleted same-tenant reference id', async () => {
      const { falService, promptBuilderService } = await generateFalVideo(
        [deletedId],
        [{ id: deletedId, isDeleted: true, organizationId: ORG }],
      );

      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ references: [] }),
        ORG,
      );
      expect(falService.generateVideo).toHaveBeenCalled();
      expect(JSON.stringify(falService.generateVideo.mock.calls)).not.toContain(
        deletedId,
      );
    });
  });
});
