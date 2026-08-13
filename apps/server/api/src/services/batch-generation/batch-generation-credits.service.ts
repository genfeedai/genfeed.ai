import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type BatchConfig,
  type BatchCreditsLedger,
  resolveBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { batchItemRowsReadArgs } from '@api/services/batch-generation/batch-item-rows';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type BatchPricingOptions,
  reconcileBatchGenerationCredits,
} from '@genfeedai/constants';
import { ActivitySource, BatchItemStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/** Refunded credits expire a year out, matching other refund paths. */
const REFUND_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

/** Compare-and-swap retries before a settlement gives up for this tick. */
const SETTLE_MAX_ATTEMPTS = 3;

/** Durable credit-ledger idempotency namespace for a batch's one settlement. */
const BATCH_SETTLEMENT_REFERENCE_TYPE = 'batch-generation:settlement';

export type BatchCreditsSettlement = {
  /** Extra credits deducted to reach the price of what landed. */
  additionalCredits: number;
  /** True when another settlement already owned this batch — nothing moved. */
  isAlreadySettled: boolean;
  /** Credits handed back because the up-front estimate overshot. */
  refundCredits: number;
  /** Net credits this batch is billed, after settlement. */
  settledCredits: number;
};

/**
 * Owns the credit ledger on a batch.
 *
 * The JSON ledger is the batch's settlement claim. Ordinarily its
 * `chargedCredits` matches credits already moved; if a post-claim deduction
 * fails, the typed `settlementShortfall` column is the durable exception.
 * Replaying settlement still moves nothing, and only that stored marker may
 * retry the missing amount.
 */
@Injectable()
export class BatchGenerationCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
  ) {}

  /**
   * Record credits the caller has already deducted before the run starts, so
   * settlement bills the delta rather than the full amount a second time.
   */
  async recordUpfrontCharge(params: {
    batchId: string;
    credits: number;
    organizationId: string;
    pricingOptions?: BatchPricingOptions;
  }): Promise<void> {
    const batch = await this.prisma.batch.findFirst({
      select: { config: true, updatedAt: true },
      where: scopedWhere(params.organizationId, { id: params.batchId }),
    });

    if (!batch) {
      return;
    }

    const config = (batch.config ?? {}) as BatchConfig;
    const ledger: BatchCreditsLedger = {
      ...(config.credits ?? {}),
      chargedCredits: (config.credits?.chargedCredits ?? 0) + params.credits,
    };

    // Name the shape before the cast. An inline literal widens the optional
    // nested config objects, and the stricter tsconfigs then reject the direct
    // `as Prisma.InputJsonValue` conversion as non-overlapping.
    const chargedConfig: BatchConfig = {
      ...config,
      credits: ledger,
      ...(params.pricingOptions ? { pricing: params.pricingOptions } : {}),
    };

    const recorded = await this.prisma.batch.updateMany({
      data: {
        config: chargedConfig as Prisma.InputJsonValue,
      },
      where: scopedWhere(params.organizationId, {
        id: params.batchId,
        updatedAt: batch.updatedAt,
      }),
    });

    if (recorded.count !== 1) {
      this.logger.warn(
        `Batch ${params.batchId} up-front charge not recorded: row changed`,
        { batchId: params.batchId, credits: params.credits },
      );
    }
  }

  /**
   * Reconcile the batch to the price of the drafts that actually landed.
   *
   * Safe to call more than once for the same batch: the ledger swap is the
   * gate, and a caller that loses it moves no credits at all.
   */
  async settleBatchCredits(params: {
    batchId: string;
    organizationId: string;
    userId: string;
  }): Promise<BatchCreditsSettlement> {
    const noop: BatchCreditsSettlement = {
      additionalCredits: 0,
      isAlreadySettled: true,
      refundCredits: 0,
      settledCredits: 0,
    };

    for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
      const batch = await this.prisma.batch.findFirst({
        select: {
          batchItems: batchItemRowsReadArgs(params.organizationId),
          config: true,
          items: true,
          updatedAt: true,
        },
        where: scopedWhere(params.organizationId, { id: params.batchId }),
      });

      if (!batch) {
        return noop;
      }

      const config = (batch.config ?? {}) as BatchConfig;
      const alreadyCharged = Math.max(0, config.credits?.chargedCredits ?? 0);

      // Bill completed drafts only, at the rates captured when the batch was
      // created — media-aware, so an item that gained a mediaUrl costs more.
      const billableItems = resolveBatchItems(batch)
        .filter(
          (item) => item.status === BatchItemStatus.COMPLETED && item.postId,
        )
        .map((item) => ({
          format: item.format,
          hasMedia: Boolean(item.mediaUrl),
        }));
      const { additionalCredits, refundCredits, settledCredits } =
        reconcileBatchGenerationCredits(
          alreadyCharged,
          billableItems,
          config.pricing ?? {},
        );

      const settlementSeq = (config.credits?.settlementSeq ?? 0) + 1;
      const ledger: BatchCreditsLedger = {
        chargedCredits: settledCredits,
        refundedCredits: (config.credits?.refundedCredits ?? 0) + refundCredits,
        settledAt: new Date().toISOString(),
        settlementSeq,
      };

      // Claim the settlement before moving anything. `updatedAt` is the
      // compare-and-swap token: a redelivered job or a concurrent sweep that
      // loses the swap recomputes against the new ledger and finds nothing
      // owing. Recording first also means a failed credit move fails as an
      // under-charge, never as a double charge; the failure path below records
      // that exact under-charge for idempotent reconciliation.
      const settledConfig: BatchConfig = { ...config, credits: ledger };

      const claimed = await this.prisma.batch.updateMany({
        data: {
          config: settledConfig as Prisma.InputJsonValue,
        },
        where: scopedWhere(params.organizationId, {
          id: params.batchId,
          updatedAt: batch.updatedAt,
        }),
      });

      if (claimed.count !== 1) {
        continue;
      }

      await this.moveSettlementCredits({
        additionalCredits,
        batchId: params.batchId,
        organizationId: params.organizationId,
        refundCredits,
        settlementSeq,
        userId: params.userId,
      });

      return {
        additionalCredits,
        isAlreadySettled: false,
        refundCredits,
        settledCredits,
      };
    }

    this.logger.warn(
      `Batch ${params.batchId} settlement skipped after concurrent updates`,
      { batchId: params.batchId },
    );
    return noop;
  }

  /**
   * Retry only the exact shortfall recorded by a failed settlement deduction.
   *
   * A compare-and-swap first confirms the exact marker still exists, so stale
   * sweep results cannot charge after another worker collected it. The marker
   * stays durable until collection succeeds, while the credit-transaction
   * reference makes concurrent and ambiguous retries idempotent.
   */
  async retrySettlementShortfall(params: {
    batchId: string;
    organizationId: string;
    settlementShortfall: number;
    settlementShortfallSeq: number;
    userId: string;
  }): Promise<boolean> {
    if (!this.creditsUtilsService || params.settlementShortfall <= 0) {
      return false;
    }

    const stillMarked = await this.prisma.batch.updateMany({
      data: { settlementShortfall: params.settlementShortfall },
      where: scopedWhere(params.organizationId, {
        id: params.batchId,
        settlementShortfall: params.settlementShortfall,
        settlementShortfallSeq: params.settlementShortfallSeq,
      }),
    });

    if (stillMarked.count !== 1) {
      return false;
    }

    try {
      await this.deductSettlementCredits({
        batchId: params.batchId,
        organizationId: params.organizationId,
        settlementSeq: params.settlementShortfallSeq,
        settlementShortfall: params.settlementShortfall,
        userId: params.userId,
      });
    } catch (error: unknown) {
      // The marker is still set, so the next sweep retries. The original
      // failure already alerted; a recurring retry failure while the balance
      // stays exhausted is expected and must not spam Sentry every tick.
      this.logger.error(
        `Batch ${params.batchId} settlement shortfall retry failed`,
        error,
        {
          batchId: params.batchId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
          settlementShortfallSeq: params.settlementShortfallSeq,
        },
      );
      return false;
    }

    const cleared = await this.prisma.batch.updateMany({
      data: { settlementShortfall: null, settlementShortfallSeq: null },
      where: scopedWhere(params.organizationId, {
        id: params.batchId,
        settlementShortfall: params.settlementShortfall,
        settlementShortfallSeq: params.settlementShortfallSeq,
      }),
    });

    return cleared.count === 1;
  }

  private async moveSettlementCredits(params: {
    additionalCredits: number;
    batchId: string;
    organizationId: string;
    refundCredits: number;
    settlementSeq: number;
    userId: string;
  }): Promise<void> {
    if (!this.creditsUtilsService) {
      return;
    }

    if (params.additionalCredits > 0) {
      try {
        await this.deductSettlementCredits({
          batchId: params.batchId,
          organizationId: params.organizationId,
          settlementSeq: params.settlementSeq,
          settlementShortfall: params.additionalCredits,
          userId: params.userId,
        });
      } catch (error: unknown) {
        await this.handleSettlementDeductionFailure(
          {
            batchId: params.batchId,
            organizationId: params.organizationId,
            settlementSeq: params.settlementSeq,
            settlementShortfall: params.additionalCredits,
            userId: params.userId,
          },
          error,
        );
      }
      return;
    }

    try {
      if (params.refundCredits > 0) {
        await this.creditsUtilsService.refundOrganizationCredits(
          params.organizationId,
          params.refundCredits,
          'batch-generation-refund',
          `Batch generation ${params.batchId} settlement`,
          new Date(Date.now() + REFUND_EXPIRY_MS),
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Batch ${params.batchId} credit settlement move failed`,
        error,
        {
          additionalCredits: params.additionalCredits,
          batchId: params.batchId,
          refundCredits: params.refundCredits,
        },
      );
    }
  }

  private async deductSettlementCredits(params: {
    batchId: string;
    organizationId: string;
    settlementSeq: number;
    settlementShortfall: number;
    userId: string;
  }): Promise<void> {
    // The reference is scoped to one settlement occurrence, not the batch: a
    // resumed batch legitimately settles again with a new delta, and that new
    // occurrence must charge rather than match the previous occurrence's
    // transaction. Retries of the SAME occurrence (the shortfall sweep, or an
    // ambiguous failure after the deduction committed) reuse the same seq and
    // stay idempotent through the existing reference lookup.
    await this.creditsUtilsService?.deductCreditsFromOrganization(
      params.organizationId,
      params.userId,
      params.settlementShortfall,
      `Batch generation ${params.batchId} settlement`,
      ActivitySource.SCRIPT,
      {
        metadata: { batchId: params.batchId },
        referenceId: `${params.batchId}:${params.settlementSeq}`,
        referenceType: BATCH_SETTLEMENT_REFERENCE_TYPE,
      },
    );
  }

  private async handleSettlementDeductionFailure(
    params: {
      batchId: string;
      organizationId: string;
      settlementSeq: number;
      settlementShortfall: number;
      userId: string;
    },
    error: unknown,
  ): Promise<void> {
    try {
      // Only claim a free marker. Overwriting would erase an earlier, still
      // uncollected shortfall; the rare second concurrent shortfall is alerted
      // below instead of silently replacing the first.
      const marked = await this.prisma.batch.updateMany({
        data: {
          settlementShortfall: params.settlementShortfall,
          settlementShortfallSeq: params.settlementSeq,
        },
        where: scopedWhere(params.organizationId, {
          id: params.batchId,
          settlementShortfall: null,
        }),
      });

      if (marked.count !== 1) {
        Sentry.captureException(
          new Error(
            `Batch ${params.batchId} settlement shortfall is NOT durably tracked: marker occupied or batch missing`,
          ),
          {
            extra: {
              batchId: params.batchId,
              organizationId: params.organizationId,
              settlementSeq: params.settlementSeq,
              settlementShortfall: params.settlementShortfall,
            },
            tags: {
              operation: 'batch-credit-settlement-marker',
            },
          },
        );
        this.logger.error(
          `Batch ${params.batchId} settlement shortfall marker was not persisted`,
          undefined,
          {
            batchId: params.batchId,
            organizationId: params.organizationId,
            settlementSeq: params.settlementSeq,
            settlementShortfall: params.settlementShortfall,
          },
        );
      }
    } catch (markerError: unknown) {
      this.logger.error(
        `Batch ${params.batchId} settlement shortfall marker failed to persist`,
        markerError,
        {
          batchId: params.batchId,
          organizationId: params.organizationId,
          settlementShortfall: params.settlementShortfall,
        },
      );
    }

    Sentry.captureException(error, {
      extra: {
        batchId: params.batchId,
        organizationId: params.organizationId,
        settlementShortfall: params.settlementShortfall,
      },
      tags: {
        operation: 'batch-credit-settlement',
      },
    });

    // The settled ledger remains the never-double-charge gate. The shortfall
    // marker is now the only retry amount; no sweep recomputes it from drafts.
    this.logger.error(
      `Batch ${params.batchId} credit settlement deduction failed`,
      error,
      {
        batchId: params.batchId,
        organizationId: params.organizationId,
        settlementShortfall: params.settlementShortfall,
      },
    );
  }
}
