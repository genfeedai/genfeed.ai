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
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock('@api/collections/videos/services/videos.service', () => ({
  VideosService: class {},
}));

import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosGifController } from '@api/collections/videos/controllers/transformations/gif/videos-gif.controller';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
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

describe('VideosGifController', () => {
  let controller: VideosGifController;

  const mockServices = {
    configService: { ingredientsEndpoint: 'https://api.example.com' },
    fileQueueService: {
      createGif: vi.fn().mockResolvedValue({ jobId: 'job123' }),
      waitForJob: vi.fn().mockResolvedValue({ outputPath: '/tmp/video.gif' }),
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosGifController],
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
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VideosGifController>(VideosGifController);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // --- createGif ---
  it('should create gif from video and return serialized ingredient', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const result = await controller.createGif(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(result).toBeDefined();
    expect(mockServices.fileQueueService.createGif).toHaveBeenCalled();
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalled();
  });

  it('should throw NOT_FOUND when video does not exist for gif creation', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    await expect(
      controller.createGif(mockRequest, mockUser, 'nonexistent'),
    ).rejects.toThrow(HttpException);
  });

  it('should pass fps and width options to createGif', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.createGif(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(mockServices.fileQueueService.createGif).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      'https://api.example.com/videos/507f1f77bcf86cd799439011',
      { fps: 10, width: 480 },
    );
  });

  it('should save ingredient with GIF category', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.createGif(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({ category: 'gif', extension: 'gif' }),
    );
  });

  it('should save ingredient with PROCESSING status', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.createGif(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({ status: 'processing' }),
    );
  });

  it('should include jobId in metadata of saved document', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.createGif(
      mockRequest,
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(mockServices.sharedService.saveDocuments).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        metadata: expect.objectContaining({
          jobId: 'job123',
          jobType: 'video-to-gif',
        }),
      }),
    );
  });

  // --- createReference ---
  it('should return reference endpoint response for existing video', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const result = await controller.createReference(
      mockUser,
      '507f1f77bcf86cd799439011',
    );
    expect(result).toEqual({
      message: 'Reference image generation endpoint',
      videoId: '507f1f77bcf86cd799439011',
    });
  });

  it('should throw NOT_FOUND when video does not exist for reference', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    await expect(
      controller.createReference(mockUser, 'nonexistent'),
    ).rejects.toThrow(HttpException);
  });
});
