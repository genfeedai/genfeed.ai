import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const mockRequest = {
  originalUrl: '/api/videos',
  params: {},
  query: {},
} as unknown as Request;

const videoId = 'cmvideo0000000000000000001';
const userId = 'cmuser0000000000000000001';
const organizationId = 'cmorganization000000000000001';
const brandId = 'cmbrand000000000000000001';

const mockVideo = {
  brandId,
  id: videoId,
  organizationId,
  userId,
};

const mockUser = {
  id: 'user_123',
  brandId: brandId,
  organizationId: organizationId,
  userId: userId,
} as unknown as User;

const ingredientId = 'cmgif000000000000000000001';
const metadataId = 'cmmetadata0000000000000001';

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
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: ingredientId },
        metadataData: { id: metadataId },
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
    const result = await controller.createGif(mockRequest, mockUser, videoId);
    expect(result).toBeDefined();
    expect(mockServices.fileQueueService.createGif).toHaveBeenCalled();
    expect(mockServices.sharedService.createMediaDocuments).toHaveBeenCalled();
  });

  it('should throw NOT_FOUND when video does not exist for gif creation', async () => {
    mockServices.videosService.findOne.mockResolvedValue(null);
    await expect(
      controller.createGif(mockRequest, mockUser, 'nonexistent'),
    ).rejects.toThrow(HttpException);
  });

  it('should pass fps and width options to createGif', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.createGif(mockRequest, mockUser, videoId);
    expect(mockServices.fileQueueService.createGif).toHaveBeenCalledWith(
      videoId,
      `https://api.example.com/videos/${videoId}`,
      { fps: 10, width: 480 },
    );
  });

  it('should save ingredient with GIF category', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.createGif(mockRequest, mockUser, videoId);
    expect(
      mockServices.sharedService.createMediaDocuments,
    ).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        category: IngredientCategory.GIF,
        extension: MetadataExtension.GIF,
      }),
    );
  });

  it('should save ingredient with PROCESSING status', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.createGif(mockRequest, mockUser, videoId);
    expect(
      mockServices.sharedService.createMediaDocuments,
    ).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({ status: IngredientStatus.PROCESSING }),
    );
  });

  it('should include jobId in metadata of saved document', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    await controller.createGif(mockRequest, mockUser, videoId);
    expect(
      mockServices.sharedService.createMediaDocuments,
    ).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        externalId: 'job123',
        externalProvider: 'video-to-gif',
      }),
    );
  });
});
