import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { addMonths } from '@api/collections/referrals/utils/referral-dates.util';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  BillingAccountOrganizationStatus,
  ReferralRewardStatus,
  ReferralStatus,
} from '@genfeedai/contracts';
import {
  AFFILIATE_REWARD_RATE,
  AFFILIATE_REWARD_WINDOW_MONTHS,
  REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE,
} from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { traced } from '@libs/tracing/traced';

/** What the reward payout lifecycle needs from the service that owns it. */
export type ReferralRewardLifecycleDeps = {
  activityRecorder: ActivityRecorderService;
  creditsUtilsService: CreditsUtilsService;
  logger: LoggerService;
  prisma: PrismaService;
};

export type ReferralPaymentReversalInput = {
  disputed: boolean;
  refundedAmountCents: number;
  stripePaymentIntentId: string;
};

async function findFallbackDestination(
  deps: ReferralRewardLifecycleDeps,
  billingAccountId: string,
) {
  // tenant-scope-ignore: destination recovery is scoped by the immutable billing account and selects only a linked, live organization
  const links = await deps.prisma.billingAccountOrganization.findMany({
    select: { organizationId: true },
    where: {
      billingAccountId,
      isDeleted: false,
      status: BillingAccountOrganizationStatus.LINKED,
    },
  });
  return deps.prisma.organization.findFirst({
    where: {
      id: { in: links.map((link) => link.organizationId) },
      isDeleted: false,
    },
  });
}

async function cancelReward(
  deps: ReferralRewardLifecycleDeps,
  id: string,
  lockedAt: Date,
): Promise<void> {
  const cancelled = await deps.prisma.referralReward.updateMany({
    data: {
      cancelledAt: new Date(),
      lockedAt: null,
      status: ReferralRewardStatus.CANCELLED,
    },
    where: {
      id,
      isDeleted: false,
      lockedAt,
      status: ReferralRewardStatus.PROCESSING,
    },
  });
  if (cancelled.count !== 1) {
    throw new Error('Referral reward cancellation lease was lost');
  }
}

/**
 * Claims a due reward under a processing lease, credits its destination and
 * marks it granted; a failure releases the lease and schedules a retry.
 */
export const settleReward = traced(
  'settleReward',
  async (
    deps: ReferralRewardLifecycleDeps,
    rewardId: string,
  ): Promise<void> => {
    const lockedAt = new Date();
    const claimed = await deps.prisma.referralReward.updateMany({
      data: {
        attemptCount: { increment: 1 },
        failureReason: null,
        lockedAt,
        status: ReferralRewardStatus.PROCESSING,
      },
      where: {
        id: rewardId,
        isDeleted: false,
        lockedAt: null,
        nextAttemptAt: { lte: lockedAt },
        status: {
          in: [ReferralRewardStatus.PENDING, ReferralRewardStatus.FAILED],
        },
      },
    });
    if (claimed.count !== 1) {
      return;
    }
    try {
      const reward = await deps.prisma.referralReward.findFirst({
        include: { referral: { include: { code: true } } },
        where: { id: rewardId, isDeleted: false, lockedAt },
      });
      if (!reward || reward.rewardCredits < 1) {
        await cancelReward(deps, rewardId, lockedAt);
        return;
      }
      const code = reward.referral.code;
      const pinnedDestination = await deps.prisma.organization.findFirst({
        where: {
          billingAccountLinks: {
            some: {
              billingAccountId: code.rewardBillingAccountId,
              isDeleted: false,
              status: BillingAccountOrganizationStatus.LINKED,
            },
          },
          id: code.rewardOrganizationId,
          isDeleted: false,
        },
      });
      const fallbackDestination = pinnedDestination
        ? null
        : await findFallbackDestination(deps, code.rewardBillingAccountId);
      const destination = pinnedDestination ?? fallbackDestination;
      if (
        !destination ||
        !code.isActive ||
        code.isDeleted ||
        reward.referral.status !== ReferralStatus.ACTIVE
      ) {
        throw new Error('Referral reward destination is no longer eligible');
      }
      const idempotencyKey = `referral-reward-grant:${reward.id}`;
      await deps.creditsUtilsService.addOrganizationCreditsWithExpiration(
        destination.id,
        reward.rewardCredits,
        ActivitySource.REFERRAL,
        'Affiliate purchase reward',
        addMonths(new Date(), AFFILIATE_REWARD_WINDOW_MONTHS),
        {
          idempotencyKey,
          metadata: {
            referralId: reward.referralId,
            referralRewardId: reward.id,
            stripeCheckoutSessionId: reward.stripeCheckoutSessionId,
          },
          referenceId: reward.id,
          referenceType: 'referral-reward',
        },
      );
      // tenant-scope-ignore: the globally unique reward-grant idempotency key resolves the original ledger tenant after destination fallback
      const transaction = await deps.prisma.creditTransaction.findFirst({
        where: {
          idempotencyKey,
          isDeleted: false,
        },
        select: { id: true, organizationId: true },
      });
      if (!transaction) {
        throw new Error('Referral reward ledger transaction was not persisted');
      }
      const completed = await deps.prisma.referralReward.updateMany({
        data: {
          failureReason: null,
          grantTransactionId: transaction.id,
          grantedAt: new Date(),
          lockedAt: null,
          status: ReferralRewardStatus.GRANTED,
        },
        where: {
          id: reward.id,
          isDeleted: false,
          lockedAt,
          status: ReferralRewardStatus.PROCESSING,
        },
      });
      if (completed.count !== 1) {
        throw new Error('Referral reward settlement lease was lost');
      }
      try {
        await deps.activityRecorder.record({
          key: ActivityKey.CREDITS_ADD,
          organizationId: transaction.organizationId,
          source: ActivitySource.REFERRAL,
          userId: code.ownerUserId,
          value: String(reward.rewardCredits),
        });
      } catch (activityError: unknown) {
        deps.logger.warn('Referral reward activity emission failed', {
          activityError,
          rewardId: reward.id,
        });
      }
    } catch (error: unknown) {
      const current = await deps.prisma.referralReward.findFirst({
        select: { attemptCount: true },
        where: { id: rewardId, isDeleted: false },
      });
      const delayMinutes = Math.min(
        24 * 60,
        2 ** Math.min(current?.attemptCount ?? 1, 10),
      );
      await deps.prisma.referralReward.updateMany({
        data: {
          failureReason: String(
            error instanceof Error ? error.message : 'Settlement failed',
          ).slice(0, 500),
          lockedAt: null,
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60 * 1000),
          status: ReferralRewardStatus.FAILED,
        },
        where: {
          id: rewardId,
          isDeleted: false,
          lockedAt,
          status: ReferralRewardStatus.PROCESSING,
        },
      });
      deps.logger.error('Referral reward settlement failed', {
        error,
        rewardId,
      });
    }
  },
);

