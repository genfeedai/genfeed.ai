import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  addDays,
  addMonths,
} from '@api/collections/referrals/utils/referral-dates.util';
import {
  type ReferralPaymentReversalInput,
  reverseReward,
  settleReward,
} from '@api/collections/referrals/utils/referral-reward-lifecycle.util';
import { buildReferralRewardOrderBy } from '@api/collections/referrals/utils/referral-reward-order.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { buildSearchWhere } from '@api/helpers/utils/search-where/search-where.util';
import {
  billingAccountScopedWhere,
  resolveBillingAccountAccess,
} from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import {
  ActivitySource,
  BillingAccountOrganizationStatus,
  ReferralClaimStatus,
  ReferralRewardStatus,
  ReferralStatus,
} from '@genfeedai/contracts';
import {
  AFFILIATE_REWARD_RATE,
  AFFILIATE_REWARD_RATE_PERCENT,
  AFFILIATE_REWARD_WINDOW_MONTHS,
  AFFILIATE_SETTLEMENT_DELAY_DAYS,
  findReferralCodeProblem,
  normalizeReferralCode,
  REFERRAL_CODES_PER_OWNER_LIMIT,
} from '@genfeedai/contracts/constants';
import type {
  ICreateReferralCodeInput,
  IReferralAdminReward,
  IReferralClaimResult,
  IReferralCode,
  IReferralProgram,
  IReferralReward,
} from '@genfeedai/contracts/interfaces';
import type { Prisma, ReferralCode } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { customAlphabet } from 'nanoid';

const TRAILING_SLASH_PATTERN = /\/$/;

const generateReferralCode = customAlphabet(
  '23456789abcdefghjkmnpqrstuvwxyz',
  12,
);
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

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

