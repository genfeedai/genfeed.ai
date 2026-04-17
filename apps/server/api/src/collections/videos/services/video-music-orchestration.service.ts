import { FileInputType } from '@genfeedai/enums';
/**
 * Video + Music Orchestration Service
 *
 * Handles the unified workflow of generating video with background music:
 * 1. If backgroundMusic.ingredientId is provided, uses existing music
 * 2. If backgroundMusic.autoGenerate is provided, generates music in parallel with video
 * 3. Waits for both to complete
 * 4. Merges video with music
 * 5. Returns the final merged video
 */

import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { BackgroundMusicDto } from '@api/collections/videos/dto/create-video.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { JOB_TYPES } from '@files/queues/queue.constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  PromptCategory,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface OrchestrationContext {
  brandId: string;
  clerkUserId: string;
  organizationId: string;
  userId: string;
}

export interface MusicOrchestrationResult {
  musicIngredientId: string;
  wasGenerated: boolean;
}

@Injectable()
export class VideoMusicOrchestrationService {
  constructor(
    private readonly activitiesService: ActivitiesService,
    readonly _configService: ConfigService,
    readonly _failedGenerationService: FailedGenerationService,
    private readonly fileQueueService: FileQueueService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly musicsService: MusicsService,
    private readonly pollingService: PollingService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly promptsService: PromptsService,
    private readonly replicateService: ReplicateService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    readonly _videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  /**
   * Resolves the music ingredient to use for merging.
   * Either uses an existing ingredient or generates new music.
   */
  async resolveMusic(
    backgroundMusic: BackgroundMusicDto,
    videoDuration: number,
    context: OrchestrationContext,
  ): Promise<MusicOrchestrationResult | null> {
    // Option 1: Use existing music ingredient
    if (backgroundMusic.ingredientId) {
      const existingMusic = await this.musicsService.findOne({
        _id: new Types.ObjectId(backgroundMusic.ingredientId),
        isDeleted: false,
        organization: new Types.ObjectId(context.organizationId),
      });

      if (!existingMusic) {
        throw new HttpException(
          {
            detail: `Music ingredient ${backgroundMusic.ingredientId} not found or not accessible`,
            title: 'Music not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Verify music is ready
      if (existingMusic.status !== IngredientStatus.GENERATED) {
        throw new HttpException(
          {
            detail: `Music ingredient ${backgroundMusic.ingredientId} is not ready (status: ${existingMusic.status})`,
            title: 'Music not ready',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        musicIngredientId: existingMusic._id.toString(),
        wasGenerated: false,
      };
    }

    // Option 2: Auto-generate music
    if (backgroundMusic.autoGenerate) {
      const musicIngredientId = await this.generateMusic(
        backgroundMusic.autoGenerate.prompt || 'Background music',
        backgroundMusic.autoGenerate.duration || videoDuration,
        context,
      );

      return {
        musicIngredientId,
        wasGenerated: true,
      };
    }

    return null;
  }

  /**
   * Generates background music using MusicGen via Replicate
   */
  private async generateMusic(
    prompt: string,
    duration: number,
    context: OrchestrationContext,
  ): Promise<string> {
    // Get default music model
    const model = (await this.routerService.getDefaultModel(
      ModelCategory.MUSIC,
    )) as string;

    // Create prompt record
    const promptData = await this.promptsService.create(
      new PromptEntity({
        brand: new Types.ObjectId(context.brandId),
        category: PromptCategory.MODELS_PROMPT_MUSIC,
        model,
        organization: new Types.ObjectId(context.organizationId),
        original: prompt,
        user: new Types.ObjectId(context.userId),
      }),
    );

    // Create ingredient and metadata documents
    const { metadataData, ingredientData } =
      await this.sharedService.saveDocumentsInternal({
        brand: new Types.ObjectId(context.brandId),
        category: IngredientCategory.MUSIC,
        extension: MetadataExtension.MP3,
        organization: new Types.ObjectId(context.organizationId),
        prompt: promptData._id,
        status: IngredientStatus.PROCESSING,
        user: new Types.ObjectId(context.userId),
      });

    // Create activity
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: new Types.ObjectId(context.brandId),
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.MUSIC_PROCESSING,
        organization: new Types.ObjectId(context.organizationId),
        source: ActivitySource.MUSIC_GENERATION,
        user: new Types.ObjectId(context.userId),
        value: JSON.stringify({
          ingredientId: ingredientData._id.toString(),
          label: 'Background music for video',
          model,
          type: 'generation',
        }),
      }),
    );

    // Emit WebSocket event
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: 'Generating Background Music',
      progress: 0,
      room: getUserRoomName(context.clerkUserId),
      status: 'processing',
      taskId: ingredientData._id.toString(),
      userId: context.clerkUserId,
    });

    // Build prompt params
    const { input: promptParams } = await this.promptBuilderService.buildPrompt(
      model,
      {
        duration: Math.min(duration, 90), // MusicGen max is 90 seconds
        modelCategory: ModelCategory.MUSIC,
        prompt,
        seed: -1,
      },
    );

    // Start generation via Replicate
    const generationId = await this.replicateService.runModel(
      'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
      promptParams,
    );

    if (!generationId) {
      throw new HttpException(
        {
          detail: 'Failed to start music generation',
          title: 'Music generation failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Update metadata with external ID
    await this.metadataService.patch(metadataData._id, {
      externalId: generationId,
    });

    this.loggerService.log('Started background music generation', {
      duration,
      generationId,
      ingredientId: ingredientData._id.toString(),
      prompt,
    });

    return ingredientData._id.toString();
  }

  /**
   * Waits for music generation to complete
   */
  async waitForMusicCompletion(
    musicIngredientId: string,
    timeoutMs: number = 120000, // 2 minutes default for music
  ): Promise<void> {
    await this.pollingService.waitForIngredientCompletion(
      musicIngredientId,
      timeoutMs,
      3000, // Poll every 3 seconds
    );
  }

  /**
   * Merges video with background music
   */
  async mergeVideoWithMusic(
    videoIngredientId: string,
    musicIngredientId: string,
    musicVolume: number, // 0-100
    muteVideoAudio: boolean,
    context: OrchestrationContext,
  ): Promise<string> {
    // Create new ingredient for merged result
    const parentIds = [new Types.ObjectId(videoIngredientId)];

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocumentsInternal({
        brand: new Types.ObjectId(context.brandId),
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        organization: new Types.ObjectId(context.organizationId),
        sources: parentIds,
        status: IngredientStatus.PROCESSING,
        user: new Types.ObjectId(context.userId),
      });

    const mergedIngredientId = ingredientData._id.toString();
    const websocketUrl = WebSocketPaths.video(mergedIngredientId);

    // Create activity
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: new Types.ObjectId(context.brandId),
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.VIDEO_PROCESSING,
        organization: new Types.ObjectId(context.organizationId),
        source: ActivitySource.WEB,
        user: new Types.ObjectId(context.userId),
        value: JSON.stringify({
          ingredientId: mergedIngredientId,
          label: 'Adding background music to video',
          type: 'music-merge',
        }),
      }),
    );

    const activityId = activity._id.toString();

    // Emit WebSocket event
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId,
      label: 'Adding Background Music',
      progress: 0,
      room: getUserRoomName(context.clerkUserId),
      status: 'processing',
      taskId: mergedIngredientId,
      userId: context.clerkUserId,
    });

