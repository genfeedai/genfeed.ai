import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicatePollQueueService } from '@api/queues/replicate-poll/replicate-poll-queue.service';

vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
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
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import type { VoteDocument } from '@api/collections/votes/schemas/vote.schema';
import { VotesService } from '@api/collections/votes/services/votes.service';
import type { RequestWithContext as ExpressRequest } from '@api/common/middleware/request-context.middleware';
import { ByokService } from '@api/services/byok/byok.service';
import { CacheService } from '@api/services/cache/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { KlingAIService } from '@api/services/integrations/klingai/services/klingai.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  IngredientCategory,
  IngredientStatus,
  ModelCategory,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, StreamableFile } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Response as ExpressResponse } from 'express';

describe('VideosController', () => {
  let controller: VideosController;
  let videosService: vi.Mocked<VideosService>;
  let brandsService: vi.Mocked<BrandsService>;
  let votesService: vi.Mocked<VotesService>;
  let filesClientService: vi.Mocked<FilesClientService>;
  let sharedService: vi.Mocked<SharedService>;
  let replicateService: vi.Mocked<ReplicateService>;
  let klingAIService: vi.Mocked<KlingAIService>;
  let routerService: vi.Mocked<RouterService>;
  let pollingService: vi.Mocked<IngredientCompletionService>;
  let activitiesService: vi.Mocked<ActivitiesService>;
  let websocketService: vi.Mocked<NotificationsPublisherService>;
  let metadataService: vi.Mocked<MetadataService>;
  let cacheService: vi.Mocked<CacheService>;
  let creditsUtilsService: vi.Mocked<CreditsUtilsService>;
  let failedGenerationService: vi.Mocked<FailedGenerationService>;
  let bookmarksService: vi.Mocked<BookmarksService>;

  const mockUserId = 'cmuser0000000000000000001';
  const mockOrgId = 'cmorganization000000000000001';
  const mockBrandId = 'cmbrand000000000000000001';
  const mockVideoId = 'cmvideo0000000000000000001';
  const mockMetadataId = 'cmmetadata0000000000000001';
  const mockPromptId = 'cmprompt000000000000000001';
  const mockActivityId = 'cmactivity00000000000000001';

  const mockUser = {
    id: 'authProvider_user_123',
    brandId: mockBrandId.toString(),
    organizationId: mockOrgId.toString(),
    userId: mockUserId.toString(),
  } as unknown as User;

  const mockVideo = {
    brandId: mockBrandId,
    category: IngredientCategory.VIDEO,
    id: mockVideoId,
    isDeleted: false,
    metadata: {
      duration: 10,
      height: 1080,
      id: mockMetadataId,
      width: 1920,
    },
    organizationId: mockOrgId,
    prompt: {
      id: mockPromptId,
      original: 'Test prompt',
    },
    status: IngredientStatus.GENERATED,
    toObject: vi.fn().mockReturnThis(),
    userId: mockUserId,
  };

  const mockBrand = {
    id: mockBrandId,
    agentConfig: {
      voice: {
        audience: ['tech professionals'],
        hashtags: ['#tech', '#innovation'],
        style: 'authoritative',
        taglines: ['Innovation at scale'],
        tone: 'professional',
        values: ['excellence'],
      },
    },
    defaultVideoModel: MODEL_KEYS.KLINGAI_V2,
    description: 'Test brand description',
    label: 'Test Brand',
    organizationId: mockOrgId,
    primaryColor: '#ff0000',
    secondaryColor: '#00ff00',
    text: 'Brand text',
  };

  const mockActivity = {
    id: mockActivityId,
    toString: () => mockActivityId.toString(),
  };

  const mockRequest = {
    originalUrl: '/api/videos',
    params: {},
    query: {},
    user: mockUser,
  } as unknown as ExpressRequest;

  const mockResponse = {
    set: vi.fn(),
  } as unknown as ExpressResponse;

  const mockSavedDocuments = {
    ingredientData: {
      id: mockVideoId,
      toString: () => mockVideoId.toString(),
    },
    metadataData: {
      id: mockMetadataId,
    },
  };

  const mockPromptBuilderResult = {
    input: {
      dimensions: '1920x1080',
      model: 'model-name',
      prompt: 'built prompt text',
      resolution: 'high',
      seconds: 10,
    },
    templateUsed: 'default',
    templateVersion: '1.0.0',
  };

  const mockModelData = {
    id: 'cmmodel0000000000000000001',
    category: ModelCategory.VIDEO,
    cost: 10,
    key: MODEL_KEYS.KLINGAI_V2,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    testingModule = await Test.createTestingModule({
      controllers: [VideosController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
          },
        },
        {
          provide: ActivitiesService,
          useValue: {
            create: vi.fn().mockResolvedValue(mockActivity),
          },
        },
        {
          provide: BrandsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(mockBrand),
          },
        },
        {
          provide: AssetsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: FilesClientService,
          useValue: {
            generateThumbnail: vi
              .fn()
              .mockResolvedValue('https://cdn.example.com/thumbnail.jpg'),
            uploadToS3: vi.fn(),
          },
        },
        {
          provide: BookmarksService,
          useValue: {
            addGeneratedIngredient: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ByokService,
          useValue: {
            isByokActiveForProvider: vi.fn().mockResolvedValue(false),
            isByokBillingInGoodStanding: vi.fn().mockResolvedValue(true),
          },
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000),
            reserveCredits: vi.fn().mockResolvedValue({
              id: 'video-controller-reservation',
            }),
          },
        },
        {
          provide: FailedGenerationService,
          useValue: {
            handleFailedVideoGeneration: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: IngredientGenerationCancellationService,
          useValue: {
            bindCancelOnAbort: vi.fn(),
            cancelProcessingIngredient: vi.fn(),
          },
        },
        {
          provide: IngredientCompletionService,
          useValue: {
            waitForMultipleIngredientsCompletion: vi.fn(),
          },
        },
        {
          provide: KlingAIService,
          useValue: {
            queueGenerateTextToVideo: vi
              .fn()
              .mockResolvedValue('kling-generation-id-123'),
          },
        },
        {
          provide: MembersService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            patch: vi.fn().mockResolvedValue({}),
            remove: vi.fn().mockResolvedValue({}),
            removeByIngredient: vi.fn().mockResolvedValue({}),
          },
        },
        {
          provide: ModelRegistrationService,
          useValue: {
            registerGeneratedOutput: vi.fn().mockResolvedValue(undefined),
            validateModelForOrg: vi.fn().mockResolvedValue(mockModelData),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(mockModelData),
          },
        },
        {
          provide: OrganizationSettingsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: PromptsService,
          useValue: {
            create: vi.fn().mockResolvedValue({
              id: mockPromptId,
              original: 'Test prompt',
            }),
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: PromptBuilderService,
          useValue: {
            buildPrompt: vi.fn().mockResolvedValue(mockPromptBuilderResult),
          },
        },
        {
          provide: ReplicateService,
          useValue: {
            generateTextToVideo: vi
              .fn()
              .mockResolvedValue('replicate-generation-id-123'),
          },
        },
        {
          provide: ReplicatePollQueueService,
          useValue: { schedule: vi.fn().mockResolvedValue('poll-job-1') },
        },
        {
          provide: SharedService,
          useValue: {
            createMediaDocuments: vi.fn().mockResolvedValue(mockSavedDocuments),
          },
        },
        {
          provide: VideosService,
          useValue: {
            findAll: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn().mockResolvedValue(mockVideo),
            remove: vi.fn(),
          },
        },
        {
          provide: VotesService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: CacheService,
          useValue: {
            invalidateByTags: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: RouterService,
          useValue: {
            getDefaultModel: vi.fn().mockResolvedValue(MODEL_KEYS.KLINGAI_V2),
            selectModel: vi.fn().mockResolvedValue({
              reason: 'Best model for video generation',
              selectedModel: MODEL_KEYS.KLINGAI_V2,
            }),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: {
            publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FalService,
          useValue: {
            generateVideo: vi
              .fn()
              .mockResolvedValue({ url: 'fal-generation-id-123' }),
          },
        },
        {
          provide: HiggsFieldService,
          useValue: {
            generateImageToVideo: vi
              .fn()
              .mockResolvedValue({ requestId: 'higgsfield-req-1' }),
            waitForCompletion: vi
              .fn()
              .mockResolvedValue({ videoUrl: 'https://cdn.test/video.mp4' }),
          },
        },
        {
          provide: VideoMusicOrchestrationService,
          useValue: {
            addMusicToVideo: vi.fn().mockResolvedValue(undefined),
          },
        },
        // VideoGenerationService is provided as a real class so NestJS DI
        // resolves its constructor dependencies from the mocked providers
        // above. This catches constructor-dependency regressions that the
        // previous `new VideoGenerationService(...)` pattern silently missed.
        FalVideoGenerationProviderAdapter,
        {
          inject: [HiggsFieldService],
          provide: HiggsFieldVideoGenerationProviderAdapter,
          useFactory: (higgsFieldService: HiggsFieldService) =>
            new HiggsFieldVideoGenerationProviderAdapter(higgsFieldService),
        },
        KlingAiVideoGenerationProviderAdapter,
        ReplicateVideoGenerationProviderAdapter,
        VideoGenerationCompletionService,
        VideoGenerationCreditsService,
        VideoGenerationExecutionService,
        VideoGenerationPreparationService,
        VideoGenerationProviderDispatchService,
        VideoGenerationService,
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
      .overrideGuard(ModelsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = testingModule.get(VideosController);
    videosService = testingModule.get(VideosService);
    brandsService = testingModule.get(BrandsService);
    votesService = testingModule.get(VotesService);
    filesClientService = testingModule.get(FilesClientService);
    sharedService = testingModule.get(SharedService);
    replicateService = testingModule.get(ReplicateService);
    klingAIService = testingModule.get(KlingAIService);
    routerService = testingModule.get(RouterService);
    pollingService = testingModule.get(IngredientCompletionService);
    activitiesService = testingModule.get(ActivitiesService);
    websocketService = testingModule.get(NotificationsPublisherService);
    metadataService = testingModule.get(MetadataService);
    cacheService = testingModule.get(CacheService);
    creditsUtilsService = testingModule.get(CreditsUtilsService);
    failedGenerationService = testingModule.get(FailedGenerationService);
    bookmarksService = testingModule.get(BookmarksService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll (latest=true shorthand)', () => {
    const latestQuery = {
      isDeleted: false,
      latest: true,
      limit: 10,
      page: 1,
      sort: 'createdAt: -1',
    } as unknown as VideosQueryDto;

    it('partitions the video-list cache by active organization and brand', () => {
      const cacheConfig = Reflect.getMetadata(
        'cache',
        VideosController.prototype.findAll,
      ) as {
        keyGenerator: (request: Record<string, unknown>) => string;
      };
      const buildKey = (organization: string, brand: string) =>
        cacheConfig.keyGenerator({
          query: { latest: 'true', limit: 10 },
          user: {
            brandId: brand,
            id: mockUser.id,
            organizationId: organization,
          },
        });

      expect(buildKey('org-a', 'brand-a')).not.toBe(
        buildKey('org-b', 'brand-b'),
      );
    });

    it('should short-circuit to the user-scoped latest aggregate', async () => {
      const mockData = { docs: [mockVideo], limit: 10, page: 1, totalDocs: 1 };
      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      const result = await controller.findAll(
        mockRequest,
        mockUser,
        latestQuery,
      );

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();

      const [aggregate, options] = videosService.findAll.mock.calls[0] as [
        {
          where: { AND: Array<Record<string, unknown>> };
          orderBy: Record<string, number>;
        },
        { limit: number; pagination: boolean },
      ];

      // pagination disabled, ordered newest-first
      expect(options).toMatchObject({ pagination: false });
      expect(aggregate.orderBy).toEqual({ createdAt: -1 });

      // Single user-scoped branch, training excluded, with no organization
      // OR-branch and no isDefault branch (unlike the list route).
      const branch = aggregate.where.AND[0];
      expect(branch).toMatchObject({
        brandId: mockUser.brandId,
        organizationId: mockUser.organizationId,
        trainingId: null,
        userId: mockUser.userId,
      });
      expect(branch).not.toHaveProperty('OR');
      expect(branch).not.toHaveProperty('status');
      expect(branch).not.toHaveProperty('organization');
    });

    it('should cap the latest limit at 50', async () => {
      videosService.findAll.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      } as unknown as AggregatePaginateResult<IngredientDocument>);

      await controller.findAll(mockRequest, mockUser, {
        ...latestQuery,
        limit: 100,
      } as unknown as VideosQueryDto);

      const options = videosService.findAll.mock.calls[0][1] as {
        limit: number;
      };
      expect(options.limit).toBe(50);
    });
  });

  describe('findAll', () => {
    const baseQuery: VideosQueryDto = {
      isDeleted: false,
      limit: 10,
      page: 1,
      sort: 'createdAt: -1',
    };

    it('should return paginated videos', async () => {
      const mockData = {
        docs: [mockVideo],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      const result = await controller.findAll(mockRequest, mockUser, baseQuery);

      expect(videosService.findAll).toHaveBeenCalled();
      const aggregate = videosService.findAll.mock.calls[0]?.[0] as {
        where: {
          AND: Array<{
            OR?: Array<Record<string, unknown>>;
            brandId?: unknown;
          }>;
        };
      };
      expect(aggregate.where.AND[0]).toEqual({
        organizationId: mockUser.organizationId,
      });
      expect(aggregate.where.AND[1]?.brandId).toBe(mockUser.brandId);
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should filter by search query', async () => {
      const query: VideosQueryDto = {
        ...baseQuery,
        search: 'sunset',
      };

      const mockData = {
        docs: [mockVideo],
        totalDocs: 1,
      };

      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      await controller.findAll(mockRequest, mockUser, query);

      const callArgs = videosService.findAll.mock.calls[0];
      const aggregate = callArgs[0] as unknown as {
        where?: {
          AND?: Array<{
            OR?: Array<{
              'metadata.label'?: {
                contains?: unknown;
              };
            }>;
          }>;
        };
      };
      const searchStage = aggregate.where?.AND?.find((condition) =>
        condition.OR?.some(
          (orCondition) => orCondition['metadata.label']?.contains,
        ),
      ) as
        | {
            OR?: Array<{
              'metadata.label'?: {
                contains?: unknown;
              };
            }>;
          }
        | undefined;

      expect(searchStage).toBeDefined();
      expect(searchStage?.OR?.[0]?.['metadata.label']?.contains).toBe('sunset');
    });

    it('should filter by status', async () => {
      const query: VideosQueryDto = {
        ...baseQuery,
        status: [IngredientStatus.GENERATED],
      };

      const mockData = {
        docs: [mockVideo],
        totalDocs: 1,
      };

      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      await controller.findAll(mockRequest, mockUser, query);

      expect(videosService.findAll).toHaveBeenCalled();
    });

    it('should filter by folder', async () => {
      const folderId = 'cmfolder000000000000000001';
      const query: VideosQueryDto = {
        ...baseQuery,
        folder: folderId as string,
      };

      const mockData = {
        docs: [mockVideo],
        totalDocs: 1,
      };

      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      await controller.findAll(mockRequest, mockUser, query);

      expect(videosService.findAll).toHaveBeenCalled();
    });

    it('should filter by brand', async () => {
      const query: VideosQueryDto = {
        ...baseQuery,
        brand: mockBrandId as string,
      };

      const mockData = {
        docs: [mockVideo],
        totalDocs: 1,
      };

      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      await controller.findAll(mockRequest, mockUser, query);

      expect(videosService.findAll).toHaveBeenCalled();
    });

    it('should handle sort parameter', async () => {
      const query: VideosQueryDto = {
        ...baseQuery,
        sort: '-createdAt',
      };

      const mockData = {
        docs: [mockVideo],
        totalDocs: 1,
      };

      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      await controller.findAll(mockRequest, mockUser, query);

      expect(videosService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    beforeEach(() => {
      videosService.findAll.mockResolvedValue({
        docs: [mockVideo],
      } as unknown as AggregatePaginateResult<IngredientDocument>);
      videosService.findOne.mockResolvedValue(
        mockVideo as unknown as IngredientDocument,
      );
    });

    it('partitions the video cache by active organization', () => {
      const cacheConfig = Reflect.getMetadata(
        'cache',
        VideosController.prototype.findOne,
      ) as {
        keyGenerator: (request: Record<string, unknown>) => string;
      };
      const buildKey = (organization: string) =>
        cacheConfig.keyGenerator({
          params: { videoId: mockVideoId.toString() },
          user: {
            id: mockUser.id,
            organizationId: organization,
          },
        });

      expect(buildKey('org-a')).not.toBe(buildKey('org-b'));
    });

    it('should return a single video', async () => {
      const result = await controller.findOne(
        mockRequest,
        mockVideoId.toString(),
        mockUser,
      );

      expect(videosService.findAll).toHaveBeenCalledWith(
        {
          where: {
            id: mockVideoId.toString(),
            category: 'VIDEO',
            isDeleted: false,
            organizationId: mockUser.organizationId,
          },
        },
        { pagination: false },
      );
      expect(videosService.findOne).toHaveBeenCalledWith(
        {
          id: mockVideoId.toString(),
          category: 'VIDEO',
          isDeleted: false,
          organizationId: mockUser.organizationId,
        },
        expect.any(Array),
      );
      expect(result).toBeDefined();
      expect(result.data).toMatchObject({ type: 'video' });
    });

    it('should include vote status', async () => {
      const mockVote = {
        entityId: mockVideoId,
        id: 'cmvote00000000000000000001',
        userId: mockUserId,
      };

      votesService.findOne.mockResolvedValue(
        mockVote as unknown as VoteDocument,
      );

      const result = await controller.findOne(
        mockRequest,
        mockVideoId.toString(),
        mockUser,
      );

      expect(votesService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return 404 when video not found', async () => {
      videosService.findAll.mockResolvedValue({
        docs: [],
      } as unknown as AggregatePaginateResult<IngredientDocument>);
      videosService.findOne.mockResolvedValue(null);

      const missingId = 'cmvideo0000000000000000002';

      await expect(
        controller.findOne(mockRequest, missingId, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should include evaluation data from aggregation', async () => {
      const mockVideoWithEvaluation = {
        ...mockVideo,
        evaluation: {
          id: 'cmevaluation000000000000001',
          score: 85,
          status: 'COMPLETED',
        },
      };

      videosService.findAll.mockResolvedValue({
        docs: [mockVideoWithEvaluation],
      } as unknown as AggregatePaginateResult<IngredientDocument>);
      videosService.findOne.mockResolvedValue(
        mockVideo as unknown as IngredientDocument,
      );

      const result = await controller.findOne(
        mockRequest,
        mockVideoId.toString(),
        mockUser,
      );

      expect(result).toBeDefined();
    });
  });

  describe('getThumbnail', () => {
    beforeEach(() => {
      videosService.findOne.mockResolvedValue(
        mockVideo as unknown as IngredientDocument,
      );
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        body: new ReadableStream(),
        ok: true,
      });
    });

    it('should generate and return thumbnail', async () => {
      const result = await controller.getThumbnail(
        mockVideoId.toString(),
        mockUser,
        mockResponse as never,
        10,
        1920,
      );

      expect(videosService.findOne).toHaveBeenCalled();
      expect(filesClientService.generateThumbnail).toHaveBeenCalledWith(
        expect.stringContaining(mockVideoId.toString()),
        mockVideoId.toString(),
        10,
        1920,
      );
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('should use default parameters if not provided', async () => {
      const result = await controller.getThumbnail(
        mockVideoId.toString(),
        mockUser,
        mockResponse as never,
      );

      expect(filesClientService.generateThumbnail).toHaveBeenCalledWith(
        expect.any(String),
        mockVideoId.toString(),
        undefined,
        undefined,
      );
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('should throw 404 when video not found', async () => {
      videosService.findOne.mockResolvedValue(null);

      await expect(
        controller.getThumbnail(
          mockVideoId.toString(),
          mockUser,
          mockResponse as never,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error when thumbnail download fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(
        controller.getThumbnail(
          mockVideoId.toString(),
          mockUser,
          mockResponse as never,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error when thumbnail generation fails', async () => {
      filesClientService.generateThumbnail.mockRejectedValue(
        new Error('Generation failed'),
      );

      await expect(
        controller.getThumbnail(
          mockVideoId.toString(),
          mockUser,
          mockResponse as never,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should remove a video', async () => {
      videosService.findOne.mockResolvedValue(
        mockVideo as unknown as IngredientDocument,
      );
      videosService.remove.mockResolvedValue(
        mockVideo as unknown as IngredientDocument,
      );

      const result = await controller.remove(
        mockRequest,
        mockVideoId.toString(),
        mockUser,
      );

      expect(videosService.findOne).toHaveBeenCalledWith({
        id: mockVideoId.toString(),
        organizationId: mockUser.organizationId,
        category: 'VIDEO',
        isDeleted: false,
      });
      expect(videosService.remove).toHaveBeenCalledWith(mockVideoId.toString());
      expect(metadataService.removeByIngredient).toHaveBeenCalledWith(
        mockVideoId.toString(),
        mockUser.organizationId,
      );
      expect(result).toBeDefined();
    });

    it('should return 404 when video not found', async () => {
      videosService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockVideoId.toString(), mockUser),
      ).rejects.toThrow(HttpException);
      expect(videosService.remove).not.toHaveBeenCalled();
    });

    it('should return 404 when remove returns null', async () => {
      videosService.findOne.mockResolvedValue(
        mockVideo as unknown as IngredientDocument,
      );
      videosService.remove.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockVideoId.toString(), mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should not remove metadata if video removal fails', async () => {
      videosService.findOne.mockResolvedValue(
        mockVideo as unknown as IngredientDocument,
      );
      videosService.remove.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockVideoId.toString(), mockUser),
      ).rejects.toThrow(HttpException);

      expect(metadataService.removeByIngredient).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const baseCreateDto: CreateVideoDto = {
      height: 1080,
      model: MODEL_KEYS.KLINGAI_V2,
      text: 'Generate a beautiful sunset video',
      width: 1920,
    };

    beforeEach(() => {
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandDocument,
      );
    });

    it('should create a video with KlingAI model', async () => {
      const result = await controller.create(
        mockRequest,
        baseCreateDto,
        mockUser,
      );

      expect(brandsService.findOne).toHaveBeenCalled();
      expect(sharedService.createMediaDocuments).toHaveBeenCalled();
      expect(klingAIService.queueGenerateTextToVideo).toHaveBeenCalled();
      expect(activitiesService.create).toHaveBeenCalled();
      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalled();
      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['videos']);
      expect(result).toBeDefined();
    });

    it('should create a video with Replicate model', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
      };

      await controller.create(mockRequest, dto, mockUser);

      expect(replicateService.generateTextToVideo).toHaveBeenCalled();
    });

    it('rejects Hailuo 2.3 Fast without first_frame_image before Replicate', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
      };

      let thrown: unknown;
      try {
        await controller.create(mockRequest, dto, mockUser);
      } catch (error: unknown) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(HttpException);
      const httpError = thrown as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(httpError.getResponse()).toEqual(
        expect.objectContaining({
          detail: expect.stringContaining('first-frame reference image'),
          title: 'Generation brief compilation failed',
        }),
      );
      expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
    });

    it('should throw error when prompt is missing', async () => {
      const dto: CreateVideoDto = {
        height: 1080,
        width: 1920,
      };

      await expect(
        controller.create(mockRequest, dto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error when brand not found', async () => {
      brandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.create(mockRequest, baseCreateDto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    // Credit deduction is owned by CreditsInterceptor (overridden in this spec).
    // The service no longer deducts directly; instead ensureDeferredCredits
    // authorizes the single amount the interceptor later deducts. These tests
    // assert that authorized amount via the deferred-credits availability check.
    const deferredRequest = () =>
      ({
        ...mockRequest,
        creditsConfig: { deferred: true },
      }) as unknown as ExpressRequest;

    it('authorizes the base credit amount for a successful generation', async () => {
      await controller.create(deferredRequest(), baseCreateDto, mockUser);

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledTimes(1);
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(mockOrgId.toString(), 10);
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
    });

    it('applies the selected model resolution band before authorization', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        model: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
        resolution: 'pro',
      };

      await controller.create(deferredRequest(), dto, mockUser);

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledTimes(1);
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(mockOrgId.toString(), 14);
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
    });

    it('multiplies the authorized amount by outputs for non-batch models', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        outputs: 3,
      };

      await controller.create(deferredRequest(), dto, mockUser);

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledTimes(1);
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith(mockOrgId.toString(), 30); // 10 * 3 outputs
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
    });

    it('should handle auto model selection', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        autoSelectModel: true,
        model: undefined,
      };

      await controller.create(mockRequest, dto, mockUser);

      expect(routerService.selectModel).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ModelCategory.VIDEO,
        }),
      );
    });

    it('should use brand default model when no model specified', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        model: undefined,
      };

      await controller.create(mockRequest, dto, mockUser);

      // Should use brand.defaultVideoModel (KLINGAI_V2 from mockBrand)
      expect(klingAIService.queueGenerateTextToVideo).toHaveBeenCalled();
    });

    it('should handle multiple outputs for non-batch models', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        outputs: 3,
      };

      await controller.create(mockRequest, dto, mockUser);

      // Should make multiple API calls for non-batch models
      expect(sharedService.createMediaDocuments).toHaveBeenCalledTimes(3);
      expect(klingAIService.queueGenerateTextToVideo).toHaveBeenCalledTimes(3);
    });

    // Regression: provider routing used to be duplicated across two divergent
    // switches, and the multi-output copy omitted FAL_KLING_VIDEO_V3_PRO,
    // FAL_VEO_3_1 and FAL_PIXVERSE_V6 — so additional outputs silently fell
    // through to Replicate. A single dispatch (isFalDestination-based) must now
    // route EVERY output of these models to FAL.
    it.each([
      MODEL_KEYS.FAL_VEO_3_1,
      MODEL_KEYS.FAL_KLING_VIDEO_V3_PRO,
      MODEL_KEYS.FAL_PIXVERSE_V6,
    ])('routes every multi-output %s request to FAL', async (model) => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        model,
        outputs: 3,
      };

      await controller.create(mockRequest, dto, mockUser);

      // Primary output + 2 additional outputs all dispatch to FAL.
      expect(testingModule.get(FalService).generateVideo).toHaveBeenCalledTimes(
        3,
      );
      expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
    });

    it('should link video to bookmark if provided', async () => {
      const bookmarkId = 'cmbookmark0000000000000001';
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        bookmark: bookmarkId.toString(),
      };

      await controller.create(mockRequest, dto, mockUser);

      expect(bookmarksService.addGeneratedIngredient).toHaveBeenCalledWith(
        bookmarkId.toString(),
        mockVideoId,
      );
    });

    it('should handle bookmark linking failure gracefully', async () => {
      const bookmarkId = 'cmbookmark0000000000000001';
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        bookmark: bookmarkId.toString(),
      };

      bookmarksService.addGeneratedIngredient.mockRejectedValue(
        new Error('Bookmark error'),
      );

      // Should not throw, just log warning
      const result = await controller.create(mockRequest, dto, mockUser);
      expect(result).toBeDefined();
    });

    it('should handle generation failure and cleanup', async () => {
      klingAIService.queueGenerateTextToVideo.mockRejectedValue(
        new Error('Generation failed'),
      );

      await expect(
        controller.create(mockRequest, baseCreateDto, mockUser),
      ).rejects.toThrow('Generation failed');

      expect(
        failedGenerationService.handleFailedVideoGeneration,
      ).toHaveBeenCalled();
    });

    it('should fail and clean up on a null generation ID', async () => {
      klingAIService.queueGenerateTextToVideo.mockResolvedValue(
        null as unknown as string,
      );

      // A generation that never started must fail the request so
      // CreditsInterceptor does not charge for it.
      const error = await controller
        .create(mockRequest, baseCreateDto, mockUser)
        .catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(
        failedGenerationService.handleFailedVideoGeneration,
      ).toHaveBeenCalled();
    });

    it('should wait for completion when waitForCompletion is true', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        waitForCompletion: true,
      };

      pollingService.waitForMultipleIngredientsCompletion.mockResolvedValue([
        mockVideo,
      ] as unknown as IngredientDocument[]);

      const result = await controller.create(mockRequest, dto, mockUser);

      expect(
        pollingService.waitForMultipleIngredientsCompletion,
      ).toHaveBeenCalledWith(
        expect.any(Array),
        600000,
        5000,
        expect.any(Array),
        expect.any(AbortSignal),
      );
      expect(result).toBeDefined();
    });

    it('should handle polling timeout', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        waitForCompletion: true,
      };

      const timeoutError = new PollTimeoutException('Polling timeout', 600_000);
      pollingService.waitForMultipleIngredientsCompletion.mockRejectedValue(
        timeoutError,
      );
      videosService.findOne.mockResolvedValue({
        ...mockVideo,
        status: IngredientStatus.PROCESSING,
      } as unknown as IngredientDocument);

      await expect(
        controller.create(mockRequest, dto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should use existing prompt when prompt ID is provided', async () => {
      const existingPrompt = {
        enhanced: 'Enhanced prompt text',
        id: mockPromptId,
        original: 'Original prompt text',
      };

      const promptsService = testingModule.get(PromptsService);
      (promptsService.findOne as vi.Mock).mockResolvedValue(existingPrompt);

      const dto: CreateVideoDto = {
        ...baseCreateDto,
        promptId: mockPromptId,
        text: undefined,
      };

      await controller.create(mockRequest, dto, mockUser);

      expect(promptsService.findOne).toHaveBeenCalledWith({
        id: mockPromptId.toString(),
        organizationId: mockOrgId.toString(),
      });
    });

    it('should handle reference images', async () => {
      const referenceId = 'cmimage0000000000000000001';
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        references: [referenceId],
      };
      const ingredientsService = testingModule.get(IngredientsService);
      (ingredientsService.findOne as vi.Mock).mockResolvedValue({
        id: referenceId,
      });

      await controller.create(mockRequest, dto, mockUser);

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          sourceIds: [referenceId],
        }),
      );
    });

    it('should handle endFrame for video interpolation', async () => {
      const endFrameId = 'cmimage0000000000000000002';
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        endFrame: endFrameId.toString(),
      };

      const ingredientsService = testingModule.get(IngredientsService);
      (ingredientsService.findOne as vi.Mock).mockResolvedValue({
        id: endFrameId,
      });

      await controller.create(mockRequest, dto, mockUser);

      expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          providerData: expect.objectContaining({
            referenceAssetIds: [endFrameId],
          }),
        }),
      );
    });

    it('should pass camera and lighting options', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        camera: 'dolly',
        cameraMovement: 'slow',
        lens: 'wide',
        lighting: 'natural',
      };

      await controller.create(mockRequest, dto, mockUser);

      expect(klingAIService.queueGenerateTextToVideo).toHaveBeenCalledWith(
        expect.stringMatching(/dolly.*wide.*natural.*slow/),
        expect.objectContaining({
          height: 1080,
          model: MODEL_KEYS.KLINGAI_V2,
          width: 1920,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      videosService.findAll.mockRejectedValue(new Error('Database error'));

      await expect(
        controller.findAll(mockRequest, mockUser, {
          isDeleted: false,
          limit: 10,
          page: 1,
          sort: 'createdAt: -1',
        }),
      ).rejects.toThrow('Database error');
    });

    it('should handle an invalid entity ID in findOne', async () => {
      videosService.findAll.mockRejectedValue(new Error('Invalid entity ID'));

      await expect(
        controller.findOne(mockRequest, 'invalid-id', mockUser),
      ).rejects.toThrow();
    });
  });
});

