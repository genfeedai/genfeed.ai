import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import {
  BillingAccountResolutionError,
  OrganizationBillingAccountService,
} from '@api/services/integrations/stripe/services/organization-billing-account.service';
import type { StripeSubscription } from '@api/services/integrations/stripe/services/stripe.service';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import {
  SubscriptionStatus,
  SubscriptionTier,
  toPrismaSubscriptionStatus,
} from '@genfeedai/enums';
import {
  type ISubscriptionOssReadModel,
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';

/** Handles customer.subscription.* Stripe webhook events. */
@Injectable()
export class StripeSubscriptionWebhookHandler {
  constructor(
    private readonly loggerService: LoggerService,

    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly usersService: UsersService,
    private readonly supportService: StripeWebhookSupportService,
    private readonly lifecycleEmailService: LifecycleEmailService,
    private readonly creditReconciler: StripeSubscriptionCreditReconcilerService,
    private readonly billingAccountService: OrganizationBillingAccountService,
  ) {}

  async handleSubscriptionCreated(
    subscription: StripeSubscription,
    url: string,
  ): Promise<void> {
    try {
      // Find existing subscription by Stripe customer ID
      let existingSubscription =
        await this.subscriptionsService.findByStripeCustomerId(
          subscription.customer as string,
        );

      if (!existingSubscription) {
        const organizationId =
          await this.billingAccountService.resolveWebhookOrganization(
            String(subscription.customer),
            subscription.metadata,
          );
        existingSubscription =
          await this.subscriptionsService.findByOrganizationId(organizationId);
      }

      if (!existingSubscription) {
        this.loggerService.warn(
          `${url} subscription reconciliation target unavailable`,
          { category: 'subscription_missing' },
        );
        throw new Error('Subscription reconciliation target unavailable');
      }

      const organizationId = this.resolveSubscriptionOrganizationId(
        existingSubscription,
        url,
      );
      const stripePriceId = subscription.items.data[0].price.id;
      const subscriptionData = this.buildSubscriptionCreatePatch(subscription);

      const updatedSubscription = await this.subscriptionsService.patch(
        String(existingSubscription.id),
        subscriptionData,
      );

      // Sync subscription state to DB
      await this.subscriptionsService.syncSubscriptionState(
        updatedSubscription,
        subscription.id,
        subscription.items.data[0].price.id,
        subscription.status,
      );

      // Update organization tier and enabled models
      const tier = this.supportService.resolveTierFromPriceId(stripePriceId);
      if (tier) {
        if (organizationId) {
          await this.supportService.updateOrganizationTierAndModels(
            organizationId,
            tier,
            url,
          );
        }

        // Sync tier to DB
        await this.subscriptionsService.syncSubscriptionState(
          updatedSubscription,
          subscription.id,
          subscription.items.data[0].price.id,
          subscription.status,
          tier,
        );
      }

      const subscriptionItem = subscription.items.data[0];
      await this.creditReconciler.reconcile({
        billingReason: 'subscription_create',
        ...(subscriptionItem.current_period_end
          ? {
              periodEnd: new Date(subscriptionItem.current_period_end * 1000),
            }
          : {}),
        ...(subscriptionItem.current_period_start
          ? {
              periodStart: new Date(
                subscriptionItem.current_period_start * 1000,
              ),
            }
          : {}),
        stripeSubscriptionId: subscription.id,
        subscription: {
          ...existingSubscription,
          ...(updatedSubscription ?? {}),
          plan: subscriptionData.plan,
          stripePriceId,
        },
        subscriptionStatus: subscription.status,
        trigger: 'customer.subscription.created',
        url,
      });

      this.loggerService.log(`${url} subscription created successfully`, {
        organizationId,
        status: subscription.status,
        stripeSubscriptionId: subscription.id,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to handle subscription created`, {
        category:
          error instanceof BillingAccountResolutionError
            ? error.category
            : 'reconciliation_failed',
      });
      throw error;
    }
  }

  /** Build the DB patch for a newly created Stripe subscription. */
  private buildSubscriptionCreatePatch(subscription: StripeSubscription) {
    // Determine the canonical plan from the Stripe price.
    // Stripe's Interval includes an open `OtherString` brand; re-check via
    // plain string so TS narrows to our closed StripeRecurringInterval union.
    const rawInterval: string | undefined =
      subscription.items.data[0].price.recurring?.interval;
    const recurringInterval =
      rawInterval === 'day' ||
      rawInterval === 'week' ||
      rawInterval === 'month' ||
      rawInterval === 'year'
        ? rawInterval
        : undefined;
    const plan = this.supportService.resolveSubscriptionPlan(
      subscription.items.data[0].price.id,
      recurringInterval,
    );

    // Stripe API: cancel_at_period_end is on Subscription,
    // current_period_end is on subscription items (moved in newer API versions)
    const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
    const currentPeriodStart = subscription.items.data[0]?.current_period_start;

    return {
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: currentPeriodEnd && new Date(currentPeriodEnd * 1000),
      currentPeriodStart:
        currentPeriodStart && new Date(currentPeriodStart * 1000),
      status: toPrismaSubscriptionStatus(subscription.status),
      stripePriceId: subscription.items.data[0].price.id,
      stripeSubscriptionId: subscription.id,
      plan,
    };
  }

  /** Update the org tier when the new price maps to one. */
  private async updateTierFromPrice(
    stripePriceId: string | undefined,
    organizationId: string,
    url: string,
  ): Promise<void> {
    if (!stripePriceId) {
      return;
    }

    const tier = this.supportService.resolveTierFromPriceId(stripePriceId);
    if (tier) {
      await this.supportService.updateOrganizationTierAndModels(
        organizationId,
        tier,
        url,
      );
    }
  }

  async handleSubscriptionUpdated(
    subscription: StripeSubscription,
    url: string,
  ): Promise<void> {
    try {
      // Find existing subscription
      const existingSubscription = await this.subscriptionsService.findOne({
        stripeSubscriptionId: subscription.id,
      });

      if (!existingSubscription) {
        this.loggerService.warn(`${url} subscription not found for update`, {
          stripeSubscriptionId: subscription.id,
        });
        return;
      }

      const organizationId = this.resolveSubscriptionOrganizationId(
        existingSubscription,
        url,
      );
      const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
      const updateData = {
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000)
          : undefined,
        status: toPrismaSubscriptionStatus(subscription.status),
      };

      const updatedSubscription = await this.subscriptionsService.patch(
        String(existingSubscription.id),
        updateData,
      );

      const user = await this.findSubscriptionUser(existingSubscription, url);
      if (!user) {
        return;
      }

      // Sync subscription state to DB
      await this.subscriptionsService.syncSubscriptionState(
        updatedSubscription,
        subscription.id,
        subscription.items.data[0]?.price?.id,
        subscription.status,
      );

      // Update tier if price changed
      if (organizationId) {
        await this.updateTierFromPrice(
          subscription.items.data[0]?.price?.id,
          organizationId,
          url,
        );
      }

      // Invalidate request context cache only after all dependent writes complete.
      const userId = user.id?.toString();
      if (userId) {
        await this.supportService.invalidateUserCaches(userId);
      }

      this.loggerService.log(`${url} subscription updated successfully`, {
        organizationId,
        status: subscription.status,
        stripeSubscriptionId: subscription.id,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle subscription updated`,
        error,
      );
    }
  }

  async handleSubscriptionDeleted(
    subscription: StripeSubscription,
    url: string,
  ): Promise<void> {
    try {
      const existingSubscription = await this.subscriptionsService.findOne({
        stripeSubscriptionId: subscription.id,
      });

      if (!existingSubscription) {
        return this.loggerService.warn(
          `${url} subscription not found for deletion`,
          {
            stripeSubscriptionId: subscription.id,
          },
        );
      }

      const organizationId = this.resolveSubscriptionOrganizationId(
        existingSubscription,
        url,
      );

      // Soft delete subscription and update cancellation details
      const updatedSubscription = await this.subscriptionsService.patch(
        String(existingSubscription.id),
        {
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          isDeleted: true,
          status: SubscriptionStatus.CANCELLED,
        },
      );

      // If subscription was canceled immediately (not at period end), remove all credits.
      // Skipped without a resolvable organization id: wiping credits is destructive
      // and must never run against a bogus tenant id.
      if (!subscription.cancel_at_period_end && organizationId) {
        await this.removeCreditsOnImmediateCancellation(
          organizationId,
          subscription.id,
          url,
        );
      }

      const user = await this.findSubscriptionUser(existingSubscription, url);
      if (!user) {
        return;
      }

      // Sync subscription state to DB
      await this.subscriptionsService.syncSubscriptionState(
        updatedSubscription,
        subscription.id,
        undefined,
        'canceled',
      );

      // Clear organization tier (BYOK = free tier after subscription canceled)
      if (organizationId) {
        await this.supportService.updateOrganizationTierAndModels(
          organizationId,
          SubscriptionTier.BYOK,
          url,
        );
      }

      // Invalidate request context cache only after all dependent writes complete.
      const userId = user.id?.toString();
      if (userId) {
        await this.supportService.invalidateUserCaches(userId);
      }

      if (organizationId && userId) {
        try {
          await this.lifecycleEmailService.recordSubscriptionLapsed({
            organizationId,
            subscriptionId: subscription.id,
            // Sourced from the loaded user row so the recipient is verified.
            userId,
          });
        } catch (error: unknown) {
          this.loggerService.warn(
            `${url} lifecycle email subscription-lapsed recording skipped`,
            {
              error: error instanceof Error ? error.message : error,
              subscriptionId: subscription.id,
            },
          );
        }
      }

      this.loggerService.log(`${url} subscription deleted successfully`, {
        organizationId,
        stripeSubscriptionId: subscription.id,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle subscription deleted`,
        error,
      );
    }
  }

  /** Resolve the subscription's organization from its scalar foreign key. */
  private resolveSubscriptionOrganizationId(
    existingSubscription: Pick<
      ISubscriptionOssReadModel,
      'id' | 'organizationId'
    >,
    url: string,
  ): string | null {
    const organizationId = existingSubscription.organizationId;

    if (!organizationId) {
      this.loggerService.error(
        `${url} subscription is missing an organization id`,
        {
          subscriptionId: existingSubscription.id,
        },
      );
      return null;
    }

    return organizationId;
  }

  /** Look up the subscription's user; warns and returns null when missing. */
  private async findSubscriptionUser(
    existingSubscription: Pick<ISubscriptionOssReadModel, 'id' | 'userId'>,
    url: string,
  ) {
    const userId = existingSubscription.userId;

    if (!userId) {
      this.loggerService.error(`${url} subscription is missing a user id`, {
        subscriptionId: existingSubscription.id,
      });
      return null;
    }

    const user = await this.usersService.findOne({
      id: userId,
    });

    if (!user) {
      this.loggerService.warn(`${url} user not found for subscription`, {
        subscriptionId: existingSubscription.id,
      });
      return null;
    }

    return user;
  }

  private async removeCreditsOnImmediateCancellation(
    organizationId: string,
    stripeSubscriptionId: string,
    url: string,
  ): Promise<void> {
    await this.creditsUtilsService.removeAllOrganizationCredits(
      organizationId,
      'subscription_canceled',
      'All credits removed due to immediate subscription cancellation',
    );

    this.loggerService.log(
      `${url} credits removed due to immediate cancellation`,
      {
        organizationId,
        stripeSubscriptionId,
      },
    );
  }
}
