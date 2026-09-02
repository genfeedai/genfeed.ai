import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import type { VideoGenerationContext } from '@api/collections/videos/services/video-generation.types';
import {
  resolveBackgroundMusicDuration,
  resolveBackgroundMusicVolume,
  shouldStartBackgroundMusic,
} from '@api/collections/videos/services/video-generation-music.util';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { CacheService } from '@api/services/cache/cache.service';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { VideoSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const VIDEO_POPULATE = [
  PopulatePatterns.promptFull,
  PopulatePatterns.metadataFull,
  PopulatePatterns.userMinimal,
  PopulatePatterns.brandMinimal,
];

@Injectable()
export class VideoGenerationCompletionService {
  constructor(
    private readonly bookmarksService: BookmarksService,
    private readonly cacheService: CacheService,
    private readonly ingredientCompletionService: IngredientCompletionService,
    private readonly loggerService: LoggerService,
    private readonly videoMusicOrchestrationService: VideoMusicOrchestrationService,
    private readonly videosService: VideosService,
    private readonly cancellationService: IngredientGenerationCancellationService,
  ) {}

  async complete(
    context: VideoGenerationContext,
  ): Promise<JsonApiSingleResponse> {
    await this.linkBookmark(context);
    await this.cacheService.invalidateByTags(['videos']);
    this.startBackgroundMusic(context);

    if (context.createVideoDto.waitForCompletion === true) {
      return this.waitForCompletion(context);
    }
    return serializeSingle(context.request, VideoSerializer, {
      ...context.ingredientData,
      pendingIngredientIds: context.pendingIngredientIds,
    });
  }

  private async linkBookmark(context: VideoGenerationContext): Promise<void> {
    if (!context.createVideoDto.bookmark) {
      return;
    }
    try {
      await this.bookmarksService.addGeneratedIngredient(
        context.createVideoDto.bookmark,
        context.ingredientData.id,
      );
      this.loggerService.log('Linked video to bookmark', {
        bookmarkId: context.createVideoDto.bookmark,
        videoId: context.ingredientData.id,
      });
    } catch (error: unknown) {
      this.loggerService.warn(
        'Failed to link video to bookmark',
        error as Error,
      );
    }
  }

  private startBackgroundMusic(context: VideoGenerationContext): void {
    const backgroundMusic = context.createVideoDto.backgroundMusic;
    if (!backgroundMusic || !shouldStartBackgroundMusic(backgroundMusic)) {
      return;
    }
    const ingredientId = context.ingredientData.id.toString();
    this.videoMusicOrchestrationService
      .orchestrateVideoWithMusic(
        ingredientId,
        backgroundMusic,
        resolveBackgroundMusicDuration(context.createVideoDto.duration),
        resolveBackgroundMusicVolume(context.createVideoDto.musicVolume),
        context.createVideoDto.muteVideoAudio ?? false,
        {
          brandId: context.brand.id.toString(),
          organizationId: context.user.organizationId,
          userId: context.user.userId,
        },
      )
      .then((mergedVideoId) => {
        this.loggerService.log('Video+music orchestration completed', {
          mergedVideoId,
          originalVideoId: ingredientId,
        });
      })
      .catch((error: unknown) => {
        this.loggerService.error('Video+music orchestration failed', {
          error: (error as Error)?.message || 'Unknown error',
          originalVideoId: ingredientId,
        });
      });
  }

  private async waitForCompletion(
    context: VideoGenerationContext,
  ): Promise<JsonApiSingleResponse> {
    try {
      this.cancellationService.bindCancelOnAbort({
        abortSignal: context.abortSignal,
        id: context.ingredientData.id.toString(),
        organizationId: context.user.organizationId,
        userId: context.user.userId,
      });
      const completedIngredients =
        await this.ingredientCompletionService.waitForMultipleIngredientsCompletion(
          context.pendingIngredientIds,
          600_000,
          5_000,
          VIDEO_POPULATE,
          context.abortSignal,
        );
      return serializeSingle(
        context.request,
        VideoSerializer,
        completedIngredients[0],
      );
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        const ingredient = await this.videosService.findOne(
          { id: context.ingredientData.id },
          VIDEO_POPULATE,
        );
        if (ingredient) {
          throw new HttpException(
            {
              detail: `Video generation did not complete within 10 minutes. Current status: ${ingredient.status}`,
              title: 'Generation timeout',
            },
            HttpStatus.GATEWAY_TIMEOUT,
          );
        }
      }
      throw error;
    }
  }
}
