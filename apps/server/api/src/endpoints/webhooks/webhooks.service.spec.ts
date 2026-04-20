vi.mock('@api/collections/evaluations/services/evaluations.service', () => ({
  EvaluationsService: class {},
}));

import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import type { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import type { MetadataDocument } from '@api/collections/metadata/schemas/metadata.schema';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { UserEntity } from '@api/collections/users/entities/user.entity';
import type { UserDocument } from '@api/collections/users/schemas/user.schema';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
import { ActivityUpdateService } from '@api/endpoints/webhooks/services/activity-update.service';
import { AutoMergeService } from '@api/endpoints/webhooks/services/auto-merge.service';
import { MediaUploadService } from '@api/endpoints/webhooks/services/media-upload.service';
import { MetadataLookupService } from '@api/endpoints/webhooks/services/metadata-lookup.service';
import { PostProcessingOrchestratorService } from '@api/endpoints/webhooks/services/post-processing-orchestrator.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  AssetCategory,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import type { IFileMetadata } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock setImmediate for testing async callbacks
vi.useFakeTimers();

describe('WebhooksService', () => {
  let service: WebhooksService;
  let loggerService: vi.Mocked<LoggerService>;
  let filesClientService: vi.Mocked<FilesClientService>;
  let _notificationsService: vi.Mocked<NotificationsService>;
  let websocketService: vi.Mocked<NotificationsPublisherService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let metadataService: vi.Mocked<MetadataService>;
  let cacheService: vi.Mocked<CacheService>;
  let usersService: vi.Mocked<UsersService>;
  let assetsService: vi.Mocked<AssetsService>;
  let metadataLookupService: vi.Mocked<MetadataLookupService>;
  let mediaUploadService: vi.Mocked<MediaUploadService>;
  let activityUpdateService: vi.Mocked<ActivityUpdateService>;
  let postProcessingOrchestrator: vi.Mocked<PostProcessingOrchestratorService>;
  let autoMergeService: vi.Mocked<AutoMergeService>;

  const mockUserId = '507f191e810c19729de860ee';
  const mockOrgId = '507f191e810c19729de860ee';
  const mockBrandId = '507f191e810c19729de860ee';
  const mockMetadataId = '507f191e810c19729de860ee';
  const mockIngredientId = '507f191e810c19729de860ee';
  const mockClerkId = 'clerk_user_123';

  const mockMetadata = {
    _id: mockMetadataId,
    duration: null,
    error: null,
    extension: MetadataExtension.PNG,
    externalId: 'test-external-id',
    hasAudio: null,
    height: null,
    result: null,
    size: null,
    width: null,
  };

  const mockVideoMetadata = {
    ...mockMetadata,
    duration: 10,
    extension: MetadataExtension.MP4,
    height: 1080,
    width: 1920,
  };

  const mockUser = {
    _id: mockUserId,
    clerkId: mockClerkId,
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
  };

  const mockIngredient = {
    _id: mockIngredientId,
    brand: mockBrandId,
    category: IngredientCategory.IMAGE,
    metadata: mockMetadataId,
    organization: mockOrgId,
    prompt: { original: 'Test prompt' },
    status: IngredientStatus.PROCESSING,
    user: mockUser,
  };

  const mockVideoIngredient = {
    ...mockIngredient,
    category: IngredientCategory.VIDEO,
    metadata: { ...mockVideoMetadata },
  };

  const mockMusicIngredient = {
    ...mockIngredient,
    category: IngredientCategory.MUSIC,
  };

  const mockMetadataDoc = mockMetadata as unknown as MetadataDocument;
  const mockMetadataEntity = mockMetadata as unknown as MetadataEntity;
  const mockVideoMetadataDoc = mockVideoMetadata as unknown as MetadataDocument;
  const mockUserEntity = mockUser as unknown as UserEntity;
  const mockUserDoc = mockUser as unknown as UserDocument;
  const mockIngredientDoc = mockIngredient as unknown as IngredientDocument;
  const mockIngredientEntity = mockIngredient as unknown as IngredientEntity;
  const mockVideoIngredientDoc =
    mockVideoIngredient as unknown as IngredientDocument;
  const mockVideoIngredientEntity =
    mockVideoIngredient as unknown as IngredientEntity;
  const mockMusicIngredientDoc =
    mockMusicIngredient as unknown as IngredientDocument;
  const mockMusicIngredientEntity =
    mockMusicIngredient as unknown as IngredientEntity;

  const mockUploadMeta = {
    duration: 0,
    hasAudio: false,
    height: 768,
    publicUrl: 'https://cdn.example.com/test.png',
    size: 1024000,
    width: 1024,
  };

  const _mockVideoUploadMeta = {
    duration: 10,
    hasAudio: true,
    height: 1080,
    publicUrl: 'https://cdn.example.com/test.mp4',
    size: 5000000,
    width: 1920,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('http://localhost:3002'),
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
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
          provide: FilesClientService,
          useValue: {
            generateThumbnail: vi.fn(),
            uploadToS3: vi.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendDiscordCard: vi.fn(),
            sendIngredientNotification: vi.fn(),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: {
            emit: vi.fn(),
            publishAssetStatus: vi.fn(),
            publishBackgroundTaskUpdate: vi.fn(),
            publishMediaFailed: vi.fn(),
            publishVideoComplete: vi.fn(),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            create: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            invalidateByTags: vi.fn(),
          },
        },
        {
          provide: FileQueueService,
          useValue: {
            processVideo: vi.fn(),
            waitForJob: vi.fn(),
          },
        },
        {
          provide: OrganizationSettingsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: AssetsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: EvaluationsService,
          useValue: {
            evaluateContent: vi.fn(),
          },
        },
        {
          provide: ActivityUpdateService,
          useValue: {
            updateFailureActivity: vi.fn().mockResolvedValue(undefined),
            updateSuccessActivity: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AutoMergeService,
          useValue: {
            triggerAutoMergeIfReady: vi.fn(),
          },
        },
        {
          provide: MediaUploadService,
          useValue: {
            uploadAndUpdateMetadata: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MetadataLookupService,
          useValue: {
            lookupMetadataAndIngredient: vi.fn().mockResolvedValue({
              ingredient: mockIngredientDoc,
              metadata: mockMetadataDoc,
            }),
          },
        },
        {
          provide: PostProcessingOrchestratorService,
          useValue: {
            notifyBotGatewayIfNeeded: vi.fn(),
            triggerAutoEvaluationIfEnabled: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    loggerService = module.get(LoggerService);
    filesClientService = module.get(FilesClientService);
    _notificationsService = module.get(NotificationsService);
    websocketService = module.get(NotificationsPublisherService);
    ingredientsService = module.get(IngredientsService);
    metadataService = module.get(MetadataService);
    cacheService = module.get(CacheService);
    usersService = module.get(UsersService);
    assetsService = module.get(AssetsService);
    metadataLookupService = module.get(MetadataLookupService);
    mediaUploadService = module.get(MediaUploadService);
    activityUpdateService = module.get(ActivityUpdateService);
    postProcessingOrchestrator = module.get(PostProcessingOrchestratorService);
    autoMergeService = module.get(AutoMergeService);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processMediaFromWebhook', () => {
    const externalId = 'test-external-id';
    const url = 'https://example.com/media.jpg';
    const integration = 'test-integration';

    beforeEach(() => {
      // Default mock: lookup returns ingredient and metadata
      metadataLookupService.lookupMetadataAndIngredient.mockResolvedValue({
        ingredient: mockIngredientDoc,
        metadata: mockMetadataDoc,
      });
      // After patch, findOne returns populated ingredient with clerkId
      ingredientsService.patch.mockResolvedValue(mockIngredientDoc);
      ingredientsService.findOne.mockResolvedValue(mockIngredientDoc);
      websocketService.publishVideoComplete.mockResolvedValue(undefined);
      websocketService.publishBackgroundTaskUpdate.mockResolvedValue(undefined);
      cacheService.invalidateByTags.mockResolvedValue(0);
      activityUpdateService.updateSuccessActivity.mockResolvedValue(undefined);
    });

    it('should process image from webhook successfully', async () => {
      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      expect(
        metadataLookupService.lookupMetadataAndIngredient,
      ).toHaveBeenCalledWith(
        externalId,
        IngredientCategory.IMAGE,
        url,
        integration,
      );
      expect(mediaUploadService.uploadAndUpdateMetadata).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        IngredientCategory.IMAGE,
        url,
        mockMetadataId.toString(),
        externalId,
      );
      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        { status: IngredientStatus.GENERATED },
      );
      expect(websocketService.publishVideoComplete).toHaveBeenCalled();
      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['images']);
    });

    it('should process video from webhook successfully', async () => {
      metadataLookupService.lookupMetadataAndIngredient.mockResolvedValue({
        ingredient: mockVideoIngredientDoc,
        metadata: mockVideoMetadataDoc,
      });
      ingredientsService.patch.mockResolvedValue(mockVideoIngredientDoc);
      ingredientsService.findOne.mockResolvedValue(mockVideoIngredientDoc);

      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.VIDEO,
        externalId,
        url,
      );

      expect(mediaUploadService.uploadAndUpdateMetadata).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        IngredientCategory.VIDEO,
        url,
        mockMetadataId.toString(),
        externalId,
      );
      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['videos']);
    });

    it('should process media directly for an existing ingredient id', async () => {
      ingredientsService.findOne
        .mockResolvedValueOnce({
          ...mockVideoIngredientDoc,
          metadata: mockMetadataId.toString(),
        })
        .mockResolvedValueOnce(mockVideoIngredientDoc);
      metadataService.findOne.mockResolvedValue(mockVideoMetadataDoc);

      await service.processMediaForIngredient(
        mockIngredientId.toString(),
        'avatar',
        'https://example.com/avatar.mp4',
        'provider-video-1',
      );

      expect(mediaUploadService.uploadAndUpdateMetadata).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        IngredientCategory.AVATAR,
        'https://example.com/avatar.mp4',
        mockMetadataId.toString(),
        'provider-video-1',
      );
      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        { status: IngredientStatus.GENERATED },
      );
    });

    it('should process music from webhook successfully', async () => {
      metadataLookupService.lookupMetadataAndIngredient.mockResolvedValue({
        ingredient: mockMusicIngredientDoc,
        metadata: mockMetadataDoc,
      });
      ingredientsService.patch.mockResolvedValue(mockMusicIngredientDoc);
      ingredientsService.findOne.mockResolvedValue(mockMusicIngredientDoc);

      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.MUSIC,
        externalId,
        url,
      );

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['musics']);
    });

    it('should throw error when metadata not found (via lookupMetadataAndIngredient)', async () => {
      metadataLookupService.lookupMetadataAndIngredient.mockRejectedValue(
        new Error('Metadata not found'),
      );

      await expect(
        service.processMediaFromWebhook(
          integration,
          IngredientCategory.IMAGE,
          externalId,
          url,
        ),
      ).rejects.toThrow('Metadata not found');
    });

    it('should throw error when ingredient not found after patch', async () => {
      // findOne returns null after the patch (re-populate step)
      ingredientsService.patch.mockResolvedValue(mockIngredientDoc);
      ingredientsService.findOne.mockResolvedValue(null);

      await expect(
        service.processMediaFromWebhook(
          integration,
          IngredientCategory.IMAGE,
          externalId,
          url,
        ),
      ).rejects.toThrow('Ingredient not found after patch');

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('ingredient not found after patch'),
        expect.any(Object),
      );
    });

    it('should call activityUpdateService.updateSuccessActivity with correct params', async () => {
      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      expect(activityUpdateService.updateSuccessActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          category: IngredientCategory.IMAGE,
          ingredientId: mockIngredientId.toString(),
        }),
      );
    });

    it('should publish websocket event with correct path for images', async () => {
      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      expect(websocketService.publishVideoComplete).toHaveBeenCalledWith(
        `/images/${mockIngredientId.toString()}`,
        expect.objectContaining({
          id: mockIngredientId.toString(),
          status: 'completed',
        }),
        expect.any(String),
        expect.any(String),
      );
    });

    it('should invalidate cache for correct category', async () => {
      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['images']);
    });

    it('should handle category as string', async () => {
      await service.processMediaFromWebhook(
        integration,
        'image',
        externalId,
        url,
      );

      expect(mediaUploadService.uploadAndUpdateMetadata).toHaveBeenCalledWith(
        expect.any(String),
        'image',
        url,
        expect.any(String),
        externalId,
      );
    });

    it('should fetch full user document if clerkId missing from populated user', async () => {
      const ingredientWithoutClerkId = {
        ...mockIngredient,
        user: { _id: mockUserId },
      };
      metadataLookupService.lookupMetadataAndIngredient.mockResolvedValue({
        ingredient: ingredientWithoutClerkId as unknown as IngredientDocument,
        metadata: mockMetadataDoc,
      });
      ingredientsService.patch.mockResolvedValue(
        ingredientWithoutClerkId as unknown as IngredientEntity,
      );
      ingredientsService.findOne.mockResolvedValue(
        ingredientWithoutClerkId as unknown as IngredientEntity,
      );
      usersService.findOne.mockResolvedValue(mockUserDoc);

      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      expect(usersService.findOne).toHaveBeenCalledWith({
        _id: mockUserId,
      });
    });

    it('should warn when user has no clerkId for websocket', async () => {
      const ingredientWithoutClerkId = {
        ...mockIngredient,
        user: { _id: mockUserId },
      };
      metadataLookupService.lookupMetadataAndIngredient.mockResolvedValue({
        ingredient: ingredientWithoutClerkId as unknown as IngredientDocument,
        metadata: mockMetadataDoc,
      });
      ingredientsService.patch.mockResolvedValue(
        ingredientWithoutClerkId as unknown as IngredientEntity,
      );
      ingredientsService.findOne.mockResolvedValue(
        ingredientWithoutClerkId as unknown as IngredientEntity,
      );
      usersService.findOne.mockResolvedValue({
        _id: mockUserId,
      } as unknown as UserEntity);

      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Client joins room using Clerk ID from JWT'),
        expect.any(Object),
      );
    });

    it('should trigger post-processing orchestrator', async () => {
      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      expect(
        postProcessingOrchestrator.notifyBotGatewayIfNeeded,
      ).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        IngredientCategory.IMAGE,
      );
      expect(
        postProcessingOrchestrator.triggerAutoEvaluationIfEnabled,
      ).toHaveBeenCalled();
    });

    it('should trigger auto-merge service', async () => {
      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      expect(autoMergeService.triggerAutoMergeIfReady).toHaveBeenCalled();
    });

    it('should schedule post-upload notifications', async () => {
      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      // Run setImmediate callbacks
      vi.runAllTimers();

      // The Discord notification should be called asynchronously
      expect(ingredientsService.findOne).toHaveBeenCalled();
    });
  });

  describe('handleFailedGeneration', () => {
    const externalId = 'test-external-id';
    const errorMessage = 'Generation failed due to content policy';

    beforeEach(() => {
      metadataService.findOne.mockResolvedValue(mockMetadataDoc);
      metadataService.patch.mockResolvedValue(mockMetadataDoc);
      ingredientsService.findOne.mockResolvedValue(mockIngredientDoc);
      ingredientsService.patch.mockResolvedValue(mockIngredientDoc);
      websocketService.publishMediaFailed.mockResolvedValue(undefined);
      websocketService.publishBackgroundTaskUpdate.mockResolvedValue(undefined);
      cacheService.invalidateByTags.mockResolvedValue(0);
      activityUpdateService.updateFailureActivity.mockResolvedValue(undefined);
    });

    it('should handle failed generation successfully', async () => {
      await service.handleFailedGeneration(externalId, errorMessage);

      expect(metadataService.findOne).toHaveBeenCalledWith({
        externalId,
        isDeleted: false,
      });
      expect(metadataService.patch).toHaveBeenCalledWith(mockMetadata._id, {
        error: errorMessage,
      });
      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockIngredientId.toString(),
        { status: IngredientStatus.FAILED },
      );
    });

    it('should handle case when metadata not found', async () => {
      metadataService.findOne.mockResolvedValue(null);

      await service.handleFailedGeneration(externalId, errorMessage);

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('metadata not found'),
        expect.objectContaining({ externalId }),
      );
      expect(ingredientsService.findOne).not.toHaveBeenCalled();
    });

    it('should handle case when ingredient not found', async () => {
      ingredientsService.findOne.mockResolvedValue(null);

      await service.handleFailedGeneration(externalId, errorMessage);

      expect(metadataService.patch).toHaveBeenCalledWith(mockMetadata._id, {
        error: errorMessage,
      });
      expect(ingredientsService.patch).not.toHaveBeenCalled();
    });

    it('should call activityUpdateService.updateFailureActivity', async () => {
      await service.handleFailedGeneration(externalId, errorMessage);

      expect(activityUpdateService.updateFailureActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          category: IngredientCategory.IMAGE,
          errorMessage,
          ingredientId: mockIngredientId.toString(),
        }),
      );
    });

    it('should publish media failed websocket event', async () => {
      await service.handleFailedGeneration(externalId, errorMessage);

      expect(websocketService.publishMediaFailed).toHaveBeenCalledWith(
        `/images/${mockIngredientId.toString()}`,
        errorMessage,
        expect.any(String),
        expect.any(String),
      );
    });

    it('should invalidate cache on failure', async () => {
      await service.handleFailedGeneration(externalId, errorMessage);

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['images']);
    });

    it('should handle errors gracefully', async () => {
      metadataService.findOne.mockRejectedValue(new Error('Database error'));

      await service.handleFailedGeneration(externalId, errorMessage);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('error'),
        expect.any(Error),
      );
    });

    it('should use default error message if none provided', async () => {
      await service.handleFailedGeneration(externalId);

      expect(websocketService.publishMediaFailed).toHaveBeenCalledWith(
        expect.any(String),
        'Generation failed',
        expect.any(String),
        expect.any(String),
      );
    });

    it('should handle failed image generation activity', async () => {
      await service.handleFailedGeneration(externalId, errorMessage);

      expect(activityUpdateService.updateFailureActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          category: IngredientCategory.IMAGE,
        }),
      );
    });

    it('should handle failed video generation activity', async () => {
      const videoIngredient = {
        ...mockIngredient,
        category: IngredientCategory.VIDEO,
        user: mockUser,
      };
      ingredientsService.findOne.mockResolvedValue(
        videoIngredient as unknown as IngredientEntity,
      );

      await service.handleFailedGeneration(externalId, errorMessage);

      expect(activityUpdateService.updateFailureActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          category: IngredientCategory.VIDEO,
        }),
      );
    });

    it('should handle failed music generation activity', async () => {
      ingredientsService.findOne.mockResolvedValue(mockMusicIngredientDoc);

      await service.handleFailedGeneration(externalId, errorMessage);

      expect(activityUpdateService.updateFailureActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          category: IngredientCategory.MUSIC,
        }),
      );
    });
  });

  describe('processAssetFromWebhook', () => {
    const assetId = '507f191e810c19729de860ee'.toString();
    const url = 'https://example.com/asset.png';
    const integration = 'test-integration';

    const mockAsset = {
      _id: assetId,
      category: AssetCategory.LOGO,
      parent: '507f191e810c19729de860ee',
      parentModel: 'Brand',
      user: mockUser,
    };

    beforeEach(() => {
      assetsService.findOne.mockResolvedValue(
        mockAsset as unknown as AssetDocument,
      );
      filesClientService.uploadToS3.mockResolvedValue(
        mockUploadMeta as unknown as IFileMetadata,
      );
      websocketService.publishAssetStatus.mockResolvedValue(undefined);
    });

    it('should process asset from webhook successfully', async () => {
      await service.processAssetFromWebhook(integration, assetId, url);

      expect(assetsService.findOne).toHaveBeenCalledWith(
        { _id: assetId },
        expect.any(Array),
      );
      expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
        assetId,
        'logos',
        { type: 'url', url },
      );
      expect(websocketService.publishAssetStatus).toHaveBeenCalledWith(
        assetId,
        'completed',
        expect.any(String),
        expect.objectContaining({
          assetId: assetId,
          category: AssetCategory.LOGO,
        }),
      );
    });

    it('should throw error when asset not found', async () => {
      assetsService.findOne.mockResolvedValue(null);

      await expect(
        service.processAssetFromWebhook(integration, assetId, url),
      ).rejects.toThrow('Asset not found');

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('asset not found'),
        expect.objectContaining({ assetId }),
      );
    });

    it('should upload to correct folder based on asset category', async () => {
      const bannerAsset = {
        ...mockAsset,
        category: AssetCategory.BANNER,
      };
      assetsService.findOne.mockResolvedValue(
        bannerAsset as unknown as AssetDocument,
      );

      await service.processAssetFromWebhook(integration, assetId, url);

      expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
        assetId,
        'banners',
        { type: 'url', url },
      );
    });

    it('should handle asset with user as string ID', async () => {
      const assetWithStringUser = {
        ...mockAsset,
        user: mockUserId.toString(),
      };
      assetsService.findOne.mockResolvedValue(
        assetWithStringUser as unknown as AssetDocument,
      );

      await service.processAssetFromWebhook(integration, assetId, url);

      expect(websocketService.publishAssetStatus).toHaveBeenCalledWith(
        assetId,
        'completed',
        mockUserId.toString(),
        expect.any(Object),
      );
    });

    it('should not publish websocket if no userId available', async () => {
      const assetWithoutUser = {
        ...mockAsset,
        user: undefined,
      };
      assetsService.findOne.mockResolvedValue(
        assetWithoutUser as unknown as AssetDocument,
      );

      await service.processAssetFromWebhook(integration, assetId, url);

      expect(websocketService.publishAssetStatus).not.toHaveBeenCalled();
    });

    it('should include parent and parentModel in websocket metadata', async () => {
      await service.processAssetFromWebhook(integration, assetId, url);

      expect(websocketService.publishAssetStatus).toHaveBeenCalledWith(
        assetId,
        'completed',
        expect.any(String),
        expect.objectContaining({
          parent: mockAsset.parent.toString(),
          parentModel: 'Brand',
        }),
      );
    });

    it('should handle upload errors', async () => {
      filesClientService.uploadToS3.mockRejectedValue(
        new Error('Upload failed'),
      );

      await expect(
        service.processAssetFromWebhook(integration, assetId, url),
      ).rejects.toThrow('Upload failed');

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });

    it('should log completion message', async () => {
      await service.processAssetFromWebhook(integration, assetId, url);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('completed'),
        expect.objectContaining({
          assetId,
          category: AssetCategory.LOGO,
        }),
      );
    });
  });

  describe('auto-evaluation trigger (via processMediaFromWebhook)', () => {
    const externalId = 'test-external-id';
    const url = 'https://example.com/media.jpg';
    const integration = 'test-integration';

    beforeEach(() => {
      metadataLookupService.lookupMetadataAndIngredient.mockResolvedValue({
        ingredient: mockIngredientDoc,
        metadata: mockMetadataDoc,
      });
      ingredientsService.patch.mockResolvedValue(mockIngredientDoc);
      ingredientsService.findOne.mockResolvedValue(mockIngredientDoc);
      cacheService.invalidateByTags.mockResolvedValue(0);
      websocketService.publishVideoComplete.mockResolvedValue(undefined);
      activityUpdateService.updateSuccessActivity.mockResolvedValue(undefined);
    });

    it('should call triggerAutoEvaluationIfEnabled from orchestrator', async () => {
      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.IMAGE,
        externalId,
        url,
      );

      expect(
        postProcessingOrchestrator.triggerAutoEvaluationIfEnabled,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ _id: mockIngredientId }),
      );
    });

    it('should call triggerAutoEvaluationIfEnabled for video', async () => {
      metadataLookupService.lookupMetadataAndIngredient.mockResolvedValue({
        ingredient: mockVideoIngredientDoc,
        metadata: mockVideoMetadataDoc,
      });
      ingredientsService.patch.mockResolvedValue(mockVideoIngredientDoc);
      ingredientsService.findOne.mockResolvedValue(mockVideoIngredientDoc);

      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.VIDEO,
        externalId,
        url,
      );

      expect(
        postProcessingOrchestrator.triggerAutoEvaluationIfEnabled,
      ).toHaveBeenCalled();
    });
  });

  describe('auto-merge trigger (via processMediaFromWebhook)', () => {
    const externalId = 'test-external-id';
    const url = 'https://example.com/video.mp4';
    const integration = 'test-integration';

    const mockBatchIngredient = {
      ...mockVideoIngredient,
      groupId: 'batch-group-123',
      groupIndex: 0,
      isMergeEnabled: true,
    };

    beforeEach(() => {
      metadataLookupService.lookupMetadataAndIngredient.mockResolvedValue({
        ingredient: mockBatchIngredient as unknown as IngredientDocument,
        metadata: mockVideoMetadata as unknown as MetadataDocument,
      });
      ingredientsService.patch.mockResolvedValue(
        mockBatchIngredient as unknown as IngredientEntity,
      );
      ingredientsService.findOne.mockResolvedValue(
        mockBatchIngredient as unknown as IngredientEntity,
      );
      cacheService.invalidateByTags.mockResolvedValue(0);
      websocketService.publishVideoComplete.mockResolvedValue(undefined);
      websocketService.publishBackgroundTaskUpdate.mockResolvedValue(undefined);
      activityUpdateService.updateSuccessActivity.mockResolvedValue(undefined);
    });

    it('should call triggerAutoMergeIfReady when processing video', async () => {
      await service.processMediaFromWebhook(
        integration,
        IngredientCategory.VIDEO,
        externalId,
        url,
      );

      expect(autoMergeService.triggerAutoMergeIfReady).toHaveBeenCalledWith(
        expect.objectContaining({ _id: mockIngredientId }),
      );
    });
  });
});
