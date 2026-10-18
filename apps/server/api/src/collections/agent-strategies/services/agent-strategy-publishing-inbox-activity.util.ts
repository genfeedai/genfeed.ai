import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { strategyBrandId } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { ReviewTurboRunItemFormat } from '@api/services/turbo-run/constants/review-turbo-run-item-format.constant';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ContentFormat,
  IngredientCategory,
} from '@genfeedai/contracts';
import { createPublishingApprovalsRoute } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';

export interface PublishingInboxActivityInput {
  turboRunId: string;
  format: ReviewTurboRunItemFormat;
  mediaUrl?: string;
  organizationId: string;
  platform?: string;
  postId: string;
  reviewItemId?: string;
  strategy: AgentStrategyDocument;
  topic: string;
  userId: string;
}

/**
 * Tells the brand an autopilot draft is waiting in the publishing inbox. A
 * failed record is logged, never thrown: the review handoff already exists.
 */
export async function recordPublishingInboxActivity(
  activityRecorder: ActivityRecorderService,
  logger: LoggerService,
  input: PublishingInboxActivityInput,
): Promise<void> {
  const href = createPublishingApprovalsRoute({
    run: input.turboRunId,
    item: input.reviewItemId,
  });
  const label = `Autopilot ${input.format} ready for review`;
  const description = `${input.topic} is ready in the publishing inbox.`;

  try {
    await activityRecorder.record({
      brandId: strategyBrandId(input.strategy) ?? '',
      entityId: input.postId,
      entityModel: ActivityEntityModel.POST,
      key: ActivityKey.POST_GENERATED,
      organizationId: input.organizationId,
      source: ActivitySource.POST_GENERATION,
      userId: input.userId,
      value: JSON.stringify({
        turboRunId: input.turboRunId,
        description,
        format: input.format,
        href,
        label,
        mediaUrl: input.mediaUrl,
        platform: input.platform,
        resultId: input.postId,
        resultType:
          input.format === ContentFormat.IMAGE
            ? IngredientCategory.IMAGE
            : input.format === ContentFormat.VIDEO
              ? IngredientCategory.VIDEO
              : undefined,
        reviewItemId: input.reviewItemId,
        sentence: description,
        topic: input.topic,
      }),
    });
  } catch (error) {
    logger.warn('Failed to create publishing inbox activity', {
      turboRunId: input.turboRunId,
      error,
      postId: input.postId,
      reviewItemId: input.reviewItemId,
    });
  }
}
