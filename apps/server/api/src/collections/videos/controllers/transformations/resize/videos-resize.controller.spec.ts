import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import type { IResizeBodyParams } from '@genfeedai/interfaces';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('@api/collections/ingredients/services/ingredients.service', () => ({
  IngredientsService: class {},
}));
vi.mock('@api/collections/metadata/services/metadata.service', () => ({
  MetadataService: class {},
}));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock(
  '@api/services/notifications/publisher/notifications-publisher.service',
  () => ({ NotificationsPublisherService: class {} }),
);
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock('@api/collections/videos/services/videos.service', () => ({
  VideosService: class {},
}));

import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosResizeController } from '@api/collections/videos/controllers/transformations/resize/videos-resize.controller';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const mockRequest = {
  originalUrl: '/api/videos',
  params: {},
  query: {},
} as unknown as Request;

const mockVideo = {
  _id: '507f1f77bcf86cd799439011',
  brand: '507f1f77bcf86cd799439014',
  organization: '507f1f77bcf86cd799439013',
  user: '507f1f77bcf86cd799439012',
};

const mockUser = {
  id: 'user_123',
  publicMetadata: {
    brand: '507f1f77bcf86cd799439014',
    organization: '507f1f77bcf86cd799439013',
    user: '507f1f77bcf86cd799439012',
  },
} as unknown as User;

const ingredientId = '507f1f77bcf86cd799439015';
const metadataId = '507f1f77bcf86cd799439016';

describe('VideosResizeController', () => {
  let controller: VideosResizeController;

  const mockServices = {
    configService: { ingredientsEndpoint: 'https://api.example.com' },
    fileQueueService: {
      processVideo: vi.fn().mockResolvedValue({ jobId: 'job123' }),
      waitForJob: vi.fn().mockResolvedValue({ outputPath: '/tmp/video.mp4' }),
    },
    filesClientService: { uploadToS3: vi.fn() },
    ingredientsService: { patch: vi.fn() },
    loggerService: { error: vi.fn(), log: vi.fn() },
    metadataService: { patch: vi.fn() },
    sharedService: {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: { _id: ingredientId },
        metadataData: { _id: metadataId },
      }),
    },
    videosService: { findOne: vi.fn() },
    websocketService: { publishVideoComplete: vi.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosResizeController],
      providers: [
        { provide: ConfigService, useValue: mockServices.configService },
        { provide: FileQueueService, useValue: mockServices.fileQueueService },
        {
          provide: FilesClientService,
          useValue: mockServices.filesClientService,
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

    controller = module.get<VideosResizeController>(VideosResizeController);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // --- resizeVideo ---
  it('should resize video and return serialized result', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    const result = await controller.resizeVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
      resizeParams,
    );
    expect(result).toBeDefined();
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ height: 1080, width: 1920 }),
        type: 'resize',
      }),
    );
  });

  it('should throw NOT_FOUND when video does not exist for resize', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    await expect(
      controller.resizeVideo(
        mockRequest,
        mockUser,
        'nonexistent',
        resizeParams,
      ),
    ).rejects.toThrow(HttpException);
  });

  it('should query video with $or for user and organization ownership', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    await controller.resizeVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
      resizeParams,
    );
    expect(mockServices.videosService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ user: expect.anything() }),
          expect.objectContaining({ organization: expect.anything() }),
        ]),
      }),
    );
  });

  it('should create ingredient with PROCESSING status and VIDEO category', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const resizeParams: IResizeBodyParams = { height: 480, width: 640 };
    await controller.resizeVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
      resizeParams,
    );
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        category: 'video',
        extension: 'mp4',
        status: 'processing',
      }),
    );
  });

  // --- resizeToPortrait ---
  it('should resize to portrait (1080x1920) and return result', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const result = await controller.resizeToPortrait(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(result).toBeDefined();
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ height: 1920, width: 1080 }),
        type: 'convert-to-portrait',
      }),
    );
  });

  it('should throw NOT_FOUND when video does not exist for portrait', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    await expect(
      controller.resizeToPortrait(mockRequest, mockUser, 'nonexistent'),
    ).rejects.toThrow(HttpException);
  });

  it('should set parent to original video for resize', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    await controller.resizeVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
      resizeParams,
    );
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        parent: '507f1f77bcf86cd799439011',
      }),
    );
  });

  it('should include inputPath in processVideo params', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    await controller.resizeVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
      resizeParams,
    );
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          inputPath: 'https://api.example.com/videos/507f1f77bcf86cd799439011',
        }),
      }),
    );
  });
});
