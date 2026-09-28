import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/contracts';
import type { IResizeBodyParams } from '@genfeedai/contracts/interfaces';
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
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
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

const ingredientId = 'cmvideo0000000000000000002';
const metadataId = 'cmmetadata0000000000000001';

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
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: ingredientId },
        metadataData: { id: metadataId },
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
      videoId,
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

  describe('resizeVideo source lookup', () => {
    const deletedVideoId = 'cmvideo0000000000000000003';
    const foreignVideoId = 'cmvideo0000000000000000004';
    const videoRows = [
      { ...mockVideo, isDeleted: false },
      { ...mockVideo, id: deletedVideoId, isDeleted: true },
      {
        ...mockVideo,
        id: foreignVideoId,
        isDeleted: false,
        organizationId: 'cmorganization000000000000002',
      },
    ];

    beforeEach(() => {
      mockServices.videosService.findOne.mockImplementation(
        async (where: Record<string, unknown>) =>
          videoRows.find((row) =>
            Object.entries(where).every(
              ([key, value]) => row[key as keyof typeof row] === value,
            ),
          ) ?? null,
      );
    });

    it('scopes the lookup to the caller organization and live videos', async () => {
      const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
      await controller.resizeVideo(
        mockRequest,
        mockUser,
        videoId,
        resizeParams,
      );
      expect(mockServices.videosService.findOne).toHaveBeenCalledWith({
        id: videoId,
        isDeleted: false,
        organizationId,
      });
    });

    it('returns NOT_FOUND for a soft-deleted video', async () => {
      const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
      await expect(
        controller.resizeVideo(
          mockRequest,
          mockUser,
          deletedVideoId,
          resizeParams,
        ),
      ).rejects.toThrow(HttpException);
      expect(mockServices.fileQueueService.processVideo).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND for a video owned by the user in another organization', async () => {
      const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
      await expect(
        controller.resizeVideo(
          mockRequest,
          mockUser,
          foreignVideoId,
          resizeParams,
        ),
      ).rejects.toThrow(HttpException);
      expect(mockServices.fileQueueService.processVideo).not.toHaveBeenCalled();
    });
  });

  it('publishes VIDEO_RESIZED after the resized ingredient is generated', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.filesClientService.uploadToS3.mockResolvedValue({
      height: 1080,
      width: 1920,
    });
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    await controller.resizeVideo(mockRequest, mockUser, videoId, resizeParams);

    await vi.waitFor(() =>
      expect(
        mockServices.websocketService.publishVideoComplete,
      ).toHaveBeenCalledOnce(),
    );
    expect(
      mockServices.websocketService.publishVideoComplete,
    ).toHaveBeenCalledWith(
      `/videos/${ingredientId}`,
      {
        eventType: WebSocketEventType.VIDEO_RESIZED,
        id: ingredientId,
        status: WebSocketEventStatus.COMPLETED,
        transformation: TransformationCategory.RESIZED,
      },
      mockUser.id,
      `user:${mockUser.id}`,
    );
    expect(mockServices.ingredientsService.patch).toHaveBeenCalledWith(
      ingredientId,
      {
        status: IngredientStatus.GENERATED,
        transformations: [TransformationCategory.RESIZED],
      },
    );
    expect(
      mockServices.ingredientsService.patch.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockServices.websocketService.publishVideoComplete.mock
        .invocationCallOrder[0],
    );
  });

  it('does not publish VIDEO_RESIZED when the resize job fails', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.fileQueueService.waitForJob.mockRejectedValueOnce(
      new Error('ffmpeg failed'),
    );
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    await controller.resizeVideo(mockRequest, mockUser, videoId, resizeParams);

    await vi.waitFor(() =>
      expect(mockServices.loggerService.error).toHaveBeenCalledOnce(),
    );
    expect(
      mockServices.websocketService.publishVideoComplete,
    ).not.toHaveBeenCalled();
  });

  it('should create ingredient with PROCESSING status and VIDEO category', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const resizeParams: IResizeBodyParams = { height: 480, width: 640 };
    await controller.resizeVideo(mockRequest, mockUser, videoId, resizeParams);
    expect(
      mockServices.sharedService.createMediaDocuments,
    ).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        status: IngredientStatus.PROCESSING,
      }),
    );
  });

  // --- resizeToPortrait ---
  it('should resize to portrait (1080x1920) and return result', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const result = await controller.resizeToPortrait(
      mockRequest,
      mockUser,
      videoId,
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
    await controller.resizeVideo(mockRequest, mockUser, videoId, resizeParams);
    expect(
      mockServices.sharedService.createMediaDocuments,
    ).toHaveBeenCalledWith(
      mockUser,
      expect.objectContaining({
        parentId: videoId,
      }),
    );
  });

  it('should include inputPath in processVideo params', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    await controller.resizeVideo(mockRequest, mockUser, videoId, resizeParams);
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          inputPath: `https://api.example.com/videos/${videoId}`,
        }),
      }),
    );
  });
});
