import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { BatchInterpolationBillingService } from '@api/collections/videos/services/batch-interpolation-billing.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';

vi.mock('@api/helpers/utils/reference/reference.util', () => ({
  buildReferenceImageUrls: vi.fn(),
}));

vi.mock('@api/helpers/utils/websocket/websocket.util', () => ({
  WebSocketPaths: {
    video: vi.fn((id: string) => `/ws/videos/${id}`),
  },
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { BatchInterpolationController } from '@api/collections/videos/controllers/batch-interpolation.controller';
import type { BatchInterpolationDto } from '@api/collections/videos/dto/batch-interpolation.dto';
import { BatchInterpolationReferenceService } from '@api/collections/videos/services/batch-interpolation-reference.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import type { CreditsGuardRequest } from '@api/helpers/guards/credits/credits.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ByokService } from '@api/services/byok/byok.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientFormat } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  billCreditsFromProviderCost,
  calculateVideoGenerationCredits,
} from '@genfeedai/pricing';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { type ExecutionContext, HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { firstValueFrom, from } from 'rxjs';

const mockBuildReferenceImageUrls = vi.mocked(buildReferenceImageUrls);

type BatchResponseFixture = {
  groupId: string;
  isMergeEnabled: boolean;
  jobs: { id: string; pairIndex: number; status: string }[];
  totalJobs: number;
};

// The serializer mock above returns the raw fixture instead of JSON:API data.
function readBatchResponseFixture(response: unknown): BatchResponseFixture {
  return response as BatchResponseFixture;
}

describe('BatchInterpolationController', () => {
  let controller: BatchInterpolationController;

  const mockReq = {} as Request;

  const brandId = testId('brand');
  const organizationId = testId('org');
  const userId = testId('user');
  const modelId = testId('model');
  const promptId = testId('prompt');
  const ingredientId = testId('ingredient');
  const metadataId = testId('metadata');
  const activityId = testId('activity');
  const startImageId1 = testId('image', 1);
  const endImageId1 = testId('image', 2);
  const startImageId2 = testId('image', 3);
  const endImageId2 = testId('image', 4);

  const mockUser = {
    id: 'user_authProvider_123',
    brandId,
    organizationId,
    userId,
  } as unknown as User;

  const mockModel = {
    category: 'video',
    cost: 5,
    hasInterpolation: true,
    id: modelId,
    key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
  };

  const mockBrand = {
    id: brandId,
    organization: organizationId,
  };

  const mockPrompt = { id: promptId };

  const mockIngredientData = {
    id: ingredientId,
  };

  const mockMetadataData = {
    id: metadataId,
  };

  const mockActivity = {
    id: activityId,
  };

  const mockPairs = [
    {
      endImageId: endImageId1,
      prompt: 'smooth pan',
      startImageId: startImageId1,
    },
  ];

  const mockDto: BatchInterpolationDto = {
    cameraPrompt: 'cinematic',
    duration: 5,
    format: IngredientFormat.LANDSCAPE,
    isMergeEnabled: false,
    modelKey: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
    pairs: mockPairs,
    useTemplate: false,
  };

  const transactions = { createTransactionEntry: vi.fn() };
  const generationBilling = {
    bindOutput: vi.fn(),
    releaseOutput: vi.fn(),
    rememberAcceptedOutput: vi.fn(),
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const byokService = { resolveApiKey: vi.fn() };
  const creditQueue = { queueDeduction: vi.fn(), queueByokUsage: vi.fn() };

  let activitiesService: { record: ReturnType<typeof vi.fn> };
  let assetsService: { findOne: ReturnType<typeof vi.fn> };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let creditsUtilsService: {
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
    deductCreditsFromOrganization: ReturnType<typeof vi.fn>;
    reserveCredits: ReturnType<typeof vi.fn>;
    settleReservation: ReturnType<typeof vi.fn>;
    releaseReservation: ReturnType<typeof vi.fn>;
  };
  let failedGenerationService: {
    handleFailedVideoGeneration: ReturnType<typeof vi.fn>;
  };
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let modelsService: { findOne: ReturnType<typeof vi.fn> };
  let promptsService: {
    create: ReturnType<typeof vi.fn>;
    patchOneWhere: ReturnType<typeof vi.fn>;
  };
  let patchOneWhere: ReturnType<typeof vi.fn>;
  let promptBuilderService: { buildPrompt: ReturnType<typeof vi.fn> };
  let replicateService: { generateTextToVideo: ReturnType<typeof vi.fn> };
  let ingredientsService: {
    findByIds: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let sharedService: { createMediaDocuments: ReturnType<typeof vi.fn> };
  let websocketService: {
    publishBackgroundTaskUpdate: ReturnType<typeof vi.fn>;
    publishVideoComplete: ReturnType<typeof vi.fn>;
  };

  let personas: PersonasService;

  beforeEach(async () => {
    personas = personasServiceStub();
    logger.error.mockReset();
    generationBilling.bindOutput.mockReset().mockResolvedValue(undefined);
    generationBilling.releaseOutput.mockReset().mockResolvedValue('released');
    generationBilling.rememberAcceptedOutput
      .mockReset()
      .mockResolvedValue(undefined);
    transactions.createTransactionEntry
      .mockReset()
      .mockResolvedValue(undefined);
    byokService.resolveApiKey
      .mockReset()
      .mockResolvedValue({ apiKey: 'org-replicate-key' });
    creditQueue.queueDeduction.mockReset().mockResolvedValue(undefined);
    creditQueue.queueByokUsage.mockReset().mockResolvedValue(undefined);
    activitiesService = { record: vi.fn().mockResolvedValue(mockActivity) };
    assetsService = { findOne: vi.fn() };
    brandsService = { findOne: vi.fn().mockResolvedValue(mockBrand) };
    creditsUtilsService = {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      reserveCredits: vi.fn().mockResolvedValue({ id: 'pair-reservation' }),
      settleReservation: vi.fn().mockResolvedValue(undefined),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
    };
    failedGenerationService = {
      handleFailedVideoGeneration: vi.fn().mockResolvedValue(undefined),
    };
    metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
    modelsService = { findOne: vi.fn().mockResolvedValue(mockModel) };
    promptsService = {
      create: vi.fn().mockResolvedValue(mockPrompt),
      patchOneWhere: vi.fn().mockResolvedValue(undefined),
    };
    patchOneWhere = vi.fn().mockResolvedValue(undefined);
    promptBuilderService = {
      buildPrompt: vi.fn().mockResolvedValue({
        input: { prompt: 'cinematic' },
        templateUsed: null,
        templateVersion: null,
      }),
    };
    replicateService = {
      generateTextToVideo: vi
        .fn()
        .mockResolvedValue('replicate-generation-id-123'),
    };
    ingredientsService = {
      findByIds: vi
        .fn()
        .mockResolvedValue([{ id: startImageId1 }, { id: endImageId1 }]),
      findOne: vi.fn(),
    };
    sharedService = {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: mockIngredientData,
        metadataData: mockMetadataData,
      }),
    };
    websocketService = {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
      publishVideoComplete: vi.fn().mockResolvedValue(undefined),
    };

    mockBuildReferenceImageUrls
      .mockResolvedValueOnce(['https://cdn.example.com/start.jpg'])
      .mockResolvedValueOnce(['https://cdn.example.com/end.jpg']);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchInterpolationController],
      providers: [
        BatchInterpolationBillingService,
        { provide: GenerationBillingService, useValue: generationBilling },
        { provide: CreditTransactionsService, useValue: transactions },
        { provide: ByokService, useValue: byokService },
        { provide: CreditDeductionQueueService, useValue: creditQueue },
        { provide: ActivityRecorderService, useValue: activitiesService },
        { provide: AssetsService, useValue: assetsService },
        BatchInterpolationReferenceService,
        { provide: BrandsService, useValue: brandsService },
        {
          provide: ConfigService,
          useValue: { get: vi.fn(), ingredientsEndpoint: 'http://localhost' },
        },
        {
          provide: CreditsUtilsService,
          useValue: creditsUtilsService,
        },
        {
          provide: FailedGenerationService,
          useValue: failedGenerationService,
        },
        { provide: FileQueueService, useValue: { processVideo: vi.fn() } },
        { provide: IngredientsService, useValue: ingredientsService },
        {
          provide: LoggerService,
          useValue: logger,
        },
        { provide: MetadataService, useValue: metadataService },
        { provide: ModelsService, useValue: modelsService },
        { provide: PersonasService, useValue: personas },
        { provide: PromptsService, useValue: promptsService },
        { provide: PromptBuilderService, useValue: promptBuilderService },
        {
          provide: ReplicateService,
          useValue: replicateService,
        },
        { provide: SharedService, useValue: sharedService },
        {
          provide: VideosService,
          useValue: { findOne: vi.fn(), patchOneWhere },
        },
        {
          provide: NotificationsPublisherService,
          useValue: websocketService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({ intercept: vi.fn() })
      .compile();

    controller = module.get<BatchInterpolationController>(
      BatchInterpolationController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createBatchInterpolation', () => {
    describe('happy path', () => {
      it.each([undefined, 9])(
        'reserves the provider-priced duration including default five seconds (%s)',
        async (duration) => {
          const model = {
            ...mockModel,
            cost: 0,
            pricingType: 'per-second',
            providerCostUsd: 0.1,
          };
          modelsService.findOne.mockResolvedValue(model);
          const dto = { ...mockDto, duration };
          await controller.createBatchInterpolation(mockReq, dto, mockUser);
          const amount = billCreditsFromProviderCost(model, {
            duration: duration ?? 5,
            width: 1280,
            height: 720,
          });
          expect(amount).toBeGreaterThan(0);
          expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
            expect.objectContaining({ amount }),
          );
          expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ duration: duration ?? 5 }),
            organizationId,
          );
        },
      );

      it.each([null, 0.1])(
        'prices normalized provider duration and resolution with provider USD %s',
        async (providerCostUsd) => {
          const model = {
            ...mockModel,
            cost: 0,
            costPerUnit: 10,
            pricingType: 'per-second',
            providerCostUsd,
          };
          modelsService.findOne.mockResolvedValue(model);
          promptBuilderService.buildPrompt.mockResolvedValue({
            input: {
              prompt: 'normalized',
              duration: 8,
              resolution: '1080p',
              width: 1920,
              height: 1080,
            },
          });
          await controller.createBatchInterpolation(
            mockReq,
            { ...mockDto, duration: 9 },
            mockUser,
          );
          const live = billCreditsFromProviderCost(model, {
            duration: 8,
            width: 1920,
            height: 1080,
          });
          const amount =
            live === null
              ? calculateVideoGenerationCredits({
                  pricing: model,
                  modelKey: model.key,
                  duration: 8,
                  width: 1920,
                  height: 1080,
                  resolution: '1080p',
                  isBatchSupported: false,
                  outputs: 1,
                }).credits
              : Math.ceil(live * 2);
          expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
            expect.objectContaining({ amount }),
          );
          expect(replicateService.generateTextToVideo).toHaveBeenCalledWith(
            mockDto.modelKey,
            expect.objectContaining({ duration: 8, resolution: '1080p' }),
            undefined,
          );
        },
      );

      it('uses catalog duration for fixed-frame per-second models', async () => {
        const model = {
          ...mockModel,
          cost: 0,
          costPerUnit: 10,
          pricingType: 'per-second',
          defaultDuration: 4,
        };
        modelsService.findOne.mockResolvedValue(model);
        promptBuilderService.buildPrompt.mockResolvedValue({
          input: { num_frames: 81, frames_per_second: 16 },
        });
        await controller.createBatchInterpolation(
          mockReq,
          { ...mockDto, duration: 9 },
          mockUser,
        );
        expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
          expect.objectContaining({ amount: 40 }),
        );
      });

      it.each([
        {
          name: 'fixed frames without catalog duration',
          input: { num_frames: 81 },
        },
        { name: 'negative duration', input: { duration: -1 } },
        {
          name: 'nonfinite duration',
          input: { duration: Number.POSITIVE_INFINITY },
        },
        { name: 'invalid width', input: { width: 0 } },
        { name: 'invalid height', input: { height: Number.NaN } },
      ])(
        'rejects $name before persisting processing records',
        async ({ input }) => {
          modelsService.findOne.mockResolvedValue({
            ...mockModel,
            pricingType: 'per-second',
            defaultDuration: null,
          });
          promptBuilderService.buildPrompt.mockResolvedValue({ input });
          const result = await controller.createBatchInterpolation(
            mockReq,
            mockDto,
            mockUser,
          );
          expect(readBatchResponseFixture(result).jobs[0]).toMatchObject({
            id: '',
            status: 'failed',
          });
          expect(promptsService.create).not.toHaveBeenCalled();
          expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
          expect(activitiesService.record).not.toHaveBeenCalled();
          expect(
            websocketService.publishBackgroundTaskUpdate,
          ).not.toHaveBeenCalled();
          expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
          expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
        },
      );

      it('does not dispatch unpriced fixed-frame per-second models', async () => {
        modelsService.findOne.mockResolvedValue({
          ...mockModel,
          pricingType: 'per-second',
          defaultDuration: null,
        });
        promptBuilderService.buildPrompt.mockResolvedValue({
          input: { num_frames: 81 },
        });
        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);
        expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
        expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
      });

      it('rejects unsupported BYOK providers without using platform billing', async () => {
        const req = {
          user: mockUser,
          creditsConfig: {
            amount: 5,
            description: 'Batch',
            isByokBypass: true,
            provider: 'fal',
          },
        } as CreditsGuardRequest;
        await expect(
          controller.createBatchInterpolation(req, mockDto, mockUser),
        ).rejects.toThrow('Replicate');
        expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
        expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
      });

      it('uses the organization BYOK key and links completion usage without GEN holds', async () => {
        const req = {
          user: mockUser,
          creditsConfig: {
            amount: 5,
            description: 'Batch',
            isByokBypass: true,
            provider: 'replicate',
          },
        } as CreditsGuardRequest;
        await controller.createBatchInterpolation(req, mockDto, mockUser);
        expect(byokService.resolveApiKey).toHaveBeenCalledWith(
          organizationId,
          'replicate',
        );
        expect(replicateService.generateTextToVideo).toHaveBeenCalledWith(
          mockDto.modelKey,
          expect.anything(),
          'org-replicate-key',
        );
        expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
        expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
        expect(generationBilling.bindOutput).toHaveBeenCalledWith(
          expect.objectContaining({
            user: mockUser,
            creditsConfig: expect.objectContaining({
              settlement: 'completion',
              isByokBypass: true,
            }),
          }),
          { credits: 5, ingredientId },
        );
        expect(creditQueue.queueByokUsage).not.toHaveBeenCalled();
      });

      it('rejects missing BYOK keys before provider dispatch', async () => {
        byokService.resolveApiKey.mockResolvedValue(undefined);
        const req = {
          user: mockUser,
          creditsConfig: {
            amount: 5,
            description: 'Batch',
            isByokBypass: true,
            provider: 'replicate',
          },
        } as CreditsGuardRequest;
        await expect(
          controller.createBatchInterpolation(req, mockDto, mockUser),
        ).rejects.toThrow();
        expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
      });

      it('should return jobs with processing status when generation succeeds', async () => {
        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );

        expect(result).toBeDefined();
        expect(result).toMatchObject({
          groupId: expect.any(String),
          isMergeEnabled: false,
          jobs: [
            expect.objectContaining({
              id: mockIngredientData.id.toString(),
              pairIndex: 0,
              status: 'processing',
            }),
          ],
          totalJobs: 1,
        });
      });

      it('scopes start and end frame resolution to the caller organization', async () => {
        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);

        expect(mockBuildReferenceImageUrls).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId,
            referenceIds: [startImageId1],
          }),
        );
        expect(mockBuildReferenceImageUrls).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId,
            referenceIds: [endImageId1],
          }),
        );
      });

      it('refuses a character frame the brand lost before credits or outputs', async () => {
        vi.mocked(personas.resolveCharacterReferences).mockRejectedValueOnce(
          new NotFoundException('Reference image'),
        );

        await expect(
          controller.createBatchInterpolation(mockReq, mockDto, mockUser),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(personas.resolveCharacterReferences).toHaveBeenCalledWith(
          expect.objectContaining({
            ingredientIds: [startImageId1, endImageId1],
            organizationId,
            path: 'video-interpolation',
          }),
        );
        expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
      });

      it('links each output to the character of its frames', async () => {
        vi.mocked(personas.resolveCharacterReferences).mockResolvedValueOnce({
          availableAvatarIds: new Set(),
          grantedAvatarOwners: new Map(),
          personaId: 'persona-1',
          personaIdByAssetId: new Map([[endImageId1, 'persona-1']]),
        });

        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);

        expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
          mockUser,
          expect.objectContaining({ personaId: 'persona-1' }),
        );
      });

      it('records the start and end frames as the output sources', async () => {
        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);

        expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
          mockUser,
          expect.objectContaining({
            sourceIds: [startImageId1, endImageId1],
          }),
        );
      });

      it('skips an Asset end frame instead of connecting it as a source, and still dispatches', async () => {
        // A logo or banner is an Asset, not an Ingredient: only the start
        // frame can be a `sources` connection.
        ingredientsService.findByIds.mockResolvedValueOnce([
          { id: startImageId1 },
        ]);

        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );

        expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
          mockUser,
          expect.objectContaining({ sourceIds: [startImageId1] }),
        );
        expect(readBatchResponseFixture(result).jobs[0]).toMatchObject({
          status: 'processing',
        });
        expect(replicateService.generateTextToVideo).toHaveBeenCalled();
      });

      it('should generate a fresh group ID for each storyboard batch', async () => {
        mockBuildReferenceImageUrls
          .mockReset()
          .mockResolvedValue(['https://cdn.example.com/frame.jpg']);

        const first = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );
        const second = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );

        expect(first.groupId).toEqual(expect.any(String));
        expect(second.groupId).toEqual(expect.any(String));
        expect(first.groupId).not.toBe(second.groupId);
      });

      it('should start all pair generations without waiting for earlier pairs to finish', async () => {
        const twoPairDto: BatchInterpolationDto = {
          ...mockDto,
          pairs: [
            {
              endImageId: endImageId1,
              startImageId: startImageId1,
            },
            {
              endImageId: endImageId2,
              startImageId: startImageId2,
            },
          ],
        };
        let resolveFirstGeneration!: (value: string) => void;
        let resolveSecondGeneration!: (value: string) => void;
        const firstGeneration = new Promise<string>((resolve) => {
          resolveFirstGeneration = resolve;
        });
        const secondGeneration = new Promise<string>((resolve) => {
          resolveSecondGeneration = resolve;
        });

        mockBuildReferenceImageUrls
          .mockReset()
          .mockResolvedValue(['https://cdn.example.com/frame.jpg']);
        replicateService.generateTextToVideo
          .mockReset()
          .mockImplementationOnce(() => firstGeneration)
          .mockImplementationOnce(() => secondGeneration);

        const batchPromise = controller.createBatchInterpolation(
          mockReq,
          twoPairDto,
          mockUser,
        );

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(replicateService.generateTextToVideo).toHaveBeenCalledTimes(2);

        resolveFirstGeneration('replicate-generation-id-1');
        resolveSecondGeneration('replicate-generation-id-2');

        const result = await batchPromise;

        expect(readBatchResponseFixture(result).jobs).toHaveLength(2);
        expect(
          readBatchResponseFixture(result).jobs.every(
            (job) => job.status === 'processing',
          ),
        ).toBe(true);
      });

      it('reserves each pair before dispatch and leaves the hold for completion', async () => {
        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);
        expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
          expect.objectContaining({
            actorUserId: mockUser.userId,
            amount: 5,
            organizationId,
            idempotencyKey: `interpolation:${ingredientId}`,
            workloadId: ingredientId,
          }),
        );
        expect(
          creditsUtilsService.reserveCredits.mock.invocationCallOrder[0],
        ).toBeLessThan(
          replicateService.generateTextToVideo.mock.invocationCallOrder[0],
        );
        expect(creditQueue.queueDeduction).not.toHaveBeenCalled();
        expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
          expect.objectContaining({
            workloadType: 'media-generation',
            metadata: { assetId: ingredientId },
          }),
        );
        expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
        expect(
          creditsUtilsService.deductCreditsFromOrganization,
        ).not.toHaveBeenCalled();
        expect(modelsService.findOne).toHaveBeenCalledTimes(1);
      });

      it('releases the initial hold and prevents interceptor double charging', async () => {
        const req = {
          user: mockUser,
          creditsConfig: {
            amount: 5,
            description: 'Batch',
            reservationId: 'outer-reservation',
          },
        } as CreditsGuardRequest;
        const result = await controller.createBatchInterpolation(
          req,
          mockDto,
          mockUser,
        );
        expect(
          creditsUtilsService.releaseReservation,
        ).toHaveBeenCalledExactlyOnceWith({
          organizationId,
          reservationId: 'outer-reservation',
        });
        expect(
          creditsUtilsService.releaseReservation.mock.invocationCallOrder[0],
        ).toBeLessThan(
          creditsUtilsService.reserveCredits.mock.invocationCallOrder[0],
        );
        expect(req.creditsConfig).toMatchObject({ amount: 0 });
        expect(req.creditsConfig?.reservationId).toBeUndefined();
        const queue = { queueDeduction: vi.fn() };
        const interceptor = new CreditsInterceptor(
          queue as unknown as ConstructorParameters<
            typeof CreditsInterceptor
          >[0],
          creditsUtilsService as unknown as CreditsUtilsService,
          { debug: vi.fn() } as unknown as LoggerService,
          { closeDispatch: vi.fn() } as never,
        );
        await interceptor.settle(req, result);
        expect(queue.queueDeduction).not.toHaveBeenCalled();
        expect(creditsUtilsService.releaseReservation).toHaveBeenCalledTimes(1);
      });

      it('releases the initial hold through the interceptor when validation fails', async () => {
        modelsService.findOne.mockResolvedValue(null);
        const req = {
          user: mockUser,
          creditsConfig: {
            amount: 5,
            description: 'Batch',
            reservationId: 'outer-reservation',
          },
        } as CreditsGuardRequest;
        const interceptor = new CreditsInterceptor(
          { queueDeduction: vi.fn() } as unknown as ConstructorParameters<
            typeof CreditsInterceptor
          >[0],
          creditsUtilsService as unknown as CreditsUtilsService,
          { debug: vi.fn(), error: vi.fn() } as unknown as LoggerService,
          { closeDispatch: vi.fn() } as never,
        );
        const context = {
          switchToHttp: () => ({ getRequest: () => req }),
        } as unknown as ExecutionContext;
        await expect(
          firstValueFrom(
            interceptor.intercept(context, {
              handle: () =>
                from(
                  controller.createBatchInterpolation(req, mockDto, mockUser),
                ),
            }),
          ),
        ).rejects.toBeInstanceOf(HttpException);
        expect(
          creditsUtilsService.releaseReservation,
        ).toHaveBeenCalledExactlyOnceWith({
          organizationId,
          reservationId: 'outer-reservation',
        });
        expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
        expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
      });

      it.each(['throw', 'null'])(
        'releases a pair reservation when provider returns %s',
        async (failure) => {
          if (failure === 'throw')
            replicateService.generateTextToVideo.mockRejectedValue(
              new Error('provider error'),
            );
          else replicateService.generateTextToVideo.mockResolvedValue(null);
          const result = await controller.createBatchInterpolation(
            mockReq,
            mockDto,
            mockUser,
          );
          expect(readBatchResponseFixture(result).jobs[0].status).toBe(
            'failed',
          );
          expect(
            creditsUtilsService.releaseReservation,
          ).toHaveBeenCalledExactlyOnceWith({
            organizationId,
            reservationId: 'pair-reservation',
          });
          expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
        },
      );

      it('marks known provider failure with its real id even when hold release fails', async () => {
        replicateService.generateTextToVideo.mockRejectedValue(
          new Error('provider rejected'),
        );
        creditsUtilsService.releaseReservation.mockRejectedValue(
          new Error('database unavailable'),
        );
        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );
        expect(readBatchResponseFixture(result).jobs[0]).toMatchObject({
          id: ingredientId,
          status: 'failed',
        });
        expect(
          failedGenerationService.handleFailedVideoGeneration,
        ).toHaveBeenCalled();
        expect(creditQueue.queueDeduction).not.toHaveBeenCalled();
        expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
      });

      it('does not dispatch a pair when its reservation is rejected', async () => {
        creditsUtilsService.reserveCredits.mockRejectedValue(
          new Error('insufficient credits'),
        );
        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );
        expect(readBatchResponseFixture(result).jobs[0].status).toBe('failed');
        expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
        expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalled();
      });

      it('keeps accepted generation queued and processing when immediate metadata fails', async () => {
        metadataService.patch.mockRejectedValue(
          new Error('metadata unavailable'),
        );
        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );
        expect(readBatchResponseFixture(result).jobs[0]).toMatchObject({
          id: ingredientId,
          status: 'processing',
        });
        expect(generationBilling.rememberAcceptedOutput).toHaveBeenCalledWith({
          ingredientId,
          externalId: 'replicate-generation-id-123',
          organizationId,
          userId: mockUser.userId,
        });
        expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
        expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalled();
      });

      it('keeps the hold pending without acceptance settlement when recovery is unavailable', async () => {
        metadataService.patch.mockRejectedValue(
          new Error('metadata unavailable'),
        );
        generationBilling.rememberAcceptedOutput.mockRejectedValue(
          new Error('queue unavailable'),
        );
        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );
        expect(readBatchResponseFixture(result).jobs[0]).toMatchObject({
          id: ingredientId,
          status: 'processing',
        });
        expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
        expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
          'Accepted interpolation evidence requires operator reconciliation',
          expect.any(Error),
          expect.objectContaining({
            ingredientId,
            organizationId,
            externalId: 'replicate-generation-id-123',
          }),
        );
      });

      it('keeps BYOK completion evidence without acceptance-time usage or GEN holds', async () => {
        const req = {
          user: mockUser,
          creditsConfig: {
            amount: 5,
            description: 'Batch',
            isByokBypass: true,
            provider: 'replicate',
          },
        } as CreditsGuardRequest;
        await controller.createBatchInterpolation(req, mockDto, mockUser);
        expect(generationBilling.bindOutput).toHaveBeenCalledWith(
          expect.objectContaining({ user: mockUser }),
          { credits: 5, ingredientId },
        );
        expect(transactions.createTransactionEntry).not.toHaveBeenCalled();
        expect(creditQueue.queueByokUsage).not.toHaveBeenCalled();
        expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
      });

      it('rejects negative duration before reserving or dispatching', async () => {
        await expect(
          controller.createBatchInterpolation(
            mockReq,
            { ...mockDto, duration: -1 },
            mockUser,
          ),
        ).rejects.toThrow('duration');
        expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
        expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
      });

      it('should publish a background task update after starting generation', async () => {
        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);

        expect(
          websocketService.publishBackgroundTaskUpdate,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            progress: 0,
            room: getUserRoomName(mockUser.id),
            status: 'processing',
            userId: mockUser.id,
          }),
        );
      });

      it('should update metadata with external generation ID', async () => {
        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);

        expect(metadataService.patch).toHaveBeenCalledWith(
          mockMetadataData.id.toString(),
          expect.objectContaining({
            externalId: 'replicate-generation-id-123',
          }),
        );
      });

      it('should handle loop mode by appending a loop-back pair', async () => {
        const loopDto: BatchInterpolationDto = {
          ...mockDto,
          isLoopMode: true,
          pairs: [
            {
              endImageId: endImageId1,
              startImageId: startImageId1,
            },
            {
              endImageId: endImageId2,
              startImageId: startImageId2,
            },
          ],
        };

        // Provide URLs for 3 pairs (2 original + 1 loop-back)
        mockBuildReferenceImageUrls
          .mockReset()
          .mockResolvedValue(['https://cdn.example.com/frame.jpg']);

        const result = await controller.createBatchInterpolation(
          mockReq,
          loopDto,
          mockUser,
        );

        // 2 pairs + 1 loop-back = 3 total
        expect(result.totalJobs).toBe(3);
      });

      it('skips credit reservations when model has zero cost', async () => {
        modelsService.findOne.mockResolvedValue({ ...mockModel, cost: 0 });

        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);

        expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
      });
    });

    describe('model not found', () => {
      it('should throw 404 when model does not exist', async () => {
        modelsService.findOne.mockResolvedValue(null);

        await expect(
          controller.createBatchInterpolation(mockReq, mockDto, mockUser),
        ).rejects.toThrow(HttpException);
      });

      it('should throw NOT_FOUND status when model is missing', async () => {
        modelsService.findOne.mockResolvedValue(null);

        try {
          await controller.createBatchInterpolation(mockReq, mockDto, mockUser);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          const httpErr = err as HttpException;
          expect(httpErr.getStatus()).toBe(404);
        }
      });
    });

    describe('model without interpolation support', () => {
      it('should throw 400 when model cannot interpolate between frames', async () => {
        modelsService.findOne.mockResolvedValue({
          ...mockModel,
          hasInterpolation: false,
        });

        try {
          await controller.createBatchInterpolation(mockReq, mockDto, mockUser);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          const httpErr = err as HttpException;
          expect(httpErr.getStatus()).toBe(400);
        }
      });
    });

    describe('brand not found', () => {
      it('should throw 403 when brand does not belong to org', async () => {
        brandsService.findOne.mockResolvedValue(null);

        try {
          await controller.createBatchInterpolation(mockReq, mockDto, mockUser);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          const httpErr = err as HttpException;
          expect(httpErr.getStatus()).toBe(403);
        }
      });
    });

    describe('generation failure', () => {
      it('should mark job as failed when replicate returns null', async () => {
        replicateService.generateTextToVideo.mockResolvedValue(null);

        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );

        expect(readBatchResponseFixture(result).jobs[0]).toMatchObject({
          pairIndex: 0,
          status: 'failed',
        });
      });

      it('should call failedGenerationService when generation returns null', async () => {
        replicateService.generateTextToVideo.mockResolvedValue(null);

        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);

        expect(
          failedGenerationService.handleFailedVideoGeneration,
        ).toHaveBeenCalled();
      });

      it('should mark pair as failed when frame URLs are missing', async () => {
        mockBuildReferenceImageUrls.mockReset().mockResolvedValue([]);

        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );

        expect(readBatchResponseFixture(result).jobs[0]).toMatchObject({
          id: '',
          pairIndex: 0,
          status: 'failed',
        });
      });

      it('should continue processing remaining pairs after one fails', async () => {
        const twoPairDto: BatchInterpolationDto = {
          ...mockDto,
          pairs: [
            {
              endImageId: endImageId1,
              startImageId: startImageId1,
            },
            {
              endImageId: endImageId2,
              startImageId: startImageId2,
            },
          ],
        };

        // First pair has no start URL → fails; second pair succeeds
        mockBuildReferenceImageUrls
          .mockReset()
          .mockResolvedValueOnce([]) // first pair start
          .mockResolvedValueOnce(['https://cdn.example.com/end1.jpg']) // first pair end
          .mockResolvedValueOnce(['https://cdn.example.com/start2.jpg']) // second pair start
          .mockResolvedValueOnce(['https://cdn.example.com/end2.jpg']); // second pair end

        const result = await controller.createBatchInterpolation(
          mockReq,
          twoPairDto,
          mockUser,
        );

        expect(readBatchResponseFixture(result).jobs).toHaveLength(2);
        expect(readBatchResponseFixture(result).jobs[0].status).toBe('failed');
        expect(readBatchResponseFixture(result).jobs[1].status).toBe(
          'processing',
        );
      });
    });

    describe('failed pair cleanup', () => {
      const failedActivity = expect.objectContaining({
        key: 'video-failed',
        organizationId,
      });

      async function expectPairCleanedUp(): Promise<void> {
        const [videosAdapter, failedId, , , , activityMetadata] =
          failedGenerationService.handleFailedVideoGeneration.mock.calls[0];
        expect(failedId).toBe(ingredientId);
        expect(activityMetadata).toEqual(failedActivity);
        expect(JSON.parse(activityMetadata.value).ingredientId).toBe(
          ingredientId,
        );
        await videosAdapter.patch(ingredientId, { status: 'FAILED' });
        expect(patchOneWhere).toHaveBeenCalledWith(
          { id: ingredientId, isDeleted: false, organizationId },
          { status: 'FAILED' },
        );
        expect(promptsService.patchOneWhere).toHaveBeenCalledWith(
          { id: promptId, isDeleted: false, organizationId },
          { status: 'FAILED' },
        );
      }

      it('fails prompt, ingredient and activity when the credit hold throws', async () => {
        creditsUtilsService.reserveCredits.mockRejectedValue(
          new Error('insufficient credits'),
        );

        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );

        expect(readBatchResponseFixture(result).jobs[0]).toMatchObject({
          id: ingredientId,
          pairIndex: 0,
          status: 'failed',
        });
        expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
        await expectPairCleanedUp();
      });

      it('fails prompt, ingredient and activity and releases the hold when dispatch throws', async () => {
        replicateService.generateTextToVideo.mockRejectedValue(
          new Error('provider down'),
        );

        const result = await controller.createBatchInterpolation(
          mockReq,
          mockDto,
          mockUser,
        );

        expect(readBatchResponseFixture(result).jobs[0]).toMatchObject({
          id: ingredientId,
          pairIndex: 0,
          status: 'failed',
        });
        expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
          organizationId,
          reservationId: 'pair-reservation',
        });
        await expectPairCleanedUp();
      });
      it('fails only the unfunded second pair, closing its activity with the real failure handler', async () => {
        const ingredientIds = [
          testId('ingredient', 1),
          testId('ingredient', 2),
        ];
        const promptIds = [testId('prompt', 1), testId('prompt', 2)];
        const activityIds = [testId('activity', 1), testId('activity', 2)];
        const processingActivities = new Map(
          ingredientIds.map((id, index) => [
            id,
            {
              id: activityIds[index],
              organizationId,
              userId: mockUser.id,
              value: JSON.stringify({ ingredientId: id }),
            },
          ]),
        );
        // Tenant enforcement: an unscoped lookup finds nothing.
        const findByActionValue = vi.fn(
          async (
            _action: string,
            ingredientIdValue: string,
            _userId: string,
            lookupOrganizationId?: string,
          ) =>
            lookupOrganizationId === organizationId
              ? (processingActivities.get(ingredientIdValue) ?? null)
              : null,
        );
        const recorder = { record: vi.fn(), update: vi.fn() };
        const realFailureHandler = new FailedGenerationService(
          { findByActionValue } as unknown as ActivitiesService,
          recorder as unknown as ActivityRecorderService,
          {
            emit: vi.fn(),
            publishMediaFailed: vi.fn().mockResolvedValue(undefined),
          } as unknown as NotificationsPublisherService,
        );
        failedGenerationService.handleFailedVideoGeneration.mockImplementation(
          (
            ...args: Parameters<
              FailedGenerationService['handleFailedVideoGeneration']
            >
          ) => realFailureHandler.handleFailedVideoGeneration(...args),
        );
        mockBuildReferenceImageUrls
          .mockReset()
          .mockResolvedValue(['https://cdn.example.com/frame.jpg']);
        promptsService.create.mockImplementation(
          async (entity: { original: string }) => ({
            id: entity.original === 'pair one' ? promptIds[0] : promptIds[1],
          }),
        );
        sharedService.createMediaDocuments.mockImplementation(
          async (_user: unknown, input: { groupIndex: number }) => ({
            ingredientData: { id: ingredientIds[input.groupIndex] },
            metadataData: mockMetadataData,
          }),
        );
        activitiesService.record.mockImplementation(
          async (input: { entityId: string }) =>
            processingActivities.get(input.entityId),
        );
        creditsUtilsService.reserveCredits.mockImplementation(
          async (input: { workloadId: string }) => {
            if (input.workloadId === ingredientIds[1]) {
              throw new Error('insufficient credits');
            }
            return { id: 'pair-reservation' };
          },
        );

        const result = await controller.createBatchInterpolation(
          mockReq,
          {
            ...mockDto,
            pairs: [
              {
                endImageId: endImageId1,
                prompt: 'pair one',
                startImageId: startImageId1,
              },
              {
                endImageId: endImageId2,
                prompt: 'pair two',
                startImageId: startImageId2,
              },
            ],
          },
          mockUser,
        );

        const jobs = readBatchResponseFixture(result).jobs;
        expect(jobs).toEqual([
          expect.objectContaining({
            id: ingredientIds[0],
            status: 'processing',
          }),
          expect.objectContaining({ id: ingredientIds[1], status: 'failed' }),
        ]);
        expect(patchOneWhere).toHaveBeenCalledTimes(1);
        expect(patchOneWhere).toHaveBeenCalledWith(
          { id: ingredientIds[1], isDeleted: false, organizationId },
          expect.objectContaining({ status: 'FAILED' }),
        );
        expect(promptsService.patchOneWhere).toHaveBeenCalledTimes(1);
        expect(promptsService.patchOneWhere).toHaveBeenCalledWith(
          { id: promptIds[1], isDeleted: false, organizationId },
          { status: 'FAILED' },
        );
        expect(recorder.update).toHaveBeenCalledTimes(1);
        expect(recorder.update).toHaveBeenCalledWith(
          processingActivities.get(ingredientIds[1]),
          expect.objectContaining({ key: 'video-failed' }),
        );
      });
    });

    describe('merge mode', () => {
      it('should return isMergeEnabled=true when dto requests merge', async () => {
        const mergeDto: BatchInterpolationDto = {
          ...mockDto,
          isMergeEnabled: true,
          pairs: [
            {
              endImageId: endImageId1,
              startImageId: startImageId1,
            },
            {
              endImageId: endImageId2,
              startImageId: startImageId2,
            },
          ],
        };

        mockBuildReferenceImageUrls
          .mockReset()
          .mockResolvedValue(['https://cdn.example.com/frame.jpg']);

        const result = await controller.createBatchInterpolation(
          mockReq,
          mergeDto,
          mockUser,
        );

        expect(result.isMergeEnabled).toBe(true);
      });
    });
  });
});
