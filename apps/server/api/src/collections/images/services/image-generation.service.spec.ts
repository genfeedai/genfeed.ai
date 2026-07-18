import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import { MODEL_KEYS } from '@genfeedai/constants';
import { LoggerService } from '@libs/logger/logger.service';
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
const RESOLVED_BRAND = 'brand-resolved';

// REPLICATE_BYTEDANCE_SEEDREAM_5_LITE / _4_5 and REPLICATE_FAST_FLUX_TRAINER are
// the batch-capable IMAGE models in MODEL_OUTPUT_CAPABILITIES; everything else is
// non-batch. Use the `seedream-5-lite` key (no dot) so classifyProvider's
// owner/model regex resolves it to the Replicate provider.
const BATCH_MODEL = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_LITE;
const NON_BATCH_REPLICATE_MODEL = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
const FAL_MODEL = MODEL_KEYS.FAL_NANO_BANANA_2;
const SINGLE_OUTPUT_MODEL = MODEL_KEYS.LEONARDOAI;

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
      id: RESOLVED_BRAND,
      description: 'desc',
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
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000),
  };
  const promptsService = {
    create: vi.fn().mockResolvedValue({ id: 'prompt-doc', original: 'built' }),
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
  const replicateService = {
    generateTextToImage: vi.fn().mockResolvedValue('rep-gen'),
  };
  const metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
  const imagesService = {
    findOne: vi.fn().mockResolvedValue({ _id: 'ing-0', status: 'completed' }),
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
    selectModel: vi.fn(),
  };
  const pollingService = {
    waitForMultipleIngredientsCompletion: vi
      .fn()
      .mockResolvedValue([{ _id: 'ing-0', status: 'completed' }]),
    waitForIngredientCompletion: vi
      .fn()
      .mockResolvedValue({ _id: 'ing-0', status: 'completed' }),
  };
  const filesClientService = { uploadToS3: vi.fn() };
  const assetsService = {};
  const ingredientsService = {};
  const configService = {};
  const loggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const providerDispatchService = new ImageGenerationProviderDispatchService(
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

  const service = new ImageGenerationService(
    configService as never,
    assetsService as never,
    brandsService as never,
    creditsUtilsService as never,
    pollingService as never,
    providerDispatchService,
    imagesService as never,
    ingredientsService as never,
    organizationSettingsService as never,
    loggerService,
    modelRegistrationService as never,
    modelsService as never,
    promptBuilderService as never,
    promptsService as never,
    routerService as never,
    sharedService as never,
  );

  return {
    creditsUtilsService,
    failedGenerationService,
    falService,
    metadataService,
    promptBuilderService,
    replicateService,
    service,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImageGenerationService', () => {
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
      const { service, promptBuilderService, replicateService } =
        createService();

      await service.generateImage(
        buildUser(),
        baseDto({
          model: NON_BATCH_REPLICATE_MODEL,
          outputs: 3,
          waitForCompletion: true,
        }),
        buildRequest(),
      );

      // The dispatch-time buildPrompt (last call) must request a single output;
      // the N images come from N separate provider calls.
      const dispatchCall = promptBuilderService.buildPrompt.mock.calls.at(-1);
      expect(
        (dispatchCall?.[1] as { outputs?: number } | undefined)?.outputs,
      ).toBe(1);
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

      await service.generateImage(
        buildUser(),
        baseDto({ model: BATCH_MODEL, outputs: 3, waitForCompletion: true }),
        buildRequest(),
      );

      const dispatchCall = promptBuilderService.buildPrompt.mock.calls.at(-1);
      expect(
        (dispatchCall?.[1] as { outputs?: number } | undefined)?.outputs,
      ).toBe(3);
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
});
