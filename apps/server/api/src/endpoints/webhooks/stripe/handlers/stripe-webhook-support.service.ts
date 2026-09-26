import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import type {
  StripeMetadata,
  StripeRecurringInterval,
} from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import { getEmailLogMetadata } from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import type { StripeCheckoutSession } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  type ActivitySource,
  type BillingRevenueSource,
  type ByokBillingStatus,
  CreditTransactionCategory,
  SubscriptionPlan,
  SubscriptionTier,
} from '@genfeedai/contracts';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/contracts/interfaces/billing';
import { toPrismaJson } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const CHECKOUT_SESSION_NAMESPACE = 'stripe-checkout-session';
const CHECKOUT_SESSION_PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;
const CHECKOUT_SESSION_LOCK_TTL_SECONDS = 60 * 5;

type CreditsActivity = {
  brandId?: string;
  key?: ActivityKey;
  organizationId: string;
  source: ActivitySource;
  userId?: string;
  value: string;
};

type OnboardingUser = {
  id: string;
  isOnboardingCompleted?: boolean;
};

export type BillingRevenueEventInput = {
  /** Minor currency units, net of tax. */
  amountMinor: number;
  currency: string;
  occurredAt: Date;
  organizationId: string;
  source: BillingRevenueSource;
  stripeObjectId: string;
  userId?: string | null;
};

type PurchasedCreditsReference = {
  actorUserId?: string;
  referenceId: string;
  referenceType: string;
};

export type SkillsProLeadInput = {
  email: string;
  organizationId?: string | null;
  productType: string;
  receiptId: string;
  skillSlugs: string[];
  userId: string;
};

export type SubscriptionLeadInput = {
  organizationId: string;
  stripeSubscriptionId: string;
  tier: SubscriptionTier;
  userId?: string | null;
};

type SubscriptionCreditGrantLookup = {
  legacyInvoiceReference?: PurchasedCreditsReference;
  legacyPeriod?: {
    end: Date;
    source: string;
    start: Date;
  };
  reference: PurchasedCreditsReference;
};

/**
 * Shared side-effect helpers used by the per-concern Stripe webhook handlers.
 * Each helper is the single definition of a block that was previously
 * duplicated across the monolithic StripeWebhookService.
 */
