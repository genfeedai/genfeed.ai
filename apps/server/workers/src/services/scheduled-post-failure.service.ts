import type { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { TargetExecutionState } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import { createChannelTargetError } from '@workers/crons/posts/post-publish-error.util';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

/**
 * Owner-facing side effects of a terminal delivery failure (#5187):
 * telling the owner a target FAILED, and failing the thread children a
 * failed parent can no longer carry. Split out of
 * `ScheduledPostDeliveryService` so that service stays focused on the
 * publish pipeline itself.
 */
@Injectable()
export class ScheduledPostFailureService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly activitiesService: ActivitiesService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
  ) {}

  /**
   * The target is already FAILED when this runs, so a notification error is
   * logged instead of thrown: rethrowing would reach `handlePublishError`,
   * whose retry path moves the target back to SCHEDULED.
   */
  async notifyPublishFailed(
    post: PostEntity,
    activity: ActivityEntity,
  ): Promise<void> {
    try {
      await this.activitiesService.create(activity);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to record publish failure activity`,
        {
          error: getErrorMessage(error, {
            fallback: () => undefined,
            messageSource: 'error-instance',
          }),
          postId: post.id.toString(),
        },
      );
    }
  }

  /**
   * Moves still-pending thread children to FAILED. The prior-state guard
   * leaves a child the provider already delivered untouched.
   */
  async failChildren(
    post: PostEntity,
    code: string,
    reason: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const children = (post.children || []) as unknown as PostDocument[];

    if (children.length === 0) {
      return;
    }

    this.logger.log(`${url} failing ${children.length} children`, {
      childrenCount: children.length,
      parentPostId: post.id.toString(),
      reason,
    });

    for (const child of children) {
      try {
        await this.schedulerPublishStateService.transitionPost(
          {
            groupId: child.groupId,
            id: child.id,
            organizationId: post.organizationId,
          },
          {
            error: createChannelTargetError(code, reason, false),
            executionState: TargetExecutionState.FAILED,
          },
          reason,
          {
            priorExecutionStates: [
              TargetExecutionState.SCHEDULED,
              TargetExecutionState.PUBLISHING,
            ],
          },
        );
      } catch (error: unknown) {
        this.logger.error(`${url} failed to mark child as failed`, {
          childPostId: child.id.toString(),
          error: getErrorMessage(error, {
            fallback: () => undefined,
            messageSource: 'error-instance',
          }),
          parentPostId: post.id.toString(),
        });
      }
    }
  }
}
