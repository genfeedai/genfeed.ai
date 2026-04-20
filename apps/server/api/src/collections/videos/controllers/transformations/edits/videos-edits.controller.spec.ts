import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { HttpException, HttpStatus } from '@nestjs/common';
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
  () => ({
    NotificationsPublisherService: class {},
  }),
);
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock('@api/collections/videos/services/videos.service', () => ({
  VideosService: class {},
}));

import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosEditsController } from '@api/collections/videos/controllers/transformations/edits/videos-edits.controller';
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
  category: 'video',
  organization: '507f1f77bcf86cd799439013',
  status: 'completed',
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

const ingredientId = '507f1f77bcf86cd799439017';
const metadataId = '507f1f77bcf86cd799439016';

describe('VideosEditsController', () => {
  let controller: VideosEditsController;

  const mockServices = {
    configService: { ingredientsEndpoint: 'https://api.example.com' },
    fileQueueService: {
      processVideo: vi.fn().mockResolvedValue({ jobId: 'job123' }),
      waitForJob: vi.fn().mockResolvedValue({ outputPath: '/tmp/video.mp4' }),
    },
    filesClientService: { uploadToS3: vi.fn() },
    ingredientsService: { patch: vi.fn() },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: { findOne: vi.fn(), patch: vi.fn() },
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
      controllers: [VideosEditsController],
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

    controller = module.get<VideosEditsController>(VideosEditsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // --- trimVideo ---
  it('should trim video and return serialized ingredient', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const result = await controller.trimVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
      { endTime: 10, startTime: 2 },
    );
    expect(result).toBeDefined();
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalled();
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalled();
  });

  it('should throw NOT_FOUND when video does not exist for trim', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    await expect(
      controller.trimVideo(mockRequest, mockUser, 'nonexistent', {
        endTime: 5,
        startTime: 0,
      }),
    ).rejects.toThrow(HttpException);
  });

  it('should reject trim duration less than 2 seconds', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await expect(
      controller.trimVideo(mockRequest, mockUser, '507f1f77bcf86cd799439011', {
        endTime: 1,
        startTime: 0,
      }),
    ).rejects.toThrow(HttpException);
    try {
      await controller.trimVideo(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439011',
        { endTime: 1, startTime: 0 },
      );
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should reject trim duration greater than 15 seconds', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await expect(
      controller.trimVideo(mockRequest, mockUser, '507f1f77bcf86cd799439011', {
        endTime: 20,
        startTime: 0,
      }),
    ).rejects.toThrow(HttpException);
  });

  it('should reject negative startTime for trim', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await expect(
      controller.trimVideo(mockRequest, mockUser, '507f1f77bcf86cd799439011', {
        endTime: 5,
        startTime: -1,
      }),
    ).rejects.toThrow(HttpException);
  });

  // --- addTextOverlay ---
  it('should add text overlay and return serialized ingredient', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.metadataService.findOne.mockResolvedValue({
      height: 1080,
      ingredient: '507f1f77bcf86cd799439011',
      width: 1920,
    });
    const result = await controller.addTextOverlay(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
      { position: 'top', text: 'Hello World' },
    );
    expect(result).toBeDefined();
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalled();
  });

  it('should throw BAD_REQUEST when text overlay has empty text', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await expect(
      controller.addTextOverlay(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439011',
        { text: '' },
      ),
    ).rejects.toThrow(HttpException);
  });

  it('should throw NOT_FOUND when video metadata is missing for overlay', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.metadataService.findOne.mockResolvedValue(null);
    await expect(
      controller.addTextOverlay(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439011',
        { text: 'Hi' },
      ),
    ).rejects.toThrow(HttpException);
  });

  it('should throw NOT_FOUND when video does not exist for overlay', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    await expect(
      controller.addTextOverlay(mockRequest, mockUser, 'nonexistent', {
        text: 'Hi',
      }),
    ).rejects.toThrow(HttpException);
  });

  it('should pass correct processVideo type for trim', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.trimVideo(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
      { endTime: 5, startTime: 0 },
    );
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'trim-video' }),
    );
  });
});
