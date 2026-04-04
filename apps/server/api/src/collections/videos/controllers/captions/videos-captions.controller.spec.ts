vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((source, id) => ({
    message: `${source} ${id} not found`,
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosCaptionsController } from '@api/collections/videos/controllers/captions/videos-captions.controller';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('VideosCaptionsController', () => {
  let controller: VideosCaptionsController;
  let videosService: VideosService;
  let captionsService: CaptionsService;

  const mockReq = {} as Request;

  const mockVideo = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    brand: new Types.ObjectId('507f1f77bcf86cd799439014'),
    captions: [
      {
        _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
        content: 'Test caption content',
        format: 'srt',
        language: 'en',
      },
    ],
    organization: new Types.ObjectId('507f1f77bcf86cd799439013'),
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
    captionsService: { findAll: vi.fn(), findOne: vi.fn() },
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
    sharedService: { saveDocuments: vi.fn() },
    videosService: { findOne: vi.fn() },
    websocketService: { publishVideoComplete: vi.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosCaptionsController],
      providers: [
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
        { provide: SharedService, useValue: mockServices.sharedService },
        { provide: VideosService, useValue: mockServices.videosService },
        {
          provide: NotificationsPublisherService,
          useValue: mockServices.websocketService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VideosCaptionsController>(VideosCaptionsController);
    videosService = module.get<VideosService>(VideosService);
    captionsService = module.get<CaptionsService>(CaptionsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCaptions', () => {
    it('should call videosService.findOne and return captions', async () => {
      const videoId = '507f1f77bcf86cd799439011';
      const mockCaptionsData = { docs: [{ content: 'Test caption' }] };

      mockServices.videosService.findOne.mockResolvedValue(mockVideo);
      mockServices.captionsService.findAll.mockResolvedValue(mockCaptionsData);

      const result = await controller.getCaptions(
        mockReq,
        mockUser,
        videoId,
        {},
      );

      expect(videosService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when video does not exist', async () => {
      const videoId = '507f1f77bcf86cd799439011';

      mockServices.videosService.findOne.mockResolvedValue(null);

      const result = await controller.getCaptions(
        mockReq,
        mockUser,
        videoId,
        {},
      );

      expect(result).toHaveProperty('statusCode', 404);
    });
  });

  describe('createVideoWithCaptions', () => {
    it('should add captions to video', async () => {
      const videoId = '507f1f77bcf86cd799439011';
      const createDto = { caption: '507f1f77bcf86cd799439015' };

      mockServices.videosService.findOne.mockResolvedValue(mockVideo);
      mockServices.captionsService.findOne.mockResolvedValue(
        mockVideo.captions[0],
      );
      mockServices.sharedService.saveDocuments.mockResolvedValue({
        ingredientData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439016'),
        },
        metadataData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439017'),
        },
      });
      mockServices.configService.get.mockReturnValue('https://api.example.com');
      mockServices.fileQueueService.processVideo.mockResolvedValue({
        jobId: 'job123',
      });

      const result = await controller.createVideoWithCaptions(
        mockReq,
        mockUser,
        videoId,
        createDto,
      );

      expect(videosService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when video does not exist', async () => {
      const videoId = '507f1f77bcf86cd799439011';
      const createDto = { caption: '507f1f77bcf86cd799439015' };

      mockServices.videosService.findOne.mockResolvedValue(null);

      const result = await controller.createVideoWithCaptions(
        mockReq,
        mockUser,
        videoId,
        createDto,
      );

      expect(result).toHaveProperty('statusCode', 404);
    });
  });
});
