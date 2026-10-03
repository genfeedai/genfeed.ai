import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult } from '@api/index';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import type { PreparedPostDelivery } from '@workers/services/scheduled-post-delivery.types';
import {
  acceptProviderPublishAttempt,
  claimProviderPublishAttempt,
  inspectProviderPublishAttempt,
  markProviderPublishAttemptUncertain,
  markProviderReceiptPersisted,
  PROVIDER_PUBLISH_LEASE_RENEWAL_MS,
  type ProviderPublishAttempt,
  type ProviderPublishAttemptRef,
  ProviderPublishInFlightError,
  releaseProviderPublishAttempt,
  renewProviderPublishAttempt,
  reserveProviderPublishAttempt,
} from '@workers/services/scheduled-post-provider-receipt.util';

/** Receipt owner recorded while a terminal failure holds the occurrence. */
const TERMINAL_VALIDATION_EXECUTION_ID = 'terminal-validation';

/**
 * Provider-attempt lifecycle of a scheduled delivery, on top of the receipt
 * helpers: verification of unconfirmed attempts, the lease around the provider
 * call, and logged settlement writes that never mask the delivery outcome.
 */
export class ScheduledPostProviderAttempts {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  reserve(
    post: PostEntity,
    workflowExecutionId: string,
  ): Promise<ProviderPublishAttempt> {
    return reserveProviderPublishAttempt(
      this.prisma,
      post,
      workflowExecutionId,
    );
  }

  /**
   * Hold the occurrence while a terminal failure is written, so no delivery
   * can reserve it and reach the provider in between. An accepted or live
   * attempt is returned instead, and the target must stay PUBLISHING.
   */
  async holdForTerminalFailure(
    post: PostEntity,
  ): Promise<ProviderPublishAttempt> {
    try {
      return await this.reserve(post, TERMINAL_VALIDATION_EXECUTION_ID);
    } catch (error: unknown) {
      if (!(error instanceof ProviderPublishInFlightError)) throw error;
      const observed = await inspectProviderPublishAttempt(this.prisma, post);
      if (observed.kind !== 'replay' && observed.kind !== 'in_flight')
        throw error;
      return observed;
    }
  }

  /**
   * Resolve an earlier attempt whose provider outcome was never confirmed.
   * Publishers that can verify report whether it landed; a confirmed absence
   * (or a publisher without verification) takes the attempt over for a retry.
   */
  async resolveUnconfirmed(
    post: PostEntity,
    prepared: PreparedPostDelivery,
    attempt: Extract<ProviderPublishAttempt, { kind: 'unconfirmed' }>,
    workflowExecutionId: string,
    url: string,
  ): Promise<ProviderPublishAttempt> {
    const verify = prepared.publisher.verifyPublished?.bind(prepared.publisher);
    if (verify) {
      let found: PublishResult | null;
      try {
        found = await verify(
          {
            ...prepared.context,
            hasThreadChildren: (post.children?.length ?? 0) > 0,
          },
          attempt.attemptStartedAt,
        );
      } catch (error: unknown) {
        this.logger.warn(`${url} provider publish verification unavailable`, {
          error: getErrorMessage(error),
          postId: post.id.toString(),
          receiptId: attempt.receiptId,
        });
        return attempt;
      }
      if (found?.success) {
        this.logger.warn(`${url} verified an unconfirmed provider publish`, {
          externalId: found.externalId,
          postId: post.id.toString(),
          receiptId: attempt.receiptId,
        });
        await acceptProviderPublishAttempt(this.prisma, post, attempt, found);
        return { ...attempt, kind: 'replay', result: found };
      }
    }
    const claimed = await claimProviderPublishAttempt(
      this.prisma,
      post,
      attempt,
      workflowExecutionId,
    );
    if (!claimed) return { ...attempt, kind: 'in_flight' };
    this.logger.warn(`${url} retrying an unconfirmed provider publish`, {
      isVerified: Boolean(verify),
      postId: post.id.toString(),
      receiptId: attempt.receiptId,
    });
    return { kind: 'publish', ...claimed };
  }

  /**
   * A holder that stalled past its lease may have been taken over: confirm
   * the attempt is still ours right before the provider call.
   */
  confirmOwnership(
    post: PostEntity,
    attempt: ProviderPublishAttemptRef,
  ): Promise<boolean> {
    return renewProviderPublishAttempt(this.prisma, post, attempt, true);
  }

  /**
   * Call the provider while renewing the attempt's lease, so no other
   * delivery can take the attempt over while this call may still land.
   */
  async publishUnderLease(
    post: PostEntity,
    attempt: ProviderPublishAttemptRef,
    url: string,
    publish: () => Promise<PublishResult>,
  ): Promise<PublishResult> {
    const renewal = setInterval(() => {
      renewProviderPublishAttempt(this.prisma, post, attempt, false)
        .then((isOwned) => {
          if (!isOwned) {
            this.logger.error(`${url} provider publish lease lost`, {
              postId: post.id.toString(),
              receiptId: attempt.receiptId,
            });
          }
        })
        .catch((error: unknown) =>
          this.logger.warn(`${url} provider publish lease not renewed`, {
            error: getErrorMessage(error),
            postId: post.id.toString(),
            receiptId: attempt.receiptId,
          }),
        );
    }, PROVIDER_PUBLISH_LEASE_RENEWAL_MS);
    renewal.unref?.();
    try {
      return await publish();
    } finally {
      clearInterval(renewal);
    }
  }

  async accept(
    post: PostEntity,
    attempt: ProviderPublishAttemptRef,
    result: PublishResult,
    url: string,
  ): Promise<void> {
    // If this write fails the attempt stays unconfirmed, and the next
    // delivery verifies it with the provider before publishing again.
    await acceptProviderPublishAttempt(
      this.prisma,
      post,
      attempt,
      result,
    ).catch((error: unknown) =>
      this.logger.error(`${url} provider publish receipt not recorded`, {
        error: getErrorMessage(error),
        externalId: result.externalId,
        postId: post.id.toString(),
        receiptId: attempt.receiptId,
      }),
    );
  }

  async settle(
    post: PostEntity,
    attempt: ProviderPublishAttemptRef,
    outcome: 'uncertain' | 'released',
    url: string,
  ): Promise<void> {
    const settle =
      outcome === 'uncertain'
        ? markProviderPublishAttemptUncertain
        : releaseProviderPublishAttempt;
    await settle(this.prisma, post, attempt).catch((error: unknown) =>
      this.logger.error(`${url} provider publish attempt not settled`, {
        error: getErrorMessage(error),
        outcome,
        postId: post.id.toString(),
        receiptId: attempt.receiptId,
      }),
    );
  }

  async markPersisted(
    post: PostEntity,
    attempt: ProviderPublishAttemptRef,
    result: PublishResult,
    url: string,
  ): Promise<void> {
    await markProviderReceiptPersisted(
      this.prisma,
      post,
      attempt,
      result,
    ).catch((error: unknown) =>
      this.logger.warn(`${url} provider receipt persistence not marked`, {
        error: getErrorMessage(error),
        postId: post.id.toString(),
        receiptId: attempt.receiptId,
      }),
    );
  }
}