    // Queue merge operation
    try {
      const job = await this.fileQueueService.processVideo({
        clerkUserId: context.clerkUserId,
        ingredientId: mergedIngredientId,
        organizationId: context.organizationId,
        params: {
          isMuteVideoAudio: muteVideoAudio,
          music: musicIngredientId,
          musicVolume: musicVolume / 100, // Convert 0-100 to 0-1
          sourceIds: [videoIngredientId],
        },
        room: getUserRoomName(context.clerkUserId),
        type: JOB_TYPES.MERGE_VIDEOS,
        userId: context.userId,
        websocketUrl,
      });

      // Wait for job completion
      const result = await this.fileQueueService.waitForJob(job.jobId, 300000);

      // Upload to S3
      const meta = await this.filesClientService.uploadToS3(
        mergedIngredientId,
        'videos',
        {
          path: result.outputPath,
          type: FileInputType.FILE,
        },
      );

      // Update metadata
      await this.metadataService.patch(metadataData._id, {
        duration: meta.duration,
        height: meta.height,
        size: meta.size,
        width: meta.width,
      });

      // Update ingredient status
      await this.ingredientsService.patch(ingredientData._id, {
        status: IngredientStatus.GENERATED,
        transformations: [TransformationCategory.MERGED],
      });

      // Emit completion
      await this.websocketService.publishVideoComplete(
        websocketUrl,
        {
          eventType: WebSocketEventType.VIDEO_MERGED,
          id: ingredientData._id,
          status: WebSocketEventStatus.COMPLETED,
          transformation: TransformationCategory.MERGED,
        },
        context.clerkUserId,
        getUserRoomName(context.clerkUserId),
      );

      // Update activity
      await this.activitiesService.patch(activityId, {
        key: ActivityKey.VIDEO_COMPLETED,
        value: JSON.stringify({
          ingredientId: mergedIngredientId,
          label: 'Added background music to video',
          progress: 100,
          resultId: mergedIngredientId,
          resultType: 'VIDEO',
          type: 'music-merge',
        }),
      });

      await this.websocketService.publishBackgroundTaskUpdate({
        activityId,
        label: 'Background music added',
        progress: 100,
        resultId: mergedIngredientId,
        resultType: 'VIDEO',
        room: getUserRoomName(context.clerkUserId),
        status: 'completed',
        taskId: mergedIngredientId,
        userId: context.clerkUserId,
      });

      this.loggerService.log('Video merged with background music', {
        mergedIngredientId,
        musicIngredientId,
        musicVolume,
        videoIngredientId,
      });

      return mergedIngredientId;
    } catch (error: unknown) {
      const errorMessage =
        (error as Error)?.message || 'Unknown error during merge';

      this.loggerService.error('Failed to merge video with music', {
        error: errorMessage,
        mergedIngredientId,
        musicIngredientId,
        videoIngredientId,
      });

      // Update ingredient status to failed
      await this.ingredientsService.patch(ingredientData._id, {
        status: IngredientStatus.FAILED,
      });

      // Update activity
      await this.activitiesService.patch(activityId, {
        key: ActivityKey.VIDEO_FAILED,
        value: JSON.stringify({
          error: errorMessage,
          ingredientId: mergedIngredientId,
          label: 'Failed to add background music',
          type: 'music-merge',
        }),
      });

      await this.websocketService.publishBackgroundTaskUpdate({
        activityId,
        error: errorMessage,
        label: 'Failed to add background music',
        room: getUserRoomName(context.clerkUserId),
        status: 'failed',
        taskId: mergedIngredientId,
        userId: context.clerkUserId,
      });

      await this.websocketService.publishMediaFailed(
        websocketUrl,
        `Failed to add background music: ${errorMessage}`,
        context.clerkUserId,
        getUserRoomName(context.clerkUserId),
      );

      throw new HttpException(
        {
          detail: errorMessage,
          title: 'Failed to merge video with music',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Full orchestration: wait for video, resolve music, merge if needed
   * This is called after video generation is started to handle the music workflow
   */
  async orchestrateVideoWithMusic(
    videoIngredientId: string,
    backgroundMusic: BackgroundMusicDto,
    videoDuration: number,
    musicVolume: number,
    muteVideoAudio: boolean,
    context: OrchestrationContext,
  ): Promise<string> {
    // Step 1: Wait for video to complete
    this.loggerService.log('Waiting for video generation to complete', {
      videoIngredientId,
    });

    await this.pollingService.waitForIngredientCompletion(
      videoIngredientId,
      600000, // 10 minutes for video
      5000, // Poll every 5 seconds
    );

    // Step 2: Resolve music (use existing or generate new)
    const musicResult = await this.resolveMusic(
      backgroundMusic,
      videoDuration,
      context,
    );

    if (!musicResult) {
      // No music to add, return original video
      return videoIngredientId;
    }

    // Step 3: If music was generated, wait for it to complete
    if (musicResult.wasGenerated) {
      this.loggerService.log('Waiting for music generation to complete', {
        musicIngredientId: musicResult.musicIngredientId,
      });

      await this.waitForMusicCompletion(
        musicResult.musicIngredientId,
        120000, // 2 minutes for music
      );
    }

    // Step 4: Merge video with music
    const mergedIngredientId = await this.mergeVideoWithMusic(
      videoIngredientId,
      musicResult.musicIngredientId,
      musicVolume,
      muteVideoAudio,
      context,
    );

    return mergedIngredientId;
  }
}
