import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import {
  ActivityKey,
  ActivitySource,
  BillingAccountOrganizationStatus,
  ReferralClaimStatus,
  ReferralRewardStatus,
  ReferralStatus,
} from '@genfeedai/contracts';
import type {
  IReferralAdminReward,
  IReferralClaimResult,
  IReferralProgram,
  IReferralReward,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { customAlphabet } from 'nanoid';

const generateReferralCode = customAlphabet(
  '23456789abcdefghjkmnpqrstuvwxyz',
  12,
);
const REWARD_RATE = 0.1;
const REWARD_RATE_PERCENT = 10;
const REWARD_WINDOW_MONTHS = 12;
const SETTLEMENT_DELAY_DAYS = 7;
const PROCESSING_LEASE_MS = 10 * 60 * 1000;
const MAX_SETTLEMENT_BATCH = 50;
export const REFERRAL_ADMIN_MAX_PAGE = 1_000_000;

const PENDING_REWARD_STATUSES = [
  ReferralRewardStatus.PENDING,
  ReferralRewardStatus.PROCESSING,
  ReferralRewardStatus.FAILED,
] as const;
const CONVERSION_REWARD_STATUSES = [
  ...PENDING_REWARD_STATUSES,
  ReferralRewardStatus.GRANTED,
  ReferralRewardStatus.REVERSED,
] as const;

type ReferralActor = {
  organizationId: string;
  userId: string;
};

type PurchaseReferralInput = {
  grossAmountCents: number;
  netAmountCents: number;
  organizationId: string;
  purchasedCredits: number;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
};

const LEGACY_PAYG_ACTIVITY_SOURCE = 'pay-as-you-go';

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function addMonths(value: Date, months: number): Date {
  const result = new Date(value);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingAccountsService: BillingAccountsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async getMine(actor: ReferralActor): Promise<IReferralProgram> {
    const account = await this.resolveActorAccount(actor);
    const referralCode = await this.ensureCode(actor, account.id);
    const referralWhere = {
      codeId: referralCode.id,
      isDeleted: false,
    } as const;
    const rewardWhere = {
      isDeleted: false,
      referralCodeId: referralCode.id,
    } as const;
    const [referralCount, convertedCount, totals, recentRewards] =
      await Promise.all([
        this.prisma.referral.count({ where: referralWhere }),
        this.prisma.referral.count({
          where: {
            ...referralWhere,
            rewards: {
              some: {
                isDeleted: false,
                status: {
                  in: [...CONVERSION_REWARD_STATUSES],
                },
              },
            },
          },
        }),
        this.prisma.referralReward.groupBy({
          by: ['status'],
          _sum: { reversedCredits: true, rewardCredits: true },
          where: rewardWhere,
        }),
        this.prisma.referralReward.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
          where: rewardWhere,
        }),
      ]);
    const sumFor = (statuses: readonly ReferralRewardStatus[]) =>
      totals
        .filter((row) => statuses.includes(row.status as ReferralRewardStatus))
        .reduce((sum, row) => sum + (row._sum.rewardCredits ?? 0), 0);
    const reversedCredits = totals.reduce(
      (sum, row) => sum + (row._sum.reversedCredits ?? 0),
      0,
    );
    const configuredBaseUrl = String(
      this.configService.get('GENFEEDAI_APP_URL') ?? '',
    ).replace(/\/$/, '');

    return {
      code: referralCode.code,
      convertedCount,
      createdAt: referralCode.createdAt.toISOString(),
      earnedCredits:
        sumFor([ReferralRewardStatus.GRANTED, ReferralRewardStatus.REVERSED]) -
        reversedCredits,
      id: referralCode.id,
      isDeleted: referralCode.isDeleted,
      pendingCredits: sumFor(PENDING_REWARD_STATUSES),
      recentRewards: recentRewards.map((reward) => this.presentReward(reward)),
      referralCount,
      reversedCredits,
      rewardRatePercent: REWARD_RATE_PERCENT,
      rewardWindowMonths: REWARD_WINDOW_MONTHS,
      settlementDelayDays: SETTLEMENT_DELAY_DAYS,
      shareUrl: `${configuredBaseUrl}/sign-up?ref=${referralCode.code}`,
      updatedAt: referralCode.updatedAt.toISOString(),
    };
  }

  async listMyRewards(actor: ReferralActor): Promise<IReferralReward[]> {
    const account = await this.resolveActorAccount(actor);
    const code = await this.prisma.referralCode.findFirst({
      where: {
        isActive: true,
        isDeleted: false,
        ownerUserId: actor.userId,
        rewardBillingAccountId: account.id,
      },
    });
    if (!code) {
      return [];
    }
    const rewards = await this.prisma.referralReward.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      where: {
        isDeleted: false,
        referralCodeId: code.id,
      },
    });
    return rewards.map((reward) => this.presentReward(reward));
  }

  async claim(
    actor: ReferralActor,
    rawCode: string,
  ): Promise<IReferralClaimResult> {
    const code = rawCode.trim().toLowerCase();
    const targetAccount = await this.resolveActorAccount(actor);
    const referralCode = await this.prisma.referralCode.findFirst({
      where: { code, isActive: true, isDeleted: false },
    });
    if (!referralCode) {
      return { isAccepted: false, status: ReferralClaimStatus.INVALID };
    }
    const existing = await this.prisma.referral.findFirst({
      where: {
        isDeleted: false,
        referredBillingAccountId: targetAccount.id,
      },
    });
    if (existing) {
      return {
        isAccepted: false,
        status: ReferralClaimStatus.ALREADY_ATTRIBUTED,
      };
    }
    if (referralCode.rewardBillingAccountId === targetAccount.id) {
      return { isAccepted: false, status: ReferralClaimStatus.INELIGIBLE };
    }

    const targetMembers = await this.prisma.billingAccountMember.findMany({
      select: { userId: true },
      where: {
        billingAccountId: targetAccount.id,
        isDeleted: false,
      },
    });
    // tenant-scope-ignore: anti-abuse intentionally compares user membership across the two billing accounts
    const sharedMember = await this.prisma.billingAccountMember.findFirst({
      select: { id: true },
      where: {
        billingAccountId: referralCode.rewardBillingAccountId,
        isDeleted: false,
        userId: { in: targetMembers.map((member) => member.userId) },
      },
    });
    if (sharedMember) {
      return { isAccepted: false, status: ReferralClaimStatus.INELIGIBLE };
    }

    // tenant-scope-ignore: paid-account eligibility is billing-account scoped and must cover every authoritative organization link
    const targetLinks = await this.prisma.billingAccountOrganization.findMany({
      select: { organizationId: true },
      where: {
        billingAccountId: targetAccount.id,
        isDeleted: false,
        status: BillingAccountOrganizationStatus.LINKED,
      },
    });
    const liveLinkedOrganizations = await this.prisma.organization.findMany({
      select: { id: true },
      where: {
        id: { in: targetLinks.map((link) => link.organizationId) },
        isDeleted: false,
      },
    });
    const targetOrganizationIds = [
      ...new Set([
        actor.organizationId,
        ...liveLinkedOrganizations.map((organization) => organization.id),
      ]),
    ];
    const [priorPurchase, priorSubscription] = await Promise.all([
      this.prisma.creditTransaction.findFirst({
        select: { id: true },
        where: {
          amount: { gt: 0 },
          isDeleted: false,
          organizationId: { in: targetOrganizationIds },
          source: {
            in: [ActivitySource.PAY_AS_YOU_GO, LEGACY_PAYG_ACTIVITY_SOURCE],
          },
        },
      }),
      // tenant-scope-ignore: prior paid status follows linked organizations because subscription.billingAccountId is legacy-nullable
      this.prisma.subscription.findFirst({
        select: { id: true },
        where: {
          isDeleted: false,
          organizationId: { in: targetOrganizationIds },
          stripeSubscriptionId: { not: null },
        },
      }),
    ]);
    if (priorPurchase || priorSubscription) {
      return { isAccepted: false, status: ReferralClaimStatus.INELIGIBLE };
    }

    const now = new Date();
    try {
      await this.prisma.referral.create({
        data: {
          attributedAt: now,
          codeId: referralCode.id,
          referredBillingAccountId: targetAccount.id,
          referredOrganizationId: actor.organizationId,
          referrerBillingAccountId: referralCode.rewardBillingAccountId,
          referrerOrganizationId: referralCode.rewardOrganizationId,
          rewardEndsAt: addMonths(now, REWARD_WINDOW_MONTHS),
          status: ReferralStatus.ACTIVE,
        },
      });
      return { isAccepted: true, status: ReferralClaimStatus.ACCEPTED };
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        return {
          isAccepted: false,
          status: ReferralClaimStatus.ALREADY_ATTRIBUTED,
        };
      }
      throw error;
    }
  }

  async recordPaygPurchase(input: PurchaseReferralInput): Promise<void> {
    if (!hasOrganizationBilling()) {
      return;
    }
    const account = await this.billingAccountsService.resolveForOrganization(
      input.organizationId,
    );
    const now = new Date();
    const referral = await this.prisma.referral.findFirst({
      where: {
        isDeleted: false,
        referredBillingAccountId: account.id,
        rewardEndsAt: { gt: now },
        status: ReferralStatus.ACTIVE,
      },
    });
    const netAmountCents = Math.max(0, Math.floor(input.netAmountCents));
    const rewardCredits = Math.floor(netAmountCents * REWARD_RATE);
    if (!referral || rewardCredits < 1) {
      return;
    }
    const eligibleAt = addDays(now, SETTLEMENT_DELAY_DAYS);
    try {
      await this.prisma.referralReward.create({
        data: {
          eligibleAt,
          grossAmountCents: Math.max(0, Math.floor(input.grossAmountCents)),
          netAmountCents,
          nextAttemptAt: eligibleAt,
          purchasedCredits: Math.max(0, Math.floor(input.purchasedCredits)),
          referralCodeId: referral.codeId,
          referralId: referral.id,
          rewardCredits,
          status: ReferralRewardStatus.PENDING,
          stripeCheckoutSessionId: input.stripeCheckoutSessionId,
          stripePaymentIntentId: input.stripePaymentIntentId,
        },
      });
    } catch (error: unknown) {
      if (!hasPrismaCode(error, 'P2002')) {
        throw error;
      }
    }
  }

  async applyPaymentReversal(input: {
    disputed: boolean;
    refundedAmountCents: number;
    stripePaymentIntentId: string;
  }): Promise<void> {
    if (!hasOrganizationBilling()) {
      return;
    }
    const rewards = await this.prisma.referralReward.findMany({
      select: { id: true },
      where: {
        isDeleted: false,
        stripePaymentIntentId: input.stripePaymentIntentId,
      },
    });
    for (const candidate of rewards) {
      await this.reverseReward(candidate.id, input);
    }
  }

  async listAdmin(input: {
    limit?: number;
    page?: number;
    status?: ReferralRewardStatus;
  }): Promise<{ docs: IReferralAdminReward[]; total: number }> {
    const requestedLimit =
      input.limit !== undefined && Number.isSafeInteger(input.limit)
        ? input.limit
        : 50;
    const requestedPage =
      input.page !== undefined && Number.isSafeInteger(input.page)
        ? input.page
        : 1;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const page = Math.min(Math.max(requestedPage, 1), REFERRAL_ADMIN_MAX_PAGE);
    const where = {
      isDeleted: false,
      ...(input.status ? { status: input.status } : {}),
    } as const;
    const [rows, total] = await Promise.all([
      this.prisma.referralReward.findMany({
        include: { referral: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.referralReward.count({ where }),
    ]);
    return {
      docs: rows.map((reward) => ({
        ...this.presentReward(reward),
        attemptCount: reward.attemptCount,
        failureReason: reward.failureReason,
        grossAmountCents: reward.grossAmountCents,
        netAmountCents: reward.netAmountCents,
        purchasedCredits: reward.purchasedCredits,
        referredBillingAccountId: reward.referral.referredBillingAccountId,
        referredOrganizationId: reward.referral.referredOrganizationId,
        referralId: reward.referralId,
        referrerBillingAccountId: reward.referral.referrerBillingAccountId,
        referrerOrganizationId: reward.referral.referrerOrganizationId,
        refundedAmountCents: reward.refundedAmountCents,
        stripeCheckoutSessionId: reward.stripeCheckoutSessionId,
        stripePaymentIntentId: reward.stripePaymentIntentId,
      })),
      total,
    };
  }

  async settleDueRewards(): Promise<void> {
    if (!hasOrganizationBilling()) {
      return;
    }
    const now = new Date();
    const expiredLease = new Date(now.getTime() - PROCESSING_LEASE_MS);
    await this.prisma.referralReward.updateMany({
      data: {
        failureReason: 'Settlement lease expired',
        lockedAt: null,
        nextAttemptAt: now,
        status: ReferralRewardStatus.FAILED,
      },
      where: {
        isDeleted: false,
        lockedAt: { lt: expiredLease },
        status: ReferralRewardStatus.PROCESSING,
      },
    });
    await this.prisma.referralReward.updateMany({
      data: { lockedAt: null },
      where: {
        isDeleted: false,
        lockedAt: { lt: expiredLease },
        status: { not: ReferralRewardStatus.PROCESSING },
      },
    });
    const due = await this.prisma.referralReward.findMany({
      orderBy: { nextAttemptAt: 'asc' },
      select: { id: true },
      take: MAX_SETTLEMENT_BATCH,
      where: {
        isDeleted: false,
        lockedAt: null,
        nextAttemptAt: { lte: now },
        status: {
          in: [ReferralRewardStatus.PENDING, ReferralRewardStatus.FAILED],
        },
      },
    });
    await Promise.allSettled(due.map((reward) => this.settleReward(reward.id)));
  }

  private async settleReward(rewardId: string): Promise<void> {
    const lockedAt = new Date();
    const claimed = await this.prisma.referralReward.updateMany({
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
      const reward = await this.prisma.referralReward.findFirst({
        include: { referral: { include: { code: true } } },
        where: { id: rewardId, isDeleted: false, lockedAt },
      });
      if (!reward || reward.rewardCredits < 1) {
        await this.cancelReward(rewardId, lockedAt);
        return;
      }
      const code = reward.referral.code;
      const pinnedDestination = await this.prisma.organization.findFirst({
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
        : await this.findFallbackDestination(code.rewardBillingAccountId);
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
      await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
        destination.id,
        reward.rewardCredits,
        ActivitySource.REFERRAL,
        'Referral purchase reward',
        addMonths(new Date(), REWARD_WINDOW_MONTHS),
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
      const transaction = await this.prisma.creditTransaction.findFirst({
        where: {
          idempotencyKey,
          isDeleted: false,
        },
      });
      if (!transaction) {
        throw new Error('Referral reward ledger transaction was not persisted');
      }
      const completed = await this.prisma.referralReward.updateMany({
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
        await this.activitiesService.create({
          key: ActivityKey.CREDITS_ADD,
          organizationId: transaction.organizationId,
          source: ActivitySource.REFERRAL,
          userId: code.ownerUserId,
          value: String(reward.rewardCredits),
        });
      } catch (activityError: unknown) {
        this.logger.warn('Referral reward activity emission failed', {
          activityError,
          rewardId: reward.id,
        });
      }
    } catch (error: unknown) {
      const current = await this.prisma.referralReward.findFirst({
        select: { attemptCount: true },
        where: { id: rewardId, isDeleted: false },
      });
      const delayMinutes = Math.min(
        24 * 60,
        2 ** Math.min(current?.attemptCount ?? 1, 10),
      );
      await this.prisma.referralReward.updateMany({
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
      this.logger.error('Referral reward settlement failed', {
        error,
        rewardId,
      });
    }
  }

  private async reverseReward(
    rewardId: string,
    input: {
      disputed: boolean;
      refundedAmountCents: number;
      stripePaymentIntentId: string;
    },
  ): Promise<void> {
    const lockedAt = new Date();
    const claimed = await this.prisma.referralReward.updateMany({
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
      const reward = await this.prisma.referralReward.findFirst({
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
        (reward.netAmountCents - refundedAmountCents) * REWARD_RATE,
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
            await this.creditsUtilsService.getOrganizationCreditsBalance(
              destinationOrganizationId,
            );
          const idempotencyKey = `referral-reward-reversal:${reward.id}:${refundedAmountCents}`;
          await this.creditsUtilsService.deductCreditsFromOrganization(
            destinationOrganizationId,
            reward.referral.code.ownerUserId,
            creditsToReverse,
            'Referral reward reversal',
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
              referenceType: 'referral-reward-reversal',
            },
          );
        }
        const completed = await this.prisma.referralReward.updateMany({
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

      const completed = await this.prisma.referralReward.updateMany({
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
      await this.prisma.referralReward.updateMany({
        data: { lockedAt: null },
        where: { id: rewardId, isDeleted: false, lockedAt },
      });
      throw new Error(`Referral reward ${rewardId} reversal failed`, {
        cause: error,
      });
    }
  }

  private async ensureCode(actor: ReferralActor, billingAccountId: string) {
    const existing = await this.prisma.referralCode.findFirst({
      where: {
        ownerUserId: actor.userId,
        rewardBillingAccountId: billingAccountId,
      },
    });
    if (existing) {
      return existing.isDeleted
        ? this.prisma.referralCode.update({
            data: {
              isActive: true,
              isDeleted: false,
              rewardOrganizationId: actor.organizationId,
            },
            where: { id: existing.id },
          })
        : existing;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.referralCode.create({
          data: {
            code: generateReferralCode(),
            ownerUserId: actor.userId,
            rewardBillingAccountId: billingAccountId,
            rewardOrganizationId: actor.organizationId,
          },
        });
      } catch (error: unknown) {
        if (!hasPrismaCode(error, 'P2002')) {
          throw error;
        }
        const concurrent = await this.prisma.referralCode.findFirst({
          where: {
            ownerUserId: actor.userId,
            rewardBillingAccountId: billingAccountId,
          },
        });
        if (concurrent) {
          return concurrent.isDeleted
            ? this.prisma.referralCode.update({
                data: {
                  isActive: true,
                  isDeleted: false,
                  rewardOrganizationId: actor.organizationId,
                },
                where: { id: concurrent.id },
              })
            : concurrent;
        }
      }
    }
    throw new Error('Could not allocate a referral code');
  }

  private async findFallbackDestination(billingAccountId: string) {
    // tenant-scope-ignore: destination recovery is scoped by the immutable billing account and selects only a linked, live organization
    const links = await this.prisma.billingAccountOrganization.findMany({
      select: { organizationId: true },
      where: {
        billingAccountId,
        isDeleted: false,
        status: BillingAccountOrganizationStatus.LINKED,
      },
    });
    return this.prisma.organization.findFirst({
      where: {
        id: { in: links.map((link) => link.organizationId) },
        isDeleted: false,
      },
    });
  }

  private async resolveActorAccount(actor: ReferralActor) {
    const account = await this.billingAccountsService.resolveForOrganization(
      actor.organizationId,
    );
    const member = await this.prisma.billingAccountMember.findFirst({
      select: { id: true },
      where: {
        billingAccountId: account.id,
        isDeleted: false,
        userId: actor.userId,
      },
    });
    if (!member) {
      throw new ForbiddenException('Billing account membership required');
    }
    return account;
  }

  private presentReward(reward: {
    cancelledAt: Date | null;
    createdAt: Date;
    eligibleAt: Date;
    grantedAt: Date | null;
    id: string;
    isDeleted: boolean;
    netAmountCents: number;
    purchasedCredits: number;
    refundedAmountCents: number;
    reversedAt: Date | null;
    reversedCredits: number;
    rewardCredits: number;
    status: string;
    updatedAt: Date;
  }): IReferralReward {
    return {
      cancelledAt: reward.cancelledAt?.toISOString() ?? null,
      createdAt: reward.createdAt.toISOString(),
      eligibleAt: reward.eligibleAt.toISOString(),
      grantedAt: reward.grantedAt?.toISOString() ?? null,
      id: reward.id,
      isDeleted: reward.isDeleted,
      reversedAt: reward.reversedAt?.toISOString() ?? null,
      reversedCredits: reward.reversedCredits,
      rewardCredits: reward.rewardCredits,
      status: reward.status as ReferralRewardStatus,
      updatedAt: reward.updatedAt.toISOString(),
    };
  }

  private async cancelReward(id: string, lockedAt: Date): Promise<void> {
    const cancelled = await this.prisma.referralReward.updateMany({
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
}
