import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { type PublishResult, scopedWhere } from '@api/index';
import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import { CredentialPlatform, Platform } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import {
  getPublishErrorCode,
  getPublishErrorMessage,
} from '@workers/crons/posts/post-publish-error.util';
import { readPostString } from '@workers/services/scheduled-post.utils';
import type { PreparedPostDelivery } from '@workers/services/scheduled-post-delivery.types';
import type { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';
import {
  type PlannedThreadChild,
  toPlannedThreadChildren,
} from '@workers/services/scheduled-post-media-gate.util';
import {
  type DelayedThreadChild,
  planThreadChildDelivery,
} from '@workers/services/thread-comment-schedule.util';

/**
 * What follows a provider-accepted publish: the thread children that go out
 * with the parent (or are parked) and the reply-watch scheduling.
 */
export class ScheduledPostPublishFollowUps {
  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly postFailureService: ScheduledPostFailureService,
    private readonly replyPostWatchService: ReplyPostWatchService,
  ) {}

  /**
   * Send the follow-ups that go out with the parent and park the rest.
   *
   * A delayed comment keeps its SCHEDULED state and gains a due date; the
   * thread-comment sweep publishes it once that time arrives, using the same
   * publisher against the parent's provider id.
   */
  async deliverThreadChildren(
    post: PostEntity,
    children: PostDocument[],
    prepared: PreparedPostDelivery,
    result: PublishResult,
    publishedAt: Date,
    url: string,
  ): Promise<void> {
    if (children.length === 0) {
      return;
    }

    const plan = planThreadChildDelivery(
      toPlannedThreadChildren(children),
      publishedAt,
    );

    await this.parkDelayedThreadChildren(post, plan.delayed, url);

    await this.publishThreadChildrenIfSupported(
      post,
      plan.immediate.map((entry) => entry.child),
      prepared,
      result,
      url,
    );
  }

  private async parkDelayedThreadChildren(
    post: PostEntity,
    delayed: Array<DelayedThreadChild<PlannedThreadChild>>,
    url: string,
  ): Promise<void> {
    if (delayed.length === 0) {
      return;
    }

    const organizationId = readPostString(post, ['organizationId']);
    if (!organizationId) {
      this.logger.error(`${url} cannot park delayed comments without an org`, {
        postId: post.id.toString(),
      });
      return;
    }

    for (const entry of delayed) {
      await this.prisma.post.updateMany({
        data: { scheduledDate: entry.dueAt },
        where: scopedWhere(organizationId, {
          id: entry.child.id,
          isDeleted: false,
        }),
      });
    }

    this.logger.log(`${url} parked delayed comments`, {
      delayedCount: delayed.length,
      nextDueAt: delayed[0]?.dueAt.toISOString(),
      postId: post.id.toString(),
    });
  }

  private async publishThreadChildrenIfSupported(
    post: PostEntity,
    children: PostDocument[],
    prepared: PreparedPostDelivery,
    result: PublishResult,
    url: string,
  ): Promise<void> {
    if (
      children.length === 0 ||
      !prepared.publisher.supportsThreads ||
      !result.externalId
    ) {
      return;
    }

    if (!prepared.publisher.publishThreadChildren) {
      this.logger.warn(
        `${url} platform supports threads but publishThreadChildren not implemented`,
        {
          childrenCount: children.length,
          platform: prepared.credential.platform,
          postId: post.id.toString(),
        },
      );
      return;
    }

    try {
      await prepared.publisher.publishThreadChildren(
        prepared.context,
        children,
        result.externalId,
      );
    } catch (error: unknown) {
      const errorMessage = getPublishErrorMessage(error);
      this.logger.error(
        `${url} failed to publish thread children after parent success`,
        {
          childrenCount: children.length,
          error: errorMessage,
          externalId: result.externalId,
          platform: prepared.credential.platform,
          postId: post.id.toString(),
        },
      );
      await this.postFailureService.failChildren(
        post,
        getPublishErrorCode(error),
        errorMessage,
      );
    }
  }

  scheduleReplyPostWatch(
    post: PostEntity,
    result: PublishResult,
    platform: CredentialPlatform | string,
  ): void {
    const platformKey = String(platform).toLowerCase();
    const isX =
      platformKey === 'twitter' ||
      platformKey === CredentialPlatform.TWITTER.toLowerCase() ||
      platform === CredentialPlatform.TWITTER;
    const isYouTube =
      platformKey === 'youtube' ||
      platformKey === CredentialPlatform.YOUTUBE.toLowerCase() ||
      platform === CredentialPlatform.YOUTUBE;
    if ((!isX && !isYouTube) || !result.externalId) {
      return;
    }

    const organizationId = post.organizationId;
    const brandId = post.brandId;
    if (!organizationId || !brandId) {
      return;
    }

    const postPreview =
      readPostString(post, ['title']) ||
      readPostString(post, ['text']) ||
      readPostString(post, ['content']) ||
      undefined;
    const watchPlatform = isYouTube ? Platform.YOUTUBE : Platform.TWITTER;

    void this.replyPostWatchService
      .schedulePostWatch({
        brandId: String(brandId),
        organizationId: String(organizationId),
        platform: watchPlatform,
        postId: result.externalId,
        postPreview: postPreview?.slice(0, 200),
      })
      .then((scheduled) => {
        this.logger.log(
          `${ScheduledPostPublishFollowUps.name} scheduled reply post-watch after publish`,
          {
            externalId: result.externalId,
            platform: watchPlatform,
            postId: post.id.toString(),
            scheduled: scheduled.scheduled,
          },
        );
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `${ScheduledPostPublishFollowUps.name} failed to schedule reply post-watch`,
          {
            error: getErrorMessage(error, {
              fallback: () => 'unknown',
              messageSource: 'error-instance',
            }),
            externalId: result.externalId,
            postId: post.id.toString(),
          },
        );
      });
  }
}
