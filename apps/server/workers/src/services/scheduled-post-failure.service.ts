import { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import { TargetExecutionState } from '@genfeedai/contracts';
import { isManualPostErrorCode } from '@genfeedai/contracts/api-types/contracts/x-quote-post.contract';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import {
  createManualPostActivity,
  toManualPostSubject,
} from '@workers/crons/posts/manual-post-activity.util';
import {
  createChannelTargetError,
  createPublishFailedActivity,
} from '@workers/crons/posts/post-publish-error.util';
import { readPostString } from '@workers/services/scheduled-post.utils';
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
    private readonly activityRecorder: ActivityRecorderService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
  ) {}

  /**
   * The target is already FAILED when this runs, so a notification error is
   * logged instead of thrown: rethrowing would reach `handlePublishError`,
   * whose retry path moves the target back to SCHEDULED.
   */
  async notifyPublishFailed(
    post: PostEntity,
    activity: RecordActivityInput,
  ): Promise<void> {
    try {
      await this.activityRecorder.record(activity);
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
   * Tells the owner a target FAILED for good. A refused X quote (an Enterprise
   * API plan feature) asks them to post it by hand; anything else is the
   * generic failure alert.
   */
  async notifyTerminalFailure(
    post: PostEntity,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const isManualPost = isManualPostErrorCode(errorCode);
    await this.notifyPublishFailed(
      post,
      isManualPost
        ? createManualPostActivity(toManualPostSubject(post), 0)
        : createPublishFailedActivity(post, errorMessage),
    );
    // A publish that ended FAILED is persisted on the post, so nothing rethrows
    // it to Sentry's global handlers: report it once here. Content the owner
    // must fix (validation) and a quote X refused (the person posts it by hand)
    // stay out; provider and credential failures are the signal.
    if (isManualPost || errorCode === 'publish_validation_failed') {
      return;
    }
    Sentry.captureException(new Error(errorMessage), {
      extra: {
        organizationId: readPostString(post, ['organizationId']),
        postId: post.id.toString(),
        retryCount: post.retryCount || 0,
      },
      fingerprint: ['scheduled-post-publish-failed', errorCode],
      level: 'error',
      tags: {
        'publish.error_code': errorCode,
        'publish.platform': readPostString(post, ['platform']) ?? 'unknown',
      },
    });
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
