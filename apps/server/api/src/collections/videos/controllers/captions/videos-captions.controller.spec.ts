vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((source, id) => ({
    message: `${source} ${id} not found`,
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosCaptionsController } from '@api/collections/videos/controllers/captions/videos-captions.controller';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const videoId = testId('video');
const captionId = testId('caption');
const brandId = testId('brand');
const organizationId = testId('org');
const userId = testId('user');
const ingredientId = testId('ingredient');
const metadataId = testId('metadata');

describe('VideosCaptionsController', () => {
  let controller: VideosCaptionsController;
  let videosService: VideosService;
  let captionsService: CaptionsService;

  const mockReq = {} as Request;

  const mockVideo = {
    brandId,
    captions: [
      {
        content: 'Test caption content',
        format: 'srt',
        id: captionId,
        language: 'en',
      },
    ],
    id: videoId,
    organizationId,
    userId,
  };

  const mockUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
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
    sharedService: { createMediaDocuments: vi.fn() },
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

  const deletedVideoId = testId('video', 2);
  const foreignVideoId = testId('video', 3);
  const videoRows = [
    { ...mockVideo, isDeleted: false },
    { ...mockVideo, id: deletedVideoId, isDeleted: true },
    {
      ...mockVideo,
      id: foreignVideoId,
      isDeleted: false,
      organizationId: testId('org', 2),
    },
  ];

  const deletedCaptionId = testId('caption', 2);
  const foreignCaptionId = testId('caption', 3);
  const captionRows = [
    { ...mockVideo.captions[0], isDeleted: false, organizationId },
    {
      ...mockVideo.captions[0],
      id: deletedCaptionId,
      isDeleted: true,
      organizationId,
    },
    {
      ...mockVideo.captions[0],
      content: 'Other organization caption',
      id: foreignCaptionId,
      isDeleted: false,
      organizationId: testId('org', 2),
    },
  ];

  type RowWhere = Record<string, unknown> & { OR?: RowWhere[] };

  const matchesWhere = (
    row: Record<string, unknown>,
    where: RowWhere,
  ): boolean =>
    Object.entries(where).every(([key, value]) =>
      key === 'OR'
        ? (value as RowWhere[]).some((branch) => matchesWhere(row, branch))
        : row[key] === value,
    );

  const useVideoRows = () =>
    mockServices.videosService.findOne.mockImplementation(
      async (where: RowWhere) =>
        videoRows.find((row) => matchesWhere(row, where)) ?? null,
    );

  // Emulates Prisma applying the populated relation's `where` to `captions`.
  const useVideoRowsWithCaptions = (captions: Record<string, unknown>[]) =>
    mockServices.videosService.findOne.mockImplementation(
      async (where: RowWhere, populate: PopulateOption[] = []) => {
        const video = videoRows.find((row) => matchesWhere(row, where));
        if (!video) {
          return null;
        }

        const captionsWhere =
          populate.find((option) => option.path === 'captions')?.where ?? {};
        return {
          ...video,
          captions: captions.filter((row) => matchesWhere(row, captionsWhere)),
        };
      },
    );

  const useCaptionRows = () =>
    mockServices.captionsService.findOne.mockImplementation(
      async (where: RowWhere) =>
        captionRows.find((row) => matchesWhere(row, where)) ?? null,
    );

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCaptions', () => {
    it('should call videosService.findOne and return captions', async () => {
      const mockCaptionsData = { docs: [{ content: 'Test caption' }] };

      mockServices.videosService.findOne.mockResolvedValue(mockVideo);
      mockServices.captionsService.findAll.mockResolvedValue(mockCaptionsData);

      const result = await controller.getCaptions(
        mockReq,
        mockUser,
        videoId,
        new BaseQueryDto(),
      );

      expect(videosService.findOne).toHaveBeenCalledWith({
        id: videoId,
        isDeleted: false,
        organizationId: mockUser.organizationId,
      });
      expect(captionsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ingredientId: videoId,
            isDeleted: false,
            organizationId: mockUser.organizationId,
          },
        }),
        expect.anything(),
      );
      expect(result).toBeDefined();
    });

    it('should return not found when video does not exist', async () => {
      mockServices.videosService.findOne.mockResolvedValue(null);

      const result = await controller.getCaptions(
        mockReq,
        mockUser,
        videoId,
        new BaseQueryDto(),
      );

      expect(result).toHaveProperty('statusCode', 404);
    });

    it('returns not found for a soft-deleted video', async () => {
      useVideoRows();

      const result = await controller.getCaptions(
        mockReq,
        mockUser,
        deletedVideoId,
        new BaseQueryDto(),
      );

      expect(result).toHaveProperty('statusCode', 404);
      expect(captionsService.findAll).not.toHaveBeenCalled();
    });

    it('returns not found for a video owned by the user in another organization', async () => {
      useVideoRows();

      const result = await controller.getCaptions(
        mockReq,
        mockUser,
        foreignVideoId,
        new BaseQueryDto(),
      );

      expect(result).toHaveProperty('statusCode', 404);
      expect(captionsService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('createVideoWithCaptions', () => {
    it('should add captions to video', async () => {
      const createDto = { caption: captionId };

      mockServices.videosService.findOne.mockResolvedValue(mockVideo);
      mockServices.captionsService.findOne.mockResolvedValue(
        mockVideo.captions[0],
      );
      mockServices.sharedService.createMediaDocuments.mockResolvedValue({
        ingredientData: {
          id: ingredientId,
        },
        metadataData: {
          id: metadataId,
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

      expect(videosService.findOne).toHaveBeenCalledWith(
        {
          id: videoId,
          isDeleted: false,
          organizationId: mockUser.organizationId,
        },
        [
          {
            path: 'captions',
            where: {
              isDeleted: false,
              organizationId: mockUser.organizationId,
            },
          },
        ],
      );
      expect(result).toBeDefined();
    });

    it('returns not found for a soft-deleted video', async () => {
      useVideoRows();

      const result = await controller.createVideoWithCaptions(
        mockReq,
        mockUser,
        deletedVideoId,
        { caption: captionId },
      );

      expect(result).toHaveProperty('statusCode', 404);
      expect(
        mockServices.sharedService.createMediaDocuments,
      ).not.toHaveBeenCalled();
      expect(mockServices.fileQueueService.processVideo).not.toHaveBeenCalled();
    });

    it('returns not found for a video owned by the user in another organization', async () => {
      useVideoRows();

      const result = await controller.createVideoWithCaptions(
        mockReq,
        mockUser,
        foreignVideoId,
        { caption: captionId },
      );

      expect(result).toHaveProperty('statusCode', 404);
      expect(
        mockServices.sharedService.createMediaDocuments,
      ).not.toHaveBeenCalled();
      expect(mockServices.fileQueueService.processVideo).not.toHaveBeenCalled();
    });

    describe('caption lookup', () => {
      beforeEach(() => {
        useVideoRows();
        useCaptionRows();
        mockServices.sharedService.createMediaDocuments.mockResolvedValue({
          ingredientData: { id: ingredientId },
          metadataData: { id: metadataId },
        });
        mockServices.fileQueueService.processVideo.mockResolvedValue({
          jobId: 'job123',
        });
      });

      it('scopes the caption to the caller organization and burns its content', async () => {
        await controller.createVideoWithCaptions(mockReq, mockUser, videoId, {
          caption: captionId,
        });

        expect(captionsService.findOne).toHaveBeenCalledWith({
          id: captionId,
          isDeleted: false,
          organizationId: mockUser.organizationId,
        });
        expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({
              captionContent: 'Test caption content',
            }),
          }),
        );
      });

      it('returns not found for a soft-deleted caption', async () => {
        const result = await controller.createVideoWithCaptions(
          mockReq,
          mockUser,
          videoId,
          { caption: deletedCaptionId },
        );

        expect(result).toHaveProperty('statusCode', 404);
        expect(
          mockServices.sharedService.createMediaDocuments,
        ).not.toHaveBeenCalled();
        expect(
          mockServices.fileQueueService.processVideo,
        ).not.toHaveBeenCalled();
      });

      it('returns not found for a caption from another organization', async () => {
        const result = await controller.createVideoWithCaptions(
          mockReq,
          mockUser,
          videoId,
          { caption: foreignCaptionId },
        );

        expect(result).toHaveProperty('statusCode', 404);
        expect(
          mockServices.sharedService.createMediaDocuments,
        ).not.toHaveBeenCalled();
        expect(
          mockServices.fileQueueService.processVideo,
        ).not.toHaveBeenCalled();
      });

      it('skips a soft-deleted first caption when falling back to the populated captions', async () => {
        useVideoRowsWithCaptions([
          { ...captionRows[1], content: 'Deleted caption' },
          captionRows[2],
          captionRows[0],
        ]);

        await controller.createVideoWithCaptions(
          mockReq,
          mockUser,
          videoId,
          {},
        );

        expect(captionsService.findOne).not.toHaveBeenCalled();
        expect(mockServices.fileQueueService.processVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({
              captionContent: 'Test caption content',
            }),
          }),
        );
      });

      it('returns not found when every populated caption is soft-deleted', async () => {
        useVideoRowsWithCaptions([captionRows[1]]);

        const result = await controller.createVideoWithCaptions(
          mockReq,
          mockUser,
          videoId,
          {},
        );

        expect(result).toHaveProperty('statusCode', 404);
        expect(
          mockServices.sharedService.createMediaDocuments,
        ).not.toHaveBeenCalled();
        expect(
          mockServices.fileQueueService.processVideo,
        ).not.toHaveBeenCalled();
      });
    });

    it('should return not found when video does not exist', async () => {
      const createDto = { caption: captionId };

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
