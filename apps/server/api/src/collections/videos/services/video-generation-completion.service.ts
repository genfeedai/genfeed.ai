import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import type { VideoGenerationContext } from '@api/collections/videos/services/video-generation.types';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { VideoSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PollTimeoutException } from '@server/shared/services/poll-until/poll-until.exception';

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
    if (!context.createVideoDto.backgroundMusic) {
      return;
    }
    const ingredientId = context.ingredientData.id.toString();
    this.videoMusicOrchestrationService
      .orchestrateVideoWithMusic(
        ingredientId,
        context.createVideoDto.backgroundMusic,
        context.createVideoDto.duration || 10,
        context.createVideoDto.musicVolume ?? 30,
        context.createVideoDto.muteVideoAudio ?? false,
        {
          authProviderUserId: context.user.id,
          brandId: context.brand.id.toString(),
          organizationId: context.publicMetadata.organization,
          userId: context.publicMetadata.user,
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
      const completedIngredients =
        await this.ingredientCompletionService.waitForMultipleIngredientsCompletion(
          context.pendingIngredientIds,
          600_000,
          5_000,
          VIDEO_POPULATE,
        );
      return serializeSingle(
        context.request,
        VideoSerializer,
        completedIngredients[0],
      );
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        const ingredient = await this.videosService.findOne(
          { _id: context.ingredientData.id },
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
