import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  BusinessLogicException,
  InsufficientCreditsException,
} from '@api/exceptions/business-logic.exception';
import {
  reserveTextCredits,
  settleTextCredits,
  type TextCreditHold,
} from '@api/helpers/utils/credits/text-credit-hold.util';
import { ActivitySource } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { traced } from '@libs/tracing/traced';

type EvaluationCreditsClient = Pick<
  CreditsUtilsService,
  | 'deductCreditsFromOrganization'
  | 'getOrganizationCreditsBalance'
  | 'refundOrganizationCredits'
  | 'releaseReservation'
  | 'reserveCredits'
  | 'settleReservation'
>;

/** Credits an evaluation needs on hand before the judge model may run. */
const EVALUATION_MINIMUM_CREDITS = 1;

const EVALUATION_HOLD_WORKLOAD_TYPE = 'content-evaluation';

/**
 * Hold the minimum credits before the judge model runs, so two concurrent
 * evaluations cannot both start on a balance that pays for one. A refused hold
 * surfaces as `InsufficientCreditsException`, with nothing run yet.
 */
export const holdEvaluationCredits = traced(
  'holdEvaluationCredits',
  async (
    credits: EvaluationCreditsClient,
    logger: LoggerService,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<TextCreditHold> => {
    try {
      return await reserveTextCredits(credits, {
        brandId,
        description: 'Content evaluation',
        holdCredits: EVALUATION_MINIMUM_CREDITS,
        organizationId,
        source: ActivitySource.CONTENT_EVALUATION,
        userId,
        workloadType: EVALUATION_HOLD_WORKLOAD_TYPE,
      });
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        error.errorCode === 'INSUFFICIENT_CREDITS'
      ) {
        const currentBalance =
          await credits.getOrganizationCreditsBalance(organizationId);
        logger.warn(
          `Insufficient credits for evaluation: ${currentBalance} available, ${EVALUATION_MINIMUM_CREDITS} required`,
          'EvaluationsService',
        );
        throw new InsufficientCreditsException(
          EVALUATION_MINIMUM_CREDITS,
          currentBalance,
        );
      }
      throw error;
    }
  },
);

/** Bill the judge's actual cost against the hold, or directly when none was taken. */
export const settleEvaluationCredits = traced(
  'settleEvaluationCredits',
  async (
    credits: EvaluationCreditsClient,
    organizationId: string,
    userId: string,
    amount: number,
    description: string,
    brandId?: string | null,
    hold?: TextCreditHold,
  ): Promise<void> => {
    if (hold) {
      await settleTextCredits(credits, hold, {
        actualCredits: amount,
        brandId,
        description,
        organizationId,
        source: ActivitySource.CONTENT_EVALUATION,
        userId,
      });
      return;
    }

    if (amount <= 0) return;

    // No hold means no admission ran for this call, so there is nothing to
    // overdraw against: the deduction must fit the balance.
    await credits.deductCreditsFromOrganization(
      organizationId,
      userId,
      amount,
      description,
      ActivitySource.CONTENT_EVALUATION,
      { brandId },
    );
  },
);

export const refundEvaluationCredits = traced(
  'refundEvaluationCredits',
  async (
    credits: EvaluationCreditsClient,
    logger: LoggerService,
    organizationId: string,
    amount: number,
    description: string,
    brandId?: string | null,
  ): Promise<void> => {
    if (amount <= 0) return;

    try {
      const refundExpiresAt = new Date();
      refundExpiresAt.setFullYear(refundExpiresAt.getFullYear() + 1);

      await credits.refundOrganizationCredits(
        organizationId,
        amount,
        'content-evaluation-refund',
        description,
        refundExpiresAt,
        { brandId },
      );
    } catch (error: unknown) {
      // A failed refund must not mask the original evaluation failure — log and
      // move on so the caller still surfaces the FAILED status.
      logger.error(
        `Failed to refund evaluation credits for organization ${organizationId}`,
        error,
      );
    }
  },
);
