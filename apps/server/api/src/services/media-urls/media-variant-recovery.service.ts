import { MediaDerivativePreparationService } from '@api/services/media-urls/media-derivative-preparation.service';
import {
  MEDIA_RECOVERY_BATCH_SIZE,
  MEDIA_RECOVERY_EXHAUSTED_FAILURE_CODE,
  MEDIA_VARIANT_MAX_RECOVERY_ATTEMPTS,
  MEDIA_VARIANT_RETRY_BASE_MS,
  MEDIA_VARIANT_STALE_PENDING_MS,
} from '@api/services/media-urls/media-recovery.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { MediaDeliveryPurpose } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

export type MediaVariantRecoveryTotals = {
  exhausted: number;
  requeued: number;
  retried: number;
};

type RecoverableVariant = {
  attemptCount: number;
  id: string;
  ingredientId: string;
  organizationId: string;
  purpose: string;
  sourceIdentity: string;
  state: string;
  updatedAt: Date;
};

/** `public-social` is never rendered, so it is never recovered either. */
const RECOVERABLE_PURPOSES: readonly MediaDeliveryPurpose[] = [
  'preview',
  'public-share',
  'public-og',
];

function recoverablePurpose(purpose: string): MediaDeliveryPurpose | null {
  return (
    RECOVERABLE_PURPOSES.find((candidate) => candidate === purpose) ?? null
  );
}

/**
 * Re-drives derivative variants the render queue dropped.
 *
 * The prepare job is created with `removeOnFail`, so a variant whose job was
 * lost (worker restart, Redis flush, exhausted retries) stays PENDING or
 * FAILED forever and its asset shows "Preview unavailable". This sweep requeues
 * stale PENDING variants and retries FAILED ones with doubling backoff, up to a
 * fixed number of attempts. The prepare job id dedupes while a job still
 * exists, so overlapping sweeps are safe.
 */
@Injectable()
export class MediaVariantRecoveryService {
  private readonly context = 'MediaVariantRecoveryService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly preparation: MediaDerivativePreparationService,
    private readonly logger: LoggerService,
  ) {}

  /** Retry delay before the next FAILED retry; doubles with each attempt. */
  static retryDelayMs(attemptCount: number): number {
    return MEDIA_VARIANT_RETRY_BASE_MS * 2 ** attemptCount;
  }

  async recover(now = new Date()): Promise<MediaVariantRecoveryTotals> {
    const totals: MediaVariantRecoveryTotals = {
      exhausted: 0,
      requeued: 0,
      retried: 0,
    };
    if (!this.preparation.isEnabled()) return totals;

    totals.exhausted = await this.markExhausted(now);
    for (const variant of await this.findStalePending(now)) {
      if (await this.requeue(variant)) totals.requeued += 1;
    }
    for (const variant of await this.findRetryableFailed(now)) {
      if (await this.requeue(variant)) totals.retried += 1;
    }

    if (totals.exhausted > 0) {
      Sentry.captureMessage('Media delivery recovery gave up on variants', {
        extra: { exhausted: totals.exhausted },
        level: 'warning',
        tags: { area: 'media-delivery-recovery' },
      });
    }
    return totals;
  }

  private async findStalePending(now: Date): Promise<RecoverableVariant[]> {
    // tenant-scope-ignore: platform recovery sweep across organizations
    return this.prisma.mediaDeliveryVariant.findMany({
      orderBy: { updatedAt: 'asc' },
      take: MEDIA_RECOVERY_BATCH_SIZE,
      where: {
        attemptCount: { lt: MEDIA_VARIANT_MAX_RECOVERY_ATTEMPTS },
        isDeleted: false,
        purpose: { in: [...RECOVERABLE_PURPOSES] },
        state: 'PENDING',
        updatedAt: {
          lt: new Date(now.getTime() - MEDIA_VARIANT_STALE_PENDING_MS),
        },
      },
    });
  }

  private async findRetryableFailed(now: Date): Promise<RecoverableVariant[]> {
    // The per-attempt backoff is part of the query: filtering after `take`
    // would let not-yet-due rows with long delays starve the due ones.
    const dueByAttempt = Array.from(
      { length: MEDIA_VARIANT_MAX_RECOVERY_ATTEMPTS },
      (_, attemptCount) => ({
        attemptCount,
        updatedAt: {
          lte: new Date(
            now.getTime() -
              MediaVariantRecoveryService.retryDelayMs(attemptCount),
          ),
        },
      }),
    );
    // tenant-scope-ignore: platform recovery sweep across organizations
    return this.prisma.mediaDeliveryVariant.findMany({
      orderBy: { updatedAt: 'asc' },
      take: MEDIA_RECOVERY_BATCH_SIZE,
      where: {
        AND: [
          {
            OR: [
              { failureCode: null },
              { failureCode: { not: MEDIA_RECOVERY_EXHAUSTED_FAILURE_CODE } },
            ],
          },
          { OR: dueByAttempt },
        ],
        isDeleted: false,
        purpose: { in: [...RECOVERABLE_PURPOSES] },
        state: 'FAILED',
      },
    });
  }

  /**
   * Variants out of attempts become terminally FAILED: a stale PENDING one
   * whose last job vanished, or a FAILED one whose last retry just failed.
   */
  private async markExhausted(now: Date): Promise<number> {
    // tenant-scope-ignore: platform recovery sweep across organizations
    const result = await this.prisma.mediaDeliveryVariant.updateMany({
      data: {
        failureCode: MEDIA_RECOVERY_EXHAUSTED_FAILURE_CODE,
        state: 'FAILED',
      },
      where: {
        attemptCount: { gte: MEDIA_VARIANT_MAX_RECOVERY_ATTEMPTS },
        isDeleted: false,
        OR: [
          {
            state: 'PENDING',
            updatedAt: {
              lt: new Date(now.getTime() - MEDIA_VARIANT_STALE_PENDING_MS),
            },
          },
          {
            failureCode: { not: MEDIA_RECOVERY_EXHAUSTED_FAILURE_CODE },
            state: 'FAILED',
            updatedAt: {
              lt: new Date(now.getTime() - MEDIA_VARIANT_RETRY_BASE_MS),
            },
          },
        ],
      },
    });
    return result.count;
  }

  /** Claims the variant atomically, then re-adds its prepare job. */
  private async requeue(variant: RecoverableVariant): Promise<boolean> {
    const purpose = recoverablePurpose(variant.purpose);
    if (!purpose) return false;
    try {
      const claim = await this.prisma.mediaDeliveryVariant.updateMany({
        data: {
          attemptCount: { increment: 1 },
          failureCode: null,
          state: 'PENDING',
        },
        where: {
          attemptCount: variant.attemptCount,
          id: variant.id,
          isDeleted: false,
          organizationId: variant.organizationId,
          state: variant.state,
        },
      });
      if (claim.count !== 1) return false;
      await this.preparation.addPrepareJob(variant.id, {
        ingredientId: variant.ingredientId,
        organizationId: variant.organizationId,
        purpose,
        sourceIdentity: variant.sourceIdentity,
      });
      return true;
    } catch (error: unknown) {
      this.logger.error('Media variant requeue failed', {
        context: this.context,
        error: getErrorMessage(error),
        variantId: variant.id,
      });
      Sentry.captureException(error, {
        tags: { area: 'media-delivery-recovery', variantId: variant.id },
      });
      return false;
    }
  }
}
