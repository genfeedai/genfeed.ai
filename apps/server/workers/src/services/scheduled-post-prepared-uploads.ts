import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult, ServerPublisherFactory } from '@api/index';
import { PublishErrorKind, TargetExecutionState } from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts';
import { readPublishErrorKind } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { campaignDispatchAllowedFilter } from '@workers/services/campaign-dispatch.filter';
import { loadScheduledActionPost } from '@workers/services/scheduled-post-action-load.util';
import type { PreparedPostDelivery } from '@workers/services/scheduled-post-delivery.types';
import {
  readDeliveryIds,
  type ScheduledPostDeliveryGates,
} from '@workers/services/scheduled-post-delivery-gates';
import {
  completePreparedUpload,
  failPreparedUpload,
  preparedUploadInputDigest,
  reservePreparedUpload,
  takePreparedUpload,
} from '@workers/services/scheduled-post-prepared-upload.util';
import type { ProviderPublishAttemptRef } from '@workers/services/scheduled-post-provider-receipt.util';

/**
 * How far ahead of its due time a post's media is uploaded. It must stay below
 * the validity of a prepared upload (ten minutes for Instagram), so an upload
 * made at the start of the window is still usable at the due time.
 */
const PREPARED_UPLOAD_LEAD_MS = 5 * 60_000;

/** Most posts one prepare sweep reads; the rest publish as before. */
const PREPARE_SWEEP_MAX_POSTS = 200;

/** Uploads run side by side per sweep, so a burst is ready in time. */
const PREPARE_SWEEP_CONCURRENCY = 4;

/**
 * Refusals of a prepared upload that prove nothing was published and that a
 * fresh upload may get past: the container was refused (expired, say) or the
 * provider asked to try again. Any other outcome, untyped errors included,
 * takes the delivery's usual path, as a publish from scratch would.
 */
const FRESH_UPLOAD_KINDS: ReadonlySet<PublishErrorKind | undefined | null> =
  new Set([PublishErrorKind.CONTENT_REJECTED, PublishErrorKind.RETRY_LATER]);

type PrepareCandidate = { id: string; organizationId: string };

type PrepareSweepOutcome = { found: number; prepared: number };

/**
 * Uploads made before a scheduled post is due, so the delivery at the due time
 * only publishes them. The upload is kept per publish occurrence, so an edit,
 * reschedule or reapproval leaves it unused. A delivery takes it inside its
 * own provider attempt, which the receipt already makes the only one for the
 * occurrence; anything missing, stale or refused falls back to uploading at
 * publish time.
 */