@Traced()
@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingAccountsService: BillingAccountsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly activityRecorder: ActivityRecorderService,
  ) {}

  async getMine(actor: ReferralActor): Promise<IReferralProgram> {
    const account = await this.resolveActorAccount(actor);
    const primary = await this.ensureCode(actor, account.id);
    const codes = await this.prisma.referralCode.findMany({
      include: { brand: { select: { label: true, slug: true } } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      where: this.ownedCodesWhere(actor, account.id),
    });
    const codeIds = codes.map((code) => code.id);
    const rewardWhere = {
      isDeleted: false,
      referralCodeId: { in: codeIds },
    } as const;
    const [signUps, converted, totals, recentRewards] = await Promise.all([
      this.prisma.referral.groupBy({
        _count: { _all: true },
        by: ['codeId'],
        where: { codeId: { in: codeIds }, isDeleted: false },
      }),
      this.prisma.referral.findMany({
        select: { codeId: true, id: true },
        where: {
          codeId: { in: codeIds },
          isDeleted: false,
          rewards: {
            some: {
              isDeleted: false,
              status: { in: [...CONVERSION_REWARD_STATUSES] },
            },
          },
        },
      }),
      this.prisma.referralReward.groupBy({
        _sum: { reversedCredits: true, rewardCredits: true },
        by: ['referralCodeId', 'status'],
        where: rewardWhere,
      }),
      this.prisma.referralReward.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        where: rewardWhere,
      }),
    ]);
    const signUpsByCode = new Map(
      signUps.map((row) => [row.codeId, row._count._all]),
    );
    const convertedByCode = new Map<string, number>();
    for (const referral of converted) {
      convertedByCode.set(
        referral.codeId,
        (convertedByCode.get(referral.codeId) ?? 0) + 1,
      );
    }
    const creditsFor = (
      rows: typeof totals,
      statuses: readonly ReferralRewardStatus[],
    ) =>
      rows
        .filter((row) => statuses.includes(row.status as ReferralRewardStatus))
        .reduce((sum, row) => sum + (row._sum.rewardCredits ?? 0), 0);
    const earnedFor = (rows: typeof totals) =>
      creditsFor(rows, [
        ReferralRewardStatus.GRANTED,
        ReferralRewardStatus.REVERSED,
      ]) - rows.reduce((sum, row) => sum + (row._sum.reversedCredits ?? 0), 0);

    const presentedCodes: IReferralCode[] = codes.map((code) => {
      const own = totals.filter((row) => row.referralCodeId === code.id);
      return {
        brandId: code.brandId,
        brandLabel: code.brand?.label ?? null,
        brandSlug: code.brand?.slug ?? null,
        code: code.code,
        convertedCount: convertedByCode.get(code.id) ?? 0,
        createdAt: code.createdAt.toISOString(),
        earnedCredits: earnedFor(own),
        id: code.id,
        isActive: code.isActive,
        isDeleted: code.isDeleted,
        isPrimary: code.isPrimary,
        pendingCredits: creditsFor(own, PENDING_REWARD_STATUSES),
        referralCount: signUpsByCode.get(code.id) ?? 0,
        shareUrl: this.buildShareUrl(code.code),
        updatedAt: code.updatedAt.toISOString(),
      };
    });

    return {
      code: primary.code,
      codes: presentedCodes,
      convertedCount: converted.length,
      createdAt: primary.createdAt.toISOString(),
      earnedCredits: earnedFor(totals),
      id: primary.id,
      isDeleted: primary.isDeleted,
      pendingCredits: creditsFor(totals, PENDING_REWARD_STATUSES),
      recentRewards: recentRewards.map((reward) => this.presentReward(reward)),
      referralCount: signUps.reduce((sum, row) => sum + row._count._all, 0),
      reversedCredits: totals.reduce(
        (sum, row) => sum + (row._sum.reversedCredits ?? 0),
        0,
      ),
      rewardRatePercent: AFFILIATE_REWARD_RATE_PERCENT,
      rewardWindowMonths: AFFILIATE_REWARD_WINDOW_MONTHS,
      settlementDelayDays: AFFILIATE_SETTLEMENT_DELAY_DAYS,
      shareUrl: this.buildShareUrl(primary.code),
      updatedAt: primary.updatedAt.toISOString(),
    };
  }

  /**
   * Adds a code next to the member's primary one. With a brand and no code the
   * brand handle becomes the code, so a sign-up traces back to the brand that
   * shared it; with neither, the code is random. A taken code is refused, never
   * reassigned, so a link already shared keeps pointing at its owner.
   */
  async createCode(
    actor: ReferralActor,
    input: ICreateReferralCodeInput,
  ): Promise<IReferralCode> {
    const account = await this.resolveActorAccount(actor);
    await this.ensureCode(actor, account.id);
    const held = await this.prisma.referralCode.count({
      where: {
        ownerUserId: actor.userId,
        rewardBillingAccountId: account.id,
      },
    });
    if (held >= REFERRAL_CODES_PER_OWNER_LIMIT) {
      throw new BadRequestException(
        `You can hold up to ${REFERRAL_CODES_PER_OWNER_LIMIT} affiliate codes.`,
      );
    }

    const brand = input.brandId
      ? await this.prisma.brand.findFirst({
          select: { id: true, label: true, slug: true },
          where: {
            id: input.brandId,
            isDeleted: false,
            organizationId: actor.organizationId,
          },
        })
      : null;
    if (input.brandId && !brand) {
      throw new NotFoundException('Brand', input.brandId);
    }

    const requested = input.code?.trim() ? input.code : brand?.slug;
    if (requested) {
      const problem = findReferralCodeProblem(requested);
      if (problem === 'reserved') {
        throw new BadRequestException('That code is reserved.');
      }
      if (problem === 'invalid') {
        throw new BadRequestException(
          input.code?.trim()
            ? 'Use 3 to 32 lowercase letters, numbers or hyphens.'
            : 'This brand handle cannot be used as a code. Enter a code instead.',
        );
      }
    }

    let created: ReferralCode | null = null;
    if (requested) {
      created = await this.createCodeRow(
        actor,
        account.id,
        normalizeReferralCode(requested),
        brand?.id ?? null,
      ).catch((error: unknown) => {
        if (hasPrismaCode(error, 'P2002')) {
          throw new ConflictException('That code is already taken.');
        }
        throw error;
      });
    } else {
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        created = await this.createCodeRow(
          actor,
          account.id,
          generateReferralCode(),
          null,
        ).catch((error: unknown) => {
          if (hasPrismaCode(error, 'P2002')) {
            return null;
          }
          throw error;
        });
      }
    }
    if (!created) {
      throw new Error('Could not allocate a referral code');
    }

    return {
      brandId: brand?.id ?? null,
      brandLabel: brand?.label ?? null,
      brandSlug: brand?.slug ?? null,
      code: created.code,
      convertedCount: 0,
      createdAt: created.createdAt.toISOString(),
      earnedCredits: 0,
      id: created.id,
      isActive: created.isActive,
      isDeleted: created.isDeleted,
      isPrimary: false,
      pendingCredits: 0,
      referralCount: 0,
      shareUrl: this.buildShareUrl(created.code),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /** Stops (or resumes) new sign-ups through a code; history stays intact. */
  async setCodeActive(
    actor: ReferralActor,
    codeId: string,
    isActive: boolean,
  ): Promise<{ id: string; isActive: boolean }> {
    const account = await this.resolveActorAccount(actor);
    const code = await this.prisma.referralCode.findFirst({
      select: { id: true, isPrimary: true },
      where: { ...this.ownedCodesWhere(actor, account.id), id: codeId },
    });
    if (!code) {
      throw new NotFoundException('Affiliate code', codeId);
    }
    if (code.isPrimary && !isActive) {
      throw new BadRequestException(
        'The primary affiliate code cannot be turned off.',
      );
    }
    await this.prisma.referralCode.update({
      data: { isActive },
      where: { id: code.id },
    });
    return { id: code.id, isActive };
  }

  async listMyRewards(actor: ReferralActor): Promise<IReferralReward[]> {
    const account = await this.resolveActorAccount(actor);
    const codes = await this.prisma.referralCode.findMany({
      select: { id: true },
      where: this.ownedCodesWhere(actor, account.id),
    });
    if (codes.length === 0) {
      return [];
    }
    const rewards = await this.prisma.referralReward.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      where: {
        isDeleted: false,
        referralCodeId: { in: codes.map((code) => code.id) },
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
    // Guard-visible proof (#5217) that actor.organizationId may use
    // targetAccount — resolveActorAccount already proved this via
    // BillingAccountsService.resolveForOrganization, which this mirrors.
    const targetScope = await resolveBillingAccountAccess(
      actor.organizationId,
      this.prisma,
    );
    const referralCode = await this.prisma.referralCode.findFirst({
      where: { code, isActive: true, isDeleted: false },
      select: {
        id: true,
        rewardBillingAccountId: true,
        rewardOrganizationId: true,
      },
    });
    if (!referralCode) {
      return { isAccepted: false, status: ReferralClaimStatus.INVALID };
    }
    const existing = await this.prisma.referral.findFirst({
      where: {
        isDeleted: false,
        referredBillingAccountId: targetAccount.id,
      },
      select: { id: true },
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

    const targetLinks = await this.prisma.billingAccountOrganization.findMany({
      select: { organizationId: true },
      where: billingAccountScopedWhere(targetScope, {
        status: BillingAccountOrganizationStatus.LINKED,
      }),
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
    // Every org id below was proven part of the target billing-account scope
    // (resolveBillingAccountAccess + active links above), so a prior-paid
    // check across them is cross-org by design.
    const [priorPurchase, priorSubscription] = await crossOrgUnsafe(
      async () =>
        await Promise.all([
          this.prisma.creditTransaction.findFirst({
            select: { id: true },
            where: {
              amount: { gt: 0 },
              isDeleted: false,
              organizationId: { in: targetOrganizationIds },
              source: ActivitySource.PAY_AS_YOU_GO,
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
        ]),
    );
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
          rewardEndsAt: addMonths(now, AFFILIATE_REWARD_WINDOW_MONTHS),
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

  /**
   * Read-only lookup of the code behind a public profile's sign-up CTA. Never
   * creates a code (the profile route is unauthenticated), prefers the
   * profile owner's own code and falls back to the organization's oldest.
   */
  async findPublicCode(input: {
    organizationId: string;
    userId?: string | null;
  }): Promise<string | null> {
    if (!hasOrganizationBilling()) {
      return null;
    }
    const where = {
      isActive: true,
      isDeleted: false,
      rewardOrganizationId: input.organizationId,
    } as const;
    const owned = input.userId
      ? await this.prisma.referralCode.findFirst({
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          select: { code: true },
          where: { ...where, ownerUserId: input.userId },
        })
      : null;
    const referralCode =
      owned ??
      (await this.prisma.referralCode.findFirst({
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: { code: true },
        where,
      }));
    return referralCode?.code ?? null;
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
      select: { codeId: true, id: true },
    });
    const netAmountCents = Math.max(0, Math.floor(input.netAmountCents));
    const rewardCredits = Math.floor(netAmountCents * AFFILIATE_REWARD_RATE);
    if (!referral || rewardCredits < 1) {
      return;
    }
    const eligibleAt = addDays(now, AFFILIATE_SETTLEMENT_DELAY_DAYS);
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

  async applyPaymentReversal(
    input: ReferralPaymentReversalInput,
  ): Promise<void> {
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
      await reverseReward(this.lifecycleDeps(), candidate.id, input);
    }
  }

  async listAdmin(input: {
    limit?: number;
    page?: number;
    search?: string;
    sort?: string;
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
    // Rewards are identified by ids, so the search matches them: the reward,
    // its Stripe checkout and payment, and the referrer and referred accounts.
    const where: Prisma.ReferralRewardWhereInput = {
      isDeleted: false,
      ...(input.status ? { status: input.status } : {}),
      ...buildSearchWhere<Prisma.ReferralRewardWhereInput>(input.search, {
        columns: [
          'id',
          'stripeCheckoutSessionId',
          'stripePaymentIntentId',
          'failureReason',
        ],
        relations: {
          referral: [
            'referrerBillingAccountId',
            'referredBillingAccountId',
            'referrerOrganizationId',
            'referredOrganizationId',
          ],
        },
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.referralReward.findMany({
        include: { referral: true },
        orderBy: buildReferralRewardOrderBy(input.sort),
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
    const deps = this.lifecycleDeps();
    await Promise.allSettled(
      due.map((reward) => settleReward(deps, reward.id)),
    );
  }

  private lifecycleDeps() {
    return {
      activityRecorder: this.activityRecorder,
      creditsUtilsService: this.creditsUtilsService,
      logger: this.logger,
      prisma: this.prisma,
    };
  }

  /** Every live code the member holds on this billing account. */
  private ownedCodesWhere(actor: ReferralActor, billingAccountId: string) {
    return {
      isDeleted: false,
      ownerUserId: actor.userId,
      rewardBillingAccountId: billingAccountId,
    } as const;
  }

  private buildShareUrl(code: string): string {
    const configuredBaseUrl = String(
      this.configService.get('GENFEEDAI_APP_URL') ?? '',
    ).replace(TRAILING_SLASH_PATTERN, '');
    return `${configuredBaseUrl}/sign-up?ref=${code}`;
  }

  private createCodeRow(
    actor: ReferralActor,
    billingAccountId: string,
    code: string,
    brandId: string | null,
  ): Promise<ReferralCode> {
    return this.prisma.referralCode.create({
      data: {
        brandId,
        code,
        ownerUserId: actor.userId,
        rewardBillingAccountId: billingAccountId,
        rewardOrganizationId: actor.organizationId,
      },
    });
  }

  private async ensureCode(actor: ReferralActor, billingAccountId: string) {
    const existing = await this.prisma.referralCode.findFirst({
      where: {
        isPrimary: true,
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
            isPrimary: true,
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
            isPrimary: true,
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
}
