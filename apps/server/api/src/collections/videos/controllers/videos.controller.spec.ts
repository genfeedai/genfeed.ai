import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';

vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import type { VoteDocument } from '@api/collections/votes/schemas/vote.schema';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { ConfigService } from '@api/config/config.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { KlingAIService } from '@api/services/integrations/klingai/klingai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  IngredientCategory,
  IngredientStatus,
  ModelCategory,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, StreamableFile } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { Types } from 'mongoose';

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
  let pollingService: vi.Mocked<PollingService>;
  let activitiesService: vi.Mocked<ActivitiesService>;
  let websocketService: vi.Mocked<NotificationsPublisherService>;
  let metadataService: vi.Mocked<MetadataService>;
  let cacheService: vi.Mocked<CacheService>;
  let creditsUtilsService: vi.Mocked<CreditsUtilsService>;
  let failedGenerationService: vi.Mocked<FailedGenerationService>;
  let bookmarksService: vi.Mocked<BookmarksService>;

  const mockUserId = new Types.ObjectId();
  const mockOrgId = new Types.ObjectId();
  const mockBrandId = new Types.ObjectId();
  const mockVideoId = new Types.ObjectId();
  const mockMetadataId = new Types.ObjectId();
  const mockPromptId = new Types.ObjectId();
  const mockActivityId = new Types.ObjectId();

  const mockUser = {
    id: 'clerk_user_123',
    publicMetadata: {
      brand: mockBrandId.toString(),
      organization: mockOrgId.toString(),
      user: mockUserId.toString(),
    },
  } as unknown as User;

  const mockVideo = {
    _id: mockVideoId,
    brand: mockBrandId,
    category: IngredientCategory.VIDEO,
    isDeleted: false,
    metadata: {
      _id: mockMetadataId,
      duration: 10,
      height: 1080,
      width: 1920,
    },
    organization: mockOrgId,
    prompt: {
      _id: mockPromptId,
      original: 'Test prompt',
    },
    status: IngredientStatus.GENERATED,
    toObject: vi.fn().mockReturnThis(),
    user: mockUserId,
  };

  const mockBrand = {
    _id: mockBrandId,
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
    organization: mockOrgId,
    primaryColor: '#ff0000',
    secondaryColor: '#00ff00',
    text: 'Brand text',
  };

  const mockActivity = {
    _id: mockActivityId,
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
      _id: mockVideoId,
      toString: () => mockVideoId.toString(),
    },
    metadataData: {
      _id: mockMetadataId,
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
    _id: new Types.ObjectId(),
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
          provide: CreditsUtilsService,
          useValue: {
            deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
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
          provide: PollingService,
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
              _id: mockPromptId,
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
          provide: SharedService,
          useValue: {
            saveDocuments: vi.fn().mockResolvedValue(mockSavedDocuments),
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
          provide: VideoMusicOrchestrationService,
          useValue: {
            addMusicToVideo: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    })
      .overrideGuard(ClerkGuard)
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

    controller = new VideosController(
      testingModule.get(ConfigService),
      testingModule.get(ActivitiesService),
      testingModule.get(BrandsService),
      testingModule.get(AssetsService),
      testingModule.get(FilesClientService),
      testingModule.get(BookmarksService),
      testingModule.get(CreditsUtilsService),
      testingModule.get(FalService),
      testingModule.get(FailedGenerationService),
      testingModule.get(IngredientsService),
      testingModule.get(PollingService),
      testingModule.get(KlingAIService),
      testingModule.get(LoggerService),
      testingModule.get(MetadataService),
      testingModule.get(ModelsService),
      testingModule.get(OrganizationSettingsService),
      testingModule.get(PromptsService),
      testingModule.get(PromptBuilderService),
      testingModule.get(ReplicateService),
      testingModule.get(SharedService),
      testingModule.get(VideoMusicOrchestrationService),
      testingModule.get(VideosService),
      testingModule.get(VotesService),
      testingModule.get(CacheService),
      testingModule.get(RouterService),
      testingModule.get(NotificationsPublisherService),
    );
    videosService = testingModule.get(VideosService);
    brandsService = testingModule.get(BrandsService);
    votesService = testingModule.get(VotesService);
    filesClientService = testingModule.get(FilesClientService);
    sharedService = testingModule.get(SharedService);
    replicateService = testingModule.get(ReplicateService);
    klingAIService = testingModule.get(KlingAIService);
    routerService = testingModule.get(RouterService);
    pollingService = testingModule.get(PollingService);
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

  describe('findLatest', () => {
    it('should return latest videos', async () => {
      const mockData = {
        docs: [mockVideo],
        limit: 10,
        page: 1,
        totalDocs: 1,
      };

      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      const result = await controller.findLatest(mockRequest, mockUser, 10);

      expect(videosService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should limit results to maximum of 50', async () => {
      const mockData = {
        docs: [],
        totalDocs: 0,
      };

      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      await controller.findLatest(mockRequest, mockUser, 100);

      const callArgs = videosService.findAll.mock.calls[0];
      const aggregate = callArgs[0] as unknown as Array<
        Record<string, unknown>
      >;
      const limitStage = aggregate.find(
        (stage: Record<string, unknown>) => stage.$limit,
      ) as { $limit: number } | undefined;

      expect(limitStage?.$limit).toBe(50);
    });

    it('should use default limit of 10 if not provided', async () => {
      const mockData = {
        docs: [],
        totalDocs: 0,
      };

      videosService.findAll.mockResolvedValue(
        mockData as unknown as AggregatePaginateResult<IngredientDocument>,
      );

      await controller.findLatest(
        mockRequest,
        mockUser,
        undefined as unknown as number,
      );

      expect(videosService.findAll).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const baseQuery: VideosQueryDto = {
      isDeleted: false,
      limit: 10,
      page: 1,
      pagination: true,
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
      const aggregate = callArgs[0] as unknown as Array<{
        $match?: {
          $or?: Array<{
            'metadata.label'?: {
              $regex?: unknown;
            };
          }>;
        };
      }>;
      const searchStage = aggregate.find((stage) =>
        stage.$match?.$or?.some(
          (condition) => condition['metadata.label']?.$regex,
        ),
      );

      expect(searchStage).toBeDefined();
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
      const folderId = new Types.ObjectId();
      const query: VideosQueryDto = {
        ...baseQuery,
        folder: folderId as Types.ObjectId,
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
        brand: mockBrandId as Types.ObjectId,
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

    it('should return a single video', async () => {
      const result = await controller.findOne(
        mockRequest,
        mockVideoId.toString(),
        mockUser,
      );

      expect(videosService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should include vote status', async () => {
      const mockVote = {
        _id: new Types.ObjectId(),
        entity: mockVideoId,
        user: mockUserId,
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

      const missingId = new Types.ObjectId().toString();

      await expect(
        controller.findOne(mockRequest, missingId, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should include evaluation data from aggregation', async () => {
      const mockVideoWithEvaluation = {
        ...mockVideo,
        evaluation: {
          _id: new Types.ObjectId(),
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

      expect(videosService.findOne).toHaveBeenCalled();
      expect(videosService.remove).toHaveBeenCalledWith(mockVideoId.toString());
      expect(metadataService.remove).toHaveBeenCalledWith(
        mockVideoId.toString(),
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

      expect(metadataService.remove).not.toHaveBeenCalled();
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
      expect(sharedService.saveDocuments).toHaveBeenCalled();
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

    it('should deduct credits after successful generation', async () => {
      await controller.create(mockRequest, baseCreateDto, mockUser);

      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        mockOrgId.toString(),
        mockUserId.toString(),
        expect.any(Number),
        expect.stringContaining('Video generation'),
        expect.any(String),
      );
    });

    it('should double credits for high resolution', async () => {
      const mockBuilderResult = {
        ...mockPromptBuilderResult,
        input: {
          ...mockPromptBuilderResult.input,
          resolution: 'high',
        },
      };
      (
        testingModule.get(PromptBuilderService).buildPrompt as vi.Mock
      ).mockResolvedValue(mockBuilderResult);

      await controller.create(mockRequest, baseCreateDto, mockUser);

      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        20, // 10 * 2 for high resolution
        expect.stringContaining('high resolution'),
        expect.any(String),
      );
    });

    it('should multiply credits by outputs count', async () => {
      const mockBuilderResult = {
        ...mockPromptBuilderResult,
        input: {
          ...mockPromptBuilderResult.input,
          resolution: 'standard',
        },
      };
      (
        testingModule.get(PromptBuilderService).buildPrompt as vi.Mock
      ).mockResolvedValueOnce(mockBuilderResult);

      const dto: CreateVideoDto = {
        ...baseCreateDto,
        outputs: 3,
      };

      await controller.create(mockRequest, dto, mockUser);

      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        30, // 10 * 3 outputs
        expect.stringContaining('3 outputs'),
        expect.any(String),
      );
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
      expect(sharedService.saveDocuments).toHaveBeenCalledTimes(3);
      expect(klingAIService.queueGenerateTextToVideo).toHaveBeenCalledTimes(3);
    });

    it('should link video to bookmark if provided', async () => {
      const bookmarkId = new Types.ObjectId();
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
      const bookmarkId = new Types.ObjectId();
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

    it('should handle null generation ID', async () => {
      klingAIService.queueGenerateTextToVideo.mockResolvedValue(
        null as unknown as string,
      );

      await controller.create(mockRequest, baseCreateDto, mockUser);

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
      );
      expect(result).toBeDefined();
    });

    it('should handle polling timeout', async () => {
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        waitForCompletion: true,
      };

      const timeoutError = new Error('Polling timeout');
      (timeoutError as unknown as Record<string, unknown>).name =
        'PollingTimeoutError';
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
        _id: mockPromptId,
        enhanced: 'Enhanced prompt text',
        original: 'Original prompt text',
      };

      const promptsService = testingModule.get(PromptsService);
      (promptsService.findOne as vi.Mock).mockResolvedValue(existingPrompt);

      const dto: CreateVideoDto = {
        ...baseCreateDto,
        prompt: mockPromptId,
        text: undefined,
      };

      await controller.create(mockRequest, dto, mockUser);

      expect(promptsService.findOne).toHaveBeenCalledWith({
        _id: mockPromptId.toString(),
        isDeleted: false,
      });
    });

    it('should handle reference images', async () => {
      const referenceId = new Types.ObjectId();
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        references: [referenceId],
      };

      await controller.create(mockRequest, dto, mockUser);

      expect(sharedService.saveDocuments).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          references: [expect.any(Types.ObjectId)],
        }),
      );
    });

    it('should handle endFrame for video interpolation', async () => {
      const endFrameId = new Types.ObjectId();
      const dto: CreateVideoDto = {
        ...baseCreateDto,
        endFrame: endFrameId.toString(),
      };

      const ingredientsService = testingModule.get(IngredientsService);
      (ingredientsService.findOne as vi.Mock).mockResolvedValueOnce({
        _id: endFrameId,
      });

      const promptBuilder = testingModule.get(PromptBuilderService);

      await controller.create(mockRequest, dto, mockUser);

      expect(promptBuilder.buildPrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          endFrame: expect.any(String),
        }),
        expect.any(String),
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

      const promptBuilder = testingModule.get(PromptBuilderService);

      await controller.create(mockRequest, dto, mockUser);

      expect(promptBuilder.buildPrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          camera: 'dolly',
          cameraMovement: 'slow',
          lens: 'wide',
          lighting: 'natural',
        }),
        expect.any(String),
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
          pagination: true,
          sort: 'createdAt: -1',
        }),
      ).rejects.toThrow('Database error');
    });

    it('should handle invalid ObjectId in findOne', async () => {
      videosService.findAll.mockRejectedValue(new Error('Invalid ObjectId'));

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
        provide: PollingService,
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
        useValue: { patch: vi.fn(), remove: vi.fn() },
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
      { provide: SharedService, useValue: { saveDocuments: vi.fn() } },
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
    ],
  })
    .overrideGuard(ClerkGuard)
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
