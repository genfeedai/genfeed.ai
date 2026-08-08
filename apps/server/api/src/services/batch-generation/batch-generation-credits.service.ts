import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type BatchConfig,
  type BatchCreditsLedger,
  cloneBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type BatchPricingOptions,
  chargeBatchGenerationCredits,
} from '@genfeedai/constants';
import { ActivitySource, BatchItemStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/** Refunded credits expire a year out, matching other refund paths. */
const REFUND_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

/** Compare-and-swap retries before a settlement gives up for this tick. */
const SETTLE_MAX_ATTEMPTS = 3;

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
 * The ledger records the **net credits already moved** for the batch, not
 * "have we settled yet". Settlement recomputes the price of what actually
 * landed and moves only `target - alreadyCharged`, so replaying it — after a
 * BullMQ redelivery, a resumed run, or a reconciliation sweep — charges zero
 * the second time instead of billing the same drafts twice.
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

    const recorded = await this.prisma.batch.updateMany({
      data: {
        config: {
          ...config,
          credits: ledger,
          ...(params.pricingOptions ? { pricing: params.pricingOptions } : {}),
        } as unknown as Prisma.InputJsonValue,
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
        select: { config: true, items: true, updatedAt: true },
        where: scopedWhere(params.organizationId, { id: params.batchId }),
      });

      if (!batch) {
        return noop;
      }

      const config = (batch.config ?? {}) as BatchConfig;
      const alreadyCharged = Math.max(0, config.credits?.chargedCredits ?? 0);

      // Bill completed drafts only, at the rates captured when the batch was
      // created — media-aware, so an item that gained a mediaUrl costs more.
      const billableItems = cloneBatchItems(batch.items)
        .filter(
          (item) => item.status === BatchItemStatus.COMPLETED && item.postId,
        )
        .map((item) => ({
          format: item.format,
          hasMedia: Boolean(item.mediaUrl),
        }));
      const settledCredits = chargeBatchGenerationCredits(
        billableItems,
        config.pricing ?? {},
      );

      const additionalCredits = Math.max(0, settledCredits - alreadyCharged);
      const refundCredits = Math.max(0, alreadyCharged - settledCredits);

      const ledger: BatchCreditsLedger = {
        chargedCredits: settledCredits,
        refundedCredits: (config.credits?.refundedCredits ?? 0) + refundCredits,
        settledAt: new Date().toISOString(),
      };

      // Claim the settlement before moving anything. `updatedAt` is the
      // compare-and-swap token: a redelivered job or a concurrent sweep that
      // loses the swap recomputes against the new ledger and finds nothing
      // owing. Recording first also means a failed credit move fails as an
      // under-charge, never as a double charge.
      const claimed = await this.prisma.batch.updateMany({
        data: {
          config: {
            ...config,
            credits: ledger,
          } as unknown as Prisma.InputJsonValue,
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

  private async moveSettlementCredits(params: {
    additionalCredits: number;
    batchId: string;
    organizationId: string;
    refundCredits: number;
    userId: string;
  }): Promise<void> {
    if (!this.creditsUtilsService) {
      return;
    }

    try {
      if (params.additionalCredits > 0) {
        await this.creditsUtilsService.deductCreditsFromOrganization(
          params.organizationId,
          params.userId,
          params.additionalCredits,
          `Batch generation ${params.batchId} settlement`,
          ActivitySource.SCRIPT,
        );
        return;
      }

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
      // The ledger already records the settled amount, so retrying here would
      // risk billing the same drafts twice. Surface it and stay under-charged.
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
}
