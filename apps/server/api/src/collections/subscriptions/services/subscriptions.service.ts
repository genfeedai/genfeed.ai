import { CustomersService } from '@api/collections/customers/services/customers.service';
import { type OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { CreateSubscriptionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import { UpdateSubscriptionDto } from '@api/collections/subscriptions/dto/update-subscription.dto';
import { type SubscriptionDocument } from '@api/collections/subscriptions/schemas/subscription.schema';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';
import type { ISubscriptionsService } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

type ClerkSyncSubscription = {
  _id?: string;
  user?: string;
  stripePriceId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: string | null;
};

/**
 * Enterprise subscriptions service. The OSS-callable surface (`findOne`,
 * `findByOrganizationId`, `findAll`) is locked by
 * {@link import('@genfeedai/interfaces/billing').ISubscriptionsService}.
 *
 * The other methods on this class (Stripe sync, plan changes, Clerk metadata
 * sync, preview subscription change) are enterprise-only and move to
 * `ee/packages/billing/` in Phase C Layer 2 (tracked in issue #87).
 *
 * `findOne` here is inherited from `BaseService<SubscriptionDocument>`, which
 * returns `Promise<SubscriptionDocument | null>`. The service entity type is
 * structurally assignable to `ISubscription | null` because it exposes the same
 * public fields; the compiler validates the conformance via the `implements`
 * clause below.
 */
@Injectable()
export class SubscriptionsService
  extends BaseService<
    SubscriptionDocument,
    CreateSubscriptionDto,
    UpdateSubscriptionDto
  >
  implements ISubscriptionsService
{
  public readonly constructorName: string = String(this.constructor.name);

  private optionalString(value: string | null | undefined): string | undefined {
    return value ?? undefined;
  }

  private requireString(
    value: string | null | undefined,
    label: string,
  ): string {
    if (!value) {
      throw new BadRequestException(`${label} is required`);
    }

    return value;
  }

  private async resolveStripeCustomerId(
    customerId: string | null | undefined,
  ): Promise<string | undefined> {
    if (!customerId) {
      return undefined;
    }

    const customer = await this.prisma.customer.findUnique({
      select: { stripeCustomerId: true },
      where: { id: customerId },
    });

    return customer?.stripeCustomerId ?? undefined;
  }

  private async normalizeSubscriptionDocument(
    document: unknown,
  ): Promise<SubscriptionDocument> {
    const normalized = this.normalizeDocument(
      document,
    ) as SubscriptionDocument & {
      plan?: string | null;
    };

    const stripeCustomerId =
      normalized.stripeCustomerId ??
      (await this.resolveStripeCustomerId(normalized.customerId));

    return {
      ...normalized,
      customer:
        normalized.customer ??
        (normalized.customerId ? String(normalized.customerId) : undefined),
      stripeCustomerId,
      type: normalized.type ?? normalized.plan ?? undefined,
    };
  }

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly stripeService: StripeService,
    private readonly customersService: CustomersService,
    private readonly clerkService: ClerkService,
  ) {
    super(prisma, 'subscription', logger);
  }

  /**
   * Syncs subscription data to Clerk public metadata
   */
  async syncSubscriptionToClerkMetadata(
    subscription: ClerkSyncSubscription,
    stripeSubscriptionId?: string,
    stripePriceId?: string,
    status?: string,
    subscriptionTier?: string,
  ) {
    try {
      if (!subscription.user) {
        return this.logger.warn(
          `${this.constructorName} subscription missing user reference`,
          {
            subscriptionId: subscription._id,
          },
        );
      }

      const user = await this.usersService.findOne({
        _id: subscription.user,
      });

      if (!user) {
        return this.logger.warn(
          `${this.constructorName} user not found for subscription`,
          {
            subscriptionId: subscription._id,
          },
        );
      }

      const clerkUserId = user.clerkId;
      if (!clerkUserId) {
        this.logger.warn(`${this.constructorName} user missing clerkId`, {
          userId: user._id ?? user.id,
        });
        return;
      }

      // Update Clerk public metadata
      await this.clerkService.updateUserPublicMetadata(clerkUserId, {
        stripePriceId:
          this.optionalString(stripePriceId) ??
          this.optionalString(subscription.stripePriceId),
        stripeSubscriptionId:
          this.optionalString(stripeSubscriptionId) ??
          this.optionalString(subscription.stripeSubscriptionId),
        stripeSubscriptionStatus:
          this.optionalString(status) ??
          this.optionalString(subscription.status),
        ...(subscriptionTier ? { subscriptionTier } : {}),
      });

      this.logger.log('Subscription synced to Clerk metadata', {
        clerkUserId,
        status: status || subscription.status,
        stripeSubscriptionId:
          stripeSubscriptionId || subscription.stripeSubscriptionId,
      });
    } catch (error: unknown) {
      this.logger.error('Failed to sync subscription to Clerk metadata', error);
    }
  }

  @HandleErrors('create subscription for organization', 'subscriptions')
  async createForOrganization(
    organization: OrganizationDocument,
    billingEmail: string,
    userId: string,
  ): Promise<SubscriptionDocument> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Check if customer already exists for this organization
    let customer = await this.customersService.findByOrganizationId(
      organization._id.toString(),
    );
    let stripeCustomer;

    if (customer) {
      // Customer exists, retrieve from Stripe to ensure it's valid
      this.logger.log(`${url} using existing customer`, {
        customerId: customer.id,
        organizationId: organization._id,
        stripeCustomerId: customer.stripeCustomerId,
      });

      stripeCustomer = await this.stripeService.retrieveCustomer(
        this.requireString(
          customer.stripeCustomerId,
          'Customer stripeCustomerId',
        ),
      );

      if (!stripeCustomer) {
        // Stripe customer doesn't exist, create new one and update our record
        stripeCustomer = await this.stripeService.createOrganizationCustomer(
          organization.label,
          billingEmail,
          organization._id.toString(),
          userId,
        );

        customer = await this.customersService.patch(customer.id.toString(), {
          stripeCustomerId: stripeCustomer.id,
        });
      }
    } else {
      // No customer exists, create new one
      stripeCustomer = await this.stripeService.createOrganizationCustomer(
        organization.label,
        billingEmail,
        organization._id.toString(),
        userId,
      );

      customer = await this.customersService.create({
        organization: organization._id.toString(),
        stripeCustomerId: stripeCustomer.id,
      });
    }

    const subscriptionData = {
      customerId: customer.id.toString(),
      isDeleted: false,
      organizationId: organization._id.toString(),
      plan: SubscriptionPlan.MONTHLY,
      status: SubscriptionStatus.INCOMPLETE,
      userId,
    } as unknown as Parameters<typeof this.create>[0];

    const savedSubscription = await this.create(subscriptionData);

    this.logger.log(`${url} success`, {
      customerId: customer.id,
      existingCustomer: !!customer,
      organizationId: organization._id,
      stripeCustomerId: stripeCustomer.id,
      subscriptionId: savedSubscription._id,
    });

    return savedSubscription;
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<SubscriptionDocument | null> {
    const result = await this.prisma.subscription.findFirst({
      where: { isDeleted: false, organizationId },
    });
    return result ? await this.normalizeSubscriptionDocument(result) : null;
  }

  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<SubscriptionDocument | null> {
    const customer =
      await this.customersService.findByStripeCustomerId(stripeCustomerId);
    if (!customer?.id) {
      return null;
    }

    const result = await this.prisma.subscription.findFirst({
      where: { customerId: String(customer.id), isDeleted: false },
    });
    return result ? await this.normalizeSubscriptionDocument(result) : null;
  }

  async syncWithStripe(
    subscription: SubscriptionDocument,
  ): Promise<SubscriptionDocument> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const stripeCustomer = await this.stripeService.retrieveCustomer(
        this.requireString(
          await this.resolveStripeCustomerId(subscription.customerId),
          'Subscription stripeCustomerId',
        ),
      );

      if (!stripeCustomer) {
        throw new NotFoundException('Customer not found in Stripe');
      }

      this.logger.log(`${url} success`, {
        stripeCustomerId: subscription.stripeCustomerId,
        subscriptionId: subscription._id,
      });

      return subscription;
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      throw error;
    }
  }

  async changeSubscriptionPlan(
    organizationId: string,
    newPriceId: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Find the organization's subscription
      const subscription = await this.findByOrganizationId(organizationId);
      if (!subscription) {
        throw new NotFoundException('Subscription not found');
      }

      if (!subscription.stripeSubscriptionId) {
        throw new BadRequestException('No active Stripe subscription found');
      }

      // Change the plan in Stripe with pro-rata billing
      const updatedStripeSubscription =
        await this.stripeService.changeSubscriptionPlan(
          subscription.stripeSubscriptionId,
          newPriceId,
          'create_prorations',
        );

      // Update subscription type based on new price
      let newType = SubscriptionPlan.MONTHLY;
      if (newPriceId.includes('yearly') || newPriceId.includes('year')) {
        newType = SubscriptionPlan.YEARLY;
      }

      // Update our local subscription record
      const updatedSubscription = await this.patch(
        subscription._id.toString(),
        {
          currentPeriodEnd: updatedStripeSubscription.items.data[0]
            ?.current_period_end
            ? new Date(
                updatedStripeSubscription.items.data[0].current_period_end *
                  1000,
              )
            : undefined,
          status: updatedStripeSubscription.status,
          stripePriceId: newPriceId,
          plan: newType,
        },
      );

      // Sync subscription data to Clerk metadata
      await this.syncSubscriptionToClerkMetadata(updatedSubscription);

      // Reset credits to new plan's allocation when changing subscription type
      const previousPlan = subscription.type ?? subscription.plan ?? undefined;
      if (newType !== previousPlan) {
        let creditsForNewPlan = 0;
        let source = 'subscription_change';

        if (newType === SubscriptionPlan.MONTHLY) {
          creditsForNewPlan =
            Number(this.configService.get('STRIPE_MONTHLY_CREDITS')) || 35_000;
          source = 'change_to_monthly';
        } else if (newType === SubscriptionPlan.YEARLY) {
          creditsForNewPlan =
            Number(this.configService.get('STRIPE_YEARLY_CREDITS')) || 500_000;
          source = 'change_to_yearly';
        }

        if (creditsForNewPlan > 0) {
          // await this.creditsUtilsService.resetOrganizationCredits(
          //   organizationId,
          //   creditsForNewPlan,
          //   source,
          //   `Credits reset due to subscription change from ${subscription.type} to ${newType}`,
          // );

          this.logger.log(`${url} credits reset for plan change`, {
            newCredits: creditsForNewPlan,
            newPlan: newType,
            oldPlan: previousPlan,
            organizationId,
            source,
          });
        }
      }

      this.logger.log(`${url} success`, {
        newPriceId,
        newType,
        oldPriceId: subscription.stripePriceId,
        oldType: previousPlan,
        subscriptionId: subscription._id,
      });

      return {
        stripeSubscription: updatedStripeSubscription,
        subscription: updatedSubscription,
      };
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      throw error;
    }
  }

  async previewSubscriptionChange(
    organizationId: string,
    newPriceId: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Find the organization's subscription
      const subscription = await this.findByOrganizationId(organizationId);

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (!subscription.stripeSubscriptionId) {
        throw new BadRequestException('No active Stripe subscription found');
      }

      // Get the upcoming invoice preview
      const upcomingInvoice = await this.stripeService.getUpcomingInvoice(
        this.requireString(
          await this.resolveStripeCustomerId(subscription.customerId),
          'Subscription stripeCustomerId',
        ),
        subscription.stripeSubscriptionId,
        newPriceId,
      );

      // Get current subscription details from Stripe
      const currentStripeSubscription =
        await this.stripeService.getSubscription(
          subscription.stripeSubscriptionId,
        );

      // Calculate the proration amount
      const currentPrice = currentStripeSubscription.items.data[0]?.price;

      // Calculate proration based on price difference
      const currentPriceAmount = currentPrice?.unit_amount || 0;
      const newPrice = await this.stripeService.getPrice(newPriceId);
      const newPriceAmount = newPrice.unit_amount || 0;

      // Simple proration calculation (in a real scenario, you'd want to factor in the billing cycle)
      const prorationAmount = newPriceAmount - currentPriceAmount;
      const isUpgrade = prorationAmount > 0;
      const isDowngrade = prorationAmount < 0;

      this.logger.log(`${url} success`, {
        currentPriceId: currentPrice?.id,
        isDowngrade,
        isUpgrade,
        newPriceId,
        prorationAmount,
        subscriptionId: subscription._id,
      });

      return {
        currentPrice,
        isDowngrade,
        isUpgrade,
        newPriceId,
        prorationAmount,
        upcomingInvoice: {
          amount_due: prorationAmount,
          currency: upcomingInvoice.currency,
          lines: upcomingInvoice.lines.data,
        },
      };
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      throw error;
    }
  }
}