// Helper to get module for accessing providers
let testingModule: TestingModule;
beforeAll(async () => {
  testingModule = await Test.createTestingModule({
    controllers: [VideosController],
    providers: [
      {
        provide: ConfigService,
        useValue: { ingredientsEndpoint: 'https://cdn.genfeed.ai' },
      },
      { provide: ActivitiesService, useValue: { create: vi.fn() } },
      { provide: BrandsService, useValue: { findOne: vi.fn() } },
      { provide: AssetsService, useValue: { findOne: vi.fn() } },
      {
        provide: FilesClientService,
        useValue: { generateThumbnail: vi.fn(), uploadToS3: vi.fn() },
      },
      {
        provide: BookmarksService,
        useValue: { addGeneratedIngredient: vi.fn() },
      },
      {
        provide: CreditsUtilsService,
        useValue: { deductCreditsFromOrganization: vi.fn() },
      },
      {
        provide: FailedGenerationService,
        useValue: { handleFailedVideoGeneration: vi.fn() },
      },
      { provide: IngredientsService, useValue: { findOne: vi.fn() } },
      {
        provide: IngredientGenerationCancellationService,
        useValue: {
          bindCancelOnAbort: vi.fn(),
          cancelProcessingIngredient: vi.fn(),
        },
      },
      {
        provide: IngredientCompletionService,
        useValue: { waitForMultipleIngredientsCompletion: vi.fn() },
      },
      {
        provide: KlingAIService,
        useValue: { queueGenerateTextToVideo: vi.fn() },
      },
      { provide: MembersService, useValue: { findOne: vi.fn() } },
      {
        provide: LoggerService,
        useValue: {
          debug: vi.fn(),
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        },
      },
      {
        provide: MetadataService,
        useValue: { patch: vi.fn(), removeByIngredient: vi.fn() },
      },
      {
        provide: ModelRegistrationService,
        useValue: { registerGeneratedOutput: vi.fn() },
      },
      { provide: ModelsService, useValue: { findOne: vi.fn() } },
      {
        provide: OrganizationSettingsService,
        useValue: { findOne: vi.fn() },
      },
      {
        provide: PromptsService,
        useValue: { create: vi.fn(), findOne: vi.fn() },
      },
      { provide: PromptBuilderService, useValue: { buildPrompt: vi.fn() } },
      {
        provide: ReplicateService,
        useValue: { generateTextToVideo: vi.fn() },
      },
      {
        provide: ReplicatePollQueueService,
        useValue: { schedule: vi.fn().mockResolvedValue('poll-job-1') },
      },
      { provide: SharedService, useValue: { createMediaDocuments: vi.fn() } },
      {
        provide: VideosService,
        useValue: {
          findAll: vi.fn(),
          findOne: vi.fn(),
          patch: vi.fn(),
          remove: vi.fn(),
        },
      },
      { provide: VotesService, useValue: { findOne: vi.fn() } },
      { provide: CacheService, useValue: { invalidateByTags: vi.fn() } },
      {
        provide: RouterService,
        useValue: { getDefaultModel: vi.fn(), selectModel: vi.fn() },
      },
      {
        provide: NotificationsPublisherService,
        useValue: { publishBackgroundTaskUpdate: vi.fn() },
      },
      {
        provide: FalService,
        useValue: { generateTextToVideo: vi.fn() },
      },
      {
        provide: VideoMusicOrchestrationService,
        useValue: { addMusicToVideo: vi.fn() },
      },
      {
        provide: VideoGenerationService,
        useValue: { generateVideo: vi.fn() },
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
    .overrideGuard(ModelsGuard)
    .useValue({ canActivate: () => true })
    .overrideInterceptor(CreditsInterceptor)
    .useValue({
      intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
        next.handle(),
    })
    .compile();
});
