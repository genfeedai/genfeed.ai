import { BETTER_AUTH_USER_CREATED_EVENT } from '@api/auth/better-auth/better-auth.constants';
import type { IBetterAuthUserCreatedEvent } from '@api/auth/better-auth/better-auth.types';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserEntity } from '@api/collections/users/entities/user.entity';
import type { UserDocument } from '@api/collections/users/schemas/user.schema';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { StripeAttributionTrackerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-attribution-tracker.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import {
  type ManagedCheckoutResult,
  ManagedStripeCheckoutService,
} from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import type { StripeCheckoutSession } from '@api/services/integrations/stripe/services/stripe.service';
import {
  MANAGED_API_KEY_LABEL,
  MANAGED_API_KEY_SCOPES,
} from '@api/services/integrations/stripe/stripe.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
import {
  ActivitySource,
  ApiKeyCategory,
  OrganizationCategory,
  SubscriptionTier,
} from '@genfeedai/enums';
import {
  type ISubscriptionsService,
  type IUserSubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
  USER_SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';

type ManagedCheckoutUser = {
  dbUser: UserDocument;
  isNewUser: boolean;
};

type ManagedCheckoutResources = {
  brand: { id: string };
  organization: { id: string };
  orgSetting: { id: string } | null;
};

/** Handles checkout.session.completed Stripe webhook events (all sub-types). */
@Injectable()
export class StripeCheckoutWebhookHandler {
  constructor(
    private readonly loggerService: LoggerService,

    private readonly apiKeysService: ApiKeysService,
    private readonly brandsService: BrandsService,
    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly usersService: UsersService,
    private readonly managedStripeCheckoutService: ManagedStripeCheckoutService,
    private readonly organizationsService: OrganizationsService,
    @Inject(USER_SUBSCRIPTIONS_SERVICE)
    private readonly userSubscriptionsService: IUserSubscriptionsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly prisma: PrismaService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly userSetupService: UserSetupService,
    private readonly eventEmitter: EventEmitter2,
    private readonly supportService: StripeWebhookSupportService,
    private readonly attributionTracker: StripeAttributionTrackerService,
  ) {}

  async handleCheckoutCompleted(
    session: StripeCheckoutSession,
    url: string,
  ): Promise<void> {
    try {
      const sessionType = session.metadata?.type;

      if (sessionType === 'managed_inference') {
        await this.handleManagedInferenceCheckoutCompleted(session, url);
        return;
      }

      // User-level payment (getshareable.app consumer)
      if (sessionType === 'user') {
        await this.handleUserCheckoutCompleted(session, url);
        return;
      }

      if (sessionType === 'skills-pro') {
        await this.handleSkillsProCheckoutCompleted(session, url);
        return;
      }

      if (sessionType) {
        this.loggerService.warn(
          `${url} ignoring unsupported checkout session type`,
          {
            sessionId: session.id,
            type: sessionType,
          },
        );
        return;
      }

      // Organization-level payment handling below
      if (session.mode === 'subscription') {
        await this.handleSubscriptionModeCheckout(session, url);
      } else if (session.mode === 'setup') {
        await this.handleSetupModeCheckout(session, url);
      } else if (session.mode === 'payment') {
        await this.handlePaymentModeCheckout(session, url);
      }
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to handle checkout completed`,
        error,
      );
    }
  }

  /** Subscription checkout — the subscription.created event handles the creation. */
  private async handleSubscriptionModeCheckout(
    session: StripeCheckoutSession,
    url: string,
  ): Promise<void> {
    this.loggerService.log(`${url} subscription checkout completed`, {
      customerId: session.customer,
      sessionId: session.id,
      stripeSubscriptionId: session.subscription,
    });

    // Additional logging for subscription success
    const subscription = await this.subscriptionsService.findByStripeCustomerId(
      session.customer as string,
    );

    if (subscription) {
      await this.attributionTracker.trackSubscriptionAttributionFromSession(
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
    await this.supportService.markOnboardingCompleteFromSession(session, url);
  }

  /**
   * Setup-only checkout (BYOK) — Stripe automatically attaches the payment
   * method to the customer, so no further action is needed.
   */
  private async handleSetupModeCheckout(
    session: StripeCheckoutSession,
    url: string,
  ): Promise<void> {
    this.loggerService.log(`${url} setup checkout completed (BYOK)`, {
      customerId: session.customer,
      sessionId: session.id,
    });

    // Mark onboarding complete for BYOK users (tier persisted to org settings)
    await this.supportService.markOnboardingCompleteFromSession(
      session,
      url,
      SubscriptionTier.BYOK,
    );
  }

  /** One-time payment (pay-as-you-go credits). */
  private async handlePaymentModeCheckout(
    session: StripeCheckoutSession,
    url: string,
  ): Promise<void> {
    const subscription = await this.subscriptionsService.findByStripeCustomerId(
      session.customer as string,
    );

    if (!subscription) {
      this.loggerService.warn(`${url} subscription not found for payment`, {
        customerId: session.customer,
        sessionId: session.id,
      });
      return;
    }

    const creditsToAdd = this.supportService.resolveCheckoutCredits(
      session.metadata,
    );

    // Add credits using new credit system
    await this.supportService.addPurchasedCredits(
      String(subscription.organization),
      creditsToAdd,
      'pay-as-you-go',
      `Credit pack purchase (${creditsToAdd} credits)`,
    );

    const newBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        String(subscription.organization),
      );

    const dbUser = await this.usersService.findOne({
      id: subscription.user,
    });

    // Balance (credit-balance table) and isOnboardingCompleted (User row)
    // are persisted to the DB below (epic #735, Phase C — no legacy auth provider
    // publicMetadata write-back).
    if (dbUser?.id) {
      await this.accessBootstrapCacheService.invalidateForUser(
        dbUser.id.toString(),
      );
    }

    if (dbUser) {
      await this.supportService.markOnboardingComplete(dbUser);
    }

    // Fallback: mark onboarding complete even if subscription lookup fails
    if (!dbUser) {
      await this.supportService.markOnboardingCompleteFromSession(session, url);
    }

    await this.supportService.recordCreditsActivity({
      brandId: String(subscription.organization),
      organizationId: String(subscription.organization),
      source: ActivitySource.PAY_AS_YOU_GO,
      userId: String(subscription.user),
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

  private async handleManagedInferenceCheckoutCompleted(
    session: StripeCheckoutSession,
    url: string,
  ): Promise<void> {
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
    const { dbUser } = await this.resolveManagedCheckoutUser(session, email);
    const { brand, organization, orgSetting } =
      await this.resolveManagedCheckoutResources(dbUser);

    const creditsToAdd = this.supportService.resolveCheckoutCredits(
      session.metadata,
      0,
    );

    if (creditsToAdd <= 0) {
      throw new Error(
        `Managed checkout credits missing or invalid for session ${session.id}`,
      );
    }

    await this.supportService.addPurchasedCredits(
      String(organization.id),
      creditsToAdd,
      'managed-inference',
      `Managed credit pack purchase (${creditsToAdd} credits)`,
    );

    const plainKey = await this.ensureManagedApiKey(
      session,
      String(organization.id),
      String(dbUser.id),
    );

    await this.usersService.patch(
      String(dbUser.id),
      this.buildManagedCheckoutUserPatch(session, dbUser),
    );

    if (orgSetting) {
      await this.organizationSettingsService.patch(String(orgSetting.id), {
        hasEverHadCredits: true,
      });
    }

    // User row (onboarding + stripeCustomerId), org settings (hasEverHadCredits),
    // and credit balance are all persisted to the DB above; both identity
    // resolvers route from the DB (epic #735, Phase C — no legacy auth provider write-back).
    await this.accessBootstrapCacheService.invalidateForUser(String(dbUser.id));

    await this.supportService.recordCreditsActivity({
      brandId: String(brand.id),
      organizationId: String(organization.id),
      source: ActivitySource.PAY_AS_YOU_GO,
      userId: String(dbUser.id),
      value: String(creditsToAdd),
    });

    this.loggerService.log(`${url} managed checkout credits added`, {
      creditsAdded: creditsToAdd,
      email,
      organizationId: organization.id,
      sessionId: session.id,
      userId: dbUser.id,
    });

    return {
      apiKey: plainKey,
      apiKeyAlreadyExists: plainKey === null,
      brandId: String(brand.id),
      email,
      organizationId: String(organization.id),
      userId: String(dbUser.id),
    };
  }

  /** Mark onboarding complete and capture the Stripe customer id on the user row. */
  private buildManagedCheckoutUserPatch(
    session: StripeCheckoutSession,
    dbUser: UserDocument,
  ): Record<string, unknown> {
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

    return userPatch;
  }

  /**
   * Find or create the DB user by email. Better Auth keys identity off the
   * email, so there is no legacy auth provider round-trip and managed-checkout
   * users carry no authProviderId (epic #735, Phase 4 — D2).
   */
  private async resolveManagedCheckoutUser(
    session: StripeCheckoutSession,
    email: string,
  ): Promise<ManagedCheckoutUser> {
    const firstName = session.metadata?.firstName?.trim() || undefined;
    const lastName = session.metadata?.lastName?.trim() || undefined;

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
          dbUser = await this.usersService.patch(String(dbUser.id), {
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
        userId: String(dbUser.id),
      };
      await this.eventEmitter.emitAsync(
        BETTER_AUTH_USER_CREATED_EVENT,
        userCreatedEvent,
      );
    }

    return { dbUser, isNewUser };
  }

  /** Resolve (or defensively initialize) the user's org, brand, and settings. */
  private async resolveManagedCheckoutResources(
    dbUser: UserDocument,
  ): Promise<ManagedCheckoutResources> {
    let organization = await this.organizationsService.findOne({
      isDeleted: false,
      user: String(dbUser.id),
    });

    let brand = organization
      ? await this.brandsService.findOne(
          {
            isDeleted: false,
            organizationId: String(organization.id),
          },
          [],
        )
      : null;

    if (!organization || !brand) {
      const setupResult = await this.userSetupService.initializeUserResources(
        String(dbUser.id),
        OrganizationCategory.BUSINESS,
      );

      organization = setupResult.organization;
      brand = setupResult.brand;
    }

    let orgSetting = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: String(organization.id),
    });

    if (!orgSetting) {
      await this.userSetupService.initializeUserResources(
        String(dbUser.id),
        OrganizationCategory.BUSINESS,
      );
      orgSetting = await this.organizationSettingsService.findOne({
        isDeleted: false,
        organization: String(organization.id),
      });
    }

    brand = await this.brandsService.findOne(
      {
        isDeleted: false,
        organizationId: String(organization.id),
      },
      [],
    );

    if (!brand) {
      throw new Error(
        `Brand not found for managed checkout organization ${organization.id}`,
      );
    }

    return { brand, organization, orgSetting };
  }

  /**
   * Ensure the managed Genfeed API key exists with the required scopes.
   * Returns the plain key when a new key was minted, null when one existed.
   */
  private async ensureManagedApiKey(
    session: StripeCheckoutSession,
    organizationId: string,
    userId: string,
  ): Promise<string | null> {
    const existingApiKey = await this.apiKeysService.findOne(
      {
        category: ApiKeyCategory.GENFEEDAI,
        isRevoked: false,
        label: MANAGED_API_KEY_LABEL,
        organization: organizationId,
        userId,
      },
      [],
    );

    if (!existingApiKey) {
      const createdApiKey = await this.apiKeysService.createWithKey({
        category: ApiKeyCategory.GENFEEDAI,
        description: 'Default Genfeed-hosted access key',
        label: MANAGED_API_KEY_LABEL,
        metadata: {
          source: 'managed_inference',
          stripeSessionId: session.id,
        },
        organizationId,
        rateLimit: 100,
        scopes: MANAGED_API_KEY_SCOPES,
        userId,
      });

      return createdApiKey.plainKey;
    }

    const scopes = new Set(existingApiKey.scopes);
    for (const scope of MANAGED_API_KEY_SCOPES) {
      scopes.add(scope);
    }

    if (scopes.size !== existingApiKey.scopes.length) {
      await this.apiKeysService.patch(String(existingApiKey.id), {
        scopes: Array.from(scopes),
      });
    }

    return null;
  }

  /**
   * Handle user-level checkout completion (getshareable.app consumer payments)
   * Looks up the user's creator org and adds credits to that org's balance
   */
  private async handleUserCheckoutCompleted(
    session: StripeCheckoutSession,
    url: string,
  ): Promise<void> {
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
        id: userId,
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
          fallbackOrg.id.toString(),
          dbUser,
          session,
          url,
        );
      }

      await this.addCreditsToOrgFromUserCheckout(
        creatorOrg.id.toString(),
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
    dbUser: { id: string; authProviderId?: string | null },
    session: StripeCheckoutSession,
    url: string,
  ): Promise<void> {
    const userId = dbUser.id.toString();

    // Calculate credits from payment
    const creditsToAdd = this.supportService.resolveCheckoutCredits(
      session.metadata,
      1,
    );

    // Add credits to organization balance (1 year expiration)
    await this.supportService.addPurchasedCredits(
      organizationId,
      creditsToAdd,
      'user-purchase',
      `Credit pack purchase (${creditsToAdd} credits) via Stripe`,
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
    await this.supportService.recordCreditsActivity({
      brandId: organizationId,
      organizationId,
      source: ActivitySource.PAY_AS_YOU_GO,
      userId,
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
  ): Promise<void> {
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
}
