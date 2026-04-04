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

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosRelationshipsController } from '@api/collections/videos/controllers/relationships/videos-relationships.controller';
import { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('VideosRelationshipsController', () => {
  let controller: VideosRelationshipsController;
  let videosService: VideosService;
  let postsService: PostsService;

  const mockReq = {} as Request;

  const mockVideo = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    organization: new Types.ObjectId('507f1f77bcf86cd799439013'),
    parent: new Types.ObjectId('507f1f77bcf86cd799439010'),
    user: new Types.ObjectId('507f1f77bcf86cd799439012'),
  };

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439014',
      organization: '507f1f77bcf86cd799439013',
      user: '507f1f77bcf86cd799439012',
    },
  } as unknown as User;

  const mockServices = {
    activitiesService: { create: vi.fn(), patch: vi.fn() },
    captionsService: { create: vi.fn() },
    configService: {
      get: vi.fn(),
      ingredientsEndpoint: 'https://api.example.com',
      isDevelopment: false,
      isProduction: true,
    },
    fileQueueService: { processVideo: vi.fn(), waitForJob: vi.fn() },
    filesClientService: { uploadToS3: vi.fn() },
    ingredientsService: { patch: vi.fn() },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: { patch: vi.fn() },
    postsService: { findAll: vi.fn() },
    sharedService: { saveDocuments: vi.fn() },
    videosService: { findAll: vi.fn(), findOne: vi.fn() },
    websocketService: {
      publishBackgroundTaskUpdate: vi.fn(),
      publishMediaFailed: vi.fn(),
      publishVideoComplete: vi.fn(),
    },
    whisperService: { generateCaptions: vi.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosRelationshipsController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: mockServices.activitiesService,
        },
        {
          provide: FilesClientService,
          useValue: mockServices.filesClientService,
        },
        { provide: CaptionsService, useValue: mockServices.captionsService },
        { provide: ConfigService, useValue: mockServices.configService },
        {
          provide: FileQueueService,
          useValue: mockServices.fileQueueService,
        },
        {
          provide: IngredientsService,
          useValue: mockServices.ingredientsService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: MetadataService, useValue: mockServices.metadataService },
        {
          provide: PostsService,
          useValue: mockServices.postsService,
        },
        { provide: SharedService, useValue: mockServices.sharedService },
        { provide: VideosService, useValue: mockServices.videosService },
        {
          provide: NotificationsPublisherService,
          useValue: mockServices.websocketService,
        },
        { provide: WhisperService, useValue: mockServices.whisperService },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VideosRelationshipsController>(
      VideosRelationshipsController,
    );
    videosService = module.get<VideosService>(VideosService);
    postsService = module.get<PostsService>(PostsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findChildren', () => {
    it('should return child videos', async () => {
      const videoId = '507f1f77bcf86cd799439010';
      const query: VideosQueryDto = {};

      const mockData = {
        docs: [mockVideo],
        limit: 10,
        page: 1,
        pages: 1,
        total: 1,
      };

      mockServices.videosService.findAll.mockResolvedValue(mockData);

      const result = await controller.findChildren(mockReq, videoId, query);

      expect(videosService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findAllPosts', () => {
    it('should return posts for video', async () => {
      const videoId = '507f1f77bcf86cd799439011';
      const query: VideosQueryDto = {};

      const mockData = {
        docs: [
          {
            _id: new Types.ObjectId('507f1f77bcf86cd799439020'),
            ingredient: new Types.ObjectId(videoId),
            platform: 'twitter',
            status: 'published',
          },
        ],
        limit: 10,
        page: 1,
        pages: 1,
        total: 1,
      };

      mockServices.postsService.findAll.mockResolvedValue(mockData);

      const result = await controller.findAllPosts(
        mockReq,
        videoId,
        mockUser,
        query,
      );

      expect(postsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('mergeVideos', () => {
    it('should merge multiple videos', async () => {
      const createMergedVideoDto: CreateMergedVideoDto = {
        ids: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
        isCaptionsEnabled: false,
        isResizeEnabled: false,
      };

      mockServices.videosService.findAll.mockResolvedValue({
        docs: [mockVideo, { ...mockVideo, _id: '507f1f77bcf86cd799439012' }],
        total: 2,
      });
      mockServices.sharedService.saveDocuments.mockResolvedValue({
        ingredientData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
          id: '507f1f77bcf86cd799439015',
        },
        metadataData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439016'),
        },
      });
      mockServices.activitiesService.create.mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439018'),
      });
      mockServices.fileQueueService.processVideo.mockResolvedValue({
        jobId: 'job123',
      });

      const result = await controller.mergeVideos(
        mockReq,
        mockUser,
        createMergedVideoDto,
      );

      expect(videosService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should reject when no videos found', async () => {
      const createMergedVideoDto: CreateMergedVideoDto = {
        ids: ['507f1f77bcf86cd799439011'],
        isCaptionsEnabled: false,
        isResizeEnabled: false,
      };

      mockServices.videosService.findAll.mockResolvedValue({
        docs: [],
        total: 0,
      });

      await expect(
        controller.mergeVideos(mockReq, mockUser, createMergedVideoDto),
      ).rejects.toThrow();
    });
  });
});
