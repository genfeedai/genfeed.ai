vi.mock('@api/helpers/utils/reference/reference.util', () => ({
  buildReferenceImageUrls: vi.fn(),
}));

vi.mock('@server/helpers/utils/websocket/websocket.util', () => ({
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
import { BatchInterpolationController } from '@api/collections/videos/controllers/batch-interpolation.controller';
import type { BatchInterpolationDto } from '@api/collections/videos/dto/batch-interpolation.dto';
import { BatchInterpolationReferenceService } from '@api/collections/videos/services/batch-interpolation-reference.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { MODEL_KEYS } from '@genfeedai/constants';
import { IngredientFormat } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { AssetsService } from '@server/collections/assets/services/assets.service';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@server/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@server/collections/metadata/services/metadata.service';
import { ModelsService } from '@server/collections/models/services/models.service';
import { PromptsService } from '@server/collections/prompts/services/prompts.service';
import { VideosService } from '@server/collections/videos/services/videos.service';
import { FileQueueService } from '@server/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@server/services/prompt-builder/prompt-builder.service';
import { FailedGenerationService } from '@server/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@server/shared/services/shared/shared.service';
import type { Request } from 'express';

const mockBuildReferenceImageUrls = vi.mocked(buildReferenceImageUrls);

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

  let activitiesService: { create: ReturnType<typeof vi.fn> };
  let assetsService: { findOne: ReturnType<typeof vi.fn> };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let creditsUtilsService: {
    deductCreditsFromOrganization: ReturnType<typeof vi.fn>;
  };
  let failedGenerationService: {
    handleFailedVideoGeneration: ReturnType<typeof vi.fn>;
  };
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let modelsService: { findOne: ReturnType<typeof vi.fn> };
  let promptsService: { create: ReturnType<typeof vi.fn> };
  let promptBuilderService: { buildPrompt: ReturnType<typeof vi.fn> };
  let replicateService: { generateTextToVideo: ReturnType<typeof vi.fn> };
  let sharedService: { createMediaDocuments: ReturnType<typeof vi.fn> };
  let websocketService: {
    publishBackgroundTaskUpdate: ReturnType<typeof vi.fn>;
    publishVideoComplete: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    activitiesService = { create: vi.fn().mockResolvedValue(mockActivity) };
    assetsService = { findOne: vi.fn() };
    brandsService = { findOne: vi.fn().mockResolvedValue(mockBrand) };
    creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    };
    failedGenerationService = {
      handleFailedVideoGeneration: vi.fn().mockResolvedValue(undefined),
    };
    metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
    modelsService = { findOne: vi.fn().mockResolvedValue(mockModel) };
    promptsService = { create: vi.fn().mockResolvedValue(mockPrompt) };
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
        { provide: ActivitiesService, useValue: activitiesService },
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
        { provide: IngredientsService, useValue: { findOne: vi.fn() } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: MetadataService, useValue: metadataService },
        { provide: ModelsService, useValue: modelsService },
        { provide: PromptsService, useValue: promptsService },
        { provide: PromptBuilderService, useValue: promptBuilderService },
        {
          provide: ReplicateService,
          useValue: replicateService,
        },
        { provide: SharedService, useValue: sharedService },
        { provide: VideosService, useValue: { findOne: vi.fn() } },
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

        expect(result.jobs).toHaveLength(2);
        expect(result.jobs.every((job) => job.status === 'processing')).toBe(
          true,
        );
      });

      it('should deduct credits after successful generation', async () => {
        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);

        expect(
          creditsUtilsService.deductCreditsFromOrganization,
        ).toHaveBeenCalledWith(
          organizationId,
          userId,
          5,
          expect.stringContaining(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1),
          'video-generate',
        );
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

      it('should not skip credit deduction when model has zero cost', async () => {
        modelsService.findOne.mockResolvedValue({ ...mockModel, cost: 0 });

        await controller.createBatchInterpolation(mockReq, mockDto, mockUser);

        expect(
          creditsUtilsService.deductCreditsFromOrganization,
        ).not.toHaveBeenCalled();
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

        expect(result.jobs[0]).toMatchObject({
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

        expect(result.jobs[0]).toMatchObject({
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

        expect(result.jobs).toHaveLength(2);
        expect(result.jobs[0].status).toBe('failed');
        expect(result.jobs[1].status).toBe('processing');
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
