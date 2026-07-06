import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { ConfigService } from '@api/config/config.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { extractInvoiceSubscriptionId } from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import type { StripeInvoice } from '@api/services/integrations/stripe/services/stripe.service';
import {
  ActivityKey,
  ActivitySource,
  ByokBillingStatus,
  SubscriptionPlan,
} from '@genfeedai/enums';
import {
  type ISubscriptionOssReadModel,
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { TIER_INCLUDED_MONTHLY_CREDITS } from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';

/** Handles invoice.paid / invoice.payment_failed Stripe webhook events. */
@Injectable()
export class StripeInvoiceWebhookHandler {
  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,

    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly usersService: UsersService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly supportService: StripeWebhookSupportService,
  ) {}

  async handleInvoicePaid(invoice: StripeInvoice, url: string): Promise<void> {
    try {
      // Handle BYOK platform fee invoices
      if (invoice.metadata?.type === 'byok_platform_fee') {
        await this.handleByokInvoicePaid(invoice, url);
        return;
      }

      if (
        invoice.billing_reason !== 'subscription_cycle' &&
        invoice.billing_reason !== 'subscription_create'
      ) {
        return;
      }

      const stripeSubscriptionId = extractInvoiceSubscriptionId(invoice);

      if (!stripeSubscriptionId) {
        return this.loggerService.warn(
          `${url} invoice carries no subscription id, skipping`,
          { billingReason: invoice.billing_reason, invoiceId: invoice.id },
        );
      }

      const subscription = await this.subscriptionsService.findOne({
        stripeSubscriptionId: stripeSubscriptionId,
      });

      if (!subscription) {
        return this.loggerService.warn(
          `${url} subscription not found for invoice`,
          {
            invoiceId: invoice.id,
            stripeSubscriptionId,
          },
        );
      }

      // Update subscription status
      const updatedSubscription = await this.subscriptionsService.patch(
        String(subscription.id),
        {
          status: 'active',
        },
      );

      // Sync subscription state to DB
      await this.subscriptionsService.syncSubscriptionState(
        updatedSubscription,
      );

      await this.allocateSubscriptionCredits(subscription, invoice, url);

      // Mark onboarding as completed server-side on first subscription payment
      if (invoice.billing_reason === 'subscription_create') {
        await this.markOnboardingCompleteFromInvoice(subscription, url);
      }

      this.loggerService.log(`${url} invoice paid processed`, {
        invoiceId: invoice.id,
        stripeSubscriptionId,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to handle invoice paid`, error);
    }
  }

  /**
   * Resolve the billing-period credit amount for a subscription.
   *
   * Tier-aware: Pro/Scale grant their configured monthly included credits
   * (TIER_INCLUDED_MONTHLY_CREDITS — single source of truth in
   * @genfeedai/pricing, matching the website plan cards); yearly grants 12x
   * that. Tiers without a configured allotment (e.g. Enterprise) and any
   * unresolved price fall back to the STRIPE_MONTHLY_CREDITS /
   * STRIPE_YEARLY_CREDITS config values.
   */
  private resolvePlanCredits(
    subscription: Pick<ISubscriptionOssReadModel, 'type' | 'stripePriceId'>,
  ): number {
    const tier = subscription.stripePriceId
      ? this.supportService.resolveTierFromPriceId(subscription.stripePriceId)
      : null;
    const tierMonthlyCredits = tier
      ? TIER_INCLUDED_MONTHLY_CREDITS[tier]
      : undefined;

    if (subscription.type === SubscriptionPlan.MONTHLY) {
      return (
        tierMonthlyCredits ??
        (Number(this.configService.get('STRIPE_MONTHLY_CREDITS')) || 35_000)
      );
    }

    if (subscription.type === SubscriptionPlan.YEARLY) {
      return tierMonthlyCredits != null
        ? tierMonthlyCredits * 12
        : Number(this.configService.get('STRIPE_YEARLY_CREDITS')) || 500_000;
    }

    return 0;
  }

  /** Allocate billing-period credits based on the subscription plan's rollover policy. */
  private async allocateSubscriptionCredits(
    subscription: ISubscriptionOssReadModel,
    invoice: StripeInvoice,
    url: string,
  ): Promise<void> {
    const creditsToAdd = this.resolvePlanCredits(subscription);

    if (creditsToAdd <= 0) {
      return;
    }

    // Handle different rollover policies based on subscription type
    if (subscription.type === SubscriptionPlan.MONTHLY) {
      // Monthly: 3-month rollover with expiration
      await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
        String(subscription.organization),
        creditsToAdd,
        subscription.type,
        `${subscription.type} subscription billing period`,
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months from now
      );
    } else if (subscription.type === SubscriptionPlan.YEARLY) {
      // Yearly: reset credits (no rollover)
      await this.creditsUtilsService.resetOrganizationCredits(
        String(subscription.organization),
        creditsToAdd,
        subscription.type,
        `${subscription.type} subscription billing period reset`,
      );
    }

    // Log activity for credit handling
    const activityKey =
      subscription.type === SubscriptionPlan.MONTHLY
        ? ActivityKey.CREDITS_ADD
        : ActivityKey.CREDITS_RESET;

    await this.supportService.recordCreditsActivity({
      brandId: String(subscription.organization),
      key: activityKey,
      organizationId: String(subscription.organization),
      source: ActivitySource.SUBSCRIPTION,
      userId: String(subscription.user),
      value: String(creditsToAdd),
    });

    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        String(subscription.organization),
      );

    this.loggerService.log(
      `${url} ${subscription.type} subscription credits processed`,
      {
        billingReason: invoice.billing_reason,
        creditsAdded: creditsToAdd,
        currentBalance,
        organizationId: subscription.organization,
        policy:
          subscription.type === SubscriptionPlan.MONTHLY
            ? '3-month rollover'
            : 'reset only',
        subscriptionType: subscription.type,
      },
    );

    // Mark org as having received credits (used by frontend to hide setup card).
    // hasEverHadCredits is persisted to OrganizationSetting and read from the DB
    // on bootstrap (epic #735, Phase C — no legacy auth provider write-back).
    await this.supportService.setHasEverHadCredits(
      String(subscription.organization),
      url,
    );
  }

  private async markOnboardingCompleteFromInvoice(
    subscription: ISubscriptionOssReadModel,
    url: string,
  ): Promise<void> {
    try {
      const dbUser = await this.usersService.findOne({
        id: subscription.user,
      });

      if (dbUser && !dbUser.isOnboardingCompleted) {
        await this.supportService.markOnboardingComplete(dbUser);

        // isOnboardingCompleted is persisted on the User row above (epic
        // #735, Phase C — no legacy auth provider publicMetadata write-back).
        await this.accessBootstrapCacheService.invalidateForUser(
          String(dbUser.id),
        );

        this.loggerService.log(
          `${url} onboarding marked complete via invoice.paid`,
          { userId: dbUser.id },
        );
      }
    } catch (error: unknown) {
      this.loggerService.warn(`${url} failed to mark onboarding complete`, {
        error: (error as Error)?.message,
      });
    }
  }

  async handleInvoicePaymentFailed(
    invoice: StripeInvoice,
    url: string,
  ): Promise<void> {
    try {
      // Handle BYOK platform fee payment failure
      if (invoice.metadata?.type === 'byok_platform_fee') {
        await this.handleByokInvoicePaymentFailed(invoice, url);
        return;
      }

      const stripeSubscriptionId = extractInvoiceSubscriptionId(invoice);

      if (!stripeSubscriptionId) {
        return this.loggerService.warn(
          `${url} failed invoice carries no subscription id, skipping`,
          { invoiceId: invoice.id },
        );
      }

      const subscription = await this.subscriptionsService.findOne({
        stripeSubscriptionId: stripeSubscriptionId,
      });

      if (subscription) {
        this.loggerService.log(`${url} invoice payment failed`, {
          invoiceId: invoice.id,
          organizationId: subscription.organization,
          stripeSubscriptionId,
        });

        // Update subscription status to past_due so the app can show
        // a banner prompting the user to update their payment method
        await this.subscriptionsService.patch(String(subscription.id), {
          status: 'past_due',
        });

        this.loggerService.log(`${url} subscription marked as past_due`, {
          subscriptionId: subscription.id,
        });
      }
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle invoice payment failed`,
        error,
      );
    }
  }

  private async handleByokInvoicePaid(
    invoice: StripeInvoice,
    url: string,
  ): Promise<void> {
    try {
      const organizationId = invoice.metadata?.organizationId;

      if (!organizationId) {
        this.loggerService.warn(`${url} BYOK invoice missing organizationId`, {
          invoiceId: invoice.id,
        });
        return;
      }

      // Reset byokBillingStatus to 'active'
      await this.supportService.setByokBillingStatus(
        organizationId,
        ByokBillingStatus.ACTIVE,
        invoice.id,
        url,
        'failed to reset byokBillingStatus after payment',
      );

      // Log activity
      await this.supportService.recordCreditsActivity({
        brandId: organizationId,
        organizationId,
        source: ActivitySource.SUBSCRIPTION,
        value: `BYOK platform fee paid: $${((invoice.amount_paid || 0) / 100).toFixed(2)}`,
      });

      this.loggerService.log(`${url} BYOK invoice paid`, {
        amountPaid: invoice.amount_paid,
        invoiceId: invoice.id,
        organizationId,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle BYOK invoice paid`,
        error,
      );
    }
  }

  private async handleByokInvoicePaymentFailed(
    invoice: StripeInvoice,
    url: string,
  ): Promise<void> {
    try {
      const organizationId = invoice.metadata?.organizationId;

      if (!organizationId) {
        this.loggerService.warn(
          `${url} BYOK invoice failure missing organizationId`,
          { invoiceId: invoice.id },
        );
        return;
      }

      // Set byokBillingStatus to 'past_due'
      await this.supportService.setByokBillingStatus(
        organizationId,
        ByokBillingStatus.PAST_DUE,
        invoice.id,
        url,
        'failed to set past_due status after payment failure',
      );

      this.loggerService.log(`${url} BYOK invoice payment failed`, {
        invoiceId: invoice.id,
        organizationId,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle BYOK invoice payment failed`,
        error,
      );
    }
  }
}
