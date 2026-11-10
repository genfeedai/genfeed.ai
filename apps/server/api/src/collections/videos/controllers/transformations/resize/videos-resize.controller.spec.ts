import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
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
import { ingredientRowWorld } from '@api-test/fixtures/ingredient-row.world';
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
    configService: {
      ingredientsEndpoint: 'https://api.example.com',
      isAuthorizedMediaDeliveryEnabled: false,
    },
    authorizedMediaUrls: { issueServerPublish: vi.fn() },
    fileQueueService: {
      processVideo: vi.fn().mockResolvedValue({ jobId: 'job123' }),
      waitForJob: vi.fn().mockResolvedValue({ outputPath: '/tmp/video.mp4' }),
    },
    filesClientService: { uploadToS3: vi.fn() },
    ingredientsService: { patchAll: vi.fn() },
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

  let ingredientRow: Record<string, unknown>;

  beforeEach(async () => {
    ingredientRow = {
      id: ingredientId,
      isDeleted: false,
      organizationId,
      status: IngredientStatus.PROCESSING,
    };
    mockServices.ingredientsService.patchAll.mockImplementation(
      ingredientRowWorld(ingredientRow).patchAll,
    );
    mockServices.configService.isAuthorizedMediaDeliveryEnabled = false;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosResizeController],
      providers: [
        {
          provide: AuthorizedMediaUrlService,
          useValue: mockServices.authorizedMediaUrls,
        },
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

  it('uses the freshly authorized source URL when media delivery is activated', async () => {
    mockServices.configService.isAuthorizedMediaDeliveryEnabled = true;
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.authorizedMediaUrls.issueServerPublish.mockResolvedValueOnce(
      new Map([
        [videoId, 'https://authorized.test/random-source?signature=grant'],
      ]),
    );
    const result = await controller.resizeVideo(
      mockRequest,
      mockUser,
      videoId,
      {
        height: 1080,
        width: 1920,
      },
    );
    expect(result).toMatchObject({ data: { type: 'ingredient' } });
    expect(
      mockServices.authorizedMediaUrls.issueServerPublish,
    ).toHaveBeenCalledWith(mockUser.organizationId.toString(), [videoId]);
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          inputPath: 'https://authorized.test/random-source?signature=grant',
        }),
      }),
    );
  });

  it('rejects an issuer scope denial before queueing a transformation', async () => {
    mockServices.configService.isAuthorizedMediaDeliveryEnabled = true;
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.authorizedMediaUrls.issueServerPublish.mockRejectedValueOnce(
      new Error('Scoped media unavailable'),
    );
    await expect(
      controller.resizeVideo(mockRequest, mockUser, videoId, {
        height: 1080,
        width: 1920,
      }),
    ).rejects.toThrow('Scoped media unavailable');
    expect(mockServices.fileQueueService.processVideo).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

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

    type VideoRow = (typeof videoRows)[number];
    type VideoWhere = Record<string, unknown> & { OR?: VideoWhere[] };

    const matchesWhere = (row: VideoRow, where: VideoWhere): boolean =>
      Object.entries(where).every(([key, value]) =>
        key === 'OR'
          ? (value as VideoWhere[]).some((branch) => matchesWhere(row, branch))
          : row[key as keyof VideoRow] === value,
      );

    beforeEach(() => {
      mockServices.videosService.findOne.mockImplementation(
        async (where: VideoWhere) =>
          videoRows.find((row) => matchesWhere(row, where)) ?? null,
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
    const result = await controller.resizeVideo(
      mockRequest,
      mockUser,
      videoId,
      resizeParams,
    );
    expect(result).toMatchObject({ data: { type: 'ingredient' } });

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
    expect(ingredientRow).toEqual({
      id: ingredientId,
      isDeleted: false,
      organizationId,
      status: IngredientStatus.GENERATED,
      transformations: [TransformationCategory.RESIZED],
    });
  });

  it('keeps a resize the user cancelled while it ran failed and silent (#9735)', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.fileQueueService.waitForJob.mockImplementationOnce(
      async () => {
        Object.assign(ingredientRow, {
          generationError: 'Cancelled by user',
          status: IngredientStatus.FAILED,
        });
        return { outputPath: '/tmp/video.mp4' };
      },
    );
    mockServices.filesClientService.uploadToS3.mockResolvedValue({
      s3Key: 'videos/resized.mp4',
    });
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    const result = await controller.resizeVideo(
      mockRequest,
      mockUser,
      videoId,
      resizeParams,
    );
    expect(result).toMatchObject({ data: { type: 'ingredient' } });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(ingredientRow).toEqual({
      generationError: 'Cancelled by user',
      id: ingredientId,
      isDeleted: false,
      organizationId,
      status: IngredientStatus.FAILED,
    });
    expect(
      mockServices.websocketService.publishVideoComplete,
    ).not.toHaveBeenCalled();
    expect(mockServices.metadataService.patch).not.toHaveBeenCalled();
  });

  it('does not publish VIDEO_RESIZED when the resize job fails', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    mockServices.fileQueueService.waitForJob.mockRejectedValueOnce(
      new Error('ffmpeg failed'),
    );
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    const result = await controller.resizeVideo(
      mockRequest,
      mockUser,
      videoId,
      resizeParams,
    );
    expect(result).toMatchObject({ data: { type: 'ingredient' } });

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
    const result = await controller.resizeVideo(
      mockRequest,
      mockUser,
      videoId,
      resizeParams,
    );
    expect(result).toMatchObject({ data: { type: 'ingredient' } });
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

  describe('resizeToPortrait source lookup', () => {
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

    type VideoRow = (typeof videoRows)[number];
    type VideoWhere = Record<string, unknown> & { OR?: VideoWhere[] };

    const matchesWhere = (row: VideoRow, where: VideoWhere): boolean =>
      Object.entries(where).every(([key, value]) =>
        key === 'OR'
          ? (value as VideoWhere[]).some((branch) => matchesWhere(row, branch))
          : row[key as keyof VideoRow] === value,
      );

    beforeEach(() => {
      mockServices.videosService.findOne.mockImplementation(
        async (where: VideoWhere) =>
          videoRows.find((row) => matchesWhere(row, where)) ?? null,
      );
    });

    it('scopes the lookup to the caller organization and live videos', async () => {
      await controller.resizeToPortrait(mockRequest, mockUser, videoId);
      expect(mockServices.videosService.findOne).toHaveBeenCalledWith({
        id: videoId,
        isDeleted: false,
        organizationId,
      });
    });

    it('returns NOT_FOUND for a soft-deleted video', async () => {
      await expect(
        controller.resizeToPortrait(mockRequest, mockUser, deletedVideoId),
      ).rejects.toThrow(HttpException);
      expect(mockServices.fileQueueService.processVideo).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND for a video owned by the user in another organization', async () => {
      await expect(
        controller.resizeToPortrait(mockRequest, mockUser, foreignVideoId),
      ).rejects.toThrow(HttpException);
      expect(mockServices.fileQueueService.processVideo).not.toHaveBeenCalled();
    });
  });

  it('should set parent to original video for resize', async () => {
    mockServices.videosService.findOne.mockResolvedValue(mockVideo);
    const resizeParams: IResizeBodyParams = { height: 1080, width: 1920 };
    const result = await controller.resizeVideo(
      mockRequest,
      mockUser,
      videoId,
      resizeParams,
    );
    expect(result).toMatchObject({ data: { type: 'ingredient' } });
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
    const result = await controller.resizeVideo(
      mockRequest,
      mockUser,
      videoId,
      resizeParams,
    );
    expect(result).toMatchObject({ data: { type: 'ingredient' } });
    expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          inputPath: `https://api.example.com/videos/${videoId}`,
        }),
      }),
    );
  });
});
