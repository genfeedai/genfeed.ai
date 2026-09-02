import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { CaptionsService } from '@api/collections/captions/services/captions.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideoMergeOrchestrationService } from '@api/collections/videos/services/video-merge-orchestration.service';
import type { VideosService } from '@api/collections/videos/services/videos.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { WhisperService } from '@api/services/whisper/whisper.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CaptionFormat,
  CaptionLanguage,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
  VideoEaseCurve,
  VideoTransition,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import { FILE_JOB_TYPES as JOB_TYPES } from '@genfeedai/queue-contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';

describe('VideoMergeOrchestrationService', () => {
  const firstVideoId = 'video-1';
  const secondVideoId = 'video-2';
  const ingredientId = 'merged-video';
  const metadataId = 'merged-metadata';
  const activityId = 'merge-activity';
  const room = getUserRoomName('auth-user-id');
  const websocketUrl = `/videos/${ingredientId}`;
  const user = {
    brandId: 'brand-id',
    id: 'auth-user-id',
    organizationId: 'organization-id',
    userId: 'canonical-user-id',
  } as User;

  const activitiesService = {
    create: vi.fn(),
    patch: vi.fn(),
  };
  const captionsService = { create: vi.fn(), patch: vi.fn() };
  const configService = {
    ingredientsEndpoint: 'https://api.example.com/ingredients',
  };
  const fileQueueService = {
    processVideo: vi.fn(),
    waitForJob: vi.fn(),
  };
  const filesClientService = { uploadToS3: vi.fn() };
  const ingredientsService = { patch: vi.fn() };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const metadataService = { patch: vi.fn() };
  const sharedService = { createMediaDocuments: vi.fn() };
  const videosService = { findAll: vi.fn() };
  const websocketService = {
    publishBackgroundTaskUpdate: vi.fn(),
    publishMediaFailed: vi.fn(),
    publishVideoComplete: vi.fn(),
  };
  const whisperService = { generateCaptions: vi.fn() };

  let service: VideoMergeOrchestrationService;

  const makeDto = (
    overrides: Partial<CreateMergedVideoDto> = {},
  ): CreateMergedVideoDto =>
    ({
      category: IngredientCategory.VIDEO,
      ids: [firstVideoId, secondVideoId],
      isCaptionsEnabled: false,
      isResizeEnabled: false,
      ...overrides,
    }) as CreateMergedVideoDto;

  const arrangeCreatedMerge = () => {
    videosService.findAll.mockResolvedValue({
      docs: [{ id: firstVideoId }, { id: secondVideoId }],
      total: 2,
    });
    sharedService.createMediaDocuments.mockResolvedValue({
      ingredientData: {
        id: ingredientId,
        status: IngredientStatus.PROCESSING,
      },
      metadataData: { id: metadataId },
    });
    activitiesService.create.mockResolvedValue({ id: activityId });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    activitiesService.patch.mockResolvedValue(undefined);
    captionsService.create.mockResolvedValue({
      content: 'caption content',
      id: 'caption-1',
    });
    captionsService.patch.mockResolvedValue({ content: 'caption content' });
    fileQueueService.processVideo.mockResolvedValue({ jobId: 'merge-job' });
    fileQueueService.waitForJob.mockResolvedValue({
      outputPath: '/tmp/merged.mp4',
    });
    filesClientService.uploadToS3.mockResolvedValue({
      duration: 30,
      height: 1080,
      size: 10_000,
      width: 1920,
    });
    ingredientsService.patch.mockResolvedValue(undefined);
    metadataService.patch.mockResolvedValue(undefined);
    websocketService.publishBackgroundTaskUpdate.mockResolvedValue(undefined);
    websocketService.publishMediaFailed.mockResolvedValue(undefined);
    websocketService.publishVideoComplete.mockResolvedValue(undefined);
    whisperService.generateCaptions.mockResolvedValue('caption content');

    service = new VideoMergeOrchestrationService(
      activitiesService as unknown as ActivitiesService,
      captionsService as unknown as CaptionsService,
      configService as unknown as ConfigService,
      fileQueueService as unknown as FileQueueService,
      filesClientService as unknown as FilesClientService,
      ingredientsService as unknown as IngredientsService,
      loggerService as unknown as LoggerService,
      metadataService as unknown as MetadataService,
      sharedService as unknown as SharedService,
      videosService as unknown as VideosService,
      websocketService as unknown as NotificationsPublisherService,
      whisperService as unknown as WhisperService,
    );
  });

  it('validates unique owned videos while preserving duplicate source order and returns before queue completion', async () => {
    const dto = makeDto({
      ids: [firstVideoId, firstVideoId, secondVideoId],
    });
    arrangeCreatedMerge();
    fileQueueService.processVideo.mockReturnValue(new Promise(() => {}));

    await expect(service.mergeVideos(user, dto)).resolves.toMatchObject({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    expect(videosService.findAll).toHaveBeenCalledWith(
      {
        where: {
          category: IngredientCategory.VIDEO,
          id: { in: [firstVideoId, secondVideoId] },
          status: {
            in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
          userId: user.userId,
        },
      },
      expect.objectContaining({ pagination: false }),
    );
    expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(user, {
      brandId: user.brandId,
      category: IngredientCategory.VIDEO,
      extension: MetadataExtension.MP4,
      order: 1,
      organizationId: user.organizationId,
      sourceIds: [firstVideoId, firstVideoId, secondVideoId],
      status: IngredientStatus.PROCESSING,
    });
    expect(activitiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: user.brandId,
        entityId: ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.WEB,
        userId: user.userId,
        value: JSON.stringify({
          frameCount: 3,
          ingredientId,
          label: 'Merging 3 videos',
          type: 'merge',
        }),
      }),
    );
    expect(fileQueueService.waitForJob).not.toHaveBeenCalled();
  });

  it('rejects before creating output when any unique video is unavailable', async () => {
    videosService.findAll.mockResolvedValue({
      docs: [{ id: firstVideoId }],
      total: 1,
    });

    await expect(service.mergeVideos(user, makeDto())).rejects.toMatchObject({
      response: {
        detail: 'Found 1 of 2 videos with COMPLETED or VALIDATED status',
        title: 'Videos not available',
      },
      status: 400,
    });

    expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
  });

  it('preserves merge, portrait, caption, upload, persistence, and completion orchestration', async () => {
    const dto = makeDto({
      isCaptionsEnabled: true,
      isMuteVideoAudio: true,
      isResizeEnabled: true,
      music: 'music-id',
      musicVolume: 25,
      transition: VideoTransition.FADE,
      transitionDuration: 0.75,
      transitionEaseCurve: VideoEaseCurve.EASE_IN_OUT_SINE,
      zoomConfigs: [{ endZoom: 1.2, startZoom: 1 }],
      zoomEaseCurve: VideoEaseCurve.EASE_IN_OUT_CUBIC,
    });
    arrangeCreatedMerge();
    fileQueueService.processVideo
      .mockResolvedValueOnce({ jobId: 'merge-job' })
      .mockResolvedValueOnce({ jobId: 'portrait-job' })
      .mockResolvedValueOnce({ jobId: 'captions-job' });
    fileQueueService.waitForJob
      .mockResolvedValueOnce({ outputPath: '/tmp/merged.mp4' })
      .mockResolvedValueOnce({ outputPath: '/tmp/portrait.mp4' })
      .mockResolvedValueOnce({ outputPath: '/tmp/captioned.mp4' });

    const processingIngredient = await service.mergeVideos(user, dto);

    expect(processingIngredient).toMatchObject({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });
    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(1, {
      ingredientId,
      organizationId: user.organizationId,
      params: {
        isMuteVideoAudio: true,
        music: 'music-id',
        musicVolume: 0.25,
        sourceIds: [firstVideoId, secondVideoId],
        transition: VideoTransition.FADE,
        transitionDuration: 0.75,
        transitionEaseCurve: VideoEaseCurve.EASE_IN_OUT_SINE,
        zoomConfigs: [{ endZoom: 1.2, startZoom: 1 }],
        zoomEaseCurve: VideoEaseCurve.EASE_IN_OUT_CUBIC,
      },
      room,
      type: JOB_TYPES.MERGE_VIDEOS,
      userId: user.userId,
      websocketUrl,
    });

    await vi.waitFor(() => {
      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' }),
      );
    });

    expect(fileQueueService.waitForJob).toHaveBeenNthCalledWith(
      1,
      'merge-job',
      300_000,
    );
    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(2, {
      ingredientId,
      organizationId: user.organizationId,
      params: {
        height: 1920,
        inputPath: `${configService.ingredientsEndpoint}/videos/${ingredientId}`,
        width: 1080,
      },
      room,
      type: JOB_TYPES.CONVERT_TO_PORTRAIT,
      userId: user.userId,
      websocketUrl,
    });
    expect(fileQueueService.waitForJob).toHaveBeenNthCalledWith(
      2,
      'portrait-job',
      180_000,
    );
    expect(filesClientService.uploadToS3).toHaveBeenNthCalledWith(
      1,
      ingredientId,
      'videos',
      { path: '/tmp/portrait.mp4', type: FileInputType.FILE },
    );
    expect(whisperService.generateCaptions).toHaveBeenCalledWith(ingredientId);
    expect(captionsService.create).toHaveBeenCalledWith({
      content: null,
      format: CaptionFormat.SRT,
      ingredientId,
      isDeleted: false,
      language: CaptionLanguage.EN,
      organizationId: user.organizationId,
      userId: user.userId,
    });
    expect(captionsService.create.mock.invocationCallOrder[0]).toBeLessThan(
      captionsService.patch.mock.invocationCallOrder[0],
    );
    expect(fileQueueService.processVideo).toHaveBeenNthCalledWith(3, {
      ingredientId,
      organizationId: user.organizationId,
      params: {
        captionContent: 'caption content',
        inputPath: `${configService.ingredientsEndpoint}/videos/${ingredientId}`,
      },
      room,
      type: 'add-captions',
      userId: user.userId,
      websocketUrl,
    });
    expect(fileQueueService.waitForJob).toHaveBeenNthCalledWith(
      3,
      'captions-job',
      180_000,
    );
    expect(filesClientService.uploadToS3).toHaveBeenNthCalledWith(
      2,
      ingredientId,
      'videos',
      { path: '/tmp/captioned.mp4', type: FileInputType.FILE },
    );
    expect(metadataService.patch).toHaveBeenCalledWith(metadataId, {
      duration: 30,
      height: 1080,
      size: 10_000,
      width: 1920,
    });
    expect(ingredientsService.patch).toHaveBeenCalledWith(ingredientId, {
      status: IngredientStatus.GENERATED,
      transformations: [TransformationCategory.MERGED],
    });
    expect(websocketService.publishVideoComplete).toHaveBeenCalledWith(
      websocketUrl,
      {
        eventType: WebSocketEventType.VIDEO_MERGED,
        id: ingredientId,
        status: WebSocketEventStatus.COMPLETED,
        transformation: TransformationCategory.MERGED,
      },
      user.id,
      room,
    );
    expect(activitiesService.patch).toHaveBeenCalledWith(activityId, {
      key: ActivityKey.VIDEO_COMPLETED,
      value: JSON.stringify({
        frameCount: 2,
        ingredientId,
        label: 'Merged 2 videos',
        progress: 100,
        resultId: ingredientId,
        resultType: 'VIDEO',
        type: 'merge',
      }),
    });
    expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith({
      activityId,
      label: 'Merged 2 videos',
      progress: 100,
      resultId: ingredientId,
      resultType: 'VIDEO',
      room,
      status: 'completed',
      taskId: ingredientId,
      userId: user.id,
    });
  });

  it('keeps caption generation failure non-fatal and completes with the uncaptioned output', async () => {
    arrangeCreatedMerge();
    whisperService.generateCaptions.mockRejectedValueOnce(
      new Error('whisper unavailable'),
    );

    await service.mergeVideos(user, makeDto({ isCaptionsEnabled: true }));

    await vi.waitFor(() => {
      expect(websocketService.publishVideoComplete).toHaveBeenCalled();
    });

    expect(loggerService.error).toHaveBeenCalledWith(
      `Failed to generate or add captions for merged video ${ingredientId}`,
      expect.objectContaining({ message: 'whisper unavailable' }),
    );
    expect(filesClientService.uploadToS3).toHaveBeenNthCalledWith(
      2,
      ingredientId,
      'videos',
      { path: '/tmp/merged.mp4', type: FileInputType.FILE },
    );
    expect(ingredientsService.patch).toHaveBeenCalledWith(ingredientId, {
      status: IngredientStatus.GENERATED,
      transformations: [TransformationCategory.MERGED],
    });
    expect(websocketService.publishMediaFailed).not.toHaveBeenCalled();
  });

  it('preserves fire-and-forget failure logging, status, websocket, and activity payloads', async () => {
    arrangeCreatedMerge();
    fileQueueService.processVideo.mockRejectedValueOnce(
      new Error('queue unavailable'),
    );

    await expect(service.mergeVideos(user, makeDto())).resolves.toMatchObject({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    await vi.waitFor(() => {
      expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    expect(loggerService.error).toHaveBeenCalledWith(
      `${websocketUrl} mergeVideos failed`,
      expect.objectContaining({
        error: 'queue unavailable',
        ingredientId,
        stack: expect.any(String),
      }),
    );
    expect(ingredientsService.patch).toHaveBeenCalledWith(ingredientId, {
      status: IngredientStatus.FAILED,
    });
    expect(websocketService.publishMediaFailed).toHaveBeenCalledWith(
      websocketUrl,
      'Failed to merge videos: queue unavailable',
      user.id,
      room,
    );
    expect(activitiesService.patch).toHaveBeenCalledWith(activityId, {
      key: ActivityKey.VIDEO_FAILED,
      value: JSON.stringify({
        error: 'queue unavailable',
        frameCount: 2,
        ingredientId,
        label: 'Merge failed',
        type: 'merge',
      }),
    });
    expect(websocketService.publishBackgroundTaskUpdate).toHaveBeenCalledWith({
      activityId,
      error: 'queue unavailable',
      label: 'Merge failed',
      room,
      status: 'failed',
      taskId: ingredientId,
      userId: user.id,
    });
  });
});
