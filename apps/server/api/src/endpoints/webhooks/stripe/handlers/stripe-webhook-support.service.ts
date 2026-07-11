import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import type {
  StripeMetadata,
  StripeRecurringInterval,
} from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import { getEmailLogMetadata } from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import type { StripeCheckoutSession } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  type ActivitySource,
  type ByokBillingStatus,
  CreditTransactionCategory,
  SubscriptionPlan,
  SubscriptionTier,
} from '@genfeedai/enums';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const CHECKOUT_SESSION_NAMESPACE = 'stripe-checkout-session';
const CHECKOUT_SESSION_PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 30;
const CHECKOUT_SESSION_LOCK_TTL_SECONDS = 60 * 5;

type CreditsActivity = {
  brandId: string;
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

type PurchasedCreditsReference = {
  referenceId: string;
  referenceType: string;
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
  ): PurchasedCreditsReference {
    return {
      referenceId: sessionId,
      referenceType: `${CHECKOUT_SESSION_NAMESPACE}:${kind}`,
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
      where: {
        category: CreditTransactionCategory.ADD,
        isDeleted: false,
        organizationId,
        referenceId: reference.referenceId,
        referenceType: reference.referenceType,
        source,
      },
    });

    return existing !== null;
  }

  /**
   * Durable Postgres-level dedup for subscription-invoice credit grants
   * (#1398). The Redis `stripe:webhook:{event.id}` marker only covers the
   * originating event for 24h; a Stripe replay past that window (auto-retry
   * runs up to 3 days, or a manual Dashboard resend) must still be a no-op.
   * Unlike {@link hasPurchasedCreditGrant} this is NOT filtered by
   * `category` — a MONTHLY grant writes an ADD row, a YEARLY grant writes a
   * RESET row, and either must block a re-grant for the same invoice.
   */
  async hasSubscriptionInvoiceCreditGrant(
    organizationId: string,
    reference: PurchasedCreditsReference,
  ): Promise<boolean> {
    const existing = await this.prisma.creditTransaction.findFirst({
      select: { id: true },
      where: {
        isDeleted: false,
        organizationId,
        referenceId: reference.referenceId,
        referenceType: reference.referenceType,
      },
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
      brand: activity.brandId,
      key: activity.key ?? ActivityKey.CREDITS_ADD,
      organization: activity.organizationId,
      source: activity.source,
      ...(activity.userId ? { user: activity.userId } : {}),
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
          id: subscription.user,
          isDeleted: false,
        })
      : null;

    // Fallback: find user by checkout session email
    if (!dbUser && session.customer_details?.email) {
      dbUser = await this.usersService.findOne({
        email: session.customer_details.email,
        isDeleted: false,
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
      const organizationId = subscription?.organization
        ? String(subscription.organization)
        : String(
            (
              await this.organizationsService.findOne({
                isDeleted: false,
                user: String(dbUser.id),
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
        isDeleted: false,
        organization: organizationId,
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
      isDeleted: false,
      organization: organizationId,
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

  resolveTierFromPriceId(stripePriceId: string): SubscriptionTier | null {
    const priceToTier: Record<string, SubscriptionTier> = {};

    const proPrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY',
    );
    const proYearlyPrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY',
    );
    const scalePrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY',
    );
    const enterprisePrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY',
    );

    if (proPrice) {
      priceToTier[proPrice] = SubscriptionTier.PRO;
    }
    if (proYearlyPrice) {
      priceToTier[proYearlyPrice] = SubscriptionTier.PRO;
    }
    if (scalePrice) {
      priceToTier[scalePrice] = SubscriptionTier.SCALE;
    }
    if (enterprisePrice) {
      priceToTier[enterprisePrice] = SubscriptionTier.ENTERPRISE;
    }
    return priceToTier[stripePriceId] ?? null;
  }

  async updateOrganizationTierAndModels(
    organizationId: string,
    tier: SubscriptionTier,
    url: string,
  ): Promise<void> {
    try {
      const orgSetting = await this.organizationSettingsService.findOne({
        isDeleted: false,
        organization: organizationId,
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
        enabledModels: enabledModelIds,
        subscriptionTier: tier,
      });
      await this.invalidateOrganizationCaches(organizationId);

      this.loggerService.log(`${url} organization tier and models updated`, {
        enabledModelsCount: enabledModelIds.length,
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
}
