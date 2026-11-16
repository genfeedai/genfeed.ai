import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { TargetExecutionState } from '@genfeedai/contracts';
import { toPrismaJson } from '@genfeedai/prisma';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { createChannelTargetError } from '@workers/crons/posts/post-publish-error.util';
import { SCHEDULED_POST_RETRY_BACKOFF_SECONDS } from '@workers/services/scheduled-post.constants';
import {
  readPostString,
  resolveUnverifiedDeferral,
} from '@workers/services/scheduled-post.utils';
import type { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';
import { inspectProviderPublishAttempt } from '@workers/services/scheduled-post-provider-receipt.util';

/**
 * A terminal close of a post whose approval is already published was kept
 * because an earlier provider attempt is unconfirmed, accepted or in flight
 * (#10385). Applies the unverified-outcome policy to the post without a new
 * provider call: the short verification backoff inside the window, then the
 * operator-visible error, the owner alert and the slow backoff.
 *
 * The window runs from the attempt's own start, which no sweep moves. That
 * holds for an unconfirmed attempt and for one the provider accepted whose
 * result never reached the post: both end with the owner alert, and neither is
 * failed. An attempt still in flight has no settled start to date it from, so
 * it gets the short backoff and no alert; once its lease lapses it becomes
 * unconfirmed and the window runs from its real start.
 *
 * The post is dated ahead because discovery re-queues a PUBLISHING post once
 * its last attempt is older than the retry backoff.
 */
export async function deferKeptUnsettledApproval(
  prisma: PrismaService,
  failures: ScheduledPostFailureService,
  post: PostEntity,
): Promise<void> {
  const now = new Date();
  const attempt = await inspectProviderPublishAttempt(prisma, post, now);
  const windowStartedAt =
    attempt.kind === 'unconfirmed' || attempt.kind === 'replay'
      ? attempt.attemptStartedAt
      : now;
  const deferral = resolveUnverifiedDeferral(windowStartedAt, now);
  const { count } = await prisma.post.updateMany({
    data: {
      lastAttemptAt: new Date(
        now.getTime() +
          (deferral.backoffSeconds - SCHEDULED_POST_RETRY_BACKOFF_SECONDS) *
            1000,
      ),
      targetError: toPrismaJson(
        createChannelTargetError(deferral.code, deferral.message, true),
      ),
    },
    where: {
      id: post.id.toString(),
      isDeleted: false,
      organizationId: readPostString(post, ['organizationId']) ?? '',
      targetExecutionState: TargetExecutionState.PUBLISHING,
    },
  });
  if (deferral.isWindowExpired && count > 0) {
    await failures.notifyPublishUnverified(post, windowStartedAt);
  }
}
