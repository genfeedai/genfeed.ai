import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { VideoStitchService } from '@api/services/video-stitch/video-stitch.service';
import type { VideoStitchRequest } from '@api/services/video-stitch/video-stitch.types';
import { readVideoMergeSettings } from '@api/services/video-stitch/video-stitch.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

const COMPLETED_STATUSES: string[] = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

/** Idempotency key for a merge-enabled interpolation batch. */
export function autoMergeIdempotencyKey(groupId: string): string {
  return `auto-merge:${groupId}`;
}

/** Maps a completed interpolation group onto the stitch service. */
export function toAutoMergeStitchRequest(
  ingredient: IngredientDocument,
  groupId: string,
  clipIds: string[],
): VideoStitchRequest | null {
  if (!ingredient.organizationId || !ingredient.brandId || !ingredient.userId) {
    return null;
  }
  return {
    brandId: ingredient.brandId,
    callerKind: 'auto_merge',
    clipIds,
    idempotencyKey: autoMergeIdempotencyKey(groupId),
    organizationId: ingredient.organizationId,
    settings: readVideoMergeSettings(ingredient.mergeSettings),
    userId: ingredient.userId,
  };
}

@Injectable()
export class AutoMergeService {
  private readonly logContext = 'AutoMergeService';

  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly videoStitchService: VideoStitchService,
  ) {}

  /**
   * Trigger auto-merge if this video is part of a batch with merge enabled.
   * Runs in background to not block webhook response.
   */
  triggerAutoMergeIfReady(ingredient: IngredientDocument): void {
    setImmediate(() => {
      this.triggerAutoMergeAsync(ingredient).catch((error: unknown) => {
        this.loggerService.error(`${this.logContext} auto-merge check failed`, {
          error: getErrorMessage(error),
          groupId: ingredient.groupId,
          ingredientId: ingredient.id,
        });
      });
    });
  }

  private async triggerAutoMergeAsync(
    ingredient: IngredientDocument,
  ): Promise<void> {
    if (String(ingredient.category) !== IngredientCategory.VIDEO) {
      return;
    }

    const groupId = ingredient.groupId;
    if (!groupId || !ingredient.isMergeEnabled) {
      this.loggerService.debug(
        `${this.logContext} not part of merge-enabled group`,
        {
          groupId,
          ingredientId: ingredient.id,
          isMergeEnabled: ingredient.isMergeEnabled,
        },
      );
      return;
    }

    if (!ingredient.organizationId) {
      return;
    }
    const groupVideos = await this.findGroupVideos(
      ingredient.organizationId,
      groupId,
    );
    if (groupVideos.length === 0) {
      this.loggerService.warn(`${this.logContext} no videos found for group`, {
        groupId,
      });
      return;
    }

    const completedCount = groupVideos.filter((video) =>
      COMPLETED_STATUSES.includes(String(video.status)),
    ).length;
    if (completedCount !== groupVideos.length) {
      this.loggerService.debug(
        `${this.logContext} waiting for all videos to complete`,
        { completedCount, groupId, totalCount: groupVideos.length },
      );
      return;
    }

    const request = toAutoMergeStitchRequest(
      ingredient,
      groupId,
      groupVideos.map((video) => String(video.id)),
    );
    if (!request) {
      this.loggerService.warn(
        `${this.logContext} batch has no owning organization, brand or user`,
        { groupId, ingredientId: ingredient.id },
      );
      return;
    }

    const handle = await this.videoStitchService.stitch(request);
    if (handle.isExisting) {
      return;
    }
    this.loggerService.log(`${this.logContext} auto-merge started`, {
      groupId,
      jobId: handle.jobId,
      organizationId: request.organizationId,
      outputId: handle.outputId,
    });
    this.videoStitchService.trackInBackground(handle);
  }

  private async findGroupVideos(
    organizationId: string,
    groupId: string,
  ): Promise<IngredientDocument[]> {
    const result = await this.ingredientsService.findAll(
      {
        where: {
          category: CategoryPrismaUtil.toIngredientCategory(
            IngredientCategory.VIDEO,
          ),
          groupId,
          isDeleted: false,
          organizationId,
        },
        orderBy: { groupIndex: 1 as const },
      },
      { pagination: false },
      false,
    );
    return result.docs || [];
  }
}