export class ScheduledPostPreparedUploads {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly publisherFactory: ServerPublisherFactory,
    private readonly gates: ScheduledPostDeliveryGates,
  ) {}

  /**
   * Upload the media of every approved post due in the next few minutes on a
   * platform that can publish a prepared upload. `isStillHeld` renews the
   * sweep's lock between batches; the sweep stops once it is lost.
   */
  async prepareUpcoming(
    isStillHeld: () => Promise<boolean>,
    now: Date = new Date(),
  ): Promise<PrepareSweepOutcome> {
    const platforms = this.publisherFactory
      .getSupportedPlatforms()
      .filter((platform) => {
        const publisher = this.publisherFactory.getPublisher(platform);
        return Boolean(publisher?.prepareUpload && publisher.publishPrepared);
      });
    if (platforms.length === 0) return { found: 0, prepared: 0 };

    const candidates: PrepareCandidate[] = await this.prisma.post.findMany({
      orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
      select: { id: true, organizationId: true },
      take: PREPARE_SWEEP_MAX_POSTS,
      where: {
        AND: [campaignDispatchAllowedFilter()],
        isDeleted: false,
        parentId: null,
        platform: { in: platforms },
        publishApprovalId: { not: null },
        scheduledDate: {
          gt: now,
          lte: new Date(now.getTime() + PREPARED_UPLOAD_LEAD_MS),
        },
        ...postExecutionStateReadFilter(TargetExecutionState.SCHEDULED),
      },
    });

    let prepared = 0;
    for (
      let start = 0;
      start < candidates.length;
      start += PREPARE_SWEEP_CONCURRENCY
    ) {
      if (start > 0 && !(await isStillHeld())) break;
      const batch = candidates.slice(start, start + PREPARE_SWEEP_CONCURRENCY);
      const outcomes = await Promise.all(
        batch.map((candidate) => this.prepare(candidate)),
      );
      prepared += outcomes.filter(Boolean).length;
    }
    return { found: candidates.length, prepared };
  }

  /**
   * Upload one post's media for its current occurrence. True when an upload
   * is ready; any failure is logged and leaves the post to upload at publish
   * time, so a prepare never fails or delays a post.
   */
  async prepare(candidate: PrepareCandidate): Promise<boolean> {
    const url = `${ScheduledPostPreparedUploads.name} prepare`;
    const logContext = {
      organizationId: candidate.organizationId,
      postId: candidate.id,
    };
    try {
      // The delivery's own loader, so the occurrence key matches its own.
      const post = await loadScheduledActionPost(this.prisma, {
        organizationId: candidate.organizationId,
        postId: candidate.id,
      });
      if (!post) return false;
      const ids = readDeliveryIds(post);
      const loaded = await this.gates.loadResources(post, ids, url);
      if (!loaded.ok) return false;
      const delivery = await this.gates.prepare(
        post,
        'scheduled_sweep',
        ids,
        loaded.value.credential,
        loaded.value.organization,
        url,
      );
      if (!delivery.ok) return false;
      return await this.uploadAhead(post, delivery.value, url);
    } catch (error: unknown) {
      this.logger.warn(`${url} skipped`, {
        ...logContext,
        error: getErrorMessage(error),
      });
      return false;
    }
  }

  /**
   * Upload ahead for a loaded post and its delivery context. True when an
   * upload is ready; a failed upload is recorded so the delivery skips it.
   */
  async uploadAhead(
    post: PostEntity,
    delivery: PreparedPostDelivery,
    url: string,
  ): Promise<boolean> {
    const { publisher } = delivery;
    if (!publisher.prepareUpload || !publisher.publishPrepared) return false;
    const lease = await reservePreparedUpload(
      this.prisma,
      post,
      preparedUploadInputDigest(delivery),
    );
    if (!lease) return false;

    let upload: Awaited<ReturnType<typeof publisher.prepareUpload>>;
    try {
      upload = await publisher.prepareUpload(delivery.context);
    } catch (error: unknown) {
      this.logger.warn(`${url} upload failed; it will upload at publish time`, {
        error: getErrorMessage(error),
        postId: post.id.toString(),
      });
      await failPreparedUpload(this.prisma, post, lease);
      return false;
    }
    if (!upload) {
      await failPreparedUpload(this.prisma, post, lease);
      return false;
    }
    const isReady = await completePreparedUpload(
      this.prisma,
      post,
      lease,
      upload,
    );
    if (isReady) {
      this.logger.log(`${url} upload ready`, {
        expiresAt: upload.expiresAt.toISOString(),
        postId: post.id.toString(),
      });
    }
    return isReady;
  }

  /**
   * The provider call of a delivery that holds `attempt`: publish the
   * occurrence's prepared upload when there is one, otherwise publish from
   * scratch. A prepared publish refused in a way that proves nothing was
   * published and a fresh upload may succeed is followed at once by a publish
   * from scratch in the same attempt; every other outcome is the attempt's.
   */
  async publish(
    post: PostEntity,
    delivery: PreparedPostDelivery,
    attempt: ProviderPublishAttemptRef,
    url: string,
  ): Promise<PublishResult> {
    const { context, publisher } = delivery;
    const upload = publisher.publishPrepared
      ? await takePreparedUpload(
          this.prisma,
          post,
          preparedUploadInputDigest(delivery),
          attempt.attemptToken,
        ).catch((error: unknown) => {
          this.logger.warn(`${url} prepared upload unavailable`, {
            error: getErrorMessage(error),
            postId: post.id.toString(),
          });
          return null;
        })
      : null;
    if (!upload || !publisher.publishPrepared) {
      return publisher.publish(context);
    }

    let result: PublishResult;
    try {
      result = await publisher.publishPrepared(context, upload);
    } catch (error: unknown) {
      if (!FRESH_UPLOAD_KINDS.has(readPublishErrorKind(error))) throw error;
      this.logger.warn(`${url} prepared upload refused; uploading again`, {
        error: getErrorMessage(error),
        postId: post.id.toString(),
      });
      return publisher.publish(context);
    }
    if (result.success || !FRESH_UPLOAD_KINDS.has(result.errorKind)) {
      return result;
    }
    this.logger.warn(`${url} prepared upload refused; uploading again`, {
      error: result.error,
      postId: post.id.toString(),
    });
    return publisher.publish(context);
  }
}
