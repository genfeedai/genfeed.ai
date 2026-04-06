import fs from 'node:fs';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import type { EditorProjectDocument } from '@api/collections/editor-projects/schemas/editor-project.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ConfigService } from '@api/config/config.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import {
  EditorTrackType,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import type { IFileProcessingParams } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Types } from 'mongoose';

interface RenderResult {
  jobId: string;
  projectId: string;
  status: string;
}

@Injectable()
export class EditorRenderService {
  constructor(
    private readonly configService: ConfigService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly fileQueueService: FileQueueService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async render(id: string, orgId: string, user: User): Promise<RenderResult> {
    const publicMetadata = user.publicMetadata as Record<string, string>;

    // Atomic CAS: only transitions DRAFT/COMPLETED/FAILED -> RENDERING
    const project = await this.editorProjectsService.markAsRendering(id, orgId);

    try {
      this.validateMvpConstraints(project);

      const renderParams = await this.extractRenderParams(project, orgId);

      const { metadataData, ingredientData } =
        await this.sharedService.saveDocuments(user, {
          brand: renderParams.brand,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          height: renderParams.height,
          organization: new Types.ObjectId(orgId),
          parent: new Types.ObjectId(renderParams.videoId),
          status: IngredientStatus.PROCESSING,
          width: renderParams.width,
        });

      const jobResponse = await this.fileQueueService.processVideo({
        clerkUserId: user.id,
        ingredientId: ingredientData._id.toString(),
        organizationId: orgId,
        params: renderParams.jobParams,
        room: getUserRoomName(user.id),
        type: renderParams.jobType,
        userId: publicMetadata.user,
        websocketUrl: `/videos/${ingredientData._id}`,
      });

      // Handle async completion in background
      this.handleAsyncCompletion(
        id,
        ingredientData._id.toString(),
        metadataData._id.toString(),
        jobResponse.jobId,
        renderParams.hasTextOverlay,
        renderParams.textLabel,
        user,
      );

      return {
        jobId: jobResponse.jobId,
        projectId: id,
        status: 'rendering',
      };
    } catch (error: unknown) {
      // Rollback status to FAILED on post-transition failure
      await this.editorProjectsService.markAsFailed(id);
      throw error;
    }
  }

  private validateMvpConstraints(project: EditorProjectDocument): void {
    const videoTracks = project.tracks.filter(
      (t) => t.type === EditorTrackType.VIDEO,
    );
    const textTracks = project.tracks.filter(
      (t) => t.type === EditorTrackType.TEXT,
    );

    if (videoTracks.length === 0) {
      throw new UnprocessableEntityException(
        'Project must have at least 1 video track to render',
      );
    }

    if (videoTracks.length > 1) {
      throw new UnprocessableEntityException(
        'Multi-track rendering is not yet supported. Please use a single video track.',
      );
    }

    const videoTrack = videoTracks[0];
    if (videoTrack.clips.length === 0) {
      throw new UnprocessableEntityException(
        'Video track must have at least 1 clip',
      );
    }

    if (videoTrack.clips.length > 1) {
      throw new UnprocessableEntityException(
        'Multi-clip timelines are not yet supported. Please use a single video clip.',
      );
    }

    if (textTracks.length > 1) {
      throw new UnprocessableEntityException(
        'Only 1 text track is supported for rendering in the current version.',
      );
    }

    if (textTracks.length === 1 && textTracks[0].clips.length > 1) {
      throw new UnprocessableEntityException(
        'Only 1 text clip is supported for rendering in the current version.',
      );
    }
  }

  private async extractRenderParams(
    project: EditorProjectDocument,
    orgId: string,
  ) {
    const videoTrack = project.tracks.find(
      (t) => t.type === EditorTrackType.VIDEO,
    )!;
    const textTrack = project.tracks.find(
      (t) => t.type === EditorTrackType.TEXT,
    );

    const clip = videoTrack.clips[0];
    const videoId = clip.ingredientId;
    const fps = project.settings?.fps || 30;

    // Validate source video ownership
    const video = await this.ingredientsService.findOne({
      _id: new Types.ObjectId(videoId),
      category: IngredientCategory.VIDEO,
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!video) {
      throw new NotFoundException('Source video not found');
    }

    const metadata = await this.metadataService.findOne({
      ingredient: videoId,
    });

    const width = metadata?.width || 1920;
    const height = metadata?.height || 1080;
    const totalSourceDuration = metadata?.duration || 10;

    // Determine trim
    const sourceStartFrame = clip.sourceStartFrame || 0;
    const sourceEndFrame =
      clip.sourceEndFrame || Math.round(totalSourceDuration * fps);

    const startTime = sourceStartFrame / fps;
    const endTime = sourceEndFrame / fps;

    const isTrimmed =
      sourceStartFrame > 0 || endTime < totalSourceDuration - 0.1;

    // Check for text overlay
    const textClip =
      textTrack && textTrack.clips.length > 0 ? textTrack.clips[0] : undefined;
    const hasTextOverlay = !!textClip?.textOverlay?.text;
    const textLabel = hasTextOverlay ? textClip!.textOverlay!.text : '';

    const videoUrl = `${this.configService.ingredientsEndpoint}/videos/${videoId}`;

    let jobType: string;
    let jobParams: IFileProcessingParams;

    if (hasTextOverlay) {
      jobType = 'add-text-overlay';
      jobParams = {
        height,
        inputPath: videoUrl,
        position: textClip!.textOverlay!.position || 'top',
        text: textClip!.textOverlay!.text,
        width,
        ...(isTrimmed ? { endTime, startTime } : {}),
      };
    } else if (isTrimmed) {
      jobType = 'trim-video';
      jobParams = {
        endTime,
        inputPath: videoUrl,
        startTime,
      };
    } else {
      // No trim, no text — queue a copy job
      jobType = 'trim-video';
      jobParams = {
        endTime: totalSourceDuration,
        inputPath: videoUrl,
        startTime: 0,
      };
    }

    return {
      brand: video.brand
        ? new Types.ObjectId(video.brand.toString())
        : undefined,
      hasTextOverlay,
      height,
      jobParams,
      jobType,
      textLabel,
      videoId,
      width,
    };
  }

  private handleAsyncCompletion(
    projectId: string,
    ingredientId: string,
    metadataId: string,
    jobId: string,
    hasTextOverlay: boolean,
    textLabel: string,
    user: User,
  ): void {
    this.fileQueueService
      .waitForJob(jobId, 120000)
      .then(async (result) => {
        const output = (result as Record<string, string>).outputPath;
        const meta = await this.filesClientService.uploadToS3(
          ingredientId,
          'videos',
          {
            path: output,
            type: FileInputType.FILE,
          },
        );

        await this.metadataService.patch(metadataId, {
          duration: meta.duration,
          height: meta.height,
          label: hasTextOverlay ? `Editor: ${textLabel}` : 'Editor Render',
          size: meta.size,
          width: meta.width,
        });

        await this.ingredientsService.patch(ingredientId, {
          status: IngredientStatus.GENERATED,
        });

        await this.editorProjectsService.markAsCompleted(
          projectId,
          ingredientId.toString(),
        );

        const websocketUrl = WebSocketPaths.video(ingredientId);
        await this.websocketService.publishVideoComplete(
          websocketUrl,
          {
            eventType: WebSocketEventType.VIDEO_TRIMMED,
            id: ingredientId,
            status: WebSocketEventStatus.COMPLETED,
          },
          user.id,
          getUserRoomName(user.id),
        );

        try {
          fs.unlinkSync(output);
        } catch (cleanupError: unknown) {
          this.loggerService.warn(
            `Failed to cleanup temp file: ${output}`,
            cleanupError,
          );
        }
      })
      .catch(async (error: unknown) => {
        this.loggerService.error('Editor project render failed', error);

        await this.editorProjectsService.markAsFailed(projectId);

        const websocketUrl = WebSocketPaths.video(ingredientId);
        await this.websocketService.publishMediaFailed(
          websocketUrl,
          'Failed to render project. Please try again.',
          user.id,
          getUserRoomName(user.id),
        );
      });
  }
}