/**
 * Applies a refund or dispute to a reward under a lease: reverses what was
 * granted, or shrinks a reward that has not been granted yet.
 */
export const reverseReward = traced(
  'reverseReward',
  async (
    deps: ReferralRewardLifecycleDeps,
    rewardId: string,
    input: ReferralPaymentReversalInput,
  ): Promise<void> => {
    const lockedAt = new Date();
    const claimed = await deps.prisma.referralReward.updateMany({
      data: { lockedAt },
      where: {
        id: rewardId,
        isDeleted: false,
        lockedAt: null,
        status: { not: ReferralRewardStatus.PROCESSING },
      },
    });
    if (claimed.count !== 1) {
      throw new Error(
        `Referral reward ${rewardId} changed state; retry payment reversal`,
      );
    }

    try {
      const reward = await deps.prisma.referralReward.findFirst({
        include: {
          grantTransaction: { select: { organizationId: true } },
          referral: { include: { code: true } },
        },
        where: { id: rewardId, isDeleted: false, lockedAt },
      });
      if (!reward) {
        throw new Error(`Referral reward ${rewardId} lease was lost`);
      }

      const grossAmountCents = Math.max(reward.grossAmountCents, 1);
      const normalizedRefundCents = Math.round(
        (Math.max(0, input.refundedAmountCents) * reward.netAmountCents) /
          grossAmountCents,
      );
      const refundedAmountCents = input.disputed
        ? reward.netAmountCents
        : Math.min(
            reward.netAmountCents,
            Math.max(reward.refundedAmountCents, normalizedRefundCents),
          );
      const retainedCredits = Math.floor(
        (reward.netAmountCents - refundedAmountCents) * AFFILIATE_REWARD_RATE,
      );
      const wasGranted = Boolean(reward.grantTransactionId || reward.grantedAt);

      if (wasGranted) {
        const desiredReversedCredits = Math.max(
          0,
          reward.rewardCredits - retainedCredits,
        );
        const creditsToReverse = Math.max(
          0,
          desiredReversedCredits - reward.reversedCredits,
        );
        if (creditsToReverse > 0) {
          const destinationOrganizationId =
            reward.grantTransaction?.organizationId ??
            reward.referral.code.rewardOrganizationId;
          const currentBalance =
            await deps.creditsUtilsService.getOrganizationCreditsBalance(
              destinationOrganizationId,
            );
          const idempotencyKey = `referral-reward-reversal:${reward.id}:${refundedAmountCents}`;
          await deps.creditsUtilsService.deductCreditsFromOrganization(
            destinationOrganizationId,
            reward.referral.code.ownerUserId,
            creditsToReverse,
            'Affiliate reward reversal',
            ActivitySource.REFERRAL,
            {
              idempotencyKey,
              maxOverdraftCredits:
                creditsToReverse + Math.max(0, -currentBalance),
              metadata: {
                referralRewardId: reward.id,
                refundedAmountCents,
                stripePaymentIntentId: input.stripePaymentIntentId,
              },
              referenceId: `${reward.id}:${refundedAmountCents}`,
              referenceType: REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE,
            },
          );
        }
        const completed = await deps.prisma.referralReward.updateMany({
          data: {
            refundedAmountCents,
            lockedAt: null,
            reversedAt:
              desiredReversedCredits >= reward.rewardCredits
                ? new Date()
                : reward.reversedAt,
            reversedCredits: desiredReversedCredits,
            status:
              desiredReversedCredits >= reward.rewardCredits
                ? ReferralRewardStatus.REVERSED
                : ReferralRewardStatus.GRANTED,
          },
          where: { id: reward.id, isDeleted: false, lockedAt },
        });
        if (completed.count !== 1) {
          throw new Error(`Referral reward ${reward.id} lease was lost`);
        }
        return;
      }

      const completed = await deps.prisma.referralReward.updateMany({
        data: {
          cancelledAt: retainedCredits < 1 ? new Date() : null,
          refundedAmountCents,
          lockedAt: null,
          rewardCredits: retainedCredits,
          status:
            retainedCredits < 1
              ? ReferralRewardStatus.CANCELLED
              : ReferralRewardStatus.PENDING,
        },
        where: { id: reward.id, isDeleted: false, lockedAt },
      });
      if (completed.count !== 1) {
        throw new Error(`Referral reward ${reward.id} lease was lost`);
      }
    } catch (error: unknown) {
      await deps.prisma.referralReward.updateMany({
        data: { lockedAt: null },
        where: { id: rewardId, isDeleted: false, lockedAt },
      });
      throw new Error(`Referral reward ${rewardId} reversal failed`, {
        cause: error,
      });
    }
  },
);
