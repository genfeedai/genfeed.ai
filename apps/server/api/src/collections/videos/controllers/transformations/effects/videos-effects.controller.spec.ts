import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
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
import { VideosEffectsController } from '@api/collections/videos/controllers/transformations/effects/videos-effects.controller';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

const mockRequest = {
  originalUrl: '/api/videos',
  params: {},
  query: {},
} as unknown as Request;

const mockVideo = {
  _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
  brand: new Types.ObjectId('507f1f77bcf86cd799439014'),
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

const ingredientId = new Types.ObjectId('507f1f77bcf86cd799439017');
const metadataId = new Types.ObjectId('507f1f77bcf86cd799439016');

describe('VideosEffectsController', () => {
  let controller: VideosEffectsController;

  const mockServices = {
    configService: { ingredientsEndpoint: 'https://api.example.com' },
    fileQueueService: {
      processVideo: vi.fn().mockResolvedValue({ jobId: 'job123' }),
      waitForJob: vi.fn().mockResolvedValue({ outputPath: '/tmp/video.mp4' }),
    },
    filesClientService: { uploadToS3: vi.fn() },
    ingredientsService: { patch: vi.fn() },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: { patch: vi.fn() },
    sharedService: {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: { _id: ingredientId },
        metadataData: { _id: metadataId },
      }),
    },
    videosService: { findOne: vi.fn() },
    websocketService: {
      publishMediaFailed: vi.fn(),
      publishVideoComplete: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosEffectsController],
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

    controller = module.get<VideosEffectsController>(VideosEffectsController);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // --- reverseVideo ---
  it('should reverse video and return serialized result', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const result = await controller.reverseVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(result).toBeDefined();
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalled();
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reverse-video' }),
    );
  });

  it('should throw NOT_FOUND when video does not exist for reverse', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    await expect(
      controller.reverseVideo(mockRequest, mockUser, 'nonexistent'),
    ).rejects.toThrow(HttpException);
  });

  it('should pass correct userId and room for reverse', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.reverseVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_123',
        room: 'user:user_123',
        userId: '507f1f77bcf86cd799439012',
      }),
    );
  });

  it('should create ingredient with PROCESSING status for reverse', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.reverseVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({ status: 'processing' }),
    );
  });

  // --- mirrorVideo ---
  it('should mirror video and return serialized result', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const result = await controller.mirrorVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(result).toBeDefined();
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mirror-video' }),
    );
  });

  it('should throw NOT_FOUND when video does not exist for mirror', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    await expect(
      controller.mirrorVideo(mockRequest, mockUser, 'nonexistent'),
    ).rejects.toThrow(HttpException);
  });

  it('should propagate error when saveDocuments fails for mirror', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.sharedService.saveDocuments.mockRejectedValueOnce(
      new Error('DB error'),
    );
    await expect(
      controller.mirrorVideo(mockRequest, mockUser, '507f1f77bcf86cd799439011'),
    ).rejects.toThrow();
    expect(mockServices.loggerService.error).toHaveBeenCalled();
  });

  it('should set parent to the source video id', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.reverseVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        parent: new Types.ObjectId('507f1f77bcf86cd799439011'),
      }),
    );
  });
});
