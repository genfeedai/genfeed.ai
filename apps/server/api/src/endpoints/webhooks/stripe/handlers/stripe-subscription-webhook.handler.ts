import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import type { StripeSubscription } from '@api/services/integrations/stripe/services/stripe.service';
import { type SubscriptionStatus, SubscriptionTier } from '@genfeedai/enums';
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
  ) {}

  async handleSubscriptionCreated(
    subscription: StripeSubscription,
    url: string,
  ): Promise<void> {
    try {
      // Find existing subscription by Stripe customer ID
      const existingSubscription =
        await this.subscriptionsService.findByStripeCustomerId(
          subscription.customer as string,
        );

      if (!existingSubscription) {
        this.loggerService.warn(`${url} subscription not found for customer`, {
          customerId: subscription.customer,
          stripeSubscriptionId: subscription.id,
        });
        return;
      }

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
        await this.supportService.updateOrganizationTierAndModels(
          String(existingSubscription.organization),
          tier,
          url,
        );

        // Sync tier to DB
        await this.subscriptionsService.syncSubscriptionState(
          updatedSubscription,
          subscription.id,
          subscription.items.data[0].price.id,
          subscription.status,
          tier,
        );
      }

      this.loggerService.log(`${url} subscription created successfully`, {
        organizationId: existingSubscription.organization,
        status: subscription.status,
        stripeSubscriptionId: subscription.id,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle subscription created`,
        error,
      );
    }
  }

  /** Build the DB patch for a newly created Stripe subscription. */
  private buildSubscriptionCreatePatch(subscription: StripeSubscription) {
    // Determine subscription type based on price ID
    const subscriptionType = this.supportService.resolveSubscriptionPlan(
      subscription.items.data[0].price.id,
      subscription.items.data[0].price.recurring?.interval,
    );

    // Stripe API: cancel_at_period_end is on Subscription,
    // current_period_end is on subscription items (moved in newer API versions)
    const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

    return {
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: currentPeriodEnd && new Date(currentPeriodEnd * 1000),
      status: subscription.status as SubscriptionStatus,
      stripePriceId: subscription.items.data[0].price.id,
      stripeSubscriptionId: subscription.id,
      type: subscriptionType,
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

      const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
      const updateData = {
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000)
          : undefined,
        status: subscription.status,
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

      // Invalidate request context cache so updated subscription info is reflected immediately
      const userId = user.id?.toString();
      if (userId) {
        await this.supportService.invalidateUserCaches(userId);
      }

      // Update tier if price changed
      await this.updateTierFromPrice(
        subscription.items.data[0]?.price?.id,
        String(existingSubscription.organization),
        url,
      );

      this.loggerService.log(`${url} subscription updated successfully`, {
        organizationId: existingSubscription.organization,
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

      // Soft delete subscription and update cancellation details
      const updatedSubscription = await this.subscriptionsService.patch(
        String(existingSubscription.id),
        {
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          isDeleted: true,
          status: 'canceled',
        },
      );

      // If subscription was canceled immediately (not at period end), remove all credits
      if (!subscription.cancel_at_period_end) {
        await this.removeCreditsOnImmediateCancellation(
          String(existingSubscription.organization),
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

      // Invalidate request context cache so canceled subscription is reflected immediately
      const userId = user.id?.toString();
      if (userId) {
        await this.supportService.invalidateUserCaches(userId);
      }

      // Clear organization tier (BYOK = free tier after subscription canceled)
      await this.supportService.updateOrganizationTierAndModels(
        String(existingSubscription.organization),
        SubscriptionTier.BYOK,
        url,
      );

      this.loggerService.log(`${url} subscription deleted successfully`, {
        organizationId: existingSubscription.organization,
        stripeSubscriptionId: subscription.id,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle subscription deleted`,
        error,
      );
    }
  }

  /** Look up the subscription's user; warns and returns null when missing. */
  private async findSubscriptionUser(
    existingSubscription: Pick<ISubscriptionOssReadModel, 'id' | 'user'>,
    url: string,
  ) {
    const user = await this.usersService.findOne({
      id: existingSubscription.user,
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
