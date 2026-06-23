import { BETTER_AUTH_USER_CREATED_EVENT } from '@api/auth/better-auth/better-auth.constants';
import type { IBetterAuthUserCreatedEvent } from '@api/auth/better-auth/better-auth.types';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserEntity } from '@api/collections/users/entities/user.entity';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { ConfigService } from '@api/config/config.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import {
  type ManagedCheckoutResult,
  ManagedStripeCheckoutService,
} from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import {
  type StripeCheckoutSession,
  type StripeCustomer,
  type StripeInvoice,
  StripeService,
  type StripeSubscription,
} from '@api/services/integrations/stripe/services/stripe.service';
import {
  MANAGED_API_KEY_LABEL,
  MANAGED_API_KEY_SCOPES,
} from '@api/services/integrations/stripe/stripe.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
import {
  ActivityKey,
  ActivitySource,
  ApiKeyCategory,
  ByokBillingStatus,
  OrganizationCategory,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
} from '@genfeedai/enums';
import {
  type ISubscriptionAttributionsService,
  type ISubscriptionOssReadModel,
  type ISubscriptionsService,
  type IUserSubscriptionsService,
  SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
  SUBSCRIPTIONS_SERVICE,
  type SubscriptionRefId,
  USER_SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';

type StripeEvent = {
  data: { object: unknown };
  type: string;
};
type StripeMetadata = Record<string, string>;
type StripeRecurringInterval = 'day' | 'week' | 'month' | 'year';

@Injectable()
export class StripeWebhookService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,

    private readonly apiKeysService: ApiKeysService,
    private readonly brandsService: BrandsService,
    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly activitiesService: ActivitiesService,
    private readonly usersService: UsersService,
    private readonly stripeService: StripeService,
    private readonly managedStripeCheckoutService: ManagedStripeCheckoutService,
    private readonly organizationsService: OrganizationsService,
    @Inject(SUBSCRIPTION_ATTRIBUTIONS_SERVICE)
    private readonly subscriptionAttributionsService: ISubscriptionAttributionsService,
    @Inject(USER_SUBSCRIPTIONS_SERVICE)
    private readonly userSubscriptionsService: IUserSubscriptionsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly prisma: PrismaService,
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly userSetupService: UserSetupService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleWebhookEvent(event: StripeEvent, url: string) {
    switch (event.type) {
      case 'customer.subscription.created': {
        await this.handleSubscriptionCreated(
          event.data.object as StripeSubscription,
          url,
        );
        break;
      }

      case 'customer.subscription.updated': {
        await this.handleSubscriptionUpdated(
          event.data.object as StripeSubscription,
          url,
        );
        break;
      }

      case 'customer.subscription.deleted': {
        await this.handleSubscriptionDeleted(
          event.data.object as StripeSubscription,
          url,
        );
        break;
      }

      case 'checkout.session.completed': {
        await this.handleCheckoutCompleted(
          event.data.object as StripeCheckoutSession,
          url,
        );
        break;
      }

      case 'invoice.paid': {
        await this.handleInvoicePaid(event.data.object as StripeInvoice, url);
        break;
      }

      case 'invoice.payment_failed': {
        await this.handleInvoicePaymentFailed(
          event.data.object as StripeInvoice,
          url,
        );
        break;
      }

      // charge.dispute.created, charge.dispute.closed, charge.refunded
      // for marketplace purchases are now handled by the marketplace service.

      case 'customer.created': {
        this.handleCustomerCreated(event.data.object as StripeCustomer, url);
        break;
      }

      case 'customer.updated': {
        await this.handleCustomerUpdated(
          event.data.object as StripeCustomer,
          url,
        );
        break;
      }

      default:
        this.loggerService.log(
          `${this.constructorName} ${url} unhandled event type: ${event.type}`,
        );
    }
  }

  private async handleSubscriptionCreated(
    subscription: StripeSubscription,
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
      const subscriptionData = {
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: currentPeriodEnd && new Date(currentPeriodEnd * 1000),
        status: subscription.status as SubscriptionStatus,
        stripePriceId: subscription.items.data[0].price.id,
        stripeSubscriptionId: subscription.id,
        type: subscriptionType,
      };

      const updatedSubscription = await this.subscriptionsService.patch(
        String(existingSubscription._id),
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
      const tier = this.resolveTierFromPriceId(stripePriceId);
      if (tier) {
        await this.updateOrganizationTierAndModels(
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

  private async handleSubscriptionUpdated(
    subscription: StripeSubscription,
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
        String(existingSubscription._id),
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

      // Sync subscription state to DB
      await this.subscriptionsService.syncSubscriptionState(
        updatedSubscription,
        subscription.id,
        subscription.items.data[0]?.price?.id,
        subscription.status,
      );

      // Invalidate request context cache so updated subscription info is reflected immediately
      const userId = user._id?.toString();
      if (userId) {
        await Promise.all([
          this.requestContextCacheService.invalidateForUser(userId),
          this.accessBootstrapCacheService.invalidateForUser(userId),
        ]);
      }

      // Update tier if price changed
      const newPriceId = subscription.items.data[0]?.price?.id;
      if (newPriceId) {
        const tier = this.resolveTierFromPriceId(newPriceId);
        if (tier) {
          await this.updateOrganizationTierAndModels(
            String(existingSubscription.organization),
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
    subscription: StripeSubscription,
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
        String(existingSubscription._id),
        {
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          isDeleted: true,
          status: 'canceled',
        },
      );

      // If subscription was canceled immediately (not at period end), remove all credits
      if (!subscription.cancel_at_period_end) {
        await this.creditsUtilsService.removeAllOrganizationCredits(
          String(existingSubscription.organization),
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

      // Sync subscription state to DB
      await this.subscriptionsService.syncSubscriptionState(
        updatedSubscription,
        subscription.id,
        undefined,
        'canceled',
      );

      // Invalidate request context cache so canceled subscription is reflected immediately
      const userId = user._id?.toString();
      if (userId) {
        await Promise.all([
          this.requestContextCacheService.invalidateForUser(userId),
          this.accessBootstrapCacheService.invalidateForUser(userId),
        ]);
      }

      // Clear organization tier (BYOK = free tier after subscription canceled)
      await this.updateOrganizationTierAndModels(
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

  private async handleCheckoutCompleted(
    session: StripeCheckoutSession,
    url: string,
  ) {
    try {
      if (session.metadata?.type === 'managed_inference') {
        await this.handleManagedInferenceCheckoutCompleted(session, url);
        return;
      }

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

      if (session.metadata?.type) {
        this.loggerService.warn(
          `${url} ignoring unsupported checkout session type`,
          {
            sessionId: session.id,
            type: session.metadata.type,
          },
        );
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

        // Mark onboarding complete for BYOK users (tier persisted to org settings)
        await this.markOnboardingCompleteFromSession(
          session,
          url,
          SubscriptionTier.BYOK,
        );
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
          String(subscription.organization),
          creditsToAdd,
          'pay-as-you-go',
          `Credit pack purchase (${creditsToAdd} credits)`,
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year expiration
        );

        const newBalance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            String(subscription.organization),
          );

        const dbUser = await this.usersService.findOne({
          _id: subscription.user,
        });

        // Balance (credit-balance table) and isOnboardingCompleted (User row)
        // are persisted to the DB below (epic #735, Phase C — no legacy auth provider
        // publicMetadata write-back).
        if (dbUser?._id) {
          await this.accessBootstrapCacheService.invalidateForUser(
            dbUser._id.toString(),
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
          brand: String(subscription.organization),
          key: ActivityKey.CREDITS_ADD,
          organization: String(subscription.organization),
          source: ActivitySource.PAY_AS_YOU_GO,
          user: String(subscription.user),
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

  private async handleManagedInferenceCheckoutCompleted(
    session: StripeCheckoutSession,
    url: string,
  ) {
    const sessionId = session.id;
    const email =
      session.customer_details?.email || session.metadata?.email || '';

    if (!email) {
      this.loggerService.warn(
        `${url} managed checkout missing email in session`,
        {
          sessionId,
        },
      );
      return;
    }

    const provisioned =
      await this.managedStripeCheckoutService.withProvisioningLock(
        sessionId,
        async () => {
          if (
            await this.managedStripeCheckoutService.isSessionProvisioned(
              sessionId,
            )
          ) {
            return await this.managedStripeCheckoutService.getCheckoutResult(
              sessionId,
            );
          }

          const result = await this.provisionManagedCheckoutAccount(
            session,
            email,
            url,
          );

          const didCache =
            await this.managedStripeCheckoutService.cacheCheckoutResult(
              sessionId,
              result,
            );

          if (!didCache) {
            throw new Error(
              `Failed to cache managed checkout result for session ${sessionId}`,
            );
          }

          const didMarkProvisioned =
            await this.managedStripeCheckoutService.markSessionProvisioned(
              sessionId,
            );

          if (!didMarkProvisioned) {
            throw new Error(
              `Failed to mark managed checkout session ${sessionId} as provisioned`,
            );
          }

          return result;
        },
      );

    if (provisioned === null) {
      this.managedStripeCheckoutService.logProvisioningContention(sessionId);
      return;
    }

    this.loggerService.log(`${url} managed checkout provisioned`, {
      email,
      organizationId: provisioned.organizationId,
      sessionId,
      userId: provisioned.userId,
    });
  }

  private async provisionManagedCheckoutAccount(
    session: StripeCheckoutSession,
    email: string,
    url: string,
  ): Promise<ManagedCheckoutResult> {
    const firstName = session.metadata?.firstName?.trim() || undefined;
    const lastName = session.metadata?.lastName?.trim() || undefined;

    // Find or create the DB user by email. Better Auth keys identity off the
    // email, so there is no legacy auth provider round-trip and managed-checkout users carry no
    // authProviderId (epic #735, Phase 4 — D2).
    let dbUser = await this.usersService.findOne({
      email,
      isDeleted: false,
    });

    let isNewUser = false;

    if (!dbUser) {
      try {
        dbUser = await this.usersService.create(
          new UserEntity({
            email,
            firstName,
            handle: generateLabel('user'),
            lastName,
          }) as Parameters<UsersService['create']>[0],
        );
        isNewUser = true;
      } catch (error: unknown) {
        // A concurrent provisioning (a second checkout session for the same
        // email) can win the users.email unique-index race (#764). Reuse the row
        // it created instead of failing the webhook; re-throw anything that is
        // not a uniqueness conflict.
        if ((error as { code?: string })?.code !== 'P2002') {
          throw error;
        }
        dbUser = await this.usersService.findOne({ email }, []);
        if (!dbUser) {
          throw error;
        }
        if (dbUser.isDeleted === true) {
          dbUser = await this.usersService.patch(String(dbUser._id), {
            isDeleted: false,
          });
        }
      }
    }

    // Provision org / settings / brand / member / credits via the same
    // idempotent listener a Better Auth signup drives (reuses Phase B). Awaited,
    // so a brand-new user's resources exist before the credit grant below;
    // returning managed-checkout customers already have them and skip the emit.
    if (isNewUser) {
      const userCreatedEvent: IBetterAuthUserCreatedEvent = {
        email,
        userId: String(dbUser._id),
      };
      await this.eventEmitter.emitAsync(
        BETTER_AUTH_USER_CREATED_EVENT,
        userCreatedEvent,
      );
    }

    let organization = await this.organizationsService.findOne({
      isDeleted: false,
      user: String(dbUser._id),
    });

    let brand = organization
      ? await this.brandsService.findOne(
          {
            isDeleted: false,
            organizationId: String(organization._id),
          },
          [],
        )
      : null;

    if (!organization || !brand) {
      const setupResult = await this.userSetupService.initializeUserResources(
        String(dbUser._id),
        OrganizationCategory.BUSINESS,
      );

      organization = setupResult.organization;
      brand = setupResult.brand;
    }

    let orgSetting = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: String(organization._id),
    });

    if (!orgSetting) {
      await this.userSetupService.initializeUserResources(
        String(dbUser._id),
        OrganizationCategory.BUSINESS,
      );
      orgSetting = await this.organizationSettingsService.findOne({
        isDeleted: false,
        organization: String(organization._id),
      });
    }

    brand = await this.brandsService.findOne(
      {
        isDeleted: false,
        organizationId: String(organization._id),
      },
      [],
    );

    if (!brand) {
      throw new Error(
        `Brand not found for managed checkout organization ${organization._id}`,
      );
    }

    const creditsToAdd = Number(
      session.metadata?.credits ||
        this.configService.get('STRIPE_PAYG_CREDITS') ||
        0,
    );

    if (creditsToAdd <= 0) {
      throw new Error(
        `Managed checkout credits missing or invalid for session ${session.id}`,
      );
    }

    await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
      String(organization._id),
      creditsToAdd,
      'managed-inference',
      `Managed credit pack purchase (${creditsToAdd} credits)`,
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    );

    const existingApiKey = await this.apiKeysService.findOne(
      {
        category: ApiKeyCategory.GENFEEDAI,
        isRevoked: false,
        label: MANAGED_API_KEY_LABEL,
        organization: String(organization._id),
        userId: String(dbUser._id),
      },
      [],
    );

    let plainKey: string | null = null;

    if (!existingApiKey) {
      const createdApiKey = await this.apiKeysService.createWithKey({
        category: ApiKeyCategory.GENFEEDAI,
        description: 'Default Genfeed-hosted access key',
        label: MANAGED_API_KEY_LABEL,
        metadata: {
          source: 'managed_inference',
          stripeSessionId: session.id,
        },
        organizationId: String(organization._id),
        rateLimit: 100,
        scopes: MANAGED_API_KEY_SCOPES,
        userId: String(dbUser._id),
      });

      plainKey = createdApiKey.plainKey;
    } else {
      const scopes = new Set(existingApiKey.scopes);
      for (const scope of MANAGED_API_KEY_SCOPES) {
        scopes.add(scope);
      }

      if (scopes.size !== existingApiKey.scopes.length) {
        await this.apiKeysService.patch(String(existingApiKey.id), {
          scopes: Array.from(scopes),
        });
      }
    }

    const userPatch: Record<string, unknown> = {
      isOnboardingCompleted: true,
      onboardingCompletedAt: dbUser.isOnboardingCompleted
        ? dbUser.onboardingCompletedAt
        : new Date(),
      onboardingStepsCompleted:
        dbUser.onboardingStepsCompleted?.length > 0
          ? dbUser.onboardingStepsCompleted
          : ['brand', 'plan'],
    };

    if (typeof session.customer === 'string') {
      userPatch.stripeCustomerId = session.customer;
    }

    await this.usersService.patch(String(dbUser._id), userPatch);

    if (orgSetting) {
      await this.organizationSettingsService.patch(String(orgSetting._id), {
        hasEverHadCredits: true,
      });
    }

    // User row (onboarding + stripeCustomerId), org settings (hasEverHadCredits),
    // and credit balance are all persisted to the DB above; both identity
    // resolvers route from the DB (epic #735, Phase C — no legacy auth provider write-back).
    await this.accessBootstrapCacheService.invalidateForUser(
      String(dbUser._id),
    );

    await this.activitiesService.create({
      brand: String(brand._id),
      key: ActivityKey.CREDITS_ADD,
      organization: String(organization._id),
      source: ActivitySource.PAY_AS_YOU_GO,
      user: String(dbUser._id),
      value: String(creditsToAdd),
    });

    this.loggerService.log(`${url} managed checkout credits added`, {
      creditsAdded: creditsToAdd,
      email,
      organizationId: organization._id,
      sessionId: session.id,
      userId: dbUser._id,
    });

    return {
      apiKey: plainKey,
      apiKeyAlreadyExists: plainKey === null,
      brandId: String(brand._id),
      email,
      organizationId: String(organization._id),
      userId: String(dbUser._id),
    };
  }

  /**
   * Handle user-level checkout completion (getshareable.app consumer payments)
   * Looks up the user's creator org and adds credits to that org's balance
   */
  private async handleUserCheckoutCompleted(
    session: StripeCheckoutSession,
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
        _id: userId,
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
        members: userId,
      });

      if (!creatorOrg) {
        this.loggerService.warn(
          `${url} creator org not found for user, falling back to first org`,
          { userId },
        );

        // Fall back to first org the user belongs to
        const fallbackOrg = await this.organizationsService.findOne({
          isDeleted: false,
          members: userId,
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
    dbUser: { _id: string; authProviderId?: string | null },
    session: StripeCheckoutSession,
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

    // Balance is persisted to the credit-balance table above (epic #735,
    // Phase C — no legacy auth provider publicMetadata write-back).
    await this.activitiesService.create({
      brand: organizationId,
      key: ActivityKey.CREDITS_ADD,
      organization: organizationId,
      source: ActivitySource.PAY_AS_YOU_GO,
      user: userId,
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
    session: StripeCheckoutSession,
    url: string,
  ) {
    try {
      const receiptId = `sk_rcpt_${nanoid(16)}`;
      const email = session.customer_details?.email || '';

      await this.prisma.skillReceipt.create({
        data: {
          data: {
            amountPaid: session.amount_total || 0,
            currency: session.currency || 'usd',
            email,
            productType: 'bundle',
            receiptId,
            status: 'completed',
            stripePaymentIntentId: session.payment_intent
              ? String(session.payment_intent)
              : undefined,
            stripeSessionId: session.id,
          },
        },
      });

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
    session: StripeCheckoutSession,
    subscription: ISubscriptionOssReadModel,
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
          ? (stripeSubscription.customer as StripeCustomer).email || undefined
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
    metadata: StripeMetadata | null | undefined,
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
    metadata: StripeMetadata,
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
    session: StripeCheckoutSession,
    url: string,
    subscriptionTier?: SubscriptionTier,
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
                user: String(dbUser._id),
              })
            )?._id ?? '',
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
          { sessionId: session.id, subscriptionTier, userId: dbUser._id },
        );
      }
    }
    await this.accessBootstrapCacheService.invalidateForUser(
      String(dbUser._id),
    );

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

  private normalizeObjectId(value: SubscriptionRefId | undefined): string {
    if (!value) {
      return 'unknown';
    }

    if (value === '__never__') {
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
    recurringInterval?: StripeRecurringInterval | null,
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

  /**
   * Stripe SDK v22 moved the invoice→subscription link to
   * `invoice.parent.subscription_details.subscription`; the pre-v22
   * top-level `invoice.subscription` is kept as a fallback for replayed
   * historical events. The value may also arrive as an expanded object.
   */
  private extractInvoiceSubscriptionId(
    invoice: StripeInvoice,
  ): string | undefined {
    const parentPath = (
      invoice as unknown as {
        parent?: {
          subscription_details?: { subscription?: string | { id?: string } };
        };
      }
    ).parent?.subscription_details?.subscription;
    const legacyPath = (
      invoice as unknown as { subscription?: string | { id?: string } }
    ).subscription;

    const candidate = parentPath ?? legacyPath;

    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }

    if (candidate && typeof candidate === 'object' && candidate.id) {
      return candidate.id;
    }

    return undefined;
  }

  private async handleInvoicePaid(invoice: StripeInvoice, url: string) {
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
        const stripeSubscriptionId = this.extractInvoiceSubscriptionId(invoice);

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
          String(subscription._id),
          {
            status: 'active',
          },
        );

        // Sync subscription state to DB
        await this.subscriptionsService.syncSubscriptionState(
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

          await this.activitiesService.create({
            brand: String(subscription.organization),
            key: activityKey,
            organization: String(subscription.organization),
            source: ActivitySource.SUBSCRIPTION,
            user: String(subscription.user),
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

          // Mark org as having received credits (used by frontend to hide setup card)
          try {
            const orgSetting = await this.organizationSettingsService.findOne({
              isDeleted: false,
              organization: String(subscription.organization),
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

          // hasEverHadCredits is persisted to OrganizationSetting above and read
          // from the DB on bootstrap (epic #735, Phase C — no legacy auth provider write-back).
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

              // isOnboardingCompleted is persisted on the User row above (epic
              // #735, Phase C — no legacy auth provider publicMetadata write-back).
              await this.accessBootstrapCacheService.invalidateForUser(
                String(dbUser._id),
              );

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
    invoice: StripeInvoice,
    url: string,
  ) {
    try {
      // Handle BYOK platform fee payment failure
      if (invoice.metadata?.type === 'byok_platform_fee') {
        await this.handleByokInvoicePaymentFailed(invoice, url);
        return;
      }

      const stripeSubscriptionId = this.extractInvoiceSubscriptionId(invoice);

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
        await this.subscriptionsService.patch(String(subscription._id), {
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

  private async handleByokInvoicePaid(invoice: StripeInvoice, url: string) {
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
        organization: organizationId,
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
      await this.activitiesService.create({
        brand: organizationId,
        key: ActivityKey.CREDITS_ADD,
        organization: organizationId,
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
        organization: organizationId,
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

  private handleCustomerCreated(customer: StripeCustomer, url: string) {
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

  private async handleCustomerUpdated(customer: StripeCustomer, url: string) {
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
      const aggregate = {
        where: {
          isDeleted: { not: true },
          organization: organizationId,
          status: { in: ['active', 'trialing', 'past_due'] },
        },
      };

      const options = {
        customLabels,
        pagination: false,
      };

      // Find all active subscriptions for the organization
      const data = await this.subscriptionsService.findAll(
        aggregate,
        options,
        false,
      );

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
            await this.subscriptionsService.patch(String(subscription._id), {
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
