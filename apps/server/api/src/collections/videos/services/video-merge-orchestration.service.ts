import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { VideoStitchService } from '@api/services/video-stitch/video-stitch.service';
import type { VideoStitchRequest } from '@api/services/video-stitch/video-stitch.types';
import { IngredientFormat } from '@genfeedai/contracts';
import { VIDEO_FORMAT_DIMENSIONS } from '@genfeedai/contracts/constants';
import { BadRequestException, Injectable } from '@nestjs/common';

/** Maps a hand-picked or Storyboard merge request onto the stitch service. */
export function toManualStitchRequest(
  user: User,
  dto: CreateMergedVideoDto,
  idempotencyKey: string,
): VideoStitchRequest {
  // Ken Burns zoom is a slideshow effect. The stitch worker never applies it,
  // so a merge that includes it is rejected instead of started without zoom.
  if (dto.zoomEaseCurve != null || dto.zoomConfigs != null) {
    throw new BadRequestException(
      'Zoom effects are not supported when merging videos',
    );
  }
  const portrait = VIDEO_FORMAT_DIMENSIONS[IngredientFormat.PORTRAIT];
  return {
    brandId: user.brandId,
    callerKind: 'manual',
    clipIds: dto.ids ?? [],
    idempotencyKey,
    organizationId: user.organizationId,
    ...(dto.isResizeEnabled
      ? {
          output: {
            height: portrait.height,
            resize: 'after_merge',
            width: portrait.width,
          },
        }
      : {}),
    roomUserId: user.id,
    settings: {
      isCaptionsEnabled: dto.isCaptionsEnabled ?? false,
      ...(dto.isMuteVideoAudio !== undefined
        ? { isMuteVideoAudio: dto.isMuteVideoAudio }
        : {}),
      ...(dto.music ? { music: String(dto.music) } : {}),
      ...(dto.musicVolume !== undefined
        ? { musicVolume: dto.musicVolume }
        : {}),
      ...(dto.transition !== undefined ? { transition: dto.transition } : {}),
      ...(dto.transitionDuration !== undefined
        ? { transitionDuration: dto.transitionDuration }
        : {}),
      ...(dto.transitionEaseCurve !== undefined
        ? { transitionEaseCurve: dto.transitionEaseCurve }
        : {}),
    },
    userId: user.userId ?? user.id,
  };
}

@Injectable()
export class VideoMergeOrchestrationService {
  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly videoStitchService: VideoStitchService,
  ) {}

  /** Starts the merge and returns the processing output immediately. */
  async mergeVideos(
    user: User,
    createMergedVideoDto: CreateMergedVideoDto,
  ): Promise<IngredientDocument> {
    const handle = await this.videoStitchService.stitch(
      toManualStitchRequest(
        user,
        createMergedVideoDto,
        `manual:${randomUUID()}`,
      ),
    );
    void this.videoStitchService.trackInBackground(handle);

    const output = await this.ingredientsService.findOne({
      id: handle.outputId,
      isDeleted: false,
      organizationId: user.organizationId,
    });
    if (!output) {
      throw new NotFoundException('Merged video', handle.outputId);
    }
    return output;
  }
}
