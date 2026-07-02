import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import { MODEL_KEYS } from '@genfeedai/constants';
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
  const RESOLVED_BRAND = 'brand-resolved';
  const BATCH_MODEL = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5;
  const NON_BATCH_MODEL = MODEL_KEYS.KLINGAI_V2;

  const buildUser = (organization: string = ORG): User =>
    ({
      id: 'auth-user-1',
      publicMetadata: {
        brand: 'brand-from-token',
        organization,
        user: 'user-1',
      },
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
      saveDocuments: vi.fn().mockImplementation(() => {
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
        organization: ORG,
        primaryColor: '#fff',
        secondaryColor: '#000',
        text: 'text',
      }),
    };
    const organizationSettingsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const modelRegistrationService = {
      validateModelForOrg: vi.fn().mockResolvedValue(undefined),
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
    const falService = { generateVideo: vi.fn() };
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
    const assetsService = {};
    const ingredientsService = {};
    const configService = {};
    const loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const service = new VideoGenerationService(
      configService as never,
      activitiesService as never,
      brandsService as never,
      assetsService as never,
      bookmarksService as never,
      creditsUtilsService as never,
      falService as never,
      failedGenerationService as never,
      ingredientsService as never,
      pollingService as never,
      klingAIService as never,
      loggerService,
      metadataService as never,
      modelRegistrationService as never,
      modelsService as never,
      organizationSettingsService as never,
      promptsService as never,
      promptBuilderService as never,
      replicateService as never,
      sharedService as never,
      videoMusicOrchestrationService as never,
      videosService as never,
      cacheService as never,
      routerService as never,
      websocketService as never,
    );

    return {
      brandsService,
      cacheService,
      creditsUtilsService,
      failedGenerationService,
      klingAIService,
      metadataService,
      modelRegistrationService,
      promptsService,
      replicateService,
      service,
    };
  };

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
        baseDto({ prompt: 'prompt-id' }),
        buildRequest(),
      );

      expect(promptsService.findOne).toHaveBeenCalledWith({
        _id: 'prompt-id',
        isDeleted: false,
        organization: ORG,
      });
    });

    it('throws 404 and does not dispatch when the referenced prompt is missing', async () => {
      const { service, promptsService, klingAIService } = createService();
      promptsService.findOne.mockResolvedValue(null);

      const error = await service
        .generateVideo(
          buildUser(),
          baseDto({ prompt: 'missing-id' }),
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
        baseDto({ prompt: 'prompt-id' }),
        buildRequest(),
      );

      expect(promptsService.findOne).toHaveBeenCalledWith({
        _id: 'prompt-id',
        isDeleted: false,
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
      expect.objectContaining({ brand: RESOLVED_BRAND }),
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
        baseDto({ outputs: 2, resolution: 'high' }),
        buildRequest({ creditsConfig: { deferred: true } }),
      );

      // base 10 x2 (high res) x2 (two non-batch outputs) = 40
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(ORG, 40);
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
  });

  // Finding 7 — bust the shared video cache tag after the write.
  it('invalidates the video cache tag (finding 7)', async () => {
    const { service, cacheService } = createService();

    await service.generateVideo(buildUser(), baseDto(), buildRequest());

    expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['videos']);
  });
});