@Injectable()
export class StripeWebhookSupportService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,

    private readonly activitiesService: ActivitiesService,
    private readonly creditGrantService: SubscriptionCreditGrantService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly organizationsService: OrganizationsService,
    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly usersService: UsersService,
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
  ) {}

  /**
   * Resolve the credit amount for a checkout session: session metadata wins,
   * then the STRIPE_PAYG_CREDITS config value, then the caller's fallback.
   * Without a fallback this preserves the historical NaN when neither
   * metadata nor config provide a value.
   */
  resolveCheckoutCredits(
    metadata: StripeMetadata | null | undefined,
    fallback?: number,
  ): number {
    const configured = this.configService.get('STRIPE_PAYG_CREDITS');

    if (fallback === undefined) {
      return Number(metadata?.credits || configured);
    }

    return Number(metadata?.credits || configured || fallback);
  }

  /**
   * The Redis processed marker is a fast path only. Checkout side effects must
   * be idempotent in Postgres because a marker write can fail after the callback
   * succeeds and Stripe can then replay the webhook.
   */
  async withCheckoutSessionProcessing<T>(
    sessionId: string,
    kind: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const processedKey = this.buildCheckoutSessionProcessedKey(kind, sessionId);

    return await this.cacheService.withLock(
      this.buildCheckoutSessionLockKey(kind, sessionId),
      async () => {
        if (await this.cacheService.exists(processedKey)) {
          return null;
        }

        const result = await fn();
        try {
          const didMarkProcessed = await this.cacheService.set(
            processedKey,
            {
              kind,
              processedAt: new Date().toISOString(),
              sessionId,
            },
            {
              tags: [CHECKOUT_SESSION_NAMESPACE, kind, sessionId],
              ttl: CHECKOUT_SESSION_PROCESSED_TTL_SECONDS,
            },
          );

          if (!didMarkProcessed) {
            this.loggerService.warn(
              `${this.constructorName} failed to cache Stripe checkout processed marker`,
              { kind, sessionId },
            );
          }
        } catch (error: unknown) {
          this.loggerService.warn(
            `${this.constructorName} failed to cache Stripe checkout processed marker`,
            {
              error: this.toErrorMessage(error),
              kind,
              sessionId,
            },
          );
        }

        return result;
      },
      CHECKOUT_SESSION_LOCK_TTL_SECONDS,
    );
  }

  buildCheckoutSessionCreditReference(
    kind: string,
    sessionId: string,
    actorUserId?: string,
  ): PurchasedCreditsReference {
    return {
      referenceId: sessionId,
      referenceType: `${CHECKOUT_SESSION_NAMESPACE}:${kind}`,
      ...(actorUserId ? { actorUserId } : {}),
    };
  }

  private buildCheckoutSessionProcessedKey(
    kind: string,
    sessionId: string,
  ): string {
    return this.cacheService.generateKey(
      CHECKOUT_SESSION_NAMESPACE,
      kind,
      'processed',
      sessionId,
    );
  }

  private buildCheckoutSessionLockKey(kind: string, sessionId: string): string {
    return this.cacheService.generateKey(
      CHECKOUT_SESSION_NAMESPACE,
      kind,
      'lock',
      sessionId,
    );
  }

  private async hasPurchasedCreditGrant(
    organizationId: string,
    source: string,
    reference: PurchasedCreditsReference,
  ): Promise<boolean> {
    const existing = await this.prisma.creditTransaction.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        category: CreditTransactionCategory.ADD,
        referenceId: reference.referenceId,
        referenceType: reference.referenceType,
        source,
      }),
    });

    return existing !== null;
  }

  /**
   * Durable Postgres-level dedup for subscription credit grants. The exact
   * reference is the concurrency guard; optional legacy lookups prevent a
   * historical invoice grant from being repeated after the initial-grant key
   * introduced by #1608. Category is intentionally unrestricted because
   * monthly grants write ADD rows while yearly grants write RESET rows.
   */
  async hasSubscriptionCreditGrant(
    organizationId: string,
    lookup: SubscriptionCreditGrantLookup,
  ): Promise<boolean> {
    const references = [
      {
        referenceId: lookup.reference.referenceId,
        referenceType: lookup.reference.referenceType,
      },
      ...(lookup.legacyInvoiceReference
        ? [
            {
              referenceId: lookup.legacyInvoiceReference.referenceId,
              referenceType: lookup.legacyInvoiceReference.referenceType,
            },
          ]
        : []),
      ...(lookup.legacyPeriod
        ? [
            {
              createdAt: {
                gte: lookup.legacyPeriod.start,
                lt: lookup.legacyPeriod.end,
              },
              referenceType: 'stripe-invoice:subscription-grant',
              source: lookup.legacyPeriod.source,
            },
          ]
        : []),
    ];

    const existing = await this.prisma.creditTransaction.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { OR: references }),
    });

    return existing !== null;
  }

  isUniqueConstraintError(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** Add purchased credits with the standard 1-year expiration. */
  /**
   * Record a customer payment in the revenue ledger that platform-admin unit
   * economics reads. Idempotent per Stripe object (webhook replays hit the
   * unique `stripeObjectId` and are skipped). Best-effort: the payment's credits are already granted, so a
   * ledger failure is logged, never thrown.
   */
  async recordRevenueEvent(input: BillingRevenueEventInput): Promise<void> {
    const amountMinor = Math.round(input.amountMinor);
    if (
      !input.organizationId ||
      !input.stripeObjectId ||
      !Number.isFinite(amountMinor) ||
      amountMinor <= 0
    ) {
      return;
    }

    try {
      // The unique Stripe object id is the replay guard: a duplicate webhook
      // delivery is skipped by the constraint instead of read-then-written.
      await this.prisma.billingRevenueEvent.createMany({
        data: [
          {
            amountMinor,
            currency: input.currency.trim().toLowerCase() || 'usd',
            occurredAt: input.occurredAt,
            organizationId: input.organizationId,
            source: input.source,
            stripeObjectId: input.stripeObjectId,
            userId: input.userId ?? null,
          },
        ],
        skipDuplicates: true,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} failed to record revenue event`,
        {
          error,
          organizationId: input.organizationId,
          source: input.source,
          stripeObjectId: input.stripeObjectId,
        },
      );
    }
  }

  async addPurchasedCredits(
    organizationId: string,
    credits: number,
    source: string,
    description: string,
    reference?: PurchasedCreditsReference,
  ): Promise<boolean> {
    if (
      reference &&
      (await this.hasPurchasedCreditGrant(organizationId, source, reference))
    ) {
      this.loggerService.log(
        `${this.constructorName} skipping duplicate purchased credit grant`,
        { organizationId, source, ...reference },
      );
      return false;
    }

    try {
      const expiresAt = new Date(Date.now() + ONE_YEAR_MS);
      if (reference) {
        await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
          organizationId,
          credits,
          source,
          description,
          expiresAt,
          {
            ...(reference.actorUserId
              ? { actorUserId: reference.actorUserId }
              : {}),
            metadata: {
              stripeCheckoutSessionId: reference.referenceId,
              stripeCheckoutSessionType: reference.referenceType,
            },
            referenceId: reference.referenceId,
            referenceType: reference.referenceType,
          },
        );
      } else {
        await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
          organizationId,
          credits,
          source,
          description,
          expiresAt,
        );
      }
      return true;
    } catch (error: unknown) {
      if (reference && this.isUniqueConstraintError(error)) {
        this.loggerService.log(
          `${this.constructorName} skipping duplicate purchased credit grant`,
          { organizationId, source, ...reference },
        );
        return false;
      }

      throw error;
    }
  }

  /** Record the credits-added/reset activity entry. */
  async recordCreditsActivity(activity: CreditsActivity): Promise<void> {
    await this.activitiesService.create({
      ...(activity.brandId ? { brandId: activity.brandId } : {}),
      key: activity.key ?? ActivityKey.CREDITS_ADD,
      organizationId: activity.organizationId,
      source: activity.source,
      ...(activity.userId ? { userId: activity.userId } : {}),
      value: activity.value,
    });
  }

  /** Idempotently mark a user's onboarding as completed. */
  async markOnboardingComplete(dbUser: OnboardingUser): Promise<void> {
    if (dbUser.isOnboardingCompleted) {
      return;
    }

    await this.usersService.patch(dbUser.id, {
      isOnboardingCompleted: true,
      onboardingCompletedAt: new Date(),
      onboardingStepsCompleted: ['brand', 'providers', 'summary'],
    });
  }

  /**
   * Mark onboarding as complete for a user from a checkout session.
   * First tries to find the user via subscription → user ID.
   * Falls back to finding the user by checkout session email.
   */
  async markOnboardingCompleteFromSession(
    session: StripeCheckoutSession,
    url: string,
    subscriptionTier?: SubscriptionTier,
  ): Promise<void> {
    // Try finding user via subscription
    const subscription = await this.subscriptionsService.findByStripeCustomerId(
      session.customer as string,
    );

    let dbUser = subscription
      ? await this.usersService.findOne({
          id: subscription.userId,
        })
      : null;

    // Fallback: find user by checkout session email
    if (!dbUser && session.customer_details?.email) {
      dbUser = await this.usersService.findOne({
        email: session.customer_details.email,
      });
    }

    if (!dbUser) {
      this.loggerService.warn(
        `${url} could not find user for onboarding completion`,
        {
          customerId: session.customer,
          ...getEmailLogMetadata(session.customer_details?.email),
          sessionId: session.id,
        },
      );
      return;
    }

    // Persist the subscription tier to the org settings (epic #735, Phase C —
    // OrganizationSetting.subscriptionTier replaces the legacy auth provider metadata write;
    // updateOrganizationTierAndModels is the canonical tier writer).
    if (subscriptionTier) {
      const organizationId = subscription?.organizationId
        ? subscription.organizationId
        : String(
            (
              await this.organizationsService.findOne({
                userId: String(dbUser.id),
              })
            )?.id ?? '',
          );
      if (organizationId) {
        await this.updateOrganizationTierAndModels(
          organizationId,
          subscriptionTier,
          url,
        );
      } else {
        // The tier is now DB-canonical (no legacy auth provider fallback), so surface a failure
        // to resolve the org rather than silently dropping the tier write.
        this.loggerService.warn(
          `${url} could not resolve organization to persist subscription tier`,
          { sessionId: session.id, subscriptionTier, userId: dbUser.id },
        );
      }
    }
    await this.markOnboardingComplete(dbUser);
    await this.invalidateUserCaches(String(dbUser.id));

    this.loggerService.log(`${url} onboarding marked complete`, {
      ...getEmailLogMetadata(
        (dbUser as OnboardingUser & { email?: string | null }).email,
      ),
      sessionId: session.id,
      userId: dbUser.id,
    });
  }

  /**
   * Mark the org as having received credits (used by frontend to hide the
   * setup card). Lookup failures are logged, never thrown — a missing flag
   * must not fail the webhook.
   */
  async setHasEverHadCredits(
    organizationId: string,
    url: string,
  ): Promise<void> {
    try {
      const orgSetting = await this.organizationSettingsService.findOne({
        organizationId: organizationId,
      });
      if (orgSetting) {
        await this.organizationSettingsService.patch(orgSetting.id.toString(), {
          hasEverHadCredits: true,
        });
        await this.invalidateOrganizationCaches(organizationId);
      }
    } catch (error: unknown) {
      this.loggerService.warn(`${url} failed to set hasEverHadCredits flag`, {
        error: (error as Error)?.message,
        organizationId,
      });
    }
  }

  /**
   * Patch the org's BYOK billing status. Patch failures are logged with the
   * caller-provided message, never thrown.
   */
  async setByokBillingStatus(
    organizationId: string,
    status: ByokBillingStatus,
    invoiceId: string,
    url: string,
    failureLogMessage: string,
  ): Promise<void> {
    const orgSetting = await this.organizationSettingsService.findOne({
      organizationId: organizationId,
    });

    if (!orgSetting) {
      return;
    }

    try {
      await this.organizationSettingsService.patch(orgSetting.id.toString(), {
        byokBillingStatus: status,
      });
      await this.invalidateOrganizationCaches(organizationId);
    } catch (patchError: unknown) {
      this.loggerService.error(`${url} ${failureLogMessage}`, {
        invoiceId,
        organizationId,
        patchError,
      });
    }
  }

  /** Invalidate both per-user caches so subscription changes apply immediately. */
  async invalidateUserCaches(userId: string): Promise<void> {
    await Promise.all([
      this.requestContextCacheService.invalidateForUser(userId),
      this.accessBootstrapCacheService.invalidateForUser(userId),
    ]);
  }

  async invalidateOrganizationCaches(organizationId: string): Promise<void> {
    await Promise.all([
      this.requestContextCacheService.invalidateForOrganization(organizationId),
      this.accessBootstrapCacheService.invalidateForOrganization(
        organizationId,
      ),
    ]);
  }

  /**
   * Resolve the SubscriptionPlan from a Stripe price ID.
   * Supports tier-based pricing: Pro (monthly + yearly), Scale, Enterprise.
   */
  resolveSubscriptionPlan(
    stripePriceId: string,
    recurringInterval?: StripeRecurringInterval | null,
  ): SubscriptionPlan {
    const enterprisePriceId = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY',
    );
    if (stripePriceId === enterprisePriceId) {
      return SubscriptionPlan.ENTERPRISE;
    }

    const proYearlyPriceId = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY',
    );
    if (proYearlyPriceId && stripePriceId === proYearlyPriceId) {
      return SubscriptionPlan.YEARLY;
    }

    // Monthly subscription tier prices (Pro, Scale)
    const monthlyPriceIds = [
      this.configService.get('STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY'),
      this.configService.get('STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY'),
    ].filter(Boolean);

    if (monthlyPriceIds.includes(stripePriceId)) {
      return SubscriptionPlan.MONTHLY;
    }

    if (recurringInterval === 'year') {
      return SubscriptionPlan.YEARLY;
    }

    this.loggerService.warn(
      `${this.constructorName} unknown price ID, defaulting to monthly`,
      { stripePriceId },
    );
    return SubscriptionPlan.MONTHLY;
  }

  /**
   * Price-to-tier mapping has one owner. It decides both the tier shown to a
   * customer and the credits granted to them, so a second copy here would let
   * a webhook attribute a subscription to a tier the grant path disagrees with.
   */
  resolveTierFromPriceId(stripePriceId: string): SubscriptionTier | null {
    return this.creditGrantService.resolveTierFromPriceId(stripePriceId);
  }

  async updateOrganizationTierAndModels(
    organizationId: string,
    tier: SubscriptionTier,
    url: string,
  ): Promise<void> {
    try {
      const orgSetting = await this.organizationSettingsService.findOne({
        organizationId: organizationId,
      });

      if (!orgSetting) {
        this.loggerService.warn(
          `${url} org settings not found for tier update`,
          {
            organizationId,
            tier,
          },
        );
        return;
      }

      // Get the latest model IDs for this tier
      const enabledModelIds =
        await this.organizationSettingsService.getLatestMajorVersionModelIds();

      await this.organizationSettingsService.patch(orgSetting.id.toString(), {
        enabledModelIds,
        subscriptionTier: tier,
      });
      await this.invalidateOrganizationCaches(organizationId);

      this.loggerService.log(`${url} organization tier and models updated`, {
        enabledModelIdsCount: enabledModelIds.length,
        organizationId,
        tier,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to update org tier/models`,
        error,
      );
    }
  }

  /**
   * Give a Skills Pro buyer CRM visibility: one lead per buyer, keyed by
   * user id since the receipt is organization-less until first claim.
   * Best-effort — a failure here must not fail the webhook, the receipt and
   * its email are the durable purchase record.
   */
  async upsertSkillsProLead(input: SkillsProLeadInput): Promise<void> {
    try {
      const data = toPrismaJson({
        email: input.email,
        productType: input.productType,
        receiptId: input.receiptId,
        skillSlugs: input.skillSlugs,
        source: 'skills-pro',
      });

      // tenant-scope-ignore: a Skills Pro lead tracks a buyer, not an organization — the buyer may have no org yet, so it is scoped by userId instead.
      const existing = await this.prisma.lead.findFirst({
        where: {
          data: { equals: 'skills-pro', path: ['source'] },
          isDeleted: false,
          userId: input.userId,
        },
      });

      if (existing) {
        // tenant-scope-ignore: same lead just read above by userId; there is no organization to scope this update by.
        await this.prisma.lead.update({
          data: { data },
          where: { id: existing.id },
        });
        return;
      }

      await this.prisma.lead.create({
        data: {
          data,
          organizationId: input.organizationId ?? null,
          userId: input.userId,
        },
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} failed to upsert skills-pro lead`,
        { error, receiptId: input.receiptId, userId: input.userId },
      );
    }
  }

  /**
   * Give a Pro/Scale subscription CRM visibility: one lead per organization,
   * updated on every `invoice.paid` so the tier stays current. Best-effort —
   * a failure here must not fail subscription reconciliation.
   */
  async upsertSubscriptionLead(input: SubscriptionLeadInput): Promise<void> {
    try {
      const data = toPrismaJson({
        source: 'subscription',
        stripeSubscriptionId: input.stripeSubscriptionId,
        tier: input.tier,
      });

      const existing = await this.prisma.lead.findFirst({
        where: {
          data: { equals: 'subscription', path: ['source'] },
          isDeleted: false,
          organizationId: input.organizationId,
        },
      });

      if (existing) {
        await this.prisma.lead.update({
          data: { data },
          where: scopedWhere(input.organizationId, { id: existing.id }),
        });
        return;
      }

      await this.prisma.lead.create({
        data: {
          data,
          organizationId: input.organizationId,
          userId: input.userId ?? undefined,
        },
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} failed to upsert subscription lead`,
        { error, organizationId: input.organizationId },
      );
    }
  }
}
