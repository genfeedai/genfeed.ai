import {
  CreatorDirectoryService,
  type CreatorPaymentReader,
  type PublicCreator,
} from '@api/collections/creator-payments/services/creator-directory.service';
import {
  addDays,
  addOneMonth,
} from '@api/collections/creator-payments/utils/subscription-period.util';
import { CreditTransfersService } from '@api/collections/credits/services/credit-transfers.service';
import { isPrismaUniqueConstraintError } from '@api/collections/shared/slug-allocation.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  CreatorSubscriptionStatus as CreatorSubscriptionState,
  CreditTransferKind,
} from '@genfeedai/contracts';
import {
  CREATOR_SUBSCRIPTION_GRACE_DAYS,
  CREATOR_SUBSCRIPTION_MAX_PRICE,
  CREATOR_SUBSCRIPTION_MIN_PRICE,
} from '@genfeedai/contracts/constants';
import type {
  ICreatorSubscriptionOffer,
  ICreatorSubscriptionPlan,
  ICreatorSubscriptionSummary,
  ISubscribeToCreatorRequest,
  IUpdateCreatorSubscriptionPlanRequest,
} from '@genfeedai/contracts/interfaces/billing';
import { AssetScope, CreatorSubscriptionStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** Subscriptions that still give the reader access and still renew. */
const LIVE_STATUSES = [
  CreatorSubscriptionStatus.ACTIVE,
  CreatorSubscriptionStatus.PAST_DUE,
];
/** Transfer failures that mean "the reader cannot pay right now". */
const CANNOT_PAY_CODES: ReadonlySet<string> = new Set([
  'CREDIT_TRANSFER_REQUIRES_PURCHASE',
  'INSUFFICIENT_CREDITS',
]);

const SUBSCRIPTION_SELECT = {
  brand: { select: { label: true, slug: true } },
  brandId: true,
  cancelAtPeriodEnd: true,
  currentPeriodEnd: true,
  id: true,
  priceCredits: true,
  status: true,
} as const;

type SubscriptionRecord = {
  brand: { label: string; slug: string | null };
  brandId: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  id: string;
  priceCredits: number;
  status: CreatorSubscriptionStatus;
};

type DueSubscription = {
  brandId: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  id: string;
  organizationId: string;
  pastDueSince: Date | null;
  payerOrganizationId: string;
  payerUserId: string;
  priceCredits: number;
  status: CreatorSubscriptionStatus;
};

export type RenewalOutcome = 'charged' | 'ended' | 'past-due' | 'unchanged';

export type CreatorSubscriptionRenewalTotals = Record<
  RenewalOutcome | 'failed',
  number
>;

/** Prisma's persisted labels to the shared contract enum (same values). */
const SUBSCRIPTION_STATE: Record<
  CreatorSubscriptionStatus,
  CreatorSubscriptionState
> = {
  [CreatorSubscriptionStatus.ACTIVE]: CreatorSubscriptionState.ACTIVE,
  [CreatorSubscriptionStatus.ENDED]: CreatorSubscriptionState.ENDED,
  [CreatorSubscriptionStatus.PAST_DUE]: CreatorSubscriptionState.PAST_DUE,
};

function toSummary(record: SubscriptionRecord): ICreatorSubscriptionSummary {
  return {
    brandId: record.brandId,
    cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    creatorHandle: record.brand.slug ?? '',
    creatorLabel: record.brand.label,
    currentPeriodEnd: record.currentPeriodEnd.toISOString(),
    id: record.id,
    priceCredits: record.priceCredits,
    status: SUBSCRIPTION_STATE[record.status],
  };
}

function readErrorCode(error: unknown): string | undefined {
  return error instanceof BusinessLogicException ? error.errorCode : undefined;
}

/**
 * Paid creator subscriptions (#9717): a reader pays a creator a monthly price
 * in credits. Each period is one credit transfer; the renewal job charges the
 * next one when the period ends, marks a reader who cannot pay as past due,
 * and ends the subscription after a grace period or a cancellation.
 *
 * A subscription row belongs to the creator's organization (it is their
 * subscriber list). Reader-side reads find the creator organization first,
 * then read inside its tenant context.
 */
@Traced()
@Injectable()
export class CreatorSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creatorDirectoryService: CreatorDirectoryService,
    private readonly creditTransfersService: CreditTransfersService,
    private readonly logger: LoggerService,
  ) {}

  // ── Creator side ───────────────────────────────────────────────

  /** Every public brand of the organization, with its plan and live subscribers. */
  async listPlans(organizationId: string): Promise<ICreatorSubscriptionPlan[]> {
    const [brands, counts] = await Promise.all([
      this.prisma.brand.findMany({
        orderBy: { label: 'asc' },
        select: {
          creatorSubscriptionPlan: {
            select: { isEnabled: true, monthlyPriceCredits: true },
          },
          id: true,
          label: true,
          slug: true,
        },
        where: scopedWhere(organizationId, { scope: AssetScope.PUBLIC }),
      }),
      this.prisma.creatorSubscription.groupBy({
        _count: { _all: true },
        by: ['brandId'],
        where: scopedWhere(organizationId, { status: { in: LIVE_STATUSES } }),
      }),
    ]);
    return brands.map((brand) => {
      const plan = brand.creatorSubscriptionPlan;
      return {
        activeSubscribers:
          counts.find((count) => count.brandId === brand.id)?._count._all ?? 0,
        brandId: brand.id,
        handle: brand.slug ?? '',
        isEnabled: plan?.isEnabled ?? false,
        label: brand.label,
        monthlyPriceCredits: plan?.monthlyPriceCredits ?? null,
      };
    });
  }

  /** Sets a public brand's monthly price. Existing subscribers keep theirs. */
  async updatePlan(
    organizationId: string,
    brandId: string,
    request: IUpdateCreatorSubscriptionPlanRequest,
  ): Promise<ICreatorSubscriptionPlan> {
    const price = request.monthlyPriceCredits;
    if (
      !Number.isInteger(price) ||
      price < CREATOR_SUBSCRIPTION_MIN_PRICE ||
      price > CREATOR_SUBSCRIPTION_MAX_PRICE
    ) {
      throw new BusinessLogicException(
        `A monthly price must be a whole number of credits between ${CREATOR_SUBSCRIPTION_MIN_PRICE} and ${CREATOR_SUBSCRIPTION_MAX_PRICE}`,
        { monthlyPriceCredits: price },
        'INVALID_CREATOR_SUBSCRIPTION_PRICE',
      );
    }
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        id: brandId,
        scope: AssetScope.PUBLIC,
      }),
    });
    if (!brand) {
      throw new NotFoundException('Public brand');
    }
    // Plans are switched off, never deleted: one row per brand.
    const existing = await this.prisma.creatorSubscriptionPlan.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { brandId }),
    });
    const data = {
      isEnabled: request.isEnabled,
      monthlyPriceCredits: price,
    };
    if (existing) {
      await this.prisma.creatorSubscriptionPlan.updateMany({
        data,
        where: scopedWhere(organizationId, { id: existing.id }),
      });
    } else {
      await this.prisma.creatorSubscriptionPlan.create({
        data: { ...data, brandId, organizationId },
      });
    }
    const plans = await this.listPlans(organizationId);
    const plan = plans.find((candidate) => candidate.brandId === brandId);
    if (!plan) {
      throw new NotFoundException('Public brand');
    }
    return plan;
  }

  // ── Reader side ────────────────────────────────────────────────

  async getOffer(
    reader: CreatorPaymentReader,
    handle: string,
  ): Promise<ICreatorSubscriptionOffer> {
    const creator =
      await this.creatorDirectoryService.findPublicCreator(handle);
    const [price, subscription] = await this.inCreatorOrganization(
      creator,
      async () =>
        await Promise.all([
          this.findEnabledPrice(creator),
          this.findLiveSubscription(creator, reader.userId),
        ]),
    );
    return {
      monthlyPriceCredits: price,
      subscription: subscription ? toSummary(subscription) : null,
    };
  }

  /**
   * Subscribes the reader and charges the first month. Retrying with the same
   * idempotency key charges once; subscribing again while subscribed returns
   * the existing subscription.
   */
  async subscribe(
    reader: CreatorPaymentReader,
    request: ISubscribeToCreatorRequest,
    now: Date = new Date(),
  ): Promise<ICreatorSubscriptionSummary> {
    const creator = await this.creatorDirectoryService.findPublicCreator(
      request.handle,
    );
    if (
      await this.creatorDirectoryService.isReaderOnCreatorTeam(reader, creator)
    ) {
      throw new BusinessLogicException(
        'You cannot subscribe to a creator whose workspace you belong to',
        undefined,
        'SUBSCRIBE_TO_OWN_TEAM',
      );
    }
    const [price, existing] = await this.inCreatorOrganization(
      creator,
      async () =>
        await Promise.all([
          this.findEnabledPrice(creator),
          this.findLiveSubscription(creator, reader.userId),
        ]),
    );
    if (existing) {
      return toSummary(existing);
    }
    if (price === null) {
      throw new BusinessLogicException(
        'This creator does not offer a paid subscription',
        undefined,
        'CREATOR_SUBSCRIPTION_UNAVAILABLE',
      );
    }

    const readerName = await this.creatorDirectoryService.readerName(reader);
    const transfer = await this.creditTransfersService.transfer({
      amount: price,
      idempotencyKey: `subscribe:${reader.userId}:${creator.id}:${request.idempotencyKey}`,
      kind: CreditTransferKind.SUBSCRIPTION,
      payeeBrandId: creator.id,
      payeeDescription: `Subscription from ${readerName}`,
      payeeOrganizationId: creator.organizationId,
      payerDescription: `Subscription to ${creator.label}`,
      payerOrganizationId: reader.organizationId,
      payerUserId: reader.userId,
      subjectId: creator.id,
    });

    const created = await this.inCreatorOrganization(creator, async () => {
      // A replayed charge returns the subscription it already paid for, even
      // one that has since ended; it never opens a second one.
      const paidFor = await this.findByFirstCharge(
        creator,
        transfer.transferId,
      );
      if (paidFor) {
        return paidFor;
      }
      try {
        return await this.prisma.creatorSubscription.create({
          data: {
            brandId: creator.id,
            currentPeriodEnd: addOneMonth(now),
            currentPeriodStart: now,
            firstChargeTransferId: transfer.transferId,
            lastChargeTransferId: transfer.transferId,
            organizationId: creator.organizationId,
            payerOrganizationId: reader.organizationId,
            payerUserId: reader.userId,
            priceCredits: price,
          },
          select: SUBSCRIPTION_SELECT,
        });
      } catch (error: unknown) {
        // A concurrent retry of this charge, or a concurrent subscribe that
        // won the one live subscription per reader.
        if (!isPrismaUniqueConstraintError(error)) throw error;
        return (
          (await this.findByFirstCharge(creator, transfer.transferId)) ??
          (await this.findLiveSubscription(creator, reader.userId))
        );
      }
    });
    if (!created) {
      throw new NotFoundException('Subscription');
    }
    return toSummary(created);
  }

  /** The reader's live subscriptions across every creator. */
  async listMine(
    reader: CreatorPaymentReader,
  ): Promise<ICreatorSubscriptionSummary[]> {
    const owners = await this.prisma.organization.findMany({
      select: { id: true },
      where: {
        creatorSubscriptions: {
          some: {
            isDeleted: false,
            payerUserId: reader.userId,
            status: { in: LIVE_STATUSES },
          },
        },
        isDeleted: false,
      },
    });
    const perOwner = await Promise.all(
      owners.map((owner) =>
        runWithTenantContext(
          { organizationId: owner.id },
          async () =>
            await this.prisma.creatorSubscription.findMany({
              orderBy: { createdAt: 'desc' },
              select: SUBSCRIPTION_SELECT,
              where: scopedWhere(owner.id, {
                payerUserId: reader.userId,
                status: { in: LIVE_STATUSES },
              }),
            }),
        ),
      ),
    );
    return perOwner.flat().map(toSummary);
  }

  /** Cancel at period end, or undo that; access lasts until the period ends. */
  async setCancelAtPeriodEnd(
    reader: CreatorPaymentReader,
    subscriptionId: string,
    cancelAtPeriodEnd: boolean,
  ): Promise<ICreatorSubscriptionSummary> {
    const owner = await this.prisma.organization.findFirst({
      select: { id: true },
      where: {
        creatorSubscriptions: {
          some: {
            id: subscriptionId,
            isDeleted: false,
            payerUserId: reader.userId,
          },
        },
        isDeleted: false,
      },
    });
    if (!owner) {
      throw new NotFoundException('Subscription');
    }
    const updated = await runWithTenantContext(
      { organizationId: owner.id },
      async () => {
        const filter = {
          id: subscriptionId,
          payerUserId: reader.userId,
          status: { in: LIVE_STATUSES },
        };
        await this.prisma.creatorSubscription.updateMany({
          data: { cancelAtPeriodEnd },
          where: scopedWhere(owner.id, filter),
        });
        return await this.prisma.creatorSubscription.findFirst({
          select: SUBSCRIPTION_SELECT,
          where: scopedWhere(owner.id, filter),
        });
      },
    );
    if (!updated) {
      throw new NotFoundException('Subscription');
    }
    return toSummary(updated);
  }

  /**
   * Whether a signed-in user may read a creator's paid writing through a
   * subscription. A past-due subscription keeps access during the grace period.
   */
  async hasActivePaidSubscription(
    creatorOrganizationId: string,
    brandId: string,
    userId: string,
  ): Promise<boolean> {
    const subscription = await runWithTenantContext(
      { organizationId: creatorOrganizationId },
      async () =>
        await this.prisma.creatorSubscription.findFirst({
          select: { id: true },
          where: scopedWhere(creatorOrganizationId, {
            brandId,
            payerUserId: userId,
            status: { in: LIVE_STATUSES },
          }),
        }),
    );
    return Boolean(subscription);
  }

  // ── Renewal ────────────────────────────────────────────────────

  /**
   * Creator organizations with a subscription whose period has ended. Only
   * organization ids are read across tenants; every subscription is then read
   * and charged inside its creator organization's context.
   */
  async findRenewalOrganizations(
    now: Date,
    afterOrganizationId: string | undefined,
    take: number,
  ): Promise<string[]> {
    const owners = await this.prisma.organization.findMany({
      orderBy: { id: 'asc' },
      select: { id: true },
      take,
      where: {
        creatorSubscriptions: {
          some: {
            currentPeriodEnd: { lte: now },
            isDeleted: false,
            status: { in: LIVE_STATUSES },
          },
        },
        isDeleted: false,
        ...(afterOrganizationId ? { id: { gt: afterOrganizationId } } : {}),
      },
    });
    return owners.map((owner) => owner.id);
  }

  /** Renews, past-dues or ends every due subscription of one creator organization. */
  async renewOrganization(
    organizationId: string,
    now: Date,
    totals: CreatorSubscriptionRenewalTotals,
  ): Promise<void> {
    const due = await runWithTenantContext(
      { organizationId },
      async () =>
        await this.prisma.creatorSubscription.findMany({
          orderBy: { currentPeriodEnd: 'asc' },
          select: {
            brandId: true,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: true,
            id: true,
            organizationId: true,
            pastDueSince: true,
            payerOrganizationId: true,
            payerUserId: true,
            priceCredits: true,
            status: true,
          },
          where: scopedWhere(organizationId, {
            currentPeriodEnd: { lte: now },
            status: { in: LIVE_STATUSES },
          }),
        }),
    );
    for (const subscription of due) {
      try {
        totals[await this.renewOne(subscription, now)] += 1;
      } catch (error: unknown) {
        totals.failed += 1;
        this.logger.error('Could not renew a creator subscription', {
          error,
          organizationId,
          subscriptionId: subscription.id,
        });
      }
    }
  }

  private async renewOne(
    subscription: DueSubscription,
    now: Date,
  ): Promise<RenewalOutcome> {
    if (subscription.cancelAtPeriodEnd) {
      return await this.end(subscription, now);
    }

    let transferId: string;
    try {
      const transfer = await this.creditTransfersService.transfer({
        amount: subscription.priceCredits,
        // One charge per period, whatever the number of attempts.
        idempotencyKey: `creator-subscription:${subscription.id}:${subscription.currentPeriodEnd.toISOString()}`,
        kind: CreditTransferKind.SUBSCRIPTION,
        payeeBrandId: subscription.brandId,
        payeeDescription: 'Subscription renewal',
        payeeOrganizationId: subscription.organizationId,
        payerDescription: 'Subscription renewal',
        payerOrganizationId: subscription.payerOrganizationId,
        payerUserId: subscription.payerUserId,
        subjectId: subscription.brandId,
      });
      transferId = transfer.transferId;
    } catch (error: unknown) {
      const code = readErrorCode(error);
      if (!code || !CANNOT_PAY_CODES.has(code)) {
        throw error;
      }
      if (subscription.status === CreatorSubscriptionStatus.PAST_DUE) {
        const isGraceOver =
          subscription.pastDueSince !== null &&
          addDays(subscription.pastDueSince, CREATOR_SUBSCRIPTION_GRACE_DAYS) <=
            now;
        return isGraceOver ? await this.end(subscription, now) : 'unchanged';
      }
      const isPastDue = await this.updateDue(subscription, {
        pastDueSince: now,
        status: CreatorSubscriptionStatus.PAST_DUE,
      });
      return isPastDue ? 'past-due' : 'unchanged';
    }

    // A late payment after a past-due stretch starts a fresh month today.
    const periodStart =
      subscription.status === CreatorSubscriptionStatus.PAST_DUE
        ? now
        : subscription.currentPeriodEnd;
    const isCharged = await this.updateDue(subscription, {
      currentPeriodEnd: addOneMonth(periodStart),
      currentPeriodStart: periodStart,
      lastChargeTransferId: transferId,
      pastDueSince: null,
      status: CreatorSubscriptionStatus.ACTIVE,
    });
    return isCharged ? 'charged' : 'unchanged';
  }

  private async end(
    subscription: DueSubscription,
    now: Date,
  ): Promise<RenewalOutcome> {
    const isEnded = await this.updateDue(subscription, {
      endedAt: now,
      status: CreatorSubscriptionStatus.ENDED,
    });
    return isEnded ? 'ended' : 'unchanged';
  }

  /**
   * Moves a due subscription on, only if nobody else did: the period end and
   * status it was read with fence a concurrent renewal.
   */
  private async updateDue(
    subscription: DueSubscription,
    data: {
      currentPeriodEnd?: Date;
      currentPeriodStart?: Date;
      endedAt?: Date;
      lastChargeTransferId?: string;
      pastDueSince?: Date | null;
      status: CreatorSubscriptionStatus;
    },
  ): Promise<boolean> {
    const { count } = await runWithTenantContext(
      { organizationId: subscription.organizationId },
      async () =>
        await this.prisma.creatorSubscription.updateMany({
          data,
          where: scopedWhere(subscription.organizationId, {
            currentPeriodEnd: subscription.currentPeriodEnd,
            id: subscription.id,
            status: subscription.status,
          }),
        }),
    );
    return count === 1;
  }

  private async findEnabledPrice(
    creator: PublicCreator,
  ): Promise<number | null> {
    const plan = await this.prisma.creatorSubscriptionPlan.findFirst({
      select: { monthlyPriceCredits: true },
      where: scopedWhere(creator.organizationId, {
        brandId: creator.id,
        isEnabled: true,
      }),
    });
    return plan?.monthlyPriceCredits ?? null;
  }

  private async findLiveSubscription(
    creator: PublicCreator,
    userId: string,
  ): Promise<SubscriptionRecord | null> {
    return await this.prisma.creatorSubscription.findFirst({
      select: SUBSCRIPTION_SELECT,
      where: scopedWhere(creator.organizationId, {
        brandId: creator.id,
        payerUserId: userId,
        status: { in: LIVE_STATUSES },
      }),
    });
  }

  private async findByFirstCharge(
    creator: PublicCreator,
    transferId: string,
  ): Promise<SubscriptionRecord | null> {
    return await this.prisma.creatorSubscription.findFirst({
      select: SUBSCRIPTION_SELECT,
      where: scopedWhere(creator.organizationId, {
        firstChargeTransferId: transferId,
      }),
    });
  }

  private inCreatorOrganization<T>(
    creator: PublicCreator,
    work: () => Promise<T>,
  ): Promise<T> {
    return runWithTenantContext(
      { organizationId: creator.organizationId },
      work,
    );
  }
}
