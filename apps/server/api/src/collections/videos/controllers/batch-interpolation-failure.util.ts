import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { VideosService } from '@api/collections/videos/services/videos.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import type { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import {
  ActivityKey,
  ActivitySource,
  PromptStatus,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';

export type InterpolationFailureDeps = {
  failedGenerationService: FailedGenerationService;
  loggerService: LoggerService;
  promptsService: PromptsService;
  videosService: VideosService;
};

export type InterpolationFailureScope = {
  brandId: string;
  groupId: string;
  user: User;
};

/** Fails the prompt created for a pair, scoped to the organization. */
export async function failInterpolationPrompt(
  deps: InterpolationFailureDeps,
  scope: InterpolationFailureScope,
  promptId?: string,
): Promise<void> {
  if (!promptId) return;
  try {
    await deps.promptsService.patchOneWhere(
      {
        id: promptId,
        isDeleted: false,
        organizationId: scope.user.organizationId,
      },
      { status: PromptStatus.FAILED },
    );
  } catch (error: unknown) {
    deps.loggerService.error('Failed to fail interpolation prompt', error, {
      promptId,
    });
  }
}

/** Fails the video, closes its activity and fails the prompt of one pair. */
export async function failInterpolationPair(
  deps: InterpolationFailureDeps,
  scope: InterpolationFailureScope,
  records: { ingredientId: string; pairIndex: number; promptId?: string },
): Promise<void> {
  const { ingredientId } = records;
  const { organizationId } = scope.user;
  try {
    await deps.failedGenerationService.handleFailedVideoGeneration(
      {
        patch: (id, data) =>
          deps.videosService.patchOneWhere(
            { id, isDeleted: false, organizationId },
            data,
          ),
      },
      ingredientId,
      WebSocketPaths.video(ingredientId),
      scope.user.id,
      getUserRoomName(scope.user.id),
      {
        brandId: scope.brandId,
        key: ActivityKey.VIDEO_FAILED,
        organizationId,
        source: ActivitySource.VIDEO_GENERATION,
        userId: scope.user.id,
        value: JSON.stringify({
          groupId: scope.groupId,
          ingredientId,
          pairIndex: records.pairIndex,
          type: 'interpolation',
        }),
      },
    );
  } catch (error: unknown) {
    deps.loggerService.error('Failed to fail interpolation video', error, {
      ingredientId,
      organizationId,
    });
  }
  await failInterpolationPrompt(deps, scope, records.promptId);
}
