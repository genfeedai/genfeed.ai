import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { SubscriptionEntity } from '@api/collections/subscriptions/entities/subscription.entity';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import {
  SkillReceipt,
  type SkillReceiptDocument,
} from '@api/skills-pro/schemas/skill-receipt.schema';
import {
  ActivityKey,
  ActivitySource,
  ByokBillingStatus,
  OrganizationCategory,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type PipelineStage, Types } from 'mongoose';
import { nanoid } from 'nanoid';
import Stripe from 'stripe';

@Injectable()
export class StripeWebhookService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,

    private readonly subscriptionsService: SubscriptionsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly activitiesService: ActivitiesService,
    private readonly usersService: UsersService,
    private readonly clerkService: ClerkService,
    private readonly stripeService: StripeService,
    private readonly organizationsService: OrganizationsService,
    private readonly subscriptionAttributionsService: SubscriptionAttributionsService,
    private readonly userSubscriptionsService: UserSubscriptionsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    @InjectModel(SkillReceipt.name, DB_CONNECTIONS.CLOUD)
    private readonly skillReceiptModel: Model<SkillReceiptDocument>,
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
  ) {}

  async handleWebhookEvent(event: Stripe.Event, url: string) {
    switch (event.type) {
      case 'customer.subscription.created': {
        await this.handleSubscriptionCreated(event.data.object, url);
        break;
      }

      case 'customer.subscription.updated': {
        await this.handleSubscriptionUpdated(event.data.object, url);
        break;
      }

      case 'customer.subscription.deleted': {
        await this.handleSubscriptionDeleted(event.data.object, url);
        break;
      }

      case 'checkout.session.completed': {
        await this.handleCheckoutCompleted(event.data.object, url);
        break;
      }

      case 'invoice.paid': {
        await this.handleInvoicePaid(event.data.object, url);
        break;
      }

      case 'invoice.payment_failed': {
        await this.handleInvoicePaymentFailed(event.data.object, url);
        break;
      }

      // charge.dispute.created, charge.dispute.closed, charge.refunded
      // for marketplace purchases are now handled by the marketplace service.

      case 'customer.created': {
        this.handleCustomerCreated(event.data.object, url);
        break;
      }

      case 'customer.updated': {
        await this.handleCustomerUpdated(event.data.object, url);
        break;
      }

      default:
        this.loggerService.log(
          `${this.constructorName} ${url} unhandled event type: ${event.type}`,
        );
    }
  }

  private async handleSubscriptionCreated(
    subscription: Stripe.Subscription,
    url: string,
  ) {
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

      // Determine subscription type based on price ID
      const stripePriceId = subscription.items.data[0].price.id;
      const subscriptionType = this.resolveSubscriptionPlan(
        stripePriceId,
        subscription.items.data[0].price.recurring?.interval,
      );

      // Stripe API: cancel_at_period_end is on Subscription,
      // current_period_end is on subscription items (moved in newer API versions)
      const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

      // Update subscription in our database
      const subscriptionData = new SubscriptionEntity({
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: currentPeriodEnd && new Date(currentPeriodEnd * 1000),
        status: subscription.status as SubscriptionStatus,
        stripePriceId: subscription.items.data[0].price.id,
        stripeSubscriptionId: subscription.id,
        type: subscriptionType,
      });

      const updatedSubscription = await this.subscriptionsService.patch(
        existingSubscription._id.toString(),
        subscriptionData,
      );

      // Sync subscription data to Clerk metadata
      await this.subscriptionsService.syncSubscriptionToClerkMetadata(
        updatedSubscription,
        subscription.id,
        subscription.items.data[0].price.id,
        subscription.status,
      );

      // Update organization tier and enabled models
      const tier = this.resolveTierFromPriceId(stripePriceId);
      if (tier) {
        await this.updateOrganizationTierAndModels(
          existingSubscription.organization.toString(),
          tier,
          url,
        );

        // Sync tier to Clerk metadata
        await this.subscriptionsService.syncSubscriptionToClerkMetadata(
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

  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
    url: string,
  ) {
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
        existingSubscription._id,
        updateData,
      );

      const user = await this.usersService.findOne({
        _id: existingSubscription.user,
      });

      if (!user) {
        return this.loggerService.warn(
          `${url} user not found for subscription`,
          {
            subscriptionId: existingSubscription._id,
          },
        );
      }

      // Sync subscription data to Clerk metadata
      await this.subscriptionsService.syncSubscriptionToClerkMetadata(
        updatedSubscription,
        subscription.id,
        subscription.items.data[0]?.price?.id,
        subscription.status,
      );

      // Invalidate request context cache so updated subscription info is reflected immediately
      if (user.clerkId) {
        await Promise.all([
          this.requestContextCacheService.invalidateForUser(user.clerkId),
          this.accessBootstrapCacheService.invalidateForUser(user.clerkId),
        ]);
      }

      // Update tier if price changed
      const newPriceId = subscription.items.data[0]?.price?.id;
      if (newPriceId) {
        const tier = this.resolveTierFromPriceId(newPriceId);
        if (tier) {
          await this.updateOrganizationTierAndModels(
            existingSubscription.organization.toString(),
            tier,
            url,
          );
        }
      }

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

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
    url: string,
  ) {
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
        existingSubscription._id.toString(),
        {
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          isDeleted: true,
          status: 'canceled',
        },
      );

      // If subscription was canceled immediately (not at period end), remove all credits
      if (!subscription.cancel_at_period_end) {
        await this.creditsUtilsService.removeAllOrganizationCredits(
          existingSubscription.organization.toString(),
          'subscription_canceled',
          'All credits removed due to immediate subscription cancellation',
        );

        this.loggerService.log(
          `${url} credits removed due to immediate cancellation`,
          {
            organizationId: existingSubscription.organization,
            stripeSubscriptionId: subscription.id,
          },
        );
      }

      const user = await this.usersService.findOne({
        _id: existingSubscription.user,
      });

      if (!user) {
        return this.loggerService.warn(
          `${url} user not found for subscription`,
          {
            subscriptionId: existingSubscription._id,
          },
        );
      }

      // Sync subscription data to Clerk metadata
      await this.subscriptionsService.syncSubscriptionToClerkMetadata(
        updatedSubscription,
        subscription.id,
        undefined,
        'canceled',
      );

      // Invalidate request context cache so canceled subscription is reflected immediately
      if (user.clerkId) {
        await Promise.all([
          this.requestContextCacheService.invalidateForUser(user.clerkId),
          this.accessBootstrapCacheService.invalidateForUser(user.clerkId),
        ]);
      }

      // Clear organization tier (BYOK = free tier after subscription canceled)
      await this.updateOrganizationTierAndModels(
        existingSubscription.organization.toString(),
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

  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
    url: string,
  ) {
    try {
      // Check if this is a user-level payment (getshareable.app consumer)
      const isUserLevelPayment = session.metadata?.type === 'user';

      if (isUserLevelPayment) {
        await this.handleUserCheckoutCompleted(session, url);
        return;
      }

      // Check if this is a skills-pro purchase
      const isSkillsProPurchase = session.metadata?.type === 'skills-pro';

      if (isSkillsProPurchase) {
        await this.handleSkillsProCheckoutCompleted(session, url);
        return;
      }

      // Organization-level payment handling below
      if (session.mode === 'subscription') {
        // Subscription checkout - the subscription.created event will handle the creation
        this.loggerService.log(`${url} subscription checkout completed`, {
          customerId: session.customer,
          sessionId: session.id,
          stripeSubscriptionId: session.subscription,
        });

        // Additional logging for subscription success
        const subscription =
          await this.subscriptionsService.findByStripeCustomerId(
            session.customer as string,
          );

        if (subscription) {
          await this.trackSubscriptionAttributionFromSession(
            session,
            subscription,
            url,
          );

          this.loggerService.log(`${url} subscription checkout completed`, {
            customerId: session.customer,
            organizationId: subscription.organization,
            sessionId: session.id,
            stripeSubscriptionId: session.subscription,
          });
        }

        // Mark onboarding complete for subscription users
        await this.markOnboardingCompleteFromSession(session, url);
      } else if (session.mode === 'setup') {
        // Setup-only checkout (BYOK) — Stripe automatically attaches the
        // payment method to the customer, so no further action is needed.
        this.loggerService.log(`${url} setup checkout completed (BYOK)`, {
          customerId: session.customer,
          sessionId: session.id,
        });

        // Mark onboarding complete for BYOK users
        await this.markOnboardingCompleteFromSession(session, url, {
          subscriptionTier: SubscriptionTier.BYOK,
        });
      } else if (session.mode === 'payment') {
        // One-time payment (pay-as-you-go credits)
        const subscription =
          await this.subscriptionsService.findByStripeCustomerId(
            session.customer as string,
          );

        if (!subscription) {
          this.loggerService.warn(`${url} subscription not found for payment`, {
            customerId: session.customer,
            sessionId: session.id,
          });
          return;
        }

        const creditsToAdd = Number(
          session.metadata?.credits ||
            this.configService.get('STRIPE_PAYG_CREDITS'),
        );

        // Add credits using new credit system
        await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
          subscription.organization.toString(),
          creditsToAdd,
          'pay-as-you-go',
          `Credit pack purchase (${creditsToAdd} credits)`,
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year expiration
        );

        const newBalance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            subscription.organization.toString(),
          );

        const dbUser = await this.usersService.findOne({
          _id: subscription.user,
        });

        if (dbUser?.clerkId) {
          await this.clerkService.updateUserPublicMetadata(dbUser.clerkId, {
            balance: newBalance,
            isOnboardingCompleted: true,
          });
          await this.accessBootstrapCacheService.invalidateForUser(
            dbUser.clerkId,
          );
        }

        if (dbUser && !dbUser.isOnboardingCompleted) {
          await this.usersService.patch(dbUser._id, {
            isOnboardingCompleted: true,
            onboardingCompletedAt: new Date(),
            onboardingStepsCompleted: ['brand', 'plan'],
          });
        }

        // Fallback: mark onboarding complete even if subscription lookup fails
        if (!dbUser) {
          await this.markOnboardingCompleteFromSession(session, url);
        }

        await this.activitiesService.create({
          brand: new Types.ObjectId(subscription.organization),
          key: ActivityKey.CREDITS_ADD,
          organization: new Types.ObjectId(subscription.organization),
          source: ActivitySource.PAY_AS_YOU_GO,
          user: new Types.ObjectId(subscription.user),
          value: String(creditsToAdd),
        });

        this.loggerService.log(`${url} PAYG credits added to organization`, {
          creditsAdded: creditsToAdd,
          customerId: session.customer,
          newBalance,
          organizationId: subscription.organization,
          sessionId: session.id,
        });
      }
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle checkout completed`,
        error,
      );
    }
  }

  /**
   * Handle user-level checkout completion (getshareable.app consumer payments)
   * Looks up the user's creator org and adds credits to that org's balance
   */
  private async handleUserCheckoutCompleted(
    session: Stripe.Checkout.Session,
    url: string,
  ) {
    try {
      const userId = session.metadata?.userId;

      if (!userId) {
        this.loggerService.warn(
          `${url} user ID not found in session metadata`,
          {
            customerId: session.customer,
            sessionId: session.id,
          },
        );
        return;
      }

      // Find user
      const dbUser = await this.usersService.findOne({
        _id: new Types.ObjectId(userId),
      });

      if (!dbUser) {
        this.loggerService.warn(`${url} user not found for user checkout`, {
          sessionId: session.id,
          userId,
        });
        return;
      }

      // Find user's creator org (every user gets a personal org on signup)
      const creatorOrg = await this.organizationsService.findOne({
        category: OrganizationCategory.CREATOR,
        isDeleted: false,
        members: new Types.ObjectId(userId),
      });

      if (!creatorOrg) {
        this.loggerService.warn(
          `${url} creator org not found for user, falling back to first org`,
          { userId },
        );

        // Fall back to first org the user belongs to
        const fallbackOrg = await this.organizationsService.findOne({
          isDeleted: false,
          members: new Types.ObjectId(userId),
        });

        if (!fallbackOrg) {
          this.loggerService.error(`${url} no organization found for user`, {
            userId,
          });
          return;
        }

        return this.addCreditsToOrgFromUserCheckout(
          fallbackOrg._id.toString(),
          dbUser,
          session,
          url,
        );
      }

      await this.addCreditsToOrgFromUserCheckout(
        creatorOrg._id.toString(),
        dbUser,
        session,
        url,
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle user checkout completed`,
        error,
      );
    }
  }

  private async addCreditsToOrgFromUserCheckout(
    organizationId: string,
    dbUser: { _id: Types.ObjectId; clerkId?: string },
    session: Stripe.Checkout.Session,
    url: string,
  ) {
    const userId = dbUser._id.toString();

    // Calculate credits from payment
    const creditsToAdd = Number(
      session.metadata?.credits ||
        this.configService.get('STRIPE_PAYG_CREDITS') ||
        1,
    );

    // Add credits to organization balance (1 year expiration)
    await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
      organizationId,
      creditsToAdd,
      'user-purchase',
      `Credit pack purchase (${creditsToAdd} credits) via Stripe`,
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    );

    const newBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );

    // Update user subscription record with session info
    await this.userSubscriptionsService.updateFromStripeSession(
      userId,
      session,
    );

    // Update Clerk metadata with new balance
    if (dbUser.clerkId) {
      await this.clerkService.updateUserPublicMetadata(dbUser.clerkId, {
        balance: newBalance,
      });
    }

    await this.activitiesService.create({
      brand: new Types.ObjectId(organizationId),
      key: ActivityKey.CREDITS_ADD,
      organization: new Types.ObjectId(organizationId),
      source: ActivitySource.PAY_AS_YOU_GO,
      user: new Types.ObjectId(userId),
      value: String(creditsToAdd),
    });

    this.loggerService.log(`${url} user credits added to organization`, {
      creditsAdded: creditsToAdd,
      customerId: session.customer,
      mode: session.mode,
      newBalance,
      organizationId,
      sessionId: session.id,
      userId,
    });
  }

  private async handleSkillsProCheckoutCompleted(
    session: Stripe.Checkout.Session,
    url: string,
  ) {
    try {
      const receiptId = `sk_rcpt_${nanoid(16)}`;
      const email = session.customer_details?.email || '';

      const receipt = new this.skillReceiptModel({
        amountPaid: session.amount_total || 0,
        currency: session.currency || 'usd',
        email,
        isDeleted: false,
        productType: 'bundle',
        receiptId,
        status: 'completed',
        stripePaymentIntentId: session.payment_intent
          ? String(session.payment_intent)
          : undefined,
        stripeSessionId: session.id,
      });

      await receipt.save();

      this.loggerService.log(`${url} skills-pro receipt created`, {
        email,
        productType: 'bundle',
        receiptId,
        sessionId: session.id,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle skills-pro checkout completed`,
        error,
      );
    }
  }

  private async trackSubscriptionAttributionFromSession(
    session: Stripe.Checkout.Session,
    subscription: unknown,
    url: string,
  ) {
    if (!session.subscription || !session.customer) {
      return;
    }

    try {
      const stripeSubscription = await this.stripeService.getSubscription(
        session.subscription as string,
      );

      const primaryItem = stripeSubscription.items.data[0];
      const organizationId = this.normalizeObjectId(subscription.organization);
      const userId = this.normalizeObjectId(subscription.user);

      const user = await this.usersService.findOne({
        _id: subscription.user,
      });

      const metadata = this.extractAttributionMetadata(session.metadata);

      const email =
        session.customer_details?.email ||
        (typeof stripeSubscription.customer === 'object' &&
        stripeSubscription.customer &&
        'email' in stripeSubscription.customer
          ? (stripeSubscription.customer as Stripe.Customer).email || undefined
          : undefined) ||
        user?.email ||
        'unknown';

      await this.subscriptionAttributionsService.trackSubscription(
        {
          amount:
            primaryItem?.price?.unit_amount ??
            (primaryItem as unknown as { plan?: { amount?: number } })?.plan
              ?.amount ??
            0,
          currency: primaryItem?.price?.currency?.toUpperCase(),
          email,
          plan:
            (primaryItem?.price?.id as string | undefined) ||
            subscription.stripePriceId ||
            'unknown',
          sessionId: metadata.sessionId ?? session.id,
          sourceContentId: metadata.sourceContentId,
          sourceContentType: metadata.sourceContentType,
          sourceLinkId: metadata.sourceLinkId,
          sourcePlatform: metadata.sourcePlatform,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          userId,
          utm: metadata.utm,
        },
        organizationId,
      );

      this.loggerService.log(`${url} subscription attribution recorded`, {
        contentId: metadata.sourceContentId,
        organizationId,
        stripeSubscriptionId: session.subscription,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to record subscription attribution`,
        error,
      );
    }
  }

  private extractAttributionMetadata(
    metadata: Stripe.Metadata | null | undefined,
  ): {
    sourceContentId?: string;
    sourceContentType?: string;
    sourcePlatform?: string;
    sourceLinkId?: string;
    sessionId?: string;
    utm?: {
      source?: string;
      medium?: string;
      campaign?: string;
      content?: string;
    };
  } {
    if (!metadata) {
      return {};
    }

    const combined = this.buildCombinedMetadata(metadata);

    const getValue = (...keys: string[]): string | undefined => {
      const foundKey = keys.find((k) => combined[k]);
      return foundKey ? combined[foundKey] : undefined;
    };

    const utm = {
      campaign: getValue('utm_campaign', 'utmCampaign'),
      content: getValue('utm_content', 'utmContent'),
      medium: getValue('utm_medium', 'utmMedium'),
      source: getValue('utm_source', 'utmSource'),
    };

    const sanitizedUtm = Object.fromEntries(
      Object.entries(utm).filter(([, value]) => Boolean(value)),
    );

    return {
      sessionId: getValue('sessionId', 'session_id', 'trackingSessionId'),
      sourceContentId: getValue(
        'sourceContentId',
        'contentId',
        'source_content_id',
      ),
      sourceContentType: getValue(
        'sourceContentType',
        'contentType',
        'source_content_type',
      ),
      sourceLinkId: getValue('sourceLinkId', 'linkId', 'source_link_id'),
      sourcePlatform: getValue('sourcePlatform', 'platform', 'source_platform'),
      utm: Object.keys(sanitizedUtm).length
        ? (sanitizedUtm as {
            source?: string;
            medium?: string;
            campaign?: string;
            content?: string;
          })
        : undefined,
    };
  }

  private buildCombinedMetadata(
    metadata: Stripe.Metadata,
  ): Record<string, string> {
    const combined: Record<string, string> = {};

    // Filter non-empty string values
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        combined[key] = value;
      }
    }

    // Parse JSON attribution payload if present
    const jsonPayloadKey = Object.keys(combined).find((key) =>
      ['subscriptionAttribution', 'attribution'].includes(key),
    );

    if (jsonPayloadKey) {
      try {
        const parsed = JSON.parse(combined[jsonPayloadKey]);
        if (parsed && typeof parsed === 'object') {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value.trim().length > 0) {
              combined[key] = value;
            }
          }
        }
      } catch (error) {
        this.loggerService.warn(
          `${this.constructorName} failed to parse attribution metadata`,
          { key: jsonPayloadKey, reason: (error as Error)?.message },
        );
      }
    }

    return combined;
  }

  /**
   * Mark onboarding as complete for a user from a checkout session.
   * First tries to find the user via subscription → user ID.
   * Falls back to finding the user by checkout session email.
   */
  private async markOnboardingCompleteFromSession(
    session: Stripe.Checkout.Session,
    url: string,
    extraClerkMetadata?: Record<string, unknown>,
  ): Promise<void> {
    // Try finding user via subscription
    const subscription = await this.subscriptionsService.findByStripeCustomerId(
      session.customer as string,
    );

    let dbUser = subscription
      ? await this.usersService.findOne({ _id: subscription.user })
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
          email: session.customer_details?.email,
          sessionId: session.id,
        },
      );
      return;
    }

    if (dbUser.clerkId) {
      await this.clerkService.updateUserPublicMetadata(dbUser.clerkId, {
        isOnboardingCompleted: true,
        ...extraClerkMetadata,
      });
      await this.accessBootstrapCacheService.invalidateForUser(dbUser.clerkId);
    }

    if (!dbUser.isOnboardingCompleted) {
      await this.usersService.patch(dbUser._id, {
        isOnboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        onboardingStepsCompleted: ['brand', 'plan'],
      });
    }

    this.loggerService.log(`${url} onboarding marked complete`, {
      email: dbUser.email,
      sessionId: session.id,
      userId: dbUser._id,
    });
  }

  private normalizeObjectId(
    value: string | Types.ObjectId | undefined,
  ): string {
    if (!value) {
      return 'unknown';
    }

    if (value instanceof Types.ObjectId) {
      return value.toString();
    }

    return String(value);
  }

  /**
   * Resolve the SubscriptionPlan from a Stripe price ID.
   * Supports tier-based pricing:
   * Creator, Pro, Scale, Enterprise.
   */
  private resolveSubscriptionPlan(
    stripePriceId: string,
    recurringInterval?: Stripe.Price.Recurring.Interval | null,
  ): SubscriptionPlan {
    const enterprisePriceId = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY',
    );
    if (stripePriceId === enterprisePriceId) {
      return SubscriptionPlan.ENTERPRISE;
    }

    // All other tier prices (Creator, Pro, Scale) are monthly
    const monthlyPriceIds = [
      this.configService.get('STRIPE_PRICE_SUBSCRIPTION_CREATOR_MONTHLY'),
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

  private resolveTierFromPriceId(
    stripePriceId: string,
  ): SubscriptionTier | null {
    const priceToTier: Record<string, SubscriptionTier> = {};

    const creatorPrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_CREATOR_MONTHLY',
    );
    const proPrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY',
    );
    const scalePrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY',
    );
    const enterprisePrice = this.configService.get(
      'STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY',
    );

    if (creatorPrice) {
      priceToTier[creatorPrice] = SubscriptionTier.CREATOR;
    }
    if (proPrice) {
      priceToTier[proPrice] = SubscriptionTier.PRO;
    }
    if (scalePrice) {
      priceToTier[scalePrice] = SubscriptionTier.SCALE;
    }
    if (enterprisePrice) {
      priceToTier[enterprisePrice] = SubscriptionTier.ENTERPRISE;
    }
    return priceToTier[stripePriceId] ?? null;
  }

  private async updateOrganizationTierAndModels(
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

      await this.organizationSettingsService.patch(orgSetting._id.toString(), {
        enabledModels: enabledModelIds,
        subscriptionTier: tier,
      });

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

  private async handleInvoicePaid(invoice: Stripe.Invoice, url: string) {
    try {
      // Handle BYOK platform fee invoices
      if (invoice.metadata?.type === 'byok_platform_fee') {
        await this.handleByokInvoicePaid(invoice, url);
        return;
      }

      if (
        invoice.billing_reason === 'subscription_cycle' ||
        invoice.billing_reason === 'subscription_create'
      ) {
        const stripeSubscriptionId = (
          invoice as unknown as {
            parent?: { subscription_details?: { subscription?: string } };
          }
        ).parent?.subscription_details?.subscription;

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
          subscription._id,
          {
            status: 'active',
          },
        );

        // Sync subscription data to Clerk metadata
        await this.subscriptionsService.syncSubscriptionToClerkMetadata(
          updatedSubscription,
        );

        // Add credits based on subscription type
        let creditsToAdd = 0;

        if (subscription.type === SubscriptionPlan.MONTHLY) {
          creditsToAdd =
            Number(this.configService.get('STRIPE_MONTHLY_CREDITS')) || 35_000;
        } else if (subscription.type === SubscriptionPlan.YEARLY) {
          creditsToAdd =
            Number(this.configService.get('STRIPE_YEARLY_CREDITS')) || 500_000;
        }

        if (creditsToAdd > 0) {
          // Handle different rollover policies based on subscription type
          if (subscription.type === SubscriptionPlan.MONTHLY) {
            // Monthly: 3-month rollover with expiration
            await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
              subscription.organization.toString(),
              creditsToAdd,
              subscription.type,
              `${subscription.type} subscription billing period`,
              new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months from now
            );
          } else if (subscription.type === SubscriptionPlan.YEARLY) {
            // Yearly: reset credits (no rollover)
            await this.creditsUtilsService.resetOrganizationCredits(
              subscription.organization.toString(),
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

          await this.activitiesService.create({
            brand: new Types.ObjectId(subscription.organization),
            key: activityKey,
            organization: new Types.ObjectId(subscription.organization),
            source: ActivitySource.SUBSCRIPTION,
            user: new Types.ObjectId(subscription.user),
            value: String(creditsToAdd),
          });

          const currentBalance =
            await this.creditsUtilsService.getOrganizationCreditsBalance(
              subscription.organization.toString(),
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

          // Mark org as having received credits (used by frontend to hide setup card)
          try {
            const orgSetting = await this.organizationSettingsService.findOne({
              isDeleted: false,
              organization: new Types.ObjectId(
                subscription.organization.toString(),
              ),
            });
            if (orgSetting) {
              await this.organizationSettingsService.patch(
                orgSetting._id.toString(),
                {
                  hasEverHadCredits: true,
                },
              );
            }
          } catch (error: unknown) {
            this.loggerService.warn(
              `${url} failed to set hasEverHadCredits flag`,
              {
                error: (error as Error)?.message,
                organizationId: subscription.organization,
              },
            );
          }

          // Sync to Clerk metadata so frontend can read without API call
          try {
            const dbUser = await this.usersService.findOne({
              _id: subscription.user,
            });
            if (dbUser?.clerkId) {
              await this.clerkService.updateUserPublicMetadata(dbUser.clerkId, {
                hasEverHadCredits: true,
              });
            }
          } catch (error: unknown) {
            this.loggerService.warn(
              `${url} failed to sync hasEverHadCredits to Clerk`,
              { error: (error as Error)?.message },
            );
          }
        }

        // Mark onboarding as completed server-side on first subscription payment
        if (invoice.billing_reason === 'subscription_create') {
          try {
            const dbUser = await this.usersService.findOne({
              _id: subscription.user,
            });

            if (dbUser && !dbUser.isOnboardingCompleted) {
              await this.usersService.patch(dbUser._id, {
                isOnboardingCompleted: true,
                onboardingCompletedAt: new Date(),
                onboardingStepsCompleted: ['brand', 'plan'],
              });

              if (dbUser.clerkId) {
                await this.clerkService.updateUserPublicMetadata(
                  dbUser.clerkId,
                  { isOnboardingCompleted: true },
                );
                await this.accessBootstrapCacheService.invalidateForUser(
                  dbUser.clerkId,
                );
              }

              this.loggerService.log(
                `${url} onboarding marked complete via invoice.paid`,
                { userId: dbUser._id },
              );
            }
          } catch (error: unknown) {
            this.loggerService.warn(
              `${url} failed to mark onboarding complete`,
              { error: (error as Error)?.message },
            );
          }
        }

        this.loggerService.log(`${url} invoice paid processed`, {
          invoiceId: invoice.id,
          stripeSubscriptionId,
        });
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to handle invoice paid`, error);
    }
  }

  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
    url: string,
  ) {
    try {
      // Handle BYOK platform fee payment failure
      if (invoice.metadata?.type === 'byok_platform_fee') {
        await this.handleByokInvoicePaymentFailed(invoice, url);
        return;
      }

      const stripeSubscriptionId = (
        invoice as unknown as { subscription?: string }
      ).subscription as string;
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
        await this.subscriptionsService.patch(subscription._id.toString(), {
          status: 'past_due',
        });

        this.loggerService.log(`${url} subscription marked as past_due`, {
          subscriptionId: subscription._id,
        });
      }
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle invoice payment failed`,
        error,
      );
    }
  }

  private async handleByokInvoicePaid(invoice: Stripe.Invoice, url: string) {
    try {
      const organizationId = invoice.metadata?.organizationId;

      if (!organizationId) {
        this.loggerService.warn(`${url} BYOK invoice missing organizationId`, {
          invoiceId: invoice.id,
        });
        return;
      }

      // Reset byokBillingStatus to 'active'
      const orgSetting = await this.organizationSettingsService.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });

      if (orgSetting) {
        try {
          await this.organizationSettingsService.patch(
            orgSetting._id.toString(),
            { byokBillingStatus: ByokBillingStatus.ACTIVE },
          );
        } catch (patchError: unknown) {
          this.loggerService.error(
            `${url} failed to reset byokBillingStatus after payment`,
            { invoiceId: invoice.id, organizationId, patchError },
          );
        }
      }

      // Log activity
      // @ts-expect-error CreateActivityDto shape
      await this.activitiesService.create({
        brand: new Types.ObjectId(organizationId),
        key: ActivityKey.CREDITS_ADD,
        organization: new Types.ObjectId(organizationId),
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
    invoice: Stripe.Invoice,
    url: string,
  ) {
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
      const orgSetting = await this.organizationSettingsService.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });

      if (orgSetting) {
        try {
          await this.organizationSettingsService.patch(
            orgSetting._id.toString(),
            { byokBillingStatus: ByokBillingStatus.PAST_DUE },
          );
        } catch (patchError: unknown) {
          this.loggerService.error(
            `${url} failed to set past_due status after payment failure`,
            { invoiceId: invoice.id, organizationId, patchError },
          );
        }
      }

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

  // NOTE: charge.dispute.created, charge.dispute.closed, and charge.refunded
  // for marketplace purchases are now handled by the marketplace service directly.

  private handleCustomerCreated(customer: Stripe.Customer, url: string) {
    try {
      // Customer creation is typically handled by our CustomersService
      // This webhook is mainly for logging/auditing
      this.loggerService.log(`${url} customer created in Stripe`, {
        customerId: customer.id,
        email: customer.email,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle customer created`,
        error,
      );
    }
  }

  private async handleCustomerUpdated(customer: Stripe.Customer, url: string) {
    try {
      // Sync subscription data from Stripe to our database
      const existingSubscription =
        await this.subscriptionsService.findByStripeCustomerId(customer.id);

      if (existingSubscription) {
        await this.subscriptionsService.syncWithStripe(existingSubscription);
        this.loggerService.log(`${url} customer synced from Stripe`, {
          customerId: customer.id,
          organizationId: existingSubscription.organization,
        });
      }
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle customer updated`,
        error,
      );
    }
  }

  async cancelAllSubscriptionsForOrganization(
    organizationId: string,
    url: string,
  ) {
    try {
      const aggregate: PipelineStage[] = [
        {
          $match: {
            isDeleted: { $ne: true },
            organization: new Types.ObjectId(organizationId),
            status: { $in: ['active', 'trialing', 'past_due'] },
          },
        },
      ];

      const options = {
        customLabels,
        pagination: false,
      };

      // Find all active subscriptions for the organization
      const data = await this.subscriptionsService.findAll(aggregate, options);

      const subscriptions = data.docs;

      if (!subscriptions || subscriptions.length === 0) {
        this.loggerService.log(
          `${url} no active subscriptions found for organization`,
          {
            organizationId,
          },
        );
        return;
      }

      // Cancel all subscriptions in Stripe and update database
      for (const subscription of subscriptions) {
        if (subscription.stripeSubscriptionId) {
          try {
            // Cancel subscription in Stripe immediately
            await this.stripeService.cancelSubscription(
              subscription.stripeSubscriptionId,
              false, // Cancel immediately, not at period end
            );

            // Update subscription in database
            await this.subscriptionsService.patch(subscription._id.toString(), {
              cancelAtPeriodEnd: false,
              isDeleted: true,
              status: 'canceled',
            });

            // Remove all credits since subscription is canceled immediately
            await this.creditsUtilsService.removeAllOrganizationCredits(
              organizationId,
              'subscription_canceled',
              'All credits removed due to immediate subscription cancellation',
            );

            this.loggerService.log(`${url} subscription canceled`, {
              organizationId,
              stripeSubscriptionId: subscription.stripeSubscriptionId,
            });
          } catch (error: unknown) {
            this.loggerService.error(`${url} failed to cancel subscription`, {
              error: error,
              organizationId,
              stripeSubscriptionId: subscription.stripeSubscriptionId,
            });
          }
        }
      }

      this.loggerService.log(
        `${url} all subscriptions canceled for organization`,
        {
          organizationId,
          subscriptionCount: subscriptions.length,
        },
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to cancel organization subscriptions`,
        {
          error: error,
          organizationId,
        },
      );
    }
  }
}
